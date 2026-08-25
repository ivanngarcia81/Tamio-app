/**
 * PasoOrdenIOS.tsx — la hoja que añade o corrige un paso del **orden del
 * culto** (migración 43).
 *
 * Tres campos y ninguno obligatorio salvo el título, y eso no es dejadez:
 *
 *  - **La hora es opcional.** Un culto real tiene pasos con hora ("10:00,
 *    Bienvenida") y pasos que van cuando toca ("Ofrenda, después de la
 *    predicación"). Obligar a poner una hora inventada llenaría la tarjeta de
 *    horas falsas, que es peor que no tenerlas. Por eso el orden lo manda
 *    `posicion` y no `hora` — ver `listOrdenCulto` en `db.ts`.
 *  - **El encargado es texto libre**, igual que el responsable del corte:
 *    quien pone el sonido un domingo puede no estar en el padrón.
 *
 * Se abre desde `DetalleServicio`, la ficha del culto del iPad.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import { Section, TextField } from "./ios/FormularioIOS";
import { useEscapeClose } from "../hooks/useEscapeClose";
import type { PasoOrden } from "../db";

interface Props {
  /** El paso que se corrige, o null para añadir uno nuevo al final. */
  paso: PasoOrden | null;
  onGuardar: (v: { hora: string | null; titulo: string; encargado: string | null }) => void;
  onClose: () => void;
}

export default function PasoOrdenIOS({ paso, onGuardar, onClose }: Props) {
  const { t } = useTranslation();
  const titulo = paso ? t("servicios.editarPaso") : t("servicios.nuevoPaso");
  const [hora, setHora] = useState(paso?.hora ?? "");
  const [texto, setTexto] = useState(paso?.titulo ?? "");
  const [encargado, setEncargado] = useState(paso?.encargado ?? "");
  useEscapeClose(onClose);

  const listo = texto.trim().length > 0;

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
              <button
                type="button"
                className="ios-nav-action"
                disabled={!listo}
                onClick={() => onGuardar({
                  hora: hora.trim() || null,
                  titulo: texto.trim(),
                  encargado: encargado.trim() || null,
                })}
              >
                {t("common.guardar")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body nm-cuerpo">
            <Section header={t("servicios.datosDelPaso")} footer={t("servicios.horaOpcionalPie")}>
              <TextField
                label={t("servicios.pasoTitulo")}
                value={texto}
                onChange={setTexto}
                placeholder={t("servicios.pasoTituloEjemplo")}
                autoFocus
                stacked
              />
              {/* `type="time"` da la rueda nativa en el iPad y el reloj del
                  sistema decide si son 12 o 24 horas: escribirla a mano en un
                  campo de texto obliga a un formato que la app no controla. */}
              <TextField
                label={t("servicios.pasoHora")}
                value={hora}
                onChange={setHora}
                type="time"
                optional
              />
              <TextField
                label={t("servicios.pasoEncargado")}
                value={encargado}
                onChange={setEncargado}
                placeholder={t("servicios.pasoEncargadoEjemplo")}
                optional
                stacked
              />
            </Section>
          </div>
        </div>
      </div>
    </Portal>
  );
}
