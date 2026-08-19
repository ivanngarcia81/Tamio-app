/**
 * IOSRangoFechas.tsx — un chip de filtro para el rango "desde – hasta".
 *
 * Sustituye a los dos `input type="date"` sueltos que había en la barra de
 * filtros. El problema no era el control —la rueda de iOS es la correcta—
 * sino que los dos se pintaban idénticos y sin etiqueta: dos pastillas que
 * decían "19 ago 2026" las dos, sin forma de saber cuál era el principio y
 * cuál el final. Ahora es UN chip que se lee de corrido ("19 ago – 22 ago") y
 * que al tocarlo abre una hoja donde cada fecha sí tiene su nombre.
 *
 * La hoja se ancla ABAJO, con la carrocería de `ActionSheet`, y no es una de
 * pantalla completa: los otros cuatro chips de esa misma fila abren hojas
 * ancladas abajo (`IOSPickerSheet`), y una que cubriera la pantalla entera
 * para dos filas se leería como otra cosa.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "../Portal";
import { useEscapeClose } from "../../hooks/useEscapeClose";
import { fmtFechaCorta } from "../../db";
import { IconCalendar } from "../../icons";

export default function IOSRangoFechas({
  desde, hasta, onCambiar,
}: {
  desde: string;
  hasta: string;
  onCambiar: (r: { desde: string; hasta: string }) => void;
}) {
  const { t } = useTranslation();
  const [abierta, setAbierta] = useState(false);
  const activo = !!desde || !!hasta;

  /** "19 ago – 22 ago", o solo el extremo que se puso. Sin nada, el nombre
   *  del filtro, igual que hacen los demás chips. */
  const etiqueta = !activo
    ? t("agenda.filtrarRango")
    : desde && hasta
      ? `${fmtFechaCorta(desde)} – ${fmtFechaCorta(hasta)}`
      : desde
        ? t("agenda.rangoDesdeCorto", { fecha: fmtFechaCorta(desde) })
        : t("agenda.rangoHastaCorto", { fecha: fmtFechaCorta(hasta) });

  return (
    <>
      <button type="button" className="ios-picker-chip" data-activo={activo} onClick={() => setAbierta(true)}>
        <IconCalendar size={13} strokeWidth={2} />
        <span>{etiqueta}</span>
      </button>
      {abierta && (
        <HojaRango desde={desde} hasta={hasta} onCambiar={onCambiar} onCerrar={() => setAbierta(false)} />
      )}
    </>
  );
}

function HojaRango({
  desde, hasta, onCambiar, onCerrar,
}: {
  desde: string;
  hasta: string;
  onCambiar: (r: { desde: string; hasta: string }) => void;
  onCerrar: () => void;
}) {
  const { t } = useTranslation();
  useEscapeClose(onCerrar);

  /* Se filtra en vivo, sin "Aplicar": el resultado está detrás de la hoja y
     no hay nada que confirmar. Por eso el botón de abajo dice "Listo" y no
     "Cancelar" — cerrar no deshace nada; para eso está "Quitar el rango". */
  const cambiar = (patch: { desde?: string; hasta?: string }) =>
    onCambiar({ desde, hasta, ...patch });

  return (
    <Portal>
      <div className="action-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
        <div className="action-sheet" role="dialog" aria-label={t("agenda.filtrarRango")}>
          <div className="action-sheet-head">
            <div className="action-sheet-title">{t("agenda.filtrarRango")}</div>
            <div className="action-sheet-message">{t("agenda.rangoPie")}</div>
          </div>

          <div className="action-sheet-opciones ios-rango-campos">
            <label className="ios-field">
              <span className="ios-field-label">{t("agenda.rangoDesde")}</span>
              <input
                className="ios-field-input nm-nativo"
                type="date"
                value={desde}
                max={hasta || undefined}
                onChange={(e) => cambiar({ desde: e.target.value })}
              />
            </label>
            <label className="ios-field">
              <span className="ios-field-label">{t("agenda.rangoHasta")}</span>
              <input
                className="ios-field-input nm-nativo"
                type="date"
                value={hasta}
                min={desde || undefined}
                onChange={(e) => cambiar({ hasta: e.target.value })}
              />
            </label>
            {(desde || hasta) && (
              <button
                type="button"
                className="action-sheet-opcion danger"
                onClick={() => { onCambiar({ desde: "", hasta: "" }); onCerrar(); }}
              >
                {t("agenda.rangoQuitar")}
              </button>
            )}
          </div>

          <button type="button" className="action-sheet-cancelar" onClick={onCerrar}>
            {t("common.listo")}
          </button>
        </div>
      </div>
    </Portal>
  );
}
