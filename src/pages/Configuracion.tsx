import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listUsuarios, updateChurch, type Church, type Usuario } from "../db";
import type { LangPref } from "../i18n";
import { IconCheck } from "../icons";
import ChurchSettings, { type ChurchFormValues } from "../components/settings/ChurchSettings";
import InstitucionSettings, { type InstitucionFormValues } from "../components/settings/InstitucionSettings";
import TreasurerSettings, {
  type TreasurerFormErrors, type TreasurerFormValues,
} from "../components/settings/TreasurerSettings";
import PastorSettings, {
  type PastorFormErrors, type PastorFormValues,
} from "../components/settings/PastorSettings";
import SignatureUploader from "../components/settings/SignatureUploader";
import UsersSettings from "../components/settings/UsersSettings";
import PDFPreview from "../components/settings/PDFPreview";
import AppearanceSettings, { type ThemePref } from "../components/settings/AppearanceSettings";
import LanguageSettings from "../components/settings/LanguageSettings";
import SoundSettings from "../components/settings/SoundSettings";
import RoleSettings from "../components/settings/RoleSettings";
import BackupSettings from "../components/settings/BackupSettings";
import CategoriesSettings from "../components/settings/CategoriesSettings";
import type { Role } from "../role";

interface Props {
  church: Church;
  onChurchUpdated: (c: Church) => void;
  themePref: ThemePref;
  onThemePrefChange: (pref: ThemePref) => void;
  langPref: LangPref;
  onLangPrefChange: (pref: LangPref) => void;
  role: Role;
  onRoleChange: (r: Role) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()-]{7,20}$/;

