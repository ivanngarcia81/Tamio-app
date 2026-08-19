/**
 * NuevoDepositoIOS.tsx — el depósito bancario en el iPhone: el importe grande
 * arriba y tres secciones de lista agrupada debajo.
 *
 * No tiene estado propio: todo sale de `useDeposito`, el mismo hook que
 * alimenta el modal de Mac, así que el registro que se escribe es idéntico y
 * los cuatro avisos contables son los mismos.
 *
 * Tres decisiones propias de esta pantalla:
 *
 * - **El importe manda y va grande y centrado**, con el mismo `.nm-monto` de
 *   "Nuevo ingreso". Son las dos pantallas de Tesorería donde se teclea
 *   dinero y no tenía sentido que una fuera un titular y la otra una fila.
 * - **La cuenta se elige de las ya usadas.** No hay catálogo de cuentas en la
 *   base, así que la lista sale de los depósitos anteriores y se puede
 *   escribir una nueva. Quien deposita cada mes en la misma cuenta deja de
 *   teclearla.
 * - **Los avisos van al pie de SU sección.** Los cuatro de esta pantalla
 *   —duplicado, exceso de efectivo, período distinto, fecha futura— son la
 *   razón de ser del formulario; al final, todos juntos, no se leen.
 */
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import { ActionField, FilaNativa, Section, TextAreaField, TextField } from "./ios/FormularioIOS";
import { IOSBuscadorField } from "./ios/IOSBuscadorSheet";
import { IconWarn } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { openPath } from "@tauri-apps/plugin-opener";
import { mesLegible, type Church } from "../db";
import { rutaComprobante } from "../services/comprobantes";
import { fileNameFromPath, type CampoDeposito, type useDeposito } from "./deposito";

export default function NuevoDepositoIOS({
  church, onClose, h,
}: { church: Church; onClose: () => void; h: ReturnType<typeof useDeposito> }) {
  const { t } = useTranslation();
  const titulo = h.isEdit ? t("depositos.modalEditar") : t("depositos.modalNuevo");

  useEscapeClose(onClose);

  /** El aviso, al pie de la sección donde está el campo que lo produjo. */
  const avisoDe = (...campos: CampoDeposito[]) =>
    h.error && h.campoError && campos.includes(h.campoError)
      ? <span className="ios-section-footer--error">{h.error}</span>
      : null;

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="ios-sheet nm-hoja" role="dialog" aria-label={titulo}>
          <span className="nm-tirador" aria-hidden="true" />

          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onClose} disabled={h.saving}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{titulo}</h1>
            <span className="ios-nav-status">
              <button type="button" className="ios-nav-action" onClick={h.guardar} disabled={h.saving}>
                {h.saving ? t("common.guardando") : t("common.guardar")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body nm-cuerpo">
            <div className="nm-monto">
              <input
                className="nm-monto-campo"
                value={h.monto}
                onChange={(e) => h.onMontoChange(e.target.value)}
                placeholder={h.placeholderMonto}
                inputMode="decimal"
                autoFocus={!h.isEdit}
                aria-label={t("depositos.montoDepositado")}
              />
              <div className="nm-monto-pie">{church.moneda} · {t("depositos.heroPie")}</div>
            </div>

            <Section
              header={t("depositos.secDeposito")}
              footer={
                <>
                  {t("depositos.periodoPie")}
                  {/* No bloquea: los dos campos pueden diferir a propósito
                      (un depósito de agosto con dinero de julio). Lo que no
                      puede pasar es que difieran sin querer y el depósito
                      "desaparezca" del mes donde se ve su fecha. */}
                  {h.periodoDistinto && (
                    <span className="ios-section-footer--aviso">
                      {t("depositos.avisoPeriodoDistinto", {
                        periodo: mesLegible(h.periodo),
                        mesFecha: mesLegible(h.fecha.slice(0, 7)),
                      })}
                    </span>
                  )}
                  {avisoDe("fecha", "monto", "cuenta", "periodo")}
                </>
              }
            >
              <FilaNativa
                label={t("depositos.fechaDeposito")}
                tipo="date"
                valor={h.fecha}
                max={h.hoy}
                onChange={h.onFechaChange}
              />
              <IOSBuscadorField
                label={t("depositos.cuentaBancaria")}
                valor={h.cuentaBanco}
                vacio={t("depositos.cuentaElegir")}
                title={t("depositos.cuentaBancaria")}
                placeholder={t("depositos.cuentaBuscar")}
                opciones={h.cuentasUsadas.map((c) => ({ id: c, titulo: c }))}
                seleccionado={h.cuentasUsadas.includes(h.cuentaBanco) ? h.cuentaBanco : null}
                textoInicial={h.cuentaBanco}
                onElegir={(o) => h.setCuentaBanco(o.titulo)}
                /* Sin catálogo de cuentas, escribir una nueva es el caso
                   normal la primera vez y cada vez que la iglesia abre otra. */
                onTextoLibre={(tx) => h.setCuentaBanco(tx)}
                etiquetaTextoLibre={(tx) => t("depositos.cuentaNueva", { texto: tx })}
                onLimpiar={h.cuentaBanco ? () => h.setCuentaBanco("") : undefined}
              />
              <FilaNativa
                label={t("depositos.periodoCorrespondiente")}
                tipo="month"
                valor={h.periodo}
                max={h.hoy.slice(0, 7)}
                onChange={h.onPeriodoChange}
              />
              <TextField
                label={t("depositos.referenciaLabel")}
                value={h.referencia}
                onChange={h.setReferencia}
                placeholder={t("depositos.referenciaPlaceholder")}
                stacked
              />
            </Section>

            <Section header={t("tx.comprobante")}>
              {h.comprobantePath ? (
                <>
                  <button
                    type="button"
                    className="ios-field ios-field--link"
                    onClick={async () => { if (h.comprobantePath) await openPath(await rutaComprobante(h.comprobantePath)); }}
                  >
                    <span className="ios-field-label">{t("common.ver")}</span>
                    <span className="ios-field-value">{fileNameFromPath(h.comprobantePath)}</span>
                  </button>
                  <ActionField label={t("common.quitar")} onPress={() => h.setComprobantePath(null)} destructive />
                </>
              ) : (
                <ActionField label={t("recordModal.adjuntarComprobante")} onPress={h.pickComprobante} />
              )}
            </Section>

            {/* Sin encabezado de sección: la fila apilada ya dice "Notas" en
                su etiqueta, y ponerlo arriba además lo escribía dos veces. */}
            <Section>
              <TextAreaField
                label={t("recordModal.notas")}
                value={h.notas}
                onChange={h.setNotas}
                placeholder={t("depositos.notasPlaceholder")}
              />
            </Section>

            {/* Red de seguridad: si algún día un aviso nuevo no dijera de qué
                campo es, se seguiría viendo en vez de perderse. */}
            {h.error && !h.campoError && (
              <p className="nm-aviso" role="alert"><IconWarn size={14} /> {h.error}</p>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
