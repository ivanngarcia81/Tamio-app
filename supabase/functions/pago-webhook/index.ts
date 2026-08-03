// Edge Function `pago-webhook` — recibe los avisos de pago (Lemon Squeezy)
// y actualiza el plan de la iglesia en la nube.
//
// Flujo: cliente paga → Lemon Squeezy llama esta URL → aquí se verifica la
// firma, se identifica la iglesia por el CORREO del comprador (perfiles →
// church_id) y se escribe plan/sub_estado/sub_vence en `iglesias`. La app baja
// ese plan en su siguiente sincronización.
//
// (Nota histórica: esta función nació para Paddle. El 3 ago 2026 Lemon Squeezy
// aprobó la cuenta de Tamio y se adaptó a su formato: firma HMAC del cuerpo en
// el header `X-Signature`, evento en `meta.event_name` y datos en
// `data.attributes`, al estilo JSON:API.)
//
// Cómo identificamos al comprador (en este orden):
//   1) meta.custom_data.email → lo mejor: el correo de la CUENTA de Tamio,
//      pasado en el enlace del checkout:
//        https://TU-TIENDA.lemonsqueezy.com/checkout/buy/VARIANT_ID
//          ?checkout[custom][email]=correo@delcomprador.com
//   2) data.attributes.user_email → el correo que el comprador escribió al
//      pagar. Suele ser el mismo; sirve de respaldo sin llamar a ninguna API.
//
// Desplegar:
//   supabase functions deploy pago-webhook --no-verify-jwt
//   supabase secrets set LEMON_WEBHOOK_SECRET=...   (el "Signing secret" del
//                                                    webhook en Lemon Squeezy)
// En Lemon Squeezy → Settings → Webhooks: crea un webhook con la URL de esta
// función, ese signing secret, y marca los eventos subscription_created,
// subscription_updated, subscription_resumed, subscription_paused,
// subscription_unpaused, subscription_cancelled y subscription_expired.
//
// Nota de plan: Tamio se vende como UN producto, así que hoy todo pago da
// "completo". Si algún día hay planes por módulo, se mapean por producto o
// variante con los secretos LEMON_PLAN_TESORERIA / _SECRETARIA / _COMPLETO
// (ver planDe). En cuanto se configure aunque sea uno, el mapa manda: comprar
// las dos áreas por separado da "completo", y un producto que no esté en el
// mapa NO concede nada (se deja el plan como estaba y se avisa en la
// respuesta). El plan NO se toma de custom_data: eso viaja desde el navegador
// del comprador.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const enc = (s: string) => new TextEncoder().encode(s);

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Comparación en tiempo constante (evita fugas por longitud/tiempo).
function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

