import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getVersion } from "@tauri-apps/api/app";
import { listUsuarios, updateChurch, type Church, type ChurchUpdate, type Usuario } from "../db";
import type { LangPref } from "../i18n";
import { CERO, aTextoTecleado, deTextoTecleado } from "../dinero";
import { showToast } from "../toast";
import { esIPad, esIPhone, esMac } from "../movil";
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
import PermisosSettings from "../components/settings/PermisosSettings";
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
  IconChurch, IconLlave, IconFileText, IconSignature, IconUser, IconTag, IconMonitor, IconWarn,
  IconChevronLeft, IconChevronRight, IconTamio, IconSearch,
} from "../icons";
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

/** En una pantalla angosta (teléfono) se arranca sin zona elegida, mostrando
 *  solo el índice — hay que tocar una para ver su contenido. En Mac/iPad, que
 *  sí tienen sitio para las dos columnas, se arranca en "Iglesia" para no
 *  dejar la mitad de la pantalla vacía al entrar.
 *
 *  Está fuera del componente porque lo leen DOS estados (la zona activa y la
 *  pila del historial de atrás/adelante) y tienen que arrancar de acuerdo. */
function zonaDeArranque(): string | null {
  if (typeof window === "undefined") return "iglesia";
  return window.matchMedia("(max-width: 760px)").matches ? null : "iglesia";
}

