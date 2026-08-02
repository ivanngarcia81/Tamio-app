import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  agregarNotaSeguimiento, marcarMiembroRevisado,
  type Church, type Member, type NotaSeguimiento,
} from "../db";
import { Seccion } from "./FichaMiembroModal";
import { IconClose } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";

function parseNotas(json: string): NotaSeguimiento[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function fmtFechaHora(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

interface Props {
  church: Church;
  member: Member;
  /** Etiquetas de alertas activas del miembro (ya traducidas). */
  alertas: string[];
  onClose: () => void;
  onSaved: () => void;
  onVerPerfil: () => void;
}

/** Seguimiento administrativo de un miembro: marcar revisado y anotar notas.
 *  NUNCA cambia el estado del miembro (las alertas son solo informativas). */
export default function SeguimientoModal({ church, member, alertas, onClose, onSaved, onVerPerfil }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const [revisadoEn, setRevisadoEn] = useState<string | null>(member.seguimiento_revisado_en);
  const [notas, setNotas] = useState<NotaSeguimiento[]>(() => parseNotas(member.seguimiento_notas));
  const [nuevaNota, setNuevaNota] = useState("");
  const [saving, setSaving] = useState(false);

  async function marcarRevisado() {
    setSaving(true);
    try {
      await marcarMiembroRevisado(member.id, church.id);
      const ahora = new Date().toISOString();
      setRevisadoEn(ahora.replace("T", " ").slice(0, 16));
      playSound("guardado");
      showToast(t("seguimiento.toastRevisado"));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function guardarNota() {
    const texto = nuevaNota.trim();
    if (!texto) return;
    setSaving(true);
    try {
      await agregarNotaSeguimiento(member.id, church.id, texto);
      setNotas((ns) => [...ns, { fecha: new Date().toISOString().replace("T", " ").slice(0, 16), texto }]);
      setNuevaNota("");
      playSound("guardado");
      showToast(t("seguimiento.toastNota"));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function abrir(prefijo: string, valor: string) {
    openPath(`${prefijo}${valor}`).catch(() => {
      // Si el SO no maneja el esquema, el dato queda visible de todos modos.
    });
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">{member.nombre}</div>
            <div className="modal-sub">{t("seguimiento.sub")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          {alertas.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {alertas.map((a) => <span key={a} className="tag pastores">{a}</span>)}
            </div>
          )}

          <Seccion titulo={t("seguimiento.secContacto")}>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13.5 }}>
              <div>
                <div className="form-label">{t("tesorero.correo")}</div>
                {member.email
                  ? <button type="button" className="btn secondary" onClick={() => abrir("mailto:", member.email!)}>{member.email}</button>
                  : <span style={{ color: "var(--text-3)" }}>—</span>}
              </div>
              <div>
                <div className="form-label">{t("tesorero.telefono")}</div>
                {member.telefono
                  ? <button type="button" className="btn secondary" onClick={() => abrir("tel:", member.telefono!)}>{member.telefono}</button>
                  : <span style={{ color: "var(--text-3)" }}>—</span>}
              </div>
              <button type="button" className="btn secondary" style={{ alignSelf: "flex-end" }} onClick={onVerPerfil}>
                {t("informes.verPerfil")}
              </button>
            </div>
          </Seccion>

          <Seccion titulo={t("seguimiento.secRevision")}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                {revisadoEn ? t("seguimiento.revisadoEl", { fecha: fmtFechaHora(revisadoEn) }) : t("seguimiento.sinRevisar")}
              </span>
              <button type="button" className="btn primary" onClick={marcarRevisado} disabled={saving}>
                {t("seguimiento.marcarRevisado")}
              </button>
            </div>
          </Seccion>

          <Seccion titulo={t("seguimiento.secNotas")}>
            {notas.length === 0 ? (
              <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 10 }}>{t("seguimiento.sinNotas")}</div>
            ) : (
              <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", maxHeight: 180, overflowY: "auto", marginBottom: 10 }}>
                {[...notas].reverse().map((n, i) => (
                  <div key={i} style={{ padding: "8px 12px", borderBottom: i < notas.length - 1 ? "1px solid var(--line-soft)" : "none" }}>
                    <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 2 }}>{fmtFechaHora(n.fecha)}</div>
                    <div style={{ fontSize: 13 }}>{n.texto}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <textarea
                className="form-textarea"
                rows={2}
                style={{ flex: 1 }}
                placeholder={t("seguimiento.notaPlaceholder")}
                value={nuevaNota}
                onChange={(e) => setNuevaNota(e.target.value)}
              />
              <button type="button" className="btn secondary" onClick={guardarNota} disabled={saving || !nuevaNota.trim()}>
                {t("seguimiento.agregarNota")}
              </button>
            </div>
          </Seccion>
        </div>

        <div className="modal-footer">
          <span />
          <button className="btn secondary" onClick={onClose}>{t("common.cerrar")}</button>
        </div>
      </div>
    </div>
  );
}
