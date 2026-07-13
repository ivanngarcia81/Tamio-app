import { useCallback, useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import NewRecordModal, { type ModalMode } from "./components/NewRecordModal";
import Dashboard from "./pages/Dashboard";
import Movimientos from "./pages/Movimientos";
import Miembros from "./pages/Miembros";
import Reportes from "./pages/Reportes";
import Depositos from "./pages/Depositos";
import Bandeja from "./pages/Bandeja";
import Configuracion from "./pages/Configuracion";
import type { ThemePref } from "./components/settings/AppearanceSettings";
import { countPendingTx, getOrCreateChurch, listMembers, type Church, type Member, type Tx } from "./db";
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

function Shell({ church, onChurchUpdated }: { church: Church; onChurchUpdated: (c: Church) => void }) {
  const [themePref, setThemePref] = useState<ThemePref>(initialThemePref);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

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

  useEffect(() => {
    listMembers(church.id).then((m) => setMemberCount(m.length)).catch(() => {});
    countPendingTx(church.id).then(setPendingCount).catch(() => {});
  }, [church.id, refreshKey]);

  const onSaved = useCallback(() => setRefreshKey((k) => k + 1), []);
  const onChanged = onSaved; // editar/eliminar fuera del modal también dispara el mismo refresh global

  const openEditTx = useCallback((tx: Tx) => setModalMode({ kind: "editTx", tx }), []);
  const openEditMember = useCallback((m: Member) => setModalMode({ kind: "editMember", member: m }), []);

  return (
    <div className="app">
      <Sidebar church={church} memberCount={memberCount} pendingCount={pendingCount} />
      <main className="main">
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
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
            element={
              <Movimientos
                church={church}
                tipo="ingreso"
                refreshKey={refreshKey}
                onNew={() => setModalMode({ kind: "create", tab: "ingreso" })}
                onEditTx={openEditTx}
                onChanged={onChanged}
              />
            }
          />
          <Route
            path="/gastos"
            element={
              <Movimientos
                church={church}
                tipo="gasto"
                refreshKey={refreshKey}
                onNew={() => setModalMode({ kind: "create", tab: "gasto" })}
                onEditTx={openEditTx}
                onChanged={onChanged}
              />
            }
          />
          <Route
            path="/miembros"
            element={
              <Miembros
                church={church}
                refreshKey={refreshKey}
                onNew={() => setModalMode({ kind: "create", tab: "miembro" })}
                onEdit={openEditMember}
                onChanged={onChanged}
              />
            }
          />
          <Route
            path="/reportes"
            element={<Reportes church={church} refreshKey={refreshKey} onChanged={onChanged} />}
          />
          <Route
            path="/depositos"
            element={<Depositos church={church} refreshKey={refreshKey} onChanged={onChanged} />}
          />
          <Route
            path="/bandeja"
            element={
              <Bandeja church={church} refreshKey={refreshKey} onEditTx={openEditTx} onChanged={onChanged} />
            }
          />
          <Route
            path="/configuracion"
            element={
              <Configuracion
                church={church}
                onChurchUpdated={onChurchUpdated}
                themePref={themePref}
                onThemePrefChange={setThemePref}
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
    </div>
  );
}

export default function App() {
  const [church, setChurch] = useState<Church | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrCreateChurch().then(setChurch).catch((e) => setError(String(e)));
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
