/**
 * NuevoTrasladoSalidaIOS.tsx — el traslado de salida en el iPhone: hoja que
 * sube desde abajo y cuatro secciones de lista agrupada (quién se traslada,
 * a dónde va, cómo avanza el proceso, y la carta que sale de él).
 *
 * No tiene estado propio: todo sale de `useTrasladoSalida`, el mismo hook que
 * alimenta el modal de Mac, así que el `NewTrasladoSalida` que se escribe es
 * idéntico y las cuatro validaciones son las mismas.
 *
 * Es el gemelo de `NuevoTrasladoIOS` (el de entrada) y comparte sus dos
 * decisiones: buscador para elegir al miembro —una iglesia con trescientos no
 * se recorre con el pulgar— y "Cancelar" que pregunta si hay algo escrito.
 *
 * Lo propio de esta pantalla:
 *
 * - **El miembro no se puede cambiar en un traslado ya guardado.** En Mac eso
 *   era un desplegable apagado; aquí es una fila de solo lectura, porque una
 *   fila con chevron que no lleva a ningún lado se toca igual.
 * - **La carta vive en su propia sección, al final.** Es lo que SALE del
 *   proceso, y su explicación de por qué todavía no se puede generar va al
 *   pie de esa sección: en Mac era un `title` que en una pantalla táctil no
 *   revela nadie.
 */
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import ActionSheet from "./ActionSheet";
import ConfirmDialog from "./ConfirmDialog";
import {
  ActionField, FilaNativa, Section, SwitchField, TextAreaField, TextField,
} from "./ios/FormularioIOS";
import { IOSPickerField } from "./ios/IOSPickerField";
import { IOSBuscadorField } from "./ios/IOSBuscadorSheet";
import { IconWarn } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import {
  ESTADOS_TS, type CampoTS, type PropsTrasladoSalida, type useTrasladoSalida,
} from "./trasladoSalida";

