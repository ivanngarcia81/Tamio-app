import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { esIPhone } from "../movil";
import { IOSPickerInput } from "./ios/IOSPickerField";
import {
  ESTADOS_ACTIVIDAD, RECURRENCIA_NINGUNA, TIPOS_ACTIVIDAD, hoyISO, insertActividad, listMembersRoster,
  parseRecordatorios, parseRecurrencia, updateActividad,
  type Actividad, type Church, type NewActividad, type RecFin, type Recurrencia, type RecurrenciaTipo,
} from "../db";
import { Seccion } from "./FichaMiembroModal";
import { IconClose, IconWarn } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";

/** Un choque de horario detectado (lo calcula la página, que tiene todas las ocurrencias). */
export interface ConflictoAgenda {
  nombre: string;
  detalle: string;
}

const REC_TIPOS: RecurrenciaTipo[] = ["ninguna", "semanal", "quincenal", "mensual", "anual", "personalizada"];
/** Presets de recordatorio: días de anticipación → clave i18n. */
const RECORDATORIOS_PRESET: { offset: number; clave: string }[] = [
  { offset: 0, clave: "mismoDia" },
  { offset: 1, clave: "unDiaAntes" },
  { offset: 2, clave: "dosDiasAntes" },
  { offset: 7, clave: "unaSemanaAntes" },
];

interface Props {
  church: Church;
  /** null = actividad nueva. */
  actividad: Actividad | null;
  /** Cuando se abre para duplicar: precarga los campos de esta actividad
   *  pero guarda como una NUEVA (actividad debe ser null). */
  duplicarDe?: Actividad | null;
  /** Fecha preseleccionada (YYYY-MM-DD) al crear desde una celda del calendario. */
  fechaInicial?: string | null;
  /** Oculta la sección de repetición (p. ej. al editar "solo esta" ocurrencia). */
  mostrarRecurrencia?: boolean;
  /** Título personalizado (para editar el alcance de una serie). */
  tituloModo?: string;
  /** Si se provee, se llama en vez de insertar/actualizar (la página decide qué hacer). */
  onSubmitOverride?: (payload: NewActividad) => Promise<void>;
  /** Detección de conflictos de horario para la fecha/lugar del payload. */
  detectarConflictos?: (payload: NewActividad) => ConflictoAgenda[];
  onClose: () => void;
  onSaved: () => void;
}

