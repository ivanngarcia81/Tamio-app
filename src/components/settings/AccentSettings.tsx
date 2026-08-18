import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { IconCheck, IconSparkles } from "../../icons";

/** Acentos disponibles. `neutro` no escribe atributo: deja los valores de
 *  siempre, que es el aspecto original de Tamio. */
export const ACENTOS = ["neutro", "verde", "azul", "morado", "ambar"] as const;
export type Acento = (typeof ACENTOS)[number];

/** Muestra de cada acento para el selector. Es solo la pastilla de color de
 *  esta pantalla: el color real de la app lo definen las variables `--ink` de
 *  styles.css, que además tienen su versión para modo oscuro. */
export const MUESTRA: Record<Acento, string> = {
  neutro: "#0f0f0f",
  verde: "#047857",
  azul: "#1d4ed8",
  morado: "#6d28d9",
  ambar: "#b45309",
};

interface Props {
  value: Acento;
  onChange: (a: Acento) => void;
}

/**
 * Color de acento de la app.
 *
 * Cambia `--ink`, que es el color fuerte de Tamio: botones principales, la
 * página activa del menú, chips y pestañas seleccionadas, el anillo de foco y
 * las casillas. Es una preferencia de ESTE dispositivo (como el tema y el
 * idioma), no un dato de la iglesia: no se sincroniza ni viaja en el respaldo.
 */
export default function AccentSettings({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconSparkles size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("acento.titulo")}</div>
            <div className="card-title-sub">{t("acento.sub")}</div>
          </div>
        </div>
      </div>

      <div className="acento-fila">
        {ACENTOS.map((a) => (
          <button
            type="button"
            key={a}
            className={`acento-punto${value === a ? " active" : ""}`}
            /* `--muestra` además del fondo: en Mac el aro del elegido es del
               MISMO color que el círculo, y una sombra no puede leer el
               `background` de su elemento. `color` no vale como vehículo —lo
               usa el check, que va en blanco—, así que el color viaja en su
               propia variable. En iPad no la lee nadie. */
            style={{ background: MUESTRA[a], "--muestra": MUESTRA[a] } as CSSProperties}
            aria-pressed={value === a}
            aria-label={t(`acento.nombre.${a}`)}
            title={t(`acento.nombre.${a}`)}
            onClick={() => onChange(a)}
          >
            {value === a && <IconCheck size={14} strokeWidth={3} />}
          </button>
        ))}
      </div>
      <div className="form-hint" style={{ marginTop: "var(--space-3)" }}>
        {t("acento.hint")}
      </div>
    </div>
  );
}
