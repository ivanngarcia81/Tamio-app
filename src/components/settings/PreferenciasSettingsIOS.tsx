/**
 * PreferenciasSettingsIOS.tsx — Apariencia, color de acento, idioma y
 * sonido con el patrón de lista agrupada de iOS, SOLO para iPhone. Mac/iPad
 * siguen usando las cuatro tarjetas de siempre (AppearanceSettings,
 * LanguageSettings, AccentSettings, SoundSettings) en Configuracion.tsx.
 *
 * Cambios respecto al paquete de referencia:
 *  - Las opciones son las REALES de Tamio, no las del paquete: Apariencia/
 *    Idioma usan los mismos tipos y textos que ya usan las tarjetas de
 *    escritorio; "Color de acento" son los 5 tintes nombrados de
 *    AccentSettings.tsx (neutro/verde/azul/morado/ámbar sobre `--ink`),
 *    no seis hex sueltos sobre una variable `--ios-tint` que no existía en
 *    la app.
 *  - Sonido y Set de sonidos SÍ persisten aquí mismo (sound.ts), igual que
 *    ya hacía SoundSettings.tsx — no se movió dónde ni cómo se guardan.
 *  - "Set de sonidos" solo se pinta si el sonido está encendido (antes se
 *    veía siempre, incluso apagado).
 *  - Elegir un set sigue reproduciendo su muestra (probarSonido), igual
 *    que en la tarjeta de escritorio.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ThemePref } from "./AppearanceSettings";
import { ACENTOS, MUESTRA, type Acento } from "./AccentSettings";
import type { LangPref } from "../../i18n";
import {
  JUEGOS_SONIDO, juegoSonido, playSound, probarSonido, setJuegoSonido,
  setSonidoActivado, sonidoActivado, type JuegoSonido,
} from "../../sound";
import { Section, SwitchField } from "../ios/FormularioIOS";

const Check = () => (
  <span className="ios-choice-check" aria-hidden="true">
    <svg viewBox="0 0 15 15"><path d="M1.5 8.2l4 4.3L13.5 2.5" /></svg>
  </span>
);

/** Grupo de opciones exclusivas: una fila por opción, check en la activa —
 *  sustituye a las pastillas con la activa en negro (`.tabs-segmented`) de
 *  las tarjetas de escritorio. */
function ChoiceGroup<T extends string>({
  options, value, onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="ios-group">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          className="ios-choice-row"
          onClick={() => onChange(o.id)}
        >
          <span className="ios-choice-label">{o.label}</span>
          <Check />
        </button>
      ))}
    </div>
  );
}

interface Props {
  themePref: ThemePref;
  onThemePrefChange: (v: ThemePref) => void;
  acento: Acento;
  onAcentoChange: (v: Acento) => void;
  langPref: LangPref;
  onLangPrefChange: (v: LangPref) => void;
}

export default function PreferenciasSettingsIOS({
  themePref, onThemePrefChange, acento, onAcentoChange, langPref, onLangPrefChange,
}: Props) {
  const { t } = useTranslation();
  const [sonidoOn, setSonidoOn] = useState(sonidoActivado());
  const [juego, setJuego] = useState<JuegoSonido>(juegoSonido);

  function alternarSonido(v: boolean) {
    setSonidoOn(v);
    setSonidoActivado(v);
    if (v) playSound("guardado");
  }

  // Al elegir un juego se oye en el momento, aunque el interruptor esté
  // apagado — pero el grupo entero ya está oculto en ese caso (paso 8 de
  // la tarea), así que en la práctica solo se llama con el sonido encendido.
  function elegirJuego(j: JuegoSonido) {
    setJuego(j);
    setJuegoSonido(j);
    probarSonido("ingreso", j);
  }

  return (
    <div className="ios-form">
      <Section header={t("apariencia.titulo")} footer={t("apariencia.hint")}>
        <ChoiceGroup
          options={[
            { id: "light", label: t("apariencia.claro") },
            { id: "dark", label: t("apariencia.oscuro") },
            { id: "auto", label: t("apariencia.automatico") },
          ] as const}
          value={themePref}
          onChange={onThemePrefChange}
        />
      </Section>

      <Section header={t("acento.titulo")} footer={t("acento.hint")}>
        <div className="ios-group">
          <div className="ios-colors-row" role="radiogroup" aria-label={t("acento.titulo")}>
            {ACENTOS.map((a) => (
              <button
                key={a}
                type="button"
                className="ios-color-dot"
                style={{ color: MUESTRA[a] }}
                aria-selected={a === acento}
                aria-label={t(`acento.nombre.${a}`)}
                title={t(`acento.nombre.${a}`)}
                onClick={() => onAcentoChange(a)}
              />
            ))}
          </div>
        </div>
      </Section>

      <Section header={t("idioma.titulo")} footer={t("idioma.hint")}>
        <ChoiceGroup
          options={[
            { id: "auto", label: t("idioma.automatico") },
            { id: "es", label: t("idioma.espanol") },
            { id: "en", label: t("idioma.ingles") },
          ] as const}
          value={langPref}
          onChange={onLangPrefChange}
        />
      </Section>

      <Section header={t("sonido.titulo")} footer={t("sonido.hint")}>
        <SwitchField label={t("sonido.sub")} checked={sonidoOn} onChange={alternarSonido} />
      </Section>

      {sonidoOn && (
        <Section header={t("sonido.juego")} footer={t("sonido.hintJuego")}>
          <ChoiceGroup
            options={JUEGOS_SONIDO.map((j) => ({ id: j, label: t(`sonido.juegos.${j}`) }))}
            value={juego}
            onChange={elegirJuego}
          />
        </Section>
      )}
    </div>
  );
}
