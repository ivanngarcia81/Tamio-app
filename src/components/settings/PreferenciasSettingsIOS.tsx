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
import { setTamanoTexto, tamanoTexto, TAMANOS, type TamanoTexto } from "../../tipografia";
import type { ThemePref } from "./AppearanceSettings";
import { ACENTOS, MUESTRA, type Acento } from "./AccentSettings";
import type { LangPref } from "../../i18n";
import {
  JUEGOS_SONIDO, juegoSonido, playSound, probarSonido, setJuegoSonido,
  setSonidoActivado, sonidoActivado, type JuegoSonido,
} from "../../sound";
import { Section, SwitchField } from "../ios/FormularioIOS";
import { IOSPickerField } from "../ios/IOSPickerField";
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
  /* Sin `.ios-group` propio: `Section` ya envuelve a sus hijos en uno. Con el
     de aquí eran DOS anidados, y como cada uno pone `margin: 0 16px`, las
     filas de opción sangraban 16 px más que las de interruptor del grupo de
     al lado —«Claro» a 64 px y «Sonido al guardar» a 48—. Es la sangría
     desigual que la regla E del handoff (casilla por grupo, no por fila)
     existe para impedir. */
  return (
    <>
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
    </>
  );
}

/**
 * «Tamaño de texto», como fila con deslizador (maqueta S8).
 *
 * El handoff la pone en el grupo IDIOMA Y TEXTO del teléfono y la dibuja con
 * las dos «A» a los lados: el control se PRUEBA mientras se mueve, porque lo
 * que cambia es el tamaño de la propia pantalla que lo contiene. El nombre
 * del paso va a la derecha, en la línea de la etiqueta, donde iría el valor.
 *
 * Es un deslizador de tres topes y no un segmentado como el del iPad: en 393
 * px tres pastillas con «Chico / Normal / Grande» dejan la etiqueta sin
 * sitio, y además un segmentado no sugiere que haya un continuo entre los
 * extremos —que es justo lo que las dos «A» sí dicen.
 */
