// Edge Function `banco` — conecta el banco de la iglesia por Plaid y trae lo
// que dice el banco a las tablas `banco_*`.
//
// Es la fase 2 de `docs/PLAID.md` (repo Tamio-iOS, rama `plaid`). Las tablas
// son de la migración `20260928b_el_banco_de_la_iglesia.sql` del mismo repo:
// **tiene que estar aplicada antes de desplegar esto.**
//
// ---------------------------------------------------------------------------
// UNA FUNCIÓN, VARIAS ACCIONES
// ---------------------------------------------------------------------------
//
// Se despliega pegándola en el panel, y ahí cada función es un archivo solo:
// no pueden compartir código. Hablar con Plaid, guardar cuentas y sincronizar
// es lo mismo para conectar, para el botón «Actualizar» y para el webhook, así
// que va todo aquí y se elige con `accion`:
//
//   | accion           | quién                     | qué hace                                   |
//   |------------------|---------------------------|--------------------------------------------|
//   | `enlace`         | ROLES_CONECTAN            | pide a Plaid el `link_token` para la ventana|
//   | `conectar`       | ROLES_CONECTAN            | cambia el `public_token` por la llave,      |
//   |                  |                           | guarda banco y cuentas, y sincroniza        |
//   | `conectar-prueba`| ROLES_CONECTAN, SANDBOX   | lo mismo sin la ventana: un banco falso     |
//   | `sincronizar`    | ROLES_SINCRONIZAN         | trae lo nuevo de una conexión o de todas    |
//   | `desconectar`    | ROLES_CONECTAN            | la quita en Plaid; lo ya traído se queda    |
//
// Y si el cuerpo trae `webhook_type`, es Plaid avisando (fase 3). Hasta que
// esté la verificación de la firma, se contesta 200 y no se hace nada.
//
// **`verify_jwt` va APAGADO** (como `pago-webhook`): Plaid llama sin sesión.
// Las acciones de la app NO quedan abiertas por eso: cada una valida la
// sesión con `auth.getUser()`, que pregunta al servidor de Auth, y después el
// rol y la iglesia en `perfiles`.
//
// ---------------------------------------------------------------------------
// LAS REGLAS, Y POR QUÉ
// ---------------------------------------------------------------------------
//
// 1. **La llave del banco no sale de aquí.** El `access_token` se guarda en
//    `banco_llaves`, que la API no deja leer a nadie, y ninguna respuesta de
//    esta función lo incluye.
// 2. **La iglesia no viaja en la petición.** Sale del perfil de quien llama,
//    como en `invitar-usuario`. Una `conexion_uid` que venga en el cuerpo se
//    busca SIEMPRE junto con esa iglesia.
// 3. **El dinero, en céntimos y con el signo de Tamio.** Plaid manda dólares
//    en decimal y positivo = SALE. Se convierte en `centavos()` y en ningún
//    otro sitio.
// 4. **El cursor avanza solo si todo se guardó.** Si algo falla a mitad, la
//    próxima vez se repite desde el cursor viejo; los `upsert` por el id de
//    Plaid hacen que repetir no duplique nada.
// 5. **Un banco que no se pudo guardar se quita en Plaid.** Si no, queda una
//    conexión huérfana por la que Plaid cobra cada mes.
// 6. **Solo lectura y cobertura.** Con el plan vencido no se conecta (sí se
//    sincroniza: es leer). Y solo iglesias en dólares, porque Plaid solo
//    cubre Estados Unidos aquí (`iglesias.pais` suele estar vacío; la moneda
//    no).
//
// ---------------------------------------------------------------------------
// SECRETOS
// ---------------------------------------------------------------------------
//
//   PLAID_CLIENT_ID   el client_id del panel de Plaid
//   PLAID_SECRET      el secret del ambiente de PLAID_ENV
//   PLAID_ENV         `sandbox` o `production`. Sin él, la función contesta
//                     `banco-apagado`: es el interruptor.
//   PLAID_REDIRECT_URI  (opcional) para bancos con OAuth en producción. Tiene
//                     que estar dado de alta en el panel de Plaid.
//
// Más SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY, que ya
// existen en el proyecto.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Quién conecta, reconecta y desconecta el banco. Propuesta de PLAID.md,
 *  pendiente de que Iván la confirme: solo el administrador. */
