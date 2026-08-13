// Banco de pruebas del gesto de deslizar. NO forma parte de la app: usa el
// hook real (src/components/useFilaDeslizable.ts) sobre filas de mentira,
// para poder mandarle gestos táctiles con Playwright.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ANCHO_ACCIONES, useFilaDeslizable } from "../src/components/useFilaDeslizable";

document.documentElement.classList.add("movil"); // esMovil() = true

function Fila({ n, conBorrado, onBorrar }: { n: number; conBorrado: boolean; onBorrar: (n: number) => void }) {
  const d = useFilaDeslizable(true, conBorrado, () => onBorrar(n));
  return (
    <div className="tr" data-fila data-n={n} ref={d.ref}>
      <span>Fila {n}</span>
      <span className="more" data-x={Math.round(d.x)} data-borra={String(d.vaABorrar)}>···</span>
      {d.x > 0 && (
        <div data-panel={n} style={{ position: "fixed", width: Math.max(ANCHO_ACCIONES, d.x) }} />
      )}
    </div>
  );
}

function App() {
  const [filas, setFilas] = useState([1, 2, 3, 4]);
  const [borradas, setBorradas] = useState<number[]>([]);
  return (
    <>
      <div className="lista">
        {filas.map((n) => (
          <Fila key={n} n={n} conBorrado={n !== 3}
                onBorrar={(x) => { setBorradas((b) => [...b, x]); setFilas((f) => f.filter((y) => y !== x)); }} />
        ))}
      </div>
      <div id="borradas">{borradas.join(",")}</div>
    </>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
