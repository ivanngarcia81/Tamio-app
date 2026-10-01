// Edge Function `borrar-cuenta` — elimina la cuenta del usuario que la invoca.
//
// Requisito de Apple (App Store Review 5.1.1(v)): toda app con inicio de
// sesión debe permitir eliminar la cuenta DESDE DENTRO de la app. Esta función
// hace la parte de servidor: identifica al usuario por su sesión (JWT),
// borra su perfil y —si era el último perfil de su iglesia— borra la iglesia
// entera de la nube (el ON DELETE CASCADE de `iglesias` arrastra todos los
// datos: miembros, transacciones, etc.). Por último elimina la cuenta de
// autenticación. La app, al recibir "ok", cierra la sesión y borra los datos
// locales.
//
// **El banco (Plaid) se suelta antes de borrar la iglesia.** El CASCADE
// borraría `banco_llaves`, y con ellas la única forma de decirle a Plaid que
// quite la conexión: Plaid seguiría cobrando cada mes por un banco que ya no
// es de nadie. Si Plaid no contesta, no se borra NADA y se pide intentarlo de
// nuevo; un error a medias dejaría la cuenta borrada y el banco cobrando.
//
// Desplegar:
//   supabase functions deploy borrar-cuenta
// (usa SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY, que ya
//  existen por defecto en el proyecto, y PLAID_CLIENT_ID, PLAID_SECRET y
//  PLAID_ENV, los mismos secretos de la función `banco`.)

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Quita una conexión en Plaid. `true` si quedó quitada (o ya no existía). */
async function quitarEnPlaid(accessToken: string): Promise<boolean> {
  const env = (Deno.env.get("PLAID_ENV") ?? "").trim().toLowerCase();
  const id = (Deno.env.get("PLAID_CLIENT_ID") ?? "").trim();
  const secreto = (Deno.env.get("PLAID_SECRET") ?? "").trim();
  if (!id || !secreto || (env !== "sandbox" && env !== "production")) return false;
  const base = env === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";
  try {
    const r = await fetch(base + "/item/remove", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PLAID-CLIENT-ID": id,
        "PLAID-SECRET": secreto,
        "Plaid-Version": "2020-09-14",
      },
      body: JSON.stringify({ access_token: accessToken }),
    });
    if (r.ok) return true;
    const datos = await r.json().catch(() => ({}));
    // Si Plaid ya no la conoce, ya está quitada (igual que `banco`).
    return ["ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"].includes(datos.error_code);
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Identificar al usuario por su sesión (el token viaja en Authorization
    //    porque la app invoca con supabase.functions.invoke, que lo adjunta).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "sin sesión" }, 401);
    const comoUsuario = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await comoUsuario.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) return json({ error: "sesión inválida" }, 401);

    // 2) Cliente admin (service_role): borra saltando RLS. Nunca llega al cliente.
    const admin = createClient(url, service);

    // Iglesia del usuario (para limpiar sus datos si es el único miembro).
    const { data: perfil } = await admin
      .from("perfiles").select("church_id").eq("id", user.id).single();
    const churchId = (perfil as { church_id?: string } | null)?.church_id ?? null;

    // 3) ¿Es la última persona de su iglesia? Se mira ANTES de borrar nada,
    //    para poder soltar el banco primero.
    let ultima = false;
    if (churchId) {
      const { count } = await admin
        .from("perfiles").select("id", { count: "exact", head: true })
        .eq("church_id", churchId).neq("id", user.id);
      ultima = !count;
    }

    // 4) Si se va a borrar la iglesia, soltar cada banco en Plaid. Si alguno
    //    no se puede, no se borra nada.
    if (churchId && ultima) {
      const { data: llaves, error: llavesErr } = await admin
        .from("banco_llaves").select("conexion_uid, access_token").eq("church_id", churchId);
      if (llavesErr) return json({ error: llavesErr.message }, 500);
      for (const llave of (llaves ?? []) as { conexion_uid: string; access_token: string }[]) {
        if (!(await quitarEnPlaid(llave.access_token))) {
          return json({
            error: "No se pudo desconectar el banco de la iglesia. No se borró nada: inténtalo de nuevo en unos minutos.",
          }, 502);
        }
        await admin.from("banco_llaves").delete().eq("conexion_uid", llave.conexion_uid);
      }
    }

    // 5) Borrar el perfil del usuario.
    await admin.from("perfiles").delete().eq("id", user.id);

    // 6) Si era la última, borrar la iglesia completa. Sus tablas espejo
    //    referencian iglesias(id) ON DELETE CASCADE, así que se borran solas
    //    (miembros, transacciones, cartas, el banco…).
    if (churchId && ultima) await admin.from("iglesias").delete().eq("id", churchId);

    // 7) Eliminar la cuenta de autenticación.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
