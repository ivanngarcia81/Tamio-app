// Edge Function `banco` — conecta el banco de la iglesia por Plaid y trae lo
// que dice el banco a las tablas `banco_*`.
//
// Es la fase 2 de `docs/PLAID.md` (repo Tamio-iOS, rama `plaid`). Las tablas
// son de las migraciones `20260928b`, `20260929`, `20260930`, `20260930b` y
// `20260930c` del mismo repo: **tienen que estar aplicadas antes de desplegar
// esto** (lee `historia_desde` y escribe `categoria` y `logo_url`). Después de
// cada sincronización llama a `banco_emparejar` (fase 4).
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
//   | `probar-aviso`   | ROLES_CONECTAN, SANDBOX   | pide a Plaid que mande un aviso de prueba   |
//
// Y si el cuerpo trae `webhook_type`, es **Plaid avisando** (fase 3): se
// verifica la firma y, según el aviso, se sincroniza esa conexión o se marca
// que pide volver a entrar. Ver «LOS AVISOS DE PLAID» más abajo.
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

/** Quién conecta, reconecta y desconecta el banco. Lo decidió Iván el 28-sep:
 *  solo el administrador. */
const ROLES_CONECTAN = ["administrador"];
/** Quién pulsa «Actualizar». Leer el banco no cambia los libros. */
const ROLES_SINCRONIZAN = ["administrador", "tesorero"];

/** **Desde cuándo se trae**, decidido por Iván el 29-sep: desde el día 1 del
 *  mes en que se conecta, como dibuja M9 del handoff de la Mac («Desde 1
 *  sep»). Más historia que la que tiene Tamio solo llena la bandeja de «sin
 *  apuntar». Se guarda en `banco_conexiones.historia_desde` (migración
 *  20260930b): el «Según Tamio» mide desde ahí, y las líneas anteriores no se
 *  guardan. */
function primeroDelMes(): string {
  return new Date().toISOString().slice(0, 8) + "01";
}

/** Lo que se le pide a Plaid. Con margen: Plaid cuenta los días a su manera
 *  y lo anterior a `historia_desde` se descarta aquí de todos modos. */
function diasQuePedir(): number {
  const dias = Math.ceil((Date.now() - Date.parse(primeroDelMes() + "T00:00:00Z")) / 86_400_000);
  return Math.max(30, dias + 7);
}

/** **Las cuentas que le sirven a una iglesia**, decidido por Iván el 28-sep:
 *  cheques, ahorro y tarjeta de crédito. Un banco trae también préstamos,
 *  hipotecas, 401k… (la prueba del 28-sep guardó 14 cuentas, 10 de ellas de
 *  eso). Se filtra DOS veces: en la ventana de Plaid (`account_filters`), para
 *  que la iglesia ni las comparta, y al guardar, porque `conectar-prueba` y
 *  un banco que no respete el filtro las mandarían igual. Las claves son los
 *  `type` de Plaid y los valores sus `subtype`. */
const CUENTAS_PERMITIDAS: Record<string, string[]> = {
  depository: ["checking", "savings"],
  credit: ["credit card"],
};

function cuentaPermitida(tipo: unknown, subtipo: unknown): boolean {
  return CUENTAS_PERMITIDAS[String(tipo ?? "")]?.includes(String(subtipo ?? "")) ?? false;
}

/** El banco falso de sandbox que usa `conectar-prueba` (First Platypus Bank). */
const BANCO_DE_PRUEBA = "ins_109508";

/** Adónde manda Plaid sus avisos: esta misma función. */
function urlDeAvisos(): string {
  return `${Deno.env.get("SUPABASE_URL")!}/functions/v1/banco`;
}

// Supabase deja seguir trabajando después de contestar con
// `EdgeRuntime.waitUntil`. Fuera de Supabase no existe, y entonces se espera.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

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
  /** Null en las conexiones de antes del 30-sep: se guarda todo. */
  historia_desde: string | null;
}

