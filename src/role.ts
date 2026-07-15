// Roles de la aplicación. Por ahora el rol se elige manualmente en
// Configuración (selector temporal); cuando exista backend con login, el rol
// vendrá del usuario autenticado y este módulo solo cambia su origen.

export type Role = "tesorero" | "secretaria";

const KEY = "tamio-rol";

export function initialRole(): Role {
  try {
    const r = localStorage.getItem(KEY);
    if (r === "secretaria" || r === "tesorero") return r;
  } catch { /* noop */ }
  return "tesorero";
}

export function saveRole(r: Role): void {
  try { localStorage.setItem(KEY, r); } catch { /* noop */ }
}

/** Rutas de Secretaría (visibles para tesorero y secretaria). */
export const RUTAS_SECRETARIA = ["/membresia", "/actas", "/servicios", "/cartas", "/reporte-miembros", "/agenda"];

/** ¿Puede el rol acceder a esta ruta?
 *  La secretaria ve todo Secretaría + solo el Reporte de Tesorería + Configuración.
 *  El tesorero (y futuros admin) ve todo. */
export function puedeVer(role: Role, path: string): boolean {
  if (role === "tesorero") return true;
  if (path === "/") return true;               // Home (con contenido secretarial)
  if (RUTAS_SECRETARIA.includes(path)) return true;
  if (path === "/reportes") return true;       // único acceso a Tesorería
  if (path === "/configuracion") return true;  // ajustes básicos
  return false; // Ingresos, Gastos, Contribuyentes, Depósitos, Bandeja
}

/** Página inicial según el rol. */
export const HOME_POR_ROL: Record<Role, string> = {
  tesorero: "/",
  secretaria: "/",
};
