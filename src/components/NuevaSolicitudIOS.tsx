/**
 * NuevaSolicitudIOS.tsx — la solicitud de carta en el iPhone: hoja que sube
 * desde abajo y tres secciones de lista agrupada (quién la pide, cómo se
 * gestiona, en qué estado va).
 *
 * No tiene estado propio: todo sale de `useSolicitud`, el mismo hook que
 * alimenta el modal de Mac, así que el `NewSolicitud` que se escribe es
 * idéntico y las tres validaciones son las mismas.
 *
 * Tres decisiones que conviene saber antes de tocar esto:
 *
 * - **El miembro se elige con un buscador, no con una lista.** Es la única
 *   diferencia real con el modal de escritorio: una iglesia con trescientos
 *   miembros no se recorre con el pulgar. La hoja es la misma que ya usa
 *   "Nuevo ingreso" para el aportante.
 * - **La fecha requerida vive detrás de un interruptor.** Es opcional, y en
 *   iOS lo opcional con fecha se enseña así (Recordatorios). Apagarlo BORRA
 *   la fecha: dejarla escondida guardaría un dato que ya nadie ve.
 * - **El aviso de validación se pinta al pie de SU sección**, no todo junto al
 *   final; por eso el hook expone `campoError` además del mensaje.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import {
  FilaNativa, Section, SwitchField, TextAreaField, TextField,
} from "./ios/FormularioIOS";
import { IOSPickerField } from "./ios/IOSPickerField";
import { IOSBuscadorField } from "./ios/IOSBuscadorSheet";
import IOSSegmented from "./ios/IOSSegmented";
import { TIPOS_CARTA } from "./CartaEditor";
import { IconWarn } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import {
  ESTADOS_SOLICITUD, MEDIOS_ENTREGA, PRIORIDADES,
  type CampoSolicitud, type PropsSolicitud, type useSolicitud,
} from "./solicitud";

/** El semáforo del estado, el mismo que la lista de solicitudes pinta en su
 *  insignia: ámbar mientras espera a alguien, verde cuando ya está resuelto,
 *  rojo si se canceló. Los tres primeros estados son "en curso" y van en gris:
 *  un punto de color en todos no distinguiría nada. */
function colorEstado(estado: string): string {
  if (estado === "firma") return "var(--warn)";
  if (estado === "lista" || estado === "entregada") return "var(--pos)";
  if (estado === "cancelada") return "var(--ios-red)";
  return "var(--text-3)";
}

