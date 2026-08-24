import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Sidebar from "./components/Sidebar";
import SubBanner from "./components/SubBanner";
import UpdateBanner from "./components/UpdateBanner";
import BarraEstadoProvider from "./components/BarraEstado";
import BarraInferior from "./components/BarraInferior";
import BotonCrear from "./components/BotonCrear";
import CarruselSecciones from "./components/CarruselSecciones";
import SyncPausadoBanner from "./components/SyncPausadoBanner";
import CmdPalette from "./components/CmdPalette";
import ToastHost from "./components/ToastHost";
import NewRecordModal, { type ModalMode } from "./components/NewRecordModal";
import PerfilModal from "./components/PerfilModal";
import Welcome from "./components/Welcome";
import Dashboard from "./pages/Dashboard";
import InicioSecretaria from "./pages/InicioSecretaria";
import Movimientos from "./pages/Movimientos";
import Miembros from "./pages/Miembros";
import Reportes from "./pages/Reportes";
import Depositos from "./pages/Depositos";
import Membresia from "./pages/Membresia";
import Actas from "./pages/Actas";
import Servicios from "./pages/Servicios";
import Cartas from "./pages/Cartas";
import InformesMembresia from "./pages/InformesMembresia";
import Agenda from "./pages/Agenda";
import Bandeja from "./pages/Bandeja";
import Mensajes from "./pages/Mensajes";
import Configuracion from "./pages/Configuracion";
import Ayuda from "./pages/Ayuda";
import { migrarComprobantesExternos } from "./services/comprobantes";
import { migrarImagenesIglesia } from "./services/imagenesIglesia";
import { sincronizarPausaDesdeRust } from "./services/restaurar";
import { showToast } from "./toast";
import type { ThemePref } from "./components/settings/AppearanceSettings";
import { ACENTOS, type Acento } from "./components/settings/AccentSettings";
import { borrarTodoLocal, countMensajesNoLeidos, countPendingTx, getOrCreateChurch, listMembers, loadCategoriasCustom, materializeMovimientosRecurrentes, repararFoliosDuplicados, setMonedaActiva, type Church, type Member, type Tx } from "./db";
import i18n, { initialLangPref, resolveLang, saveLangPref, type LangPref } from "./i18n";
import { HOME_POR_ROL, initialRole, puedeVer, saveRole, type Role } from "./role";
import { areaDeRuta, seccionesVisibles } from "./navegacion";
import { evaluarVigencia, incluyeSecretaria, incluyeTesoreria, puedeCrearMiembros, rutaPermitidaPorPlan, urlCompra } from "./plan";
import { openUrl } from "@tauri-apps/plugin-opener";
import { esMac } from "./movil";
import { IconSidebar } from "./icons";
import { authHabilitado } from "./supabase";
import { configurarSync, ejecutarSync, iniciarAutoSync, programarSync, SYNC_HABILITADO } from "./syncManager";
import { useSupabaseAuth } from "./auth";
import { setQuienRegistra } from "./sesion";
import { vigilarPrivacidad } from "./privacidad";
import Login from "./components/Login";
import "./styles.css";

function initialThemePref(): ThemePref {
  try {
    const saved = localStorage.getItem("tesoreria-theme");
    if (saved === "dark" || saved === "light" || saved === "auto") return saved;
  } catch { /* noop */ }
  return "auto";
}

/** Color de acento. Preferencia de este dispositivo, igual que el tema. */
function initialAcento(): Acento {
  try {
    const saved = localStorage.getItem("tamio-acento");
    if (saved && (ACENTOS as readonly string[]).includes(saved)) return saved as Acento;
  } catch { /* noop */ }
  return "neutro";
}

/** ¿Arranca con la barra lateral escondida? Preferencia de este dispositivo,
 *  igual que el tema y el acento: es una decisión sobre ESTA ventana, no sobre
 *  la iglesia, así que no viaja por la sincronización. */
