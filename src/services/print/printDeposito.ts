import {
  corteDeDeposito, fmtFechaCorta, mesLegible, metodoNombre, movimientosDeDeposito,
  type Church, type Deposito, type Tx,
} from "../../db";
import { sumar, type Centavos } from "../../dinero";
import i18n from "../../i18n";
import { ReportDocBuilder, type PdfColumn } from "./pdfGenerator";
import {
  fmtFechaLarga, fmtHora12, fmtMoneyPdf, loadPngDataUrl, openForPrint, PDF_SPACE, slug,
} from "./printUtils";

const esCheque = (t: Tx) => t.metodo_pago === "cheque";

/**
 * Comprobante de depósito en PDF — el motor de "Compartir" del panel de
 * Depositados.
 *
 * **Qué es "Compartir" aquí.** Hasta la 1.2.9 el botón salía apagado con la
 * explicación de que la app no tenía hoja de compartir. La tenía: `openForPrint`
 * entrega por la hoja nativa de iOS —Archivos, AirDrop, Mail, Imprimir— desde
 * que existen los reportes. Lo que faltaba de verdad era el DOCUMENTO. Este
 * archivo es ese documento, y por eso el botón se enciende sin dependencia
 * nueva ninguna.
 *
 * Lo que lleva dentro, y de dónde sale cada cosa:
 *
 *  - Los datos del depósito —cuenta, fecha, referencia, periodo, notas— son
 *    columnas de `depositos_bancarios` de toda la vida.
 *  - **El desglose efectivo/cheques y la lista de movimientos salen del CORTE**
 *    que cerró el depósito (migración 38). Un depósito registrado sin corte no
 *    los tiene, y entonces el PDF lo DICE en vez de imprimir un cero: cero es
 *    una cifra y "no se sabe" es otra cosa. Es la misma regla que sigue la
 *    ficha en pantalla.
 *  - "Registró" y el responsable del corte son las instantáneas de la
 *    migración 39: el nombre tal como era al registrar, no un id que apunte a
 *    un perfil que puede desaparecer.
 *
 * El bloque de firmas lleva a quien registró y a quien llevó el dinero al
 * banco — que es justo el par que un comprobante de depósito necesita
 * enfrentar, y el hueco que los cortes vinieron a cubrir.
 */
