import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buscarPosiblesDuplicados, getServicioAsistencia, insertServicio, insertVisitanteComoMiembro,
  listMembersAsistencia, parseVisitantes, updateServicio,
  type AsistenciaEntry, type Church, type NewServicio, type Servicio, type ServicioVisitante,
} from "../db";
import { ChipGroup, Seccion } from "./FichaMiembroModal";
import ConfirmDialog from "./ConfirmDialog";
import { IconClose, IconPlus, IconSearch } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";

export const TIPOS_SERVICIO = [
  "dominical", "oracion", "estudio", "jovenes", "damas", "caballeros",
  "vigilia", "evangelistico", "especial", "otro",
] as const;

export const RAZONES_AUSENCIA = [
  "justificada", "enfermedad", "trabajo", "viaje", "emergencia", "desconocida", "otra",
] as const;

/** Estado de un miembro en el roster. Presentes y Ausentes son vistas
 *  derivadas de este mismo mapa: un miembro jamás puede estar en ambas. */
interface RosterState {
  nombre: string;
  presente: boolean;
  razon: string;
  razonOtra: string;
  seguimiento: boolean;
  /** Estado en el padrón (visitante/enProceso pintan etiqueta); ausente en
   *  servicios guardados, donde el roster es un snapshot histórico. */
  estadoMiembro?: string;
}

type Roster = Map<number, RosterState>;

