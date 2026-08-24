import {
  mesesPendientesRecurrente, normalizarTexto,
  type Member, type MovimientoRecurrente, type Tx,
} from "../../db";
import type { Centavos } from "../../dinero";

/**
 * La taxonomía de alertas de "Por revisar" (handoff 2, 22 ago 2026).
 *
 * El handoff 1 dibujaba estas mismas alertas y se descartaron por inventadas
 * (`docs/ipad-rediseno.md` §4). El handoff 2 vuelve a pedirlas, y al mirar el
 * esquema con calma resulta que **las cinco se calculan con lo que ya hay**:
 * ninguna necesita tabla nueva. Lo único que no existe es el AJUSTE del
 * umbral de comprobante, que el prototipo dibuja en Configuración; aquí va
 * como constante documentada (ver `UMBRAL_COMPROBANTE`).
 *
 * Reglas de la casa:
 *
 *  - Una alerta señala algo que **una persona tiene que mirar**, no algo que
 *    esté mal por definición. Por eso ninguna se calcula sobre movimientos
 *    ya rechazados, y por eso "Otros" NO cuenta como categoría vacía: es una
 *    categoría legítima que alguien eligió.
 *  - Cada alerta trae consigo el objeto sobre el que se actúa. La pantalla no
 *    vuelve a buscar nada.
 *  - Cuando una misma transacción dispara dos alertas, salen las dos: son dos
 *    cosas distintas que revisar, y agrupar la segunda debajo de la primera
 *    la escondería.
 */

export type TipoAlerta =
  | "pendiente"
  | "sinComprobante"
  | "duplicado"
  | "categoriaVacia"
  | "miembroSinVincular"
  | "recurrenteVencido"
  | "miembroArchivado";

export interface Alerta {
  /** Estable entre recargas: la lista lo usa de `key` y de selección. */
  clave: string;
  tipo: TipoAlerta;
  tx?: Tx;
  /** El OTRO movimiento de un duplicado probable. */
  gemelo?: Tx;
  miembro?: Member;
  recurrente?: MovimientoRecurrente;
  /** Meses "YYYY-MM" que un recurrente lleva sin generar. */
  meses?: string[];
}

/** Gasto sin comprobante: a partir de cuánto merece una mirada.
 *
 *  1.000 en la moneda de la iglesia, en centavos. El prototipo lo dibuja como
 *  un interruptor de Configuración ("Exigir comprobante en gastos mayores a
 *  $1,000") que la app NO tiene; mientras no exista, el número vive aquí,
 *  con nombre y comentario, y no repartido por la pantalla.
 *  Apuntado en docs/cascaras-1-2.md como ajuste pendiente. */
export const UMBRAL_COMPROBANTE: Centavos = 100_000 as Centavos;

/** Dos movimientos son "duplicado probable" si caen dentro de esta ventana. */
const DIAS_DUPLICADO = 8;

/** El día de una fecha de transacción ("2026-08-19 10:30" → "2026-08-19"). */
function dia(fecha: string): string {
  return fecha.slice(0, 10);
}

