// Edge Function `pago-webhook` — recibe los avisos de pago (Paddle Billing)
// y actualiza el plan de la iglesia en la nube.
//
// Flujo: cliente paga → Paddle llama esta URL → aquí se verifica la firma,
// se identifica la iglesia por el CORREO del comprador (perfiles → church_id)
// y se escribe plan/sub_estado/sub_vence en `iglesias`. La app baja ese plan
// en su siguiente sincronización.
//
// Cómo identificamos al comprador (en este orden):
//   1) data.custom_data.email  → lo mejor. Pásalo en el checkout, p. ej.:
//        Paddle.Checkout.open({ items: [...], customData: { email: correo } })
//   2) si no viene, se consulta el cliente en la API de Paddle por customer_id
//      (requiere PADDLE_API_KEY).
//
// Desplegar:
//   supabase functions deploy pago-webhook --no-verify-jwt
//   supabase secrets set PADDLE_WEBHOOK_SECRET=...   (el "secret key" del destino
//                                                     de notificaciones en Paddle)
//   supabase secrets set PADDLE_API_KEY=...          (opcional: resolver el correo
//                                                     por customer_id)
//   supabase secrets set PADDLE_API_URL=https://api.paddle.com
//                                       (sandbox: https://sandbox-api.paddle.com)
// En Paddle → Developer Tools → Notifications: crea un destino con la URL de esta
// función y suscribe los eventos subscription.created / subscription.updated /
// subscription.activated / subscription.canceled / subscription.past_due /
// subscription.paused.
//
// Nota de plan: Tamio se vende como UN producto ("completo"). El plan por
// módulo (tesoreria/secretaria) solo se aplica si lo pasas en custom_data.plan.

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

// Paddle envía el header `Paddle-Signature` con el formato: "ts=...;h1=...".
// Se firma la cadena `${ts}:${cuerpo}` con HMAC-SHA256 y el secreto del destino.
async function firmaValida(cuerpo: string, header: string | null, secreto: string): Promise<boolean> {
  if (!header) return false;
  const partes: Record<string, string> = {};
  for (const kv of header.split(";")) {
    const i = kv.indexOf("=");
    if (i > 0) partes[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const ts = partes["ts"];
  const h1 = partes["h1"];
  if (!ts || !h1) return false;
  const key = await crypto.subtle.importKey(
    "raw", enc(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc(`${ts}:${cuerpo}`));
  return igualSeguro(hex(mac), h1.toLowerCase());
}

// Plan según los datos del evento. Por defecto "completo" (producto único);
// solo cambia si mandas custom_data.plan en el checkout.
function planDe(data: Record<string, any>): string {
  const p = String(data?.custom_data?.plan ?? "").toLowerCase();
  if (p === "tesoreria" || p === "secretaria" || p === "completo") return p;
  return "completo";
}

// Resuelve el correo del comprador consultando la API de Paddle por customer_id.
async function correoDeCliente(customerId: string): Promise<string> {
  const apiKey = Deno.env.get("PADDLE_API_KEY");
  if (!apiKey || !customerId) return "";
  const base = Deno.env.get("PADDLE_API_URL") ?? "https://api.paddle.com";
  try {
    const r = await fetch(`${base}/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!r.ok) return "";
    const j = await r.json();
    return String(j?.data?.email ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

serve(async (req: Request) => {
  try {
    const secreto = Deno.env.get("PADDLE_WEBHOOK_SECRET");
    if (!secreto) return new Response("PADDLE_WEBHOOK_SECRET no configurado", { status: 500 });

    const cuerpo = await req.text();
    const ok = await firmaValida(cuerpo, req.headers.get("Paddle-Signature"), secreto);
    if (!ok) return new Response("firma inválida", { status: 401 });

    const evento = JSON.parse(cuerpo);
    const tipo: string = String(evento?.event_type ?? "");
    const data: Record<string, any> = evento?.data ?? {};

    // Correo del comprador: primero de custom_data; si no, por la API de Paddle.
    let email = String(data?.custom_data?.email ?? "").trim().toLowerCase();
    if (!email && data?.customer_id) email = await correoDeCliente(String(data.customer_id));
    if (!email) return new Response("sin correo", { status: 400 });

    const status: string = String(data?.status ?? "");
    // Fin del periodo pagado → vencimiento del plan.
    const finPeriodo = data?.next_billed_at ?? data?.current_billing_period?.ends_at ?? null;
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

    let cambios: Record<string, unknown> | null = null;
    if (tipo === "subscription.created" || tipo === "subscription.updated" || tipo === "subscription.activated") {
      const activa = status === "active" || status === "trialing";
      cambios = {
        plan: planDe(data),
        sub_estado: activa ? (status === "trialing" ? "prueba" : "activa") : "vencida",
        sub_vence: vence,
      };
    } else if (tipo === "subscription.canceled" || tipo === "subscription.past_due" || tipo === "subscription.paused") {
      cambios = { sub_estado: "vencida" };
    }

    if (cambios) {
      const { error } = await admin.from("iglesias").update(cambios).eq("id", churchId);
      if (error) return new Response(`error al actualizar: ${error.message}`, { status: 500 });
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
