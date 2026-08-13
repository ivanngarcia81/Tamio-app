// Edge Function `invitar-usuario` — suma una persona a la MISMA iglesia de
// quien la invita, con el rol que se le asigne.
//
// Es la puerta de entrada que le falta a Tamio (punto 2 de docs/plan-1-1.md).
// Hoy cada quien que se registra queda como administrador de su propia
// iglesia, y no hay forma de que una segunda persona entre a la iglesia de
// otro sin tocar Supabase a mano.
//
// Desplegar:
//   supabase functions deploy invitar-usuario
// (usa SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY, que ya
//  existen por defecto en el proyecto; no hace falta configurar secretos.)
//
// ---------------------------------------------------------------------------
// LAS TRES REGLAS DE SEGURIDAD, Y POR QUÉ
// ---------------------------------------------------------------------------
//
// 1. **La iglesia NO viaja en la petición.** El `church_id` se lee del perfil
//    de quien invita, nunca del cuerpo del mensaje. Si el cliente pudiera
//    mandarlo, cualquiera con una cuenta podría meterse en la iglesia de otro
//    escribiendo su identificador: sería la puerta trasera más grande de toda
//    la aplicación, y en el código se vería como un parámetro inofensivo.
//
// 2. **Solo un administrador invita.** Se comprueba contra el perfil del que
//    llama, no contra lo que el cliente diga que es.
//
// 3. **A nadie se le roba de su iglesia.** Si el correo ya tiene cuenta y
//    pertenece a OTRA iglesia, se rechaza. Cambiarle el `church_id` en
//    silencio dejaría a esa otra congregación sin su tesorero de un día para
//    otro, sin que nadie hiciera nada visiblemente malo.
//
// ---------------------------------------------------------------------------
// LA TRAMPA DEL DISPARADOR
// ---------------------------------------------------------------------------
//
// `supabase/sync-e1.sql:63` tiene un disparador `al_crear_usuario` que corre
// al insertar en `auth.users` y **le crea una iglesia nueva a cada cuenta**,
// con rol `administrador`. Sirve para el que se registra solo; para una
// invitación es exactamente lo contrario de lo que se quiere.
//
// No se puede evitar —el disparador es de la base—, así que se corrige
// después: se sobrescribe el perfil con la iglesia y el rol de verdad, y se
// borra la iglesia huérfana que acaba de nacer. Sin ese borrado, cada
// invitación dejaría una iglesia vacía de basura en la tabla, para siempre.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Los roles que gobiernan qué ve cada quien (`src/role.ts`). NO son los del
 *  directorio local de personas (`ROLES_USUARIO` en db.ts: pastor, auditor,
 *  consejo…), que son un dato descriptivo y no dan acceso a nada. Confundirlos
 *  daría permisos de tesorero a quien solo figura en una lista. */
