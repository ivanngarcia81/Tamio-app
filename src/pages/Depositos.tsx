import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  countDepositos, currentMonth, currentYear, fmtFechaCorta, fmtMoney, listDepositos,
  mesLegible, monthDepositos,
  type Church, type Deposito,
} from "../db";
import { EmptyState } from "../components/TxList";
import DepositoTable from "../components/DepositoTable";
import DepositoModal from "../components/DepositoModal";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import { IconBank, IconClock, IconPlus } from "../icons";
import CountUp from "../components/CountUp";

const PAGE_SIZE = 40;

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Depositos({ church, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [totalMes, setTotalMes] = useState(0);
  const [conteoMes, setConteoMes] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Deposito | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const mes = currentMonth();

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      listDepositos(church.id),
      monthDepositos(church.id, mes),
      countDepositos(church.id, mes),
    ])
      .then(([nuevosDepositos, nuevoTotal, nuevoConteo]) => {
        if (cancelado) return;
        setDepositos(nuevosDepositos);
        setTotalMes(nuevoTotal);
        setConteoMes(nuevoConteo);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey, mes]);

  useEffect(() => setPage(1), [refreshKey]);

  // La fila tenía una sola tarjeta y tres cuartos vacíos. Estos dos derivados
  // salen de `depositos`, que ya se carga entero: no hacen falta consultas
  // nuevas. El año se mide por PERÍODO, igual que el resto de los totales.
  const anio = currentYear();
  const totalAnio = depositos
    .filter((d) => d.periodo.startsWith(anio))
    .reduce((acc, d) => acc + d.monto, 0);
  const ultimo = depositos.reduce<Deposito | null>(
    (mejor, d) => (mejor === null || d.fecha > mejor.fecha ? d : mejor),
    null,
  );

  function abrirNuevo() {
    setEditing(null);
    setModalOpen(true);
  }

  function abrirEditar(dep: Deposito) {
    setEditing(dep);
    setModalOpen(true);
  }

  function cerrarModal() {
    setModalOpen(false);
    setEditing(null);
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("depositos.titulo")}</div>
          <div className="page-sub">{t("depositos.sub")}</div>
        </div>
        <div className="header-actions">
          <button className="btn primary" onClick={abrirNuevo}>
            <IconPlus size={14} /> {t("depositos.nuevoDeposito")}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="summary-4 enter">
          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-4)" } as CSSProperties}>
            <div className="stat-head">
              <span className="stat-label">{t("depositos.depositosDelMes")}</span>
              <div className="stat-icon neutral"><IconBank size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">
              <CountUp value={totalMes} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
            </div>
            <div className="stat-foot">
              {t("depositos.conteo", { count: conteoMes, mes: mesLegible(mes) })}
            </div>
          </div>

          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-3)" } as CSSProperties}>
            <div className="stat-head">
              <span className="stat-label">{t("depositos.totalAnio")}</span>
              <div className="stat-icon neutral"><IconBank size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">
              <CountUp value={totalAnio} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
            </div>
            <div className="stat-foot">{anio}</div>
          </div>

          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-1)" } as CSSProperties}>
            <div className="stat-head">
              <span className="stat-label">{t("depositos.ultimoDeposito")}</span>
              <div className="stat-icon neutral"><IconClock size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">
              {ultimo
                ? <><CountUp value={ultimo.monto} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></>
                : <span style={{ color: "var(--text-3)" }}>—</span>}
            </div>
            <div className="stat-foot">
              {ultimo
                ? `${fmtFechaCorta(ultimo.fecha)} · ${ultimo.cuenta_banco}`
                : t("depositos.sinDepositos")}
            </div>
          </div>
        </div>

        <div className="tx-head">
          <div className="tx-title">{t("depositos.historial")}</div>
        </div>

        {loading ? (
          <LoadingState />
        ) : depositos.length === 0 ? (
          <EmptyState
            pagina
            titulo={t("depositos.emptyTitulo")}
            sub={t("depositos.emptySub")}
            icon={<IconBank size={22} strokeWidth={1.6} />}
            accion={{ label: t("depositos.nuevoDeposito"), onClick: abrirNuevo }}
          />
        ) : (
          <>
            <DepositoTable
              depositos={depositos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
              onEdit={abrirEditar}
              onChanged={onChanged}
            />
            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(depositos.length / PAGE_SIZE))}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {modalOpen && (
        <DepositoModal
          church={church}
          editing={editing}
          onClose={cerrarModal}
          onSaved={onChanged}
        />
      )}
    </>
  );
}
