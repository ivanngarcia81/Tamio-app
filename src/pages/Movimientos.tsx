import { useEffect, useState } from "react";
import {
  CATEGORIAS_GASTO, CATEGORIAS_INGRESO, currentMonth, fmtMoney,
  listTx, mesLegible, monthTotals,
  type Church, type MonthTotals, type Tx,
} from "../db";
import { EmptyState } from "../components/TxList";
import TxTable from "../components/TxTable";
import { IconGasto, IconIngreso, IconPlus, IconPrinter, IconWarn } from "../icons";
import { printRegister } from "../services/print/printRegister";

interface Props {
  church: Church;
  tipo: "ingreso" | "gasto";
  refreshKey: number;
  onNew: () => void;
  onEditTx: (tx: Tx) => void;
  onChanged: () => void;
}

export default function Movimientos({ church, tipo, refreshKey, onNew, onEditTx, onChanged }: Props) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [totales, setTotales] = useState<MonthTotals | null>(null);
  const [filtroCat, setFiltroCat] = useState<string | null>(null);
  const mes = currentMonth();

  useEffect(() => {
    listTx(church.id, { tipo, limit: 300 }).then(setTxs).catch(console.error);
    monthTotals(church.id, mes).then(setTotales).catch(console.error);
  }, [church.id, tipo, refreshKey, mes]);

  const esIngreso = tipo === "ingreso";
  const titulo = esIngreso ? "Ingresos" : "Gastos";
  const categorias = esIngreso ? CATEGORIAS_INGRESO : CATEGORIAS_GASTO;
  const porCategoria = esIngreso
    ? totales?.porCategoriaIngreso ?? {}
    : totales?.porCategoriaGasto ?? {};
  const totalMes = esIngreso ? totales?.ingresos ?? 0 : totales?.gastos ?? 0;

  const visibles = filtroCat ? txs.filter((t) => t.categoria === filtroCat) : txs;
  const conteo = (id: string) => txs.filter((t) => t.categoria === id).length;

  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printEmpty, setPrintEmpty] = useState(false);

  async function handlePrint() {
    setPrintError(null);
    if (visibles.length === 0) {
      setPrintEmpty(true);
      return;
    }
    setPrintEmpty(false);
    setPrinting(true);
    try {
      const catLabel = filtroCat ? categorias.find((c) => c.id === filtroCat)?.nombre ?? filtroCat : "Todas las categorías";
      await printRegister({
        church,
        titulo,
        filtroDescripcion: `${mesLegible(mes)} · ${catLabel}`,
        periodoISO: mes,
        movimientos: visibles,
      });
    } catch (e) {
      setPrintError(`No se pudo imprimir: ${e}`);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{titulo}</div>
          <div className="page-sub">
            {mesLegible(mes)} · {txs.length} movimiento{txs.length === 1 ? "" : "s"} registrado{txs.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="header-actions">
          <button className="btn secondary" onClick={handlePrint} disabled={printing}>
            <IconPrinter size={14} /> {printing ? "Preparando…" : "Imprimir"}
          </button>
          <button className="btn primary" onClick={onNew}>
            <IconPlus size={14} /> {esIngreso ? "Nuevo ingreso" : "Nuevo gasto"}
          </button>
        </div>
      </div>

      {(printError || printEmpty) && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconWarn size={13} /> {printError ?? "No hay registros para imprimir."}
          </div>
        </div>
      )}

      <div className="content">
        <div className="summary-4">
          <div className="stat-card">
            <div className="stat-head">
              <span className="stat-label">Total del mes</span>
            </div>
            <div className="stat-value md">
              {fmtMoney(totalMes)}<span className="stat-cur">{church.moneda}</span>
            </div>
          </div>
          {categorias.slice(0, 3).map((c) => {
            const v = porCategoria[c.id] ?? 0;
            const pct = totalMes > 0 ? Math.round((v / totalMes) * 1000) / 10 : 0;
            return (
              <div className="stat-card" key={c.id}>
                <div className="stat-head">
                  <span className="stat-label">{c.nombre}</span>
                  <span className={`tag ${c.tagClass}`} title={c.nombre}>{c.nombre}</span>
                </div>
                <div className="stat-value md">
                  {fmtMoney(v)}<span className="stat-cur">{church.moneda}</span>
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill" style={{ width: `${pct}%`, background: "var(--accent-1)" }} />
                </div>
                <div className="stat-pct">{pct}% del total</div>
              </div>
            );
          })}
        </div>

        <div className="tx-head">
          <div className="tx-title">Todos los {titulo.toLowerCase()}</div>
          <div className="tx-filters">
            <div
              className={`chip${filtroCat === null ? " active" : ""}`}
              onClick={() => setFiltroCat(null)}
            >
              Todos <span className="count">{txs.length}</span>
            </div>
            {categorias.map((c) => (
              <div
                key={c.id}
                className={`chip${filtroCat === c.id ? " active" : ""}`}
                onClick={() => setFiltroCat(filtroCat === c.id ? null : c.id)}
              >
                {c.nombre} <span className="count">{conteo(c.id)}</span>
              </div>
            ))}
          </div>
        </div>

        {visibles.length === 0 ? (
          <EmptyState
            titulo={txs.length === 0 ? `Aún no hay ${titulo.toLowerCase()}` : "Sin resultados con este filtro"}
            sub={
              txs.length === 0
                ? `Registra tu primer ${esIngreso ? "ingreso" : "gasto"} con el botón de arriba.`
                : "Prueba con otra categoría o quita el filtro."
            }
            icon={esIngreso ? <IconIngreso size={22} strokeWidth={1.6} /> : <IconGasto size={22} strokeWidth={1.6} />}
          />
        ) : (
          <TxTable tipo={tipo} txs={visibles} onEdit={onEditTx} onChanged={onChanged} />
        )}
      </div>
    </>
  );
}
