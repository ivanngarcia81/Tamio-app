import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { useTranslation } from "react-i18next";
import { IconBuilding, IconWarn } from "../../icons";
import { currentLang } from "../../i18n";
import { CURRENCIES, currencyLabel } from "../../currencies";
import { convertirImagenAPng } from "../../services/imagenLogo";

export interface ChurchFormValues {
  nombre: string;
  ciudad: string;
  pais: string;
  moneda: string;
  /** Saldo de apertura como texto de formulario; se valida y parsea al guardar. */
  saldoInicial: string;
}

interface Props {
  value: ChurchFormValues;
  onChange: (patch: Partial<ChurchFormValues>) => void;
  error?: string | null;
  saldoError?: string | null;
  logoPath: string | null;
  onLogoPathChange: (path: string | null) => void;
  /** La moneda y el saldo de apertura son datos de tesorería; se ocultan a
   *  roles que no la manejan. */
  showCurrency?: boolean;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default function ChurchSettings({ value, onChange, error, saldoError, logoPath, onLogoPathChange, showCurrency = true }: Props) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!logoPath) {
      setPreviewUrl(null);
      return;
    }
    readFile(logoPath)
      .then((bytes) => {
        if (cancelled) return;
        setPreviewUrl(`data:image/png;base64,${uint8ToBase64(bytes)}`);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [logoPath]);

  async function pickLogo() {
    setLogoError(null);
    try {
      const selected = await openFileDialog({
        multiple: false,
        title: t("iglesia.seleccionarLogo"),
        // Acepta cualquier imagen común; en iPhone/iPad las fotos son HEIC/JPG,
        // no PNG. La imagen se convierte a PNG antes de guardarla.
        filters: [{ name: t("iglesia.imagen"), extensions: ["png", "jpg", "jpeg", "heic", "heif", "webp"] }],
      });
      if (typeof selected !== "string") return;
      const bytes = await readFile(selected);
      const pngBytes = await convertirImagenAPng(bytes, selected);
      const ruta = await join(await appDataDir(), `logo-${Date.now()}.png`);
      await writeFile(ruta, pngBytes);
      onLogoPathChange(ruta);
    } catch (e) {
      setLogoError(t("common.noSePudoAbrirSelector", { error: String(e) }));
    }
  }

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconBuilding size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("iglesia.titulo")}</div>
            <div className="card-title-sub">{t("iglesia.sub")}</div>
          </div>
        </div>
      </div>

      <div className="church-logo-row">
        {previewUrl ? (
          <div className="church-logo-preview">
            <img src={previewUrl} alt={t("iglesia.logoAlt")} />
          </div>
        ) : (
          <div className="church-logo-placeholder">
            <IconBuilding size={22} />
          </div>
        )}
        <div className="signature-actions" style={{ minWidth: 0 }}>
          <div className="signature-actions-row">
            <button type="button" className="btn secondary" onClick={pickLogo}>
              {previewUrl ? t("iglesia.cambiarLogo") : t("iglesia.subirLogo")}
            </button>
            {previewUrl && (
              <button type="button" className="btn ghost" onClick={() => onLogoPathChange(null)}>{t("iglesia.eliminarLogo")}</button>
            )}
          </div>
          <div className="form-hint">{t("iglesia.logoHint")}</div>
        </div>
      </div>
      {logoError && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18 }}>
          <IconWarn size={13} /> {logoError}
        </div>
      )}

      <div className="form-group full">
        <label className="form-label">{t("iglesia.nombreLabel")}</label>
        <input
          className="form-input"
          value={value.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          placeholder={t("iglesia.nombrePlaceholder")}
        />
        {error && <div className="field-error">{error}</div>}
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">{t("iglesia.ciudad")} <span className="opt">{t("common.opcional")}</span></label>
          <input
            className="form-input"
            value={value.ciudad}
            onChange={(e) => onChange({ ciudad: e.target.value })}
            placeholder={t("iglesia.ciudadPlaceholder")}
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t("iglesia.pais")} <span className="opt">{t("common.opcional")}</span></label>
          <input
            className="form-input"
            value={value.pais}
            onChange={(e) => onChange({ pais: e.target.value })}
            placeholder={t("iglesia.paisPlaceholder")}
          />
        </div>
      </div>

      {showCurrency && (
        <div className="form-group full">
          <label className="form-label">{t("iglesia.moneda")}</label>
          <select className="form-select" value={value.moneda} onChange={(e) => onChange({ moneda: e.target.value })}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{currencyLabel(c.code, currentLang())}</option>
            ))}
          </select>
          <div className="form-hint">{t("iglesia.monedaHint")}</div>
        </div>
      )}

      {showCurrency && (
        <div className="form-group full">
          <label className="form-label">{t("iglesia.saldoInicial")}</label>
          <input
            className="form-input"
            value={value.saldoInicial}
            onChange={(e) => onChange({ saldoInicial: e.target.value })}
            placeholder="0.00"
            inputMode="decimal"
          />
          {saldoError
            ? <div className="field-error">{saldoError}</div>
            : <div className="form-hint">{t("iglesia.saldoInicialHint")}</div>}
        </div>
      )}
    </div>
  );
}
