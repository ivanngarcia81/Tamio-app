import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listUsuarios, updateChurch, type Church, type Usuario } from "../db";
import type { LangPref } from "../i18n";
import { IconCheck } from "../icons";
import { showToast } from "../toast";
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
import ComprobantesPendientes from "../components/settings/ComprobantesPendientes";
import RestoreSettings from "../components/settings/RestoreSettings";
import CompactSettings from "../components/settings/CompactSettings";
import DangerZoneSettings from "../components/settings/DangerZoneSettings";
import SyncSettings from "../components/settings/SyncSettings";
import { SYNC_HABILITADO } from "../syncManager";
import CategoriesSettings from "../components/settings/CategoriesSettings";
import PlanSettings from "../components/settings/PlanSettings";
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
  /** Con login activo la sesión vive en el sidebar; aquí solo se muestra el
   *  selector manual de rol cuando NO hay login configurado. */
  authActivo: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()-]{7,20}$/;

export default function Configuracion({
  church, onChurchUpdated, themePref, onThemePrefChange, langPref, onLangPrefChange, role, onRoleChange,
  authActivo,
}: Props) {
  const { t } = useTranslation();
  // Reparto de Ajustes por rol: cada quien ve solo lo suyo + lo común.
  // - Tesorería (tesorero + admin): datos/firma del tesorero, vista previa del
  //   PDF, categorías y la moneda.
  // - Secretaría (secretaria + admin): datos institucionales.
  // - Pastor: compartido (firma en ambas áreas), visible para todos.
  // - Usuarios y Respaldo: solo administrador (datos sensibles / acción
  //   destructiva de importar).
  const esAdmin = role === "administrador";
  const verTesoreria = esAdmin || role === "tesorero";
  const verSecretaria = esAdmin || role === "secretaria";
  const [churchForm, setChurchForm] = useState<ChurchFormValues>({
    nombre: church.nombre,
    ciudad: church.ciudad ?? "",
    pais: church.pais ?? "",
    moneda: church.moneda,
    // 0 se muestra vacío: el caso común (arrancar de cero) no obliga a nadie
    // a entender qué es un "saldo de apertura".
    saldoInicial: church.saldo_inicial ? String(church.saldo_inicial) : "",
  });
  const [saldoError, setSaldoError] = useState<string | null>(null);
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

  // El logo se guarda en el momento de elegirlo (o quitarlo), sin esperar al
  // botón "Guardar cambios" del final de la página: la vista previa aparece al
  // instante y hacía creer que ya estaba guardado, así que el usuario salía de
  // Ajustes y el logo nunca llegaba al sidebar ni a los PDF.
  const cambiarLogo = useCallback(async (ruta: string | null) => {
    setLogoPath(ruta);
    try {
      // updateChurch reescribe TODAS las columnas, así que se parte de la
      // iglesia guardada y solo se cambia el logo. Nunca de churchForm: los
      // demás campos siguen editándose y se guardan con "Guardar cambios".
      onChurchUpdated(await updateChurch(church.id, { ...church, logo_path: ruta }));
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    }
  }, [church, onChurchUpdated, t]);

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
    // La sección del tesorero solo se valida cuando el rol la ve (si no, sus
    // campos ni se muestran y no deben bloquear el guardado de la secretaria).
    const nextTreasurerErrors: TreasurerFormErrors = {};
    if (verTesoreria) {
      if (!treasurerForm.nombre.trim()) nextTreasurerErrors.nombre = t("validacion.nombreObligatorio");
      if (!treasurerForm.cargo.trim()) nextTreasurerErrors.cargo = t("validacion.cargoObligatorio");
      if (treasurerForm.email.trim() && !EMAIL_RE.test(treasurerForm.email.trim())) {
        nextTreasurerErrors.email = t("validacion.correoInvalido");
      }
      if (treasurerForm.telefono.trim() && !PHONE_RE.test(treasurerForm.telefono.trim())) {
        nextTreasurerErrors.telefono = t("validacion.telefonoInvalido");
      }
    }

    // El pastor es opcional: solo se valida el formato si se llenó algo.
    const nextPastorErrors: PastorFormErrors = {};
    if (pastorForm.email.trim() && !EMAIL_RE.test(pastorForm.email.trim())) {
      nextPastorErrors.email = t("validacion.correoInvalido");
    }
    if (pastorForm.telefono.trim() && !PHONE_RE.test(pastorForm.telefono.trim())) {
      nextPastorErrors.telefono = t("validacion.telefonoInvalido");
    }

    // Saldo de apertura: tolera "$1,234.56" y espacios; vacío = 0. Un texto
    // no numérico se rechaza en vez de guardarse silenciosamente como 0.
    const saldoTexto = churchForm.saldoInicial.replace(/[$,\s]/g, "");
    const saldoNum = saldoTexto === "" ? 0 : Number(saldoTexto);
    const nextSaldoError = Number.isFinite(saldoNum) ? null : t("validacion.saldoInvalido");

    setChurchError(nextChurchError);
    setSaldoError(nextSaldoError);
    setTreasurerErrors(nextTreasurerErrors);
    setPastorErrors(nextPastorErrors);
    if (nextChurchError || nextSaldoError || Object.keys(nextTreasurerErrors).length > 0 || Object.keys(nextPastorErrors).length > 0) return;

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
        saldo_inicial: saldoNum,
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
          {/* Mosaico de 2 columnas balanceadas: las tarjetas fluyen y el CSS
              reparte las alturas, así no queda una columna larga y otra vacía
              cuando el rol/plan oculta tarjetas. */}
          {/* Zonas con jerarquía visual: cada categoría vive en su propio
              contenedor (panel plano) con título, y las tarjetas se elevan
              encima. El mosaico interno balancea las alturas por zona. */}
          <section className="settings-zona">
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.identidad")}</div>
              <div className="settings-zona-sub">{t("config.zona.identidadSub")}</div>
            </div>
            <div className="settings-masonry">
              <ChurchSettings
                value={churchForm}
                onChange={(patch) => setChurchForm((v) => ({ ...v, ...patch }))}
                error={churchError}
                saldoError={saldoError}
                logoPath={logoPath}
                onLogoPathChange={cambiarLogo}
                showCurrency={verTesoreria}
              />
              {/* Suscripción: la administra el dueño (admin) o, en modo local
                  sin login, quien usa la app en su propia instalación. */}
              {(esAdmin || !authActivo) && <PlanSettings church={church} onSaved={onChurchUpdated} />}
              {authActivo && SYNC_HABILITADO && <SyncSettings />}
            </div>
          </section>

          <section className="settings-zona">
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.trabajo")}</div>
              <div className="settings-zona-sub">{t("config.zona.trabajoSub")}</div>
            </div>
            <div className="settings-masonry">
              {verTesoreria && (
                <>
                  <TreasurerSettings
                    value={treasurerForm}
                    onChange={(patch) => setTreasurerForm((v) => ({ ...v, ...patch }))}
                    errors={treasurerErrors}
                  />
                  <SignatureUploader path={firmaPath} onPathChange={setFirmaPath} />
                </>
              )}
              {/* Pastor: compartido (firma en tesorería y secretaría). */}
              <PastorSettings
                value={pastorForm}
                onChange={(patch) => setPastorForm((v) => ({ ...v, ...patch }))}
                errors={pastorErrors}
              />
              <SignatureUploader path={pastorFirmaPath} onPathChange={setPastorFirmaPath} variant="pastor" />
              {verSecretaria && (
                <InstitucionSettings
                  value={institucionForm}
                  onChange={(patch) => setInstitucionForm((v) => ({ ...v, ...patch }))}
                />
              )}
              {esAdmin && <UsersSettings church={church} usuarios={usuarios} onChanged={refrescarUsuarios} />}
              {verTesoreria && (
                <CategoriesSettings church={church} onChanged={() => { /* la caché ya se refrescó; las páginas releen al montar */ }} />
              )}
              {verTesoreria && (
                <PDFPreview
                  churchNombre={churchForm.nombre}
                  tesoreroNombre={treasurerForm.nombre}
                  tesoreroCargo={treasurerForm.cargo}
                />
              )}
            </div>
          </section>

          <section className="settings-zona">
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.preferencias")}</div>
              <div className="settings-zona-sub">{t("config.zona.preferenciasSub")}</div>
            </div>
            <div className="settings-masonry">
              {!authActivo && <RoleSettings value={role} onChange={onRoleChange} />}
              <AppearanceSettings value={themePref} onChange={onThemePrefChange} />
              <LanguageSettings value={langPref} onChange={onLangPrefChange} />
              <SoundSettings />
            </div>
          </section>

          {esAdmin && (
            <section className="settings-zona peligro">
              <div className="settings-zona-head">
                <div className="settings-zona-titulo">{t("config.zona.delicada")}</div>
                <div className="settings-zona-sub">{t("config.zona.delicadaSub")}</div>
              </div>
              <div className="settings-masonry">
                <BackupSettings church={church} />
                {/* Solo se pinta si hay algo que recuperar; si no, devuelve null. */}
                <ComprobantesPendientes church={church} />
                <RestoreSettings />
                <CompactSettings church={church} />
                <DangerZoneSettings church={church} />
              </div>
            </section>
          )}

          {generalError && <div className="form-warning">{generalError}</div>}

          {/* Con cambios pendientes la barra se pega abajo y avisa; sin ellos
              vuelve a ser el pie discreto de siempre. */}
          <div className={`settings-actions${dirty ? " pegada" : ""}`}>
            {dirty && <span className="settings-sin-guardar">{t("config.cambiosSinGuardar")}</span>}
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
