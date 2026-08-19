/**
 * NuevoTrasladoIOS.tsx — el traslado de entrada en el iPhone: hoja que sube
 * desde abajo y cuatro secciones de lista agrupada (la persona, de dónde
 * viene, la carta que trajo, y el proceso hasta aceptarla).
 *
 * No tiene estado propio: todo sale de `useTrasladoEntrada`, el mismo hook que
 * alimenta el modal de Mac, así que el `NewTrasladoEntrada` que se escribe es
 * idéntico y las dos validaciones son las mismas.
 *
 * Tres cosas que conviene saber antes de tocar esto:
 *
 * - **El adjunto es UNA fila, no cuatro botones.** Sin archivo, tocarla abre
 *   directamente el selector; con archivo, abre una hoja de acciones con
 *   Abrir / Reemplazar / Eliminar. El paquete de referencia ofrecía además
 *   "Hacer foto" y "Escanear": el proyecto no tiene plugin de cámara, así que
 *   esas dos no existen y una hoja de una sola opción no es una hoja.
 * - **Cancelar pregunta si hay algo escrito**, como en el culto. Es lo que
 *   hace iOS con un formulario a medias, y evita perder veinte campos por un
 *   toque en el sitio equivocado.
 * - **El aviso de validación se pinta al pie de SU sección**, no todo junto al
 *   final; por eso el hook expone `campoError` además del mensaje.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import ActionSheet from "./ActionSheet";
import ConfirmDialog from "./ConfirmDialog";
import DuplicadosTraslado from "./DuplicadosTraslado";
import {
  ActionField, FilaNativa, IosChevron, Section, TextAreaField, TextField,
} from "./ios/FormularioIOS";
import { IOSPickerField } from "./ios/IOSPickerField";
import { IconWarn } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  ESTADOS_TE, type CampoTE, type PropsTrasladoEntrada, type useTrasladoEntrada,
} from "./trasladoEntrada";

export default function NuevoTrasladoIOS({
  traslado, h,
}: Pick<PropsTrasladoEntrada, "traslado"> & { h: ReturnType<typeof useTrasladoEntrada> }) {
  const { t } = useTranslation();
  const titulo = traslado ? traslado.folio : t("traslados.nuevoEntrada");
  /** Hoja de acciones del adjunto. Solo tiene sentido cuando ya hay uno. */
  const [hojaAdjunto, setHojaAdjunto] = useState(false);

  useEscapeClose(h.pedirCerrar);

  /** El aviso de validación, al pie de la sección donde está el campo que falta. */
  const avisoDe = (...campos: CampoTE[]) =>
    h.error && h.campoError && campos.includes(h.campoError)
      ? <span className="ios-section-footer--error">{h.error}</span>
      : null;

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) h.pedirCerrar(); }}>
        <div className="ios-sheet nm-hoja" role="dialog" aria-label={titulo}>
          <span className="nm-tirador" aria-hidden="true" />

          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={h.pedirCerrar} disabled={h.saving}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{titulo}</h1>
            <span className="ios-nav-status">
              <button type="button" className="ios-nav-action" onClick={h.guardarYCerrar} disabled={h.saving}>
                {h.saving ? t("common.guardando") : t("common.guardar")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body">
            <Section header={t("traslados.secPersona")} footer={avisoDe("nombre")}>
              <TextField
                label={t("servicios.visitanteNombre")}
                value={h.nombre}
                onChange={h.setNombre}
                placeholder={t("common.requerido")}
                autoFocus={!traslado}
              />
              <FilaNativa label={t("traslados.fechaNacimiento")} tipo="date" valor={h.fechaNacimiento} onChange={h.setFechaNacimiento} />
              {/* "(opcional)" va de marcador de posición y no pegado a la
                  etiqueta: "Correo electrónico (opcional)" deja 110 px para el
                  valor y una dirección normal se sale de la fila. */}
              <TextField label={t("tesorero.telefono")} value={h.telefono} onChange={h.setTelefono} inputMode="tel" placeholder={t("common.opcional")} />
              <TextField label={t("tesorero.correo")} value={h.correo} onChange={h.setCorreo} inputMode="email" placeholder={t("common.opcional")} />
              <TextField
                label={t("traslados.direccionPersona")}
                value={h.direccion}
                onChange={h.setDireccion}
                placeholder={t("traslados.calleCiudad")}
                stacked
              />
            </Section>

            <Section header={t("traslados.secProcedencia")}>
              <TextField
                label={t("traslados.iglesiaProcedencia")}
                value={h.iglesiaProcedencia}
                onChange={h.setIglesiaProcedencia}
                placeholder={t("traslados.iglesiaProcedenciaPlaceholder")}
                stacked
              />
              <TextField label={t("traslados.pastorAnterior")} value={h.pastorAnterior} onChange={h.setPastorAnterior} />
              <TextField
                label={t("traslados.direccionAnterior")}
                value={h.direccionAnterior}
                onChange={h.setDireccionAnterior}
                placeholder={t("traslados.calleCiudad")}
                stacked
              />
            </Section>

            <Section
              header={t("traslados.secCartaRecibida")}
              footer={<>{t("traslados.adjuntoPie")}{avisoDe("fechaRecepcion")}</>}
            >
              <FilaNativa label={t("traslados.fechaEmisionCarta")} tipo="date" valor={h.fechaEmisionCarta} onChange={h.setFechaEmisionCarta} />
              <FilaNativa
                label={t("traslados.fechaRecepcion")}
                tipo="date"
                valor={h.fechaRecepcion}
                min={h.fechaEmisionCarta || undefined}
                onChange={h.setFechaRecepcion}
              />
              <TextField label={t("traslados.referenciaCarta")} value={h.referenciaCarta} onChange={h.setReferenciaCarta} stacked />
              <button
                type="button"
                className="ios-field ios-field--link"
                onClick={() => (h.adjunto ? setHojaAdjunto(true) : h.elegirAdjunto())}
              >
                <span className="ios-field-label">{t("traslados.adjunto")}</span>
                <span className="ios-field-value">{h.adjunto?.nombre ?? t("traslados.adjuntoAnadir")}</span>
                <IosChevron />
              </button>
            </Section>

            <Section header={t("traslados.secProceso")} footer={t("traslados.notasPie")}>
              <FilaNativa label={t("ficha.fechaCongregacion")} tipo="date" valor={h.fechaCongregacion} onChange={h.setFechaCongregacion} />
              <FilaNativa label={t("traslados.fechaEntrevista")} tipo="date" valor={h.fechaEntrevista} onChange={h.setFechaEntrevista} />
              <TextField label={t("traslados.entrevistador")} value={h.entrevistador} onChange={h.setEntrevistador} />
              <TextField
                label={t("traslados.decision")}
                value={h.decision}
                onChange={h.setDecision}
                placeholder={t("traslados.decisionPlaceholder")}
                stacked
              />
              <FilaNativa label={t("actas.fechaAprobacion")} tipo="date" valor={h.fechaAprobacion} onChange={h.setFechaAprobacion} />
              <IOSPickerField
                label={t("membresia.colEstado")}
                sheetTitle={t("membresia.colEstado")}
                options={ESTADOS_TE.map((k) => ({ value: k, label: t(`traslados.estadoTE.${k}`) }))}
                value={h.estado}
                onSelect={h.setEstado}
              />
              <TextAreaField
                label={t("cartas.observaciones")}
                value={h.observaciones}
                onChange={h.setObservaciones}
                placeholder={t("traslados.notasPlaceholder")}
              />
            </Section>

            {/* El paso que convierte el trámite en un miembro del padrón. Solo
                cuando ya se aceptó y todavía no se ha creado a nadie. */}
            {h.estado === "aceptado" && h.memberId === null && (
              <Section>
                <ActionField label={t("traslados.crearMiembro")} onPress={h.crearMiembro} disabled={h.saving} />
              </Section>
            )}
            {h.memberId !== null && (
              <Section>
                {/* No es un botón: es el estado final del trámite, en verde,
                    igual que la etiqueta que enseña Mac. */}
                <div className="ios-field ios-field--pos">{t("traslados.miembroVinculado")}</div>
              </Section>
            )}

            {/* Red de seguridad: si algún día una validación nueva no dijera de
                qué campo es, el aviso se seguiría viendo en vez de perderse. */}
            {h.error && !h.campoError && (
              <p className="nm-aviso" role="alert"><IconWarn size={14} /> {h.error}</p>
            )}
          </div>
        </div>
      </div>

      {hojaAdjunto && h.adjunto && (
        <ActionSheet
          title={h.adjunto.nombre}
          options={[
            { label: t("traslados.adjuntoAbrir"), onClick: () => { setHojaAdjunto(false); openPath(h.adjunto!.path).catch(() => {}); } },
            { label: t("traslados.adjuntoReemplazar"), onClick: () => { setHojaAdjunto(false); h.elegirAdjunto(); } },
            { label: t("common.eliminar"), danger: true, onClick: () => { setHojaAdjunto(false); h.setConfirmQuitarAdjunto(true); } },
          ]}
          onCancel={() => setHojaAdjunto(false)}
        />
      )}

      {h.confirmQuitarAdjunto && (
        <ConfirmDialog
          title={t("traslados.adjuntoQuitarTitulo")}
          message={t("traslados.adjuntoQuitarMensaje")}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={h.quitarAdjunto}
          onCancel={() => h.setConfirmQuitarAdjunto(false)}
        />
      )}

      {h.confirmClose && (
        <ActionSheet
          title={t("common.descartarCambiosTitulo")}
          message={t("common.descartarCambiosMensaje")}
          options={[{ label: t("common.descartarCambiosBtn"), danger: true, onClick: h.onCerrarDeVerdad }]}
          onCancel={() => h.setConfirmClose(false)}
        />
      )}

      {h.duplicados && h.duplicados.length > 0 && (
        <DuplicadosTraslado
          nombre={h.nombre.trim()}
          duplicados={h.duplicados}
          onVincular={h.vincularExistente}
          onCrearIgual={h.crearMiembroConfirmado}
          onCancel={() => h.setDuplicados(null)}
        />
      )}
    </Portal>
  );
}