export async function printDepositoPdf(church: Church, dep: Deposito): Promise<void> {
  const t = i18n.t.bind(i18n);
  const moneda = dep.moneda || church.moneda;

  const [logoDataUrl, movs, corte] = await Promise.all([
    church.logo_path ? loadPngDataUrl(church.logo_path) : Promise.resolve(null),
    movimientosDeDeposito(dep.id, dep.church_id),
    corteDeDeposito(dep.id, dep.church_id),
  ]);

  const suma = (f: (x: Tx) => boolean): Centavos => sumar(...movs.filter(f).map((m) => m.monto));
  const efectivo = suma((m) => !esCheque(m));
  const cheques = suma(esCheque);
  const contado = sumar(efectivo, cheques);

  const rol = (clave: string | null | undefined) =>
    clave ? t(`rol.${clave}`, { defaultValue: clave }) : null;

  const doc = new ReportDocBuilder({
    title: t("depositos.pdfTitulo"),
    churchLine: `${church.nombre}${church.ciudad ? " · " + church.ciudad : ""}`,
    period: fmtFechaCorta(dep.fecha),
    moneda,
    generatedBy: dep.registrado_por
      ? { nombre: dep.registrado_por, rol: rol(dep.registrado_rol) ?? undefined }
      : undefined,
    logoDataUrl,
  });

  // ---------- Datos del depósito ----------
  doc.heading(t("depositos.datosDelDeposito"));
  doc.keyValueGrid(
    [
      { label: t("depositos.colCuenta"), value: dep.cuenta_banco },
      { label: t("depositos.fechaDeposito"), value: fmtFechaCorta(dep.fecha) },
      { label: t("depositos.colReferencia"), value: dep.referencia ?? "—" },
      { label: t("depositos.periodoContableCorto"), value: mesLegible(dep.periodo) },
      {
        label: t("depositos.registro"),
        value: [dep.registrado_por, rol(dep.registrado_rol)].filter(Boolean).join(" · ") || "—",
      },
      { label: t("tx.colMonto"), value: `${fmtMoneyPdf(dep.monto, moneda)} ${moneda}` },
    ],
    2
  );
  doc.addGap(PDF_SPACE.md);

  // ---------- Desglose y movimientos ----------
  if (movs.length > 0) {
    doc.heading(t("depositos.desglose"));
    doc.keyValueGrid(
      [
        { label: t("depositos.efectivo"), value: fmtMoneyPdf(efectivo, moneda) },
        { label: t("depositos.cheques"), value: fmtMoneyPdf(cheques, moneda) },
      ],
      2
    );
    doc.addGap(PDF_SPACE.sm);

    const columnas: PdfColumn[] = [
      { label: t("tx.colFecha"), width: 70 },
      { label: t("tx.colConcepto"), width: 190 },
      { label: t("depositos.colMetodo"), width: 90 },
      { label: t("tx.colMonto"), width: 90, align: "right" },
    ];
    doc.beginTable(t("depositos.movsIncluidos"), columnas);
    for (const m of movs) {
      doc.tableRow(
        [
          fmtFechaCorta(m.fecha.slice(0, 10)),
          [m.concepto, m.member_nombre].filter(Boolean).join(" · "),
          metodoNombre(m.metodo_pago),
          fmtMoneyPdf(m.monto, moneda),
        ],
        columnas
      );
    }
    doc.totalRow(
      [t("depositos.totalContado"), "", "", fmtMoneyPdf(contado, moneda)],
      columnas
    );
    doc.endTable();
    doc.addGap(PDF_SPACE.md);

    /* La conciliación, dicha en el papel y no solo en pantalla: si lo contado
       y lo registrado no cuadran, el comprobante lo lleva escrito. Callarlo
       aquí y enseñarlo solo en la app sería esconderlo justo en la copia que
       se archiva. */
    if (contado !== dep.monto) {
      doc.paragraph(t("depositos.pdfDescuadre", {
        contado: `${fmtMoneyPdf(contado, moneda)} ${moneda}`,
        registrado: `${fmtMoneyPdf(dep.monto, moneda)} ${moneda}`,
      }));
      doc.addGap(PDF_SPACE.sm);
    }
  } else {
    /* Sin corte detrás no hay desglose, y un cero sería mentira: el dinero
       existe, lo que no se sabe es de qué movimientos vino. */
    doc.heading(t("depositos.movsIncluidos"));
    doc.paragraph(t("depositos.pdfSinCorte"));
    doc.addGap(PDF_SPACE.md);
  }

  if (dep.notas) {
    doc.heading(t("depositos.colNotas"));
    doc.paragraph(dep.notas);
    doc.addGap(PDF_SPACE.md);
  }

  /* La segunda firma del corte (migración 47), dicha en el papel con las
     palabras exactas de lo que se hizo: CONTÓ el dinero, o REVISÓ el
     registro. Son dos controles distintos y el comprobante que se archiva es
     el peor sitio para confundirlos.

     Si el corte la pidió y nadie firmó, el papel lo dice en vez de callarlo:
     un hueco silencioso se lee como que no hacía falta. */
  if (corte?.doble_firma_pedida === 1 || corte?.segunda_firma) {
    const fecha = fmtFechaCorta((corte.segunda_firma_en ?? "").slice(0, 10));
    doc.heading(t("dobleFirma.filaComprobante"));
    doc.keyValueGrid(
      [{
        label: corte.segunda_firma ?? t("dobleFirma.pdfPendiente"),
        value: !corte.segunda_firma
          ? "—"
          : corte.segunda_firma_modo === "conteo"
            ? t("dobleFirma.pdfConteo", {
                monto: `${fmtMoneyPdf((corte.segunda_conteo ?? 0) as Centavos, moneda)} ${moneda}`,
                fecha,
              })
            : t("dobleFirma.pdfRevision", { fecha }),
      }],
      1
    );
    doc.addGap(PDF_SPACE.md);
  }

  doc.addGap(75);
  /* Quien registró y quien llevó el dinero. El segundo solo aparece si hubo
     corte: en un depósito registrado a mano nadie ha dicho quién lo llevó, y
     un renglón de firma con el cargo vacío invita a que lo firme cualquiera. */
  doc.signatureBlock([
    {
      nombre: dep.registrado_por ?? church.tesorero_nombre,
      rol: rol(dep.registrado_rol) ?? church.tesorero_cargo ?? t("rol.tesorero"),
      firmaDataUrl: null,
    },
    ...(corte?.responsable
      ? [{ nombre: corte.responsable, rol: t("depositos.responsable"), firmaDataUrl: null }]
      : []),
    /* La tercera raya solo si alguien firmó. En blanco no sirve de nada aquí
       —a diferencia de un acta, que se firma a mano sobre el papel— porque
       esta firma certifica un conteo que ya pasó. */
    ...(corte?.segunda_firma
      ? [{
          nombre: corte.segunda_firma,
          rol: t("dobleFirma.filaComprobante"),
          firmaDataUrl: null,
        }]
      : []),
  ]);

  const now = new Date();
  const referencia = dep.referencia?.trim() || `${dep.fecha}`;
  const bytes = doc.finalize({
    reportId: referencia,
    fechaGeneracion: fmtFechaLarga(now),
    horaGeneracion: fmtHora12(now),
  });

  await openForPrint(bytes, `${slug(t("depositos.pdfArchivo"))}-${slug(referencia)}.pdf`);
}