function parseNombres(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function numeroSano(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

const RosterRow = memo(function RosterRow({ id, estado, onToggle, onRazon, onRazonOtra, onSeguimiento }: {
  id: number;
  estado: RosterState;
  onToggle: (id: number) => void;
  onRazon: (id: number, v: string) => void;
  onRazonOtra: (id: number, v: string) => void;
  onSeguimiento: (id: number, v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="roster-row">
      <input
        type="checkbox"
        id={`roster-${id}`}
        checked={estado.presente}
        aria-label={t("servicios.rosterMarcarAria", { nombre: estado.nombre })}
        onChange={() => onToggle(id)}
      />
      <label className="roster-name" htmlFor={`roster-${id}`} title={estado.nombre}>
        {estado.nombre}
      </label>
      {estado.estadoMiembro && estado.estadoMiembro !== "activo" && (
        <span className="tag donacion" style={{ flex: "none" }}>
          {t(`membresia.estado.${estado.estadoMiembro}`)}
        </span>
      )}
      {!estado.presente && (
        <span className="roster-controls">
          <select
            className="form-input"
            aria-label={t("servicios.razonAusencia")}
            value={estado.razon}
            onChange={(e) => onRazon(id, e.target.value)}
          >
            <option value="">{t("servicios.sinRazon")}</option>
            {RAZONES_AUSENCIA.map((r) => (
              <option key={r} value={r}>{t(`servicios.razon.${r}`)}</option>
            ))}
          </select>
          {estado.razon === "otra" && (
            <input
              className="form-input"
              style={{ width: 120 }}
              placeholder={t("servicios.razonOtraPlaceholder")}
              value={estado.razonOtra}
              onChange={(e) => onRazonOtra(id, e.target.value)}
            />
          )}
          <label className="roster-followup">
            <input
              type="checkbox"
              checked={estado.seguimiento}
              onChange={(e) => onSeguimiento(id, e.target.checked)}
            />
            {t("servicios.seguimiento")}
          </label>
        </span>
      )}
    </div>
  );
});

const VISITANTE_VACIO: ServicioVisitante = {
  nombre: "", telefono: null, correo: null, invitado_por: null, primera_visita: true, notas: null,
};

interface Props {
  church: Church;
  /** null = servicio nuevo. */
  servicio: Servicio | null;
  /** Valores iniciales al crear (puente desde la Agenda). */
  prefill?: { fecha?: string; tipo?: string } | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ServicioModal({ church, servicio, prefill, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDesmarcar, setConfirmDesmarcar] = useState(false);

  const [fecha, setFecha] = useState(servicio?.fecha ?? prefill?.fecha ?? hoyLocal());
  const [tipo, setTipo] = useState(servicio?.tipo ?? prefill?.tipo ?? "dominical");
  const [dirige, setDirige] = useState(servicio?.dirige ?? "");
  const [predica, setPredica] = useState(servicio?.predica ?? "");
  const [tituloMensaje, setTituloMensaje] = useState(servicio?.titulo_mensaje ?? "");
  const [textoBiblico, setTextoBiblico] = useState(servicio?.texto_biblico ?? "");
  const [resumenMensaje, setResumenMensaje] = useState(servicio?.resumen_mensaje ?? "");
  const [participaciones, setParticipaciones] = useState<string[]>(() => (servicio ? parseNombres(servicio.participaciones) : []));
  const [temaEscuela, setTemaEscuela] = useState(servicio?.tema_escuela ?? "");
  const [maestroEscuela, setMaestroEscuela] = useState(servicio?.maestro_escuela ?? "");
  const [roster, setRoster] = useState<Roster>(new Map());
  const [rosterLoading, setRosterLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [visitantes, setVisitantes] = useState<ServicioVisitante[]>(() => (servicio ? parseVisitantes(servicio.visitantes) : []));
  const [ninos, setNinos] = useState(servicio?.ninos ?? 0);
  const [jovenes, setJovenes] = useState(servicio?.jovenes ?? 0);
  const [adultos, setAdultos] = useState(servicio?.adultos ?? 0);
  const [eventos, setEventos] = useState(servicio?.eventos ?? "");

  // Snapshot inicial serializado para detectar cambios sin guardar sin tener
  // que instrumentar cada campo.
  const inicialRef = useRef<string | null>(null);

  const serializar = useCallback((r: Roster, vs: ServicioVisitante[], campos: unknown[]) =>
    JSON.stringify([Array.from(r.entries()), vs, campos]), []);

  const camposActuales = [fecha, tipo, dirige, predica, tituloMensaje, textoBiblico, resumenMensaje,
    participaciones, temaEscuela, maestroEscuela, ninos, jovenes, adultos, eventos];

  useEffect(() => {
    let cancelado = false;
    setRosterLoading(true);
    (async () => {
      const m: Roster = new Map();
      if (servicio) {
        // Editar: cargar exactamente el snapshot guardado. Miembros cuyo
        // estado cambió después del servicio siguen aquí — es histórico.
        const rows = await getServicioAsistencia(servicio.id);
        for (const a of rows) {
          m.set(a.member_id, {
            nombre: a.nombre_snapshot,
            presente: a.presente,
            razon: a.razon ?? "",
            razonOtra: a.razon_otra ?? "",
            seguimiento: a.seguimiento,
          });
        }
      } else {
        // Nuevo: todos los miembros con estado Activo entran como ausentes;
        // la secretaria solo marca a los presentes.
        const activos = await listMembersAsistencia(church.id);
        for (const a of activos) {
          m.set(a.id, { nombre: a.nombre, presente: false, razon: "", razonOtra: "", seguimiento: false, estadoMiembro: a.estado });
        }
      }
      if (cancelado) return;
      setRoster(m);
      setRosterLoading(false);
    })().catch((e) => {
      console.error(e);
      if (!cancelado) setRosterLoading(false);
    });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [church.id, servicio?.id]);

  // El snapshot inicial se fija cuando el roster terminó de cargar.
  useEffect(() => {
    if (!rosterLoading && inicialRef.current === null) {
      inicialRef.current = serializar(roster, visitantes, camposActuales);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterLoading]);

  function hayCambios(): boolean {
    if (inicialRef.current === null) return false;
    return serializar(roster, visitantes, camposActuales) !== inicialRef.current;
  }

  function pedirCerrar() {
    if (saving) return;
    // Con un diálogo de confirmación abierto, Escape lo cierra a él (su
    // propio hook), no al modal completo.
    if (confirmClose || confirmDesmarcar) return;
    if (hayCambios()) setConfirmClose(true);
    else onClose();
  }

  useEscapeClose(pedirCerrar);

  // ----- Mutadores del roster (una sola fuente de datos) -----
  const toggle = useCallback((id: number) => {
    setRoster((r) => {
      const prev = r.get(id);
      if (!prev) return r;
      const m = new Map(r);
      // Al marcar presente se limpian razón y seguimiento (ya no está ausente);
      // al desmarcar, vuelve a Ausentes sin razón.
      m.set(id, prev.presente
        ? { ...prev, presente: false }
        : { ...prev, presente: true, razon: "", razonOtra: "", seguimiento: false });
      return m;
    });
  }, []);
  const setRazon = useCallback((id: number, v: string) => {
    setRoster((r) => {
      const prev = r.get(id);
      if (!prev) return r;
      const m = new Map(r);
      m.set(id, { ...prev, razon: v, razonOtra: v === "otra" ? prev.razonOtra : "" });
      return m;
    });
  }, []);
  const setRazonOtra = useCallback((id: number, v: string) => {
    setRoster((r) => {
      const prev = r.get(id);
      if (!prev) return r;
      const m = new Map(r);
      m.set(id, { ...prev, razonOtra: v });
      return m;
    });
  }, []);
  const setSeguimiento = useCallback((id: number, v: boolean) => {
    setRoster((r) => {
      const prev = r.get(id);
      if (!prev) return r;
      const m = new Map(r);
      m.set(id, { ...prev, seguimiento: v });
      return m;
    });
  }, []);

  // ----- Vistas derivadas -----
  const q = busqueda.trim().toLowerCase();
  const entradas = useMemo(() => Array.from(roster.entries()), [roster]);
  // La búsqueda solo oculta filas: nunca toca el estado del mapa.
  const visibles = useMemo(
    () => (q ? entradas.filter(([, e]) => e.nombre.toLowerCase().includes(q)) : entradas),
    [entradas, q]
  );
  const presentesVisibles = visibles.filter(([, e]) => e.presente);
  const ausentesVisibles = visibles.filter(([, e]) => !e.presente);
  const totalPresentes = entradas.reduce((s, [, e]) => s + (e.presente ? 1 : 0), 0);

  function marcarVisibles(presente: boolean) {
    setRoster((r) => {
      const m = new Map(r);
      for (const [id] of visibles) {
        const prev = m.get(id);
        if (!prev) continue;
        m.set(id, presente
          ? { ...prev, presente: true, razon: "", razonOtra: "", seguimiento: false }
          : { ...prev, presente: false });
      }
      return m;
    });
  }

  async function cargarActivos() {
    // Solo para servicios guardados antes del roster (snapshot vacío).
    const activos = await listMembersAsistencia(church.id);
    setRoster((r) => {
      const m = new Map(r);
      for (const a of activos) {
        if (!m.has(a.id)) m.set(a.id, { nombre: a.nombre, presente: false, razon: "", razonOtra: "", seguimiento: false, estadoMiembro: a.estado });
      }
      return m;
    });
  }

  // ----- Visitantes -----
  // Aviso de posible duplicado al pasar un visitante al padrón: guarda el
  // índice ya advertido; el segundo clic procede (patrón de dos clics).
  const [padronConfirma, setPadronConfirma] = useState<number | null>(null);

  function setVisitante(i: number, patch: Partial<ServicioVisitante>) {
    if (padronConfirma === i) setPadronConfirma(null);
    setVisitantes((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }

  /** Da de alta al visitante en Membresía (estado "visitante"), lo pasa al
   *  roster como presente y quita la fila de texto libre. El alta se escribe
   *  de inmediato; la asistencia se guarda con el servicio. */
  async function agregarAlPadron(i: number) {
    const v = visitantes[i];
    if (!v || !v.nombre.trim()) { setError(t("servicios.visitanteSinNombre")); return; }
    setError(null);
    try {
      if (padronConfirma !== i) {
        const dups = await buscarPosiblesDuplicados(church.id, {
          nombre: v.nombre, telefono: v.telefono, correo: v.correo,
        });
        if (dups.length > 0) {
          setPadronConfirma(i);
          setError(t("servicios.padronPosibleDuplicado", {
            nombres: dups.slice(0, 3).map((d) => d.nombre).join(", "),
          }));
          return;
        }
      }
      const nuevoId = await insertVisitanteComoMiembro(church.id, v, fecha || hoyLocal());
      if (nuevoId != null) {
        setRoster((r) => {
          const m = new Map(r);
          m.set(nuevoId, {
            nombre: v.nombre.trim(), presente: true, razon: "", razonOtra: "",
            seguimiento: false, estadoMiembro: "visitante",
          });
          return m;
        });
      }
      setVisitantes((vs) => vs.filter((_, j) => j !== i));
      setPadronConfirma(null);
      playSound("guardado");
      showToast(t("servicios.padronAgregado", { nombre: v.nombre.trim() }));
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
    }
  }

  async function guardar() {
    setError(null);
    if (!fecha) { setError(t("servicios.fechaObligatoria")); return; }

    // Visitante con datos pero sin nombre → error; filas totalmente vacías se descartan.
    const visitantesLimpios: ServicioVisitante[] = [];
    for (const v of visitantes) {
      const tieneDatos = [v.telefono, v.correo, v.invitado_por, v.notas].some((x) => (x ?? "").trim());
      if (!v.nombre.trim()) {
        if (tieneDatos) { setError(t("servicios.visitanteSinNombre")); return; }
        continue;
      }
      visitantesLimpios.push({
        nombre: v.nombre.trim(),
        telefono: (v.telefono ?? "").trim() || null,
        correo: (v.correo ?? "").trim() || null,
        invitado_por: (v.invitado_por ?? "").trim() || null,
        primera_visita: v.primera_visita,
        notas: (v.notas ?? "").trim() || null,
      });
    }

    // Aserción defensiva: el modelo hace imposible presente-y-ausente a la
    // vez, y el Map hace imposible duplicar; verifícalo de todas formas.
    const ids = new Set<number>();
    const asistencia: AsistenciaEntry[] = [];
    for (const [id, e] of roster) {
      if (ids.has(id)) throw new Error(`roster duplicado: ${id}`);
      ids.add(id);
      asistencia.push({
        member_id: id,
        presente: e.presente,
        razon: e.presente ? null : e.razon || null,
        razon_otra: e.presente ? null : (e.razon === "otra" ? e.razonOtra.trim() || null : null),
        seguimiento: e.presente ? false : e.seguimiento,
        nombre_snapshot: e.nombre,
      });
    }

    setSaving(true);
    try {
      const payload: NewServicio = {
        fecha,
        tipo,
        dirige: dirige.trim() || null,
        predica: predica.trim() || null,
        titulo_mensaje: tituloMensaje.trim() || null,
        texto_biblico: textoBiblico.trim() || null,
        resumen_mensaje: resumenMensaje.trim() || null,
        participaciones,
        tema_escuela: temaEscuela.trim() || null,
        maestro_escuela: maestroEscuela.trim() || null,
        asistencia,
        visitantes: visitantesLimpios,
        ninos,
        jovenes,
        adultos,
        eventos: eventos.trim() || null,
      };
      if (servicio) {
        await updateServicio(servicio.id, church.id, payload);
      } else {
        await insertServicio(church.id, payload);
      }
      playSound("guardado");
      showToast(t("servicios.toastGuardado"));
      inicialRef.current = null; // ya no hay cambios sin guardar
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const totalConteo = ninos + jovenes + adultos;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) pedirCerrar(); }}>
      <div className="modal-card" style={{ width: 760 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{servicio ? t("servicios.editarServicio") : t("servicios.nuevoServicio")}</div>
            <div className="modal-sub">{t("secretaria.servicios.sub")}</div>
          </div>
          <div className="modal-close" onClick={pedirCerrar}><IconClose /></div>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("servicios.secServicio")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("tx.colFecha")}</label>
                <input type="date" className="form-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.tipoServicio")}</label>
                <select className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS_SERVICIO.map((ti) => (
                    <option key={ti} value={ti}>{t(`servicios.tipo.${ti}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.dirige")}</label>
                <input className="form-input" value={dirige} onChange={(e) => setDirige(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.predica")}</label>
                <input className="form-input" value={predica} onChange={(e) => setPredica(e.target.value)} />
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">{t("servicios.participaciones")}</label>
              <ChipGroup catalogo={[]} prefijo="servicios" valores={participaciones} onChange={setParticipaciones} placeholder={t("servicios.agregarParticipacion")} />
            </div>
          </Seccion>

          <Seccion titulo={t("servicios.secAsistencia")}>
            {rosterLoading ? (
              <div style={{ color: "var(--text-3)", fontSize: 13, padding: "8px 0" }}>{t("common.preparando")}</div>
            ) : roster.size === 0 && !servicio ? (
              <div style={{ color: "var(--text-3)", fontSize: 13, padding: "8px 0" }}>
                {t("servicios.sinMiembrosActivos")}
              </div>
            ) : (
              <>
                <div className="tx-head" style={{ marginBottom: 10 }}>
                  <div className="search-input-wrap" style={{ flex: 1, maxWidth: 300 }}>
                    <IconSearch size={14} strokeWidth={2} />
                    <input
                      className="form-input"
                      aria-label={t("servicios.buscarMiembro")}
                      placeholder={t("servicios.buscarMiembro")}
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="btn secondary"
                      title={t("servicios.marcarTodosTooltip")}
                      disabled={ausentesVisibles.length === 0}
                      onClick={() => marcarVisibles(true)}
                    >
                      {t("servicios.marcarTodos")}
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      title={t("servicios.desmarcarTodosTooltip")}
                      disabled={presentesVisibles.length === 0}
                      onClick={() => setConfirmDesmarcar(true)}
                    >
                      {t("servicios.desmarcarTodos")}
                    </button>
                  </div>
                </div>

                <div className="roster-counters" style={{ marginBottom: 8 }}>
                  <span>{t("servicios.totalRoster")}: <b>{roster.size}</b></span>
                  <span>{t("servicios.presentes")}: <b>{totalPresentes}</b></span>
                  <span>{t("servicios.ausentesLabel")}: <b>{roster.size - totalPresentes}</b></span>
                </div>

                {roster.size === 0 && servicio ? (
                  <div style={{ color: "var(--text-3)", fontSize: 13, padding: "4px 0 8px" }}>
                    {t("servicios.servicioSinRoster")}{" "}
                    <button type="button" className="btn secondary" onClick={cargarActivos} style={{ marginLeft: 8 }}>
                      {t("servicios.cargarActivos")}
                    </button>
                  </div>
                ) : visibles.length === 0 ? (
                  <div style={{ color: "var(--text-3)", fontSize: 13, padding: "4px 0 8px" }}>
                    {t("servicios.rosterSinResultados")}
                  </div>
                ) : (
                  <div className="roster-box">
                    <div className="roster-section-head">
                      {t("servicios.presentes")} ({presentesVisibles.length})
                    </div>
                    {presentesVisibles.map(([id, e]) => (
                      <RosterRow key={id} id={id} estado={e} onToggle={toggle} onRazon={setRazon} onRazonOtra={setRazonOtra} onSeguimiento={setSeguimiento} />
                    ))}
                    {presentesVisibles.length === 0 && (
                      <div style={{ padding: "8px 12px", fontSize: 12.5, color: "var(--text-3)" }}>{t("servicios.nadieMarcado")}</div>
                    )}
                    <div className="roster-section-head">
                      {t("servicios.ausentesLabel")} ({ausentesVisibles.length})
                    </div>
                    {ausentesVisibles.map(([id, e]) => (
                      <RosterRow key={id} id={id} estado={e} onToggle={toggle} onRazon={setRazon} onRazonOtra={setRazonOtra} onSeguimiento={setSeguimiento} />
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr", marginTop: 14 }}>
              <div className="form-group">
                <label className="form-label">{t("servicios.ninos")}</label>
                <input type="number" min={0} className="form-input" value={ninos} onChange={(e) => setNinos(numeroSano(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.jovenes")}</label>
                <input type="number" min={0} className="form-input" value={jovenes} onChange={(e) => setJovenes(numeroSano(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.adultos")}</label>
                <input type="number" min={0} className="form-input" value={adultos} onChange={(e) => setAdultos(numeroSano(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.totalPresentes")}</label>
                <input className="form-input" value={totalConteo} disabled style={{ fontWeight: 700 }} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("servicios.visitantes")}>
            {visitantes.map((v, i) => (
              <div key={i} className="form-group full form-subcard">
                <div className="form-grid" style={{ marginBottom: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t("servicios.visitanteNombre")}</label>
                    <input className="form-input" value={v.nombre} onChange={(e) => setVisitante(i, { nombre: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t("servicios.visitanteInvitadoPor")} <span className="opt">{t("common.opcional")}</span></label>
                    <input className="form-input" value={v.invitado_por ?? ""} onChange={(e) => setVisitante(i, { invitado_por: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t("tesorero.telefono")} <span className="opt">{t("common.opcional")}</span></label>
                    <input className="form-input" value={v.telefono ?? ""} onChange={(e) => setVisitante(i, { telefono: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t("tesorero.correo")} <span className="opt">{t("common.opcional")}</span></label>
                    <input className="form-input" value={v.correo ?? ""} onChange={(e) => setVisitante(i, { correo: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <label className="roster-followup" style={{ fontSize: 12.5 }}>
                    <input type="checkbox" checked={v.primera_visita} onChange={(e) => setVisitante(i, { primera_visita: e.target.checked })} />
                    {t("servicios.visitantePrimeraVisita")}
                  </label>
                  <input
                    className="form-input"
                    style={{ flex: 1 }}
                    placeholder={t("servicios.visitanteNotas")}
                    value={v.notas ?? ""}
                    onChange={(e) => setVisitante(i, { notas: e.target.value })}
                  />
                  <button type="button" className="btn secondary sm" title={t("servicios.agregarAlPadronTooltip")} onClick={() => void agregarAlPadron(i)}>
                    <IconPlus size={12} /> {t("servicios.agregarAlPadron")}
                  </button>
                  <button type="button" className="modal-close" title={t("common.eliminar")} onClick={() => setVisitantes((vs) => vs.filter((_, j) => j !== i))}>
                    <IconClose size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="btn secondary" onClick={() => setVisitantes((vs) => [...vs, { ...VISITANTE_VACIO }])}>
              <IconPlus size={13} /> {t("servicios.agregarVisitante")}
            </button>
          </Seccion>

          <Seccion titulo={t("servicios.secMensaje")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("servicios.tituloMensaje")}</label>
                <input className="form-input" value={tituloMensaje} onChange={(e) => setTituloMensaje(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.textoBiblico")}</label>
                <input className="form-input" placeholder={t("servicios.textoBiblicoPlaceholder")} value={textoBiblico} onChange={(e) => setTextoBiblico(e.target.value)} />
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">{t("servicios.resumenMensaje")}</label>
              <textarea className="form-textarea" rows={3} value={resumenMensaje} onChange={(e) => setResumenMensaje(e.target.value)} />
            </div>
          </Seccion>

          <Seccion titulo={t("servicios.secEscuela")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("servicios.temaEscuela")}</label>
                <input className="form-input" value={temaEscuela} onChange={(e) => setTemaEscuela(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("servicios.maestroEscuela")}</label>
                <input className="form-input" value={maestroEscuela} onChange={(e) => setMaestroEscuela(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("servicios.secEventos")}>
            <div className="form-group full">
              <textarea
                className="form-textarea"
                rows={3}
                placeholder={t("servicios.eventosPlaceholder")}
                value={eventos}
                onChange={(e) => setEventos(e.target.value)}
              />
            </div>
          </Seccion>

          {error && <div className="field-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={pedirCerrar}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={guardar} disabled={saving || rosterLoading}>
              {saving ? t("common.guardando") : servicio ? t("common.guardarCambios") : t("servicios.guardarServicio")}
            </button>
          </div>
        </div>
      </div>

      {confirmDesmarcar && (
        <ConfirmDialog
          title={t("servicios.desmarcarTitulo")}
          message={t("servicios.desmarcarMensaje", { count: presentesVisibles.length })}
          confirmLabel={t("servicios.desmarcarTodos")}
          danger
          onConfirm={() => { marcarVisibles(false); setConfirmDesmarcar(false); }}
          onCancel={() => setConfirmDesmarcar(false)}
        />
      )}

      {confirmClose && (
        <ConfirmDialog
          title={t("servicios.cambiosSinGuardarTitulo")}
          message={t("servicios.cambiosSinGuardarMensaje")}
          confirmLabel={t("servicios.descartarCambios")}
          danger
          onConfirm={onClose}
          onCancel={() => setConfirmClose(false)}
        />
      )}
    </div>
  );
}