export default function NuevaSolicitudIOS({
  solicitud, onClose, h,
}: Pick<PropsSolicitud, "solicitud" | "onClose"> & { h: ReturnType<typeof useSolicitud> }) {
  const { t } = useTranslation();
  const titulo = solicitud ? solicitud.folio : t("solicitudes.nuevaSolicitud");
  /* El interruptor no es un dato: es la forma de enseñar que `fecha_requerida`
     puede no existir. Arranca encendido si la solicitud ya traía fecha. */
  const [pideFecha, setPideFecha] = useState(!!h.fechaRequerida);

  useEscapeClose(onClose);

  const opc = (claves: readonly string[], pref: string) =>
    claves.map((k) => ({ value: k, label: t(`${pref}.${k}`) }));

  /** El aviso de validación, al pie de la sección donde está el campo que falta. */
  const avisoDe = (...campos: CampoSolicitud[]) =>
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

          <div className="ios-sheet-body">
            <div className="sol-tipo">
              <IOSSegmented
                options={[
                  { value: "miembro" as const, label: t("cartas.miembro") },
                  { value: "externo" as const, label: t("cartas.destinatario.externo") },
                ]}
                value={h.esMiembro ? "miembro" : "externo"}
                onChange={(v) => h.setEsMiembro(v === "miembro")}
              />
            </div>

            <Section header={t("solicitudes.secSolicitante")} footer={avisoDe("solicitante")}>
              {h.esMiembro ? (
                <IOSBuscadorField
                  label={t("cartas.miembro")}
                  valor={h.nombreMiembro}
                  vacio={t("cartas.eligeMiembro")}
                  title={t("cartas.miembro")}
                  placeholder={t("common.buscarMiembroCorto")}
                  opciones={h.members.map((m) => ({
                    id: String(m.id),
                    titulo: m.nombre,
                    sub: m.telefono || m.email || null,
                  }))}
                  seleccionado={h.memberId === null ? null : String(h.memberId)}
                  onElegir={(o) => h.setMemberId(Number(o.id))}
                  onLimpiar={h.memberId === null ? undefined : () => h.setMemberId(null)}
                />
              ) : (
                <TextField
                  label={t("solicitudes.personaExterna")}
                  value={h.externo}
                  onChange={h.setExterno}
                  placeholder={t("solicitudes.nombrePlaceholder")}
                />
              )}
              <IOSPickerField
                label={t("cartas.tipoCarta")}
                sheetTitle={t("cartas.tipoCarta")}
                options={opc(TIPOS_CARTA, "cartas.tipoDoc")}
                value={h.tipoCarta}
                onSelect={h.setTipoCarta}
              />
              <TextAreaField
                label={t("solicitudes.motivo")}
                value={h.motivo}
                onChange={h.setMotivo}
                placeholder={t("solicitudes.motivoPlaceholder")}
              />
            </Section>

            <Section header={t("solicitudes.secGestion")} footer={avisoDe("fechaSolicitud", "fechaRequerida")}>
              <FilaNativa
                label={t("solicitudes.fechaSolicitud")}
                tipo="date"
                valor={h.fechaSolicitud}
                onChange={h.setFechaSolicitud}
              />
              <SwitchField
                label={t("solicitudes.fechaRequerida")}
                checked={pideFecha}
                onChange={(v) => { setPideFecha(v); if (!v) h.setFechaRequerida(""); }}
              />
              {pideFecha && (
                <FilaNativa
                  label={t("solicitudes.paraElDia")}
                  tipo="date"
                  valor={h.fechaRequerida}
                  onChange={h.setFechaRequerida}
                />
              )}
              <IOSPickerField
                label={t("solicitudes.medioEntrega")}
                sheetTitle={t("solicitudes.medioEntrega")}
                options={opc(MEDIOS_ENTREGA, "solicitudes.medio")}
                value={h.medio}
                onSelect={h.setMedio}
              />
              <TextField
                label={t("solicitudes.responsable")}
                value={h.responsable}
                onChange={h.setResponsable}
                placeholder={t("solicitudes.responsablePlaceholder")}
              />
            </Section>

            <Section header={t("solicitudes.secEstado")} footer={t("solicitudes.observacionesPie")}>
              <IOSPickerField
                label={t("solicitudes.prioridad")}
                sheetTitle={t("solicitudes.prioridad")}
                options={opc(PRIORIDADES, "solicitudes.prioridadOpcion")}
                value={h.prioridad}
                onSelect={h.setPrioridad}
              />
              <IOSPickerField
                label={t("membresia.colEstado")}
                sheetTitle={t("membresia.colEstado")}
                options={ESTADOS_SOLICITUD.map((k) => ({
                  value: k,
                  label: t(`solicitudes.estado.${k}`),
                  color: colorEstado(k),
                }))}
                value={h.estado}
                onSelect={h.setEstado}
              />
              <TextAreaField
                label={t("cartas.observaciones")}
                value={h.observaciones}
                onChange={h.setObservaciones}
                placeholder={t("solicitudes.observacionesPlaceholder")}
              />
            </Section>

            {/* Red de seguridad: si algún día una validación nueva no dijera de
                qué campo es, el aviso se seguiría viendo en vez de perderse. */}
            {h.error && !h.campoError && (
              <p className="nm-aviso" role="alert"><IconWarn size={14} /> {h.error}</p>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
