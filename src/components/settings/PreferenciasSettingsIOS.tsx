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
import { esIPad } from "../../movil";
import { ocultarMontosActivado, setOcultarMontos } from "../../privacidad";

/**
 * Las tres miniaturas de tema del handoff de iPad: un rectángulo de 104px
 * que DIBUJA la app —barra lateral con sus renglones y dos tarjetas— en
 * claro, en oscuro y partido en diagonal para "Automático".
 *
 * Los colores van literales y no en tokens a propósito: es un retrato del
 * tema claro y del oscuro, así que la miniatura clara tiene que verse clara
 * aunque el iPad esté en oscuro. Es el mismo criterio que `--paper` en las
 * hojas de Actas y Cartas.
 *
 * Solo el iPad. El teléfono se queda con la lista de tres filas: en 390px
 * tres miniaturas salen a 110 de ancho y no se distingue lo que retratan.
 */
function TemasIPad({ value, onChange }: { value: ThemePref; onChange: (v: ThemePref) => void }) {
  const { t } = useTranslation();
  const opciones: { id: ThemePref; label: string }[] = [
    { id: "light", label: t("apariencia.claro") },
    { id: "dark", label: t("apariencia.oscuro") },
    { id: "auto", label: t("apariencia.automatico") },
  ];
  return (
    <div className="pf-temas" role="radiogroup" aria-label={t("apariencia.titulo")}>
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          className={`pf-tema${o.id === value ? " sel" : ""}`}
          onClick={() => onChange(o.id)}
        >
          <span className={`pf-lienzo pf-lienzo--${o.id}`} aria-hidden="true">
            {o.id !== "auto" && (
              <>
                <span className="pf-barra">
                  <i className="pf-renglon pf-renglon--activo" />
                  <i className="pf-renglon" />
                  <i className="pf-renglon" />
                </span>
                <span className="pf-cuerpo">
                  <i className="pf-tarjeta" />
                  <i className="pf-tarjeta" />
                </span>
              </>
            )}
          </span>
          <span className="pf-tema-nombre">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

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
  const [ocultarMontos, setOcultarMontosEstado] = useState(ocultarMontosActivado());
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
        {esIPad() ? (
          <TemasIPad value={themePref} onChange={onThemePrefChange} />
        ) : (
          <ChoiceGroup
            options={[
              { id: "light", label: t("apariencia.claro") },
              { id: "dark", label: t("apariencia.oscuro") },
              { id: "auto", label: t("apariencia.automatico") },
            ] as const}
            value={themePref}
            onChange={onThemePrefChange}
          />
        )}
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

      {/* "Presentación": los tres controles que el handoff de iPad dibuja y
          que la app no tiene. Se pintan por decisión de Iván (23 ago) —"si el
          botón no tiene función, que se construya, y luego se le pone
          motor"— pero APAGADOS y con su explicación, que es el trato que ya
          tenían "Recopilar firmas" en Actas y el renglón del testigo.

          Solo iPad: son del handoff de iPad, y el teléfono no los pidió.
          Quedan apuntados en `docs/cascaras-1-2.md`, que es lo que se revisa
          antes de mandar una versión a REVISIÓN del App Store. */}
      {esIPad() && (
        <Section header={t("presentacion.titulo")} footer={t("presentacion.hint")}>
          <div className="ios-field ios-field--apagado" title={t("presentacion.hint")}>
            <span className="ios-field-label">{t("presentacion.tamanoTexto")}</span>
            <span className="pf-seg" role="radiogroup" aria-label={t("presentacion.tamanoTexto")} aria-disabled="true">
              {(["chico", "normal", "grande"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={k === "normal"}
                  className={k === "normal" ? "activo" : ""}
                  disabled
                >
                  {t(`presentacion.tamano.${k}`)}
                </button>
              ))}
            </span>
          </div>
          {/* **"Barra lateral siempre visible" se quitó el 24 ago 2026**, y es
              el primer control del handoff que se retira en vez de cablearse.
              La regla de Iván —construir aunque no se le vea función— existe
              para no descartar por pereza; aquí se examinó la función y sale
              perdiendo, y la decisión la tomó él:

              En vertical, fijar la barra se come 318px. En un iPad de 11" o
              en el mini deja el contenido en 516 y 426, por debajo de los 700
              que el maestro-detalle necesita para partirse — o sea que
              cambiarías el panel de detalle por un menú. Y en el de 13" cabe
              por SEIS píxeles, que es no caber.

              Además va contra la convención del sistema: Notas, Archivos y
              Correo hacen exactamente lo que Tamio ya hace —barra fija en
              apaisado, cajón con ☰ en vertical—, y por esta misma cuenta.
              Un control que empeora la app y contradice al sistema no es una
              cáscara esperando motor. */}
          {/* Con motor desde el 24 ago 2026: tapa el contenido cuando la app
              se va a segundo plano. Ver `src/privacidad.ts`. */}
          <SwitchField
            label={t("presentacion.ocultarMontos")}
            sub={t("presentacion.ocultarMontosSub")}
            checked={ocultarMontos}
            onChange={(v) => { setOcultarMontos(v); setOcultarMontosEstado(v); }}
          />
        </Section>
      )}

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
