/**
 * NuevaActividadIOS.tsx — la actividad de la Agenda en el iPhone: hoja que
 * sube desde abajo y cuatro secciones de lista agrupada (qué y cuándo, quién
 * la lleva, cada cuánto se repite, y en qué estado va).
 *
 * Es el formulario más grande de la app —veintitrés campos, la mitad de ellos
 * condicionales— y no tiene estado propio: todo sale de `useActividad`, el
 * mismo hook que alimenta el modal de Mac, así que el `NewActividad` que se
 * escribe es idéntico y las seis validaciones son las mismas.
 *
 * Tres decisiones propias de esta pantalla:
 *
 * - **Los dos "checkbox" pasan a interruptores.** "Día completo" y "Fecha
 *   importante" eran casillas cuadradas de escritorio; en una lista agrupada
 *   de iOS un ajuste que se queda encendido es un switch.
 * - **Los días de la repetición y los avisos se quedan como pastillas**, no se
 *   van a otra pantalla. Son siete y cuatro opciones fijas: llevárselas fuera
 *   costaría más toques que resolverlas aquí.
 * - **El choque de horario es una alerta, no un recuadro.** En Mac se pintaba
 *   un bloque ámbar dentro del formulario; en el teléfono ese bloque quedaría
 *   por debajo del pliegue justo cuando hay que decidir. Es una decisión con
 *   consecuencias, y en iOS eso es una alerta.
 */
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import ConfirmDialog from "./ConfirmDialog";
import {
  FilaChips, FilaConteo, FilaNativa, Section, SwitchField, TextAreaField, TextField,
} from "./ios/FormularioIOS";
import { IOSPickerField } from "./ios/IOSPickerField";
import { IconWarn } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { ESTADOS_ACTIVIDAD, TIPOS_ACTIVIDAD } from "../db";
import {
  RECORDATORIOS_PRESET, REC_TIPOS,
  type CampoActividad, type useActividad,
} from "./actividad";