/** Una conexión de ESTA iglesia. La `uid` viene del cliente; la iglesia no. */
async function conexionDe(admin: SupabaseClient, iglesia: string, uid: unknown): Promise<Conexion> {
  const { data } = await admin
    .from("banco_conexiones").select("uid, church_id, estado, historia_desde")
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
  admin: SupabaseClient, c: Conexion, todas: Cuenta[],
): Promise<Map<string, string>> {
  const cuentas = todas.filter((a) => cuentaPermitida(a.type, a.subtype));
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
      saldo_limite: centavosSaldo(a.balances?.limit),
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
  /** Lo que emparejó solo `banco_emparejar` (fase 4), o null si no se pudo. */
  emparejadas: { depositos: number; movimientos: number; lineas: number } | null;
}

/** El emparejamiento automático (migración `20260930`). Corre en la base, no
 *  aquí, para que la regla viva en un solo sitio y su prueba SQL la mida.
 *  **Si falla, la sincronización NO falla**: lo traído ya está guardado y el
 *  cursor avanzado; las líneas se quedan en la bandeja y se reintenta en la
 *  próxima. */
async function emparejar(admin: SupabaseClient, iglesia: string): Promise<Resumen["emparejadas"]> {
  const { data, error } = await admin.rpc("banco_emparejar", { p_church: iglesia });
  if (error) {
    console.error("banco_emparejar:", error.message);
    return null;
  }
  return data;
}

/** En qué punto está Plaid trayendo el historial (migración 20260929). */
const HISTORIAL = ["trayendo", "inicial", "completo"] as const;
type Historial = (typeof HISTORIAL)[number];

const HISTORIAL_DE_PLAID: Record<string, Historial> = {
  NOT_READY: "trayendo",
  INITIAL_UPDATE_COMPLETE: "inicial",
  HISTORICAL_UPDATE_COMPLETE: "completo",
};

/** Lo sube, nunca lo baja: un aviso viejo que llega tarde no puede devolver
 *  la bandeja a «Trayendo movimientos…». */
