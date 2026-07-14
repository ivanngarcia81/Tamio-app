import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fmtFechaCorta, memberAsistenciaStats, memberDocs, updateMemberFicha,
  type Church, type Member, type MemberAsistenciaStats, type MemberDoc, type MemberFicha,
} from "../db";
import { IconClose, IconPrinter } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { printInformeIndividual } from "../services/informes/printInforme";
import { useEscapeClose } from "../hooks/useEscapeClose";

export const MINISTERIOS = [
  "musica", "ujieres", "ensenanza", "evangelismo", "ninos", "jovenes",
  "medios", "cocina", "mantenimiento", "intercesion",
] as const;
export const INSTRUMENTOS = [
  "piano", "guitarra", "bajo", "bateria", "percusion", "metales", "voz",
] as const;
export const HABILIDADES = [
  "electricidad", "plomeria", "carpinteria", "construccion", "contabilidad",
  "informatica", "diseno", "fotografia", "conduccion", "cocina", "enfermeria",
] as const;

export const CARGOS = [
  "diacono", "anciano", "maestro", "liderJovenes", "liderDamas",
  "liderCaballeros", "ujierJefe", "misionero",
] as const;

const ESTADOS_REGISTRO = ["activo", "inactivo", "visitante", "enProceso"] as const;

