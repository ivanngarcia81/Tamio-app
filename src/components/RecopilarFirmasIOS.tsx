/**
 * RecopilarFirmasIOS.tsx — la hoja de **"Recopilar firmas"** del acta
 * (migración 44).
 *
 * El botón llevaba desde el handoff 1 dibujado y apagado. Lo que le faltaba
 * no era una pantalla: era la columna. El acta sabía QUIÉNES firman —quien
 * preside, quien redacta y, desde la migración 41, el testigo— pero no si
 * habían firmado ni cuándo, así que un acta aprobada y firmada por los tres
 * no se distinguía de una que sigue dando vueltas.
 *
 * Qué hace esta hoja, y qué NO hace:
 *
 *  - **Recoge una constancia, no una firma digital.** Se marca que fulano ya
 *    firmó el papel y en qué fecha. Es la misma decisión que Iván tomó en los
 *    cortes —constancia, no acuse— y por el mismo motivo: quien firma un acta
 *    de asamblea lo hace con un bolígrafo, delante de la mesa, y pedirle que
 *    entre en la app a confirmarlo convertiría un trámite de un minuto en uno
 *    de tres días.
 *  - **No inventa firmantes.** Solo aparecen los renglones que el acta tiene
 *    con nombre. Un renglón de "Testigo" en blanco se sigue imprimiendo para
 *    firmarlo a mano, pero aquí no se puede marcar: no se recoge la firma de
 *    alguien que todavía no es nadie.
 *
 * La fecha se propone —hoy— y se puede cambiar: las actas se firman el día de
 * la reunión y se capturan el martes siguiente.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import { FilaNativa, Section } from "./ios/FormularioIOS";
import { hoyISO, ROLES_FIRMA_ACTA, type Acta, type ActaFirma } from "../db";
import { useEscapeClose } from "../hooks/useEscapeClose";

interface Props {
  acta: Acta;
  /** Las firmas ya recogidas, tal como están guardadas. */
  firmas: ActaFirma[];
  onGuardar: (v: ActaFirma[]) => void;
  onClose: () => void;
}

/** El nombre que el acta tiene para ese renglón, o null si está en blanco. */
function nombreDe(acta: Acta, rol: string): string | null {
  if (rol === "preside") return acta.preside;
  if (rol === "secretario") return acta.secretario;
  return acta.testigo;
}

export default function RecopilarFirmasIOS({ acta, firmas, onGuardar, onClose }: Props) {
  const { t } = useTranslation();
  const titulo = t("actas.recopilarFirmas");
  useEscapeClose(onClose);

  /* Se edita sobre una COPIA y se confirma con "Listo", como la hoja de
     nombres de los presentes: marcar tres casillas y darse cuenta de que era
     el acta equivocada tiene que poder deshacerse de una vez. */
  const [borrador, setBorrador] = useState<ActaFirma[]>(() =>
    ROLES_FIRMA_ACTA.map((rol) => {
      const previa = firmas.find((f) => f.rol === rol);
      return previa ?? { rol, firmado: false, fecha: null };
    })
  );

  const cambiar = (rol: string, cambio: Partial<ActaFirma>) =>
    setBorrador((v) => v.map((f) => (f.rol === rol ? { ...f, ...cambio } : f)));

  /** Firmar pone la fecha de hoy si no había ninguna; desfirmar la borra —
   *  una fecha de firma sin firma es un dato que no significa nada. */
  const alternar = (rol: string, firmado: boolean) =>
    cambiar(rol, { firmado, fecha: firmado ? (borrador.find((f) => f.rol === rol)?.fecha ?? hoyISO()) : null });

  /* Solo se guardan las que dicen algo. Una fila "no ha firmado, sin fecha"
     es exactamente lo mismo que su ausencia, y guardarla llenaría el JSON de
     ruido que después hay que filtrar en cada lectura. */
  const guardar = () => onGuardar(borrador.filter((f) => f.firmado));

  const conNombre = ROLES_FIRMA_ACTA.filter((rol) => !!nombreDe(acta, rol));
  const sinNombre = ROLES_FIRMA_ACTA.filter((rol) => !nombreDe(acta, rol));

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="ios-sheet nm-hoja" role="dialog" aria-label={titulo}>
          <span className="nm-tirador" aria-hidden="true" />

          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onClose}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{titulo}</h1>
            <span className="ios-nav-status">
              <button type="button" className="ios-nav-action" onClick={guardar}>
                {t("common.listo")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body nm-cuerpo">
            <p className="nm-aviso nm-aviso--info" role="note">{t("actas.firmasQueEs")}</p>

            {conNombre.length === 0 ? (
              <Section>
                <div className="ios-field">
                  <span className="ios-field-label">{t("actas.firmasSinFirmantes")}</span>
                </div>
              </Section>
            ) : (
              conNombre.map((rol) => {
                const f = borrador.find((x) => x.rol === rol)!;
                return (
                  <Section key={rol} header={t(`actas.${rol === "preside" ? "preside" : rol === "secretario" ? "secretarioRedacta" : "testigo"}`)}>
                    <div className="ios-field">
                      <span className="ios-field-label">{nombreDe(acta, rol)}</span>
                      <span className={`ios-insignia ${f.firmado ? "es-firmado" : "es-pendiente"}`}>
                        {f.firmado ? t("cartas.firmado") : t("cartas.pendienteFirma")}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ios-field ios-field--action"
                      onClick={() => alternar(rol, !f.firmado)}
                    >
                      {f.firmado ? t("actas.marcarSinFirmar") : t("actas.marcarFirmada")}
                    </button>
                    {f.firmado && (
                      <FilaNativa
                        label={t("actas.fechaFirma")}
                        tipo="date"
                        valor={f.fecha ?? hoyISO()}
                        onChange={(v) => cambiar(rol, { fecha: v || null })}
                      />
                    )}
                  </Section>
                );
              })
            )}

            {sinNombre.length > 0 && (
              /* Los renglones que el acta imprime en blanco. Se dicen, no se
                 esconden: quien abra esta hoja buscando al testigo tiene que
                 enterarse de que el acta todavía no sabe quién es, y de dónde
                 se escribe. */
              <p className="ios-section-footer ios-pie-suelto">
                {t("actas.firmasSinNombre", {
                  roles: sinNombre
                    .map((r) => t(`actas.${r === "preside" ? "preside" : r === "secretario" ? "secretarioRedacta" : "testigo"}`))
                    .join(" · "),
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
