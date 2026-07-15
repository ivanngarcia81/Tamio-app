import { useCallback, useEffect, useState, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
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
import type { ThemePref } from "./components/settings/AppearanceSettings";
import { countMensajesNoLeidos, countPendingTx, getOrCreateChurch, listMembers, loadCategoriasCustom, materializeMovimientosRecurrentes, type Church, type Member, type Tx } from "./db";
import i18n, { initialLangPref, resolveLang, saveLangPref, type LangPref } from "./i18n";
import { HOME_POR_ROL, initialRole, puedeVer, saveRole, type Role } from "./role";
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
  const [themePref, setThemePref] = useState<ThemePref>(initialThemePref);
  const [langPref, setLangPref] = useState<LangPref>(initialLangPref);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [role, setRole] = useState<Role>(initialRole);
  const [showWelcome, setShowWelcome] = useState(() => esPrimerArranque(church));
  const [refreshKey, setRefreshKey] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  // "Automático" sigue el modo claro/oscuro del sistema operativo en vivo,
  // sin necesidad de recargar la app cuando el usuario lo cambia en macOS/
  // Windows mientras Tesorería está abierta.
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

  const onSaved = useCallback(() => setRefreshKey((k) => k + 1), []);
  const onChanged = onSaved; // editar/eliminar fuera del modal también dispara el mismo refresh global

  // Cmd/Ctrl+N abre "Nuevo registro" desde cualquier pantalla (si no hay
  // ya un modal abierto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setModalMode((m) => m ?? { kind: "create", tab: "ingreso" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openEditTx = useCallback((tx: Tx) => setModalMode({ kind: "editTx", tx }), []);
  const openEditMember = useCallback((m: Member) => setModalMode({ kind: "editMember", member: m }), []);
  const onRoleChange = useCallback((r: Role) => { setRole(r); saveRole(r); }, []);

  // Bloquea una ruta según el rol (redirige al inicio permitido).
  const guard = (path: string, element: ReactNode) =>
    puedeVer(role, path) ? element : <Navigate to={HOME_POR_ROL[role]} replace />;

  return (
    <div className="app">
      <Sidebar church={church} memberCount={memberCount} pendingCount={pendingCount} unreadCount={unreadCount} role={role} />
      <main className="main">
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
                onChanged={onChanged}
              />
            )}
          />
          <Route
            path="/reportes"
            element={<Reportes church={church} refreshKey={refreshKey} onChanged={onChanged} />}
          />
          <Route
            path="/depositos"
            element={guard("/depositos", <Depositos church={church} refreshKey={refreshKey} onChanged={onChanged} />)}
          />
          <Route
            path="/membresia"
            element={
              <Membresia
                church={church}
                refreshKey={refreshKey}
                onNew={() => setModalMode({ kind: "create", tab: "miembro", bloquearPestana: true })}
                onEdit={openEditMember}
                onChanged={onChanged}
              />
            }
          />
          <Route
            path="/actas"
            element={<Actas church={church} refreshKey={refreshKey} onChanged={onChanged} />}
          />
          <Route
            path="/servicios"
            element={<Servicios church={church} refreshKey={refreshKey} onChanged={onChanged} />}
          />
          <Route
            path="/cartas"
            element={<Cartas church={church} refreshKey={refreshKey} onChanged={onChanged} />}
          />
          <Route
            path="/reporte-miembros"
            element={
              <InformesMembresia
                church={church}
                refreshKey={refreshKey}
                onEdit={openEditMember}
                onChanged={onChanged}
              />
            }
          />
          <Route path="/agenda" element={<Agenda church={church} refreshKey={refreshKey} onChanged={onChanged} />} />
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
