import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getVersion } from "@tauri-apps/api/app";
import { listUsuarios, updateChurch, type Church, type ChurchUpdate, type Usuario } from "../db";
import type { LangPref } from "../i18n";
import { CERO, aTextoEditable, deTexto } from "../dinero";
import { showToast } from "../toast";
import { esIPhone } from "../movil";
import ActionSheet from "../components/ActionSheet";
import Portal from "../components/Portal";
import GuardadoChip, { type EstadoGuardado } from "../components/settings/GuardadoChip";
import ChurchSettings, { type ChurchFormValues } from "../components/settings/ChurchSettings";
import ChurchSettingsIOS from "../components/settings/ChurchSettingsIOS";
import CuentaSettingsIOS from "../components/settings/CuentaSettingsIOS";
import InstitucionSettings, { type InstitucionFormValues } from "../components/settings/InstitucionSettings";
import InstitucionSettingsIOS from "../components/settings/InstitucionSettingsIOS";
import AccesosSettingsIOS from "../components/settings/AccesosSettingsIOS";
import TreasurerSettings, {
  type TreasurerFormErrors, type TreasurerFormValues,
} from "../components/settings/TreasurerSettings";
import PastorSettings, {
  type PastorFormErrors, type PastorFormValues,
} from "../components/settings/PastorSettings";
import PersonasSettingsIOS from "../components/settings/PersonasSettingsIOS";
import SignatureUploader from "../components/settings/SignatureUploader";
import UsersSettings from "../components/settings/UsersSettings";
import InvitarUsuario from "../components/settings/InvitarUsuario";
import PDFPreview from "../components/settings/PDFPreview";
import AppearanceSettings, { type ThemePref } from "../components/settings/AppearanceSettings";
import AccentSettings, { type Acento } from "../components/settings/AccentSettings";
import LanguageSettings from "../components/settings/LanguageSettings";
import SoundSettings from "../components/settings/SoundSettings";
import PreferenciasSettingsIOS from "../components/settings/PreferenciasSettingsIOS";
import RoleSettings from "../components/settings/RoleSettings";
import BackupSettings from "../components/settings/BackupSettings";
import ComprobantesPendientes from "../components/settings/ComprobantesPendientes";
import RestoreSettings from "../components/settings/RestoreSettings";
import CompactSettings from "../components/settings/CompactSettings";
import DangerZoneSettings from "../components/settings/DangerZoneSettings";
import SyncSettings from "../components/settings/SyncSettings";
import { SYNC_HABILITADO } from "../syncManager";
import CategoriesSettings from "../components/settings/CategoriesSettings";
import CategoriesSettingsIOS from "../components/settings/CategoriesSettingsIOS";
import PlanSettings from "../components/settings/PlanSettings";
import type { Role } from "../role";
import {
  IconChurch, IconIdBadge, IconFileText, IconUser, IconTag, IconMonitor, IconWarn,
  IconChevronLeft, IconChevronRight, IconTamio,
} from "../icons";
import { IOSNavBar } from "../components/ios/FormularioIOS";
import { useSwipeBack } from "../hooks/useSwipeBack";

/** Chevron de la lista agrupada de iPhone: 7×12px reales, no el ícono
 *  cuadrado de `IconChevronRight` (pensado para 1:1) estirado a la fuerza.
 *  Mismo trazo fino que usa iOS en sus listas de Ajustes. */
function IosChevron() {
  return (
    <span className="ios-chevron" aria-hidden="true">
      <svg viewBox="0 0 7 12"><path d="M1 1l5 5-5 5" /></svg>
    </span>
  );
}

