// Roles de la aplicación. Por ahora el rol se elige manualmente en
// Configuración (selector temporal); cuando exista backend con login, el rol
// vendrá del usuario autenticado y este módulo solo cambia su origen.

export type Role = "tesorero" | "secretaria" | "administrador";

/** Los tres roles de ACCESO, para recorrerlos en un selector.
 *
 *  No confundir con `ROLES_USUARIO` de `db.ts` (pastor, auditor, consejo…),
 *  que son cargos del directorio local y **no dan acceso a nada**. Ofrecer uno
 *  de aquellos al invitar le daría permisos de verdad a quien solo figura en
 *  una lista; la Edge Function `invitar-usuario` rechaza los que no estén
 *  aquí. */
export const ROLES_ACCESO: Role[] = ["tesorero", "secretaria", "administrador"];

const KEY = "tamio-rol";

/** Rol inicial en modo local (sin login). Por defecto **administrador**: quien
 *  instala Tamio es el responsable de su iglesia y debe ver Tesorería y
 *  Secretaría desde el primer arranque. Si eligió otro rol antes, se respeta. */
export function initialRole(): Role {
  try {
    const r = localStorage.getItem(KEY);
    if (r === "secretaria" || r === "tesorero" || r === "administrador") return r;
  } catch { /* noop */ }
  return "administrador";
}

export function saveRole(r: Role): void {
  try { localStorage.setItem(KEY, r); } catch { /* noop */ }
}

/** Rutas de Tesorería (solo el tesorero, salvo /reportes que también ve la
 *  secretaria). */
export const RUTAS_TESORERIA = ["/ingresos", "/gastos", "/miembros", "/reportes", "/depositos", "/bandeja"];
/** Rutas de Secretaría (solo la secretaria). */
export const RUTAS_SECRETARIA = ["/membresia", "/actas", "/servicios", "/cartas", "/reporte-miembros", "/agenda"];

/** Los permisos del rol Tesorería que abren o cierran una PUERTA (migración
 *  49). Van en un objeto y no sueltos para que el día que haya un tercero no
 *  haya que tocar otra vez cada llamada de `puedeVer`.
 *
 *  La forma es estructural a propósito: `role.ts` no importa `db.ts`, que es
 *  todo el motor de datos, solo para leer dos enteros. */
export interface Permisos {
  /** El tesorero entra TAMBIÉN a Membresía, el padrón de Secretaría. Es un
   *  permiso que DA, no que quita: hoy no entra. Para la iglesia chica donde
   *  la misma persona lleva la tesorería y el padrón. */
  vePadron: boolean;
}

/** Lo de hoy: ningún permiso extra. Es el valor por omisión de `puedeVer`, y
 *  eso hace que una llamada que se me olvide actualizar falle CERRADA. */
export const SIN_PERMISOS: Permisos = { vePadron: false };

/** Traduce el espejo local de la iglesia a permisos. La verdad de estas dos
 *  columnas vive en Supabase y baja con el plan (ver `sync.ts`). */
export function permisosDe(church: { tesorero_ve_padron?: number } | null | undefined): Permisos {
  return { vePadron: (church?.tesorero_ve_padron ?? 0) !== 0 };
}

/** ¿Puede este rol borrar movimientos? (migración 49.)
 *
 *  Solo limita al TESORERO: el administrador es quien pone el límite y la
 *  secretaria no llega a Ingresos ni a Gastos. Por omisión sí puede, que es lo
 *  que la app ha hecho siempre; se lo quita el administrador a propósito.
 *
 *  Esconder el botón NO es el control —el aparato podría escribir la fila
 *  igual—: el control es el disparador `frenar_borrado_tesorero` de Supabase,
 *  que deshace la baja y la devuelve viva. Esto es para que la tesorera no vea
 *  un botón que no va a funcionar. */
export function puedeEliminarMovimientos(
  role: Role,
  church: { tesorero_puede_eliminar?: number } | null | undefined,
): boolean {
  if (role !== "tesorero") return true;
  return (church?.tesorero_puede_eliminar ?? 1) !== 0;
}

/** ¿Puede el rol acceder a esta ruta? Separación estricta de funciones:
 *  - El administrador ve todo (Tesorería + Secretaría).
 *  - El tesorero ve solo Tesorería (+ Home, Inbox y Configuración), y además
 *    Membresía si la iglesia le dio ese permiso.
 *  - La secretaria ve solo Secretaría + el Reporte de Tesorería (+ Home,
 *    Inbox y Configuración). */
export function puedeVer(role: Role, path: string, permisos: Permisos = SIN_PERMISOS): boolean {
  if (role === "administrador") return true;   // acceso total
  // Comunes a los demás roles.
  if (path === "/") return true;               // Home (Dashboard o Inicio Secretaría)
  if (path === "/inbox") return true;          // mensajería
  if (path === "/configuracion") return true;  // ajustes
  if (role === "tesorero") {
    // El permiso abre UNA pantalla, no el área: Membresía es el padrón, y es
    // lo que Iván describió. Actas, Cartas o Servicios siguen fuera — darlas
    // de regalo convertiría un permiso en un cambio de rol.
    if (path === "/membresia" && permisos.vePadron) return true;
    return RUTAS_TESORERIA.includes(path);
  }
  // secretaria: su área + solo el Reporte de Tesorería.
  if (RUTAS_SECRETARIA.includes(path)) return true;
  if (path === "/reportes") return true;
  return false;
}

/** Página inicial según el rol. */
export const HOME_POR_ROL: Record<Role, string> = {
  tesorero: "/",
  secretaria: "/",
  administrador: "/",
};