/** Diferencia en días entre dos "YYYY-MM-DD", sin husos ni sorpresas. */
function distanciaDias(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00`) - Date.parse(`${b}T00:00:00`);
  return Math.abs(Math.round(ms / 86_400_000));
}

/** La huella de un movimiento para comparar duplicados: quién, cuánto y de
 *  qué. Con miembro se usa su id; sin miembro, el concepto normalizado —así
 *  dos "Renta del anexo" del mismo monto se ven, y dos ofrendas sueltas de
 *  distinto concepto no se confunden. */
function huella(tx: Tx): string {
  const quien = tx.member_id != null ? `m${tx.member_id}` : `c${normalizarTexto(tx.concepto)}`;
  return `${tx.tipo}|${tx.monto}|${quien}`;
}

export interface EntradaAlertas {
  /** Movimientos en estado pendiente (los que la Bandeja ya listaba). */
  pendientes: Tx[];
  /** Movimientos recientes sobre los que se buscan las otras alertas. */
  recientes: Tx[];
  archivados: Member[];
  recurrentes: MovimientoRecurrente[];
  /** "YYYY-MM" de hoy, para los recurrentes. */
  hoyMes: string;
  umbralComprobante?: Centavos;
  /** Los dos controles de tesorería (migración 45). Sin pasarlos, las dos
   *  reglas se calculan — que es lo que hacía la app antes de que fueran
   *  ajustables, y lo que tiene que seguir haciendo por omisión. */
  avisarSinComprobante?: boolean;
  avisarDuplicados?: boolean;
}

/**
 * Calcula todas las alertas de la bandeja, en el orden en que se atienden:
 * lo que pide decisión primero (pendientes), después lo que pide arreglo, y
 * al final lo que solo pide enterarse.
 */
export function calcularAlertas(e: EntradaAlertas): Alerta[] {
  const umbral = e.umbralComprobante ?? UMBRAL_COMPROBANTE;
  const avisaComprobante = e.avisarSinComprobante ?? true;
  const avisaDuplicados = e.avisarDuplicados ?? true;
  const out: Alerta[] = [];

  // 1. Pendientes de revisión: lo que la pantalla ya hacía.
  for (const tx of e.pendientes) {
    out.push({ clave: `tx-${tx.id}-pendiente`, tipo: "pendiente", tx });
  }

  /* Los pendientes ya salen arriba con su propia alerta; las de abajo miran
     el resto, para que un mismo movimiento no aparezca como "pendiente" y
     otra vez debajo por lo mismo que ya se va a revisar. */
  const pendientesId = new Set(e.pendientes.map((x) => x.id));
  const resto = e.recientes.filter((x) => !pendientesId.has(x.id));

  // 2. Gasto sin comprobante por encima del umbral, si la iglesia lo pide.
  if (avisaComprobante) {
    for (const tx of resto) {
      if (tx.tipo === "gasto" && !tx.comprobante_path && tx.monto >= umbral) {
        out.push({ clave: `tx-${tx.id}-sinComprobante`, tipo: "sinComprobante", tx });
      }
    }
  }

  /* 3. Duplicado probable. Se agrupa por huella y dentro de cada grupo se
        comparan por fecha; solo se anuncia UNA vez por pareja (el más nuevo
        contra el más viejo), porque dos avisos del mismo hecho son ruido. */
  if (avisaDuplicados) {
    const grupos = new Map<string, Tx[]>();
    for (const tx of resto) {
      const h = huella(tx);
      const g = grupos.get(h);
      if (g) g.push(tx); else grupos.set(h, [tx]);
    }
    for (const g of grupos.values()) {
      if (g.length < 2) continue;
      const orden = [...g].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
      for (let i = 1; i < orden.length; i++) {
        const previo = orden[i - 1];
        const actual = orden[i];
        if (distanciaDias(dia(actual.fecha), dia(previo.fecha)) <= DIAS_DUPLICADO) {
          out.push({ clave: `tx-${actual.id}-duplicado`, tipo: "duplicado", tx: actual, gemelo: previo });
        }
      }
    }
  }

  /* 4. Categoría vacía. "Otros" NO cuenta: es una categoría de verdad que
        alguien eligió. Esto caza lo que entra por importación de CSV con la
        columna en blanco, que es de donde salen en la práctica. */
  for (const tx of resto) {
    if (!tx.categoria || !tx.categoria.trim()) {
      out.push({ clave: `tx-${tx.id}-categoriaVacia`, tipo: "categoriaVacia", tx });
    }
  }

  /* 5. Aportante sin vincular. Un diezmo —o cualquier ingreso marcado para
        constancia— sin `member_id` no puede salir en la constancia anual de
        ese miembro, que es el papel que la iglesia entrega en enero. Es la
        alerta con consecuencia fiscal, no solo de orden. */
  for (const tx of resto) {
    if (tx.tipo !== "ingreso" || tx.member_id != null) continue;
    if (tx.categoria === "diezmo" || tx.emitir_constancia === 1) {
      out.push({ clave: `tx-${tx.id}-miembroSinVincular`, tipo: "miembroSinVincular", tx });
    }
  }

  // 6. Recurrente vencido: meses ya cumplidos que nunca se generaron.
  for (const r of e.recurrentes) {
    const { meses } = mesesPendientesRecurrente(r.mes_inicio, r.ultimo_mes_generado, e.hoyMes);
    if (meses.length > 0) {
      out.push({ clave: `rec-${r.id}-vencido`, tipo: "recurrenteVencido", recurrente: r, meses });
    }
  }

  // 7. Miembros archivados: lo que la pantalla ya listaba abajo.
  for (const m of e.archivados) {
    out.push({ clave: `m-${m.id}-archivado`, tipo: "miembroArchivado", miembro: m });
  }

  return out;
}

/** El conteo por tipo, para los chips de filtro. */
export function conteoPorTipo(alertas: Alerta[]): Map<TipoAlerta, number> {
  const m = new Map<TipoAlerta, number>();
  for (const a of alertas) m.set(a.tipo, (m.get(a.tipo) ?? 0) + 1);
  return m;
}
