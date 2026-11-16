// Edge Function `apple-suscripcion` — la suscripción comprada DENTRO de la app
// (App Store, StoreKit 2) escribe el plan de la iglesia, como `pago-webhook`
// lo hace con lo pagado en tamio.church. Plan: `docs/COMPRA-EN-LA-APP.md` de
// Tamio-iOS (12-nov-2026).
//
// Dos entradas, la misma URL:
//
//   1) **La app**, al terminar una compra (y con cada `Transaction.updates`):
//      POST { "transactionId": "…" } con la sesión de Supabase en
//      `Authorization`. Solo un ADMINISTRADOR conecta la compra, y solo a SU
//      iglesia: la app compra con `appAccountToken` = id de la iglesia, y ese
//      token viaja dentro de la transacción que firma Apple; aquí se compara
//      con el perfil de quien llama.
//   2) **Apple** (App Store Server Notifications V2): POST { "signedPayload" }.
//      Renovaciones, cobro fallido, gracia, cancelación, reembolso, vencimiento.
//
// **No se confía en lo que llega.** Ni la app ni el aviso dicen el estado: de
// los dos solo se saca el número de transacción, y el estado se le pregunta a
// Apple por la App Store Server API (HTTPS, con nuestra clave). Un aviso
// inventado solo provoca una consulta más. Así no hace falta verificar aquí la
// cadena de certificados de los JWS.
//
// Qué se escribe en `iglesias` (lo de siempre: plan, sub_estado, sub_vence, y
// ahora sub_origen):
//
//   status 1 activa       → «activa» (o «prueba» en los 14 días gratis), vence = fin del periodo
//   status 4 en gracia    → «activa», vence = fin de la gracia de Apple
//   status 3 reintentando → «vencida», vence = fin del periodo (la app da 10 días y luego solo lectura)
//   status 2 vencida      → «vencida», vence = fin del periodo
//   status 5 revocada     → «vencida», vence = el día del reembolso
//
// **Los dos cobradores no se pisan** (`sub_origen`):
//   - Cortesía para siempre (`sub_estado = cortesia`): no se toca nunca.
//   - Pagada en el web y vigente: Apple no la toca (la app no ofrece comprar
//     a quien ya paga en el web; si aun así pasa, manda el web).
//   - Apple vencida solo baja a «vencida» una iglesia cuyo plan es de Apple.
//
// Secretos (App Store Connect › Users and Access › Integrations › In-App Purchase):
//   supabase secrets set APPLE_IAP_KEY_ID=XXXXXXXXXX
//   supabase secrets set APPLE_IAP_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
//   supabase secrets set APPLE_IAP_PRIVATE_KEY="$(cat SubscriptionKey_XXXXXXXXXX.p8)"
//   (opcional) APPLE_BUNDLE_ID, por omisión church.tamio.native
//
// Desplegar (Apple no manda JWT de Supabase):
//   supabase functions deploy apple-suscripcion --no-verify-jwt
// Y en App Store Connect › la app › App Information › App Store Server
// Notifications: esta URL en Production y en Sandbox, Version 2.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------- JWS y JWT

