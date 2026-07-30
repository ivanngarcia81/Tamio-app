// Roles de la aplicación. Por ahora el rol se elige manualmente en
// Configuración (selector temporal); cuando exista backend con login, el rol
// vendrá del usuario autenticado y este módulo solo cambia su origen.

export type Role = "tesorero" | "secretaria" | "administrador";

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

/** ¿Puede el rol acceder a esta ruta? Separación estricta de funciones:
 *  - El administrador ve todo (Tesorería + Secretaría).
 *  - El tesorero ve solo Tesorería (+ Home, Inbox y Configuración).
 *  - La secretaria ve solo Secretaría + el Reporte de Tesorería (+ Home,
 *    Inbox y Configuración). */
export function puedeVer(role: Role, path: string): boolean {
  if (role === "administrador") return true;   // acceso total
  // Comunes a los demás roles.
  if (path === "/") return true;               // Home (Dashboard o Inicio Secretaría)
  if (path === "/inbox") return true;          // mensajería
  if (path === "/configuracion") return true;  // ajustes
  if (role === "tesorero") return RUTAS_TESORERIA.includes(path);
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
