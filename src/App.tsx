import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { HashRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/Sidebar";
import SubBanner from "./components/SubBanner";
import CmdPalette from "./components/CmdPalette";
import ToastHost from "./components/ToastHost";
import NewRecordModal, { type ModalMode } from "./components/NewRecordModal";
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
import type { ThemePref } from "./components/settings/AppearanceSettings";
import { countMensajesNoLeidos, countPendingTx, getOrCreateChurch, listMembers, loadCategoriasCustom, materializeMovimientosRecurrentes, type Church, type Member, type Tx } from "./db";
import i18n, { initialLangPref, resolveLang, saveLangPref, type LangPref } from "./i18n";
import { HOME_POR_ROL, initialRole, puedeVer, saveRole, type Role } from "./role";
import { evaluarVigencia, rutaPermitidaPorPlan, urlCompra } from "./plan";
import { openUrl } from "@tauri-apps/plugin-opener";
import { authHabilitado } from "./supabase";
import { configurarSync, ejecutarSync, iniciarAutoSync, programarSync } from "./syncManager";
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

function Shell({ church, onChurchUpdated }: { church: Church; onChurchUpdated: (c: Church) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [themePref, setThemePref] = useState<ThemePref>(initialThemePref);
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
  const { estado: authEstado, salir } = useSupabaseAuth();
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
    const on = authHabilitado && authEstado.autenticado && !authEstado.sinRol;
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
    <div className="app">
      {/* Franja para arrastrar la ventana con la barra de título integrada. */}
      <div className="titlebar-drag" data-tauri-drag-region />
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
      <Sidebar church={church} memberCount={memberCount} pendingCount={pendingCount} unreadCount={unreadCount} role={role} authActivo={authHabilitado} sesionEmail={authEstado.email} onSalir={salir} />
      <main className="main">
        {authHabilitado && <SubBanner church={church} />}
        <Routes>
          <Route
            path="/"
            element={role === "secretaria"
              ? <InicioSecretaria church={church} refreshKey={refreshKey} />
              : <Dashboard
                  church={church}
                  refreshKey={refreshKey}
                  memberCount={memberCount}
                  onEditTx={openEditTx}
                  onChanged={onChanged}
                  onNew={() => setModalMode({ kind: "create", tab: "ingreso" })}
                />
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

      {modalMode && (
        <NewRecordModal
          church={church}
          mode={modalMode}
          onClose={() => setModalMode(null)}
          onSaved={onSaved}
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

export default function App() {
  const [church, setChurch] = useState<Church | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrCreateChurch()
      .then(async (c) => {
        await loadCategoriasCustom(c.id);
        // Registra los gastos fijos de los meses que llegaron desde la
        // última vez que se abrió la app (nunca meses futuros).
        await materializeMovimientosRecurrentes(c.id, c.moneda);
        setChurch(c);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: "sans-serif" }}>
        <h2>Error al iniciar la base de datos</h2>
        <pre style={{ whiteSpace: "pre-wrap", color: "#b91c1c" }}>{error}</pre>
      </div>
    );
  }

  if (!church) {
    return null; // carga inicial (fracción de segundo)
  }

  return (
    <HashRouter>
      <Shell church={church} onChurchUpdated={setChurch} />
    </HashRouter>
  );
}
