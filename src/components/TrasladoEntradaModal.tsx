import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  buscarPosiblesDuplicados, insertMemberDesdeTraslado, insertTrasladoEntrada, updateTrasladoEntrada,
  type Church, type Member, type NewTrasladoEntrada, type TrasladoEntrada,
} from "../db";
import { guardarAdjunto, eliminarAdjunto } from "../services/cartas/adjuntos";
import { Seccion } from "./FichaMiembroModal";
import ConfirmDialog from "./ConfirmDialog";
import { IconClose } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";

export const ESTADOS_TE = [
  "recibida", "revision", "incompleta", "entrevista", "aprobacion",
  "aceptado", "noAceptado", "completado", "archivado",
] as const;

function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Props {
  church: Church;
  traslado: TrasladoEntrada | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function TrasladoEntradaModal({ church, traslado, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicados, setDuplicados] = useState<Member[] | null>(null);
  const [confirmQuitarAdjunto, setConfirmQuitarAdjunto] = useState(false);

  const [nombre, setNombre] = useState(traslado?.nombre ?? "");
  const [fechaNacimiento, setFechaNacimiento] = useState(traslado?.fecha_nacimiento ?? "");
  const [telefono, setTelefono] = useState(traslado?.telefono ?? "");
  const [correo, setCorreo] = useState(traslado?.correo ?? "");
  const [direccion, setDireccion] = useState(traslado?.direccion ?? "");
  const [iglesiaProcedencia, setIglesiaProcedencia] = useState(traslado?.iglesia_procedencia ?? "");
  const [pastorAnterior, setPastorAnterior] = useState(traslado?.pastor_anterior ?? "");
  const [direccionAnterior, setDireccionAnterior] = useState(traslado?.direccion_anterior ?? "");
  const [fechaEmisionCarta, setFechaEmisionCarta] = useState(traslado?.fecha_emision_carta ?? "");
  const [fechaRecepcion, setFechaRecepcion] = useState(traslado?.fecha_recepcion ?? hoyLocal());
  const [referenciaCarta, setReferenciaCarta] = useState(traslado?.referencia_carta ?? "");
  const [adjunto, setAdjunto] = useState<{ path: string; nombre: string; fecha: string } | null>(
    traslado?.adjunto_path
      ? { path: traslado.adjunto_path, nombre: traslado.adjunto_nombre ?? "adjunto", fecha: traslado.adjunto_fecha ?? "" }
      : null
  );
  const [fechaCongregacion, setFechaCongregacion] = useState(traslado?.fecha_congregacion ?? "");
  const [fechaEntrevista, setFechaEntrevista] = useState(traslado?.fecha_entrevista ?? "");
  const [entrevistador, setEntrevistador] = useState(traslado?.entrevistador ?? "");
  const [decision, setDecision] = useState(traslado?.decision ?? "");
  const [fechaAprobacion, setFechaAprobacion] = useState(traslado?.fecha_aprobacion ?? "");
  const [observaciones, setObservaciones] = useState(traslado?.observaciones ?? "");
  const [estado, setEstado] = useState(traslado?.estado ?? "recibida");
  // El member_id solo cambia mediante "Crear miembro" o "Vincular"; en esos
  // flujos se guarda directo con guardar(estado, miembroVinculado).
  const [memberId] = useState<number | null>(traslado?.member_id ?? null);

  function payloadActual(): NewTrasladoEntrada | null {
    setError(null);
    if (!nombre.trim()) { setError(t("traslados.nombreObligatorio")); return null; }
    if (fechaEmisionCarta && fechaRecepcion && fechaRecepcion < fechaEmisionCarta) {
      setError(t("traslados.recepcionAntes")); return null;
    }
    return {
      nombre: nombre.trim(),
      fecha_nacimiento: fechaNacimiento || null,
      telefono: telefono.trim() || null,
      correo: correo.trim() || null,
      direccion: direccion.trim() || null,
      iglesia_procedencia: iglesiaProcedencia.trim() || null,
      pastor_anterior: pastorAnterior.trim() || null,
      direccion_anterior: direccionAnterior.trim() || null,
      fecha_emision_carta: fechaEmisionCarta || null,
      fecha_recepcion: fechaRecepcion || null,
      referencia_carta: referenciaCarta.trim() || null,
      adjunto_path: adjunto?.path ?? null,
      adjunto_nombre: adjunto?.nombre ?? null,
      adjunto_fecha: adjunto?.fecha ?? null,
      fecha_congregacion: fechaCongregacion || null,
      fecha_entrevista: fechaEntrevista || null,
      entrevistador: entrevistador.trim() || null,
      decision: decision.trim() || null,
      fecha_aprobacion: fechaAprobacion || null,
      observaciones: observaciones.trim() || null,
      estado,
      member_id: memberId,
    };
  }

  async function guardar(estadoForzado?: string, miembroVinculado?: number | null): Promise<boolean> {
    const payload = payloadActual();
    if (!payload) return false;
    if (estadoForzado) payload.estado = estadoForzado;
    if (miembroVinculado !== undefined) payload.member_id = miembroVinculado;
    setSaving(true);
    try {
      if (traslado) {
        await updateTrasladoEntrada(traslado.id, church.id, payload, traslado.estado);
      } else {
        await insertTrasladoEntrada(church.id, payload);
      }
      playSound("guardado");
      showToast(t("traslados.toastGuardado"));
      onSaved();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function elegirAdjunto() {
    try {
      const path = await openFileDialog({
        multiple: false,
        title: t("traslados.adjuntoElegir"),
        filters: [{ name: "PDF / imagen", extensions: ["pdf", "jpg", "jpeg", "png"] }],
      });
      if (typeof path !== "string") return;
      const nuevo = await guardarAdjunto(path, traslado?.folio ?? "te-nuevo");
      if (adjunto) await eliminarAdjunto(adjunto.path);
      setAdjunto(nuevo);
    } catch (e) {
      setError(t("common.noSePudoAbrirSelector", { error: String(e) }));
    }
  }

  async function quitarAdjunto() {
    if (adjunto) await eliminarAdjunto(adjunto.path);
    setAdjunto(null);
    setConfirmQuitarAdjunto(false);
  }

  /** "Crear miembro con esta información": verifica duplicados primero. */
  async function crearMiembro() {
    const payload = payloadActual();
    if (!payload) return;
    const coincidencias = await buscarPosiblesDuplicados(church.id, {
      nombre: payload.nombre,
      telefono: payload.telefono,
      correo: payload.correo,
    });
    if (coincidencias.length > 0) {
      setDuplicados(coincidencias);
      return;
    }
    await crearMiembroConfirmado();
  }

  async function crearMiembroConfirmado() {
    setDuplicados(null);
    const payload = payloadActual();
    if (!payload) return;
    const id = await insertMemberDesdeTraslado(church.id, payload);
    if (id) {
      await guardar("completado", id);
      showToast(t("traslados.toastMiembroCreado", { nombre: payload.nombre }));
      onClose();
    }
  }

  async function vincularExistente(m: Member) {
    setDuplicados(null);
    const ok = await guardar("completado", m.id);
    if (ok) {
      showToast(t("traslados.toastVinculadoExistente", { nombre: m.nombre }));
      onClose();
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 720 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {traslado ? `${traslado.folio} — ${t("common.editar")}` : t("traslados.nuevoEntrada")}
            </div>
            <div className="modal-sub">{t("traslados.subEntrada")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("traslados.secPersona")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("servicios.visitanteNombre")}</label>
                <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.fechaNacimiento")} <span className="opt">{t("common.opcional")}</span></label>
                <input type="date" className="form-input" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("tesorero.telefono")}</label>
                <input className="form-input" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("tesorero.correo")}</label>
                <input className="form-input" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">{t("institucion.direccion")}</label>
                <input className="form-input" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("traslados.secProcedencia")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("traslados.iglesiaProcedencia")}</label>
                <input className="form-input" value={iglesiaProcedencia} onChange={(e) => setIglesiaProcedencia(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.pastorAnterior")}</label>
                <input className="form-input" value={pastorAnterior} onChange={(e) => setPastorAnterior(e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">{t("traslados.direccionAnterior")}</label>
                <input className="form-input" value={direccionAnterior} onChange={(e) => setDireccionAnterior(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("traslados.secCartaRecibida")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("traslados.fechaEmisionCarta")}</label>
                <input type="date" className="form-input" value={fechaEmisionCarta} onChange={(e) => setFechaEmisionCarta(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.fechaRecepcion")}</label>
                <input type="date" className="form-input" min={fechaEmisionCarta || undefined} value={fechaRecepcion} onChange={(e) => setFechaRecepcion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.referenciaCarta")}</label>
                <input className="form-input" value={referenciaCarta} onChange={(e) => setReferenciaCarta(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.adjunto")}</label>
                {adjunto ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="tag donacion" title={adjunto.fecha}>{adjunto.nombre}</span>
                    <button type="button" className="btn secondary" onClick={() => openPath(adjunto.path).catch(() => {})}>
                      {t("traslados.adjuntoAbrir")}
                    </button>
                    <button type="button" className="btn secondary" onClick={elegirAdjunto}>
                      {t("traslados.adjuntoReemplazar")}
                    </button>
                    <button type="button" className="btn secondary danger" onClick={() => setConfirmQuitarAdjunto(true)}>
                      {t("common.eliminar")}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn secondary" onClick={elegirAdjunto}>
                    {t("traslados.adjuntoElegir")}
                  </button>
                )}
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("traslados.secProceso")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("ficha.fechaCongregacion")}</label>
                <input type="date" className="form-input" value={fechaCongregacion} onChange={(e) => setFechaCongregacion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.fechaEntrevista")}</label>
                <input type="date" className="form-input" value={fechaEntrevista} onChange={(e) => setFechaEntrevista(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.entrevistador")}</label>
                <input className="form-input" value={entrevistador} onChange={(e) => setEntrevistador(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.decision")}</label>
                <input className="form-input" placeholder={t("traslados.decisionPlaceholder")} value={decision} onChange={(e) => setDecision(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.fechaAprobacion")}</label>
                <input type="date" className="form-input" value={fechaAprobacion} onChange={(e) => setFechaAprobacion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("membresia.colEstado")}</label>
                <select className="form-input" value={estado} onChange={(e) => setEstado(e.target.value)}>
                  {ESTADOS_TE.map((es) => (
                    <option key={es} value={es}>{t(`traslados.estadoTE.${es}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group full">
                <label className="form-label">{t("cartas.observaciones")}</label>
                <textarea className="form-textarea" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </div>
            </div>
            {estado === "aceptado" && memberId === null && (
              <button type="button" className="btn primary" onClick={crearMiembro} disabled={saving}>
                {t("traslados.crearMiembro")}
              </button>
            )}
            {memberId !== null && (
              <span className="tag activo">{t("traslados.miembroVinculado")}</span>
            )}
          </Seccion>

          {error && <div className="field-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={async () => { if (await guardar()) onClose(); }} disabled={saving}>
              {saving ? t("common.guardando") : t("common.guardar")}
            </button>
          </div>
        </div>
      </div>

      {confirmQuitarAdjunto && (
        <ConfirmDialog
          title={t("traslados.adjuntoQuitarTitulo")}
          message={t("traslados.adjuntoQuitarMensaje")}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={quitarAdjunto}
          onCancel={() => setConfirmQuitarAdjunto(false)}
        />
      )}

      {duplicados && duplicados.length > 0 && (
        <div className="modal-overlay">
          <div className="confirm-card">
            <div className="confirm-title">{t("traslados.duplicadoTitulo")}</div>
            <div className="confirm-message">{t("traslados.duplicadoMensaje", { nombre: nombre.trim() })}</div>
            <div style={{ margin: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
              {duplicados.slice(0, 4).map((m) => (
                <button key={m.id} type="button" className="btn secondary" onClick={() => vincularExistente(m)}>
                  {t("traslados.vincularA", { nombre: m.nombre })}
                </button>
              ))}
            </div>
            <div className="confirm-actions">
              <button className="btn secondary" onClick={() => setDuplicados(null)}>{t("common.cancelar")}</button>
              <button className="btn primary" onClick={crearMiembroConfirmado}>{t("traslados.crearDeTodasFormas")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
