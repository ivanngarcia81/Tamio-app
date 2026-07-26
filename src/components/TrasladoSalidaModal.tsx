import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  darDeBajaMember, insertCarta, insertTrasladoSalida, memberTieneTrasladoActivo, updateTrasladoSalida,
  type Church, type Member, type NewCarta, type NewTrasladoSalida, type TrasladoSalida,
} from "../db";
import { Seccion, SwitchRow } from "./FichaMiembroModal";
import ConfirmDialog from "./ConfirmDialog";
import { IconClose } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";

export const ESTADOS_TS = [
  "borrador", "solicitud", "revision", "aprobacion", "aprobado", "cartaPreparacion",
  "cartaEmitida", "cartaEntregada", "confirmacion", "completado", "cancelado",
] as const;

function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Props {
  church: Church;
  traslado: TrasladoSalida | null;
  /** Miembros que pueden iniciar traslado (activos del registro). */
  members: Member[];
  /** Miembro preseleccionado (puente desde la baja por traslado en Membresía). */
  preMemberId?: number | null;
  onClose: () => void;
  onSaved: () => void;
  /** Abre la carta vinculada en el editor. */
  onAbrirCarta: (cartaId: number) => void;
}

export default function TrasladoSalidaModal({ church, traslado, members, preMemberId, onClose, onSaved, onAbrirCarta }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmTrasladado, setConfirmTrasladado] = useState<number | null>(null);

  const [memberId, setMemberId] = useState<number | null>(traslado?.member_id ?? preMemberId ?? null);
  const [fechaSolicitud, setFechaSolicitud] = useState(traslado?.fecha_solicitud ?? hoyLocal());
  const [motivo, setMotivo] = useState(traslado?.motivo ?? "");
  const [iglesiaDestino, setIglesiaDestino] = useState(traslado?.iglesia_destino ?? "");
  const [pastorReceptor, setPastorReceptor] = useState(traslado?.pastor_receptor ?? "");
  const [direccion, setDireccion] = useState(traslado?.direccion ?? "");
  const [ciudad, setCiudad] = useState(traslado?.ciudad ?? "");
  const [region, setRegion] = useState(traslado?.region ?? "");
  const [pais, setPais] = useState(traslado?.pais ?? "");
  const [telefono, setTelefono] = useState(traslado?.telefono ?? "");
  const [email, setEmail] = useState(traslado?.email ?? "");
  const [fechaAprobacion, setFechaAprobacion] = useState(traslado?.fecha_aprobacion ?? "");
  const [aprobadoPor, setAprobadoPor] = useState(traslado?.aprobado_por ?? "");
  const [cartaId, setCartaId] = useState<number | null>(traslado?.carta_id ?? null);
  const [fechaEntrega, setFechaEntrega] = useState(traslado?.fecha_entrega ?? "");
  const [metodoEntrega, setMetodoEntrega] = useState(traslado?.metodo_entrega ?? "");
  const [confirmacion, setConfirmacion] = useState(traslado ? traslado.confirmacion_recibida === 1 : false);
  const [fechaConfirmacion, setFechaConfirmacion] = useState(traslado?.fecha_confirmacion ?? "");
  const [observaciones, setObservaciones] = useState(traslado?.observaciones ?? "");
  const [estado, setEstado] = useState(traslado?.estado ?? "borrador");

  const miembro = members.find((m) => m.id === memberId) ?? null;
  const puedeGenerarCarta = ["aprobado", "cartaPreparacion", "cartaEmitida", "cartaEntregada", "confirmacion", "completado"].includes(estado);

  function payloadActual(): NewTrasladoSalida | null {
    setError(null);
    if (memberId === null) { setError(t("traslados.miembroObligatorio")); return null; }
    if (!fechaSolicitud) { setError(t("traslados.fechaObligatoria")); return null; }
    if (estado === "completado" && !iglesiaDestino.trim()) { setError(t("traslados.destinoObligatorio")); return null; }
    if (fechaConfirmacion && fechaEntrega && fechaConfirmacion < fechaEntrega) {
      setError(t("traslados.confirmacionAntes")); return null;
    }
    return {
      member_id: memberId,
      fecha_solicitud: fechaSolicitud,
      motivo: motivo.trim() || null,
      iglesia_destino: iglesiaDestino.trim() || null,
      pastor_receptor: pastorReceptor.trim() || null,
      direccion: direccion.trim() || null,
      ciudad: ciudad.trim() || null,
      region: region.trim() || null,
      pais: pais.trim() || null,
      telefono: telefono.trim() || null,
      email: email.trim() || null,
      fecha_aprobacion: fechaAprobacion || null,
      aprobado_por: aprobadoPor.trim() || null,
      carta_id: cartaId,
      fecha_entrega: fechaEntrega || null,
      metodo_entrega: metodoEntrega.trim() || null,
      confirmacion_recibida: confirmacion ? 1 : 0,
      fecha_confirmacion: confirmacion ? fechaConfirmacion || null : null,
      observaciones: observaciones.trim() || null,
      estado,
    };
  }

  async function guardar() {
    const payload = payloadActual();
    if (!payload) return;
    setSaving(true);
    try {
      // Advertencia (no bloqueo) si el miembro ya tiene otro traslado activo.
      if (memberId !== null && (await memberTieneTrasladoActivo(memberId, church.id, traslado?.id))) {
        setAviso(t("traslados.dosActivos"));
      }
      if (traslado) {
        await updateTrasladoSalida(traslado.id, church.id, payload, traslado.estado);
      } else {
        await insertTrasladoSalida(church.id, payload);
      }
      playSound("guardado");
      showToast(t("traslados.toastGuardado"));
      onSaved();
      // Al completar el traslado: ¿cambiar el estado del miembro a Trasladado?
      // (Nunca se borra el expediente; solo sale de los registros ordinarios.)
      if (payload.estado === "completado" && traslado?.estado !== "completado" && miembro && miembro.activo === 1) {
        setConfirmTrasladado(memberId);
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function marcarTrasladado() {
    if (confirmTrasladado === null) return;
    await darDeBajaMember(confirmTrasladado, church.id, fechaEntrega || hoyLocal(), "traslado");
    playSound("guardado");
    showToast(t("traslados.toastMiembroTrasladado"));
    setConfirmTrasladado(null);
    onSaved();
    onClose();
  }

  /** Genera la carta de traslado con los datos del proceso y la vincula. */
  async function generarCarta() {
    const payload = payloadActual();
    if (!payload || !miembro) return;
    setSaving(true);
    try {
      const cuerpo =
        `<p>${t("traslados.cartaCuerpo1", { nombre: miembro.nombre })}</p>` +
        `<p>${t("traslados.cartaCuerpo2", { destino: iglesiaDestino.trim() || "—" })}</p>`;
      const carta: NewCarta = {
        tipo: "traslado",
        fecha_emision: hoyLocal(),
        lugar_emision: church.ciudad ?? null,
        destinatario_tipo: "iglesia",
        member_id: memberId,
        destinatario_nombre: pastorReceptor.trim() || iglesiaDestino.trim() || t("traslados.iglesiaDestino"),
        destinatario_direccion: [direccion, ciudad, region, pais].filter((x) => x.trim()).join(", ") || null,
        asunto: t("traslados.cartaAsunto", { nombre: miembro.nombre }),
        saludo: null,
        cuerpo_html: cuerpo,
        despedida: null,
        firmas: [
          ...(church.pastor_nombre ? [{ rol: "pastor", nombre: church.pastor_nombre, cargo: church.pastor_cargo ?? t("rol.pastor"), firmado: false, fecha: null }] : []),
          ...(church.secretaria_nombre ? [{ rol: "secretaria", nombre: church.secretaria_nombre, cargo: church.secretaria_cargo ?? t("cartas.rolSecretaria"), firmado: false, fecha: null }] : []),
        ],
        observaciones: null,
        estado: "preparacion",
        entregada_a: null,
        fecha_entrega: null,
      };
      const creada = await insertCarta(church.id, carta);
      if (!creada || !traslado) return;
      setCartaId(creada.id);
      const nuevoEstado = estado === "aprobado" ? "cartaPreparacion" : estado;
      setEstado(nuevoEstado);
      await updateTrasladoSalida(traslado.id, church.id, { ...payload, carta_id: creada.id, estado: nuevoEstado }, traslado.estado);
      playSound("guardado");
      showToast(t("traslados.toastCartaGenerada", { folio: creada.folio }));
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 720 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {traslado ? `${traslado.folio} — ${t("common.editar")}` : t("traslados.nuevoSalida")}
            </div>
            <div className="modal-sub">{t("traslados.subSalida")}</div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("traslados.secMiembro")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("cartas.miembro")}</label>
                <select
                  className="form-input"
                  value={memberId ?? ""}
                  disabled={traslado !== null}
                  onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{t("cartas.eligeMiembro")}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("solicitudes.fechaSolicitud")}</label>
                <input type="date" className="form-input" value={fechaSolicitud} onChange={(e) => setFechaSolicitud(e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">{t("solicitudes.motivo")} <span className="opt">{t("common.opcional")}</span></label>
                <input className="form-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("traslados.secDestino")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("traslados.iglesiaDestino")}</label>
                <input className="form-input" value={iglesiaDestino} onChange={(e) => setIglesiaDestino(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.pastorReceptor")}</label>
                <input className="form-input" value={pastorReceptor} onChange={(e) => setPastorReceptor(e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">{t("institucion.direccion")}</label>
                <input className="form-input" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("iglesia.ciudad")}</label>
                <input className="form-input" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("institucion.region")}</label>
                <input className="form-input" value={region} onChange={(e) => setRegion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("iglesia.pais")}</label>
                <input className="form-input" value={pais} onChange={(e) => setPais(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("tesorero.telefono")}</label>
                <input className="form-input" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              </div>
              <div className="form-group full">
                <label className="form-label">{t("tesorero.correo")}</label>
                <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("traslados.secProceso")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("membresia.colEstado")}</label>
                <select className="form-input" value={estado} onChange={(e) => setEstado(e.target.value)}>
                  {ESTADOS_TS.map((es) => (
                    <option key={es} value={es}>{t(`traslados.estadoTS.${es}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.fechaAprobacion")}</label>
                <input type="date" className="form-input" value={fechaAprobacion} onChange={(e) => setFechaAprobacion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.aprobadoPor")}</label>
                <input className="form-input" value={aprobadoPor} onChange={(e) => setAprobadoPor(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.cartaVinculada")}</label>
                {cartaId ? (
                  <button type="button" className="btn secondary" onClick={() => onAbrirCarta(cartaId)}>
                    {t("traslados.abrirCartaVinculada")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={!puedeGenerarCarta || !traslado || saving}
                    title={!traslado ? t("traslados.guardaPrimero") : !puedeGenerarCarta ? t("traslados.generarRequiereAprobado") : undefined}
                    onClick={generarCarta}
                  >
                    {t("traslados.generarCarta")}
                  </button>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">{t("cartas.fechaEntrega")}</label>
                <input type="date" className="form-input" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("traslados.metodoEntrega")}</label>
                <input className="form-input" value={metodoEntrega} onChange={(e) => setMetodoEntrega(e.target.value)} />
              </div>
              <div className="form-group">
                <SwitchRow label={t("traslados.confirmacionRecibida")} value={confirmacion} onChange={setConfirmacion} />
              </div>
              {confirmacion && (
                <div className="form-group">
                  <label className="form-label">{t("traslados.fechaConfirmacion")}</label>
                  <input type="date" className="form-input" min={fechaEntrega || undefined} value={fechaConfirmacion} onChange={(e) => setFechaConfirmacion(e.target.value)} />
                </div>
              )}
              <div className="form-group full">
                <label className="form-label">{t("cartas.observaciones")}</label>
                <textarea className="form-textarea" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </div>
            </div>
          </Seccion>

          {aviso && <div className="form-warning" style={{ marginBottom: 10 }}>{aviso}</div>}
          {error && <div className="field-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={guardar} disabled={saving}>
              {saving ? t("common.guardando") : t("common.guardar")}
            </button>
          </div>
        </div>
      </div>

      {confirmTrasladado !== null && (
        <ConfirmDialog
          title={t("traslados.trasladadoTitulo")}
          message={t("traslados.trasladadoMensaje", { nombre: miembro?.nombre ?? "" })}
          confirmLabel={t("traslados.cambiarATrasladado")}
          onConfirm={marcarTrasladado}
          onCancel={() => { setConfirmTrasladado(null); onClose(); }}
        />
      )}
    </div>
  );
}