/** Sin acentos, sin mayúsculas y sin espacios de sobra: lo que hace falta
 *  para que el buscador del índice case "categorias" con "Categorías". */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

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
  /* Las listas agrupadas de iOS también en el iPad.
     Hasta ahora eran "la piel del teléfono" y el iPad se quedaba con las
     tarjetas de escritorio (apuntado como desviación deliberada el 22 ago,
     §11 de docs/ipad-rediseno.md). El handoff nuevo dibuja Configuración
     como listas insertadas —encabezado en versalitas, tarjeta de 12px de
     radio, filas de 52 con su etiqueta a la izquierda y su pie debajo—, que
     es exactamente este patrón, y su CSS ya estaba escrito para `:root.movil`
     (o sea, iPad incluido). Los componentes `*SettingsIOS` son reescrituras
     del MARCADO con las mismas props, así que el estado, la validación y el
     guardado automático no se enteran del cambio. */
  const enListas = enIPhone || esIPad();
  /* El rediseño de macOS de Ajustes (índice en columna con iconos
     tintados, buscador, atrás/adelante y encabezado de zona con hero) es
     solo del Mac: el iPad conserva su columna de siempre y el iPhone su
     lista agrupada. */
  const enMac = esMac();

  // Ajustes con índice (13 ago 2026, idea de "Proyecto B" en plan-1-1.md):
  // una columna de zonas a la izquierda, una a la vez a la derecha, en vez de
  // una página larga con las seis zonas apiladas. Cambia el CONTENEDOR, no el
  // contenido — cada <section> sigue siendo exactamente la misma de antes,
  // solo se oculta con CSS cuando no es la zona activa. Así el guardado
  // automático y sus temporizadores (más abajo) no se enteran del cambio.
  /* `Icono` es el COMPONENTE, no un elemento ya creado: el mismo glifo se
     pinta a 16 px en el índice y a 30 px en el encabezado de zona del Mac
     (`.settings-hero`), y con un elemento fijo habría que declararlo dos
     veces y arriesgarse a que se desincronicen. */
  const ZONAS = [
    { key: "cuenta", Icono: IconUser, titulo: t("config.zona.cuenta"), visible: enIPhone },
    { key: "iglesia", Icono: IconChurch, titulo: t("config.zona.iglesia"), visible: true },
    /* Llave, no `IconIdBadge`: ese glifo significa MEMBRESÍA en toda la app
       —el sidebar, los accesos rápidos del inicio de secretaría, el RFC de la
       ficha— y repetirlo aquí lo hacía decir dos cosas distintas. */
    { key: "acceso", Icono: IconLlave, titulo: t("config.zona.acceso"), visible: true },
    { key: "institucion", Icono: IconFileText, titulo: t("config.zona.institucion"), visible: true },
    /* Firma y no `IconUser`: "Cuenta" ya usaba ese mismo glifo dos filas más
       arriba, y dos iconos idénticos en una lista de ocho es lo que la hace
       parecer genérica. La rúbrica además dice de qué va la pantalla — los
       nombres, cargos y firmas que salen en los PDF. */
    { key: "personas", Icono: IconSignature, titulo: t("config.zona.personas"), visible: true },
    { key: "categorias", Icono: IconTag, titulo: t("config.zona.categorias"), visible: verTesoreria },
    { key: "preferencias", Icono: IconMonitor, titulo: t("config.zona.preferencias"), visible: true },
    { key: "delicada", Icono: IconWarn, titulo: t("config.zona.delicada"), visible: esAdmin },
  ] as const;
  type ZonaKey = (typeof ZONAS)[number]["key"];
  const ZONAS_POR_KEY = Object.fromEntries(ZONAS.map((z) => [z.key, z])) as Record<ZonaKey, (typeof ZONAS)[number]>;

  // El tinte del tile de icono de cada zona. Nació para la lista agrupada
  // del iPhone y lo usa también el Mac (el índice en columna y el encabezado
  // de zona del rediseño de macOS): son los colores de sistema de Apple, los
  // mismos en las dos plataformas, y tenerlos dos veces era pedir que se
  // desincronizaran. Los tokens `--ios-*` se definen para `:root.iphone` y
  // `:root.mac` en styles.css.
  const TINTE: Record<ZonaKey, string> = {
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
  const [zonaActiva, setZonaActiva] = useState<string | null>(zonaDeArranque);
  /* Atrás y adelante del Mac, los dos galones de la cabecera. Las zonas no
     son rutas —`zonaActiva` es estado y nada más—, así que el historial del
     navegador no sabe de ellas y hay que llevarlo a mano: una pila y un
     índice dentro de ella. Ir a una zona nueva CORTA lo que hubiera hacia
     adelante, igual que en cualquier navegador. Repetir la zona en la que ya
     estás no apila nada (si no, pulsar dos veces la misma pestaña llenaba la
     pila de duplicados y "atrás" no llevaba a ningún sitio visible). */
  const [hist, setHist] = useState<{ pila: string[]; i: number }>(() => {
    const z = zonaDeArranque();
    return z ? { pila: [z], i: 0 } : { pila: [], i: -1 };
  });
  function irAZona(key: string) {
    setZonaActiva(key);
    setHist((h) => (h.pila[h.i] === key ? h : { pila: [...h.pila.slice(0, h.i + 1), key], i: h.i + 1 }));
  }
  function moverHistorial(paso: -1 | 1) {
    setHist((h) => {
      const destino = h.i + paso;
      if (destino < 0 || destino >= h.pila.length) return h;
      setZonaActiva(h.pila[destino]);
      return { ...h, i: destino };
    });
  }
  /* El buscador del índice. Filtra por NOMBRE de zona, que es lo que el
     índice contiene: buscar por campo ("saldo de apertura") pediría indexar
     las etiquetas de los treinta y tantos controles repartidos en veinte
     componentes, y eso es otra tarea. Sin acentos y sin mayúsculas para que
     "categorias" encuentre "Categorías". */
  const [busqueda, setBusqueda] = useState("");
  const filtro = normalizar(busqueda);
  const zonasVisibles = ZONAS.filter(
    (z) => z.visible && (!enMac || !filtro || normalizar(z.titulo).includes(filtro)),
  );
  // `settings-zona--<key>`: gancho por zona para las reglas de Mac que no
  // valen para todas (Preferencias alinea sus tarjetas como filas de
  // formulario, Zona sensible pinta sus botones en rojo). Sin él habría que
  // inventar una clase nueva dentro de cada componente de Ajustes.
  const claseZona = (key: string) =>
    `settings-zona settings-zona--${key}${zonaActiva === key ? "" : " settings-zona-inactiva"}`;
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
    saldoInicial: church.saldo_inicial ? aTextoTecleado(church.saldo_inicial) : "",
    /* Controles de tesorería (v45). El umbral vacío significa "el de la
       constante", igual que el saldo vacío significa cero: es la diferencia
       entre no haber tocado el ajuste y haber elegido un número. */
    avisarSinComprobante: church.avisar_sin_comprobante !== 0,
    umbralComprobante: church.umbral_comprobante != null ? aTextoTecleado(church.umbral_comprobante) : "",
    avisarDuplicados: church.avisar_duplicados !== 0,
    pedirDobleFirma: church.pedir_doble_firma === 1,
  });
  const [saldoError, setSaldoError] = useState<string | null>(null);
  const [umbralError, setUmbralError] = useState<string | null>(null);
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
      // El saldo de apertura es lo único de esta pantalla que es dinero: se
      // parsea con `deTextoTecleado`, igual que cualquier otro importe
      // escrito a mano.
      //
      // El texto va CRUDO a propósito. Antes se le quitaban las comas aquí
      // —`replace(/[$,\s]/g, "")`— y eso, además de duplicar una limpieza que
      // el parser ya hace, le borraba el separador decimal a media Europa y
      // Latinoamérica antes de que pudiera interpretarlo: en España "1.234,56"
      // llegaba como "1.23456" y se rechazaba por inválido.
      const saldoTexto = f.churchForm.saldoInicial.trim();
      const saldoNum = saldoTexto === "" ? CERO : deTextoTecleado(saldoTexto);
      const saldoErr = saldoNum !== null ? null : t("validacion.saldoInvalido");
      /* El umbral del comprobante, con el MISMO parser que el saldo: es un
         importe tecleado por una persona y la coma decimal de media Europa
         tiene que valer aquí igual que allí. Vacío = null = la constante. */
      const umbralTexto = f.churchForm.umbralComprobante.trim();
      const umbralNum = umbralTexto === "" ? null : deTextoTecleado(umbralTexto);
      const umbralErr = umbralTexto === "" || umbralNum !== null
        ? null
        : t("controlesTesoreria.umbralInvalido");
      if (montadoRef.current) { setChurchError(nombreErr); setSaldoError(saldoErr); setUmbralError(umbralErr); }
      if (nombreErr || saldoErr || umbralErr) return { patch: {}, valido: false };
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
          avisar_sin_comprobante: f.churchForm.avisarSinComprobante ? 1 : 0,
          umbral_comprobante: umbralNum,
          avisar_duplicados: f.churchForm.avisarDuplicados ? 1 : 0,
          pedir_doble_firma: f.churchForm.pedirDobleFirma ? 1 : 0,
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
          al entrar a una, la cabecera pasa a ser la de la zona (más abajo)
          y repetirlo aquí encima sería el mismo título dos veces. La copia
          fija de la barra al hacer scroll (`.titulo-fijo`, App.tsx) lee el
          texto de `.page-title` en vivo, así que con este bloque fuera del
          DOM esa copia queda vacía en vez de mostrar "Ajustes" duplicado. */}
      {/* `data-tauri-drag-region` hace de interruptor de la toolbar de macOS
          y de zona de arrastre de la ventana a la vez; solo en Mac (el
          porqué, en Movimientos.tsx). */}
      {/* Con una zona abierta la cabecera es la de ESA zona: volver a Ajustes
          y su nombre como título grande dentro de la banda verde, igual que el
          índice. Es la decisión 1 del handoff v2 —«una zona no es un modal, es
          el mismo sitio un nivel más adentro»— y la que quita el híbrido que
          había: índice con título de 34 y zonas con una barra fina de 17.

          No es un patrón nuevo: es el mismo `.ios-nav-volver` + `.page-title`
          del documento abierto de Reportes y del detalle del periodo de
          Inicio, así que el plegado al desplazar (`.titulo-fijo`) ya funciona
          sin tocar nada. */}
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
          <div>
            {enIPhone && zonaActiva && (
              <button type="button" className="ios-nav-volver" onClick={() => setZonaActiva(null)}>
                <IconChevronLeft size={17} strokeWidth={2.4} /> {t("nav.ajustes")}
              </button>
            )}
            <div className="page-title" data-titulo-fijo={enIPhone && zonaActiva ? zonaActivaInfo?.titulo : undefined}>
              {enIPhone && zonaActiva ? zonaActivaInfo?.titulo ?? "" : t("config.titulo")}
            </div>
            {/* En iPhone (lista agrupada estilo iOS, ver más abajo) este
                subtítulo se quita: su contenido pasa a repartirse entre los
                pies de sección ("Define quién entra a Tesorería...",
                "Respaldos, restauración..."). En Mac tampoco entra, pero por
                otro motivo: en la toolbar solo cabe un DATO corto ("2
                movimientos"), y esto es una frase explicativa. Queda en el
                iPad, que sí conserva el título de página con su subtítulo. */}
            {!enIPhone && !zonaActiva && !esMac() && <div className="page-sub">{t("config.sub")}</div>}
          </div>
          {/* La acción de la zona —el aviso de «sin guardar», el «+» de
              Categorías— se queda a la derecha de la fila de acciones, que es
              donde vive en todas las demás pantallas del teléfono. */}
          {enIPhone && zonaActiva && accionNavBar && (
            <div className="header-actions">{accionNavBar}</div>
          )}
        </div>

      {/* `content-ajustes`, y NO el `content-lienzo` de las demás pantallas del
          Mac: el gris de fondo es el mismo (y hace falta, porque el rediseño
          agrupa los campos en cajas blancas que sobre blanco no se verían),
          pero `content-lienzo` arrastra otras once reglas pensadas para
          pantallas de lista —relleno de tarjeta 12/14, cabeceras de tabla,
          tiras de resumen, gráficas— y Ajustes no es una de ésas. Ya pasó una
          vez con `:has(.summary-4)`: un gancho compartido que se cuela en
          pantallas que nadie miró. El CSS lo apaga fuera del Mac. */}
      <div className="content content-ajustes" ref={contentRef as React.RefObject<HTMLDivElement>}>
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
                          onClick={() => irAZona(z.key)}
                        >
                          <span className="ios-icon" style={{ background: TINTE[z.key] }}><z.Icono size={16} /></span>
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
              {/* El buscador del índice, solo en Mac: es el campo de Ajustes
                  del Sistema y no tiene sitio en la barra de pestañas del
                  iPad, que ya va apretada. Filtra por nombre de zona. */}
              {enMac && (
                <label className="settings-buscar">
                  <IconSearch size={12} />
                  <input
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder={t("config.buscar")}
                    aria-label={t("config.buscar")}
                  />
                </label>
              )}
              {zonasVisibles.map((z) => (
                <button
                  key={z.key}
                  type="button"
                  className={`settings-nav-item${zonaActiva === z.key ? " activo" : ""}`}
                  onClick={() => irAZona(z.key)}
                >
                  {/* El tile tintado es del rediseño de macOS; en iPad el CSS
                      le quita el fondo y deja el glifo suelto de siempre. En
                      la fila activa NO se pinta: sobre el relleno del acento,
                      dos colores saturados uno dentro de otro se pelean, y
                      ahí manda la regla del CSS con su velo claro. */}
                  <span
                    className="settings-nav-icono"
                    style={enMac && zonaActiva !== z.key ? { background: TINTE[z.key] } : undefined}
                  >
                    <z.Icono size={16} />
                  </span>
                  <span className="settings-nav-nombre">{z.titulo}</span>
                  <span className="settings-nav-flecha"><IconChevronRight size={13} /></span>
                </button>
              ))}
              {enMac && zonasVisibles.length === 0 && (
                <p className="settings-buscar-vacio">{t("common.sinResultados")}</p>
              )}
              {/* La versión, al pie del índice. Existía SOLO en el índice del
                  iPhone (`.ios-version`, unas líneas más arriba), porque la
                  tarjeta de cuenta que la acompaña —`CuentaSettingsIOS`, con
                  su "Acerca de"— está detrás de `enIPhone`. Resultado: en
                  iPad y en Mac, Tamio no decía en NINGUNA parte qué versión
                  era.
                  Lo destapó el 22 de agosto la pregunta más simple posible:
                  "¿esta build es la 1.2.0 o sigo viendo la 1.1.9?". Sin este
                  renglón, la única forma de contestarla es abrir TestFlight,
                  y en la Mac ni eso. Sale de `getVersion()`, que lee el
                  bundle: no puede desincronizarse de lo que se instaló. */}
              <p className="settings-nav-version">{version && t("config.pieVersion", { version })}</p>
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

            {/* Cabecera del Mac: los dos galones de historial a la izquierda
                y el chip de guardado a la derecha, que hasta ahora vivía
                dentro de cada tarjeta y con el rediseño se sube aquí —
                mismas tres zonas que ya sabía marcar (ESTADOS_POR_ZONA). */}
            {enMac && zonaActivaInfo && (
              <div className="settings-barra">
                <button
                  type="button"
                  className="settings-hist"
                  onClick={() => moverHistorial(-1)}
                  disabled={hist.i <= 0}
                  title={t("config.atras")}
                  aria-label={t("config.atras")}
                >
                  <IconChevronLeft size={11} />
                </button>
                <button
                  type="button"
                  className="settings-hist"
                  onClick={() => moverHistorial(1)}
                  disabled={hist.i >= hist.pila.length - 1}
                  title={t("config.adelante")}
                  aria-label={t("config.adelante")}
                >
                  <IconChevronRight size={11} />
                </button>
                <span className="settings-barra-hueco" />
                {estadoNavBar.tipo !== "oculto" && <GuardadoChip estado={estadoNavBar} />}
              </div>
            )}

            {/* Encabezado de zona: el glifo en grande sobre su tinte, el
                nombre y la frase que lo explica. Es el mismo par
                título/subtítulo que `.settings-zona-head` lleva dentro de cada
                sección — pero UNA vez y arriba del todo, en vez de repetido en
                siete secciones de las que seis están ocultas.

                `!enIPhone` y no `enMac`: el handoff de iPad trae esta cabecera
                en sus seis pantallas de Configuración, así que cruza. Lo que
                NO cruza —y por eso los dos bloques de arriba siguen en
                `enMac`— son el buscador de zonas y los galones de historial:
                el diseño de iPad no los dibuja, son de Ajustes del Sistema de
                macOS. En el teléfono no hay columna que encabezar. */}
            {!enIPhone && zonaActivaInfo && (
              <div className="settings-hero">
                <span className="settings-hero-icono" style={{ background: TINTE[zonaActivaInfo.key] }}>
                  <zonaActivaInfo.Icono size={30} />
                </span>
                <span className="settings-hero-titulo">{zonaActivaInfo.titulo}</span>
                <span className="settings-hero-sub">{t(`config.zona.${zonaActivaInfo.key}Sub`)}</span>
              </div>
            )}

          {enIPhone && (
            <section className={`${claseZona("cuenta")} settings-zona--ios-flat`}>
              <div className="settings-zona-head">
                <div className="settings-zona-titulo">{t("config.zona.cuenta")}</div>
                <div className="settings-zona-sub">{t("config.zona.cuentaSub")}</div>
              </div>
              <CuentaSettingsIOS
                authActivo={authActivo}
                version={version}
                rol={t(`rol.${role}`)}
                /* Las áreas salen de los mismos dos booleanos que deciden qué
                   zonas se ven, así que no pueden decir una cosa distinta de
                   la que hace el menú. */
                areas={
                  verTesoreria && verSecretaria ? t("cuenta.areas.ambas")
                    : verTesoreria ? t("cuenta.areas.tesoreria")
                      : verSecretaria ? t("cuenta.areas.secretaria")
                        : t("cuenta.areas.ninguna")
                }
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
          <section className={`${claseZona("iglesia")}${enListas ? " settings-zona--ios-flat" : ""}`}>
            {/* En Mac/iPad esta cabecera se queda (sigue siendo el índice de
                dos columnas de siempre); en iPhone la oculta el CSS de
                `.settings-zona-head` — el título ya lo lleva `.ios-nav`. */}
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.iglesia")}</div>
              <div className="settings-zona-sub">{t("config.zona.iglesiaSub")}</div>
            </div>
            {enListas ? (
              <ChurchSettingsIOS
                value={churchForm}
                onChange={(patch) => { setChurchForm((v) => ({ ...v, ...patch })); programarGuardado("iglesia"); }}
                error={churchError}
                saldoError={saldoError}
                umbralError={umbralError}
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
          <section className={`${claseZona("acceso")}${enListas ? " settings-zona--ios-flat" : ""}`}>
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.acceso")}</div>
              <div className="settings-zona-sub">{t("config.zona.accesoSub")}</div>
            </div>
            {enListas ? (
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
              {/* Los dos permisos del rol Tesorería (49). Esta sí tiene cara de
                  escritorio, y las de las migraciones 45 y 47 no, porque no es
                  un aviso: es un permiso, y quien lo pone es el administrador
                  —que muy probablemente trabaja en un Mac—. Sin esta tarjeta,
                  una iglesia sin iPad no podría usarlos nunca.
                  Mismas dos condiciones que en la lista de iOS: sin login el
                  rol se elige en un desplegable de esta misma zona. */}
              {esAdmin && authActivo && <PermisosSettings church={church} onChurchUpdated={onChurchUpdated} />}
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
          <section className={`${claseZona("institucion")}${enListas ? " settings-zona--ios-flat" : ""}`}>
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.institucion")}</div>
              <div className="settings-zona-sub">{t("config.zona.institucionSub")}</div>
            </div>
            {enListas ? (
              <>
                {verSecretaria && (
                  <InstitucionSettingsIOS
                    churchNombre={churchForm.nombre}
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

          <section className={`${claseZona("personas")}${enListas ? " settings-zona--ios-flat" : ""}`}>
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.personas")}</div>
              <div className="settings-zona-sub">{t("config.zona.personasSub")}</div>
            </div>
            {enListas ? (
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
            <section className={`${claseZona("categorias")}${enListas ? " settings-zona--ios-flat" : ""}`}>
              <div className="settings-zona-head">
                <div className="settings-zona-titulo">{t("config.zona.categorias")}</div>
                <div className="settings-zona-sub">{t("config.zona.categoriasSub")}</div>
              </div>
              {enListas ? (
                <CategoriesSettingsIOS church={church} onChanged={() => { /* la caché ya se refrescó; las páginas releen al montar */ }} />
              ) : (
                <div className="settings-masonry una-tarjeta">
                  <CategoriesSettings church={church} onChanged={() => { /* la caché ya se refrescó; las páginas releen al montar */ }} />
                </div>
              )}
            </section>
          )}

          <section className={`${claseZona("preferencias")}${enListas ? " settings-zona--ios-flat" : ""}`}>
            <div className="settings-zona-head">
              <div className="settings-zona-titulo">{t("config.zona.preferencias")}</div>
              <div className="settings-zona-sub">{t("config.zona.preferenciasSub")}</div>
            </div>
            {enListas ? (
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
                {/* De menos a más grave: guardar, restaurar, mantener y, al
                    final, lo que no tiene vuelta atrás. Antes iban emparejadas
                    por tamaño (respaldo │ peligro, restaurar │ compactar) para
                    que ninguna fila del mosaico de dos columnas cojeara; desde
                    que las cuatro son filas iguales (`FilaAccion`) esa razón
                    ya no existe, y dejar el borrado en medio de la lista era
                    ponerlo donde nadie lo busca. */}
                <BackupSettings church={church} />
                <RestoreSettings />
                <CompactSettings church={church} />
                <DangerZoneSettings church={church} />
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
