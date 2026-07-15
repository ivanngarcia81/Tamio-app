import { dedupPlantillasIniciales, hayPlantillasIniciales, insertPlantilla } from "../../db";
import type { Church, Member, NewPlantilla } from "../../db";
import i18n from "../../i18n";
import { fmtFechaLarga } from "../print/printUtils";

/** Guard por iglesia: evita que corridas concurrentes del efecto (React en
 *  modo desarrollo invoca los efectos dos veces) siembren las plantillas dos
 *  veces. Todas comparten la misma promesa. */
const siembraEnProgreso = new Map<number, Promise<void>>();

/** Siembra las plantillas iniciales una sola vez y elimina duplicados
 *  (repara bases donde ya se sembraron dos veces). */
export function asegurarPlantillasIniciales(churchId: number): Promise<void> {
  const existente = siembraEnProgreso.get(churchId);
  if (existente) return existente;
  const tarea = (async () => {
    if (!(await hayPlantillasIniciales(churchId))) {
      for (const p of plantillasIniciales()) {
        await insertPlantilla(churchId, p, true);
      }
    }
    await dedupPlantillasIniciales(churchId);
  })();
  siembraEnProgreso.set(churchId, tarea);
  return tarea;
}

/** Catálogo de variables. Sintaxis interna {{clave}}, etiquetas legibles en
 *  la UI (plantillas.variable.*). */
export const VARIABLES = [
  "iglesia_nombre", "iglesia_direccion", "iglesia_telefono", "iglesia_correo",
  "ciudad", "fecha_actual", "miembro_nombre", "fecha_membresia", "estado_membresia",
  "iglesia_destino", "iglesia_procedencia", "pastor_nombre", "secretaria_nombre",
  "numero_documento", "fecha_emision",
] as const;

export type VariableId = (typeof VARIABLES)[number];

export type ContextoPlantilla = Partial<Record<VariableId, string>>;

/** Sustituye {{clave}} por su valor. Las variables sin valor se dejan
 *  visibles tal cual, para que la secretaria note qué falta. */
export function aplicarVariables(texto: string, ctx: ContextoPlantilla): string {
  return texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (todo, clave: string) => {
    const v = ctx[clave as VariableId];
    return v !== undefined && v !== "" ? v : todo;
  });
}

function fechaLargaDe(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return fmtFechaLarga(new Date(y, m - 1, d));
}

export function contextoDe(
  church: Church,
  opts: {
    miembro?: Member | null;
    folio?: string;
    fechaEmision?: string;
    iglesiaDestino?: string;
    iglesiaProcedencia?: string;
  } = {}
): ContextoPlantilla {
  const t = i18n.t.bind(i18n);
  const m = opts.miembro ?? null;
  return {
    iglesia_nombre: church.nombre,
    iglesia_direccion: church.direccion ?? "",
    iglesia_telefono: church.telefono ?? "",
    iglesia_correo: church.email ?? "",
    ciudad: church.ciudad ?? "",
    fecha_actual: fmtFechaLarga(new Date()),
    miembro_nombre: m?.nombre ?? "",
    fecha_membresia: m?.fecha_ingreso ? fechaLargaDe(m.fecha_ingreso) : "",
    estado_membresia: m
      ? m.activo === 1
        ? t(`membresia.estado.${["activo", "inactivo", "visitante"].includes(m.estado_membresia) ? m.estado_membresia : "activo"}`)
        : t("membresia.estadoBaja")
      : "",
    iglesia_destino: opts.iglesiaDestino ?? "",
    iglesia_procedencia: opts.iglesiaProcedencia ?? "",
    pastor_nombre: church.pastor_nombre ?? "",
    secretaria_nombre: church.secretaria_nombre ?? "",
    numero_documento: opts.folio ?? "",
    fecha_emision: opts.fechaEmision ? fechaLargaDe(opts.fechaEmision) : "",
  };
}

const TIPOS_INICIALES = [
  "traslado", "recomendacion", "certificacion", "constanciaActivo", "buenaConducta",
  "presentacion", "invitacion", "agradecimiento", "nombramiento", "constanciaServicio",
  "personalizada",
] as const;

/** Las 11 plantillas iniciales, en el idioma activo de la app al momento de
 *  sembrarse. Cada una nace activa y predeterminada de su tipo.
 *
 *  Los textos semilla contienen {{variables}} que i18next intentaría
 *  interpolar al traducir: se le pasan las variables "como sí mismas"
 *  para que los tokens lleguen intactos a la plantilla. */
export function plantillasIniciales(): NewPlantilla[] {
  const t = i18n.t.bind(i18n);
  const tokens: Record<string, unknown> = Object.fromEntries(VARIABLES.map((v) => [v, `{{${v}}}`]));
  tokens.interpolation = { escapeValue: false };
  return TIPOS_INICIALES.map((tipo) => ({
    nombre: t(`cartas.tipoDoc.${tipo}`),
    tipo,
    asunto: t(`plantillas.seed.${tipo}.asunto`, tokens) || null,
    saludo: t("plantillas.seedSaludo"),
    cuerpo_html: t(`plantillas.seed.${tipo}.cuerpo`, tokens),
    despedida: t("plantillas.seedDespedida"),
    activa: true,
    predeterminada: true,
  }));
}
