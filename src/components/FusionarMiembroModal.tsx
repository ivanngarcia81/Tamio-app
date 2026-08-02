import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fusionarMiembros, resumenFusion, type FusionResumen, type Member } from "../db";
import { IconClose, IconSearch, IconWarn } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";

interface Props {
  churchId: number;
  /** Miembro duplicado que va a desaparecer (su historial pasa al destino). */
  origen: Member;
  /** Padrón completo para elegir el destino. */
  members: Member[];
  onClose: () => void;
  onMerged: () => void;
}

/**
 * Fusiona un miembro duplicado dentro de otro: aportes, asistencia y
 * documentos pasan al destino y el duplicado se da de baja definitiva.
 * Resuelve el certificado anual partido de quien aportó bajo dos fichas
 * (p. ej. primero como visitante y luego como miembro).
 */
export default function FusionarMiembroModal({ churchId, origen, members, onClose, onMerged }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const [query, setQuery] = useState("");
  const [destinoId, setDestinoId] = useState<number | null>(null);
  const [resumen, setResumen] = useState<FusionResumen | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resumenFusion(churchId, origen.id).then(setResumen).catch(() => {});
  }, [churchId, origen.id]);

  const q = query.trim().toLowerCase();
  const candidatos = useMemo(
    () => members
      .filter((m) => m.id !== origen.id)
      .filter((m) => !q || m.nombre.toLowerCase().includes(q))
      .slice(0, 8),
    [members, origen.id, q]
  );
  const destino = members.find((m) => m.id === destinoId) ?? null;

  async function fusionar() {
    if (!destino) return;
    if (!confirmando) { setConfirmando(true); return; }
    setSaving(true);
    setError(null);
    try {
      await fusionarMiembros(churchId, origen.id, destino.id);
      playSound("guardado");
      showToast(t("fusion.toastHecha", { origen: origen.nombre, destino: destino.nombre }));
      onMerged();
      onClose();
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
      setSaving(false);
      setConfirmando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 500 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{t("fusion.titulo", { nombre: origen.nombre })}</div>
            <div className="modal-sub">{t("fusion.sub")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          {resumen && (
            <div className="form-subcard" style={{ marginBottom: 12, fontSize: 13 }}>
              {t("fusion.resumen", {
                movimientos: resumen.movimientos,
                asistencias: resumen.asistencias,
                documentos: resumen.documentos,
              })}
            </div>
          )}

          <div className="form-group full">
            <label className="form-label">{t("fusion.destinoLabel")}</label>
            <div className="search-input-wrap">
              <IconSearch size={15} strokeWidth={2} />
              <input
                className="form-input"
                placeholder={t("fusion.buscarPlaceholder")}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setConfirmando(false); }}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {candidatos.map((m) => (
              <div
                key={m.id}
                className={`roster-row${destinoId === m.id ? " is-selected" : ""}`}
                style={{ cursor: "pointer", borderRadius: 8, padding: "7px 10px", background: destinoId === m.id ? "var(--surface-2)" : undefined }}
                onClick={() => { setDestinoId(m.id); setConfirmando(false); }}
              >
                <span className="roster-name">{m.nombre}</span>
                <span className={`tag ${m.activo === 1 ? "activo" : "baja"}`} style={{ flex: "none" }}>
                  {m.activo === 1 ? t("membresia.filtro.activos") : t("membresia.filtro.bajas")}
                </span>
              </div>
            ))}
            {candidatos.length === 0 && (
              <div className="form-hint">{t("miembros.sinResultados")}</div>
            )}
          </div>

          {destino && (
            <div className="form-warning" style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ marginTop: 2, flexShrink: 0, display: "inline-flex" }}><IconWarn size={13} /></span>
              <span>
                {confirmando
                  ? t("fusion.confirmar2", { origen: origen.nombre, destino: destino.nombre })
                  : t("fusion.aviso", { origen: origen.nombre, destino: destino.nombre })}
              </span>
            </div>
          )}

          {error && (
            <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconWarn size={13} /> {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="form-hint">{t("fusion.irreversible")}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose} disabled={saving}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={() => void fusionar()} disabled={saving || !destino}>
              {saving ? t("common.guardando") : confirmando ? t("fusion.botonConfirmar") : t("fusion.boton")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