// Lemon Squeezy firma el CUERPO CRUDO con HMAC-SHA256 (el signing secret del
// webhook) y manda el resultado en hexadecimal en el header `X-Signature`.
// Sin el prefijo de timestamp que usaba Paddle.
async function firmaValida(cuerpo: string, header: string | null, secreto: string): Promise<boolean> {
  if (!header) return false;
  const key = await crypto.subtle.importKey(
    "raw", enc(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc(cuerpo));
  return igualSeguro(hex(mac), header.trim().toLowerCase());
}

// Plan según lo COMPRADO, no según lo que diga el navegador.
//
// El plan se deduce del producto/variante que Lemon Squeezy informa en el
// evento, que es dato de SU servidor y el comprador no puede tocar. Los IDs se
// configuran como secretos, para no tener que tocar código al crear productos:
//
//   supabase secrets set LEMON_PLAN_TESORERIA="123456"
//   supabase secrets set LEMON_PLAN_SECRETARIA="234567"
//   supabase secrets set LEMON_PLAN_COMPLETO="345678,456789"
//
// (valen tanto product_id como variant_id, separados por comas)
//
// Mientras no se configure ninguno —el caso de hoy, con un único producto—
// todo pago da "completo", que es lo correcto.
function idsDelSecreto(nombre: string): string[] {
  return (Deno.env.get(nombre) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Plan comprado, o `null` si el producto no está en el mapa.
 *
 * Dos reglas heredadas de la versión Paddle, que se conservan:
 *
 * - **Comprar las dos áreas por separado da "completo".**
 * - **Un producto desconocido no concede nada**: con un mapa configurado, un
 *   producto fuera del mapa (error de dedo en un secreto, producto de prueba,
 *   add-on) deja el plan como estaba en vez de regalar la app entera.
 */
function planDe(attrs: Record<string, any>): string | null {
  const ids = new Set<string>();
  for (const v of [attrs?.product_id, attrs?.variant_id]) {
    if (v !== null && v !== undefined && String(v)) ids.add(String(v));
  }

  const mapa = {
    tesoreria: idsDelSecreto("LEMON_PLAN_TESORERIA"),
    secretaria: idsDelSecreto("LEMON_PLAN_SECRETARIA"),
    completo: idsDelSecreto("LEMON_PLAN_COMPLETO"),
  };
  const sinMapa = !mapa.tesoreria.length && !mapa.secretaria.length && !mapa.completo.length;
  if (sinMapa) return "completo";

  const compro = (lista: string[]) => lista.some((id) => ids.has(id));
  if (compro(mapa.completo)) return "completo";
  const tesoreria = compro(mapa.tesoreria);
  const secretaria = compro(mapa.secretaria);
  if (tesoreria && secretaria) return "completo";
  if (tesoreria) return "tesoreria";
  if (secretaria) return "secretaria";
  return null;
}

// Estado de la suscripción en Lemon Squeezy → estado de Tamio.
// Estados de LS: on_trial, active, paused, past_due, unpaid, cancelled, expired.
function estadoDe(status: string): "activa" | "prueba" | "vencida" {
  if (status === "active") return "activa";
  if (status === "on_trial") return "prueba";
  return "vencida";
}

serve(async (req: Request) => {
  try {
    const secreto = Deno.env.get("LEMON_WEBHOOK_SECRET");
    if (!secreto) return new Response("LEMON_WEBHOOK_SECRET no configurado", { status: 500 });

    const cuerpo = await req.text();
    const ok = await firmaValida(cuerpo, req.headers.get("X-Signature"), secreto);
    if (!ok) return new Response("firma inválida", { status: 401 });

    const evento = JSON.parse(cuerpo);
    const tipo: string = String(evento?.meta?.event_name ?? "");
    const attrs: Record<string, any> = evento?.data?.attributes ?? {};

    // Solo eventos de suscripción; lo demás (order_created, etc.) se ignora
    // con 200 para que Lemon Squeezy no lo reintente.
    if (!tipo.startsWith("subscription_")) {
      return new Response("evento ignorado", { status: 200 });
    }

    // Correo del comprador: primero el de la cuenta de Tamio (custom_data del
    // checkout); si no vino, el que escribió al pagar.
    let email = String(evento?.meta?.custom_data?.email ?? "").trim().toLowerCase();
    if (!email) email = String(attrs?.user_email ?? "").trim().toLowerCase();
    if (!email) return new Response("sin correo", { status: 400 });

    const status: string = String(attrs?.status ?? "");
    // Fin del periodo pagado → vencimiento del plan. Si la suscripción quedó
    // cancelada pero pagada hasta una fecha, esa fecha viene en ends_at.
    const finPeriodo = attrs?.renews_at ?? attrs?.ends_at ?? null;
    const vence: string | null = finPeriodo ? String(finPeriodo).slice(0, 10) : null;

    // service_role: puede leer/escribir saltando RLS (esta función corre en el
    // servidor; el cliente jamás ve esta clave).
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Iglesia del comprador: por el correo de su cuenta en Tamio.
    const { data: usuarios } = await admin.auth.admin.listUsers();
    const usuario = usuarios?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!usuario) return new Response("usuario no encontrado", { status: 404 });

    const { data: perfil } = await admin
      .from("perfiles").select("church_id").eq("id", usuario.id).single();
    const churchId = (perfil as { church_id?: string } | null)?.church_id;
    if (!churchId) return new Response("perfil sin iglesia", { status: 404 });

    // Cortesía es intocable: un evento de pago nunca degrada una cuenta regalada.
    const { data: iglesia } = await admin
      .from("iglesias").select("sub_estado").eq("id", churchId).single();
    if ((iglesia as { sub_estado?: string } | null)?.sub_estado === "cortesia") {
      return new Response("cortesia: sin cambios", { status: 200 });
    }

    // Con Lemon Squeezy no hace falta ramificar por tipo de evento: TODOS los
    // eventos de suscripción traen el estado vigente en attributes.status, así
    // que el estado se deriva de ahí (created/updated/resumed/cancelled/...).
    const cambios: Record<string, unknown> = {
      sub_estado: estadoDe(status),
      sub_vence: vence,
    };
    // El estado y el vencimiento sí se aplican (el cobro ocurrió de verdad);
    // lo único que se deja intacto es QUÉ áreas tiene contratadas cuando el
    // producto no está en el mapa. Se avisa en la respuesta: Lemon Squeezy
    // guarda el cuerpo en su registro de entregas, así que el fallo queda a la
    // vista en vez de convertirse en un plan regalado en silencio.
    const plan = planDe(attrs);
    let productoDesconocido = false;
    if (plan) cambios.plan = plan;
    else productoDesconocido = true;

    const { error } = await admin.from("iglesias").update(cambios).eq("id", churchId);
    if (error) return new Response(`error al actualizar: ${error.message}`, { status: 500 });

    if (productoDesconocido) {
      return new Response(
        "ok, pero el producto comprado no está en LEMON_PLAN_TESORERIA/_SECRETARIA/_COMPLETO: " +
        "estado y vencimiento actualizados, plan sin cambios",
        { status: 200 },
      );
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
