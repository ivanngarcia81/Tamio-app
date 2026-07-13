import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  countDepositos, currentMonth, fmtMoney, listDepositos, mesLegible, monthDepositos,
  type Church, type Deposito,
} from "../db";
import { EmptyState } from "../components/TxList";
import DepositoTable from "../components/DepositoTable";
import DepositoModal from "../components/DepositoModal";
import { IconBank, IconPlus } from "../icons";

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
  const mes = currentMonth();

  useEffect(() => {
    listDepositos(church.id).then(setDepositos).catch(console.error);
    monthDepositos(church.id, mes).then(setTotalMes).catch(console.error);
    countDepositos(church.id, mes).then(setConteoMes).catch(console.error);
  }, [church.id, refreshKey, mes]);

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
        <div className="enter" style={{ maxWidth: 320 }}>
          <div className="stat-card accent" style={{ "--accent-color": "var(--accent-4)" } as CSSProperties}>
            <div className="stat-head">
              <span className="stat-label">{t("depositos.depositosDelMes")}</span>
              <div className="stat-icon neutral"><IconBank size={15} strokeWidth={1.8} /></div>
            </div>
            <div className="stat-value md">
              {fmtMoney(totalMes)}<span className="stat-cur">{church.moneda}</span>
            </div>
            <div className="stat-foot">
              {t("depositos.conteo", { count: conteoMes, mes: mesLegible(mes) })}
            </div>
          </div>
        </div>

        <div className="tx-head">
          <div className="tx-title">{t("depositos.historial")}</div>
        </div>

        {depositos.length === 0 ? (
          <EmptyState
            titulo={t("depositos.emptyTitulo")}
            sub={t("depositos.emptySub")}
            icon={<IconBank size={22} strokeWidth={1.6} />}
          />
        ) : (
          <DepositoTable depositos={depositos} onEdit={abrirEditar} onChanged={onChanged} />
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
