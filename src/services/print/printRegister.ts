import { categoriaInfo, metodoNombre, METODOS_PAGO, type Church, type Tx } from "../../db";
import i18n from "../../i18n";
import { ReportBase, type BaseCol } from "./reportBase";
import { CERO, sumar, type Centavos } from "../../dinero";
import {
  buildReportId, fmtFechaCortaPdf, fmtFechaLarga, fmtHora12, fmtMoneyPlain, loadPngDataUrl,
  openForPrint, PDF_SPACE, pct, slug,
} from "./printUtils";

export interface RegisterPrintOptions {
  church: Church;
  /** Título de la página que se estaba viendo — p. ej. "Ingresos", "Gastos". */
  titulo: string;
  /** Descripción legible del filtro/búsqueda activos, para dejar constancia
   *  de qué se imprimió exactamente (p. ej. "Julio 2026 · Categoría: Servicios"). */
  filtroDescripcion: string;
  periodoISO: string;
  /** Movimientos EXACTAMENTE como se están mostrando en pantalla — ya
   *  filtrados, buscados y ordenados. Este módulo no vuelve a filtrar nada. */
  movimientos: Tx[];
}

/** "energia electrica" → "Energia electrica": la primera letra del detalle se
 *  capitaliza para que la columna no mezcle estilos de captura. */
function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Arma el PDF y devuelve bytes + nombre de archivo (también lo usa la
 *  vista previa de desarrollo). */