export default function NuevaActividadIOS({
  onClose, h,
}: { onClose: () => void; h: ReturnType<typeof useActividad> }) {
  const { t } = useTranslation();

  useEscapeClose(h.conflictos ? () => h.setConflictos(null) : onClose);

  const opc = (claves: readonly string[], pref: string) =>
    claves.map((k) => ({ value: k, label: t(`${pref}.${k}`) }));

  /** El aviso de validación, al pie de la sección donde está el campo que falta. */
  const avisoDe = (...campos: CampoActividad[]) =>
    h.error && h.campoError && campos.includes(h.campoError)
      ? <span className="ios-section-footer--error">{h.error}</span>
      : null;

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="ios-sheet nm-hoja" role="dialog" aria-label={h.titulo}>
          <span className="nm-tirador" aria-hidden="true" />

          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onClose} disabled={h.saving}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{h.titulo}</h1>
            <span className="ios-nav-status">
              <button
                type="button"
                className="ios-nav-action"
                onClick={() => h.guardar(false)}
                disabled={h.saving || h.conflictos !== null}
              >
                {h.saving ? t("common.guardando") : t("common.guardar")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body">
            <Section
              header={t("agenda.secBasica")}
              footer={avisoDe("nombre", "fecha", "horaInicio", "horaFin", "tipoPersonalizado")}
            >
              <TextField
                label={t("agenda.nombre")}
                value={h.nombre}
                onChange={h.setNombre}
                placeholder={t("agenda.nombrePlaceholder")}
                stacked
                autoFocus
              />
              <IOSPickerField
                label={t("agenda.tipo")}
                sheetTitle={t("agenda.tipo")}
                options={opc(TIPOS_ACTIVIDAD, "agenda.tipos")}
                value={h.tipo}
                onSelect={h.setTipo}
              />
              {h.tipo === "otra" && (
                <TextField
                  label={t("agenda.tipoPersonalizado")}
                  value={h.tipoPersonalizado}
                  onChange={h.setTipoPersonalizado}
                  placeholder={t("agenda.tipoPersonalizadoPlaceholder")}
                  stacked
                />
              )}
              <FilaNativa label={t("agenda.fecha")} tipo="date" valor={h.fecha} onChange={h.setFecha} />
              <SwitchField label={t("agenda.diaCompleto")} checked={h.diaCompleto} onChange={h.setDiaCompleto} />
              {!h.diaCompleto && (
                <>
                  <FilaNativa label={t("agenda.horaInicio")} tipo="time" valor={h.horaInicio} onChange={h.setHoraInicio} />
                  <FilaNativa label={t("agenda.horaFin")} tipo="time" valor={h.horaFin} onChange={h.setHoraFin} />
                </>
              )}
              <TextField label={t("agenda.lugar")} value={h.lugar} onChange={h.setLugar} placeholder={t("common.opcional")} />
              <TextAreaField
                label={t("agenda.descripcion")}
                value={h.descripcion}
                onChange={h.setDescripcion}
                placeholder={t("common.opcional")}
              />
            </Section>

            <Section header={t("agenda.secResponsabilidad")}>
              <IOSPickerField
                label={t("agenda.responsable")}
                sheetTitle={t("agenda.responsable")}
                options={h.opcResponsable}
                value={h.responsableMemberId}
                onSelect={h.setResponsableMemberId}
              />
              {h.responsableMemberId === "externa" && (
                <TextField
                  label={t("agenda.responsablePersona")}
                  value={h.responsablePersona}
                  onChange={h.setResponsablePersona}
                  placeholder={t("agenda.responsablePersonaPlaceholder")}
                  stacked
                />
              )}
              <TextField label={t("agenda.ministerio")} value={h.responsableMinisterio} onChange={h.setResponsableMinisterio} placeholder={t("common.opcional")} />
              <TextField label={t("agenda.invitado")} value={h.invitado} onChange={h.setInvitado} placeholder={t("common.opcional")} />
              <TextField label={t("agenda.contacto")} value={h.contacto} onChange={h.setContacto} placeholder={t("common.opcional")} stacked />
            </Section>

            {h.mostrarRecurrencia && (
              <Section header={t("agenda.secRepeticion")} footer={avisoDe("recHasta")}>
                <IOSPickerField
                  label={t("agenda.repeticion")}
                  sheetTitle={t("agenda.repetir")}
                  options={opc(REC_TIPOS, "agenda.rec")}
                  value={h.recTipo}
                  onSelect={(v) => h.setRecTipo(v as typeof h.recTipo)}
                />
                {h.recTipo === "personalizada" && (
                  <FilaConteo label={t("agenda.cadaNSemanas")} valor={h.recIntervalo} min={1} onChange={h.setRecIntervalo} />
                )}
                {h.muestraDias && (
                  <FilaChips
                    label={t("agenda.diasRepeticion")}
                    opciones={h.diasSemana.map((d, i) => ({ valor: i, etiqueta: d }))}
                    activos={h.recDias}
                    onToggle={h.toggleDia}
                  />
                )}
                {h.recTipo !== "ninguna" && (
                  <IOSPickerField
                    label={t("agenda.finRepeticion")}
                    sheetTitle={t("agenda.termina")}
                    options={h.opcRecFin}
                    value={h.recFinTipo}
                    onSelect={(v) => h.setRecFinTipo(v as typeof h.recFinTipo)}
                  />
                )}
                {h.recTipo !== "ninguna" && h.recFinTipo === "hasta" && (
                  <FilaNativa label={t("agenda.finFecha")} tipo="date" valor={h.recHasta} min={h.fecha || undefined} onChange={h.setRecHasta} />
                )}
                {h.recTipo !== "ninguna" && h.recFinTipo === "conteo" && (
                  <FilaConteo label={t("agenda.finVeces")} valor={h.recConteo} min={1} onChange={h.setRecConteo} />
                )}
              </Section>
            )}

            <Section header={t("agenda.secEstado")}>
              <IOSPickerField
                label={t("agenda.estado")}
                sheetTitle={t("membresia.colEstado")}
                options={opc(ESTADOS_ACTIVIDAD, "agenda.estados")}
                value={h.estado}
                onSelect={h.setEstado}
              />
              <SwitchField
                label={t("agenda.esFechaImportante")}
                checked={h.esFechaImportante}
                onChange={h.setEsFechaImportante}
              />
              {/* El pie dice qué es y qué NO es: el aviso solo se pinta en la
                  lista de Agenda, no hay correo ni notificación del sistema.
                  Sin esa línea, quien marca "un día antes" espera algo que no
                  llega y se entera el día que se le pasa la reunión. */}
              <FilaChips
                label={t("agenda.recordatorios")}
                opciones={RECORDATORIOS_PRESET.map((r) => ({ valor: r.offset, etiqueta: t(`agenda.recordatorio.${r.clave}`) }))}
                activos={h.recordatorios}
                onToggle={h.toggleRecordatorio}
                pie={t("agenda.recordatoriosHint")}
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

      {h.conflictos && h.conflictos.length > 0 && (
        <ConfirmDialog
          title={t("agenda.conflictoTitulo")}
          /* `.confirm-message` respeta los saltos de línea (`pre-line`), así
             que cada choque va en su renglón y se leen de un vistazo. */
          message={`${t("agenda.conflictoSub")}\n\n${h.conflictos.map((c) => `· ${c.nombre} — ${c.detalle}`).join("\n")}`}
          confirmLabel={t("agenda.conflictoGuardar")}
          danger
          onConfirm={() => h.guardar(true)}
          onCancel={() => h.setConflictos(null)}
        />
      )}
    </Portal>
  );
}