function parseLista(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Etiqueta de un valor de catálogo: clave conocida → traducción; texto libre → tal cual. */
export function etiquetaCatalogo(t: (k: string) => string, prefijo: string, valor: string, catalogo: readonly string[]): string {
  return catalogo.includes(valor) ? t(`${prefijo}.${valor}`) : valor;
}

export function ChipGroup({ catalogo, prefijo, valores, onChange, placeholder }: {
  catalogo: readonly string[];
  prefijo: string;
  valores: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const [nuevo, setNuevo] = useState("");
  const extras = valores.filter((v) => !catalogo.includes(v));

  function toggle(v: string) {
    onChange(valores.includes(v) ? valores.filter((x) => x !== v) : [...valores, v]);
  }

  function agregar() {
    const v = nuevo.trim();
    if (!v || valores.includes(v)) { setNuevo(""); return; }
    onChange([...valores, v]);
    setNuevo("");
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {catalogo.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip${valores.includes(c) ? " active" : ""}`}
            onClick={() => toggle(c)}
          >
            {t(`${prefijo}.${c}`)}
          </button>
        ))}
        {extras.map((v) => (
          <button key={v} type="button" className="chip active" title={t("ficha.quitarChip")} onClick={() => toggle(v)}>
            {v} ×
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input
          className="form-input"
          style={{ flex: 1 }}
          placeholder={placeholder}
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
        />
        <button type="button" className="btn secondary" onClick={agregar} disabled={!nuevo.trim()}>
          {t("ficha.agregar")}
        </button>
      </div>
    </div>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontSize: "var(--fs-table-head)",
          fontWeight: 700,
          letterSpacing: "var(--track-caps)",
          textTransform: "uppercase",
          color: "var(--text-3)",
          paddingBottom: 8,
          borderBottom: "1px solid var(--line)",
          marginBottom: 14,
        }}
      >
        {titulo}
      </div>
      {children}
    </div>
  );
}

export function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span className="form-label" style={{ marginBottom: 0 }}>{label}</span>
      <button
        type="button"
        className={`switch${value ? " on" : ""}`}
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
      />
    </div>
  );
}

interface Props {
  church: Church;
  member: Member;
  onClose: () => void;
  onSaved: () => void;
}

/** Ficha completa del miembro: información de membresía, vida espiritual y
 *  servicio/habilidades. Los datos personales se editan con el botón Editar. */
export default function FichaMiembroModal({ church, member, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const [saving, setSaving] = useState(false);

  const [estado, setEstado] = useState(
    ESTADOS_REGISTRO.includes(member.estado_membresia as (typeof ESTADOS_REGISTRO)[number])
      ? member.estado_membresia
      : "activo"
  );
  const [fechaCongregacion, setFechaCongregacion] = useState(member.fecha_congregacion ?? "");
  const [fechaIngreso, setFechaIngreso] = useState(member.fecha_ingreso ?? "");
  const [iglesiaAnterior, setIglesiaAnterior] = useState(member.iglesia_anterior ?? "");
  const [bautizadoAgua, setBautizadoAgua] = useState(member.bautizado_agua === 1);
  const [fechaBautismoAgua, setFechaBautismoAgua] = useState(member.fecha_bautismo_agua ?? "");
  const [bautizadoEspiritu, setBautizadoEspiritu] = useState(member.bautizado_espiritu === 1);
  const [fechaBautismoEspiritu, setFechaBautismoEspiritu] = useState(member.fecha_bautismo_espiritu ?? "");
  const [cursoMembresia, setCursoMembresia] = useState(member.curso_membresia === 1);
  const [ministerios, setMinisterios] = useState<string[]>(() => parseLista(member.ministerios));
  const [cargos, setCargos] = useState<string[]>(() => parseLista(member.cargos));
  const [ministeriosInteres, setMinisteriosInteres] = useState<string[]>(() => parseLista(member.ministerios_interes));
  const [instrumentos, setInstrumentos] = useState<string[]>(() => parseLista(member.instrumentos));
  const [habilidades, setHabilidades] = useState<string[]>(() => parseLista(member.habilidades));
  const [disponibilidad, setDisponibilidad] = useState(member.disponibilidad ?? "");
  const [interesServir, setInteresServir] = useState(member.interes_servir === 1);

  const esBaja = member.activo === 0;

  // Estadísticas de asistencia: derivadas de los servicios guardados
  // (snapshots), nunca almacenadas por separado.
  const [asistencia, setAsistencia] = useState<MemberAsistenciaStats | null>(null);
  const [docs, setDocs] = useState<MemberDoc[] | null>(null);
  useEffect(() => {
    let cancelado = false;
    memberAsistenciaStats(member.id, church.id)
      .then((s) => { if (!cancelado) setAsistencia(s); })
      .catch(console.error);
    memberDocs(member.id, church.id)
      .then((d) => { if (!cancelado) setDocs(d); })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [member.id, church.id]);

  async function guardar() {
    setSaving(true);
    try {
      const ficha: MemberFicha = {
        estado_membresia: estado,
        cargos,
        fecha_congregacion: fechaCongregacion || null,
        fecha_ingreso: fechaIngreso || null,
        iglesia_anterior: iglesiaAnterior.trim() || null,
        bautizado_agua: bautizadoAgua,
        fecha_bautismo_agua: bautizadoAgua ? fechaBautismoAgua || null : null,
        bautizado_espiritu: bautizadoEspiritu,
        fecha_bautismo_espiritu: bautizadoEspiritu ? fechaBautismoEspiritu || null : null,
        curso_membresia: cursoMembresia,
        ministerios,
        ministerios_interes: ministeriosInteres,
        instrumentos,
        habilidades,
        disponibilidad: disponibilidad.trim() || null,
        interes_servir: interesServir,
      };
      await updateMemberFicha(member.id, church.id, ficha);
      playSound("guardado");
      showToast(t("ficha.toastGuardada"));
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">{member.nombre}</div>
            <div className="modal-sub">{t("ficha.sub")}</div>
          </div>
          <div className="modal-close" onClick={onClose}><IconClose /></div>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("ficha.secMembresia")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("ficha.fechaCongregacion")}</label>
                <input type="date" className="form-input" value={fechaCongregacion} onChange={(e) => setFechaCongregacion(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("ficha.fechaIngreso")}</label>
                <input type="date" className="form-input" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("membresia.colEstado")}</label>
                {esBaja ? (
                  <input className="form-input" value={t("ficha.estadoBajaNota")} disabled />
                ) : (
                  <select className="form-input" value={estado} onChange={(e) => setEstado(e.target.value)}>
                    {ESTADOS_REGISTRO.map((es) => (
                      <option key={es} value={es}>{t(`membresia.estado.${es}`)}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">
                  {t("ficha.iglesiaAnterior")} <span className="opt">{t("ficha.siAplica")}</span>
                </label>
                <input className="form-input" value={iglesiaAnterior} onChange={(e) => setIglesiaAnterior(e.target.value)} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("ficha.secEspiritual")}>
            <div className="form-grid">
              <div className="form-group">
                <SwitchRow label={t("ficha.bautizadoAgua")} value={bautizadoAgua} onChange={setBautizadoAgua} />
                {bautizadoAgua && (
                  <input
                    type="date"
                    className="form-input"
                    style={{ marginTop: 8 }}
                    value={fechaBautismoAgua}
                    onChange={(e) => setFechaBautismoAgua(e.target.value)}
                  />
                )}
              </div>
              <div className="form-group">
                <SwitchRow label={t("ficha.bautizadoEspiritu")} value={bautizadoEspiritu} onChange={setBautizadoEspiritu} />
                {bautizadoEspiritu && (
                  <>
                    <input
                      type="date"
                      className="form-input"
                      style={{ marginTop: 8 }}
                      value={fechaBautismoEspiritu}
                      onChange={(e) => setFechaBautismoEspiritu(e.target.value)}
                    />
                    <span className="form-label opt" style={{ fontWeight: 500, color: "var(--text-3)" }}>
                      {t("ficha.fechaAproximada")}
                    </span>
                  </>
                )}
              </div>
              <div className="form-group full">
                <SwitchRow label={t("ficha.cursoMembresia")} value={cursoMembresia} onChange={setCursoMembresia} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("ficha.secServicio")}>
            <div className="form-group full">
              <label className="form-label">{t("ficha.ministerios")}</label>
              <ChipGroup
                catalogo={MINISTERIOS}
                prefijo="ficha.ministerio"
                valores={ministerios}
                onChange={setMinisterios}
                placeholder={t("ficha.otroMinisterio")}
              />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("ficha.cargosLabel")}</label>
              <ChipGroup
                catalogo={CARGOS}
                prefijo="ficha.cargo"
                valores={cargos}
                onChange={setCargos}
                placeholder={t("ficha.otroCargo")}
              />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("ficha.ministeriosInteres")}</label>
              <ChipGroup
                catalogo={MINISTERIOS}
                prefijo="ficha.ministerio"
                valores={ministeriosInteres}
                onChange={setMinisteriosInteres}
                placeholder={t("ficha.otroMinisterio")}
              />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("ficha.instrumentos")}</label>
              <ChipGroup
                catalogo={INSTRUMENTOS}
                prefijo="ficha.instrumento"
                valores={instrumentos}
                onChange={setInstrumentos}
                placeholder={t("ficha.otroInstrumento")}
              />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("ficha.habilidades")}</label>
              <ChipGroup
                catalogo={HABILIDADES}
                prefijo="ficha.habilidad"
                valores={habilidades}
                onChange={setHabilidades}
                placeholder={t("ficha.otraHabilidad")}
              />
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("ficha.disponibilidad")}</label>
                <input
                  className="form-input"
                  placeholder={t("ficha.disponibilidadPlaceholder")}
                  value={disponibilidad}
                  onChange={(e) => setDisponibilidad(e.target.value)}
                />
              </div>
              <div className="form-group">
                <SwitchRow label={t("ficha.interesServir")} value={interesServir} onChange={setInteresServir} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("ficha.secAsistencia")}>
            {!asistencia ? (
              <div style={{ color: "var(--text-3)", fontSize: 13 }}>{t("common.preparando")}</div>
            ) : asistencia.enRoster === 0 ? (
              <div style={{ color: "var(--text-3)", fontSize: 13 }}>{t("ficha.sinAsistencias")}</div>
            ) : (
              <>
                <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <span className="form-label">{t("ficha.ultimaAsistencia")}</span>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {asistencia.ultimaAsistencia ? fmtFechaCorta(asistencia.ultimaAsistencia) : "—"}
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <span className="form-label">{t("ficha.pctAsistencia")}</span>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {asistencia.pct !== null ? `${asistencia.pct}%` : "—"}
                      <span style={{ fontWeight: 500, color: "var(--text-3)", marginLeft: 6, fontSize: 12 }}>
                        {t("ficha.deServicios", { asistencias: asistencia.asistencias, total: asistencia.enRoster })}
                      </span>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <span className="form-label">{t("ficha.ausenciasConsecutivas")}</span>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {asistencia.rachaAusencias}
                      {asistencia.rachaJustificadas > 0 && (
                        <span style={{ fontWeight: 500, color: "var(--text-3)", marginLeft: 6, fontSize: 12 }}>
                          {t("ficha.justificadasEnRacha", { count: asistencia.rachaJustificadas })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", maxHeight: 170, overflowY: "auto" }}>
                  {asistencia.historial.slice(0, 12).map((h, i) => (
                    <div key={i} className="roster-row" style={{ cursor: "default" }}>
                      <span style={{ fontSize: 12.5, color: "var(--text-2)", width: 90, flex: "none", fontVariantNumeric: "tabular-nums" }}>
                        {fmtFechaCorta(h.fecha)}
                      </span>
                      <span className="roster-name" style={{ cursor: "default", fontWeight: 500 }}>
                        {t(`servicios.tipo.${h.tipo}`)}
                      </span>
                      {h.presente ? (
                        <span className="tag activo">{t("ficha.presente")}</span>
                      ) : (
                        <span className="tag baja" title={h.razon === "otra" ? h.razon_otra ?? undefined : undefined}>
                          {t("ficha.ausente")}
                          {h.razon ? ` · ${t(`servicios.razon.${h.razon}`)}` : ""}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </Seccion>

          <Seccion titulo={t("ficha.secHistorial")}>
            {(() => {
              let cambios: { de: string; a: string; fecha: string }[] = [];
              let notasAdmin: { fecha: string; texto: string }[] = [];
              try { cambios = JSON.parse(member.historial_estados); } catch { /* noop */ }
              try { notasAdmin = JSON.parse(member.seguimiento_notas); } catch { /* noop */ }
              const nombreEstado = (k: string) =>
                ["activo", "inactivo", "visitante", "enProceso", "trasladado", "retirado", "fallecido", "baja"].includes(k)
                  ? t(`membresia.estado.${k}`) : k;
              return (
                <div style={{ fontSize: 13 }}>
                  <div style={{ color: "var(--text-3)", marginBottom: cambios.length || notasAdmin.length ? 12 : 0 }}>
                    {t("ficha.registradoEl", { fecha: member.created_at ? member.created_at.slice(0, 10) : "—" })}
                  </div>
                  {cambios.length > 0 && (
                    <div style={{ marginBottom: notasAdmin.length ? 12 : 0 }}>
                      <div className="form-label" style={{ marginBottom: 6 }}>{t("ficha.cambiosEstado")}</div>
                      {cambios.slice().reverse().map((c, i) => (
                        <div key={i} className="roster-row" style={{ cursor: "default" }}>
                          <span style={{ fontSize: 12, color: "var(--text-3)", width: 90, flex: "none", fontVariantNumeric: "tabular-nums" }}>{c.fecha.slice(0, 10)}</span>
                          <span className="roster-name" style={{ cursor: "default" }}>
                            {c.de ? `${nombreEstado(c.de)} → ${nombreEstado(c.a)}` : nombreEstado(c.a)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {notasAdmin.length > 0 && (
                    <div>
                      <div className="form-label" style={{ marginBottom: 6 }}>{t("ficha.notasAdmin")}</div>
                      {notasAdmin.slice().reverse().map((n, i) => (
                        <div key={i} style={{ padding: "6px 0", borderBottom: i < notasAdmin.length - 1 ? "1px solid var(--line-soft)" : "none" }}>
                          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{n.fecha.slice(0, 16).replace("T", " ")}</div>
                          <div>{n.texto}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </Seccion>

          <Seccion titulo={t("ficha.secDocumentos")}>
            {!docs ? (
              <div style={{ color: "var(--text-3)", fontSize: 13 }}>{t("common.preparando")}</div>
            ) : docs.length === 0 ? (
              <div style={{ color: "var(--text-3)", fontSize: 13 }}>{t("ficha.sinDocumentos")}</div>
            ) : (
              <div style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", maxHeight: 170, overflowY: "auto" }}>
                {docs.slice(0, 12).map((d, i) => (
                  <div key={i} className="roster-row" style={{ cursor: "default" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, width: 130, flex: "none", fontVariantNumeric: "tabular-nums" }}>
                      {d.folio}
                    </span>
                    <span className="roster-name" style={{ cursor: "default", fontWeight: 500 }}>
                      {t(`ficha.docClase.${d.clase}`)}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-3)", flex: "none" }}>{fmtFechaCorta(d.fecha)}</span>
                    <span className="tag administracion">
                      {t(
                        d.clase === "carta"
                          ? `cartas.estado.${d.estado}`
                          : d.clase === "solicitud"
                            ? `solicitudes.estado.${d.estado}`
                            : d.clase === "salida"
                              ? `traslados.estadoTS.${d.estado}`
                              : `traslados.estadoTE.${d.estado}`
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Seccion>
        </div>

        <div className="modal-footer">
          <button
            className="btn secondary"
            onClick={() => printInformeIndividual(church, member).catch((e) => showToast(t("common.noSePudoImprimir", { error: String(e) })))}
          >
            <IconPrinter size={13} /> {t("ficha.generarInforme")}
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={onClose}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={guardar} disabled={saving}>
              {saving ? t("common.guardando") : t("common.guardarCambios")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
