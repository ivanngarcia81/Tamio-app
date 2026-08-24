/**
 * DetalleDeposito — la columna derecha del maestro-detalle de Depósitos,
 * pestaña **Depositados**.
 *
 * Rehecha con el handoff 3 (24 ago 2026), que le da la forma de una ficha de
 * depósito y no la de un formulario mirado de lejos: titular con su pastilla
 * de estado, "Compartir" y un menú de "⋯" arriba; tres cifras; y abajo dos
 * columnas —datos y movimientos a la izquierda, ficha del banco y
 * conciliación a la derecha—.
 *
 * **Lo que es real:** el titular, la cifra depositada, la cuenta, la fecha, la
 * referencia, el periodo contable, las notas y la ficha del banco
 * (`comprobante_path`, desde la migración 5). "Corregir monto o fecha" abre el
 * formulario y "Eliminar" borra con deshacer; las dos son las de siempre,
 * ahora dentro del menú donde el diseño las pone.
 *
 * **Lo que espera motor**, y por eso sale apagado con su explicación en vez de
 * desaparecer —decisión de Iván (23 ago): primero la plantilla, el dato
 * después—:
 *
 *  - **El desglose efectivo / cheques** y **"Movimientos depositados"**:
 *    `depositos_bancarios` no guarda de qué movimientos se compone un
 *    depósito. Es la misma pieza que le falta a la pestaña Pendientes para
 *    poder marcar lo ya depositado; con ella se encienden las dos.
 *  - **"Registró"**: no hay usuario en la tabla. Es el mismo "Registrado por"
 *    que §4 del rediseño ya marcó como inexistente en `transactions`.
 *  - **"Conciliación"**: no hay estado de cuenta ni nada que casar contra él.
 *  - **"Compartir"** y **"Reabrir el corte"**: la primera necesita una hoja de
 *    compartir que la app no tiene; la segunda, un estado del corte que
 *    tampoco existe.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openPath } from "@tauri-apps/plugin-opener";
import { fmtFechaCorta, fmtMoney, mesLegible, type Deposito } from "../db";
import { rutaComprobante } from "../services/comprobantes";
import { showToast } from "../toast";
import { MenuAnchor, type MenuItem } from "./MenuAnchor";
import { IconCheck, IconChevronLeft, IconClip, IconEdit, IconShare, IconTrash } from "../icons";

interface Props {
  dep: Deposito;
  /** Título de la lista de la que se vino: es el texto del botón de volver,
   *  como hace Mail con el buzón. Solo se pinta en el modo de empuje. */
  tituloLista: string;
  onVolver: () => void;
  onEditar: (dep: Deposito) => void;
  onEliminar: (dep: Deposito) => void;
  onVerComprobante: (path: string) => void;
}