const ROLES = ["tesorero", "secretaria", "administrador"] as const;
type Rol = (typeof ROLES)[number];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface Perfil {
  id: string;
  rol: string | null;
  church_id: string | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ---- 1) Quién invita -------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "sin sesión" }, 401);
    const comoUsuario = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await comoUsuario.auth.getUser();
    const invitador = userData?.user;
    if (userErr || !invitador) return json({ error: "sesión inválida" }, 401);

    // ---- 2) Qué se pide --------------------------------------------------
    let cuerpo: { email?: unknown; rol?: unknown; nombre?: unknown };
    try {
      cuerpo = await req.json();
    } catch {
      return json({ error: "cuerpo inválido" }, 400);
    }

    const email = String(cuerpo.email ?? "").trim().toLowerCase();
    const rol = String(cuerpo.rol ?? "") as Rol;
    const nombre = String(cuerpo.nombre ?? "").trim();

    // Validación deliberadamente floja para el correo: comprobar que tiene
    // arroba y un punto después. Las expresiones "completas" para RFC 5322
    // rechazan direcciones válidas y raras, y quien se equivoque de correo lo
    // va a notar enseguida porque la invitación no llega.
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "correo inválido" }, 400);
    }
    if (!ROLES.includes(rol)) return json({ error: "rol inválido" }, 400);

    // ---- 3) El que invita tiene que ser administrador CON iglesia ---------
    const admin = createClient(url, service);

    const { data: miPerfil } = await admin
      .from("perfiles").select("id, rol, church_id").eq("id", invitador.id).single();
    const yo = miPerfil as Perfil | null;

    if (!yo || yo.rol !== "administrador") {
      return json({ error: "solo un administrador puede invitar" }, 403);
    }
    if (!yo.church_id) {
      return json({ error: "tu cuenta no tiene iglesia asignada" }, 409);
    }
    // A partir de aquí, LA iglesia es esta y ninguna otra.
    const iglesia = yo.church_id;

    // Invitarse a uno mismo no hace nada y confunde el resultado.
    if (email === (invitador.email ?? "").toLowerCase()) {
      return json({ error: "esa es tu propia cuenta" }, 409);
    }

    // ---- 4) ¿Ya existe esa cuenta? ---------------------------------------
    // `listUsers` no filtra por correo, así que se pagina. Con una iglesia
    // pequeña sobra una página; el bucle está por si el proyecto crece.
    let existente: { id: string; email?: string } | null = null;
    for (let pagina = 1; pagina <= 20 && !existente; pagina++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
      if (error) return json({ error: error.message }, 500);
      const lista = data?.users ?? [];
      existente = lista.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
      if (lista.length < 200) break;
    }

    if (existente) {
      const { data: suyo } = await admin
        .from("perfiles").select("id, rol, church_id").eq("id", existente.id).single();
      const perfil = suyo as Perfil | null;

      // Regla 3: no se le roba a nadie de su congregación.
      if (perfil?.church_id && perfil.church_id !== iglesia) {
        return json({ error: "ese correo ya pertenece a otra iglesia" }, 409);
      }

      // Ya es de esta iglesia: la "invitación" es un cambio de rol.
      await admin.from("perfiles").upsert({
        id: existente.id,
        church_id: iglesia,
        rol,
        ...(nombre ? { nombre } : {}),
      });
      return json({ ok: true, resultado: perfil?.church_id ? "rol-actualizado" : "unido" });
    }

    // ---- 5) Cuenta nueva: invitación por correo --------------------------
    const { data: invitado, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nombre, invitado_a: iglesia, rol },
    });
    if (invErr || !invitado?.user) {
      return json({ error: invErr?.message ?? "no se pudo invitar" }, 500);
    }
    const nuevoId = invitado.user.id;

    // El disparador `al_crear_usuario` acaba de crearle SU PROPIA iglesia y de
    // ponerlo de administrador. Se corrige aquí (ver la nota de arriba).
    const { data: reciente } = await admin
      .from("perfiles").select("id, rol, church_id").eq("id", nuevoId).single();
    const iglesiaHuerfana = (reciente as Perfil | null)?.church_id ?? null;

    const { error: upErr } = await admin.from("perfiles").upsert({
      id: nuevoId,
      church_id: iglesia,
      rol,
      ...(nombre ? { nombre } : {}),
    });
    if (upErr) return json({ error: upErr.message }, 500);

    // Y se recoge la iglesia vacía que dejó el disparador. Se comprueba que no
    // le quede ningún perfil antes de borrarla: si por lo que sea otro perfil
    // apuntara ahí, borrarla se llevaría sus datos por el ON DELETE CASCADE.
    if (iglesiaHuerfana && iglesiaHuerfana !== iglesia) {
      const { count } = await admin
        .from("perfiles").select("id", { count: "exact", head: true })
        .eq("church_id", iglesiaHuerfana);
      if (!count) await admin.from("iglesias").delete().eq("id", iglesiaHuerfana);
    }

    return json({ ok: true, resultado: "invitado" });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