function FilaTamanoTexto({ value, onChange }: { value: TamanoTexto; onChange: (v: TamanoTexto) => void }) {
  const { t } = useTranslation();
  const i = Math.max(0, TAMANOS.indexOf(value));
  return (
    <div className="ios-field ios-fila-tamano">
      <span className="ft-cab">
        <span className="ios-field-label">{t("presentacion.tamanoTexto")}</span>
        <span className="ft-paso">{t(`presentacion.tamano.${value}`)}</span>
      </span>
      <span className="ft-control">
        <span className="ft-a ft-a--chica" aria-hidden="true">A</span>
        <input
          type="range"
          min={0}
          max={TAMANOS.length - 1}
          step={1}
          value={i}
          aria-label={t("presentacion.tamanoTexto")}
          aria-valuetext={t(`presentacion.tamano.${value}`)}
          onChange={(e) => onChange(TAMANOS[Number(e.target.value)])}
        />
        <span className="ft-a ft-a--grande" aria-hidden="true">A</span>
      </span>
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
  const [tamano, setTamano] = useState<TamanoTexto>(tamanoTexto);

  /* Se aplica al instante, sin botón de guardar: es una preferencia de
     apariencia y el resultado se ve en la propia pantalla mientras se elige,
     igual que el tema y el acento. */
  function elegirTamano(v: TamanoTexto) {
    setTamano(v);
    setTamanoTexto(v);
  }
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
      {/* APARIENCIA. Los tres temas y el acento comparten grupo: son la misma
          pregunta —«de qué color es esto»— y separarlos en dos tarjetas hacía
          que el acento pareciera un ajuste de otra familia. Ninguna fila de
          aquí reserva casilla de icono, así que la palomita se va a la
          derecha y las cuatro sangran igual (regla E de la lámina S11). */}
      <Section header={t("apariencia.titulo")} footer={t("apariencia.pieGrupo")}>
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
        {/* El acento, dentro de su fila: etiqueta a la izquierda y las cinco
            pastillas donde iría el valor. Antes era una tarjeta propia con
            los círculos sueltos, que a 393 px se leía como una paleta y no
            como un ajuste. */}
        <div className="ios-colors-row" role="radiogroup" aria-label={t("acento.titulo")}>
          <span className="ios-colors-etiqueta">{t("acento.titulo")}</span>
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
      </Section>

      {/* IDIOMA Y TEXTO. El idioma pasa de tres filas de opción a una fila
          con su valor: son tres opciones hoy, pero la fila no crece si mañana
          son ocho, y así comparte grupo con el tamaño de texto —que es la
          otra cosa que cambia cómo se LEE la app. */}
      <Section header={t("idioma.tituloGrupo")} footer={t("idioma.hint")}>
        <IOSPickerField
          label={t("idioma.titulo")}
          sheetTitle={t("idioma.titulo")}
          options={[
            { value: "auto", label: t("idioma.automatico") },
            { value: "es", label: t("idioma.espanol") },
            { value: "en", label: t("idioma.ingles") },
          ]}
          value={langPref}
          onSelect={(v) => onLangPrefChange(v as LangPref)}
        />
        {!esIPad() && <FilaTamanoTexto value={tamano} onChange={elegirTamano} />}
      </Section>

      {/* SONIDO. El interruptor lleva su explicación DEBAJO (regla A), no en
          la columna del valor, que es donde se truncaba. Y «Juego de
          sonidos» ya no desaparece con el sonido apagado: se queda atenuado
          en su sitio —un ajuste que se va de la pantalla al tocar el de
          arriba se lee como un fallo. */}
      <Section header={t("sonido.titulo")} footer={t("sonido.pieGrupo")}>
        <SwitchField
          label={t("sonido.titulo")}
          sub={t("sonido.hint")}
          checked={sonidoOn}
          onChange={alternarSonido}
        />
        <IOSPickerField
          label={t("sonido.juego")}
          sheetTitle={t("sonido.juego")}
          options={JUEGOS_SONIDO.map((j) => ({ value: j, label: t(`sonido.juegos.${j}`) }))}
          value={juego}
          onSelect={(v) => elegirJuego(v as JuegoSonido)}
          disabled={!sonidoOn}
        />
      </Section>

      {/* "Presentación": los tres controles que el handoff de iPad dibujó y
          la app no tenía. Se pintaron apagados por decisión de Iván (23 ago)
          —"si el botón no tiene función, que se construya, y luego se le pone
          motor"—, y a 24 de agosto de 2026 **los tres están resueltos**:

            · "Ocultar montos al bloquear" — con motor (`privacidad.ts`).
            · "Barra lateral siempre visible" — RETIRADO, no cableado: fijar
              la barra en vertical se come 318px y deja el contenido por
              debajo de los 700 que el maestro-detalle necesita.
            · "Tamaño de texto" — con motor (`tipografia.ts`). Fue el último,
              y el que más tardó, porque no faltaba el control sino que la
              tipografía se pudiera mover entera.

          Con eso esta zona deja de tener cáscaras. Solo iPad: son del handoff
          de iPad, y el teléfono no los pidió. */}
      {esIPad() && (
        <Section header={t("presentacion.titulo")} footer={t("presentacion.hint")}>
          {/* **Encendido el 24 ago 2026.** Era la última cáscara de la app, y
              lo que la tenía apagada no era este control: era que la
              tipografía no se podía mover entera. 395 `font-size` iban con
              píxeles a pelo —incluidas las cifras de dinero— contra 248 que
              salían de los tokens, así que encenderlo antes habría agrandado
              las etiquetas y dejado los importes chicos. Primero se movió
              todo a `--fs-escala` (ver `tipografia.ts`), y entonces esto. */}
          <div className="ios-field">
            <span className="ios-field-label">{t("presentacion.tamanoTexto")}</span>
            <span className="pf-seg" role="radiogroup" aria-label={t("presentacion.tamanoTexto")}>
              {TAMANOS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={k === tamano}
                  className={k === tamano ? "activo" : ""}
                  onClick={() => elegirTamano(k)}
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
    </div>
  );
}