const ROLES_CONECTAN = ["administrador"];
/** Quién pulsa «Actualizar». Leer el banco no cambia los libros. */
const ROLES_SINCRONIZAN = ["administrador", "tesorero"];

/** Cuánto se trae hacia atrás al conectar. Plaid da hasta 730 días; más
 *  historia que la que tiene Tamio solo llena la bandeja de «sin apuntar».
 *  Está por decidir (PLAID.md, «Lo que queda por decidir»). */
const DIAS_DE_HISTORIA = 365;

/** El banco falso de sandbox que usa `conectar-prueba` (First Platypus Bank). */
const BANCO_DE_PRUEBA = "ins_109508";

// Cada error lleva un `codigo` estable además del texto: la app es bilingüe y
// traduce por el código (igual que `invitar-usuario`).
class Fallo extends Error {
  constructor(public codigo: string, mensaje: string, public estado = 400) {
    super(mensaje);
  }
}

/** Un error que contestó Plaid. `codigo` es el suyo (ITEM_LOGIN_REQUIRED…). */
class FalloPlaid extends Fallo {
  constructor(public codigoPlaid: string, mensaje: string, public solicitud: string) {
    super(`plaid:${codigoPlaid}`, mensaje, 502);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ===========================================================================
// Plaid
// ===========================================================================

function ambiente(): "sandbox" | "production" {
  const env = (Deno.env.get("PLAID_ENV") ?? "").trim().toLowerCase();
  if (env === "sandbox" || env === "production") return env;
  throw new Fallo("banco-apagado", "PLAID_ENV no está puesto: el banco está apagado", 503);
}

// deno-lint-ignore no-explicit-any
async function plaid(ruta: string, cuerpo: Record<string, unknown>): Promise<any> {
  const base = ambiente() === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";
  const id = (Deno.env.get("PLAID_CLIENT_ID") ?? "").trim();
  const secreto = (Deno.env.get("PLAID_SECRET") ?? "").trim();
  if (!id || !secreto) {
    throw new Fallo("banco-apagado", "faltan PLAID_CLIENT_ID o PLAID_SECRET", 503);
  }

  const r = await fetch(base + ruta, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PLAID-CLIENT-ID": id,
      "PLAID-SECRET": secreto,
      "Plaid-Version": "2020-09-14",
    },
    body: JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new FalloPlaid(
      datos.error_code ?? `HTTP_${r.status}`,
      datos.error_message ?? `Plaid contestó ${r.status}`,
      datos.request_id ?? "",
    );
  }
  return datos;
}

/** Dólares de Plaid (positivo = sale) → céntimos de Tamio (positivo = entra). */
function centavos(montoPlaid: number): number {
  return -Math.round(montoPlaid * 100) || 0; // `|| 0` quita el -0
}

/** Céntimos de un saldo, que en Plaid va con su signo natural (o null). */
function centavosSaldo(saldo: number | null | undefined): number | null {
  return typeof saldo === "number" ? Math.round(saldo * 100) : null;
}

// ===========================================================================
// Quién llama
// ===========================================================================

interface Quien {
  id: string;
  nombre: string;
  rol: string;
  iglesia: string;
}

async function quienLlama(req: Request, admin: SupabaseClient, roles: string[]): Promise<Quien> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Fallo("sin-sesion", "sin sesión", 401);
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await comoUsuario.auth.getUser();
  const usuario = data?.user;
  if (error || !usuario) throw new Fallo("sin-sesion", "sesión inválida", 401);

  const { data: perfil } = await admin
    .from("perfiles").select("id, nombre, rol, church_id").eq("id", usuario.id).single();
  if (!perfil?.church_id) throw new Fallo("sin-iglesia", "tu cuenta no tiene iglesia asignada", 409);
  if (!roles.includes(perfil.rol ?? "")) {
    throw new Fallo("sin-permiso", "tu rol no puede hacer esto con el banco", 403);
  }

  return {
    id: usuario.id,
    nombre: (perfil.nombre ?? "").trim() || (usuario.email ?? ""),
    rol: perfil.rol,
    iglesia: perfil.church_id,
  };
}