function initialSidebarOculta(): boolean {
  try {
    return localStorage.getItem("tamio-sidebar-oculta") === "1";
  } catch { return false; }
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Primer arranque: la iglesia sigue con el nombre por defecto y nunca se
 *  completó la bienvenida. Si el usuario ya renombró su iglesia (versiones
 *  anteriores de la app), no se le vuelve a preguntar. */
function esPrimerArranque(church: Church): boolean {
  try {
    if (localStorage.getItem("tesoreria-welcomed") === "1") return false;
  } catch { /* noop */ }
  return church.nombre === "Mi Iglesia";
}

/** Inicio para la combinación rol/plan sin área propia (p. ej. un tesorero en
 *  una iglesia con plan "solo Secretaría"): en vez de un dashboard con todo
 *  bloqueado, explica la situación y ofrece lo que sí puede ver. */
function HomeSinArea({ area, verReportes }: { area: "tesoreria" | "secretaria"; verReportes: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="content">
      <div className="card pad-lg" style={{ maxWidth: 520, margin: "60px auto", textAlign: "center" }}>
        <div className="card-title-lg" style={{ marginBottom: 8 }}>{t("homeSinArea.titulo")}</div>
        <div className="form-hint" style={{ marginBottom: 16 }}>
          {area === "tesoreria" ? t("homeSinArea.subTesoreria") : t("homeSinArea.subSecretaria")}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          {verReportes && (
            <button className="btn primary" onClick={() => navigate("/reportes")}>{t("homeSinArea.verReportes")}</button>
          )}
          <button className="btn secondary" onClick={() => navigate("/configuracion")}>{t("nav.configuracion")}</button>
        </div>
      </div>
    </div>
  );
}

/** Dónde empieza de verdad la página dentro de `<main>`, en coordenadas de la
 *  ventana y como si el scroll estuviera a cero.
 *
 *  Existe para la vecina del carrusel (`.pager-vecina`), que es
 *  `position: absolute` sobre un `.main` SIN posicionar — así que se ancla a la
 *  ventana, no a `.main`. En el escritorio eso daba igual; en el iPhone la
 *  vecina salía más ARRIBA que la página real por dos motivos que se suman:
 *
 *  1. `.app` lleva `padding-top: env(safe-area-inset-top)` (styles.css). Eso
 *     baja `.main` entero —59 px con isla dinámica, 47/48 con muesca— y la
 *     vecina, anclada a la ventana, ni se enteraba. Como en Chromium ese `env`
 *     vale 0, el arnés de Playwright las daba alineadas y el desnivel solo
 *     aparecía en el aparato.
 *  2. Los banners (actualización, sync en pausa, suscripción) van DENTRO de
 *     `<main>`, en flujo normal y por delante de `<Routes>`. Empujan a la
 *     página real hacia abajo; a la vecina, absoluta, se la saltan.
 *
 *  Medido con la muesca simulada a 59 px: la cabecera de la vecina caía 60 px
 *  por encima de la real sin banners, y 112 px con un banner de 44 px. Con este
 *  ancla, 0 en los dos casos.
 *
 *  Se cuentan también los márgenes: `.main` es `display: flex` en columna, así
 *  que no colapsan. Y se para en el primer trozo de página (`.header` /
 *  `.content`) o en la vecina misma. */
function techoDeLaPagina(main: HTMLElement): number {
  let y = main.getBoundingClientRect().top;
  for (const hijo of Array.from(main.children)) {
    const clases = hijo.classList;
    if (clases.contains("header") || clases.contains("content") || clases.contains("pager-vecina")) break;
    const estilo = getComputedStyle(hijo);
    y += hijo.getBoundingClientRect().height
      + parseFloat(estilo.marginTop) + parseFloat(estilo.marginBottom);
  }
  return y;
}

function Shell({ church, onChurchUpdated }: { church: Church; onChurchUpdated: (c: Church) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [themePref, setThemePref] = useState<ThemePref>(initialThemePref);
  const [acento, setAcento] = useState<Acento>(initialAcento);
  const [langPref, setLangPref] = useState<LangPref>(initialLangPref);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [rolManual, setRolManual] = useState<Role>(initialRole);
  const [showWelcome, setShowWelcome] = useState(() => esPrimerArranque(church));
  const [refreshKey, setRefreshKey] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  // Con login activo el rol viene del servidor; sin login, del selector manual.
  const { estado: authEstado, salir, guardarPerfil, borrarCuenta } = useSupabaseAuth();

  /* Quién está usando la app, donde `db.ts` pueda leerlo al escribir un
     movimiento, un depósito o un corte. Único sitio que lo escribe. Sin
     sesión —modo local— se queda en null y los registros nacen sin nombre,
     que es lo correcto: mejor "no lo sé" que un nombre prestado. */
  /* "Ocultar montos al bloquear": tapa el contenido cuando la app se va a
     segundo plano, para que la instantánea del selector de apps no enseñe la
     contabilidad. Se engancha siempre; la preferencia se consulta dentro,
     así que encenderla o apagarla no obliga a recargar. */
  useEffect(() => vigilarPrivacidad(), []);

  useEffect(() => {
    setQuienRegistra(
      authEstado.autenticado && authEstado.nombre
        ? { nombre: authEstado.nombre, rol: authEstado.role }
        : null
    );
  }, [authEstado.autenticado, authEstado.nombre, authEstado.role]);
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  // Cajón lateral en pantallas angostas (iPhone): la sidebar se oculta y se
  // abre con el botón de menú; navegar la cierra sola.
  const [menuAbierto, setMenuAbierto] = useState(false);
  /* Qué sección se está asomando por el lado mientras se arrastra el carrusel,
     o null. Lo publica el carrusel y SOLO cuando cambia (no en cada fotograma
     del gesto), para que esto no redibuje el shell sesenta veces por segundo.

     Vive AQUÍ ARRIBA, con los demás `useState`, y no junto al JSX que lo usa:
     más abajo está la puerta de autenticación, que devuelve pronto en cuatro
     casos (cargando, sin sesión, sin rol, suscripción vencida). Un hook
     declarado después de ella se salta en esos renders y se ejecuta en los
     demás, y React aborta con el error #310 ("se renderizaron más hooks que
     en el render anterior"). Pasó: la app se caía al terminar de cargar la
     sesión, que es justo cuando se cruza esa puerta.

     Va con su `top`, medido en el mismo instante en que se anuncia: la vecina
     se ancla a la ventana y hay que decirle dónde empieza la página de verdad
     (ver `techoDeLaPagina` arriba). Se guarda junto a la ruta y no aparte para
     que las dos cosas entren en el MISMO render: con dos estados sueltos había
     un fotograma con la ruta nueva y el ancla vieja. */
  const [vecina, setVecina] = useState<{ ruta: string; top: number } | null>(null);
  /* Barra lateral escondida (solo Mac). Aquí arriba por lo mismo que `vecina`:
     más abajo está la puerta de autenticación con sus cuatro `return`. */
  const [sidebarOculta, setSidebarOculta] = useState(initialSidebarOculta);
  const location = useLocation();
  useEffect(() => { setMenuAbierto(false); }, [location.pathname]);
  const role: Role = authHabilitado ? (authEstado.role ?? "secretaria") : rolManual;
  // El carrusel de secciones (bug de teléfono corregido más abajo: ahora vive
  // FUERA de <main>, fijo bajo la fila de "+"/compartir) no siempre pinta
  // algo — CarruselSecciones.tsx devuelve null fuera de un área o con una
  // sola sección visible. El área con scroll necesita saberlo para reservar
  // su alto (--carrusel-h) solo cuando de verdad hay carrusel que despejar;
  // la misma cuenta que hace ese componente, repetida aquí porque el CSS no
  // puede leer el resultado de un render ajeno.
  const areaActual = areaDeRuta(location.pathname);
  const hayCarrusel = areaActual !== null && seccionesVisibles(areaActual, role).length >= 2;

  // Large Title que se reubica de verdad en la barra fija al hacer scroll
  // (iPhone/iPad): nada de esto pasa por estado de React — con setState en
  // cada scroll el re-render de toda la Shell en cada frame se sentía a
  // tirones. En vez de eso, cada evento de scroll escribe una única
  // variable CSS (`--progreso-titulo`, 0 en reposo → 1 con el título ya
  // "llegado" a la barra) en <html>, y el CSS de `.page-title` y de la
  // copia fija `.titulo-fijo` (ver styles.css, Prioridad 4) la leen para
  // decidir su propia opacidad/tamaño/posición — así los dos quedan atados
  // al mismo número, en tiempo real, sin animación diferida ni salto por
  // umbral. `.scrolled` en `.main` se conserva solo como bandera booleana
  // para la barra (fondo/blur/borde), que si aparece de golpe con el
  // primer pixel de scroll o interpola junto con el título no importa para
  // el ojo: ver `:has()` en styles.css.
  // 24px NO es un número al azar: es la holgura real entre el borde inferior
  // de la barra fija y el techo del título — 12px del padding de `.main`
  // (que despeja navrow + carrusel) más 12px del de `.header`, y sale igual
  // con carrusel y sin él. Atar el umbral a esa holgura hace que TODO ocurra
  // en el mismo instante en que el contenido alcanza la barra: el título
  // grande termina de desvanecerse, la copia fija termina de aparecer y la
  // barra gana su fondo. Con el valor anterior (48px) el título seguía a
  // media opacidad cuando la banda opaca del carrusel ya lo estaba tapando,
  // y se veía literalmente rebanado por la mitad.
  const UMBRAL_TITULO = 24;
  const mainRef = useRef<HTMLElement>(null);
  const tituloFijoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    function sync() {
      const scrollTop = el!.scrollTop;
      const progreso = Math.min(1, scrollTop / UMBRAL_TITULO);
      el!.classList.toggle("scrolled", progreso >= 1);
      document.documentElement.style.setProperty("--progreso-titulo", String(progreso));
      const fijo = tituloFijoRef.current;
      if (fijo) fijo.textContent = el!.querySelector(".page-title")?.textContent ?? "";
    }
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    return () => el.removeEventListener("scroll", sync);
  }, [location.pathname]);

  // "Automático" sigue el modo claro/oscuro del sistema operativo en vivo,
  // sin necesidad de recargar la app cuando el usuario lo cambia en macOS/
  // Windows mientras Tesorería está abierta.
  // Vibrancy (macOS): los fondos transparentes solo se encienden si el efecto
  // nativo quedó activo; si no, el sidebar conserva su fondo sólido.
  useEffect(() => {
    invoke<boolean>("vibrancy_ok")
      .then((ok) => { if (ok) document.documentElement.classList.add("vibrancy"); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme: "light" | "dark" = themePref === "auto" ? (systemDark ? "dark" : "light") : themePref;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem("tesoreria-theme", themePref); } catch { /* noop */ }
  }, [themePref]);

  // "neutro" no escribe atributo: sin `data-acento` quedan los valores de
  // siempre de styles.css, que es el aspecto original de Tamio.
  useEffect(() => {
    if (acento === "neutro") document.documentElement.removeAttribute("data-acento");
    else document.documentElement.setAttribute("data-acento", acento);
    try { localStorage.setItem("tamio-acento", acento); } catch { /* noop */ }
  }, [acento]);

  // El idioma sigue el mismo patrón que el tema: preferencia explícita o
  // "auto", que sigue el idioma del sistema operativo en vivo.
  useEffect(() => {
    saveLangPref(langPref);
    i18n.changeLanguage(resolveLang(langPref));
    if (langPref !== "auto") return;
    const onLangChange = () => i18n.changeLanguage(resolveLang("auto"));
    window.addEventListener("languagechange", onLangChange);
    return () => window.removeEventListener("languagechange", onLangChange);
  }, [langPref]);

  useEffect(() => {
    listMembers(church.id).then((m) => setMemberCount(m.length)).catch(() => {});
    countPendingTx(church.id).then(setPendingCount).catch(() => {});
    countMensajesNoLeidos(church.id, role).then(setUnreadCount).catch(() => {});
  }, [church.id, refreshKey, role]);

  const onSaved = useCallback(() => { setRefreshKey((k) => k + 1); programarSync(); }, []);
  const onChanged = onSaved; // editar/eliminar fuera del modal también dispara el mismo refresh global

  // Sincronización automática (E5): se enciende solo con login válido y arranca
  // los disparadores (al abrir, cada X min, al reconectar y al volver a la
  // ventana). programarSync() en onSaved sube los cambios locales poco después
  // de guardar. El indicador del sidebar refleja el estado.
  useEffect(() => {
    const on = SYNC_HABILITADO && authHabilitado && authEstado.autenticado && !authEstado.sinRol;
    configurarSync(on ? church.id : null, on);
    if (!on) return;
    return iniciarAutoSync();
  }, [church.id, authEstado.autenticado, authEstado.sinRol]);

  // La preferencia se guarda en cuanto cambia, no al cerrar: si la app se cae
  // o se reinicia, la ventana vuelve como el usuario la dejó.
  useEffect(() => {
    try { localStorage.setItem("tamio-sidebar-oculta", sidebarOculta ? "1" : "0"); } catch { /* noop */ }
  }, [sidebarOculta]);

  // Cmd/Ctrl+N abre "Nuevo registro"; Cmd/Ctrl+K abre la paleta de comandos;
  // ⌃⌘S esconde o enseña la barra lateral, que es el atajo que macOS usa para
  // eso en Finder, Notas y Mail.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setModalMode((m) => m ?? { kind: "create", tab: "ingreso" });
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      if (e.metaKey && e.ctrlKey && e.key.toLowerCase() === "s" && esMac()) {
        e.preventDefault();
        setSidebarOculta((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Acciones del menú nativo de macOS (Archivo→Nuevo, Tamio→Ajustes, Ayuda).
  // El menú intercepta sus atajos (p. ej. ⌘N) antes que el teclado del web,
  // así que estas acciones llegan como eventos de Tauri.
  useEffect(() => {
    const offs: Array<() => void> = [];
    listen("menu-nuevo", () => setModalMode((m) => m ?? { kind: "create", tab: "ingreso" })).then((f) => offs.push(f));
    listen("menu-ajustes", () => navigate("/configuracion")).then((f) => offs.push(f));
    listen("menu-ayuda", () => navigate("/ayuda")).then((f) => offs.push(f));
    listen<string>("menu-nav", (e) => navigate(e.payload)).then((f) => offs.push(f));
    listen("menu-sync", () => { if (authHabilitado) void ejecutarSync(); }).then((f) => offs.push(f));
    listen("menu-cmdk", () => setCmdOpen((v) => !v)).then((f) => offs.push(f));
    return () => { offs.forEach((f) => f()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEditTx = useCallback((tx: Tx) => setModalMode({ kind: "editTx", tx }), []);
  const openEditMember = useCallback((m: Member) => setModalMode({ kind: "editMember", member: m }), []);
  const onRoleChange = useCallback((r: Role) => { setRolManual(r); saveRole(r); }, []);

  // Bloquea una ruta según el rol Y el plan contratado (redirige al inicio).
  // El gate por plan evita entrar al área no contratada tecleando la URL.
  const guard = (path: string, element: ReactNode) =>
    puedeVer(role, path) && rutaPermitidaPorPlan(church.plan, path)
      ? element
      : <Navigate to={HOME_POR_ROL[role]} replace />;

  // ---------------------------------------------------------------------
  // El "+" de iPhone/iPad (BotonCrear) ya no abre un selector de tipo: crea
  // lo que corresponde a la pantalla en la que ya está el usuario. Las rutas
  // guardadas por `guard()` arriba no necesitan repetir aquí su permiso —si
  // `location.pathname` es esa ruta, `guard` ya la dejó pasar—; las dos
  // excepciones son "/" (no pasa por `guard`, decide sola qué pinta según
  // rol y plan) y "/miembros" (ver permite verla, crear es un permiso más
  // fino aparte — mismo `puedeCrearMiembros` que ya usa esa página).
  // Ingresos y gastos abren su modal aquí mismo; el resto navega a su propia
  // pantalla con `state: { crear: true }`, la señal que ya lee cada una
  // (`useAbrirCrearDesdeMas`) para abrir su formulario en cuanto monta.
  const dashboardEsFinanciero = role !== "secretaria" && incluyeTesoreria(church.plan);
  const puedeCrearMiembrosAqui = puedeCrearMiembros(role, church.plan);
  const RUTAS_CREAR_NAVEGABLE = new Set([
    "/depositos", "/membresia", "/servicios", "/actas", "/cartas", "/agenda",
  ]);
  function hayCrearAqui(pathname: string): boolean {
    if (pathname === "/") return dashboardEsFinanciero;
    if (pathname === "/ingresos" || pathname === "/gastos") return true;
    if (pathname === "/miembros") return puedeCrearMiembrosAqui;
    return RUTAS_CREAR_NAVEGABLE.has(pathname);
  }
  function crearAqui() {
    const p = location.pathname;
    if ((p === "/" && dashboardEsFinanciero) || p === "/ingresos") {
      setModalMode({ kind: "create", tab: "ingreso" });
      return;
    }
    if (p === "/gastos") { setModalMode({ kind: "create", tab: "gasto" }); return; }
    if (p === "/miembros") {
      if (puedeCrearMiembrosAqui) setModalMode({ kind: "create", tab: "miembro" });
      return;
    }
    if (RUTAS_CREAR_NAVEGABLE.has(p)) navigate(p, { state: { crear: true } });
  }

  // Puerta de autenticación (solo si hay credenciales de Supabase configuradas).
  if (authHabilitado) {
    if (authEstado.cargando) {
      return <div className="login-screen"><div className="login-cargando">{t("login.cargando")}</div></div>;
    }
    if (!authEstado.autenticado) return <Login />;
    if (authEstado.sinRol) {
      return (
        <div className="login-screen">
          <div className="login-card" style={{ textAlign: "center" }}>
            <div className="login-title">{t("login.sinRolTitulo")}</div>
            <div className="login-sub">{t("login.sinRolSub", { email: authEstado.email ?? "" })}</div>
            <button className="btn secondary login-btn" onClick={salir}>{t("login.salir")}</button>
          </div>
        </div>
      );
    }
    // Bloqueo duro: suscripción vencida MÁS ALLÁ del periodo de gracia.
    // Solo aplica con sesión en la nube; la cortesía y el modo local nunca
    // llegan aquí (evaluarVigencia los considera siempre activos).
    if (evaluarVigencia(church.sub_estado, church.sub_vence).vencida) {
      return (
        <div className="login-screen">
          <div className="login-card" style={{ textAlign: "center" }}>
            <div className="login-title">{t("plan.bloqueoTitulo")}</div>
            <div className="login-sub">{t("plan.bloqueoSub")}</div>
            {urlCompra !== null && (
              <button className="btn primary login-btn" onClick={() => { void openUrl(urlCompra as string).catch(console.error); }}>
                {t("plan.renovar")}
              </button>
            )}
            <button className="btn secondary login-btn" onClick={salir}>{t("login.salir")}</button>
          </div>
        </div>
      );
    }
  }

  /* Las rutas, en una variable, porque las pintan DOS <Routes>: el de la
     página actual y el de la vecina que se asoma mientras se arrastra el
     carrusel. Antes vivían en línea; sacarlas no cambia nada de lo que hacen,
     solo permite que el mismo juego se case contra otra ruta sin navegar. */
  const rutas = (
    <>
      <Route
        path="/"
        element={role === "secretaria"
          ? (incluyeSecretaria(church.plan)
              ? <InicioSecretaria church={church} refreshKey={refreshKey} />
              // Secretaria en plan "solo Tesorería": su área no está
              // contratada; solo le queda el reporte de Tesorería.
              : <HomeSinArea area="secretaria" verReportes={incluyeTesoreria(church.plan)} />)
          : incluyeTesoreria(church.plan)
            ? <Dashboard
                church={church}
                refreshKey={refreshKey}
                memberCount={memberCount}
                onEditTx={openEditTx}
                onChanged={onChanged}
                onNew={() => setModalMode({ kind: "create", tab: "ingreso" })}
              />
            // Plan "solo Secretaría": el administrador aterriza en el
            // inicio de Secretaría; el tesorero no tiene área contratada.
            : role === "administrador"
              ? <InicioSecretaria church={church} refreshKey={refreshKey} />
              : <HomeSinArea area="tesoreria" verReportes={false} />
        }
      />
      <Route
        path="/ingresos"
        element={guard("/ingresos",
          <Movimientos
            church={church}
            tipo="ingreso"
            refreshKey={refreshKey}
            onNew={() => setModalMode({ kind: "create", tab: "ingreso" })}
            onEditTx={openEditTx}
            onChanged={onChanged}
          />
        )}
      />
      <Route
        path="/gastos"
        element={guard("/gastos",
          <Movimientos
            church={church}
            tipo="gasto"
            refreshKey={refreshKey}
            onNew={() => setModalMode({ kind: "create", tab: "gasto" })}
            onEditTx={openEditTx}
            onChanged={onChanged}
          />
        )}
      />
      <Route
        path="/miembros"
        element={guard("/miembros",
          <Miembros
            church={church}
            refreshKey={refreshKey}
            puedeCrear={puedeCrearMiembros(role, church.plan)}
            onEdit={openEditMember}
            onNew={() => setModalMode({ kind: "create", tab: "miembro" })}
            onChanged={onChanged}
          />
        )}
      />
      <Route
        path="/reportes"
        element={guard("/reportes", <Reportes church={church} refreshKey={refreshKey} onChanged={onChanged} />)}
      />
      <Route
        path="/depositos"
        element={guard("/depositos", <Depositos church={church} refreshKey={refreshKey} onChanged={onChanged} />)}
      />
      <Route
        path="/membresia"
        element={guard("/membresia",
          <Membresia
            church={church}
            refreshKey={refreshKey}
            onEdit={openEditMember}
            onChanged={onChanged}
          />
        )}
      />
      <Route
        path="/actas"
        element={guard("/actas", <Actas church={church} refreshKey={refreshKey} onChanged={onChanged} />)}
      />
      <Route
        path="/servicios"
        element={guard("/servicios", <Servicios church={church} refreshKey={refreshKey} onChanged={onChanged} />)}
      />
      <Route
        path="/cartas"
        element={guard("/cartas", <Cartas church={church} refreshKey={refreshKey} onChanged={onChanged} />)}
      />
      <Route
        path="/reporte-miembros"
        element={guard("/reporte-miembros",
          <InformesMembresia
            church={church}
            refreshKey={refreshKey}
            onEdit={openEditMember}
            onChanged={onChanged}
          />
        )}
      />
      <Route path="/agenda" element={guard("/agenda", <Agenda church={church} refreshKey={refreshKey} onChanged={onChanged} />)} />
      <Route
        path="/inbox"
        element={<Mensajes church={church} role={role} refreshKey={refreshKey} onChanged={onChanged} />}
      />
      <Route
        path="/bandeja"
        element={guard("/bandeja",
          <Bandeja church={church} refreshKey={refreshKey} onEditTx={openEditTx} onChanged={onChanged} />
        )}
      />
      <Route path="/ayuda" element={<Ayuda role={role} />} />
      <Route
        path="/configuracion"
        element={
          <Configuracion
            church={church}
            onChurchUpdated={onChurchUpdated}
            themePref={themePref}
            onThemePrefChange={setThemePref}
            acento={acento}
            onAcentoChange={setAcento}
            langPref={langPref}
            onLangPrefChange={setLangPref}
            role={role}
            onRoleChange={onRoleChange}
            authActivo={authHabilitado}
            sesionEmail={authEstado.email}
            sesionNombre={authEstado.nombre}
            sesionFoto={authEstado.foto}
            onEditarPerfil={() => setPerfilAbierto(true)}
            onSalir={salir}
          />
        }
      />
    </>
  );

  return (
    <div className={`app${menuAbierto ? " menu-abierto" : ""}`} data-sidebar-oculta={sidebarOculta || undefined}>
      {/* El proveedor no pinta ningún nodo propio: envuelve el shell entero
          para que cualquier pantalla pueda publicar su resumen con
          `useBarraEstado`, y deja la franja como ÚLTIMO hijo de `.app` —que
          es donde la rejilla la coloca. Se monta siempre; el CSS la apaga
          fuera del Mac. */}
      <BarraEstadoProvider>
      {/* Franja para arrastrar la ventana con la barra de título integrada.
          Además del atributo data-tauri-drag-region (que en macOS con ventana
          transparente a veces no engancha), se llama startDragging() a mano:
          con cualquiera de los dos mecanismos la ventana se mueve. Doble clic
          maximiza/restaura, como la barra de título nativa. */}
      <div
        className="titlebar-drag"
        data-tauri-drag-region
        onMouseDown={(e) => {
          if (e.buttons === 1 && e.detail === 1) {
            // El .catch NO se traga el error: si falta el permiso
            // `core:window:allow-start-dragging` la ventana deja de moverse y
            // sin este aviso no hay forma de saber por qué. Pasó exactamente
            // eso, y el único rastro era un mensaje suelto en la consola.
            getCurrentWindow().startDragging()
              .catch((e) => console.warn("no se pudo arrastrar la ventana:", e));
          }
        }}
        onDoubleClick={() => {
          getCurrentWindow().toggleMaximize()
            .catch((e) => console.warn("no se pudo maximizar la ventana:", e));
        }}
      />
      {cmdOpen && (
        <CmdPalette
          church={church}
          role={role}
          onClose={() => setCmdOpen(false)}
          onNavigate={navigate}
          onNuevo={(tab) => setModalMode({ kind: "create", tab })}
          onEditMember={openEditMember}
        />
      )}
      <button
        type="button"
        className="menu-hamburguesa"
        aria-label={t("nav.abrirMenu")}
        aria-expanded={menuAbierto}
        onClick={() => setMenuAbierto((v) => !v)}
      >
        {/* El icono de BARRA LATERAL del handoff del header (24 ago), no las
            tres rayas de antes: en iPadOS este botón abre una COLUMNA que
            existe, no un menú, y es el glifo que usan Notas, Archivos y Mail.
            Es el mismo `IconSidebar` que el Mac ya usa en su toolbar, así que
            el gesto se llama igual en los dos sitios.

            Va sin condicionar al iPad aunque el diseño sea suyo, porque este
            botón es SOLO del iPad: el iPhone lo esconde con `!important` (ahí
            el sidebar no existe, su contenido se mudó a Ajustes) y el Mac
            también, en todos sus anchos. Se comprobó antes de simplificar;
            un segundo glifo para los otros casos habría sido código muerto. */}
        <IconSidebar size={19} strokeWidth={1.6} />
      </button>
      {menuAbierto && <div className="menu-telon" onClick={() => setMenuAbierto(false)} />}
      {/* Esconder la barra lateral, el primer control de la toolbar en el
          diseño. Vive AQUÍ y no dentro de cada `.header` por lo mismo que
          `.titulo-fijo`: es cáscara, no contenido de la página, y meterlo en
          las dieciséis pantallas sería dieciséis copias del mismo botón. Va
          fijo encima de la toolbar, que le reserva el hueco con su
          `padding-left` (ver styles.css). El CSS lo apaga fuera del Mac. */}
      <button
        type="button"
        className="btn-sidebar"
        aria-pressed={sidebarOculta}
        title={`${sidebarOculta ? t("nav.mostrarSidebar") : t("nav.ocultarSidebar")} (⌃⌘S)`}
        aria-label={sidebarOculta ? t("nav.mostrarSidebar") : t("nav.ocultarSidebar")}
        onClick={() => setSidebarOculta((v) => !v)}
      >
        <IconSidebar />
      </button>
      <Sidebar church={church} memberCount={memberCount} pendingCount={pendingCount} unreadCount={unreadCount} role={role} authActivo={authHabilitado} sesionEmail={authEstado.email} sesionNombre={authEstado.nombre} sesionFoto={authEstado.foto} onEditarPerfil={() => setPerfilAbierto(true)} onSalir={salir} onBuscar={() => setCmdOpen(true)} />
      {/* Bug de teléfono: el carrusel vivía DENTRO de <main> (el área con
          scroll) y se posicionaba con position:sticky para no desplazarse —
          pero seguía siendo contenido desplazable, así que al entrar a la
          página aparecía tapado bajo la fila fija de "+"/compartir y había
          que arrastrar para revelarlo. Ahora es HERMANO de <main>, fijo de
          verdad (position:fixed en el CSS), igual que esa fila: nav bar →
          carrusel → recién ahí el área con scroll. */}
      <CarruselSecciones
        role={role}
        memberCount={memberCount}
        pendingCount={pendingCount}
        unreadCount={unreadCount}
        onVecina={(ruta) => setVecina(
          ruta && mainRef.current ? { ruta, top: techoDeLaPagina(mainRef.current) } : null,
        )}
      />
      {/* Copia acoplada del Large Title: vive siempre fija en la fila del
          "+", con el mismo texto que `.page-title` (el efecto de scroll de
          arriba la mantiene sincronizada). En reposo es invisible
          (--progreso-titulo en 0); al hacer scroll se desvanece hacia
          dentro mientras el título grande se desvanece hacia afuera —
          ver styles.css. */}
      <div className="titulo-fijo" ref={tituloFijoRef} aria-hidden="true" />
      <main className={`main${hayCarrusel ? " con-carrusel" : ""}`} ref={mainRef}>
        <UpdateBanner />
        <SyncPausadoBanner />
        {authHabilitado && <SubBanner church={church} />}
        <Routes>{rutas}</Routes>
        {/* La vecina del carrusel, asomando durante el arrastre. Es el MISMO
            juego de <Route>: `<Routes location=…>` casa contra una ruta que no
            es la actual sin navegar a ella. Por eso no hubo que partir el
            router en dos ni duplicar una sola pantalla.

            `inert` y `aria-hidden` porque es una vista previa: no recibe
            toques ni la anuncia el lector de pantalla. Y se monta solo cuando
            el arrastre ya pasó de un umbral, no en cada roce: montar una
            página corre sus consultas (Reportes hace ocho). */}
        {vecina && (
          <div className="pager-vecina" aria-hidden="true" inert style={{ top: vecina.top }}>
            <Routes location={vecina.ruta}>{rutas}</Routes>
          </div>
        )}
      </main>

      <BarraInferior
        role={role}
        memberCount={memberCount}
        pendingCount={pendingCount}
        unreadCount={unreadCount}
      />
      {hayCrearAqui(location.pathname) && <BotonCrear onCrear={crearAqui} />}

      {modalMode && (
        <NewRecordModal
          church={church}
          mode={modalMode}
          onClose={() => setModalMode(null)}
          onSaved={onSaved}
        />
      )}

      {perfilAbierto && (
        <PerfilModal
          nombre={authEstado.nombre}
          email={authEstado.email}
          foto={authEstado.foto}
          onGuardar={guardarPerfil}
          onBorrarCuenta={authHabilitado ? async () => {
            // Borra la cuenta en la nube, luego vacía los datos locales y
            // recarga la app (queda como recién instalada).
            await borrarCuenta();
            await borrarTodoLocal().catch(() => { /* aun sin local, seguimos */ });
            window.location.reload();
          } : undefined}
          onClose={() => setPerfilAbierto(false)}
        />
      )}

      {showWelcome && (
        <Welcome
          church={church}
          langPref={langPref}
          onLangPrefChange={setLangPref}
          onDone={(updated) => {
            try { localStorage.setItem("tesoreria-welcomed", "1"); } catch { /* noop */ }
            onChurchUpdated(updated);
            setShowWelcome(false);
          }}
        />
      )}

      <ToastHost />
      </BarraEstadoProvider>
    </div>
  );
}

const AVISO_COMPROBANTES_KEY = "tamio-aviso-comprobantes";

/**
 * Avisa al tesorero de cuántos comprobantes quedaron sin recuperar y lo lleva
 * a la pantalla donde puede arreglarlo.
 *
 * Un número en la consola no le sirve a nadie: el aviso existe para dirigir a
 * alguien a la tarjeta "Comprobantes por recuperar" de Ajustes. Si no queda
 * ninguno pendiente no se dice nada, aunque se hayan copiado cien: la
 * migración es fontanería y no merece interrumpir a nadie cuando sale bien.
 *
 * Se muestra una vez por cifra: si al reiniciar siguen faltando los mismos, no
 * vuelve a insistir (la tarjeta de Ajustes está siempre ahí). Si el número
 * cambia —porque se recuperó alguno, o porque aparecieron nuevos— vuelve a
 * salir, que es cuando hay algo nuevo que contar.
 */
function avisarComprobantes(r: { copiados: number; pendientes: number }): void {
  if (r.pendientes === 0) return;
  const huella = `${r.copiados}/${r.pendientes}`;
  try {
    if (localStorage.getItem(AVISO_COMPROBANTES_KEY) === huella) return;
    localStorage.setItem(AVISO_COMPROBANTES_KEY, huella);
  } catch { /* noop */ }
  showToast(i18n.t("comprobantesPendientes.aviso", { copiados: r.copiados, count: r.pendientes }), {
    actionLabel: i18n.t("comprobantesPendientes.verAviso"),
    // HashRouter: cambiar el hash navega, y así este aviso no necesita el
    // contexto del router (se dispara antes de que se monte la app).
    onAction: () => { window.location.hash = "#/configuracion"; },
    duration: 12000,
  });
}

/**
 * Pantalla de carga con el paso actual.
 *
 * Antes esto era `return null`: si cualquier paso del arranque se colgaba —una
 * promesa que ni se resuelve ni falla— la ventana se quedaba en blanco para
 * siempre, sin error, sin pista y sin nada que el usuario pudiera contar más
 * allá de "se puso en blanco". Ahora, pasados unos segundos, dice EN QUÉ PASO
 * se quedó, que es exactamente el dato que hacía falta.
 */
function Cargando({ paso }: { paso: string }) {
  const [tarda, setTarda] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTarda(true), 6000);
    return () => clearTimeout(t);
  }, []);
  if (!tarda) return null; // el arranque normal es instantáneo: no parpadea
  return (
    <div className="pantalla-error">
      <h2>Tamio está tardando en abrir</h2>
      <p>
        Se quedó en este paso. Si no avanza en un minuto, ciérrala y vuelve a
        abrirla; si sigue igual, pasa este texto por el chat.
      </p>
      <pre>Paso: {paso}</pre>
    </div>
  );
}

export default function App() {
  const [church, setChurch] = useState<Church | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Qué se está haciendo ahora mismo. Solo se ve si el arranque se atasca.
  const [paso, setPaso] = useState("abriendo la base de datos");

  useEffect(() => {
    getOrCreateChurch()
      .then(async (c) => {
        setPaso("cargando categorías");
        await loadCategoriasCustom(c.id);
        // Registra los gastos fijos de los meses que llegaron desde la
        // última vez que se abrió la app (nunca meses futuros).
        setPaso("registrando movimientos recurrentes");
        await materializeMovimientosRecurrentes(c.id, c.moneda);
        // Sanea folios de carta repetidos (los dejaba un bug ya corregido y
        // los puede juntar la sincronización): conserva el más antiguo y
        // renumera el resto. Con datos sanos no hace nada.
        setPaso("revisando folios de cartas");
        await repararFoliosDuplicados(c.id).catch(() => {});
        // Trae adentro los comprobantes que apuntaban a carpetas del usuario
        // (Escritorio, Descargas, iCloud) y pasa a ruta relativa los que ya
        // estaban dentro. Con datos ya migrados no hace nada.
        setPaso("guardando comprobantes dentro de la app");
        await migrarComprobantesExternos(c.id)
          .then(avisarComprobantes)
          .catch(() => {});
        // La pausa la escribe Rust en el instante de aplicar el respaldo, en
        // un archivo junto a la base; aquí solo se pone al día el espejo de
        // localStorage ANTES de que se encienda la sincronización. Un
        // localStorage limpiado no debe dejar la sincronización suelta sobre
        // datos recién restaurados.
        setPaso("comprobando si se restauró un respaldo");
        await sincronizarPausaDesdeRust();
        // El logo y las firmas siguen la misma regla que los comprobantes:
        // dentro de la app y con ruta relativa. Como esto reescribe columnas de
        // `churches`, la iglesia se vuelve a leer para no quedarnos con las
        // rutas viejas en memoria.
        setPaso("guardando logo y firmas dentro de la app");
        const img = await migrarImagenesIglesia(c.id).catch(() => null);
        const iglesia = img && (img.copiados || img.normalizados) ? await getOrCreateChurch() : c;
        setMonedaActiva(iglesia.moneda);
        setChurch(iglesia);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: "sans-serif" }}>
        <h2>Error al iniciar la base de datos</h2>
        <pre style={{ whiteSpace: "pre-wrap", color: "var(--neg, #b91c1c)" }}>{error}</pre>
      </div>
    );
  }

  if (!church) {
    return <Cargando paso={paso} />;
  }

  return (
    <HashRouter>
      <Shell
        church={church}
        onChurchUpdated={(c) => {
          setMonedaActiva(c.moneda);
          setChurch(c);
        }}
      />
    </HashRouter>
  );
}
