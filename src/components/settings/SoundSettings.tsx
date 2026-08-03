import { useState } from "react";
import { useTranslation } from "react-i18next";
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>
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
      </div>

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
      <div className="form-hint">{t("sonido.hint")}</div>
      <div className="form-hint">{t("sonido.hintJuego")}</div>
    </div>
  );
}