/** Lo que hace falta para CONECTAR: plan vigente y una iglesia en dólares. */
async function puedeConectar(admin: SupabaseClient, iglesia: string): Promise<void> {
  const { data: soloLectura, error } = await admin.rpc("iglesia_en_solo_lectura", { p_church: iglesia });
  if (error) throw new Fallo("interno", error.message, 500);
  if (soloLectura === true) throw new Fallo("solo-lectura", "la iglesia está en solo lectura", 403);

  const { data: igl } = await admin.from("iglesias").select("moneda").eq("id", iglesia).single();
  if ((igl?.moneda ?? "").trim().toUpperCase() !== "USD") {
    throw new Fallo("fuera-de-cobertura", "el banco solo se conecta en iglesias de Estados Unidos (USD)", 403);
  }
}

interface Conexion {
  uid: string;
  church_id: string;
  estado: string;
}

/** Una conexión de ESTA iglesia. La `uid` viene del cliente; la iglesia no. */
async function conexionDe(admin: SupabaseClient, iglesia: string, uid: unknown): Promise<Conexion> {
  const { data } = await admin
    .from("banco_conexiones").select("uid, church_id, estado")
    .eq("uid", String(uid ?? "")).eq("church_id", iglesia).maybeSingle();
  if (!data) throw new Fallo("conexion", "esa conexión no existe en tu iglesia", 404);
  return data as Conexion;
}

async function llaveDe(admin: SupabaseClient, conexion: string): Promise<{ access_token: string; cursor: string | null }> {
  const { data } = await admin
    .from("banco_llaves").select("access_token, cursor").eq("conexion_uid", conexion).maybeSingle();
  if (!data) throw new Fallo("sin-llave", "esta conexión ya no tiene llave: hay que volver a conectar", 409);
  return data;
}

// ===========================================================================
// Guardar lo que dice el banco
// ===========================================================================

// deno-lint-ignore no-explicit-any
type Cuenta = any;
// deno-lint-ignore no-explicit-any
type Transaccion = any;

/** Guarda las cuentas y devuelve `plaid_account_id → uid` de TODAS las de la
 *  conexión. El `upsert` no manda `cuenta_banco_tamio`: la asignación que hizo
 *  el tesorero no se pisa al actualizar saldos. */
async function guardarCuentas(
  admin: SupabaseClient, c: Conexion, cuentas: Cuenta[],
): Promise<Map<string, string>> {
  if (cuentas.length) {
    const ahora = new Date().toISOString();
    const filas = cuentas.map((a) => ({
      church_id: c.church_id,
      conexion_uid: c.uid,
      plaid_account_id: a.account_id,
      nombre: a.name ?? a.official_name ?? "",
      mascara: a.mask ?? "",
      tipo: a.type ?? "",
      subtipo: a.subtype ?? "",
      moneda: a.balances?.iso_currency_code ?? a.balances?.unofficial_currency_code ?? "USD",
      saldo_actual: centavosSaldo(a.balances?.current),
      saldo_disponible: centavosSaldo(a.balances?.available),
      saldo_en: ahora,
      deleted: false,
    }));
    const { error } = await admin.from("banco_cuentas").upsert(filas, { onConflict: "plaid_account_id" });
    if (error) throw new Fallo("interno", `cuentas: ${error.message}`, 500);
  }

  const { data, error } = await admin
    .from("banco_cuentas").select("uid, plaid_account_id").eq("conexion_uid", c.uid);
  if (error) throw new Fallo("interno", `cuentas: ${error.message}`, 500);
  return new Map((data ?? []).map((f) => [f.plaid_account_id as string, f.uid as string]));
}

