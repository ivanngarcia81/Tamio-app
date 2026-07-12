import { useCallback, useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import NewRecordModal, { type ModalMode } from "./components/NewRecordModal";
import Dashboard from "./pages/Dashboard";
import Movimientos from "./pages/Movimientos";
import Miembros from "./pages/Miembros";
import Reportes from "./pages/Reportes";
import Bandeja from "./pages/Bandeja";
import Configuracion from "./pages/Configuracion";
import { countPendingTx, getOrCreateChurch, listMembers, type Church, type Member, type Tx } from "./db";
import "./styles.css";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("tesoreria-theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* noop */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function Shell({ church, onChurchUpdated }: { church: Church; onChurchUpdated: (c: Church) => void }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("tesoreria-theme", theme); } catch { /* noop */ }
  }, [theme]);

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
      <Sidebar
        church={church}
        memberCount={memberCount}
        pendingCount={pendingCount}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />
      <main className="main">
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                church={church}
                refreshKey={refreshKey}
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
          <Route path="/reportes" element={<Reportes church={church} refreshKey={refreshKey} />} />
          <Route
            path="/bandeja"
            element={
              <Bandeja church={church} refreshKey={refreshKey} onEditTx={openEditTx} onChanged={onChanged} />
            }
          />
          <Route
            path="/configuracion"
            element={<Configuracion church={church} onChurchUpdated={onChurchUpdated} />}
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
