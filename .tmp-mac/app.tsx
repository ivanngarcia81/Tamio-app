import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import i18n from "../src/i18n";
import Sidebar from "../src/components/Sidebar";

const church = { id: 1, nombre: "Iglesia Central de Miami", ciudad: "Miami", plan: "completo", moneda: "USD", logo_path: null } as never;
void i18n.changeLanguage("es");
createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/ingresos"]}>
    <div className="app">
      <Sidebar church={church} memberCount={128} pendingCount={3} unreadCount={2} role="administrador"
               authActivo sesionEmail="ivan@tamio.app" sesionNombre="Iván García" />
      <main className="main"><div className="content"><div className="card">contenido</div></div></main>
    </div>
  </MemoryRouter>
);