function trozos<T>(lista: T[], n = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

interface Resumen {
  nuevas: number;
  cambiadas: number;
  quitadas: number;
}

/** Trae de Plaid todo lo que cambió desde el cursor y lo guarda. */
async function sincronizar(admin: SupabaseClient, c: Conexion): Promise<Resumen> {
  const llave = await llaveDe(admin, c.uid);

  try {
    // Plaid pagina de 500 en 500. Si el banco cambia algo MIENTRAS se pagina,
    // contesta TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION y hay que volver a
    // empezar desde el cursor del principio, no desde el de la página.
    for (let intento = 1; ; intento++) {
      const nuevas: Transaccion[] = [];
      const cambiadas: Transaccion[] = [];
      const quitadas: string[] = [];
      let cuentas: Cuenta[] = [];
      let cursor = llave.cursor ?? "";

      try {
        for (let hayMas = true; hayMas;) {
          const r = await plaid("/transactions/sync", {
            access_token: llave.access_token,
            ...(cursor ? { cursor } : {}),
            count: 500,
          });
          nuevas.push(...(r.added ?? []));
          cambiadas.push(...(r.modified ?? []));
          quitadas.push(...(r.removed ?? []).map((x: { transaction_id: string }) => x.transaction_id));
          if (r.accounts?.length) cuentas = r.accounts;
          cursor = r.next_cursor ?? cursor;
          hayMas = !!r.has_more;
        }
      } catch (e) {
        if (e instanceof FalloPlaid && e.codigoPlaid === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && intento < 3) {
          continue;
        }
        throw e;
      }

      const mapa = await guardarCuentas(admin, c, cuentas);

      // Solo columnas que son de Plaid: el `upsert` NO manda la pareja
      // (`emparejado_*`, `ignorado`), así que lo que decidió el tesorero se
      // queda aunque el banco cambie la línea.
      const filas = [...nuevas, ...cambiadas].map((t) => {
        const cuenta = mapa.get(t.account_id);
        if (!cuenta) throw new Fallo("interno", `línea de una cuenta desconocida (${t.account_id})`, 500);
        return {
          church_id: c.church_id,
          cuenta_uid: cuenta,
          plaid_transaction_id: t.transaction_id,
          fecha: t.date,
          monto: centavos(t.amount),
          moneda: t.iso_currency_code ?? t.unofficial_currency_code ?? "USD",
          nombre: t.name ?? "",
          comercio: t.merchant_name ?? "",
          pendiente: !!t.pending,
          deleted: false,
        };
      });
      for (const lote of trozos(filas)) {
        const { error } = await admin.from("banco_movimientos").upsert(lote, { onConflict: "plaid_transaction_id" });
        if (error) throw new Fallo("interno", `movimientos: ${error.message}`, 500);
      }

      // Lo que Plaid quita (casi siempre un pendiente que se asentó con otro
      // id) queda con lápida, no se borra: la sincronización de los aparatos
      // necesita ver la baja.
      for (const lote of trozos(quitadas)) {
        const { error } = await admin.from("banco_movimientos")
          .update({ deleted: true }).eq("church_id", c.church_id).in("plaid_transaction_id", lote);
        if (error) throw new Fallo("interno", `quitadas: ${error.message}`, 500);
      }

      // Regla 4: el cursor, lo último.
      const { error: e1 } = await admin.from("banco_llaves").update({ cursor }).eq("conexion_uid", c.uid);
      if (e1) throw new Fallo("interno", `cursor: ${e1.message}`, 500);
      await admin.from("banco_conexiones")
        .update({ estado: "activa", error: null, sincronizada_en: new Date().toISOString() })
        .eq("uid", c.uid);

      return { nuevas: nuevas.length, cambiadas: cambiadas.length, quitadas: quitadas.length };
    }
  } catch (e) {
    // Que el problema se vea en Ajustes → Banco, no solo en el registro.
    if (e instanceof FalloPlaid) {
      const pideLogin = ["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "PENDING_DISCONNECT"].includes(e.codigoPlaid);
      await admin.from("banco_conexiones")
        .update({ error: e.message, ...(pideLogin ? { estado: "pide_login" } : {}) })
        .eq("uid", c.uid);
    }
    throw e;
  }
}

// ===========================================================================
// Las acciones
// ===========================================================================

async function enlace(req: Request, admin: SupabaseClient, cuerpo: Record<string, unknown>) {
  const yo = await quienLlama(req, admin, ROLES_CONECTAN);
  await puedeConectar(admin, yo.iglesia);

  const url = Deno.env.get("SUPABASE_URL")!;
  const peticion: Record<string, unknown> = {
    client_name: "Tamio Church",
    language: cuerpo.idioma === "en" ? "en" : "es",
    country_codes: ["US"],
    user: { client_user_id: yo.id },
    webhook: `${url}/functions/v1/banco`,
  };

  // Con `conexion_uid` es el «modo actualizar» de Plaid: volver a entrar a un
  // banco que pidió login. No se piden productos: ya los tiene.
  if (cuerpo.conexion_uid) {
    const c = await conexionDe(admin, yo.iglesia, cuerpo.conexion_uid);
    peticion.access_token = (await llaveDe(admin, c.uid)).access_token;
  } else {
    peticion.products = ["transactions"];
    peticion.transactions = { days_requested: DIAS_DE_HISTORIA };
  }

  const redirect = (Deno.env.get("PLAID_REDIRECT_URI") ?? "").trim();
  if (redirect) peticion.redirect_uri = redirect;

  const r = await plaid("/link/token/create", peticion);
  return json({ ok: true, link_token: r.link_token, expira: r.expiration });
}

/** Lo común a `conectar` y `conectar-prueba`, desde el `public_token`. */
async function conectarCon(admin: SupabaseClient, yo: Quien, publicToken: string) {
  const { access_token, item_id } = await plaid("/item/public_token/exchange", { public_token: publicToken });

  let uid: string | null = null;
  try {
    const { item } = await plaid("/item/get", { access_token });
    let institucion = "";
    if (item?.institution_id) {
      const r = await plaid("/institutions/get_by_id", {
        institution_id: item.institution_id,
        country_codes: ["US"],
      });
      institucion = r.institution?.name ?? "";
    }

    const { data: nueva, error: e1 } = await admin.from("banco_conexiones").insert({
      church_id: yo.iglesia,
      plaid_item_id: item_id,
      institucion,
      conectada_por: yo.nombre,
    }).select("uid, church_id, estado").single();
    if (e1 || !nueva) throw new Fallo("interno", `conexión: ${e1?.message}`, 500);
    uid = nueva.uid;

    const { error: e2 } = await admin.from("banco_llaves").insert({
      conexion_uid: nueva.uid,
      church_id: yo.iglesia,
      access_token,
    });
    if (e2) throw new Fallo("interno", `llave: ${e2.message}`, 500);

    const { accounts } = await plaid("/accounts/get", { access_token });
    const mapa = await guardarCuentas(admin, nueva as Conexion, accounts ?? []);

    // La primera sincronización. Si falla, el banco YA está conectado: se
    // avisa y se reintenta con «Actualizar» o con el webhook. Justo al
    // conectar es normal que venga vacía: Plaid tarda en tener el historial.
    let resumen: Resumen | null = null;
    let aviso: string | null = null;
    try {
      resumen = await sincronizar(admin, nueva as Conexion);
    } catch (e) {
      aviso = e instanceof Error ? e.message : String(e);
    }

    return json({ ok: true, conexion_uid: nueva.uid, institucion, cuentas: mapa.size, resumen, aviso });
  } catch (e) {
    // Regla 5: no dejar en Plaid un banco que Tamio no tiene.
    await plaid("/item/remove", { access_token }).catch(() => {});
    if (uid) {
      await admin.from("banco_cuentas").delete().eq("conexion_uid", uid);
      await admin.from("banco_conexiones").delete().eq("uid", uid); // la llave cae en cascada
    }
    throw e;
  }
}

async function conectar(req: Request, admin: SupabaseClient, cuerpo: Record<string, unknown>) {
  const yo = await quienLlama(req, admin, ROLES_CONECTAN);
  await puedeConectar(admin, yo.iglesia);
  const publicToken = String(cuerpo.public_token ?? "").trim();
  if (!publicToken) throw new Fallo("cuerpo", "falta public_token");
  return await conectarCon(admin, yo, publicToken);
}

/** Solo en sandbox: conecta un banco falso sin la ventana de Plaid, para
 *  probar todo el camino del servidor. `usuario_prueba` elige los datos
 *  (`user_good`, `user_transactions_dynamic`, o uno a medida del panel). */
async function conectarPrueba(req: Request, admin: SupabaseClient, cuerpo: Record<string, unknown>) {
  if (ambiente() !== "sandbox") throw new Fallo("solo-sandbox", "conectar-prueba solo existe en sandbox", 403);
  const yo = await quienLlama(req, admin, ROLES_CONECTAN);
  await puedeConectar(admin, yo.iglesia);

  const usuario = String(cuerpo.usuario_prueba ?? "").trim();
  const { public_token } = await plaid("/sandbox/public_token/create", {
    institution_id: BANCO_DE_PRUEBA,
    initial_products: ["transactions"],
    options: {
      ...(usuario ? { override_username: usuario, override_password: "pass_good" } : {}),
      transactions: { days_requested: DIAS_DE_HISTORIA },
    },
  });
  return await conectarCon(admin, yo, public_token);
}

async function actualizar(req: Request, admin: SupabaseClient, cuerpo: Record<string, unknown>) {
  const yo = await quienLlama(req, admin, ROLES_SINCRONIZAN);

  let conexiones: Conexion[];
  if (cuerpo.conexion_uid) {
    conexiones = [await conexionDe(admin, yo.iglesia, cuerpo.conexion_uid)];
  } else {
    const { data } = await admin.from("banco_conexiones")
      .select("uid, church_id, estado").eq("church_id", yo.iglesia).neq("estado", "desconectada");
    conexiones = (data ?? []) as Conexion[];
  }

  // Una que falla no frena a las demás; cada una dice lo suyo.
  const resultados = [];
  for (const c of conexiones) {
    try {
      resultados.push({ conexion_uid: c.uid, ok: true, ...(await sincronizar(admin, c)) });
    } catch (e) {
      resultados.push({
        conexion_uid: c.uid,
        ok: false,
        codigo: e instanceof Fallo ? e.codigo : "interno",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return json({ ok: resultados.every((r) => r.ok), conexiones: resultados });
}

async function desconectar(req: Request, admin: SupabaseClient, cuerpo: Record<string, unknown>) {
  const yo = await quienLlama(req, admin, ROLES_CONECTAN);
  const c = await conexionDe(admin, yo.iglesia, cuerpo.conexion_uid);

  const { data: llave } = await admin
    .from("banco_llaves").select("access_token").eq("conexion_uid", c.uid).maybeSingle();
  if (llave) {
    try {
      await plaid("/item/remove", { access_token: llave.access_token });
    } catch (e) {
      // Si Plaid ya no la conoce, ya está quitada. Cualquier otro error se
      // devuelve: una conexión que se cree quitada y sigue cobrando es peor.
      const yaNoEsta = e instanceof FalloPlaid &&
        ["ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"].includes(e.codigoPlaid);
      if (!yaNoEsta) throw e;
    }
    await admin.from("banco_llaves").delete().eq("conexion_uid", c.uid);
  }

  // La conexión, sus cuentas y sus líneas se QUEDAN: son historia de los
  // libros, y las parejas que hizo el tesorero siguen valiendo.
  await admin.from("banco_conexiones").update({ estado: "desconectada", error: null }).eq("uid", c.uid);
  return json({ ok: true });
}

// ===========================================================================

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "solo POST", codigo: "metodo" }, 405);

  try {
    let cuerpo: Record<string, unknown>;
    try {
      cuerpo = await req.json();
    } catch {
      return json({ error: "cuerpo inválido", codigo: "cuerpo" }, 400);
    }

    // Plaid avisando. Fase 3: verificar la firma (`Plaid-Verification`) y
    // sincronizar esa conexión. Hasta entonces, se acusa recibo y nada más:
    // sin firma verificada no se toca la base.
    if (typeof cuerpo.webhook_type === "string") {
      return json({ ok: true, recibido: false });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    switch (cuerpo.accion) {
      case "enlace": return await enlace(req, admin, cuerpo);
      case "conectar": return await conectar(req, admin, cuerpo);
      case "conectar-prueba": return await conectarPrueba(req, admin, cuerpo);
      case "sincronizar": return await actualizar(req, admin, cuerpo);
      case "desconectar": return await desconectar(req, admin, cuerpo);
      default: return json({ error: "acción desconocida", codigo: "accion" }, 400);
    }
  } catch (e) {
    if (e instanceof Fallo) {
      return json({
        error: e.message,
        codigo: e.codigo,
        ...(e instanceof FalloPlaid ? { solicitud: e.solicitud } : {}),
      }, e.estado);
    }
    return json({ error: String(e instanceof Error ? e.message : e), codigo: "interno" }, 500);
  }
});
