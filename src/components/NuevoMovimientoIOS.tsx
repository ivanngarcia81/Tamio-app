/**
 * NuevoMovimientoIOS.tsx — "Nuevo ingreso / gasto" en el iPhone: hoja que sube
 * desde abajo, con el importe arriba y el resto en lista agrupada.
 *
 * No tiene estado propio. Todo sale de `useNuevoMovimiento`, el mismo hook que
 * alimenta el modal de Mac, así que guardar, la validación de fecha futura, el
 * aviso de duplicado y los recurrentes son literalmente el mismo código.
 *
 * Tres decisiones que no se ven en la pantalla:
 *
 * - **El segmentado Ingreso/Gasto se queda**, debajo de la barra y encima del
 *   importe. Se pensó en quitarlo —"ya lo eligió quien pulsó el +"— pero el
 *   "+" de Inicio abre un ingreso sin preguntar (`App.tsx`, `crearAqui`), así
 *   que desde ahí nadie ha elegido nada. Y hace un segundo trabajo: quien
 *   abre un ingreso y se da cuenta de que era un gasto cambia ahí mismo, en
 *   vez de cancelar y empezar de nuevo.
 * - **La fecha y la hora siguen siendo `input` nativos.** En WKWebView abren
 *   la rueda del sistema; sustituirlos por una hoja propia sería cambiar un
 *   control nativo por uno peor.
 * - **El aviso de duplicado va en el cuerpo**, no en la barra: es una
 *   confirmación que intercepta el guardado, y eso no cabe en un botón.
 */
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import IOSSegmented from "./ios/IOSSegmented";
import { IOSPickerField } from "./ios/IOSPickerField";
import { ActionField, Section, SwitchField, TextField } from "./ios/FormularioIOS";
import { IOSBuscadorField } from "./ios/IOSBuscadorSheet";
import {
  METODOS_PAGO, catNombre, currentMonth, fmtMoney, getCategoriasGasto, getCategoriasIngreso,
  mesesPendientesRecurrente, metodoNombre,
} from "../db";
import { CERO, multiplicar } from "../dinero";
import { rutaComprobante } from "../services/comprobantes";
import { openPath } from "@tauri-apps/plugin-opener";
import { IconWarn } from "../icons";
import { iaHabilitada } from "../ia";
import { fileNameFromPath, parseMonto, type Props, type useNuevoMovimiento } from "./nuevoMovimiento";

/** Fila de lista con un control nativo del sistema a la derecha (fecha, hora,
 *  mes). El `input` se queda: es el que abre la rueda de iOS. */
