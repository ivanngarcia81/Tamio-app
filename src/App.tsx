import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Sidebar from "./components/Sidebar";
import SubBanner from "./components/SubBanner";
import UpdateBanner from "./components/UpdateBanner";
import BarraInferior from "./components/BarraInferior";
import BotonCrear from "./components/BotonCrear";
import CarruselSecciones from "./components/CarruselSecciones";
import HojaCrear from "./components/HojaCrear";
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
import { iniciarTour } from "./tour";
import { migrarComprobantesExternos } from "./services/comprobantes";
import { migrarImagenesIglesia } from "./services/imagenesIglesia";
import { sincronizarPausaDesdeRust } from "./services/restaurar";
import { showToast } from "./toast";
import type { ThemePref } from "./components/settings/AppearanceSettings";
import { ACENTOS, type Acento } from "./components/settings/AccentSettings";
import { borrarTodoLocal, countMensajesNoLeidos, countPendingTx, getOrCreateChurch, listMembers, loadCategoriasCustom, materializeMovimientosRecurrentes, repararFoliosDuplicados, setMonedaActiva, type Church, type Member, type Tx } from "./db";
import i18n, { initialLangPref, resolveLang, saveLangPref, type LangPref } from "./i18n";
import { HOME_POR_ROL, initialRole, puedeVer, saveRole, type Role } from "./role";
import { evaluarVigencia, incluyeSecretaria, incluyeTesoreria, puedeCrearMiembros, rutaPermitidaPorPlan, urlCompra } from "./plan";
import { openUrl } from "@tauri-apps/plugin-opener";
import { authHabilitado } from "./supabase";
import { configurarSync, ejecutarSync, iniciarAutoSync, programarSync, SYNC_HABILITADO } from "./syncManager";
import { useSupabaseAuth } from "./auth";
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

function Shell({ church, onChurchUpdated }: { church: Church; onChurchUpdated: (c: Church) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [themePref, setThemePref] = useState<ThemePref>(initialThemePref);
  const [acento, setAcento] = useState<Acento>(initialAcento);
  const [langPref, setLangPref] = useState<LangPref>(initialLangPref);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [hojaCrear, setHojaCrear] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [rolManual, setRolManual] = useState<Role>(initialRole);
  const [showWelcome, setShowWelcome] = useState(() => esPrimerArranque(church));
  const [refreshKey, setRefreshKey] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  // Con login activo el rol viene del servidor; sin login, del selector manual.
  const { estado: authEstado, salir, guardarPerfil, borrarCuenta } = useSupabaseAuth();
  const [perfilAbierto, setPerfilAbierto] = useState(false);
  // Cajón lateral en pantallas angostas (iPhone): la sidebar se oculta y se
  // abre con el botón de menú; navegar la cierra sola.
  const [menuAbierto, setMenuAbierto] = useState(false);
  const location = useLocation();
  useEffect(() => { setMenuAbierto(false); }, [location.pathname]);
  const role: Role = authHabilitado ? (authEstado.role ?? "secretaria") : rolManual;

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

  // Cmd/Ctrl+N abre "Nuevo registro"; Cmd/Ctrl+K abre la paleta de comandos.
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
    listen("menu-tour", () => iniciarTour(t)).then((f) => offs.push(f));
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

  return (
    <div className={`app${menuAbierto ? " menu-abierto" : ""}`}>
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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
      </button>
      {menuAbierto && <div className="menu-telon" onClick={() => setMenuAbierto(false)} />}
      <Sidebar church={church} memberCount={memberCount} pendingCount={pendingCount} unreadCount={unreadCount} role={role} authActivo={authHabilitado} sesionEmail={authEstado.email} sesionNombre={authEstado.nombre} sesionFoto={authEstado.foto} onEditarPerfil={() => setPerfilAbierto(true)} onSalir={salir} />
      <main className="main">
        <UpdateBanner />
        <SyncPausadoBanner />
        {authHabilitado && <SubBanner church={church} />}
        <CarruselSecciones role={role} memberCount={memberCount} pendingCount={pendingCount} unreadCount={unreadCount} />
        <Routes>
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
          <Route
            path="/ayuda"
            element={<Ayuda role={role} onIniciarTour={() => iniciarTour(t)} />}
          />
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
              />
            }
          />
        </Routes>
      </main>

      <BarraInferior
        role={role}
        memberCount={memberCount}
        pendingCount={pendingCount}
        unreadCount={unreadCount}
      />
      <BotonCrear onCrear={() => setHojaCrear(true)} />

      {hojaCrear && (
        <HojaCrear
          role={role}
          onCerrar={() => setHojaCrear(false)}
          onElegir={(id) => {
            setHojaCrear(false);
            // Ingresos y gastos abren su modal desde aquí: son los dos que se
            // registran cada semana y merecen los dos toques prometidos. Los
            // demás llevan a su pantalla, donde está su propio botón de crear
            // -un primer paso honesto, y sin tocar seis páginas-.
            if (id === "ingreso" || id === "gasto") {
              setModalMode({ kind: "create", tab: id });
              return;
            }
            const rutas: Record<string, string> = {
              deposito: "/depositos", miembro: "/membresia", servicio: "/servicios",
              acta: "/actas", carta: "/cartas", evento: "/agenda",
            };
            const r = rutas[id];
            if (r) navigate(r);
          }}
        />
      )}

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
