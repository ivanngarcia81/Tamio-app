/**
 * PersonasSettingsIOS.tsx — pantalla "Tesorero y pastor" con el patrón de
 * formulario plano de iOS, SOLO para iPhone. Combina lo que en
 * Configuracion.tsx son 4 tarjetas independientes (Mac/iPad):
 * TreasurerSettings, PastorSettings y sus dos SignatureUploader — aquí son
 * dos secciones (Tesorero, Pastor), cada una con su firma como última fila.
 * Mismo estado, validación y guardado que esas 4 tarjetas: reescritura del
 * MARCADO, no de la lógica (por eso las props son las mismas piezas sueltas
 * que ya se pasaban a cada una).
 */
import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { CARPETA_IMAGENES, guardarEnDatos, rutaEnDatos } from "../../services/archivos";
import { useTranslation } from "react-i18next";
import { IconSignature } from "../../icons";
import type { TreasurerFormErrors, TreasurerFormValues } from "./TreasurerSettings";
import type { PastorFormErrors, PastorFormValues } from "./PastorSettings";
import { Section, TextField } from "../ios/FormularioIOS";
import ActionSheet from "../ActionSheet";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Fila de firma: mismo tratamiento que la fila "Logo" de Iglesia — avatar
 *  40×40 + chevron, toca para elegir; si ya hay una, abre una hoja con
 *  Cambiar/Eliminar en vez de reemplazar directo. */
function FirmaField({
  ns, label, path, onPathChange,
}: {
  ns: "firma" | "firmaPastor";
  label: string;
  path: string | null;
  onPathChange: (path: string | null) => void;
}) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setPreviewUrl(null);
      return;
    }
    rutaEnDatos(path).then(readFile)
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
  }, [path]);

  async function pickFirma() {
    setError(null);
    try {
      const selected = await openFileDialog({
        multiple: false,
        title: t(`${ns}.seleccionar`),
        filters: [{ name: t("iglesia.imagenPng"), extensions: ["png"] }],
      });
      if (typeof selected !== "string") return;
      if (!selected.toLowerCase().endsWith(".png")) {
        setError(t(`${ns}.debeSerPng`));
        return;
      }
      onPathChange(await guardarEnDatos(selected, CARPETA_IMAGENES));
    } catch (e) {
      setError(t("common.noSePudoAbrirSelector", { error: String(e) }));
    }
  }

  return (
    <>
      <button
        type="button"
        className="ios-field ios-field--link ios-field--avatar"
        onClick={() => (previewUrl ? setMenuAbierto(true) : pickFirma())}
      >
        <span className="ios-field-label">{label}</span>
        <span className="ios-field-value" />
        <span className="ios-avatar">
          {previewUrl ? <img src={previewUrl} alt={t(`${ns}.alt`)} /> : <IconSignature size={18} />}
        </span>
      </button>
      {error && <p className="ios-field-error" style={{ padding: "0 16px 8px" }}>{error}</p>}
      {menuAbierto && (
        <ActionSheet
          options={[
            { label: t(`${ns}.cambiar`), onClick: () => { setMenuAbierto(false); pickFirma(); } },
            { label: t(`${ns}.eliminar`), danger: true, onClick: () => { setMenuAbierto(false); onPathChange(null); } },
          ]}
          onCancel={() => setMenuAbierto(false)}
        />
      )}
    </>
  );
}

interface Props {
  verTesoreria: boolean;
  treasurerValue: TreasurerFormValues;
  onTreasurerChange: (patch: Partial<TreasurerFormValues>) => void;
  treasurerErrors: TreasurerFormErrors;
  firmaPath: string | null;
  onFirmaPathChange: (path: string | null) => void;
  pastorValue: PastorFormValues;
  onPastorChange: (patch: Partial<PastorFormValues>) => void;
  pastorErrors: PastorFormErrors;
  pastorFirmaPath: string | null;
  onPastorFirmaPathChange: (path: string | null) => void;
}

export default function PersonasSettingsIOS({
  verTesoreria,
  treasurerValue, onTreasurerChange, treasurerErrors, firmaPath, onFirmaPathChange,
  pastorValue, onPastorChange, pastorErrors, pastorFirmaPath, onPastorFirmaPathChange,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="ios-form">
      {verTesoreria && (
        <Section header={t("tesorero.titulo")} footer={t("firma.hint")}>
          <TextField
            label={t("tesorero.nombreLabel")}
            value={treasurerValue.nombre}
            onChange={(v) => onTreasurerChange({ nombre: v })}
            placeholder={t("tesorero.nombrePlaceholder")}
            error={treasurerErrors.nombre}
          />
          <TextField
            label={t("tesorero.cargo")}
            value={treasurerValue.cargo}
            onChange={(v) => onTreasurerChange({ cargo: v })}
            placeholder={t("tesorero.cargoPlaceholder")}
            error={treasurerErrors.cargo}
          />
          <TextField
            label={t("tesorero.correo")}
            value={treasurerValue.email}
            onChange={(v) => onTreasurerChange({ email: v })}
            placeholder={t("tesorero.correoPlaceholder")}
            type="email"
            optional
            stacked
            error={treasurerErrors.email}
          />
          <TextField
            label={t("tesorero.telefono")}
            value={treasurerValue.telefono}
            onChange={(v) => onTreasurerChange({ telefono: v })}
            placeholder={t("tesorero.telefonoPlaceholder")}
            optional
            error={treasurerErrors.telefono}
          />
          <FirmaField ns="firma" label={t("firma.titulo")} path={firmaPath} onPathChange={onFirmaPathChange} />
        </Section>
      )}

      <Section header={t("pastor.titulo")} footer={t("firmaPastor.hint")}>
        <TextField
          label={t("pastor.nombreLabel")}
          value={pastorValue.nombre}
          onChange={(v) => onPastorChange({ nombre: v })}
          placeholder={t("pastor.nombrePlaceholder")}
          error={pastorErrors.nombre}
        />
        <TextField
          label={t("pastor.cargo")}
          value={pastorValue.cargo}
          onChange={(v) => onPastorChange({ cargo: v })}
          placeholder={t("pastor.cargoPlaceholder")}
          error={pastorErrors.cargo}
        />
        <TextField
          label={t("pastor.correo")}
          value={pastorValue.email}
          onChange={(v) => onPastorChange({ email: v })}
          placeholder={t("pastor.correoPlaceholder")}
          type="email"
          optional
          stacked
          error={pastorErrors.email}
        />
        <TextField
          label={t("pastor.telefono")}
          value={pastorValue.telefono}
          onChange={(v) => onPastorChange({ telefono: v })}
          placeholder={t("pastor.telefonoPlaceholder")}
          optional
          error={pastorErrors.telefono}
        />
        <FirmaField ns="firmaPastor" label={t("firmaPastor.titulo")} path={pastorFirmaPath} onPathChange={onPastorFirmaPathChange} />
      </Section>
    </div>
  );
}
