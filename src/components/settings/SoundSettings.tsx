import { useState } from "react";
import { useTranslation } from "react-i18next";
import { esMac } from "../../movil";
import {
  JUEGOS_SONIDO, juegoSonido, playSound, probarSonido, setJuegoSonido,
  setSonidoActivado, sonidoActivado, type JuegoSonido,
} from "../../sound";
import { IconVolume } from "../../icons";

export default function SoundSettings() {
  const { t } = useTranslation();
  const [activo, setActivo] = useState(sonidoActivado());
  const [juego, setJuego] = useState<JuegoSonido>(juegoSonido);

  function toggle() {
    const next = !activo;
    setActivo(next);
    setSonidoActivado(next);
    if (next) playSound("guardado");
  }

  // Al elegir un juego se oye en el momento, aunque el interruptor esté
  // apagado: si no, no habría forma de compararlos antes de decidir.
  function elegir(j: JuegoSonido) {
    setJuego(j);
    setJuegoSonido(j);
    probarSonido("ingreso", j);
  }

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconVolume size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("sonido.titulo")}</div>
            <div className="card-title-sub">{t("sonido.sub")}</div>
          </div>
        </div>
        {/* En Mac el interruptor sale del encabezado y baja al cuerpo como
            una fila más del formulario (abajo), para que su etiqueta se
            alinee con las demás en vez de quedar suelta en la esquina. */}
        {!esMac() && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "calc(12.5px * var(--fs-escala))", color: "var(--text-2)" }}>
              {activo ? t("sonido.activado") : t("sonido.desactivado")}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={activo}
              className={`switch${activo ? " on" : ""}`}
              onClick={toggle}
            />
          </div>
        )}
      </div>

      {/* Casilla de verificación y no interruptor: el de 52×31 es el control
          de iOS y en una ventana de escritorio canta. La casilla nativa toma
          el acento del sistema con `accent-color`. */}
      {esMac() && (
        <div className="form-group">
          <label className="form-label">{t("sonido.titulo")}</label>
          <label className="mac-check">
            <input type="checkbox" checked={activo} onChange={toggle} />
            <span>{activo ? t("sonido.activado") : t("sonido.desactivado")}</span>
          </label>
        </div>
      )}

      {esMac() ? (
        <div className="form-group">
          <label className="form-label">{t("sonido.juego")}</label>
          <select
            className="form-select"
            value={juego}
            onChange={(e) => elegir(e.target.value as typeof juego)}
          >
            {JUEGOS_SONIDO.map((j) => (
              <option key={j} value={j}>{t(`sonido.juegos.${j}`)}</option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className="form-label" style={{ marginBottom: 6 }}>{t("sonido.juego")}</div>
          <div className="tabs-segmented" style={{ marginBottom: 10 }}>
            {JUEGOS_SONIDO.map((j) => (
              <button
                type="button"
                key={j}
                className={`seg${juego === j ? " active" : ""}`}
                aria-pressed={juego === j}
                onClick={() => elegir(j)}
              >
                {t(`sonido.juegos.${j}`)}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="form-hint">{t("sonido.hint")}</div>
      <div className="form-hint">{t("sonido.hintJuego")}</div>
    </div>
  );
}
