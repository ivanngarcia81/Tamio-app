// Edge Function `admin-tamio` — lo que hay detrás de tamio.church/admin: ver
// las iglesias y su plan, dar o quitar cortesías y encender o apagar el banco
// sin entrar a Supabase.
//
// Desplegar:
//   supabase functions deploy admin-tamio
// (usa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, que ya existen; sin secretos.)
//
// ---------------------------------------------------------------------------
// QUIÉN PUEDE
// ---------------------------------------------------------------------------
//
// Solo los correos de `ADMINS`, comprobados contra la sesión que llega en
// `Authorization` —el usuario que Supabase dice que es—, nunca contra algo que
// diga el cuerpo. Cualquier otra cuenta de Tamio recibe 403 aunque encuentre
// la página: regalarse un plan no puede depender de que la dirección sea
// secreta. La página no lleva ninguna llave: todo lo que escribe pasa por aquí.
//
// ---------------------------------------------------------------------------
// CÓMO SE ESCRIBE UNA CORTESÍA
// ---------------------------------------------------------------------------
//
// - Para siempre: `sub_estado = 'cortesia'`, sin fecha. `pago-webhook` no la
//   toca nunca.
// - Hasta una fecha: `sub_estado = 'activa'` con esa fecha. La app y el
//   servidor ya saben vencerla (diez días de gracia y luego solo lectura); con
//   `cortesia` la fecha se ignora en los dos sitios. Si la iglesia paga antes,
//   el webhook la pasa a su suscripción.
// - En los dos casos, una fila en `cortesias` con la nota: es lo único que
//   distingue una cortesía con fecha de una suscripción pagada.
// - Terminarla: `vencida` desde hoy, que es el camino de cualquier plan que
//   acaba: diez días de gracia para pagar y luego solo lectura.
//
// Ver `supabase/migrations/20261022_cortesias_y_panel_de_administracion.sql`
// en Tamio-iOS.
//
// ---------------------------------------------------------------------------
// EL BANCO
// ---------------------------------------------------------------------------
//
// `iglesias.banco_habilitado` (`20261001_el_banco_tiene_interruptor.sql`) lo
// mueve solo el servidor: el disparador lo congela para cualquier otro rol, y
// esta función escribe con `service_role`. Desde el 25-oct nace encendido.
// Apagado, la app esconde el banco y `banco` no deja conectar otro, pero **no
// desconecta los que ya hay**: siguen trayendo movimientos y Plaid los sigue
// cobrando. Por eso `listar` cuenta las conexiones vivas, y la página lo avisa
// antes de apagar.

import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

const ADMINS = ["ig07644@gmail.com"];

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

function error(codigo: string, mensaje: string, status = 400): Response {
  return json({ codigo, mensaje }, status);
}

