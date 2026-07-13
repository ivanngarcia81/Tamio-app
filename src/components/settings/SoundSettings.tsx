import { useState } from "react";
import { useTranslation } from "react-i18next";
import { playSound, setSonidoActivado, sonidoActivado } from "../../sound";
import { IconVolume } from "../../icons";

export default function SoundSettings() {
  const { t } = useTranslation();
  const [activo, setActivo] = useState(sonidoActivado());

  function toggle() {
    const next = !activo;
    setActivo(next);
    setSonidoActivado(next);
    if (next) playSound("guardado");
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
      <div className="form-hint">{t("sonido.hint")}</div>
    </div>
  );
}
