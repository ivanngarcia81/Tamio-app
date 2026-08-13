// Vista previa de la cáscara móvil. NO forma parte de la app: monta los
// componentes REALES (barra inferior, carrusel, hoja de crear) con el CSS
// real y datos de mentira, para poder mirar tamaños y espaciado sin compilar
// la app entera ni tener un iPhone delante.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { es } from "../src/i18n/es";
import BarraInferior from "../src/components/BarraInferior";
import CarruselSecciones from "../src/components/CarruselSecciones";
import HojaCrear from "../src/components/HojaCrear";
import type { Role } from "../src/role";
import "../src/styles.css";

document.documentElement.classList.add("movil");
void i18n.use(initReactI18next).init({
  resources: { es: { translation: es } }, lng: "es", interpolation: { escapeValue: false },
});

const ROL: Role = (new URLSearchParams(location.search).get("rol") as Role) || "administrador";
const RUTA = new URLSearchParams(location.search).get("ruta") || "/ingresos";
const HOJA = new URLSearchParams(location.search).has("hoja");

function Pantalla() {
  const [hoja, setHoja] = useState(HOJA);
  return (
    <div className="app">
      <main className="main">
        <div className="content">
          <div className="header" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div><h1 style={{ margin: 0 }}>Ingresos</h1></div>
          </div>
          <CarruselSecciones role={ROL} memberCount={104} pendingCount={3} unreadCount={2} />
          <div className="summary-4" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {[["Ingresos del mes", "$6,420.00"], ["Diezmos", "$4,180.00"],
              ["Ofrendas", "$1,865.50"], ["Donaciones", "$374.50"]].map(([k, v]) => (
              <div key={k} className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>{k}</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="tx-list">
            {[["Diezmo · Elena Morales", "$250.00"], ["Ofrenda del culto", "$412.50"],
              ["Donación · Samuel Rivera", "$100.00"]].map(([c, m], i) => (
              <div className="tx-day" key={i} style={{ gridTemplateColumns: "62px 1fr" }}>
                <div className="day-label"><span className="day-num">{9 + i}</span>
                  <span className="day-month">ago 2026</span></div>
                <div className="day-rows">
                  <div className="tx-row" data-fila style={{ gridTemplateColumns: "24px 1fr minmax(96px,140px) 24px" }}>
                    <div className="tx-icon income">↑</div>
                    <div className="tx-desc">{c}<span className="who">Efectivo</span></div>
                    <span className="tx-amount positive">{m}</span>
                    <span className="more sin-puntos" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <BarraInferior role={ROL} memberCount={104} pendingCount={3} unreadCount={2}
                     onCrear={() => setHoja(true)} />
      {hoja && <HojaCrear role={ROL} onCerrar={() => setHoja(false)} onElegir={() => setHoja(false)} />}
    </div>
  );
}

createRoot(document.getElementById("app")!).render(
  <MemoryRouter initialEntries={[RUTA]}><Pantalla /></MemoryRouter>
);
