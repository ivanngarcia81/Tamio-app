import { useTranslation } from "react-i18next";
import { fmtFechaCorta, type Actividad } from "../db";
import { IconCheck, IconClock, IconClose, IconEdit } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";

interface Props {
  actividad: Actividad;
  /** Nombre del responsable ya resuelto (miembro o persona externa). */
  responsableNombre: string | null;
  /** true si la actividad proviene de una serie recurrente. */
  esRecurrente?: boolean;
  onClose: () => void;
  onEditar: () => void;
  onDuplicar: () => void;
  onEliminar: () => void;
  onEstado: (nuevoEstado: string) => void;
  /** Abre la Bitácora de servicios con fecha y tipo prellenados. */
  onRegistrarServicio?: () => void;
}

function Kv({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="detalle-kv">
      <span className="detalle-k">{label}</span>
      <span className="detalle-v">{value}</span>
    </div>
  );
}

export default function ActividadDetalle({
  actividad: a, responsableNombre, esRecurrente, onClose, onEditar, onDuplicar, onEliminar, onEstado, onRegistrarServicio,
}: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);

  const tipoLabel = a.tipo === "otra" && a.tipo_personalizado ? a.tipo_personalizado : t(`agenda.tipos.${a.tipo}`);
  const horario = a.dia_completo
    ? t("agenda.diaCompletoCorto")
    : a.hora_inicio
      ? `${a.hora_inicio}${a.hora_fin ? ` – ${a.hora_fin}` : ""}`
      : null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 520 }}>
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <div className="modal-title truncate">{a.nombre}</div>
            <div className="modal-sub">
              {tipoLabel}
              {esRecurrente && <span className="tag servicios" style={{ marginLeft: 8 }}>{t("agenda.recurrenteBadge")}</span>}
              {a.es_fecha_importante && <span className="tag eventos" style={{ marginLeft: 8 }}>{t("agenda.fechaImportanteBadge")}</span>}
            </div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: 14 }}>
            <span className={`tag estado-tag estado-${a.estado}`}>{t(`agenda.estados.${a.estado}`)}</span>
          </div>

          <Kv label={t("agenda.colFecha")} value={fmtFechaCorta(a.fecha)} />
          <Kv label={t("agenda.horario")} value={horario} />
          <Kv label={t("agenda.lugar")} value={a.lugar} />
          <Kv label={t("agenda.responsable")} value={responsableNombre} />
          <Kv label={t("agenda.ministerio")} value={a.responsable_ministerio} />
          <Kv label={t("agenda.invitado")} value={a.invitado} />
          <Kv label={t("agenda.contacto")} value={a.contacto} />
          {a.descripcion && (
            <div className="detalle-kv col">
              <span className="detalle-k">{t("agenda.descripcion")}</span>
              <span className="detalle-v" style={{ whiteSpace: "pre-wrap" }}>{a.descripcion}</span>
            </div>
          )}

          <div className="detalle-acciones">
            {a.estado !== "confirmada" && a.estado !== "cancelada" && (
              <button className="btn secondary sm" onClick={() => onEstado("confirmada")}>
                <IconCheck size={13} /> {t("agenda.accConfirmar")}
              </button>
            )}
            {a.estado !== "completada" && (
              <button className="btn secondary sm" onClick={() => onEstado("completada")}>
                <IconCheck size={13} /> {t("agenda.accCompletar")}
              </button>
            )}
            {a.estado !== "cancelada" && (
              <button className="btn secondary sm" onClick={() => onEstado("cancelada")}>
                <IconClock size={13} /> {t("agenda.accCancelar")}
              </button>
            )}
            <button className="btn secondary sm" onClick={onDuplicar}>{t("agenda.accDuplicar")}</button>
            {onRegistrarServicio && (
              <button className="btn secondary sm" onClick={onRegistrarServicio}>
                <IconEdit size={13} /> {t("agenda.accRegistrarServicio")}
              </button>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn ghost danger" onClick={onEliminar}>{t("common.eliminar")}</button>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cerrar")}</button>
            <button className="btn primary" onClick={onEditar}><IconEdit size={13} /> {t("common.editar")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
