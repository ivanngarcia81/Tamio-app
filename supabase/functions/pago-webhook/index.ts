// Edge Function `pago-webhook` — recibe los avisos de pago (Lemon Squeezy)
// y actualiza el plan de la iglesia en la nube.
//
// Flujo: cliente paga → Lemon Squeezy llama esta URL → aquí se verifica la
// firma, se busca la iglesia por el CORREO del comprador (perfiles → church_id)
// y se escribe plan/sub_estado/sub_vence en `iglesias`. La app baja ese plan
// en su siguiente sincronización.
//
// Desplegar (cuando exista la cuenta de Lemon Squeezy):
//   supabase functions deploy pago-webhook --no-verify-jwt
//   supabase secrets set LEMON_WEBHOOK_SECRET=...   (el "signing secret" del webhook)
// En Lemon Squeezy → Settings → Webhooks: URL de esta función; eventos
// subscription_created / subscription_updated / subscription_expired.
//
// Mapeo de producto → plan: el nombre del "variant" debe contener la palabra
// "tesoreria" o "secretaria" (sin acentos) para los planes por módulo;
// cualquier otro nombre = plan completo.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function firmaValida(cuerpo: string, firma: string | null, secreto: string): Promise<boolean> {
  if (!firma) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(cuerpo));
  return hex(mac) === firma.toLowerCase();
}

function planDeVariant(nombre: string): string {
  const n = nombre.toLowerCase();
  if (n.includes("tesoreria") || n.includes("tesorería")) return "tesoreria";
  if (n.includes("secretaria") || n.includes("secretaría")) return "secretaria";
  return "completo";
}

serve(async (req: Request) => {
  try {
    const secreto = Deno.env.get("LEMON_WEBHOOK_SECRET");
    if (!secreto) return new Response("LEMON_WEBHOOK_SECRET no configurado", { status: 500 });

    const cuerpo = await req.text();
    const ok = await firmaValida(cuerpo, req.headers.get("X-Signature"), secreto);
    if (!ok) return new Response("firma inválida", { status: 401 });

    const evento = JSON.parse(cuerpo);
    const nombreEvento: string = evento?.meta?.event_name ?? "";
    const attrs = evento?.data?.attributes ?? {};
    const email: string = String(attrs.user_email ?? "").trim().toLowerCase();
    // El plan se detecta en el nombre del PRODUCTO o de la VARIANTE (así las
    // variantes pueden llamarse solo "Mensual"/"Anual" bajo cada producto).
    const variant: string = `${attrs.product_name ?? ""} ${attrs.variant_name ?? ""}`;
    const renuevaEl: string | null = attrs.renews_at ? String(attrs.renews_at).slice(0, 10) : null;
    const status: string = String(attrs.status ?? "");

    if (!email) return new Response("sin correo", { status: 400 });

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
    if (nombreEvento === "subscription_created" || nombreEvento === "subscription_updated") {
      const activa = status === "active" || status === "on_trial";
      cambios = {
        plan: planDeVariant(variant),
        sub_estado: activa ? (status === "on_trial" ? "prueba" : "activa") : "vencida",
        sub_vence: renuevaEl,
      };
    } else if (nombreEvento === "subscription_expired" || nombreEvento === "subscription_cancelled") {
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