async function avanzarHistorial(admin: SupabaseClient, uid: string, nuevo: Historial | null) {
  if (!nuevo) return;
  const { data } = await admin.from("banco_conexiones").select("historial").eq("uid", uid).maybeSingle();
  const actual = (data?.historial ?? "trayendo") as Historial;
  if (HISTORIAL.indexOf(nuevo) > HISTORIAL.indexOf(actual)) {
    await admin.from("banco_conexiones").update({ historial: nuevo }).eq("uid", uid);
  }
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
      let historial: Historial | null = null;

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
          historial = HISTORIAL_DE_PLAID[r.transactions_update_status ?? ""] ?? historial;
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
      // Las líneas de una cuenta que no se guardó (un préstamo, un 401k) se
      // saltan: no son de los libros. Si alguna vez llega una de una cuenta
      // PERMITIDA que no está, eso sí es un error y el cursor no avanza.
      const permitidas = new Set(
        cuentas.filter((a) => cuentaPermitida(a.type, a.subtype)).map((a) => a.account_id as string),
      );
      const filas = [...nuevas, ...cambiadas].flatMap((t) => {
        // Lo anterior a `historia_desde` ya está en el saldo: no es bandeja.
        if (c.historia_desde && String(t.date) < c.historia_desde) return [];
        const cuenta = mapa.get(t.account_id);
        if (!cuenta) {
          if (cuentas.length && !permitidas.has(t.account_id)) return [];
          throw new Fallo("interno", `línea de una cuenta desconocida (${t.account_id})`, 500);
        }
        return [{
          church_id: c.church_id,
          cuenta_uid: cuenta,
          plaid_transaction_id: t.transaction_id,
          fecha: t.date,
          monto: centavos(t.amount),
          moneda: t.iso_currency_code ?? t.unofficial_currency_code ?? "USD",
          nombre: t.name ?? "",
          comercio: t.merchant_name ?? "",
          pendiente: !!t.pending,
          // La categoría y el logo (migración 20260930c). El icono de la
          // categoría de Plaid NO se guarda: la app pinta uno propio.
          categoria: t.personal_finance_category?.primary ?? null,
          categoria_detalle: t.personal_finance_category?.detailed ?? null,
          logo_url: t.logo_url ?? t.counterparties?.[0]?.logo_url ?? null,
          deleted: false,
        }];
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
      await avanzarHistorial(admin, c.uid, historial);

      // Después de guardar, no antes: el emparejamiento mira TODAS las líneas
      // libres de la iglesia, también las de otras conexiones y las que el
      // tesorero desemparejó, y un depósito apuntado ayer en Tamio encuentra
      // aquí la línea que ya estaba.
      const emparejadas = await emparejar(admin, c.church_id);

      return { nuevas: nuevas.length, cambiadas: cambiadas.length, quitadas: quitadas.length, emparejadas };
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

  const peticion: Record<string, unknown> = {
    client_name: "Tamio Church",
    language: cuerpo.idioma === "en" ? "en" : "es",
    country_codes: ["US"],
    user: { client_user_id: yo.id },
    webhook: urlDeAvisos(),
  };

  // Con `conexion_uid` es el «modo actualizar» de Plaid: volver a entrar a un
  // banco que pidió login. No se piden productos: ya los tiene.
  if (cuerpo.conexion_uid) {
    const c = await conexionDe(admin, yo.iglesia, cuerpo.conexion_uid);
    peticion.access_token = (await llaveDe(admin, c.uid)).access_token;
  } else {
    peticion.products = ["transactions"];
    peticion.transactions = { days_requested: diasQuePedir() };
    // La ventana solo ofrece las cuentas que le sirven a una iglesia. **Solo
    // al conectar**: en el modo actualizar Plaid lo rechaza («account_filters
    // should not be used if account selection is not enabled for update
    // mode»), y «Volver a entrar» no abría la ventana. Visto el 30-sep.
    peticion.account_filters = Object.fromEntries(
      Object.entries(CUENTAS_PERMITIDAS).map(([tipo, subtipos]) => [tipo, { account_subtypes: subtipos }]),
    );
  }

  // **La Mac conecta en el navegador** (Hosted Link, M2 del diseño): el SDK
  // de Plaid es solo de iPhone y iPad. Con `navegador`, Plaid devuelve una URL
  // que la Mac abre en Safari, y la Mac pregunta con `conectar-navegador`
  // hasta que la sesión termina. Sin `redirect_uri`: eso es para OAuth dentro
  // de una app, y en el navegador Plaid lo resuelve solo.
  if (cuerpo.navegador) {
    peticion.hosted_link = { url_lifetime_seconds: 1800 };
  } else {
    const redirect = (Deno.env.get("PLAID_REDIRECT_URI") ?? "").trim();
    if (redirect) peticion.redirect_uri = redirect;
  }

  const r = await plaid("/link/token/create", peticion);
  return json({ ok: true, link_token: r.link_token, expira: r.expiration, url: r.hosted_link_url ?? null });
}

/** **La Mac, al terminar en el navegador**: pregunta a Plaid cómo acabó la
 *  sesión del `link_token`. Mientras no haya terminado, `listo: false`, y la
 *  Mac vuelve a preguntar. Con un `public_token`, conecta como el iPhone; en
 *  el modo «volver a entrar» no hay nada que cambiar y solo se actualiza.
 *  Quien llama tiene que ser administrador: el banco va a SU iglesia, y el
 *  `link_token` solo lo tiene quien lo pidió. */
async function conectarNavegador(req: Request, admin: SupabaseClient, cuerpo: Record<string, unknown>) {
  const yo = await quienLlama(req, admin, ROLES_CONECTAN);
  const linkToken = String(cuerpo.link_token ?? "").trim();
  if (!linkToken) throw new Fallo("cuerpo", "falta link_token");
  const r = await plaid("/link/token/get", { link_token: linkToken });
  const sesiones = (r.link_sessions ?? []) as any[];
  const publicToken = sesiones
    .flatMap((s) => [
      ...((s.results?.item_add_results ?? []) as any[]).map((x) => x.public_token),
      s.on_success?.public_token,
    ])
    .find((x) => typeof x === "string" && x);
  const terminada = sesiones.some((s) => s.finished_at);

  if (cuerpo.conexion_uid) {
    // Volver a entrar: la llave no cambia; al terminar, se trae lo que faltó.
    if (!terminada) return json({ ok: true, listo: false });
    const c = await conexionDe(admin, yo.iglesia, cuerpo.conexion_uid);
    try {
      await sincronizar(admin, c);
    } catch (_) {
      // Si el banco sigue pidiendo entrar, lo dice la conexión (`pide_login`).
    }
    return json({ ok: true, listo: true });
  }
  if (!publicToken) {
    // Terminó sin banco (la persona cerró la ventana): se dice para que la
    // Mac deje de esperar.
    return json({ ok: true, listo: terminada, cancelada: terminada });
  }
  await puedeConectar(admin, yo.iglesia);
  const res = await conectarCon(admin, yo, publicToken);
  const datos = await res.json();
  return json({ ...datos, listo: true });
}

/** Lo común a `conectar` y `conectar-prueba`, desde el `public_token`. */
/** El nombre, el logo y el color del banco. Plaid da el logo como PNG en
 *  base64 y no de todos los bancos: sin logo se guarda '' (la app pone la
 *  inicial) para no volver a preguntar en cada actualización. */
async function datosDelBanco(institucion: string | undefined | null) {
  if (!institucion) return { nombre: "", logo: "", color: null as string | null };
  const r = await plaid("/institutions/get_by_id", {
    institution_id: institucion,
    country_codes: ["US"],
    options: { include_optional_metadata: true },
  });
  return {
    nombre: r.institution?.name ?? "",
    logo: r.institution?.logo ?? "",
    color: r.institution?.primary_color ?? null,
  };
}

/** Las conexiones de antes del logo (null) lo piden una vez, al actualizar.
 *  Si falla, no pasa nada: se queda la inicial y se intenta la próxima vez. */
async function completarBanco(admin: SupabaseClient, c: Conexion) {
  const { data } = await admin.from("banco_conexiones").select("logo").eq("uid", c.uid).single();
  if (data?.logo !== null && data?.logo !== undefined) return;
  const llave = await llaveDe(admin, c.uid);
  const { item } = await plaid("/item/get", { access_token: llave.access_token });
  const banco = await datosDelBanco(item?.institution_id);
  await admin.from("banco_conexiones").update({ logo: banco.logo, color: banco.color }).eq("uid", c.uid);
}

async function conectarCon(admin: SupabaseClient, yo: Quien, publicToken: string) {
  const { access_token, item_id } = await plaid("/item/public_token/exchange", { public_token: publicToken });

  let uid: string | null = null;
  try {
    const { item } = await plaid("/item/get", { access_token });
    const banco = await datosDelBanco(item?.institution_id);

    const { data: nueva, error: e1 } = await admin.from("banco_conexiones").insert({
      church_id: yo.iglesia,
      plaid_item_id: item_id,
      institucion: banco.nombre,
      logo: banco.logo,
      color: banco.color,
      conectada_por: yo.nombre,
      historia_desde: primeroDelMes(),
    }).select("uid, church_id, estado, historia_desde").single();
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

    return json({ ok: true, conexion_uid: nueva.uid, institucion: banco.nombre, cuentas: mapa.size, resumen, aviso });
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
 *  (`user_good`, `user_transactions_dynamic`, o uno a medida del panel).
 *
 *  Con `config_prueba` (un objeto) es el usuario A MEDIDA de Plaid,
 *  `user_custom`: la configuración va como contraseña, en JSON, con las
 *  cuentas y las líneas que se quieran. Es lo que prueba el emparejamiento
 *  contra los depósitos y gastos de la iglesia de prueba (fase 4). */
async function conectarPrueba(req: Request, admin: SupabaseClient, cuerpo: Record<string, unknown>) {
  if (ambiente() !== "sandbox") throw new Fallo("solo-sandbox", "conectar-prueba solo existe en sandbox", 403);
  const yo = await quienLlama(req, admin, ROLES_CONECTAN);
  await puedeConectar(admin, yo.iglesia);

  const config = cuerpo.config_prueba;
  const usuario = config && typeof config === "object" ? "user_custom" : String(cuerpo.usuario_prueba ?? "").trim();
  const contrasena = usuario === "user_custom" ? JSON.stringify(config) : "pass_good";
  const { public_token } = await plaid("/sandbox/public_token/create", {
    institution_id: BANCO_DE_PRUEBA,
    initial_products: ["transactions"],
    options: {
      ...(usuario ? { override_username: usuario, override_password: contrasena } : {}),
      transactions: { days_requested: diasQuePedir() },
      // Sin esto, el banco de prueba no avisa nunca y la fase 3 no se prueba.
      webhook: urlDeAvisos(),
    },
  });
  return await conectarCon(admin, yo, public_token);
}

/** Solo en sandbox: pide a Plaid que mande un aviso a esta función, firmado
 *  como los de verdad, para probar el camino entero sin esperar al banco. */
async function probarAviso(req: Request, admin: SupabaseClient, cuerpo: Record<string, unknown>) {
  if (ambiente() !== "sandbox") throw new Fallo("solo-sandbox", "probar-aviso solo existe en sandbox", 403);
  const yo = await quienLlama(req, admin, ROLES_CONECTAN);
  const c = await conexionDe(admin, yo.iglesia, cuerpo.conexion_uid);
  const { access_token } = await llaveDe(admin, c.uid);
  await plaid("/sandbox/item/fire_webhook", {
    access_token,
    webhook_code: String(cuerpo.codigo ?? "SYNC_UPDATES_AVAILABLE"),
  });
  return json({ ok: true });
}

async function actualizar(req: Request, admin: SupabaseClient, cuerpo: Record<string, unknown>) {
  const yo = await quienLlama(req, admin, ROLES_SINCRONIZAN);

  let conexiones: Conexion[];
  if (cuerpo.conexion_uid) {
    conexiones = [await conexionDe(admin, yo.iglesia, cuerpo.conexion_uid)];
  } else {
    const { data } = await admin.from("banco_conexiones")
      .select("uid, church_id, estado, historia_desde").eq("church_id", yo.iglesia).neq("estado", "desconectada");
    conexiones = (data ?? []) as Conexion[];
  }

  // Una que falla no frena a las demás; cada una dice lo suyo.
  const resultados = [];
  for (const c of conexiones) {
    await completarBanco(admin, c).catch(() => {});
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
// LOS AVISOS DE PLAID
// ===========================================================================
//
// La URL de esta función es pública y `verify_jwt` está apagado, así que
// cualquiera puede mandarle un cuerpo con `webhook_type`. **Nada de lo que
// diga se cree hasta verificar la firma**, como pide Plaid:
//
//   1. La cabecera `Plaid-Verification` es un JWT firmado con ES256. Se lee su
//      `kid` y se rechaza cualquier otro algoritmo (sin esto, un JWT con
//      `alg: none` pasaría).
//   2. La clave pública se le pide a Plaid (`/webhook_verification_key/get`)
//      con nuestras credenciales. Una clave caducada no vale.
//   3. Se verifica la firma con esa clave.
//   4. El JWT tiene menos de 5 minutos: un aviso viejo repetido no vale.
//   5. `request_body_sha256` del JWT es el SHA-256 del cuerpo TAL CUAL llegó:
//      si alguien cambia un solo byte del cuerpo, no coincide.
//
// Y aun verificado, el aviso solo aporta un `item_id`: qué conexión mirar. Lo
// que se guarda sale de preguntarle a Plaid con la llave, no del aviso.

const MINUTOS_DE_VIDA_DEL_AVISO = 5;

/** Las claves públicas de Plaid, por `kid`, mientras viva esta instancia. */
const clavesDePlaid = new Map<string, CryptoKey>();

function base64url(texto: string): Uint8Array<ArrayBuffer> {
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(texto.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compara sin salir antes al primer carácter distinto (tiempo constante). */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function claveDePlaid(kid: string): Promise<CryptoKey> {
  const guardada = clavesDePlaid.get(kid);
  if (guardada) return guardada;

  // Un `kid` que Plaid no conoce es un aviso falso, no un fallo de Plaid:
  // 401, como los demás rechazos, y no 502.
  // deno-lint-ignore no-explicit-any
  let key: any;
  try {
    ({ key } = await plaid("/webhook_verification_key/get", { key_id: kid }));
  } catch (e) {
    if (e instanceof FalloPlaid && e.codigoPlaid === "INVALID_WEBHOOK_VERIFICATION_KEY_ID") key = null;
    else throw e;
  }
  if (!key || key.expired_at) throw new Fallo("aviso-falso", "aviso de Plaid no verificado: clave desconocida o caducada", 401);
  const clave = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: key.x, y: key.y },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  clavesDePlaid.set(kid, clave);
  return clave;
}

async function verificarAviso(req: Request, crudo: string): Promise<void> {
  const falso = (por: string) => new Fallo("aviso-falso", `aviso de Plaid no verificado: ${por}`, 401);

  const jwt = req.headers.get("Plaid-Verification") ?? "";
  const partes = jwt.split(".");
  if (partes.length !== 3) throw falso("sin firma");
  const [cab64, carga64, firma64] = partes;

  let cabecera: { alg?: string; kid?: string };
  let carga: { iat?: number; request_body_sha256?: string };
  try {
    cabecera = JSON.parse(new TextDecoder().decode(base64url(cab64)));
    carga = JSON.parse(new TextDecoder().decode(base64url(carga64)));
  } catch {
    throw falso("firma ilegible");
  }
  if (cabecera.alg !== "ES256" || !cabecera.kid) throw falso("algoritmo");

  const clave = await claveDePlaid(cabecera.kid);
  const valida = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    clave,
    base64url(firma64),
    new TextEncoder().encode(`${cab64}.${carga64}`),
  );
  if (!valida) throw falso("firma");

  const edad = Date.now() / 1000 - (carga.iat ?? 0);
  if (edad > MINUTOS_DE_VIDA_DEL_AVISO * 60 || edad < -60) throw falso("caducado");

  const huella = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(crudo)));
  if (!iguales(huella, String(carga.request_body_sha256 ?? ""))) throw falso("el cuerpo no coincide");
}

/** Qué hacer con un aviso YA VERIFICADO. Corre después de contestar a Plaid. */
async function atenderAviso(admin: SupabaseClient, aviso: Record<string, unknown>): Promise<void> {
  const { data: c } = await admin
    .from("banco_conexiones").select("uid, church_id, estado, historia_desde")
    .eq("plaid_item_id", String(aviso.item_id ?? "")).maybeSingle();
  // Un banco que Tamio ya no tiene (o desconectado): nada que hacer.
  if (!c || c.estado === "desconectada") return;

  const cual = `${aviso.webhook_type}/${aviso.webhook_code}`;
  switch (cual) {
    case "TRANSACTIONS/SYNC_UPDATES_AVAILABLE": {
      await sincronizar(admin, c as Conexion);
      await avanzarHistorial(
        admin, c.uid,
        aviso.historical_update_complete ? "completo" : aviso.initial_update_complete ? "inicial" : null,
      );
      return;
    }

    // Hay que volver a entrar al banco: el «!» naranja de la barra lateral.
    case "ITEM/PENDING_EXPIRATION":
    case "ITEM/PENDING_DISCONNECT":
    case "ITEM/ERROR": {
      const error = aviso.error as { error_code?: string; error_message?: string } | undefined;
      const pideLogin = cual !== "ITEM/ERROR" || error?.error_code === "ITEM_LOGIN_REQUIRED";
      await admin.from("banco_conexiones").update({
        error: error?.error_message ?? "El banco pide volver a entrar",
        ...(pideLogin ? { estado: "pide_login" } : {}),
      }).eq("uid", c.uid);
      return;
    }

    // Volvió a entrar (o el banco se arregló solo): se trae lo que faltó.
    case "ITEM/LOGIN_REPAIRED": {
      await admin.from("banco_conexiones").update({ estado: "activa", error: null }).eq("uid", c.uid);
      await sincronizar(admin, c as Conexion);
      return;
    }

    // La iglesia retiró el permiso desde su banco: la llave ya no sirve. Lo
    // traído se queda, como al desconectar desde Tamio.
    case "ITEM/USER_PERMISSION_REVOKED": {
      await admin.from("banco_llaves").delete().eq("conexion_uid", c.uid);
      await admin.from("banco_conexiones").update({
        estado: "desconectada",
        error: "Se retiró el permiso desde el banco",
      }).eq("uid", c.uid);
      return;
    }

    // Retiró el permiso de UNA cuenta: esa deja de verse.
    case "ITEM/USER_ACCOUNT_REVOKED": {
      await admin.from("banco_cuentas").update({ deleted: true })
        .eq("conexion_uid", c.uid).eq("plaid_account_id", String(aviso.account_id ?? ""));
      return;
    }

    // Cualquier otro (WEBHOOK_UPDATE_ACKNOWLEDGED, NEW_ACCOUNTS_AVAILABLE…):
    // se acusa recibo y ya.
    default:
      return;
  }
}

// ===========================================================================

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "solo POST", codigo: "metodo" }, 405);

  try {
    // El cuerpo se lee como TEXTO primero: la firma de Plaid es del cuerpo
    // exacto, y volver a serializar el JSON podría cambiar un byte.
    const crudo = await req.text();
    let cuerpo: Record<string, unknown>;
    try {
      cuerpo = JSON.parse(crudo);
    } catch {
      return json({ error: "cuerpo inválido", codigo: "cuerpo" }, 400);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Plaid avisando. Se verifica ANTES de tocar nada, se contesta en el acto
    // (Plaid da unos segundos) y el trabajo sigue después de contestar.
    if (typeof cuerpo.webhook_type === "string") {
      await verificarAviso(req, crudo);
      const trabajo = atenderAviso(admin, cuerpo).catch((e) =>
        console.error(`aviso ${cuerpo.webhook_type}/${cuerpo.webhook_code}:`, e instanceof Error ? e.message : e)
      );
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(trabajo);
      else await trabajo;
      return json({ ok: true, recibido: true });
    }

    switch (cuerpo.accion) {
      case "enlace": return await enlace(req, admin, cuerpo);
      case "conectar": return await conectar(req, admin, cuerpo);
      case "conectar-prueba": return await conectarPrueba(req, admin, cuerpo);
      case "sincronizar": return await actualizar(req, admin, cuerpo);
      case "desconectar": return await desconectar(req, admin, cuerpo);
      case "probar-aviso": return await probarAviso(req, admin, cuerpo);
      case "conectar-navegador": return await conectarNavegador(req, admin, cuerpo);
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