/** "YYYY-MM-DD" válido, o null. */
function fecha(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

/** Hoy en Eastern, como los aportes: el día de quien administra, no el de UTC. */
function hoy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

async function todosLosUsuarios(admin: SupabaseClient): Promise<User[]> {
  const todos: User[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    todos.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return todos;
}

async function listar(admin: SupabaseClient): Promise<Response> {
  const [iglesias, perfiles, cortesias, uso, conexiones, usuarios] = await Promise.all([
    admin.from("iglesias")
      .select("id, nombre, ciudad, estado, pais, plan, sub_estado, sub_vence, creado_en, moneda, banco_habilitado"),
    admin.from("perfiles").select("id, nombre, rol, church_id"),
    admin.from("cortesias").select("church_id, hasta, nota, dada_por, dada_en"),
    admin.rpc("admin_uso_por_iglesia"),
    admin.from("banco_conexiones").select("church_id").neq("estado", "desconectada"),
    todosLosUsuarios(admin),
  ]);
  for (const r of [iglesias, perfiles, cortesias, uso, conexiones]) {
    if (r.error) return error("lectura", r.error.message, 500);
  }
  const correo = new Map(usuarios.map((u) => [u.id, u]));
  const lista = (iglesias.data ?? []).map((i) => {
    const personas = (perfiles.data ?? [])
      .filter((p) => p.church_id === i.id)
      .map((p) => {
        const u = correo.get(p.id);
        return {
          nombre: p.nombre ?? "",
          rol: p.rol ?? "",
          correo: u?.email ?? "",
          ultimaEntrada: u?.last_sign_in_at ?? null,
          invitacionPendiente: !!u && !u.last_sign_in_at,
        };
      });
    const c = (cortesias.data ?? []).find((x) => x.church_id === i.id) ?? null;
    const u = (uso.data ?? []).find((x: { church_id: string }) => x.church_id === i.id);
    return {
      id: i.id,
      nombre: i.nombre ?? "",
      lugar: [i.ciudad, i.estado, i.pais].filter((x) => x).join(", "),
      plan: i.plan,
      subEstado: i.sub_estado ?? "",
      subVence: i.sub_vence,
      creada: i.creado_en,
      cortesia: c,
      personas,
      miembros: Number(u?.miembros ?? 0),
      movimientos: Number(u?.movimientos ?? 0),
      ultimoMovimiento: u?.ultimo_movimiento ?? null,
      moneda: (i.moneda ?? "").trim().toUpperCase(),
      banco: i.banco_habilitado === true,
      bancosConectados: (conexiones.data ?? []).filter((x) => x.church_id === i.id).length,
    };
  });
  lista.sort((a, b) => String(b.creada).localeCompare(String(a.creada)));
  return json({ hoy: hoy(), iglesias: lista });
}

async function darCortesia(
  admin: SupabaseClient, churchId: string, hasta: string | null, nota: string, quien: string,
): Promise<Response | null> {
  if (hasta && hasta < hoy()) return error("fecha-pasada", "La fecha de fin ya pasó.");
  const { error: e1 } = await admin.from("iglesias")
    .update(hasta ? { sub_estado: "activa", sub_vence: hasta } : { sub_estado: "cortesia", sub_vence: null })
    .eq("id", churchId);
  if (e1) return error("escritura", e1.message, 500);
  const { error: e2 } = await admin.from("cortesias").upsert({
    church_id: churchId, hasta, nota, dada_por: quien, dada_en: new Date().toISOString(),
  });
  if (e2) return error("escritura", e2.message, 500);
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return error("metodo", "Solo POST.", 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: sesion } = await admin.auth.getUser(token);
  const quien = sesion?.user?.email?.toLowerCase() ?? "";
  if (!quien || !ADMINS.includes(quien)) {
    return error("no-autorizado", "Esta cuenta no puede administrar Tamio.", 403);
  }

  let cuerpo: Record<string, unknown>;
  try { cuerpo = await req.json(); } catch { return error("cuerpo", "Cuerpo no válido."); }
  const accion = String(cuerpo.accion ?? "");
  const nota = String(cuerpo.nota ?? "").trim().slice(0, 500);
  const hasta = cuerpo.hasta == null || cuerpo.hasta === "" ? null : fecha(cuerpo.hasta);
  if (cuerpo.hasta && !hasta) return error("fecha", "La fecha no es válida.");

  try {
    switch (accion) {
      case "listar":
        return await listar(admin);

      case "cortesia": {
        const churchId = String(cuerpo.churchId ?? "");
        const { data: existe } = await admin.from("iglesias").select("id").eq("id", churchId).maybeSingle();
        if (!existe) return error("sin-iglesia", "No existe esa iglesia.", 404);
        const fallo = await darCortesia(admin, churchId, hasta, nota, quien);
        return fallo ?? json({ ok: true });
      }

      case "terminar": {
        const churchId = String(cuerpo.churchId ?? "");
        const { data: ig } = await admin.from("iglesias").select("id").eq("id", churchId).maybeSingle();
        if (!ig) return error("sin-iglesia", "No existe esa iglesia.", 404);
        const { error: e1 } = await admin.from("iglesias")
          .update({ sub_estado: "vencida", sub_vence: hoy() }).eq("id", churchId);
        if (e1) return error("escritura", e1.message, 500);
        const { error: e2 } = await admin.from("cortesias").delete().eq("church_id", churchId);
        if (e2) return error("escritura", e2.message, 500);
        return json({ ok: true });
      }

      case "banco": {
        const churchId = String(cuerpo.churchId ?? "");
        if (typeof cuerpo.encendido !== "boolean") return error("cuerpo", "Falta encendido: true o false.");
        const { data: ig } = await admin.from("iglesias").select("id").eq("id", churchId).maybeSingle();
        if (!ig) return error("sin-iglesia", "No existe esa iglesia.", 404);
        const { error: e1 } = await admin.from("iglesias")
          .update({ banco_habilitado: cuerpo.encendido }).eq("id", churchId);
        if (e1) return error("escritura", e1.message, 500);
        return json({ ok: true });
      }

      case "invitar": {
        // Alguien que todavía no tiene cuenta: la invitación le crea la cuenta,
        // y el disparador `al_crear_usuario`, su iglesia con él de
        // administrador. Es lo que hace `pago-webhook` con quien paga.
        const email = String(cuerpo.email ?? "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error("correo", "El correo no es válido.");
        const nombre = String(cuerpo.nombre ?? "").trim().slice(0, 120);
        const iglesia = String(cuerpo.iglesia ?? "").trim().slice(0, 160);
        if (hasta && hasta < hoy()) return error("fecha-pasada", "La fecha de fin ya pasó.");

        const ya = (await todosLosUsuarios(admin)).find((u) => u.email?.toLowerCase() === email);
        if (ya) {
          const { data: p } = await admin.from("perfiles").select("church_id").eq("id", ya.id).maybeSingle();
          return json({ codigo: "ya-tiene-cuenta",
            mensaje: "Ese correo ya tiene cuenta: dale la cortesía a su iglesia en la lista.",
            churchId: p?.church_id ?? null }, 409);
        }
        const { data: inv, error: e1 } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { nombre, iglesia },
        });
        if (e1 || !inv?.user) return error("invitacion", e1?.message ?? "No se pudo invitar.", 500);
        const { data: p } = await admin.from("perfiles").select("church_id").eq("id", inv.user.id).maybeSingle();
        if (!p?.church_id) return error("sin-iglesia", "La cuenta se creó pero no su iglesia.", 500);
        const fallo = await darCortesia(admin, p.church_id, hasta, nota, quien);
        return fallo ?? json({ ok: true, churchId: p.church_id });
      }

      default:
        return error("accion", "Acción desconocida.");
    }
  } catch (e) {
    return error("servidor", e instanceof Error ? e.message : String(e), 500);
  }
});