interface Props {
  church: Church;
  onChurchUpdated: (c: Church) => void;
  themePref: ThemePref;
  onThemePrefChange: (pref: ThemePref) => void;
  acento: Acento;
  onAcentoChange: (a: Acento) => void;
  langPref: LangPref;
  onLangPrefChange: (pref: LangPref) => void;
  role: Role;
  onRoleChange: (r: Role) => void;
  /** Con login activo la sesión vive en el sidebar (iPad/Mac) o en la zona
   *  "Cuenta" de aquí (iPhone, ver esIPhone); aquí sin login solo se muestra
   *  el selector manual de rol. */
  authActivo: boolean;
  /** Sesión y su edición: el sidebar los recibía ya listos desde App.tsx
   *  (useSupabaseAuth); esta zona los reutiliza tal cual para no duplicar
   *  esa lógica. Solo hacen falta en iPhone, donde no hay sidebar. */
  sesionEmail?: string | null;
  sesionNombre?: string | null;
  sesionFoto?: string | null;
  onEditarPerfil?: () => void;
  onSalir?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()-]{7,20}$/;

export default function Configuracion({
  church, onChurchUpdated, themePref, onThemePrefChange, acento, onAcentoChange,
  langPref, onLangPrefChange, role, onRoleChange,
  authActivo, sesionEmail, sesionNombre, sesionFoto, onEditarPerfil, onSalir,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
  // El sidebar no existe en iPhone (bug de acceso corregido en main.tsx /
  // styles.css: split view no corresponde ahí). Esta zona sustituye lo que
  // el sidebar tenía y no vivía ya en otra parte de Ajustes o en la barra
  // inferior: organización, cuenta, sincronización, ayuda, acerca de y
  // cerrar sesión. En iPad/Mac el sidebar sigue igual, así que aquí no
  // hace falta repetir nada.
  const enIPhone = esIPhone();

  // Ajustes con índice (13 ago 2026, idea de "Proyecto B" en plan-1-1.md):
  // una columna de zonas a la izquierda, una a la vez a la derecha, en vez de
  // una página larga con las seis zonas apiladas. Cambia el CONTENEDOR, no el
  // contenido — cada <section> sigue siendo exactamente la misma de antes,
  // solo se oculta con CSS cuando no es la zona activa. Así el guardado
  // automático y sus temporizadores (más abajo) no se enteran del cambio.
  const ZONAS = [
    { key: "cuenta", icono: <IconUser size={16} />, titulo: t("config.zona.cuenta"), visible: enIPhone },
    { key: "iglesia", icono: <IconChurch size={16} />, titulo: t("config.zona.iglesia"), visible: true },
    { key: "acceso", icono: <IconIdBadge size={16} />, titulo: t("config.zona.acceso"), visible: true },
    { key: "institucion", icono: <IconFileText size={16} />, titulo: t("config.zona.institucion"), visible: true },
    { key: "personas", icono: <IconUser size={16} />, titulo: t("config.zona.personas"), visible: true },
    { key: "categorias", icono: <IconTag size={16} />, titulo: t("config.zona.categorias"), visible: verTesoreria },
    { key: "preferencias", icono: <IconMonitor size={16} />, titulo: t("config.zona.preferencias"), visible: true },
    { key: "delicada", icono: <IconWarn size={16} />, titulo: t("config.zona.delicada"), visible: esAdmin },
  ] as const;
  type ZonaKey = (typeof ZONAS)[number]["key"];
  const ZONAS_POR_KEY = Object.fromEntries(ZONAS.map((z) => [z.key, z])) as Record<ZonaKey, (typeof ZONAS)[number]>;

  // Lista agrupada estilo iOS (enIPhone, ver más abajo): mismas zonas,
  // iconos y guardas de rol que ZONAS de arriba — una sola fuente de
  // verdad para qué existe y quién lo ve — más el tinte del icono, el
  // valor secundario (nombre de iglesia/tesorero) y en qué tarjeta cae
  // cada una. En Mac/iPad no se usa: ahí sigue el índice de siempre.
  const TINTE_IOS: Record<ZonaKey, string> = {
    cuenta: "var(--ios-gray)",
    iglesia: "var(--ios-green)",
    acceso: "var(--ios-blue)",
    institucion: "var(--ios-indigo)",
    personas: "var(--ios-teal)",
    categorias: "var(--ios-orange)",
    preferencias: "var(--ios-gray)",
    delicada: "var(--ios-red)",
  };
  const VALOR_IOS: Partial<Record<ZonaKey, string>> = {
    iglesia: church.nombre,
    personas: church.tesorero_nombre ?? undefined,
  };
  const SECCIONES_IOS: { key: string; encabezado?: string; pie?: string; filas: ZonaKey[] }[] = [
    { key: "cuenta", filas: ["cuenta"] },
    {
      key: "iglesia",
      encabezado: t("config.zona.iglesia"),
      pie: t("config.zona.iglesiaPie"),
      filas: ["iglesia", "institucion", "personas", "acceso"],
    },
    { key: "general", encabezado: t("config.zona.grupoGeneral"), filas: ["categorias", "preferencias"] },
    { key: "delicada", pie: t("config.zona.delicadaPie"), filas: ["delicada"] },
  ];

  // En una pantalla angosta (teléfono) arranca sin zona elegida, mostrando
  // solo el índice — hay que tocar una para ver su contenido. En Mac/iPad,
  // que sí tienen sitio para las dos columnas, arranca en "Iglesia" para no
  // dejar la mitad de la pantalla vacía al entrar.
  const [zonaActiva, setZonaActiva] = useState<string | null>(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches ? null : "iglesia"
  ));
  const claseZona = (key: string) => `settings-zona${zonaActiva === key ? "" : " settings-zona-inactiva"}`;
  // Volver deslizando desde el borde izquierdo, como cualquier pantalla
  // "empujada" de iOS. No hay rutas por zona (`zonaActiva` es solo estado),
  // así que no hay gesto de router que activar — se reconoce a mano (ver
  // el hook). Solo mientras hay una zona abierta en iPhone: en el índice no
  // hay a dónde volver, y en Mac/iPad las dos columnas conviven siempre.
  const contentRef = useSwipeBack(enIPhone && zonaActiva !== null, () => setZonaActiva(null));
  const [salirAbierto, setSalirAbierto] = useState(false);
  const [acercaDeAbierto, setAcercaDeAbierto] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  // Antes solo se pedía al abrir "Acerca de". La lista agrupada de iPhone
  // (enIPhone) lleva su propio pie "Tamio {versión}" siempre visible, así
  // que hace falta desde que se monta la pantalla, no solo dentro de ese
  // diálogo — se pide una vez, sirve para los dos sitios.
  useEffect(() => {
    if (version === null) getVersion().then(setVersion).catch(() => setVersion("—"));
  }, [version]);
  const [churchForm, setChurchForm] = useState<ChurchFormValues>({
    nombre: church.nombre,
    ciudad: church.ciudad ?? "",
    estadoProvincia: church.estado_provincia ?? "",
    codigoPostal: church.codigo_postal ?? "",
    pais: church.pais ?? "",
    ein: church.ein ?? "",
    moneda: church.moneda,
    // 0 se muestra vacío: el caso común (arrancar de cero) no obliga a nadie
    // a entender qué es un "saldo de apertura".
    saldoInicial: church.saldo_inicial ? aTextoEditable(church.saldo_inicial) : "",
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
      // El saldo de apertura es lo único de esta pantalla que es dinero:
      // se parsea con deTexto igual que cualquier otro importe tecleado.
      const saldoNum = saldoTexto === "" ? CERO : deTexto(saldoTexto);
      const saldoErr = saldoNum !== null ? null : t("validacion.saldoInvalido");
      if (montadoRef.current) { setChurchError(nombreErr); setSaldoError(saldoErr); }
      if (nombreErr || saldoErr) return { patch: {}, valido: false };
      return {
        valido: true,
        patch: {
          nombre: f.churchForm.nombre.trim(),
          ciudad: f.churchForm.ciudad.trim() || null,
          estado_provincia: f.churchForm.estadoProvincia.trim() || null,
          codigo_postal: f.churchForm.codigoPostal.trim() || null,
          pais: f.churchForm.pais.trim() || null,
          ein: f.churchForm.ein.trim() || null,
          moneda: f.churchForm.moneda,
          saldo_inicial: saldoNum ?? CERO,
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

  const zonaActivaInfo = zonaActiva ? ZONAS_POR_KEY[zonaActiva as (typeof ZONAS)[number]["key"]] : undefined;

  // El hueco de acción de `.ios-nav` (Configuracion.tsx, iPhone) no lleva un
  // botón "Guardar" —el guardado sigue siendo automático, por campo— pero SÍ
  // necesita seguir avisando cuando algo se está guardando o falló: eso ya
  // existía por tarjeta (GuardadoChip) y se perdía sin más al quitar la
  // cabecera de cada tarjeta. Una zona puede tener varias tarjetas (Tesorero
  // y pastor: 4) así que se combinan en un solo estado — un error pesa más
  // que "guardando", que pesa más que "guardado" — para no atarse a un
  // orden de prioridad. */
  function combinarEstados(...lista: EstadoGuardado[]): EstadoGuardado {
    return (
      lista.find((e) => e.tipo === "error")
      ?? lista.find((e) => e.tipo === "guardando")
      ?? lista.find((e) => e.tipo === "guardado")
      ?? ESTADO_OCULTO
    );
  }
  const ESTADOS_POR_ZONA: Partial<Record<string, EstadoGuardado>> = {
    iglesia: estados.iglesia,
    institucion: estados.institucion,
    personas: combinarEstados(estados.tesorero, estados.pastor, estados.firmaTesorero, estados.firmaPastor),
  };
  const estadoNavBar = zonaActiva ? ESTADOS_POR_ZONA[zonaActiva] ?? ESTADO_OCULTO : ESTADO_OCULTO;
  // El hueco de acción es angosto y comparte fila con el título centrado —
  // "guardando"/"guardado" son siempre cortos y caben, pero un error es
  // texto libre (puede venir de cualquier fallo de red o de guardado) y
  // GuardadoChip lo pinta en un `inline-flex` (ícono + texto): el
  // `text-overflow: ellipsis` de un solo nodo de texto no funciona ahí, así
  // que un error largo empujaba el título en vez de recortarse. El detalle
  // completo ya se ve en el campo que falló (TextField.error); aquí basta
  // el ícono para avisar que algo no se guardó. */
  const accionNavBar = estadoNavBar.tipo === "error"
    ? <span className="ios-nav-action-warn"><IconWarn size={16} /></span>
    : estadoNavBar.tipo !== "oculto" ? <GuardadoChip estado={estadoNavBar} /> : undefined;

  return (
    <>
      {/* El título grande solo va en la pantalla raíz (el índice de zonas):
          al entrar a una, la lleva su propia nav bar (IOSNavBar, más abajo)
          y repetirlo aquí encima sería el mismo título dos veces. La copia
          fija de la barra al hacer scroll (`.titulo-fijo`, App.tsx) lee el
          texto de `.page-title` en vivo, así que con este bloque fuera del
          DOM esa copia queda vacía en vez de mostrar "Ajustes" duplicado. */}
      {!(enIPhone && zonaActiva) && (
        <div className="header">
          <div>
            <div className="page-title">{t("config.titulo")}</div>
            {/* En iPhone (lista agrupada estilo iOS, ver más abajo) este
                subtítulo se quita: su contenido pasa a repartirse entre los
                pies de sección ("Define quién entra a Tesorería...",
                "Respaldos, restauración..."). En Mac/iPad no cambia. */}
            {!enIPhone && <div className="page-sub">{t("config.sub")}</div>}
          </div>
        </div>
      )}

      {enIPhone && zonaActiva && (
        <IOSNavBar
          backLabel={t("nav.ajustes")}
          title={zonaActivaInfo?.titulo ?? ""}
          onBack={() => setZonaActiva(null)}
          action={accionNavBar}
        />
      )}

      <div className="content" ref={contentRef as React.RefObject<HTMLDivElement>}>
        <div className={`settings-shell${zonaActiva ? " zona-abierta" : ""}`}>
          {enIPhone ? (
            <nav className="ios-lista" aria-label={t("config.titulo")}>
              {SECCIONES_IOS.map((seccion) => {
                const filas = seccion.filas.map((k) => ZONAS_POR_KEY[k]).filter((z) => z.visible);
                if (filas.length === 0) return null;
                return (
                  <section className="ios-section" key={seccion.key}>
                    {seccion.encabezado && <h2 className="ios-section-header">{seccion.encabezado}</h2>}
                    <div className="ios-group">
                      {filas.map((z) => (
                        <button
                          type="button"
                          key={z.key}
                          className={`ios-row${z.key === "delicada" ? " ios-row--destructive" : ""}`}
                          onClick={() => setZonaActiva(z.key)}
                        >
                          <span className="ios-icon" style={{ background: TINTE_IOS[z.key] }}>{z.icono}</span>
                          <span className="ios-row-label">{z.titulo}</span>
                          {VALOR_IOS[z.key] && <span className="ios-row-value">{VALOR_IOS[z.key]}</span>}
                          <IosChevron />
                        </button>
                      ))}
                    </div>
                    {seccion.pie && <p className="ios-section-footer">{seccion.pie}</p>}
                  </section>
                );
              })}
              <p className="ios-version">{version && t("config.pieVersion", { version })}</p>
            </nav>
          ) : (
            <nav className="settings-nav">
              {ZONAS.filter((z) => z.visible).map((z) => (
                <button
                  key={z.key}
                  type="button"
                  className={`settings-nav-item${zonaActiva === z.key ? " activo" : ""}`}
                  onClick={() => setZonaActiva(z.key)}
                >
                  <span className="settings-nav-icono">{z.icono}</span>
                  <span className="settings-nav-nombre">{z.titulo}</span>
                  <span className="settings-nav-flecha"><IconChevronRight size={13} /></span>
                </button>
              ))}
            </nav>
          )}

          <div className="settings-detail">
            {/* En iPhone el volver ya lo lleva `.ios-nav` (fija, arriba de
                todo) — este botón es solo para Mac/iPad y para una ventana
                de escritorio angosta (el media query de abajo), donde no
                hay `.ios-nav`. Sin la guarda, en un iPhone real (que
                también cae bajo ese mismo media query, por ancho) saldrían
                los DOS botones de volver a la vez. */}
            {!enIPhone && (
              <button type="button" className="settings-detail-volver" onClick={() => setZonaActiva(null)}>
                <IconChevronLeft size={14} /> {t("common.volver")}
              </button>
            )}

          {enIPhone && (
            <section className={`${claseZona("cuenta")} settings-zona--ios-flat`}>
              <div className="settings-zona-head">
                <div className="settings-zona-titulo">{t("config.zona.cuenta")}</div>
                <div className="settings-zona-sub">{t("config.zona.cuentaSub")}</div>
              </div>
              <CuentaSettingsIOS
                authActivo={authActivo}
                sesionEmail={sesionEmail}
                sesionNombre={sesionNombre}
                sesionFoto={sesionFoto}
                onEditarPerfil={onEditarPerfil}
                onAyuda={() => navigate("/ayuda")}
                onAcercaDe={() => setAcercaDeAbierto(true)}
                onCerrarSesion={() => setSalirAbierto(true)}
              />
            </section>
          )}

          {/* Mosaico de 2 columnas balanceadas: las tarjetas fluyen y el CSS
              reparte las alturas, así no queda una columna larga y otra vacía
              cuando el rol/plan oculta tarjetas. */}
          {/* Zonas con jerarquía visual: cada categoría vive en su propio
              contenedor (panel plano) con título, y las tarjetas se elevan
              encima. El mosaico interno balancea las alturas por zona. */}
          <section className={`${claseZona("iglesia")}${enIPhone ? " settings-zona--ios-flat" : ""}`}>
            {/* En Mac/iPad esta cabecera se queda (sigue siendo el índice de
                dos columnas de siempre); en iPhone la oculta el CSS de
                `.settings-zona-head` — el título ya lo lleva `.ios-nav`. */}
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.iglesia")}</div>
              <div className="settings-zona-sub">{t("config.zona.iglesiaSub")}</div>
            </div>
            {enIPhone ? (
              <ChurchSettingsIOS
                value={churchForm}
                onChange={(patch) => { setChurchForm((v) => ({ ...v, ...patch })); programarGuardado("iglesia"); }}
                error={churchError}
                saldoError={saldoError}
                logoPath={logoPath}
                onLogoPathChange={cambiarLogo}
                showCurrency={verTesoreria}
                estado={estados.iglesia}
              />
            ) : (
              <div className="settings-masonry una-tarjeta">
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
              </div>
            )}
          </section>

          {/* Acceso y alcance en UNA sección: qué módulos tiene la iglesia
              (Áreas, dato de la iglesia), qué ve este dispositivo (Vista,
              dato local) y quién administra (Usuarios). Antes vivían en tres
              secciones distintas con dos pantallas de distancia, siendo la
              misma pregunta contada dos veces. */}
          <section className={`${claseZona("acceso")}${enIPhone ? " settings-zona--ios-flat" : ""}`}>
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.acceso")}</div>
              <div className="settings-zona-sub">{t("config.zona.accesoSub")}</div>
            </div>
            {enIPhone ? (
              <>
                {/* Las cuatro guardas de abajo viven ahora dentro del
                    componente, con las mismas condiciones. */}
                <AccesosSettingsIOS
                  church={church}
                  role={role}
                  onRoleChange={onRoleChange}
                  onChurchUpdated={onChurchUpdated}
                  esAdmin={esAdmin}
                  authActivo={authActivo}
                />
                {/* El directorio de usuarios no se convirtió en esta tarea, así
                    que conserva su tarjeta debajo de las secciones planas —
                    mismo trato que `PDFPreview` en la zona de institución. */}
                {esAdmin && authActivo && (
                  <div className="settings-masonry una-tarjeta">
                    <UsersSettings church={church} usuarios={usuarios} onChanged={refrescarUsuarios} />
                  </div>
                )}
              </>
            ) : (
            <div className="settings-masonry">
              {/* Suscripción: la administra el dueño (admin) o, en modo local
                  sin login, quien usa la app en su propia instalación. */}
              {(esAdmin || !authActivo) && <PlanSettings church={church} onSaved={onChurchUpdated} />}
              {!authActivo && <RoleSettings value={role} onChange={onRoleChange} />}
              {/* El directorio de usuarios hoy no controla el acceso (el login
                  está desactivado en la 1.0): una tarjeta que no hace nada no
                  merece sitio. Vuelve sola cuando el login regrese en la 1.1. */}
              {esAdmin && authActivo && <UsersSettings church={church} usuarios={usuarios} onChanged={refrescarUsuarios} />}
              {/* Invitar crea CUENTAS; la tarjeta de arriba administra el
                  directorio local de personas. Van juntas porque se buscan en
                  el mismo sitio, pero no son lo mismo y no se mezclan. */}
              {esAdmin && authActivo && <InvitarUsuario />}
              {authActivo && SYNC_HABILITADO && <SyncSettings />}
            </div>
            )}
          </section>

          {/* Antes "Documentos oficiales" era una sola zona con seis tarjetas
              (tres filas) — la que más scroll pedía de las seis. Se parte en
              dos zonas más cortas, cada una con lo suyo: el membrete/vista
              previa por un lado, las dos personas y sus firmas por el otro. */}
          <section className={`${claseZona("institucion")}${enIPhone ? " settings-zona--ios-flat" : ""}`}>
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.institucion")}</div>
              <div className="settings-zona-sub">{t("config.zona.institucionSub")}</div>
            </div>
            {enIPhone ? (
              <>
                {verSecretaria && (
                  <InstitucionSettingsIOS
                    value={institucionForm}
                    onChange={(patch) => { setInstitucionForm((v) => ({ ...v, ...patch })); programarGuardado("institucion"); }}
                    estado={estados.institucion}
                  />
                )}
                {/* La vista previa NO es un campo de formulario — es un
                    mockup visual que refleja lo escrito en otras tarjetas —
                    así que se queda con su tarjeta de siempre, debajo de las
                    secciones planas, en vez de forzarla a una fila de campo
                    que no le corresponde. */}
                {verTesoreria && (
                  <div className="settings-masonry una-tarjeta">
                    <PDFPreview
                      churchNombre={churchForm.nombre}
                      tesoreroNombre={treasurerForm.nombre}
                      tesoreroCargo={treasurerForm.cargo}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="settings-masonry">
                {/* La vista previa es el RESULTADO de los datos institucionales,
                    así que va a su lado: se cambia un dato y se ve el efecto sin
                    mover los ojos de sitio. */}
                {verSecretaria && (
                  <InstitucionSettings
                    value={institucionForm}
                    onChange={(patch) => { setInstitucionForm((v) => ({ ...v, ...patch })); programarGuardado("institucion"); }}
                    estado={estados.institucion}
                  />
                )}
                {verTesoreria && (
                  <PDFPreview
                    churchNombre={churchForm.nombre}
                    tesoreroNombre={treasurerForm.nombre}
                    tesoreroCargo={treasurerForm.cargo}
                  />
                )}
              </div>
            )}
          </section>

          <section className={`${claseZona("personas")}${enIPhone ? " settings-zona--ios-flat" : ""}`}>
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.personas")}</div>
              <div className="settings-zona-sub">{t("config.zona.personasSub")}</div>
            </div>
            {enIPhone ? (
              <PersonasSettingsIOS
                verTesoreria={verTesoreria}
                treasurerValue={treasurerForm}
                onTreasurerChange={(patch) => { setTreasurerForm((v) => ({ ...v, ...patch })); programarGuardado("tesorero"); }}
                treasurerErrors={treasurerErrors}
                firmaPath={firmaPath}
                onFirmaPathChange={(p) => { setFirmaPath(p); programarGuardado("firmaTesorero", 50); }}
                pastorValue={pastorForm}
                onPastorChange={(patch) => { setPastorForm((v) => ({ ...v, ...patch })); programarGuardado("pastor"); }}
                pastorErrors={pastorErrors}
                pastorFirmaPath={pastorFirmaPath}
                onPastorFirmaPathChange={(p) => { setPastorFirmaPath(p); programarGuardado("firmaPastor", 50); }}
              />
            ) : (
              <div className="settings-masonry">
                {/* Fila de personas y fila de firmas: dos tarjetas del mismo
                    tipo comparten fila, así que la fila entera mide igual. */}
                {verTesoreria && (
                  <TreasurerSettings
                    value={treasurerForm}
                    onChange={(patch) => { setTreasurerForm((v) => ({ ...v, ...patch })); programarGuardado("tesorero"); }}
                    errors={treasurerErrors}
                    estado={estados.tesorero}
                  />
                )}
                {/* Pastor: compartido (firma en tesorería y secretaría). */}
                <PastorSettings
                  value={pastorForm}
                  onChange={(patch) => { setPastorForm((v) => ({ ...v, ...patch })); programarGuardado("pastor"); }}
                  errors={pastorErrors}
                  estado={estados.pastor}
                />
                {verTesoreria && (
                  <SignatureUploader
                    path={firmaPath}
                    onPathChange={(p) => { setFirmaPath(p); programarGuardado("firmaTesorero", 50); }}
                    estado={estados.firmaTesorero}
                  />
                )}
                <SignatureUploader
                  path={pastorFirmaPath}
                  onPathChange={(p) => { setPastorFirmaPath(p); programarGuardado("firmaPastor", 50); }}
                  variant="pastor"
                  estado={estados.firmaPastor}
                />
              </div>
            )}
          </section>

          {verTesoreria && (
            <section className={`${claseZona("categorias")}${enIPhone ? " settings-zona--ios-flat" : ""}`}>
              <div className="settings-zona-head">
                <div className="settings-zona-titulo">{t("config.zona.categorias")}</div>
                <div className="settings-zona-sub">{t("config.zona.categoriasSub")}</div>
              </div>
              {enIPhone ? (
                <CategoriesSettingsIOS church={church} onChanged={() => { /* la caché ya se refrescó; las páginas releen al montar */ }} />
              ) : (
                <div className="settings-masonry una-tarjeta">
                  <CategoriesSettings church={church} onChanged={() => { /* la caché ya se refrescó; las páginas releen al montar */ }} />
                </div>
              )}
            </section>
          )}

          <section className={`${claseZona("preferencias")}${enIPhone ? " settings-zona--ios-flat" : ""}`}>
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.preferencias")}</div>
              <div className="settings-zona-sub">{t("config.zona.preferenciasSub")}</div>
            </div>
            {enIPhone ? (
              <PreferenciasSettingsIOS
                themePref={themePref} onThemePrefChange={onThemePrefChange}
                acento={acento} onAcentoChange={onAcentoChange}
                langPref={langPref} onLangPrefChange={onLangPrefChange}
              />
            ) : (
              // Apariencia e Idioma son gemelas (misma pinta, misma altura) y
              // comparten fila; Acento y Sonido, las dos con selector, la de
              // abajo.
              <div className="settings-masonry">
                <AppearanceSettings value={themePref} onChange={onThemePrefChange} />
                <LanguageSettings value={langPref} onChange={onLangPrefChange} />
                <AccentSettings value={acento} onChange={onAcentoChange} />
                <SoundSettings />
              </div>
            )}
          </section>

          {esAdmin && (
            <section className={`${claseZona("delicada")} peligro`}>
              <div className="settings-zona-head">
                <div className="settings-zona-titulo">{t("config.zona.delicada")}</div>
                <div className="settings-zona-sub">{t("config.zona.delicadaSub")}</div>
              </div>
              <div className="settings-masonry">
                {/* Por filas: respaldo │ zona de peligro, restaurar │
                    compactar. Emparejadas por tamaño: las dos altas arriba y
                    las dos bajas abajo, para que ninguna fila cojee. */}
                <BackupSettings church={church} />
                <DangerZoneSettings church={church} />
                <RestoreSettings />
                <CompactSettings church={church} />
                {/* Solo se pinta si hay algo que recuperar; si no, devuelve
                    null y no ocupa celda. Va al final para no descolocar las
                    parejas de arriba. */}
                <ComprobantesPendientes church={church} />
              </div>
            </section>
          )}

          {/* Ya no hay botón global: cada tarjeta guarda sola al cambiar y
              lleva su propio indicador, incluido el de error (modelo A). */}
          </div>
        </div>
      </div>

      {salirAbierto && onSalir && (
        <ActionSheet
          title={t("cuenta.confirmarTitulo")}
          message={t("cuenta.confirmarMensaje")}
          options={[{ label: t("cuenta.cerrarSesion"), danger: true, onClick: () => { setSalirAbierto(false); onSalir(); } }]}
          onCancel={() => setSalirAbierto(false)}
        />
      )}

      {acercaDeAbierto && (
        <Portal>
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setAcercaDeAbierto(false); }}>
            <div className="acerca-de-card">
              <IconTamio size={56} />
              <div className="acerca-de-nombre">Tamio</div>
              <div className="acerca-de-version">{t("cuenta.acercaDeVersion", { version: version ?? "…" })}</div>
              <div className="acerca-de-tagline">{t("cuenta.acercaDeTagline")}</div>
              <div className="acerca-de-copyright">{t("cuenta.acercaDeCopyright")}</div>
              <button type="button" className="btn secondary" onClick={() => setAcercaDeAbierto(false)}>{t("common.cerrar")}</button>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
