import { useTranslation } from "react-i18next";
import { catNombre, fmtMoney, type Church, type MonthTotals } from "../db";
import CountUp from "./CountUp";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { IconClose } from "../icons";
import { restar } from "../dinero";

interface Props {
  church: Church;
  /** Mes legible ("julio 2026"). */
  mesStr: string;
  totales: MonthTotals;
  onClose: () => void;
}

/** Modo Asamblea: pantalla de presentación para proyector/TV — números
 *  gigantes y limpios para mostrar el estado financiero en la reunión,
 *  directamente desde la app. Esc o el botón cierran. */
export default function Asamblea({ church, mesStr, totales, onClose }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const balance = restar(totales.ingresos, totales.gastos);
  const gastosTop = Object.entries(totales.porCategoriaGasto)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const maxGasto = gastosTop[0]?.[1] ?? 1;

  return (
    <div className="asamblea">
      <button className="asamblea-cerrar" onClick={onClose} title={t("reportes.asamblea.salir")}>
        <IconClose size={18} />
      </button>

      <div className="asamblea-head">
        <div className="asamblea-iglesia">{church.nombre}</div>
        <div className="asamblea-titulo">{t("reportes.asamblea.titulo")}</div>
        <div className="asamblea-mes">{mesStr}</div>
      </div>

      <div className="asamblea-stats">
        <div className="asamblea-stat">
          <div className="as-label">{t("tx.ingreso")}s</div>
          <div className="as-valor pos"><CountUp value={totales.ingresos} format={fmtMoney} duracion={900} paso={100} /></div>
        </div>
        <div className="asamblea-stat grande">
          <div className="as-label">{t("reportes.balanceNeto")}</div>
          <div className="as-valor"><CountUp value={balance} format={fmtMoney} duracion={1200} paso={100} /></div>
          <div className="as-moneda">{church.moneda}</div>
        </div>
        <div className="asamblea-stat">
          <div className="as-label">{t("tx.gasto")}s</div>
          <div className="as-valor neg"><CountUp value={totales.gastos} format={fmtMoney} duracion={900} paso={100} /></div>
        </div>
      </div>

      {gastosTop.length > 0 && (
        <div className="asamblea-gastos">
          <div className="asamblea-gastos-titulo">{t("reportes.asamblea.mayoresGastos")}</div>
          {gastosTop.map(([cat, monto]) => (
            <div className="as-barra-fila" key={cat}>
              <span className="as-barra-nombre">{catNombre(cat)}</span>
              <div className="as-barra-pista">
                <div className="as-barra" style={{ width: `${Math.max(6, (monto / maxGasto) * 100)}%` }} />
              </div>
              <span className="as-barra-monto">{fmtMoney(monto)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="asamblea-pie">{t("reportes.asamblea.pie")}</div>
    </div>
  );
}