export default function DetalleDeposito({ dep, tituloLista, onVolver, onEditar, onEliminar, onVerComprobante }: Props) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(false);

  const fila = (etiqueta: string, valor: string | null | undefined) =>
    valor ? (
      <div className="dep-par">
        <span>{etiqueta}</span>
        <span className="dep-par-valor">{valor}</span>
      </div>
    ) : null;

  /** Descargar es abrir el archivo con la app del sistema: es lo que ya hace
   *  el formulario, y en un iPad "abrir" y "descargar" son la misma cosa. */
  async function abrirComprobante() {
    if (!dep.comprobante_path) return;
    try {
      await openPath(await rutaComprobante(dep.comprobante_path));
    } catch (e) {
      showToast(t("common.noSePudoImprimir", { error: String(e) }));
    }
  }

  const items: MenuItem[] = [
    ...(dep.comprobante_path
      ? [
          { label: t("depositos.menuVerFicha"), onPress: () => onVerComprobante(dep.comprobante_path!) },
          { label: t("depositos.menuDescargar"), onPress: () => { void abrirComprobante(); } },
        ]
      : []),
    { label: t("depositos.menuCorregir"), onPress: () => onEditar(dep) },
    /* Sin estado del corte no hay nada que reabrir: la fila ES el depósito. */
    { label: t("depositos.menuReabrir"), disabled: true, title: t("depositos.reabrirAyuda"), onPress: () => { } },
    { label: t("common.eliminar"), destructive: true, onPress: () => onEliminar(dep) },
  ];

  return (
    <div className="dm dep-det">
      <button type="button" className="dm-volver" onClick={onVolver}>
        <IconChevronLeft size={17} strokeWidth={2.4} /> {tituloLista}
      </button>

      <div className="dep-pen-cab">
        <div className="dep-pen-titulos">
          <div className="dep-pen-linea">
            {/* El titular del handoff: el corte se nombra por su fecha. */}
            <h1 className="dm-titular">{t("depositos.corteDel", { fecha: fmtFechaCorta(dep.fecha) })}</h1>
            <span className="dep-chip dep-chip--hecho">
              <IconCheck size={12} strokeWidth={2.6} /> {t("depositos.depositadoChip")}
            </span>
          </div>
          <p className="dm-sub">
            {[dep.cuenta_banco, dep.referencia].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="dep-det-acciones">
          {/* Sin hoja de compartir en la app, el botón se pinta y se apaga con
              su explicación. Cuando exista, solo se le quita el `disabled`. */}
          <button type="button" className="btn secondary" disabled title={t("depositos.compartirAyuda")}>
            <IconShare size={14} strokeWidth={2} /> {t("depositos.compartir")}
          </button>
          <MenuAnchor
            open={menu}
            onOpenChange={setMenu}
            ariaLabel={t("depositos.accionesAria")}
            button={<span className="dep-det-puntos" aria-hidden="true">···</span>}
            items={items}
          />
        </div>
      </div>

      {/* Las tres cifras del corte. "Depositado" es real —es el monto—; el
          reparto entre efectivo y cheques necesita saber QUÉ movimientos
          entraron, y eso todavía no se guarda. Se dibuja el hueco en su sitio. */}
      <div className="dep-cifras">
        <div className="dep-cifra dep-cifra--sinmotor" title={t("depositos.sinDesgloseAyuda")}>
          <span className="dep-cifra-et">{t("depositos.efectivo")}</span>
          <span className="dep-cifra-val">{t("detalleMiembro.sinCapturar")}</span>
        </div>
        <div className="dep-cifra dep-cifra--sinmotor" title={t("depositos.sinDesgloseAyuda")}>
          <span className="dep-cifra-et">{t("depositos.cheques")}</span>
          <span className="dep-cifra-val">{t("detalleMiembro.sinCapturar")}</span>
        </div>
        <div className="dep-cifra">
          <span className="dep-cifra-et">{t("depositos.depositadoChip")}</span>
          <span className="dep-cifra-val dep-cifra-val--total">{fmtMoney(dep.monto)}</span>
          <span className="dep-cifra-pie">{dep.moneda}</span>
        </div>
      </div>

      <div className="dep-cuerpo">
        <div className="dep-col">
          <section className="dep-carta">
            <h2 className="dep-carta-cab">{t("depositos.datosDelDeposito")}</h2>
            {fila(t("depositos.colCuenta"), dep.cuenta_banco)}
            {fila(t("depositos.fechaDeposito"), fmtFechaCorta(dep.fecha))}
            {fila(t("depositos.colReferencia"), dep.referencia)}
            {/* El único campo de esta tarjeta que no existe en la tabla. */}
            <div className="dep-par dep-par--sinmotor" title={t("depositos.responsableSinMotor")}>
              <span>{t("depositos.registro")}</span>
              <span className="dep-par-valor">{t("detalleMiembro.sinCapturar")}</span>
            </div>
            {fila(t("depositos.periodoContableCorto"), mesLegible(dep.periodo))}
            {fila(t("depositos.colNotas"), dep.notas)}
          </section>

          <section className="dep-carta">
            <h2 className="dep-carta-cab">{t("depositos.movsIncluidos")}</h2>
            <div className="fm-vacio fm-vacio--pendiente dep-vacio">
              <span className="fm-vacio-titulo">{t("depositos.sinMovsTitulo")}</span>
              <span className="fm-vacio-sub">{t("depositos.sinMovsSub")}</span>
            </div>
          </section>
        </div>

        <div className="dep-col">
          {/* "Ficha de depósito": esta sí es real. Con foto se ve y se
              reemplaza; sin ella, el recuadro punteado del diseño invita a
              usar la cámara — que es lo que hace el formulario de edición. */}
          <section className="dep-carta dep-carta--acolchada">
            <h2 className="dep-carta-cab dep-carta-cab--suelta">{t("depositos.ficha")}</h2>
            {dep.comprobante_path ? (
              <>
                <div className="dm-comp-hay">
                  <span className="dm-comp-icono"><IconClip size={20} strokeWidth={1.7} /></span>
                  <span className="dm-comp-archivo">{dep.comprobante_path.split(/[\\/]/).pop()}</span>
                  <span className="dm-comp-enlaces">
                    <button type="button" onClick={() => onEditar(dep)}>{t("dm.reemplazar")}</button>
                  </span>
                </div>
                <button
                  type="button"
                  className="dep-ficha-grande"
                  onClick={() => onVerComprobante(dep.comprobante_path!)}
                >
                  {t("depositos.verEnGrande")}
                </button>
              </>
            ) : (
              <div className="dm-comp-falta dep-ficha-falta">
                <span className="dm-comp-falta-texto">{t("depositos.sinFicha")}</span>
                <button type="button" className="dm-comp-adjuntar" onClick={() => onEditar(dep)}>
                  {t("depositos.adjuntarFicha")}
                </button>
              </div>
            )}
          </section>

          {/* Conciliación: la tercera pieza del diseño que espera datos. No hay
              estado de cuenta contra el que casar nada. */}
          <section className="dep-carta dep-carta--acolchada">
            <h2 className="dep-carta-cab dep-carta-cab--suelta">{t("depositos.conciliacion")}</h2>
            <div className="dep-concilia" title={t("depositos.conciliacionAyuda")}>
              <span className="dep-aviso-punto dep-aviso-punto--info" aria-hidden="true">i</span>
              <span className="dep-aviso-textos">
                <span className="dep-aviso-titulo">{t("depositos.conciliacionSinTitulo")}</span>
                <span className="dep-aviso-texto">{t("depositos.conciliacionAyuda")}</span>
              </span>
            </div>
          </section>

          <p className="dep-nota">{t("pdf.notaDepositos")}</p>
        </div>
      </div>

      {/* Las dos acciones de siempre siguen a un toque, además de en el menú:
          editar es lo que más se hace con un depósito recién registrado. */}
      <div className="dep-det-pie">
        <button type="button" className="btn secondary dm-eliminar" onClick={() => onEliminar(dep)}>
          <IconTrash size={14} strokeWidth={2} /> {t("common.eliminar")}
        </button>
        <button type="button" className="btn primary" onClick={() => onEditar(dep)}>
          <IconEdit size={14} strokeWidth={2} /> {t("common.editar")}
        </button>
      </div>
    </div>
  );
}
