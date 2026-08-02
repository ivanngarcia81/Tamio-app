import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  insertActa, updateActa,
  type Acta, type ActaAcuerdo, type ActaMocion, type Church, type NewActa,
} from "../db";
import { ChipGroup, Seccion, SwitchRow } from "./FichaMiembroModal";
import { IconClose, IconPlus, IconSparkles } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { iaHabilitada, redactarActa } from "../ia";

export const TIPOS_ACTA = [
  "administrativa", "lideres", "asamblea", "pastoral", "eleccion", "nombramiento",
  "recepcion", "compraventa", "presupuesto", "disciplina", "otra",
] as const;

export const ESTADOS_ACTA = ["borrador", "pendiente", "aprobada", "corregida", "archivada"] as const;

function parseNombres(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function parseMociones(json: string): ActaMocion[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function parseAcuerdos(json: string): ActaAcuerdo[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Props {
  church: Church;
  /** null = acta nueva. */
  acta: Acta | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ActaModal({ church, acta, onClose, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  useEscapeClose(onClose);
  const [saving, setSaving] = useState(false);
  const [iaAbierta, setIaAbierta] = useState(false);
  const [iaPuntos, setIaPuntos] = useState("");
  const [iaGenerando, setIaGenerando] = useState(false);
  const [iaError, setIaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tipo, setTipo] = useState(acta?.tipo ?? "administrativa");
  const [titulo, setTitulo] = useState(acta?.titulo ?? "");
  const [fecha, setFecha] = useState(acta?.fecha ?? hoyLocal());
  const [horaInicio, setHoraInicio] = useState(acta?.hora_inicio ?? "");
  const [horaCierre, setHoraCierre] = useState(acta?.hora_cierre ?? "");
  const [lugar, setLugar] = useState(acta?.lugar ?? "");
  const [preside, setPreside] = useState(acta?.preside ?? "");
  const [secretario, setSecretario] = useState(acta?.secretario ?? "");
  const [presentes, setPresentes] = useState<string[]>(() => (acta ? parseNombres(acta.presentes) : []));
  const [ausentes, setAusentes] = useState<string[]>(() => (acta ? parseNombres(acta.ausentes) : []));
  const [invitados, setInvitados] = useState<string[]>(() => (acta ? parseNombres(acta.invitados) : []));
  const [quorum, setQuorum] = useState(acta ? acta.quorum === 1 : false);
  const [agenda, setAgenda] = useState(acta?.agenda ?? "");
  const [resumen, setResumen] = useState(acta?.resumen ?? "");
  const [mociones, setMociones] = useState<ActaMocion[]>(() => (acta ? parseMociones(acta.mociones) : []));
  const [acuerdos, setAcuerdos] = useState<ActaAcuerdo[]>(() => (acta ? parseAcuerdos(acta.acuerdos) : []));
  const [estado, setEstado] = useState(acta?.estado ?? "borrador");

  async function generarActaIA() {
    const puntos = iaPuntos.trim();
    if (!puntos) return;
    setIaGenerando(true);
    setIaError(null);
    try {
      const texto = await redactarActa({
        puntos,
        titulo: titulo.trim() || undefined,
        iglesia: church.nombre,
        idioma: i18n.language?.startsWith("en") ? "en" : "es",
      });
      setResumen(texto);
      setIaAbierta(false);
      setIaPuntos("");
      playSound("guardado");
    } catch (e) {
      setIaError(t("cartas.ia.error", { error: String((e as { message?: string })?.message ?? e) }));
    } finally {
      setIaGenerando(false);
    }
  }
  const [confidencial, setConfidencial] = useState(acta ? acta.confidencial === 1 : false);
  const [fechaAprobacion, setFechaAprobacion] = useState(acta?.fecha_aprobacion ?? "");

  const muestraAprobacion = estado === "aprobada" || estado === "corregida";

  function setMocion(i: number, patch: Partial<ActaMocion>) {
    setMociones((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  }

  function setAcuerdo(i: number, patch: Partial<ActaAcuerdo>) {
    setAcuerdos((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }

  async function guardar() {
    setError(null);
    if (!titulo.trim()) { setError(t("actas.tituloObligatorio")); return; }
    if (!fecha) { setError(t("actas.fechaObligatoria")); return; }
    // Un acta aprobada/corregida es un documento formal: sin quién presidió y
    // quién levantó el acta no puede pasar de borrador.
    if (estado === "aprobada" || estado === "corregida") {
      if (!preside.trim()) { setError(t("actas.presideObligatorio", { estado: t(`actas.estado.${estado}`) })); return; }
      if (!secretario.trim()) { setError(t("actas.secretarioObligatorio", { estado: t(`actas.estado.${estado}`) })); return; }
    }
    setSaving(true);
    try {
      const payload: NewActa = {
        tipo,
        titulo: titulo.trim(),
        fecha,
        hora_inicio: horaInicio || null,
        hora_cierre: horaCierre || null,
        lugar: lugar.trim() || null,
        preside: preside.trim() || null,
        secretario: secretario.trim() || null,
        presentes,
        ausentes,
        invitados,
        quorum,
        agenda: agenda.trim() || null,
        resumen: resumen.trim() || null,
        mociones: mociones.filter((m) => m.texto.trim()),
        acuerdos: acuerdos.filter((a) => a.texto.trim()),
        estado,
        confidencial,
        fecha_aprobacion: muestraAprobacion ? fechaAprobacion || null : null,
      };
      if (acta) {
        await updateActa(acta.id, church.id, payload);
      } else {
        await insertActa(church.id, payload);
      }
      playSound("guardado");
      showToast(t("actas.toastGuardada"));
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 720 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{acta ? `${acta.folio} — ${t("actas.editarActa")}` : t("actas.nuevaActa")}</div>
            <div className="modal-sub">{t("secretaria.actas.sub")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("actas.secBasica")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("actas.tipoReunion")}</label>
                <select className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS_ACTA.map((ti) => (
                    <option key={ti} value={ti}>{t(`actas.tipo.${ti}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.tituloActa")}</label>
                <input className="form-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={t("actas.tituloPlaceholder")} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("tx.colFecha")}</label>
                <input type="date" className="form-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.lugar")}</label>
                <input className="form-input" value={lugar} onChange={(e) => setLugar(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.horaInicio")}</label>
                <input type="time" className="form-input" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.horaCierre")}</label>
                <input type="time" className="form-input" value={horaCierre} onChange={(e) => setHoraCierre(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.preside")}</label>
                <input className="form-input" value={preside} onChange={(e) => setPreside(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("actas.secretarioRedacta")}</label>
                <input className="form-input" value={secretario} onChange={(e) => setSecretario(e.target.value)} />
              </div>
              <div className="form-group">
                <SwitchRow label={t("actas.quorum")} value={quorum} onChange={setQuorum} />
              </div>
              <div className="form-group">
                <SwitchRow label={t("actas.confidencial")} value={confidencial} onChange={setConfidencial} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("actas.secAsistencia")}>
            <div className="form-group full">
              <label className="form-label">{t("actas.presentes")}</label>
              <ChipGroup catalogo={[]} prefijo="actas" valores={presentes} onChange={setPresentes} placeholder={t("actas.agregarNombre")} />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("actas.ausentes")}</label>
              <ChipGroup catalogo={[]} prefijo="actas" valores={ausentes} onChange={setAusentes} placeholder={t("actas.agregarNombre")} />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("actas.invitados")}</label>
              <ChipGroup catalogo={[]} prefijo="actas" valores={invitados} onChange={setInvitados} placeholder={t("actas.agregarNombre")} />
            </div>
          </Seccion>

          <Seccion titulo={t("actas.secContenido")}>
            <div className="form-group full">
              <label className="form-label">{t("actas.agenda")}</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder={t("actas.agendaPlaceholder")}
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
              />
            </div>
            <div className="form-group full">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label className="form-label">{t("actas.resumen")}</label>
                {iaHabilitada && (
                  <button
                    type="button"
                    className="btn ia"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    onClick={() => { setIaError(null); setIaAbierta(true); }}
                  >
                    <IconSparkles size={13} /> {t("actas.ia.boton")}
                  </button>
                )}
              </div>
              <textarea
                className="form-textarea"
                rows={5}
                placeholder={t("actas.resumenPlaceholder")}
                value={resumen}
                onChange={(e) => setResumen(e.target.value)}
              />
            </div>

            {iaAbierta && (
              <div className="form-group full form-subcard">
                <div className="form-label modal-title-ia" style={{ marginBottom: 6 }}><IconSparkles size={14} /> {t("actas.ia.titulo")}</div>
                <div className="form-hint" style={{ marginBottom: 8 }}>{t("actas.ia.sub")}</div>
                <textarea
                  className="form-textarea"
                  rows={4}
                  autoFocus
                  placeholder={t("actas.ia.placeholder")}
                  value={iaPuntos}
                  onChange={(e) => setIaPuntos(e.target.value)}
                  disabled={iaGenerando}
                />
                {resumen.trim().length > 0 && (
                  <div className="form-hint" style={{ marginTop: 6 }}>{t("actas.ia.reemplazar")}</div>
                )}
                {iaError && <div className="field-error" style={{ marginTop: 6 }}>{iaError}</div>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn secondary" onClick={() => setIaAbierta(false)} disabled={iaGenerando}>
                    {t("cartas.ia.cancelar")}
                  </button>
                  <button type="button" className="btn ia-primary" onClick={generarActaIA} disabled={iaGenerando || !iaPuntos.trim()}>
                    <IconSparkles size={14} /> {iaGenerando ? t("cartas.ia.generando") : t("cartas.ia.generar")}
                  </button>
                </div>
              </div>
            )}
          </Seccion>

          <Seccion titulo={t("actas.secMociones")}>
            {mociones.map((m, i) => (
              <div key={i} className="form-group full form-subcard">
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    style={{ flex: 1 }}
                    placeholder={t("actas.mocionTexto")}
                    value={m.texto}
                    onChange={(e) => setMocion(i, { texto: e.target.value })}
                  />
                  <button type="button" className="modal-close" title={t("common.eliminar")} onClick={() => setMociones((ms) => ms.filter((_, j) => j !== i))}>
                    <IconClose size={14} />
                  </button>
                </div>
                <div className="form-grid" style={{ marginTop: 10, marginBottom: 0, gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <input className="form-input" placeholder={t("actas.mocionPresenta")} value={m.presenta} onChange={(e) => setMocion(i, { presenta: e.target.value })} />
                  <input className="form-input" placeholder={t("actas.mocionSecunda")} value={m.secunda} onChange={(e) => setMocion(i, { secunda: e.target.value })} />
                  <input className="form-input" placeholder={t("actas.mocionResultado")} value={m.resultado} onChange={(e) => setMocion(i, { resultado: e.target.value })} />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn secondary"
              onClick={() => setMociones((ms) => [...ms, { texto: "", presenta: "", secunda: "", resultado: "" }])}
            >
              <IconPlus size={13} /> {t("actas.agregarMocion")}
            </button>
          </Seccion>

          <Seccion titulo={t("actas.secAcuerdos")}>
            {acuerdos.map((a, i) => (
              <div key={i} className="form-group full form-subcard">
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    style={{ flex: 1 }}
                    placeholder={t("actas.acuerdoTexto")}
                    value={a.texto}
                    onChange={(e) => setAcuerdo(i, { texto: e.target.value })}
                  />
                  <button type="button" className="modal-close" title={t("common.eliminar")} onClick={() => setAcuerdos((as) => as.filter((_, j) => j !== i))}>
                    <IconClose size={14} />
                  </button>
                </div>
                <div className="form-grid" style={{ marginTop: 10, marginBottom: 0 }}>
                  <input className="form-input" placeholder={t("actas.acuerdoResponsable")} value={a.responsable} onChange={(e) => setAcuerdo(i, { responsable: e.target.value })} />
                  <div>
                    <input type="date" className="form-input" title={t("actas.acuerdoFechaLimite")} value={a.fecha_limite ?? ""} onChange={(e) => setAcuerdo(i, { fecha_limite: e.target.value || null })} />
                    <span className="form-label opt" style={{ fontWeight: 500, color: "var(--text-3)" }}>{t("actas.acuerdoFechaLimite")}</span>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn secondary"
              onClick={() => setAcuerdos((as) => [...as, { texto: "", responsable: "", fecha_limite: null }])}
            >
              <IconPlus size={13} /> {t("actas.agregarAcuerdo")}
            </button>
          </Seccion>

          <Seccion titulo={t("actas.secAprobacion")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("actas.estadoActa")}</label>
                <select className="form-input" value={estado} onChange={(e) => setEstado(e.target.value)}>
                  {ESTADOS_ACTA.map((es) => (
                    <option key={es} value={es}>{t(`actas.estado.${es}`)}</option>
                  ))}
                </select>
              </div>
              {muestraAprobacion && (
                <div className="form-group">
                  <label className="form-label">{t("actas.fechaAprobacion")}</label>
                  <input type="date" className="form-input" value={fechaAprobacion} onChange={(e) => setFechaAprobacion(e.target.value)} />
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>{t("actas.notaFirmas")}</div>
          </Seccion>

          {error && <div className="field-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={guardar} disabled={saving}>
              {saving ? t("common.guardando") : acta ? t("common.guardarCambios") : t("actas.guardarActa")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
