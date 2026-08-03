import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listUsuarios, updateChurch, type Church, type ChurchUpdate, type Usuario } from "../db";
import type { LangPref } from "../i18n";
import { showToast } from "../toast";
import { type EstadoGuardado } from "../components/settings/GuardadoChip";
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

  // ------------------------------------------------------------------
  // Guardado automático (modelo A, decidido el 3 ago 2026): todo se
  // guarda al cambiar, con un indicador por tarjeta que también avisa
  // cuando FALLA. Dos reglas acordadas:
  //
  //  - Los campos de texto esperan ~1 segundo de pausa antes de guardar.
  //    Guardar en cada tecla dispararía decenas de escrituras y, cuando
  //    vuelva el login, la sincronización subiría estados a medio escribir.
  //  - Un error de guardado se queda visible hasta que un guardado
  //    posterior lo resuelva. Si el guardado automático falla en silencio,
  //    el usuario cree que quedó grabado — justo lo que este modelo evita.
  //
  // Mecánica: cada tarjeta es una "rebanada" con su temporizador. Al
  // dispararse, se valida solo esa rebanada y se encola UNA escritura
  // (updateChurch reescribe todas las columnas, así que las escrituras van
  // en fila sobre la última iglesia guardada para que dos rebanadas no se
  // pisen). Al salir de Ajustes, lo pendiente se guarda de inmediato.
  // ------------------------------------------------------------------
  type Tarjeta = "iglesia" | "tesorero" | "firmaTesorero" | "pastor" | "firmaPastor" | "institucion";

  const ESTADO_OCULTO: EstadoGuardado = { tipo: "oculto" };
  const [estados, setEstados] = useState<Record<Tarjeta, EstadoGuardado>>({
    iglesia: ESTADO_OCULTO, tesorero: ESTADO_OCULTO, firmaTesorero: ESTADO_OCULTO,
    pastor: ESTADO_OCULTO, firmaPastor: ESTADO_OCULTO, institucion: ESTADO_OCULTO,
  });

  const montadoRef = useRef(true);
  /** La última iglesia GUARDADA. Base de cada escritura; nunca los formularios. */
  const churchRef = useRef(church);
  useEffect(() => { churchRef.current = church; }, [church]);
  /** Espejo de los formularios para que el temporizador lea lo más reciente. */
  const formsRef = useRef({ churchForm, treasurerForm, pastorForm, institucionForm, firmaPath, pastorFirmaPath });
  formsRef.current = { churchForm, treasurerForm, pastorForm, institucionForm, firmaPath, pastorFirmaPath };

  const timersRef = useRef<Partial<Record<Tarjeta, ReturnType<typeof setTimeout>>>>({});
  const pendientesRef = useRef<Set<Tarjeta>>(new Set());
  /** Fila de escrituras: una a la vez, cada una sobre la anterior. */
  const colaRef = useRef<Promise<void>>(Promise.resolve());

  function setEstado(tj: Tarjeta, e: EstadoGuardado) {
    if (montadoRef.current) setEstados((s) => ({ ...s, [tj]: e }));
  }

  /** Valida la rebanada y arma su parche de columnas. Inválida = no se escribe. */
  function prepararParche(tj: Tarjeta): { patch: Partial<ChurchUpdate>; valido: boolean } {
    const f = formsRef.current;
    if (tj === "iglesia") {
      const nombreErr = f.churchForm.nombre.trim() ? null : t("config.nombreIglesiaObligatorio");
      const saldoTexto = f.churchForm.saldoInicial.replace(/[$,\s]/g, "");
      const saldoNum = saldoTexto === "" ? 0 : Number(saldoTexto);
      const saldoErr = Number.isFinite(saldoNum) ? null : t("validacion.saldoInvalido");
      if (montadoRef.current) { setChurchError(nombreErr); setSaldoError(saldoErr); }
      if (nombreErr || saldoErr) return { patch: {}, valido: false };
      return {
        valido: true,
        patch: {
          nombre: f.churchForm.nombre.trim(),
          ciudad: f.churchForm.ciudad.trim() || null,
          pais: f.churchForm.pais.trim() || null,
          moneda: f.churchForm.moneda,
          saldo_inicial: saldoNum,
        },
      };
    }
    if (tj === "tesorero") {
      const errs: TreasurerFormErrors = {};
      if (!f.treasurerForm.nombre.trim()) errs.nombre = t("validacion.nombreObligatorio");
      if (!f.treasurerForm.cargo.trim()) errs.cargo = t("validacion.cargoObligatorio");
      if (f.treasurerForm.email.trim() && !EMAIL_RE.test(f.treasurerForm.email.trim())) {
        errs.email = t("validacion.correoInvalido");
      }
      if (f.treasurerForm.telefono.trim() && !PHONE_RE.test(f.treasurerForm.telefono.trim())) {
        errs.telefono = t("validacion.telefonoInvalido");
      }
      if (montadoRef.current) setTreasurerErrors(errs);
      if (Object.keys(errs).length > 0) return { patch: {}, valido: false };
      return {
        valido: true,
        patch: {
          tesorero_nombre: f.treasurerForm.nombre.trim() || null,
          tesorero_cargo: f.treasurerForm.cargo.trim() || null,
          tesorero_email: f.treasurerForm.email.trim() || null,
          tesorero_telefono: f.treasurerForm.telefono.trim() || null,
        },
      };
    }
    if (tj === "firmaTesorero") return { valido: true, patch: { tesorero_firma_path: f.firmaPath } };
    if (tj === "firmaPastor") return { valido: true, patch: { pastor_firma_path: f.pastorFirmaPath } };
    if (tj === "pastor") {
      // El pastor es opcional: solo se valida el formato si se llenó algo.
      const errs: PastorFormErrors = {};
      if (f.pastorForm.email.trim() && !EMAIL_RE.test(f.pastorForm.email.trim())) {
        errs.email = t("validacion.correoInvalido");
      }
      if (f.pastorForm.telefono.trim() && !PHONE_RE.test(f.pastorForm.telefono.trim())) {
        errs.telefono = t("validacion.telefonoInvalido");
      }
      if (montadoRef.current) setPastorErrors(errs);
      if (Object.keys(errs).length > 0) return { patch: {}, valido: false };
      return {
        valido: true,
        patch: {
          pastor_nombre: f.pastorForm.nombre.trim() || null,
          pastor_cargo: f.pastorForm.cargo.trim() || null,
          pastor_email: f.pastorForm.email.trim() || null,
          pastor_telefono: f.pastorForm.telefono.trim() || null,
        },
      };
    }
    // institucion: texto libre, sin validación.
    return {
      valido: true,
      patch: {
        direccion: f.institucionForm.direccion.trim() || null,
        region: f.institucionForm.region.trim() || null,
        telefono: f.institucionForm.telefono.trim() || null,
        email: f.institucionForm.email.trim() || null,
        pie_institucional: f.institucionForm.pie_institucional.trim() || null,
        secretaria_nombre: f.institucionForm.secretaria_nombre.trim() || null,
        secretaria_cargo: f.institucionForm.secretaria_cargo.trim() || null,
      },
    };
  }

  function guardarTarjeta(tj: Tarjeta) {
    pendientesRef.current.delete(tj);
    const { patch, valido } = prepararParche(tj);
    if (!valido) {
      setEstado(tj, { tipo: "error", detalle: t("config.revisaCampos") });
      return;
    }
    setEstado(tj, { tipo: "guardando" });
    colaRef.current = colaRef.current
      .then(async () => {
        const actualizada = await updateChurch(church.id, { ...churchRef.current, ...patch });
        churchRef.current = actualizada;
        onChurchUpdated(actualizada);
        setEstado(tj, { tipo: "guardado" });
        // El "Guardado" se apaga solo; un error NO (ver GuardadoChip).
        setTimeout(() => {
          if (montadoRef.current) {
            setEstados((s) => (s[tj].tipo === "guardado" ? { ...s, [tj]: ESTADO_OCULTO } : s));
          }
        }, 2500);
      })
      .catch((e) => {
        setEstado(tj, { tipo: "error", detalle: t("common.noSePudoGuardar", { error: String(e) }) });
      });
  }

  const guardarRef = useRef(guardarTarjeta);
  guardarRef.current = guardarTarjeta;

  /** Texto: ~1 s de pausa. Elegir un archivo o una opción: casi inmediato. */
  function programarGuardado(tj: Tarjeta, retraso = 1000) {
    pendientesRef.current.add(tj);
    clearTimeout(timersRef.current[tj]);
    timersRef.current[tj] = setTimeout(() => guardarRef.current(tj), retraso);
  }

  // Al salir de Ajustes, lo que estaba esperando su pausa se guarda ya:
  // navegar no puede costar el último cambio.
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      for (const tj of pendientesRef.current) {
        clearTimeout(timersRef.current[tj]);
        guardarRef.current(tj);
      }
    };
  }, []);

  // El logo se guarda en el momento de elegirlo (o quitarlo): la vista previa
  // aparece al instante y hacía creer que ya estaba guardado. Entra por la
  // misma fila de escrituras que las demás tarjetas para no pisarse con ellas.
  const cambiarLogo = useCallback((ruta: string | null) => {
    setLogoPath(ruta);
    colaRef.current = colaRef.current
      .then(async () => {
        const actualizada = await updateChurch(church.id, { ...churchRef.current, logo_path: ruta });
        churchRef.current = actualizada;
        onChurchUpdated(actualizada);
      })
      .catch((e) => {
        showToast(t("common.noSePudoGuardar", { error: String(e) }));
      });
  }, [church.id, onChurchUpdated, t]);

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
                onChange={(patch) => { setChurchForm((v) => ({ ...v, ...patch })); programarGuardado("iglesia"); }}
                error={churchError}
                saldoError={saldoError}
                logoPath={logoPath}
                onLogoPathChange={cambiarLogo}
                showCurrency={verTesoreria}
                estado={estados.iglesia}
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
                    onChange={(patch) => { setTreasurerForm((v) => ({ ...v, ...patch })); programarGuardado("tesorero"); }}
                    errors={treasurerErrors}
                    estado={estados.tesorero}
                  />
                  <SignatureUploader
                    path={firmaPath}
                    onPathChange={(p) => { setFirmaPath(p); programarGuardado("firmaTesorero", 50); }}
                    estado={estados.firmaTesorero}
                  />
                </>
              )}
              {/* Pastor: compartido (firma en tesorería y secretaría). */}
              <PastorSettings
                value={pastorForm}
                onChange={(patch) => { setPastorForm((v) => ({ ...v, ...patch })); programarGuardado("pastor"); }}
                errors={pastorErrors}
                estado={estados.pastor}
              />
              <SignatureUploader
                path={pastorFirmaPath}
                onPathChange={(p) => { setPastorFirmaPath(p); programarGuardado("firmaPastor", 50); }}
                variant="pastor"
                estado={estados.firmaPastor}
              />
              {verSecretaria && (
                <InstitucionSettings
                  value={institucionForm}
                  onChange={(patch) => { setInstitucionForm((v) => ({ ...v, ...patch })); programarGuardado("institucion"); }}
                  estado={estados.institucion}
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

          {/* Ya no hay botón global: cada tarjeta guarda sola al cambiar y
              lleva su propio indicador, incluido el de error (modelo A). */}
        </div>
      </div>
    </>
  );
}