export default function NuevoTrasladoSalidaIOS({
  traslado, onAbrirCarta, h,
}: Pick<PropsTrasladoSalida, "traslado" | "onAbrirCarta"> & { h: ReturnType<typeof useTrasladoSalida> }) {
  const { t } = useTranslation();
  const titulo = traslado ? traslado.folio : t("traslados.nuevoSalida");

  useEscapeClose(h.pedirCerrar);

  /** El aviso de validación, al pie de la sección donde está el campo que falta. */
  const avisoDe = (...campos: CampoTS[]) =>
    h.error && h.campoError && campos.includes(h.campoError)
      ? <span className="ios-section-footer--error">{h.error}</span>
      : null;

  /** Por qué "Generar carta" está apagado. Vacío cuando sí se puede. */
  const porQueNoCarta = h.cartaId
    ? null
    : !traslado
      ? t("traslados.guardaPrimero")
      : !h.puedeGenerarCarta
        ? t("traslados.generarRequiereAprobado")
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
              <button type="button" className="ios-nav-action" onClick={h.guardar} disabled={h.saving}>
                {h.saving ? t("common.guardando") : t("common.guardar")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body">
            <Section header={t("traslados.secMiembro")} footer={avisoDe("miembro", "fechaSolicitud")}>
              {h.miembroFijo ? (
                /* Solo lectura: ni botón ni chevron. Una fila con chevron que
                   no lleva a ningún lado se toca igual y no pasa nada. */
                <div className="ios-field">
                  <span className="ios-field-label">{t("cartas.miembro")}</span>
                  <span className="ios-field-value">{h.miembro?.nombre ?? "—"}</span>
                </div>
              ) : (
                <IOSBuscadorField
                  label={t("cartas.miembro")}
                  valor={h.miembro?.nombre ?? ""}
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
              )}
              <FilaNativa
                label={t("solicitudes.fechaSolicitud")}
                tipo="date"
                valor={h.fechaSolicitud}
                onChange={h.setFechaSolicitud}
              />
              <TextField
                label={t("solicitudes.motivo")}
                value={h.motivo}
                onChange={h.setMotivo}
                placeholder={t("common.opcional")}
                stacked
              />
            </Section>

            <Section header={t("traslados.secDestino")} footer={avisoDe("iglesiaDestino")}>
              <TextField label={t("traslados.iglesiaDestino")} value={h.iglesiaDestino} onChange={h.setIglesiaDestino} stacked />
              <TextField label={t("traslados.pastorReceptor")} value={h.pastorReceptor} onChange={h.setPastorReceptor} />
              <TextField
                label={t("institucion.direccion")}
                value={h.direccion}
                onChange={h.setDireccion}
                placeholder={t("traslados.calleCiudad")}
                stacked
              />
              <TextField label={t("iglesia.ciudad")} value={h.ciudad} onChange={h.setCiudad} />
              <TextField label={t("institucion.region")} value={h.region} onChange={h.setRegion} />
              <TextField label={t("iglesia.pais")} value={h.pais} onChange={h.setPais} />
              {/* "(opcional)" de marcador y no pegado a la etiqueta: con
                  "Correo electrónico (opcional)" no queda sitio para el valor. */}
              <TextField label={t("tesorero.telefono")} value={h.telefono} onChange={h.setTelefono} inputMode="tel" placeholder={t("common.opcional")} />
              {/* Este correo sí va apilado, a diferencia del de la persona en
                  el traslado de entrada: es el de una iglesia, y medido con
                  uno normal ("nuevavida@ejemplo.com") se sale de la fila ya en
                  375 px — un iPhone SE o un 13 mini de hoy, no un teléfono
                  viejo. Un `input` no recorta con puntos suspensivos: el texto
                  se corta a media letra y sin avisar. */}
              <TextField label={t("tesorero.correo")} value={h.email} onChange={h.setEmail} inputMode="email" placeholder={t("common.opcional")} stacked />
            </Section>

            <Section header={t("traslados.secProceso")} footer={avisoDe("fechaConfirmacion")}>
              <IOSPickerField
                label={t("membresia.colEstado")}
                sheetTitle={t("membresia.colEstado")}
                options={ESTADOS_TS.map((k) => ({ value: k, label: t(`traslados.estadoTS.${k}`) }))}
                value={h.estado}
                onSelect={h.setEstado}
              />
              <FilaNativa label={t("actas.fechaAprobacion")} tipo="date" valor={h.fechaAprobacion} onChange={h.setFechaAprobacion} />
              <TextField label={t("traslados.aprobadoPor")} value={h.aprobadoPor} onChange={h.setAprobadoPor} />
              <FilaNativa label={t("cartas.fechaEntrega")} tipo="date" valor={h.fechaEntrega} onChange={h.setFechaEntrega} />
              <IOSPickerField
                label={t("traslados.metodoEntrega")}
                sheetTitle={t("traslados.metodoEntrega")}
                options={h.opcMetodoEntrega}
                value={h.metodoEntrega}
                placeholder="—"
                onSelect={h.setMetodoEntrega}
              />
              {/* Etiqueta corta: la fila de un switch encoge y trunca su
                  etiqueta para que el switch no se caiga de la tarjeta (regla
                  documentada en styles.css), y "…de la otra iglesia" se
                  perdía justo en la parte que dice de qué confirmación
                  hablamos. En Mac cabe entera y se queda la larga. */}
              <SwitchField
                label={t("traslados.confirmacionCorta")}
                checked={h.confirmacion}
                onChange={(v) => { h.setConfirmacion(v); if (!v) h.setFechaConfirmacion(""); }}
              />
              {h.confirmacion && (
                <FilaNativa
                  label={t("traslados.fechaConfirmacion")}
                  tipo="date"
                  valor={h.fechaConfirmacion}
                  min={h.fechaEntrega || undefined}
                  onChange={h.setFechaConfirmacion}
                />
              )}
              <TextAreaField
                label={t("cartas.observaciones")}
                value={h.observaciones}
                onChange={h.setObservaciones}
                placeholder={t("traslados.notasPlaceholder")}
              />
            </Section>

            <Section header={t("traslados.cartaVinculada")} footer={porQueNoCarta}>
              {h.cartaId ? (
                <ActionField label={t("traslados.abrirCartaVinculada")} onPress={() => onAbrirCarta(h.cartaId!)} />
              ) : (
                <ActionField
                  label={t("traslados.generarCarta")}
                  onPress={h.generarCarta}
                  disabled={!h.puedeGenerarCarta || !traslado || h.saving}
                />
              )}
            </Section>

            {/* No bloquea el guardado: el traslado ya se escribió. */}
            {h.aviso && (
              <p className="nm-aviso" role="alert"><IconWarn size={14} /> {h.aviso}</p>
            )}

            {/* Red de seguridad: si algún día una validación nueva no dijera de
                qué campo es, el aviso se seguiría viendo en vez de perderse. */}
            {h.error && !h.campoError && (
              <p className="nm-aviso" role="alert"><IconWarn size={14} /> {h.error}</p>
            )}
          </div>
        </div>
      </div>

      {h.confirmClose && (
        <ActionSheet
          title={t("common.descartarCambiosTitulo")}
          message={t("common.descartarCambiosMensaje")}
          options={[{ label: t("common.descartarCambiosBtn"), danger: true, onClick: h.onCerrarDeVerdad }]}
          onCancel={() => h.setConfirmClose(false)}
        />
      )}

      {h.confirmTrasladado !== null && (
        <ConfirmDialog
          title={t("traslados.trasladadoTitulo")}
          message={t("traslados.trasladadoMensaje", { nombre: h.miembro?.nombre ?? "" })}
          confirmLabel={t("traslados.cambiarATrasladado")}
          onConfirm={h.marcarTrasladado}
          onCancel={() => { h.setConfirmTrasladado(null); h.onCerrarDeVerdad(); }}
        />
      )}
    </Portal>
  );
}