function b64urlADatos(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function datosAB64url(d: Uint8Array): string {
  let s = "";
  for (const b of d) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** La carga de un JWS de Apple, SIN verificar: solo para sacar números que
 *  luego se le preguntan a Apple, o de respuestas que vienen de Apple por HTTPS. */
export function cargaDe(jws: string): Record<string, any> {
  const partes = String(jws).split(".");
  if (partes.length !== 3) throw new Error("JWS mal formado");
  return JSON.parse(new TextDecoder().decode(b64urlADatos(partes[1])));
}

/** El JWT (ES256) con que se habla con la App Store Server API. Dura 20 min. */
export async function jwtDeApple(keyId: string, issuerId: string, pem: string, bundleId: string): Promise<string> {
  // Solo lo de entre BEGIN y END, y solo caracteres de base64: el secreto pegado
  // en el panel de Supabase puede traer `\n` escritos como texto o algo de más
  // alrededor, y con eso `atob` fallaba («Failed to decode base64», 15-nov).
  const cuerpo = (pem.match(/-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/)?.[1] ?? pem)
    .replace(/\\n/g, "").replace(/[^A-Za-z0-9+/]/g, "");
  const der = b64urlADatos(cuerpo.replace(/\+/g, "-").replace(/\//g, "_"));
  const llave = await crypto.subtle.importKey(
    "pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const ahora = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => datosAB64url(new TextEncoder().encode(JSON.stringify(o)));
  const cabecera = enc({ alg: "ES256", kid: keyId, typ: "JWT" });
  const carga = enc({ iss: issuerId, iat: ahora, exp: ahora + 20 * 60, aud: "appstoreconnect-v1", bid: bundleId });
  // Web Crypto firma ECDSA ya en r‖s (64 bytes), que es lo que pide JWS.
  const firma = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, llave, new TextEncoder().encode(`${cabecera}.${carga}`),
  ));
  return `${cabecera}.${carga}.${datosAB64url(firma)}`;
}

// ------------------------------------------------------ App Store Server API

const SERVIDORES = {
  Production: "https://api.storekit.itunes.apple.com",
  Sandbox: "https://api.storekit-sandbox.itunes.apple.com",
} as const;
type Entorno = keyof typeof SERVIDORES;

type EstadoApple = {
  entorno: Entorno;
  status: number;                       // 1..5
  tx: Record<string, any>;              // JWSTransactionDecodedPayload
  renovacion: Record<string, any>;      // JWSRenewalInfoDecodedPayload
};

/** `Get All Subscription Statuses` de la transacción. Primero producción; si
 *  Apple no la conoce allí (4040010), sandbox: así lo recomienda Apple, y es lo
 *  que deja comprar al revisor (que compra en sandbox contra la app de la tienda). */
async function estadoEnApple(transactionId: string, jwt: string, preferido?: Entorno): Promise<EstadoApple | null> {
  const orden: Entorno[] = preferido === "Sandbox" ? ["Sandbox", "Production"] : ["Production", "Sandbox"];
  for (const entorno of orden) {
    const r = await fetch(`${SERVIDORES[entorno]}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (r.status === 404) continue;
    if (!r.ok) throw new Error(`App Store Server API ${entorno} ${r.status}: ${await r.text()}`);
    const cuerpo = await r.json();
    const ultimas: any[] = (cuerpo?.data ?? []).flatMap((g: any) => g?.lastTransactions ?? []);
    if (!ultimas.length) return null;
    // La de esta compra; si no está (otra del mismo grupo), la primera.
    const tx0 = cargaDe(ultimas[0].signedTransactionInfo);
    const propia = ultimas.find((u) => {
      const t = cargaDe(u.signedTransactionInfo);
      return t.originalTransactionId === tx0.originalTransactionId;
    }) ?? ultimas[0];
    return {
      entorno,
      status: Number(propia.status),
      tx: cargaDe(propia.signedTransactionInfo),
      renovacion: propia.signedRenewalInfo ? cargaDe(propia.signedRenewalInfo) : {},
    };
  }
  return null;
}

// ------------------------------------------------------- Apple → la iglesia

const dia = (ms: number | string | undefined | null) =>
  ms === undefined || ms === null ? null : new Date(Number(ms)).toISOString().slice(0, 10);

/** Lo que dice Apple, en las palabras de Tamio. */
export function traducir(e: Pick<EstadoApple, "status" | "tx" | "renovacion">): {
  vigente: boolean; sub_estado: "activa" | "prueba" | "vencida"; sub_vence: string | null;
} {
  const { status, tx, renovacion } = e;
  const prueba = tx.offerDiscountType === "FREE_TRIAL" || (tx.offerType === 1 && Number(tx.price ?? 1) === 0);
  switch (status) {
    case 1: return { vigente: true, sub_estado: prueba ? "prueba" : "activa", sub_vence: dia(tx.expiresDate) };
    case 4: return { vigente: true, sub_estado: "activa", sub_vence: dia(renovacion.gracePeriodExpiresDate ?? tx.expiresDate) };
    case 5: return { vigente: false, sub_estado: "vencida", sub_vence: dia(tx.revocationDate ?? Date.now()) };
    default: return { vigente: false, sub_estado: "vencida", sub_vence: dia(tx.expiresDate) };
  }
}

/** Qué cambiar en `iglesias`, o `null` si no se toca (y por qué). */
export function decidir(
  iglesia: { sub_estado: string | null; sub_vence: string | null; sub_origen: string | null },
  apple: ReturnType<typeof traducir>,
  hoy = new Date().toISOString().slice(0, 10),
): { cambios: Record<string, unknown> | null; motivo: string } {
  if (iglesia.sub_estado === "cortesia") return { cambios: null, motivo: "cortesía para siempre: no se toca" };
  const webVigente = iglesia.sub_origen === "web"
    && ["activa", "prueba"].includes(iglesia.sub_estado ?? "")
    && (!iglesia.sub_vence || iglesia.sub_vence >= hoy);
  if (apple.vigente) {
    if (webVigente) return { cambios: null, motivo: "ya paga en el web: manda el web" };
    return {
      cambios: { plan: "completo", sub_estado: apple.sub_estado, sub_vence: apple.sub_vence, sub_origen: "apple" },
      motivo: "apple vigente",
    };
  }
  if (iglesia.sub_origen !== "apple") return { cambios: null, motivo: "apple no vigente y el plan no es de apple" };
  return { cambios: { sub_estado: "vencida", sub_vence: apple.sub_vence }, motivo: "apple venció" };
}

async function aplicar(
  admin: SupabaseClient, churchId: string, e: EstadoApple, conectadaPor: string | null,
): Promise<{ motivo: string; iglesia: Record<string, unknown> | null }> {
  const t = traducir(e);
  const fila: Record<string, unknown> = {
    original_transaction_id: String(e.tx.originalTransactionId),
    church_id: churchId,
    producto: String(e.tx.productId ?? ""),
    estado: e.status,
    expira: e.tx.expiresDate ? new Date(Number(e.tx.expiresDate)).toISOString() : null,
    renovacion_automatica: e.renovacion.autoRenewStatus === undefined ? null : e.renovacion.autoRenewStatus === 1,
    entorno: String(e.tx.environment ?? e.entorno),
    updated_at: new Date().toISOString(),
  };
  if (conectadaPor) fila.conectada_por = conectadaPor;
  const { error: errFila } = await admin.from("suscripciones_apple").upsert(fila);
  if (errFila) throw new Error(`suscripciones_apple: ${errFila.message}`);

  const { data: iglesia, error } = await admin
    .from("iglesias").select("sub_estado, sub_vence, sub_origen").eq("id", churchId).single();
  if (error || !iglesia) throw new Error(`iglesia ${churchId}: ${error?.message ?? "no existe"}`);

  const { cambios, motivo } = decidir(iglesia as any, t);
  if (cambios) {
    const { error: errUp } = await admin.from("iglesias").update(cambios).eq("id", churchId);
    if (errUp) throw new Error(`iglesias: ${errUp.message}`);
  }
  const { data: despues } = await admin
    .from("iglesias").select("plan, sub_estado, sub_vence, sub_origen").eq("id", churchId).single();
  return { motivo, iglesia: despues as Record<string, unknown> | null };
}

// ------------------------------------------------------------------ entrada

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);

  try {
    const keyId = Deno.env.get("APPLE_IAP_KEY_ID");
    const issuerId = Deno.env.get("APPLE_IAP_ISSUER_ID");
    const pem = Deno.env.get("APPLE_IAP_PRIVATE_KEY");
    const bundleId = Deno.env.get("APPLE_BUNDLE_ID") ?? "church.tamio.native";
    if (!keyId || !issuerId || !pem) return json({ error: "faltan los secretos APPLE_IAP_*" }, 500);

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cuerpo = await req.json().catch(() => ({}));
    const jwt = await jwtDeApple(keyId, issuerId, pem, bundleId);

    // ---- 2) El aviso de Apple.
    if (typeof cuerpo?.signedPayload === "string") {
      const aviso = cargaDe(cuerpo.signedPayload);
      const datos = aviso?.data ?? {};
      if (aviso?.notificationType === "TEST" || !datos.signedTransactionInfo) {
        return json({ ok: true, ignorado: aviso?.notificationType ?? "sin transacción" });
      }
      if (datos.bundleId && datos.bundleId !== bundleId) return json({ ok: true, ignorado: "otra app" });
      const txAviso = cargaDe(datos.signedTransactionInfo);
      const e = await estadoEnApple(String(txAviso.originalTransactionId ?? txAviso.transactionId), jwt, datos.environment);
      if (!e) return json({ ok: true, ignorado: "Apple no conoce la transacción" });
      if (e.tx.bundleId !== bundleId) return json({ ok: true, ignorado: "otra app" });

      // La iglesia: la de la compra ya conectada; si no, la del token.
      const { data: previa } = await admin.from("suscripciones_apple")
        .select("church_id").eq("original_transaction_id", String(e.tx.originalTransactionId)).maybeSingle();
      const churchId = (previa as { church_id?: string } | null)?.church_id
        ?? (e.tx.appAccountToken ? String(e.tx.appAccountToken).toLowerCase() : null);
      if (!churchId) return json({ ok: true, ignorado: "sin iglesia (sin appAccountToken)" });
      const { data: existe } = await admin.from("iglesias").select("id").eq("id", churchId).maybeSingle();
      if (!existe) return json({ ok: true, ignorado: "el token no es una iglesia" });

      const r = await aplicar(admin, churchId, e, null);
      return json({ ok: true, aviso: aviso.notificationType, subtipo: aviso.subtype ?? null, ...r });
    }

    // ---- 1) La app.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "sin sesión", codigo: "sesion" }, 401);
    const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await comoUsuario.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "sesión inválida", codigo: "sesion" }, 401);
    const yo = userData.user;

    const transactionId = String(cuerpo?.transactionId ?? "").trim();
    if (!/^\d{1,40}$/.test(transactionId)) return json({ error: "transactionId inválido", codigo: "transaccion" }, 400);

    const { data: perfil } = await admin
      .from("perfiles").select("rol, church_id").eq("id", yo.id).single();
    const p = perfil as { rol?: string; church_id?: string } | null;
    if (!p?.church_id) return json({ error: "perfil sin iglesia", codigo: "perfil" }, 404);
    if (p.rol !== "administrador") return json({ error: "solo el administrador", codigo: "rol" }, 403);

    const e = await estadoEnApple(transactionId, jwt);
    if (!e) return json({ error: "Apple no conoce esa compra", codigo: "desconocida" }, 404);
    if (e.tx.bundleId !== bundleId) return json({ error: "compra de otra app", codigo: "app" }, 400);
    const token = String(e.tx.appAccountToken ?? "").toLowerCase();
    if (token !== p.church_id.toLowerCase()) {
      return json({ error: "esa compra es de otra iglesia", codigo: "otra-iglesia" }, 409);
    }

    const r = await aplicar(admin, p.church_id, e, yo.id);
    return json({ ok: true, ...r });
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
