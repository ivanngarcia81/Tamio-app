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
// Desplegar:
//   supabase functions deploy borrar-cuenta
// (usa SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY, que ya
//  existen por defecto en el proyecto; no hace falta configurar secretos.)

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // 3) Borrar el perfil del usuario.
    await admin.from("perfiles").delete().eq("id", user.id);

    // 4) Si ya no queda ningún perfil ligado a esa iglesia, borrar la iglesia
    //    completa. Sus tablas espejo referencian iglesias(id) ON DELETE
    //    CASCADE, así que se borran solas (miembros, transacciones, cartas…).
    if (churchId) {
      const { count } = await admin
        .from("perfiles").select("id", { count: "exact", head: true })
        .eq("church_id", churchId);
      if (!count) await admin.from("iglesias").delete().eq("id", churchId);
    }

    // 5) Eliminar la cuenta de autenticación.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
