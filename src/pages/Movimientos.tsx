import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  catNombre, categoriaInfo, currentMonth, deleteGastoRecurrente, fmtMoney,
  getCategoriasGasto, getCategoriasIngreso, listGastosRecurrentes,
  listTx, mesLegible, metodoNombre, monthTotals, nextMonth, prevMonth,
  type Church, type GastoRecurrente, type MonthTotals, type Tx,
} from "../db";
import { EmptyState } from "../components/TxList";
import ConfirmDialog from "../components/ConfirmDialog";
import { showToast } from "../toast";
import TxTable from "../components/TxTable";
import { IconChevronLeft, IconChevronRight, IconClose, IconGasto, IconIngreso, IconPlus, IconPrinter, IconRepeat, IconSearch, IconWarn } from "../icons";
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
  const { t } = useTranslation();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [totales, setTotales] = useState<MonthTotals | null>(null);
  const [filtroCat, setFiltroCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [recurrentes, setRecurrentes] = useState<GastoRecurrente[]>([]);
  const [pendingDeleteRec, setPendingDeleteRec] = useState<GastoRecurrente | null>(null);
  const [mes, setMes] = useState(currentMonth());
  const esMesActual = mes >= currentMonth();

  useEffect(() => {
    listTx(church.id, { tipo, mes, limit: 500 }).then(setTxs).catch(console.error);
    monthTotals(church.id, mes).then(setTotales).catch(console.error);
    if (tipo === "gasto") {
      listGastosRecurrentes(church.id).then(setRecurrentes).catch(console.error);
    }
  }, [church.id, tipo, refreshKey, mes]);

  async function confirmDeleteRecurrente() {
    if (!pendingDeleteRec) return;
    await deleteGastoRecurrente(pendingDeleteRec.id, church.id);
    setPendingDeleteRec(null);
    showToast(t("recurrente.toastEliminado"));
    listGastosRecurrentes(church.id).then(setRecurrentes).catch(console.error);
  }

  const esIngreso = tipo === "ingreso";
  const titulo = esIngreso ? t("nav.ingresos") : t("nav.gastos");
  const categorias = esIngreso ? getCategoriasIngreso() : getCategoriasGasto();
  const porCategoria = esIngreso
    ? totales?.porCategoriaIngreso ?? {}
    : totales?.porCategoriaGasto ?? {};
  const totalMes = esIngreso ? totales?.ingresos ?? 0 : totales?.gastos ?? 0;

  const q = query.trim().toLowerCase();
  const coincide = (tx: Tx) =>
    !q ||
    tx.concepto.toLowerCase().includes(q) ||
    (tx.detalle ?? "").toLowerCase().includes(q) ||
    (tx.beneficiario ?? "").toLowerCase().includes(q) ||
    (tx.member_nombre ?? "").toLowerCase().includes(q);
  const buscados = txs.filter(coincide);
  const visibles = filtroCat ? buscados.filter((t) => t.categoria === filtroCat) : buscados;
  const conteo = (id: string) => buscados.filter((t) => t.categoria === id).length;

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
      const catLabel = filtroCat ? catNombre(filtroCat) : t("mov.todasCategorias");
      await printRegister({
        church,
        titulo,
        filtroDescripcion: `${mesLegible(mes)} · ${catLabel}`,
        periodoISO: mes,
        movimientos: visibles,
      });
    } catch (e) {
      setPrintError(t("common.noSePudoImprimir", { error: String(e) }));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{titulo}</div>
          <div className="page-sub">{t("mov.registrados", { count: txs.length })}</div>
        </div>
        <div className="header-actions">
          <div className="month-nav">
            <span className="icon-btn" title={t("mov.mesAnterior")} onClick={() => setMes(prevMonth(mes))}>
              <IconChevronLeft size={16} />
            </span>
            <span className="month-nav-label">{mesLegible(mes)}</span>
            <span
              className={`icon-btn${esMesActual ? " disabled" : ""}`}
              title={t("mov.mesSiguiente")}
              onClick={() => !esMesActual && setMes(nextMonth(mes))}
            >
              <IconChevronRight size={16} />
            </span>
          </div>
          <button className="btn secondary" onClick={handlePrint} disabled={printing}>
            <IconPrinter size={14} /> {printing ? t("common.preparando") : t("common.imprimir")}
          </button>
          <button className="btn primary" onClick={onNew}>
            <IconPlus size={14} /> {esIngreso ? t("mov.nuevoIngreso") : t("mov.nuevoGasto")}
          </button>
        </div>
      </div>

      {(printError || printEmpty) && (
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconWarn size={13} /> {printError ?? t("mov.noHayRegistros")}
          </div>
        </div>
      )}

      <div className="content">
        <div className="summary-4">
          <div className="stat-card">
            <div className="stat-head">
              <span className="stat-label">{t("mov.totalDelMes")}</span>
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
                  <span className="stat-label">{catNombre(c.id)}</span>
                  <span className={`tag ${c.tagClass}`} title={catNombre(c.id)}>{catNombre(c.id)}</span>
                </div>
                <div className="stat-value md">
                  {fmtMoney(v)}<span className="stat-cur">{church.moneda}</span>
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill" style={{ width: `${pct}%`, background: "var(--accent-1)" }} />
                </div>
                <div className="stat-pct">{t("mov.pctDelTotal", { pct })}</div>
              </div>
            );
          })}
        </div>

        {!esIngreso && recurrentes.length > 0 && (
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <span className="card-title" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <IconRepeat size={14} strokeWidth={2} /> {t("recurrente.titulo")}
              </span>
              <span className="card-meta">{t("recurrente.sub")}</span>
            </div>
            {recurrentes.map((r) => {
              const cat = categoriaInfo("gasto", r.categoria);
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "9px 0", borderTop: "1px solid var(--line)",
                  }}
                >
                  <span className={`tag ${cat.tagClass}`} title={cat.nombre}>{cat.nombre}</span>
                  <span className="truncate" style={{ flex: 1, fontWeight: 600, fontSize: 13 }} title={r.concepto}>
                    {r.concepto}
                    {r.beneficiario && (
                      <span style={{ fontWeight: 400, color: "var(--text-3)", marginLeft: 8, fontSize: 12 }}>{r.beneficiario}</span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>{t("recurrente.diaDeCadaMes", { dia: r.dia })}</span>
                  <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{metodoNombre(r.metodo_pago)}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                    {t("recurrente.porMes", { monto: fmtMoney(r.monto) })}
                  </span>
                  <span
                    className="row-icon-btn"
                    title={t("recurrente.eliminarTitulo")}
                    onClick={() => setPendingDeleteRec(r)}
                  >
                    <IconClose size={12} strokeWidth={2.2} />
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="tx-head" style={{ marginBottom: 10 }}>
          <div className="search-input-wrap" style={{ flex: 1, maxWidth: 420 }}>
            <IconSearch size={15} strokeWidth={2} />
            <input
              className="form-input"
              placeholder={t("mov.buscarPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="tx-head">
          <div className="tx-title">{esIngreso ? t("mov.todosIngresos") : t("mov.todosGastos")}</div>
          <div className="tx-filters">
            <div
              className={`chip${filtroCat === null ? " active" : ""}`}
              onClick={() => setFiltroCat(null)}
            >
              {t("common.todos")} <span className="count">{buscados.length}</span>
            </div>
            {categorias.map((c) => (
              <div
                key={c.id}
                className={`chip${filtroCat === c.id ? " active" : ""}`}
                onClick={() => setFiltroCat(filtroCat === c.id ? null : c.id)}
              >
                {catNombre(c.id)} <span className="count">{conteo(c.id)}</span>
              </div>
            ))}
          </div>
        </div>

        {visibles.length === 0 ? (
          <EmptyState
            titulo={
              q && buscados.length === 0
                ? t("mov.sinResultadosBusqueda")
                : txs.length > 0
                ? t("mov.sinResultadosFiltro")
                : esMesActual
                  ? (esIngreso ? t("mov.aunNoHayIngresos") : t("mov.aunNoHayGastos"))
                  : t(esIngreso ? "mov.sinIngresosEn" : "mov.sinGastosEn", { mes: mesLegible(mes) })
            }
            sub={
              q && buscados.length === 0
                ? t("mov.pruebaOtroTermino")
                : txs.length > 0
                ? t("mov.pruebaOtraCategoria")
                : esMesActual
                  ? (esIngreso ? t("mov.registraPrimerIngreso") : t("mov.registraPrimerGasto"))
                  : t("mov.pruebaOtroMes")
            }
            icon={esIngreso ? <IconIngreso size={22} strokeWidth={1.6} /> : <IconGasto size={22} strokeWidth={1.6} />}
          />
        ) : (
          <TxTable tipo={tipo} txs={visibles} onEdit={onEditTx} onChanged={onChanged} />
        )}
      </div>

      {pendingDeleteRec && (
        <ConfirmDialog
          title={t("recurrente.eliminarTitulo")}
          message={t("recurrente.eliminarMensaje", { concepto: pendingDeleteRec.concepto })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmDeleteRecurrente}
          onCancel={() => setPendingDeleteRec(null)}
        />
      )}
    </>
  );
}