function FilaNativa({
  label, tipo, valor, max, onChange,
}: {
  label: string;
  tipo: "date" | "time" | "month";
  valor: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="ios-field">
      <span className="ios-field-label">{label}</span>
      <input
        className="ios-field-input nm-nativo"
        type={tipo}
        value={valor}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export default function NuevoMovimientoIOS({
  church, mode, onClose, h,
}: Props & { h: ReturnType<typeof useNuevoMovimiento> }) {
  const { t } = useTranslation();
  const {
    tab, setTab, saving, error, isEdit, pestanaBloqueada, titulo,
    categoria, setCategoria, subcategoria, setSubcategoria, concepto, setConcepto,
    fecha, setFecha, hora, setHora, monto, setMonto, metodo, setMetodo,
    aportanteQuery, setAportanteQuery, aportanteId, setAportanteId,
    beneficiario, setBeneficiario, beneficiarioRfc, setBeneficiarioRfc,
    constancia, setConstancia, marcarPendiente, setMarcarPendiente,
    esRecurrente, setEsRecurrente, recDesde, setRecDesde,
    comprobantePath, setComprobantePath, comprobanteEsImagen, pickComprobante,
    interpretarComprobante, iaCargando,
    descripcionOculta, descripcionOpcional, placeholderMonto, guardar,
  } = h;

  const categorias = (tab === "gasto" ? getCategoriasGasto() : getCategoriasIngreso())
    .map((c) => ({ value: c.id, label: catNombre(c.id) }));
  const metodos = METODOS_PAGO.map((m) => ({ value: m.id, label: metodoNombre(m.id) }));

  return (
    <Portal>
      <div
        className="ios-sheet-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="ios-sheet nm-hoja" role="dialog" aria-label={titulo}>
          <span className="nm-tirador" aria-hidden="true" />

          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onClose} disabled={saving}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{titulo}</h1>
            <span className="ios-nav-status">
              <button type="button" className="ios-nav-action" onClick={() => guardar(true)} disabled={saving}>
                {saving ? t("common.guardando") : t("common.guardar")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body nm-cuerpo">
            {!isEdit && !pestanaBloqueada && (
              <div className="nm-tipo">
                <IOSSegmented
                  options={[
                    { value: "ingreso" as const, label: t("recordModal.segIngreso") },
                    { value: "gasto" as const, label: t("recordModal.segGasto") },
                  ]}
                  value={tab === "gasto" ? "gasto" : "ingreso"}
                  onChange={setTab}
                />
              </div>
            )}

            {/* El importe es lo primero que se teclea, así que se abre con el
                cursor puesto y el teclado numérico ya desplegado. */}
            <div className="nm-monto">
              <input
                className="nm-monto-campo"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder={placeholderMonto}
                inputMode="decimal"
                autoFocus={!isEdit}
                aria-label={t("recordModal.monto")}
              />
              <div className="nm-monto-pie">
                {church.moneda} · {catNombre(categoria)} · {metodoNombre(metodo)}
              </div>
            </div>

            <Section header={t("recordModal.seccionDetalle")}>
              <IOSPickerField
                label={tab === "ingreso" ? t("recordModal.tipoIngreso") : t("recordModal.categoria")}
                options={categorias}
                value={categoria}
                onSelect={setCategoria}
              />
              {categoria === "otros" && (
                <TextField
                  label={t("recordModal.subcategoria")}
                  value={subcategoria}
                  onChange={setSubcategoria}
                  placeholder={t("recordModal.subcategoriaPlaceholder")}
                  optional
                />
              )}
              <FilaNativa label={t("recordModal.fecha")} tipo="date" valor={fecha} max={h.hoy} onChange={setFecha} />
              <IOSPickerField
                label={t("recordModal.metodoPago")}
                options={metodos}
                value={metodo}
                onSelect={setMetodo}
              />
              {!descripcionOculta && (
                <TextField
                  label={t("recordModal.concepto")}
                  value={concepto}
                  onChange={setConcepto}
                  optional={descripcionOpcional}
                  stacked
                  placeholder={
                    tab === "ingreso"
                      ? t("recordModal.conceptoPlaceholderIngreso")
                      : t("recordModal.conceptoPlaceholderGasto")
                  }
                />
              )}
            </Section>

            {tab === "ingreso" ? (
              <Section header={t("recordModal.aportante")} footer={t("recordModal.aportanteHint")}>
                {/* Fila que abre el buscador del padrón. El aportante no es
                    "elegir uno de una lista": puede ser un visitante que no
                    está registrado, y entonces lo que se guarda es el nombre
                    escrito (`aportanteId` en null). La hoja resuelve las dos
                    cosas — ver IOSBuscadorSheet. */}
                <IOSBuscadorField
                  label={t("recordModal.miembroFila")}
                  valor={aportanteQuery}
                  vacio={t("common.ninguno")}
                  title={t("recordModal.aportante")}
                  placeholder={t("recordModal.buscarMiembroCorto")}
                  opciones={h.members.map((m) => ({
                    id: String(m.id),
                    titulo: m.nombre,
                    sub: m.rfc || m.email || null,
                  }))}
                  seleccionado={aportanteId === null ? null : String(aportanteId)}
                  textoInicial={aportanteQuery}
                  onElegir={(o) => { setAportanteId(Number(o.id)); setAportanteQuery(o.titulo); }}
                  onTextoLibre={(tx) => { setAportanteId(null); setAportanteQuery(tx); }}
                  etiquetaTextoLibre={(tx) => t("recordModal.anotarVisitante", { nombre: tx })}
                  onLimpiar={() => { setAportanteId(null); setAportanteQuery(""); }}
                />
                <SwitchField
                  label={t("recordModal.constanciaCorta")}
                  checked={constancia}
                  onChange={setConstancia}
                />
              </Section>
            ) : (
              <Section header={t("recordModal.beneficiario")}>
                <TextField
                  label={t("recordModal.beneficiario")}
                  value={beneficiario}
                  onChange={setBeneficiario}
                  placeholder={t("recordModal.beneficiarioPlaceholder")}
                  stacked
                />
                <TextField
                  label={t("recordModal.rfc")}
                  value={beneficiarioRfc}
                  onChange={setBeneficiarioRfc}
                  placeholder={t("recordModal.rfcBeneficiarioPlaceholder")}
                  optional
                  stacked
                />
              </Section>
            )}

            {/* El "?" del pie de escritorio era un tooltip, que en táctil no
                existe: esa frase pasa a pie de sección, donde se lee. */}
            <Section header={t("recordModal.seccionMas")} footer={t("common.camposOpcionales")}>
              {!isEdit && (
                <SwitchField
                  label={t("recurrente.siRecurrente")}
                  checked={esRecurrente}
                  onChange={setEsRecurrente}
                />
              )}
              {esRecurrente && !isEdit && (
                <FilaNativa
                  label={t("recurrente.desdeLabel")}
                  tipo="month"
                  valor={recDesde || fecha.slice(0, 7)}
                  max={fecha.slice(0, 7)}
                  onChange={setRecDesde}
                />
              )}
              <FilaNativa label={t("recordModal.hora")} tipo="time" valor={hora} onChange={setHora} />
              {comprobantePath ? (
                <>
                  <button
                    type="button"
                    className="ios-field ios-field--link"
                    onClick={async () => { if (comprobantePath) await openPath(await rutaComprobante(comprobantePath)); }}
                  >
                    <span className="ios-field-label">{t("tx.comprobante")}</span>
                    <span className="ios-field-value">{fileNameFromPath(comprobantePath)}</span>
                  </button>
                  {iaHabilitada && comprobanteEsImagen && !isEdit && (
                    <ActionField
                      label={t("recordModal.ia.leerComprobante")}
                      onPress={interpretarComprobante}
                      disabled={iaCargando}
                    />
                  )}
                  <ActionField
                    label={t("common.quitar")}
                    onPress={() => setComprobantePath(null)}
                    destructive
                  />
                </>
              ) : (
                <ActionField label={t("recordModal.adjuntarComprobante")} onPress={pickComprobante} />
              )}
              <TextField
                label={t("recordModal.notas")}
                value={h.detalle}
                onChange={h.setDetalle}
                placeholder={t("recordModal.notasPlaceholder")}
                optional
                stacked
              />
              {tab === "gasto" && (
                <SwitchField
                  label={t("recordModal.marcarPendienteCorto")}
                  checked={marcarPendiente}
                  onChange={setMarcarPendiente}
                />
              )}
            </Section>

            {/* Vista previa honesta de lo que hará el recurrente al guardar:
                los mismos meses y el mismo total que enseña el modal. */}
            {esRecurrente && !isEdit && (() => {
              const { meses } = mesesPendientesRecurrente(recDesde || fecha.slice(0, 7), null, currentMonth());
              const montoNum = parseMonto(monto);
              return (
                <p className="nm-nota">
                  {meses.length > 0
                    ? t("recurrente.previewMeses", {
                        count: meses.length,
                        rango: meses.length === 1 ? meses[0] : `${meses[0]} → ${meses[meses.length - 1]}`,
                        monto: fmtMoney(montoNum ?? CERO),
                        total: fmtMoney(multiplicar(montoNum ?? CERO, meses.length)),
                      })
                    : t("recurrente.previewSinMeses")}
                </p>
              );
            })()}

            {error && (
              <p className="nm-aviso" role="alert">
                <IconWarn size={14} /> {error}
              </p>
            )}

            {!isEdit && mode.kind === "create" && (
              <Section>
                <ActionField
                  label={t("recordModal.guardarYAgregarOtro")}
                  onPress={() => guardar(false)}
                  disabled={saving}
                />
              </Section>
            )}

          </div>
        </div>
      </div>
    </Portal>
  );
}
