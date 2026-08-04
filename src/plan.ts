// Suscripción de Tamio: qué módulos ve una iglesia según su plan, y si la
// suscripción está vigente (con periodo de gracia offline).
//
// Regla de no-romper: si no hay información de plan, el valor por defecto es
// "completo" + "activa", así las instalaciones actuales siguen viendo TODO
// igual que antes. El gate solo restringe cuando un plan lo pide explícitamente.
//
// De momento el plan se controla a mano (dueño en Ajustes) y hace también de
// mecanismo de "cortesía". Más adelante, un webhook de pago actualizará estos
// mismos campos y la nube será la autoridad.

import { RUTAS_TESORERIA, RUTAS_SECRETARIA } from "./role";

export type Plan = "completo" | "tesoreria" | "secretaria";
export type EstadoSub = "activa" | "cortesia" | "vencida" | "prueba";

export const PLANES: Plan[] = ["completo", "tesoreria", "secretaria"];
export const ESTADOS_SUB: EstadoSub[] = ["activa", "cortesia", "prueba", "vencida"];

/** Días que la app sigue funcionando tras el vencimiento (para no dejar a
 *  nadie fuera en una asamblea sin internet). */
export const DIAS_GRACIA = 10;

/** URL del checkout de Lemon Squeezy donde se compra o renueva la
 *  suscripción. Viene de VITE_URL_COMPRA en el .env; si no está configurada,
 *  los botones de "Renovar/Comprar" simplemente no se muestran (que es el
 *  caso de hoy: la tienda todavía no existe). Es de compilación, no de
 *  ejecución: cambiarla obliga a recompilar. Ver docs/guia-lemon-squeezy.md. */
export const urlCompra: string | null =
  (import.meta.env.VITE_URL_COMPRA as string | undefined)?.trim() || null;

/** ¿El plan incluye el área de Tesorería (finanzas)? */
export function incluyeTesoreria(plan: string): boolean {
  return plan === "completo" || plan === "tesoreria";
}

/** ¿El plan incluye el área de Secretaría (membresía, actas, cartas…)? */
export function incluyeSecretaria(plan: string): boolean {
  return plan === "completo" || plan === "secretaria";
}

/** ¿Puede este rol dar de alta / importar miembros? Cuando el plan incluye
 *  Secretaría, el padrón tiene dueño (Membresía): el tesorero consulta y
 *  edita datos de aportación, pero las altas se hacen allá. En plan "solo
 *  Tesorería" no hay Secretaría y el tesorero mantiene su propio padrón. */
export function puedeCrearMiembros(role: string, plan: string): boolean {
  return role !== "tesorero" || !incluyeSecretaria(plan);
}

/** La integración entre áreas (Tesorería consume los miembros de Secretaría y
 *  Secretaría ve el reporte de Tesorería) es exclusiva del plan Completo. */
export function integracionActiva(plan: string): boolean {
  return plan === "completo";
}

/** ¿El plan permite acceder a esta ruta? Cierra el hueco de "teclear la URL"
 *  del área no contratada; las rutas comunes (Inicio, Inbox, Ajustes, Ayuda)
 *  siempre pasan. Se combina con el gate por rol (puedeVer). */
export function rutaPermitidaPorPlan(plan: string, path: string): boolean {
  if (RUTAS_TESORERIA.includes(path)) return incluyeTesoreria(plan);
  if (RUTAS_SECRETARIA.includes(path)) return incluyeSecretaria(plan);
  return true;
}

export interface Vigencia {
  /** true si la app debe funcionar (incluye el periodo de gracia). */
  activa: boolean;
  /** true si venció y ya pasó incluso la gracia. */
  vencida: boolean;
  /** true si venció pero sigue dentro de la gracia. */
  enGracia: boolean;
  /** Días hasta el vencimiento (negativo si ya pasó); null si no vence nunca. */
  diasRestantes: number | null;
  /** Días de gracia que quedan cuando enGracia = true; null en otro caso. */
  diasGracia: number | null;
}

/** Evalúa si la suscripción está vigente hoy. La cortesía y el plan sin fecha
 *  de vencimiento se consideran siempre activos. */
export function evaluarVigencia(estado: string, vence: string | null, hoy: Date = new Date()): Vigencia {
  if (estado === "cortesia") {
    return { activa: true, vencida: false, enGracia: false, diasRestantes: null, diasGracia: null };
  }
  if (estado === "vencida") {
    return { activa: false, vencida: true, enGracia: false, diasRestantes: null, diasGracia: null };
  }
  if (!vence) {
    // Activa/prueba sin fecha = perpetua (útil en modo local o cortesía informal).
    return { activa: true, vencida: false, enGracia: false, diasRestantes: null, diasGracia: null };
  }
  const finMs = Date.parse(`${vence}T23:59:59`);
  const ahora = hoy.getTime();
  const dia = 86_400_000;
  const diasRestantes = Math.ceil((finMs - ahora) / dia);
  const finGraciaMs = finMs + DIAS_GRACIA * dia;
  const activa = ahora <= finGraciaMs;
  const enGracia = ahora > finMs && ahora <= finGraciaMs;
  const diasGracia = enGracia ? Math.max(0, Math.ceil((finGraciaMs - ahora) / dia)) : null;
  return { activa, vencida: !activa, enGracia, diasRestantes, diasGracia };
}