export default function Configuracion({
  church, onChurchUpdated, themePref, onThemePrefChange, langPref, onLangPrefChange, role, onRoleChange,
}: Props) {
  const { t } = useTranslation();
  const [churchForm, setChurchForm] = useState<ChurchFormValues>({
    nombre: church.nombre,
    ciudad: church.ciudad ?? "",
    pais: church.pais ?? "",
    moneda: church.moneda,
  });
  const [treasurerForm, setTreasurerForm] = useState<TreasurerFormValues>({
    nombre: church.tesorero_nombre ?? "",
    cargo: church.tesorero_cargo ?? "Tesorero",
    email: church.tesorero_email ?? "",
    telefono: church.tesorero_telefono ?? "",
  });
  const [firmaPath, setFirmaPath] = useState<string | null>(church.tesorero_firma_path ?? null);
  const [pastorForm, setPastorForm] = useState<PastorFormValues>({
    nombre: church.pastor_nombre ?? "",
    cargo: church.pastor_cargo ?? "Pastor",
    email: church.pastor_email ?? "",
    telefono: church.pastor_telefono ?? "",
  });
  const [pastorFirmaPath, setPastorFirmaPath] = useState<string | null>(church.pastor_firma_path ?? null);
  const [logoPath, setLogoPath] = useState<string | null>(church.logo_path ?? null);
  const [institucionForm, setInstitucionForm] = useState<InstitucionFormValues>({
    direccion: church.direccion ?? "",
    region: church.region ?? "",
    telefono: church.telefono ?? "",
    email: church.email ?? "",
    pie_institucional: church.pie_institucional ?? "",
    secretaria_nombre: church.secretaria_nombre ?? "",
    secretaria_cargo: church.secretaria_cargo ?? "",
  });

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const refrescarUsuarios = () => { listUsuarios(church.id).then(setUsuarios).catch(console.error); };
  useEffect(refrescarUsuarios, [church.id]);

  const [churchError, setChurchError] = useState<string | null>(null);
  const [treasurerErrors, setTreasurerErrors] = useState<TreasurerFormErrors>({});
  const [pastorErrors, setPastorErrors] = useState<PastorFormErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty =
    churchForm.nombre !== church.nombre ||
    churchForm.ciudad !== (church.ciudad ?? "") ||
    churchForm.pais !== (church.pais ?? "") ||
    churchForm.moneda !== church.moneda ||
    treasurerForm.nombre !== (church.tesorero_nombre ?? "") ||
    treasurerForm.cargo !== (church.tesorero_cargo ?? "Tesorero") ||
    treasurerForm.email !== (church.tesorero_email ?? "") ||
    treasurerForm.telefono !== (church.tesorero_telefono ?? "") ||
    firmaPath !== (church.tesorero_firma_path ?? null) ||
    pastorForm.nombre !== (church.pastor_nombre ?? "") ||
    pastorForm.cargo !== (church.pastor_cargo ?? "Pastor") ||
    pastorForm.email !== (church.pastor_email ?? "") ||
    pastorForm.telefono !== (church.pastor_telefono ?? "") ||
    pastorFirmaPath !== (church.pastor_firma_path ?? null) ||
    logoPath !== (church.logo_path ?? null) ||
    institucionForm.direccion !== (church.direccion ?? "") ||
    institucionForm.region !== (church.region ?? "") ||
    institucionForm.telefono !== (church.telefono ?? "") ||
    institucionForm.email !== (church.email ?? "") ||
    institucionForm.pie_institucional !== (church.pie_institucional ?? "") ||
    institucionForm.secretaria_nombre !== (church.secretaria_nombre ?? "") ||
    institucionForm.secretaria_cargo !== (church.secretaria_cargo ?? "");

  async function guardar() {
    setGeneralError(null);

    const nextChurchError = churchForm.nombre.trim() ? null : t("config.nombreIglesiaObligatorio");
    const nextTreasurerErrors: TreasurerFormErrors = {};
    if (!treasurerForm.nombre.trim()) nextTreasurerErrors.nombre = t("validacion.nombreObligatorio");
    if (!treasurerForm.cargo.trim()) nextTreasurerErrors.cargo = t("validacion.cargoObligatorio");
    if (treasurerForm.email.trim() && !EMAIL_RE.test(treasurerForm.email.trim())) {
      nextTreasurerErrors.email = t("validacion.correoInvalido");
    }
    if (treasurerForm.telefono.trim() && !PHONE_RE.test(treasurerForm.telefono.trim())) {
      nextTreasurerErrors.telefono = t("validacion.telefonoInvalido");
    }

    // El pastor es opcional: solo se valida el formato si se llenó algo.
    const nextPastorErrors: PastorFormErrors = {};
    if (pastorForm.email.trim() && !EMAIL_RE.test(pastorForm.email.trim())) {
      nextPastorErrors.email = t("validacion.correoInvalido");
    }
    if (pastorForm.telefono.trim() && !PHONE_RE.test(pastorForm.telefono.trim())) {
      nextPastorErrors.telefono = t("validacion.telefonoInvalido");
    }

    setChurchError(nextChurchError);
    setTreasurerErrors(nextTreasurerErrors);
    setPastorErrors(nextPastorErrors);
    if (nextChurchError || Object.keys(nextTreasurerErrors).length > 0 || Object.keys(nextPastorErrors).length > 0) return;

    setSaving(true);
    try {
      const updated = await updateChurch(church.id, {
        nombre: churchForm.nombre.trim(),
        ciudad: churchForm.ciudad.trim() || null,
        pais: churchForm.pais.trim() || null,
        moneda: churchForm.moneda,
        logo_path: logoPath,
        tesorero_nombre: treasurerForm.nombre.trim() || null,
        tesorero_cargo: treasurerForm.cargo.trim() || null,
        tesorero_email: treasurerForm.email.trim() || null,
        tesorero_telefono: treasurerForm.telefono.trim() || null,
        tesorero_firma_path: firmaPath,
        pastor_nombre: pastorForm.nombre.trim() || null,
        pastor_cargo: pastorForm.cargo.trim() || null,
        pastor_email: pastorForm.email.trim() || null,
        pastor_telefono: pastorForm.telefono.trim() || null,
        pastor_firma_path: pastorFirmaPath,
        direccion: institucionForm.direccion.trim() || null,
        region: institucionForm.region.trim() || null,
        telefono: institucionForm.telefono.trim() || null,
        email: institucionForm.email.trim() || null,
        pie_institucional: institucionForm.pie_institucional.trim() || null,
        secretaria_nombre: institucionForm.secretaria_nombre.trim() || null,
        secretaria_cargo: institucionForm.secretaria_cargo.trim() || null,
      });
      onChurchUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setGeneralError(t("common.noSePudoGuardar", { error: String(e) }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("config.titulo")}</div>
          <div className="page-sub">{t("config.sub")}</div>
        </div>
      </div>

      <div className="content">
        <div className="settings-page">
          <div className="settings-grid">
            <div className="settings-stack">
              <ChurchSettings
                value={churchForm}
                onChange={(patch) => setChurchForm((v) => ({ ...v, ...patch }))}
                error={churchError}
                logoPath={logoPath}
                onLogoPathChange={setLogoPath}
              />

              <TreasurerSettings
                value={treasurerForm}
                onChange={(patch) => setTreasurerForm((v) => ({ ...v, ...patch }))}
                errors={treasurerErrors}
              />

              <SignatureUploader path={firmaPath} onPathChange={setFirmaPath} />

              <PastorSettings
                value={pastorForm}
                onChange={(patch) => setPastorForm((v) => ({ ...v, ...patch }))}
                errors={pastorErrors}
              />

              <SignatureUploader path={pastorFirmaPath} onPathChange={setPastorFirmaPath} variant="pastor" />

              <InstitucionSettings
                value={institucionForm}
                onChange={(patch) => setInstitucionForm((v) => ({ ...v, ...patch }))}
              />
            </div>

            {/* Columna derecha: vista previa del PDF + ajustes y administración,
                para equilibrar la altura con la columna izquierda. */}
            <div className="settings-stack">
              <PDFPreview
                churchNombre={churchForm.nombre}
                tesoreroNombre={treasurerForm.nombre}
                tesoreroCargo={treasurerForm.cargo}
              />

              <RoleSettings value={role} onChange={onRoleChange} />

              <AppearanceSettings value={themePref} onChange={onThemePrefChange} />

              <LanguageSettings value={langPref} onChange={onLangPrefChange} />

              <SoundSettings />

              <UsersSettings church={church} usuarios={usuarios} onChanged={refrescarUsuarios} />

              <CategoriesSettings church={church} onChanged={() => { /* la caché ya se refrescó; las páginas releen al montar */ }} />

              <BackupSettings church={church} />
            </div>
          </div>

          {generalError && <div className="form-warning">{generalError}</div>}

          <div className="settings-actions">
            <button className="btn primary" onClick={guardar} disabled={saving || !dirty}>
              {saving ? t("common.guardando") : t("common.guardarCambios")}
            </button>
            {saved && (
              <span className="settings-saved-pill">
                <IconCheck size={14} /> {t("common.guardado")}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