export async function buildRegisterPdf(opts: RegisterPrintOptions): Promise<{ bytes: ArrayBuffer; fileName: string }> {
  const { church, movimientos } = opts;
  const moneda = church.moneda;
  const money = (c: Centavos) => fmtMoneyPlain(c, moneda);
  const logoDataUrl = church.logo_path ? await loadPngDataUrl(church.logo_path) : null;
  const firmaDataUrl = church.tesorero_firma_path ? await loadPngDataUrl(church.tesorero_firma_path) : null;
  const firmaPastorDataUrl = church.pastor_firma_path ? await loadPngDataUrl(church.pastor_firma_path) : null;

  // Título en caso oración: la plantilla i18n arma "Registro de {{titulo}}" /
  // "{{titulo}} register" y aquí solo se corrige la primera letra — antes el
  // .toLowerCase() sin corregir producía "expenses register" en inglés.
  const tituloCrudo = i18n.t("pdf.registroDe", { titulo: opts.titulo.toLowerCase() });
  const titulo = tituloCrudo.charAt(0).toUpperCase() + tituloCrudo.slice(1);

  const meta = [opts.filtroDescripcion, i18n.t("pdf.moneda", { moneda })];
  if (church.ciudad) meta.unshift(church.ciudad);

  const doc = new ReportBase({
    churchNombre: church.nombre,
    titulo,
    meta,
    logoDataUrl,
  });

  // Anchos: FECHA 15% · CATEGORÍA 20% · DETALLE 32% · MÉTODO 15% · MONTO 18%.
  // Sin columna TIPO: cada página de movimientos es de un solo tipo, así que
  // repetir "Gasto" en cada fila no informaba nada.
  const cw = doc.contentWidth;
  const cols: BaseCol[] = [
    { label: i18n.t("tx.colFecha"), width: cw * 0.15, align: "left" },
    { label: i18n.t("tx.colCategoria"), width: cw * 0.20, align: "left" },
    { label: i18n.t("tx.colDescripcion"), width: cw * 0.32, align: "left" },
    { label: i18n.t("tx.colMetodo"), width: cw * 0.15, align: "left" },
    { label: i18n.t("tx.colMonto"), width: cw * 0.18, align: "right" },
  ];

  doc.beginTable(i18n.t("pdf.movimientos"), cols);

  // Totales y subtotales por categoría (para el resumen y la fila de cierre).
  // Los montos van SIN signo: el tipo del registro ya lo dice el título, y el
  // signo "−" (U+2212) no existe en la Helvetica de jsPDF — era el origen del
  // artefacto de comilla y del espaciado roto en la columna de montos.
  let totalIngresos = CERO;
  let totalGastos = CERO;
  const porCategoria = new Map<string, Centavos>();

  movimientos.forEach((tx, i) => {
    const cat = categoriaInfo(tx.tipo, tx.categoria);
    const quien = tx.member_nombre ?? tx.beneficiario ?? null;
    const descripcion = capitalizar([tx.concepto, tx.detalle, quien].filter(Boolean).join(" — "));
    const metodo = METODOS_PAGO.some((m) => m.id === tx.metodo_pago) ? metodoNombre(tx.metodo_pago) : tx.metodo_pago;

    doc.row([fmtFechaCortaPdf(tx.fecha), cat.nombre, descripcion, metodo, money(tx.monto)], cols, i);

    if (tx.tipo === "ingreso") totalIngresos = sumar(totalIngresos, tx.monto);
    else totalGastos = sumar(totalGastos, tx.monto);
    porCategoria.set(cat.nombre, sumar(porCategoria.get(cat.nombre) ?? CERO, tx.monto));
  });

  // Fila de total al cierre de la tabla. Las páginas de movimientos son de un
  // solo tipo; si algún día llegaran mezclados, el cierre muestra cada total
  // en el resumen y aquí la suma bruta no se dibuja para no engañar.
  const esMixto = totalIngresos > 0 && totalGastos > 0;
  if (!esMixto) {
    doc.totalRow(["", "", i18n.t("pdf.totales"), "", money(sumar(totalIngresos, totalGastos))], cols);
  }
  doc.endTable();
  doc.addGap(PDF_SPACE.md);

  // ---------- Resumen por categoría ----------
  // Sin "Total ingresos $0.00" ni "Balance" negativo: en un registro filtrado
  // por tipo esos campos eran artefactos del filtro, no información.
  const totalDelTipo = esMixto ? sumar(totalIngresos, totalGastos) : (totalIngresos || totalGastos);
  const resCols: BaseCol[] = [
    { label: i18n.t("pdf.colCategoria"), width: cw - 92 - 92, align: "left" },
    { label: i18n.t("pdf.colMonto"), width: 92, align: "right" },
    { label: i18n.t("pdf.colPctTotal"), width: 92, align: "right" },
  ];
  doc.beginTable(i18n.t("pdf.resumenPorCategoria"), resCols);
  [...porCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([nombre, total], i) => doc.row([nombre, money(total), pct(total, totalDelTipo)], resCols, i, [2]));
  if (esMixto) {
    doc.totalRow([i18n.t("reportes.totalIngresos"), money(totalIngresos), ""], resCols);
    doc.totalRow([i18n.t("reportes.totalGastos"), money(totalGastos), ""], resCols);
  } else {
    const etiqueta = totalGastos > 0 ? i18n.t("reportes.totalGastos") : i18n.t("reportes.totalIngresos");
    doc.totalRow([etiqueta, money(totalDelTipo), ""], resCols);
  }
  doc.endTable();
  doc.addGap(PDF_SPACE.xs);
  doc.paragraph(`${i18n.t("pdf.registrosImpresos")}: ${movimientos.length}`);

  // ---------- Firmas (mismo bloque que el estado financiero) ----------
  const firmantes = [];
  if (church.tesorero_nombre) {
    firmantes.push({ nombre: church.tesorero_nombre, cargo: church.tesorero_cargo || i18n.t("rol.tesorero"), img: firmaDataUrl });
  }
  if (church.pastor_nombre) {
    firmantes.push({ nombre: church.pastor_nombre, cargo: church.pastor_cargo || i18n.t("pdf.pastorCargo"), img: firmaPastorDataUrl });
  }
  doc.firmas(firmantes);

  const now = new Date();
  const bytes = doc.finalize({
    reportId: buildReportId(opts.periodoISO, "REG"),
    fechaGeneracion: fmtFechaLarga(now),
    horaGeneracion: fmtHora12(now),
  });

  const fileName = `${i18n.t("pdf.fileRegistro")}-${slug(opts.titulo)}-${slug(church.nombre)}-${slug(opts.periodoISO)}.pdf`;
  return { bytes, fileName };
}

/** true si imprimió, false si no había nada que imprimir (llamador debe
 *  mostrar "No hay registros para imprimir." y no invocar esto de nuevo). */
export async function printRegister(opts: RegisterPrintOptions): Promise<boolean> {
  if (opts.movimientos.length === 0) return false;
  const { bytes, fileName } = await buildRegisterPdf(opts);
  await openForPrint(bytes, fileName);
  return true;
}