export default function ActividadModal({
  church, actividad, duplicarDe, fechaInicial, mostrarRecurrencia = true, tituloModo,
  onSubmitOverride, detectarConflictos, onClose, onSaved,
}: Props) {
  const { t } = useTranslation();
  const enIPhone = esIPhone();
  const opc = (claves: readonly string[], pref: string) =>
    claves.map((k) => ({ value: k, label: t(`${pref}.${k}`) }));
  const editar = actividad !== null;
  const base = actividad ?? duplicarDe ?? null;
  const recBase = useMemo(() => parseRecurrencia(base?.recurrencia), [base]);

  const [nombre, setNombre] = useState(
    base ? (duplicarDe && !actividad ? `${base.nombre} ${t("agenda.sufijoCopia")}` : base.nombre) : ""
  );
  const [tipo, setTipo] = useState(base?.tipo ?? "cultoRegular");
  const [tipoPersonalizado, setTipoPersonalizado] = useState(base?.tipo_personalizado ?? "");
  const [fecha, setFecha] = useState(base?.fecha ?? fechaInicial ?? hoyISO());
  const [diaCompleto, setDiaCompleto] = useState(base ? base.dia_completo === 1 : false);
  const [horaInicio, setHoraInicio] = useState(base?.hora_inicio ?? "");
  const [horaFin, setHoraFin] = useState(base?.hora_fin ?? "");
  const [lugar, setLugar] = useState(base?.lugar ?? "");
  const [descripcion, setDescripcion] = useState(base?.descripcion ?? "");
  // "" = sin asignar (el valor por omisión); "externa" = persona de fuera con
  // nombre libre. Antes el vacío ERA "otra persona (externa)": el caso raro
  // como valor por defecto, con su campo de nombre abierto desde el inicio.
  const [responsableMemberId, setResponsableMemberId] = useState<string>(
    base?.responsable_member_id != null
      ? String(base.responsable_member_id)
      : base?.responsable_persona
        ? "externa"
        : ""
  );
  const [responsablePersona, setResponsablePersona] = useState(base?.responsable_persona ?? "");
  const [responsableMinisterio, setResponsableMinisterio] = useState(base?.responsable_ministerio ?? "");
  const [invitado, setInvitado] = useState(base?.invitado ?? "");
  const [contacto, setContacto] = useState(base?.contacto ?? "");
  const [estado, setEstado] = useState(
    duplicarDe && !actividad ? "programada" : (base?.estado ?? "programada")
  );
  const [esFechaImportante, setEsFechaImportante] = useState(base ? base.es_fecha_importante === 1 : false);
  const [recordatorios, setRecordatorios] = useState<number[]>(parseRecordatorios(base?.recordatorios));

  // ---- Recurrencia ----
  const [recTipo, setRecTipo] = useState<RecurrenciaTipo>(recBase.tipo);
  const [recDias, setRecDias] = useState<number[]>(recBase.diasSemana);
  const [recIntervalo, setRecIntervalo] = useState(recBase.intervalo);
  const [recFinTipo, setRecFinTipo] = useState<RecFin["tipo"]>(recBase.fin.tipo);
  const [recHasta, setRecHasta] = useState(recBase.fin.tipo === "hasta" ? recBase.fin.hasta : "");
  const [recConteo, setRecConteo] = useState(recBase.fin.tipo === "conteo" ? recBase.fin.conteo : 10);

  const [miembros, setMiembros] = useState<{ id: number; nombre: string }[]>([]);
  // Estas dos no son un catálogo pelado: llevan centinelas propios
  // ("sin asignar", "externa") que no salen de ninguna lista.
  const opcResponsable = [
    { value: "", label: t("agenda.responsableSinAsignar") },
    ...miembros.map((m) => ({ value: String(m.id), label: m.nombre })),
    { value: "externa", label: t("agenda.responsableExterno") },
  ];
  const opcRecFin = [
    { value: "nunca", label: t("agenda.finNunca") },
    { value: "hasta", label: t("agenda.finHasta") },
    { value: "conteo", label: t("agenda.finConteo") },
  ];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictos, setConflictos] = useState<ConflictoAgenda[] | null>(null);

  useEscapeClose(onClose);

  useEffect(() => {
    let cancelado = false;
    listMembersRoster(church.id)
      .then((m) => { if (!cancelado) setMiembros(m); })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [church.id]);

  const diasSemana = t("agenda.diasSemana", { returnObjects: true }) as string[];
  const muestraDias = recTipo === "semanal" || recTipo === "personalizada";

  function toggleDia(d: number) {
    setRecDias((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b));
  }
  function toggleRecordatorio(off: number) {
    setRecordatorios((prev) => prev.includes(off) ? prev.filter((x) => x !== off) : [...prev, off].sort((a, b) => a - b));
  }

  function construirRecurrencia(): Recurrencia {
    if (!mostrarRecurrencia || recTipo === "ninguna") return { ...RECURRENCIA_NINGUNA };
    const fin: RecFin = recFinTipo === "hasta"
      ? { tipo: "hasta", hasta: recHasta }
      : recFinTipo === "conteo"
        ? { tipo: "conteo", conteo: Math.max(1, recConteo) }
        : { tipo: "nunca" };
    const intervalo = recTipo === "personalizada" ? Math.max(1, recIntervalo) : recTipo === "quincenal" ? 2 : 1;
    const diasSem = muestraDias ? recDias : [];
    return { tipo: recTipo, intervalo, diasSemana: diasSem, fin };
  }

  function validar(): string | null {
    if (!nombre.trim()) return t("agenda.errNombre");
    if (!fecha) return t("agenda.errFecha");
    if (!diaCompleto && !horaInicio) return t("agenda.errHoraInicio");
    if (!diaCompleto && horaInicio && horaFin && horaFin < horaInicio) return t("agenda.errHoraFin");
    if (tipo === "otra" && !tipoPersonalizado.trim()) return t("agenda.errTipoPersonalizado");
    if (mostrarRecurrencia && recTipo !== "ninguna" && recFinTipo === "hasta" && recHasta && recHasta < fecha) {
      return t("agenda.errFinRepeticion");
    }
    return null;
  }

  function armarPayload(): NewActividad {
    const memberId = responsableMemberId && responsableMemberId !== "externa"
      ? Number(responsableMemberId) : null;
    return {
      nombre, tipo, tipo_personalizado: tipoPersonalizado, fecha,
      hora_inicio: horaInicio, hora_fin: horaFin, dia_completo: diaCompleto,
      lugar, descripcion,
      responsable_member_id: memberId,
      responsable_persona: responsableMemberId === "externa" ? responsablePersona : "",
      responsable_ministerio: responsableMinisterio,
      invitado, contacto, estado, es_fecha_importante: esFechaImportante,
      recurrencia: construirRecurrencia(),
      recordatorios,
    };
  }

  async function guardar(forzar = false) {
    const problema = validar();
    if (problema) { setError(problema); return; }
    const payload = armarPayload();

    if (!forzar && detectarConflictos) {
      const ch = detectarConflictos(payload);
      if (ch.length > 0) { setConflictos(ch); return; }
    }

    setSaving(true);
    setError(null);
    setConflictos(null);
    try {
      if (onSubmitOverride) await onSubmitOverride(payload);
      else if (editar) await updateActividad(actividad!.id, church.id, payload);
      else await insertActividad(church.id, payload);
      playSound("guardado");
      showToast(editar || onSubmitOverride ? t("agenda.toastActualizada") : t("agenda.toastCreada"));
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      setError(t("agenda.errGuardar"));
      setSaving(false);
    }
  }

  const titulo = tituloModo ?? (editar ? t("agenda.editarActividad") : t("agenda.nuevaActividad"));

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 640 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{titulo}</div>
            <div className="modal-sub">{t("secretaria.agenda.sub")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("agenda.secBasica")}>
            <div className="form-group full">
              <label className="form-label">{t("agenda.nombre")}</label>
              <input className="form-input" value={nombre} autoFocus placeholder={t("agenda.nombrePlaceholder")} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.tipo")}</label>
                {enIPhone ? (
                  <IOSPickerInput ariaLabel={t("agenda.tipo")} options={opc(TIPOS_ACTIVIDAD, "agenda.tipos")} value={tipo} onSelect={setTipo} />
                ) : (
                  <select className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    {opc(TIPOS_ACTIVIDAD, "agenda.tipos").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </div>
              {tipo === "otra" && (
                <div className="form-group">
                  <label className="form-label">{t("agenda.tipoPersonalizado")}</label>
                  <input className="form-input" value={tipoPersonalizado} placeholder={t("agenda.tipoPersonalizadoPlaceholder")} onChange={(e) => setTipoPersonalizado(e.target.value)} />
                </div>
              )}
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.fecha")}</label>
                <input type="date" className="form-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="form-group" style={{ justifyContent: "flex-end" }}>
                <label className="check-inline">
                  <input type="checkbox" checked={diaCompleto} onChange={(e) => setDiaCompleto(e.target.checked)} />
                  {t("agenda.diaCompleto")}
                </label>
              </div>
            </div>
            {!diaCompleto && (
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{t("agenda.horaInicio")}</label>
                  <input type="time" className="form-input" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("agenda.horaFin")} <span className="opt">{t("common.opcional")}</span></label>
                  <input type="time" className="form-input" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
                </div>
              </div>
            )}
            <div className="form-group full">
              <label className="form-label">{t("agenda.lugar")} <span className="opt">{t("common.opcional")}</span></label>
              <input className="form-input" value={lugar} onChange={(e) => setLugar(e.target.value)} />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("agenda.descripcion")} <span className="opt">{t("common.opcional")}</span></label>
              <textarea className="form-textarea" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </Seccion>

          <Seccion titulo={t("agenda.secResponsabilidad")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.responsable")}</label>
                {enIPhone ? (
                  <IOSPickerInput ariaLabel={t("agenda.responsable")} options={opcResponsable} value={responsableMemberId} onSelect={setResponsableMemberId} />
                ) : (
                  <select className="form-input" value={responsableMemberId} onChange={(e) => setResponsableMemberId(e.target.value)}>
                    {opcResponsable.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </div>
              {responsableMemberId === "externa" && (
                <div className="form-group">
                  <label className="form-label">{t("agenda.responsablePersona")}</label>
                  <input className="form-input" value={responsablePersona} placeholder={t("agenda.responsablePersonaPlaceholder")} onChange={(e) => setResponsablePersona(e.target.value)} />
                </div>
              )}
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.ministerio")} <span className="opt">{t("common.opcional")}</span></label>
                <input className="form-input" value={responsableMinisterio} onChange={(e) => setResponsableMinisterio(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("agenda.invitado")} <span className="opt">{t("common.opcional")}</span></label>
                <input className="form-input" value={invitado} onChange={(e) => setInvitado(e.target.value)} />
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">{t("agenda.contacto")} <span className="opt">{t("common.opcional")}</span></label>
              <input className="form-input" value={contacto} onChange={(e) => setContacto(e.target.value)} />
            </div>
          </Seccion>

          {mostrarRecurrencia && (
            <Seccion titulo={t("agenda.secRepeticion")}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{t("agenda.repeticion")}</label>
                  {enIPhone ? (
                    <IOSPickerInput ariaLabel={t("agenda.repetir")} options={opc(REC_TIPOS, "agenda.rec")} value={recTipo} onSelect={(v) => setRecTipo(v as RecurrenciaTipo)} />
                  ) : (
                    <select className="form-input" value={recTipo} onChange={(e) => setRecTipo(e.target.value as RecurrenciaTipo)}>
                      {opc(REC_TIPOS, "agenda.rec").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                </div>
                {recTipo === "personalizada" && (
                  <div className="form-group">
                    <label className="form-label">{t("agenda.cadaNSemanas")}</label>
                    <input type="number" min={1} className="form-input" value={recIntervalo} onChange={(e) => setRecIntervalo(Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                )}
              </div>
              {muestraDias && (
                <div className="form-group full">
                  <label className="form-label">{t("agenda.diasRepeticion")}</label>
                  <div className="dias-toggle">
                    {diasSemana.map((d, i) => (
                      <button key={i} type="button" className={`dia-chip${recDias.includes(i) ? " active" : ""}`} onClick={() => toggleDia(i)}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {recTipo !== "ninguna" && (
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">{t("agenda.finRepeticion")}</label>
                    {enIPhone ? (
                      <IOSPickerInput ariaLabel={t("agenda.termina")} options={opcRecFin} value={recFinTipo} onSelect={(v) => setRecFinTipo(v as RecFin["tipo"])} />
                    ) : (
                      <select className="form-input" value={recFinTipo} onChange={(e) => setRecFinTipo(e.target.value as RecFin["tipo"])}>
                        {opcRecFin.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}
                  </div>
                  {recFinTipo === "hasta" && (
                    <div className="form-group">
                      <label className="form-label">{t("agenda.finFecha")}</label>
                      <input type="date" className="form-input" value={recHasta} onChange={(e) => setRecHasta(e.target.value)} />
                    </div>
                  )}
                  {recFinTipo === "conteo" && (
                    <div className="form-group">
                      <label className="form-label">{t("agenda.finVeces")}</label>
                      <input type="number" min={1} className="form-input" value={recConteo} onChange={(e) => setRecConteo(Math.max(1, Number(e.target.value) || 1))} />
                    </div>
                  )}
                </div>
              )}
            </Seccion>
          )}

          <Seccion titulo={t("agenda.secEstado")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("agenda.estado")}</label>
                {enIPhone ? (
                  <IOSPickerInput ariaLabel={t("membresia.colEstado")} options={opc(ESTADOS_ACTIVIDAD, "agenda.estados")} value={estado} onSelect={setEstado} />
                ) : (
                  <select className="form-input" value={estado} onChange={(e) => setEstado(e.target.value)}>
                    {opc(ESTADOS_ACTIVIDAD, "agenda.estados").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </div>
              <div className="form-group" style={{ justifyContent: "flex-end" }}>
                <label className="check-inline">
                  <input type="checkbox" checked={esFechaImportante} onChange={(e) => setEsFechaImportante(e.target.checked)} />
                  {t("agenda.esFechaImportante")}
                </label>
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">{t("agenda.recordatorios")}</label>
              <div className="dias-toggle">
                {RECORDATORIOS_PRESET.map((r) => (
                  <button key={r.offset} type="button" className={`dia-chip${recordatorios.includes(r.offset) ? " active" : ""}`} onClick={() => toggleRecordatorio(r.offset)}>
                    {t(`agenda.recordatorio.${r.clave}`)}
                  </button>
                ))}
              </div>
              {/* Decir qué es y qué NO es. El aviso solo se pinta en la lista
                  de Agenda: no hay correo ni notificación del sistema. Sin
                  esta línea, quien marca "un día antes" espera algo que no
                  llega y se entera el día que se le pasa la reunión. */}
              <div className="form-hint">{t("agenda.recordatoriosHint")}</div>
            </div>
          </Seccion>

          {conflictos && (
            <div className="agenda-conflicto">
              <div className="agenda-conflicto-head"><IconWarn size={15} /> {t("agenda.conflictoTitulo")}</div>
              <div className="agenda-conflicto-sub">{t("agenda.conflictoSub")}</div>
              <ul className="agenda-conflicto-lista">
                {conflictos.map((c, i) => <li key={i}><strong>{c.nombre}</strong> — {c.detalle}</li>)}
              </ul>
              <div className="agenda-conflicto-acciones">
                <button className="btn secondary sm" onClick={() => setConflictos(null)}>{t("agenda.conflictoEditar")}</button>
                <button className="btn primary danger sm" onClick={() => guardar(true)} disabled={saving}>{t("agenda.conflictoGuardar")}</button>
              </div>
            </div>
          )}

          {error && <div className="field-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={() => guardar(false)} disabled={saving || conflictos !== null}>
              {saving ? t("common.guardando") : editar || onSubmitOverride ? t("common.guardarCambios") : t("agenda.guardarActividad")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
