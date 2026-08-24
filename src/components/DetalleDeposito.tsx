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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  corteDeDeposito, fmtFechaCorta, fmtMoney, mesLegible, metodoAbr, movimientosDeDeposito,
  reabrirCorte, type Corte, type Deposito, type Tx,
} from "../db";
import { restar, sumar, type Centavos } from "../dinero";
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
  /** Recargar la pantalla: lo pide reabrir el corte, que devuelve el dinero
   *  a "entregado, sin depositar" y por tanto cambia las dos pestañas. */
  onCambiado: () => void;
}

export default function DetalleDeposito({
  dep, tituloLista, onVolver, onEditar, onEliminar, onVerComprobante, onCambiado,
}: Props) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(false);
  /* El corte que cerró este depósito, si lo hubo. De él salen el desglose,
     la lista de movimientos y la conciliación: las tres cosas que hasta la
     1.2.9 eran plantillas con su explicación. Un depósito registrado con
     "Nuevo depósito" a secas —o de antes de la migración 38— no tiene corte,
     y entonces siguen sin saberse: eso se dice, no se rellena con ceros. */
  const [corte, setCorte] = useState<Corte | null>(null);
  const [movs, setMovs] = useState<Tx[]>([]);

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      corteDeDeposito(dep.id, dep.church_id),
      movimientosDeDeposito(dep.id, dep.church_id),
    ])
      .then(([c, ms]) => { if (!cancelado) { setCorte(c); setMovs(ms); } })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [dep.id, dep.church_id]);

  const esCheque = (x: Tx) => x.metodo_pago === "cheque";
  const suma = (f: (x: Tx) => boolean): Centavos => sumar(...movs.filter(f).map((m) => m.monto));
  const efectivo = suma((m) => !esCheque(m));
  const cheques = suma(esCheque);
  const totalCorte = sumar(efectivo, cheques);
  /** La conciliación que sí se puede hacer sin el banco: lo que se contó
   *  contra lo que se registró. La diferencia es el dato útil. */
  const diferencia = restar(dep.monto, totalCorte);

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

  async function reabrir() {
    if (!corte) return;
    await reabrirCorte(corte.id, dep.church_id);
    showToast(t("depositos.toastCorteReabierto"));
    onCambiado();
  }

  const items: MenuItem[] = [
    ...(dep.comprobante_path
      ? [
          { label: t("depositos.menuVerFicha"), onPress: () => onVerComprobante(dep.comprobante_path!) },
          { label: t("depositos.menuDescargar"), onPress: () => { void abrirComprobante(); } },
        ]
      : []),
    { label: t("depositos.menuCorregir"), onPress: () => onEditar(dep) },
    /* Reabrir devuelve el corte a "entregado, sin depositar": el dinero
       vuelve a estar fuera de la caja y pendiente de llegar al banco. Sin
       corte detrás no hay nada que reabrir —la fila ES el depósito—, y
       entonces sigue apagado con su explicación. */
    corte
      ? { label: t("depositos.menuReabrir"), onPress: () => { void reabrir(); } }
      : { label: t("depositos.menuReabrir"), disabled: true, title: t("depositos.reabrirSinCorte"), onPress: () => { } },
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
        {corte ? (
          <>
            <div className="dep-cifra">
              <span className="dep-cifra-et">{t("depositos.efectivo")}</span>
              <span className="dep-cifra-val">{fmtMoney(efectivo)}</span>
            </div>
            <div className="dep-cifra">
              <span className="dep-cifra-et">
                {movs.filter(esCheque).length > 0
                  ? t("depositos.chequesConteo", { n: movs.filter(esCheque).length })
                  : t("depositos.cheques")}
              </span>
              <span className="dep-cifra-val">{fmtMoney(cheques)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="dep-cifra dep-cifra--sinmotor" title={t("depositos.sinCorteAyuda")}>
              <span className="dep-cifra-et">{t("depositos.efectivo")}</span>
              <span className="dep-cifra-val">{t("detalleMiembro.sinCapturar")}</span>
            </div>
            <div className="dep-cifra dep-cifra--sinmotor" title={t("depositos.sinCorteAyuda")}>
              <span className="dep-cifra-et">{t("depositos.cheques")}</span>
              <span className="dep-cifra-val">{t("detalleMiembro.sinCapturar")}</span>
            </div>
          </>
        )}
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
            {/* Quién se llevó el dinero SÍ se sabe si hubo corte: es su
                responsable. Quién lo REGISTRÓ en la app sigue sin saberse
                —no hay usuario en la tabla— y por eso son dos filas y no
                una: confundirlas sería atribuirle a alguien algo que no hizo. */}
            {corte?.responsable
              ? fila(t("depositos.llevado"), corte.responsable)
              : null}
            <div className="dep-par dep-par--sinmotor" title={t("depositos.responsableSinMotor")}>
              <span>{t("depositos.registro")}</span>
              <span className="dep-par-valor">{t("detalleMiembro.sinCapturar")}</span>
            </div>
            {fila(t("depositos.periodoContableCorto"), mesLegible(dep.periodo))}
            {fila(t("depositos.colNotas"), dep.notas)}
          </section>

          <section className="dep-carta">
            <h2 className="dep-carta-cab">
              <span className="dep-carta-cab-t">{t("depositos.movsIncluidos")}</span>
              {movs.length > 0 && <span>{t("tx.colMonto")}</span>}
            </h2>
            {movs.length === 0 ? (
              /* Sin corte detrás no se sabe de qué se compone, y eso no se
                 rellena con una lista vacía que parecería "no entró nada". */
              <div className="fm-vacio fm-vacio--pendiente dep-vacio">
                <span className="fm-vacio-titulo">{t("depositos.sinCorteTitulo")}</span>
                <span className="fm-vacio-sub">{t("depositos.sinCorteAyuda")}</span>
              </div>
            ) : (
              <>
                {movs.map((m) => (
                  <div key={m.id} className="dep-mov dep-mov--fijo">
                    <span className="dep-mov-check sel" aria-hidden="true">✓</span>
                    <span className="dep-mov-metodo">{metodoAbr(m.metodo_pago)}</span>
                    <span className="dep-mov-textos">
                      <span className="dep-mov-concepto">
                        {m.concepto}
                        <span className="dep-mov-folio"> · {m.id}</span>
                      </span>
                      <span className="dep-mov-sub truncate">
                        {[m.member_nombre, fmtFechaCorta(m.fecha.slice(0, 10))].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="dep-mov-monto">{fmtMoney(m.monto)}</span>
                  </div>
                ))}
                <div className="dep-carta-pie">
                  <span>{t("depositos.movsDelCorte", { count: movs.length })}</span>
                  <span className="dep-carta-pie-total">{fmtMoney(totalCorte)}</span>
                </div>
              </>
            )}
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
            {/* La conciliación que se puede hacer SIN el banco: lo que se
                contó en el corte contra lo que se registró como depositado.
                Cuadrar no demuestra que el banco lo recibió, y por eso el
                texto no lo dice; pero una diferencia sí demuestra que algo
                está mal, y eso es lo que se viene a ver. */}
            {corte ? (
              diferencia === 0 ? (
                <div className="dep-concilia">
                  <span className="dep-aviso-punto dep-aviso-punto--ok" aria-hidden="true">✓</span>
                  <span className="dep-aviso-textos">
                    <span className="dep-aviso-titulo">{t("depositos.cuadraTitulo")}</span>
                    <span className="dep-aviso-texto">
                      {t("depositos.cuadraSub", { monto: fmtMoney(totalCorte) })}
                    </span>
                  </span>
                </div>
              ) : (
                <div className="dep-concilia">
                  <span className="dep-aviso-punto dep-aviso-punto--warn" aria-hidden="true">!</span>
                  <span className="dep-aviso-textos">
                    <span className="dep-aviso-titulo">{t("depositos.noCuadraTitulo")}</span>
                    <span className="dep-aviso-texto">
                      {t("depositos.noCuadraSub", {
                        corte: fmtMoney(totalCorte),
                        deposito: fmtMoney(dep.monto),
                        diferencia: fmtMoney(diferencia < 0 ? restar(0 as Centavos, diferencia) : diferencia),
                      })}
                    </span>
                  </span>
                </div>
              )
            ) : (
              <div className="dep-concilia" title={t("depositos.conciliacionAyuda")}>
                <span className="dep-aviso-punto dep-aviso-punto--info" aria-hidden="true">i</span>
                <span className="dep-aviso-textos">
                  <span className="dep-aviso-titulo">{t("depositos.conciliacionSinTitulo")}</span>
                  <span className="dep-aviso-texto">{t("depositos.conciliacionAyuda")}</span>
                </span>
              </div>
            )}
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
