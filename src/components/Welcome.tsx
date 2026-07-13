import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { updateChurch, type Church } from "../db";
import type { LangPref } from "../i18n";
import { IconLogo, IconMonitor } from "../icons";

interface Props {
  church: Church;
  langPref: LangPref;
  onLangPrefChange: (pref: LangPref) => void;
  onDone: (updated: Church) => void;
}

/** Primer arranque: en vez de aparecer como "Mi Iglesia" sin explicación,
 *  la app pide los tres datos que todo lo demás usa (nombre, moneda,
 *  idioma). Se muestra encima del shell normal, así hereda tema e idioma. */
export default function Welcome({ church, langPref, onLangPrefChange, onDone }: Props) {
  const { t } = useTranslation();
  const [nombre, setNombre] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [moneda, setMoneda] = useState(church.moneda);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const idiomas: { id: LangPref; label: string; icon: ReactNode }[] = [
    { id: "auto", label: t("idioma.automatico"), icon: <IconMonitor size={14} strokeWidth={2} /> },
    { id: "es", label: t("idioma.espanol"), icon: null },
    { id: "en", label: t("idioma.ingles"), icon: null },
  ];

  async function comenzar() {
    setError(null);
    if (!nombre.trim()) {
      setError(t("config.nombreIglesiaObligatorio"));
      return;
    }
    setSaving(true);
    try {
      const updated = await updateChurch(church.id, {
        nombre: nombre.trim(),
        ciudad: ciudad.trim() || null,
        pais: church.pais || null,
        moneda,
        logo_path: church.logo_path,
        tesorero_nombre: church.tesorero_nombre,
        tesorero_cargo: church.tesorero_cargo,
        tesorero_email: church.tesorero_email,
        tesorero_telefono: church.tesorero_telefono,
        tesorero_firma_path: church.tesorero_firma_path,
      });
      onDone(updated);
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
      setSaving(false);
    }
  }

  return (
    <div className="welcome-overlay">
      <div className="card pad-lg" style={{ width: 480, maxWidth: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 22 }}>
          <div className="logo" style={{ marginBottom: 14 }}><IconLogo /></div>
          <div className="card-title-lg" style={{ fontSize: 20 }}>{t("bienvenida.titulo")}</div>
          <div className="card-title-sub" style={{ marginTop: 4 }}>{t("bienvenida.sub")}</div>
        </div>

        <div className="form-group full">
          <label className="form-label">{t("iglesia.nombreLabel")}</label>
          <input
            className="form-input"
            value={nombre}
            autoFocus
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") comenzar(); }}
            placeholder={t("iglesia.nombrePlaceholder")}
          />
          {error && <div className="field-error">{error}</div>}
        </div>

        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">{t("iglesia.ciudad")} <span className="opt">{t("common.opcional")}</span></label>
            <input className="form-input" value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder={t("iglesia.ciudadPlaceholder")} />
          </div>
          <div className="form-group">
            <label className="form-label">{t("iglesia.moneda")}</label>
            <select className="form-select" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
              <option value="USD">{t("iglesia.monedaUsd")}</option>
              <option value="MXN">{t("iglesia.monedaMxn")}</option>
            </select>
          </div>
        </div>

        <div className="form-group full">
          <label className="form-label">{t("idioma.titulo")}</label>
          <div className="tabs-segmented" style={{ marginBottom: 0 }}>
            {idiomas.map((opt) => (
              <div
                key={opt.id}
                className={`seg${langPref === opt.id ? " active" : ""}`}
                onClick={() => onLangPrefChange(opt.id)}
              >
                {opt.icon} {opt.label}
              </div>
            ))}
          </div>
        </div>

        <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={comenzar} disabled={saving}>
          {saving ? t("common.guardando") : t("bienvenida.comenzar")}
        </button>
      </div>
    </div>
  );
}
