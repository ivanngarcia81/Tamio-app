import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  insertCarta, updateCarta,
  type Carta, type CartaFirma, type Church, type Member, type NewCarta, type Plantilla,
} from "../db";
import { aplicarVariables, contextoDe } from "../services/cartas/plantillas";
import { parseFirmas, buildCartaHtml, abrirCartaParaImprimir } from "../services/cartas/cartaDoc";
import { Seccion } from "./FichaMiembroModal";
import ConfirmDialog from "./ConfirmDialog";
import { IconClose, IconPrinter, IconSparkles, IconWarn } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { iaHabilitada, redactarCarta } from "../ia";

export const TIPOS_CARTA = [
  "recomendacion", "certificacion", "constanciaActivo", "buenaConducta", "presentacion",
  "invitacion", "agradecimiento", "autorizacion", "solicitud", "nombramiento",
  "reconocimiento", "constanciaServicio", "traslado", "personalizada",
] as const;

export const DESTINATARIOS = ["miembro", "iglesia", "pastor", "institucion", "externo", "personalizado"] as const;

export const ESTADOS_CARTA = [
  "borrador", "preparacion", "revision", "firma", "aprobada", "lista", "entregada", "archivada", "cancelada",
] as const;

const ROLES_FIRMA = ["pastor", "secretaria", "presidente", "tesorero", "otro"] as const;
type RolFirma = (typeof ROLES_FIRMA)[number];

function hoyLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Valores iniciales al crear una carta desde una solicitud. */
export interface CartaPrefill {
  tipo?: string;
  destinatario_tipo?: string;
  member_id?: number | null;
  destinatario_nombre?: string;
  asunto?: string;
}

interface Props {
  church: Church;
  /** null = carta nueva. */
  carta: Carta | null;
  members: Member[];
  /** Ref que el padre consulta para advertir antes de cambiar de pestaña. */
  dirtyRef: React.MutableRefObject<boolean>;
  onSaved: (carta: Carta | null) => void;
  prefill?: CartaPrefill | null;
  /** Folio de la solicitud vinculada, solo informativo. */
  vinculo?: string | null;
  /** Plantillas activas disponibles para "Usar plantilla…". */
  plantillas?: Plantilla[];
}

export default function CartaEditor({ church, carta, members, dirtyRef, onSaved, prefill, vinculo, plantillas }: Props) {
  const { t, i18n } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmEntrega, setConfirmEntrega] = useState(false);
  const [pendingPlantilla, setPendingPlantilla] = useState<Plantilla | null>(null);
  const [iaAbierta, setIaAbierta] = useState(false);
  const [iaPuntos, setIaPuntos] = useState("");
  const [iaGenerando, setIaGenerando] = useState(false);
  const [iaError, setIaError] = useState<string | null>(null);

  const [tipo, setTipo] = useState(carta?.tipo ?? prefill?.tipo ?? "recomendacion");
  const [fechaEmision, setFechaEmision] = useState(carta?.fecha_emision ?? hoyLocal());
  const [lugarEmision, setLugarEmision] = useState(carta?.lugar_emision ?? church.ciudad ?? "");
  const [destTipo, setDestTipo] = useState(carta?.destinatario_tipo ?? prefill?.destinatario_tipo ?? "miembro");
  const [memberId, setMemberId] = useState<number | null>(carta?.member_id ?? prefill?.member_id ?? null);
  const [destNombre, setDestNombre] = useState(carta?.destinatario_nombre ?? prefill?.destinatario_nombre ?? "");
  const [destDireccion, setDestDireccion] = useState(carta?.destinatario_direccion ?? "");
  const [asunto, setAsunto] = useState(carta?.asunto ?? prefill?.asunto ?? "");
  const [saludo, setSaludo] = useState(carta?.saludo ?? "");
  const [despedida, setDespedida] = useState(carta?.despedida ?? "");
  const [observaciones, setObservaciones] = useState(carta?.observaciones ?? "");
  const [estado, setEstado] = useState(carta?.estado ?? "borrador");
  const [entregadaA, setEntregadaA] = useState(carta?.entregada_a ?? "");
  const [fechaEntrega, setFechaEntrega] = useState(carta?.fecha_entrega ?? "");
  const [firmas, setFirmas] = useState<CartaFirma[]>(() => {
    if (carta) return parseFirmas(carta.firmas);
    // De inicio: pastor y secretaria desde Ajustes, sin firmar.
    const iniciales: CartaFirma[] = [];
    if (church.pastor_nombre) {
      iniciales.push({ rol: "pastor", nombre: church.pastor_nombre, cargo: church.pastor_cargo ?? t("rol.pastor"), firmado: false, fecha: null });
    }
    if (church.secretaria_nombre) {
      iniciales.push({ rol: "secretaria", nombre: church.secretaria_nombre, cargo: church.secretaria_cargo ?? t("cartas.rolSecretaria"), firmado: false, fecha: null });
    }
    return iniciales;
  });

  const cuerpoRef = useRef<HTMLDivElement>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty, dirtyRef]);

  useEffect(() => {
    if (cuerpoRef.current) cuerpoRef.current.innerHTML = carta?.cuerpo_html ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carta?.id]);

  const miembroSel = useMemo(() => members.find((m) => m.id === memberId) ?? null, [members, memberId]);

  // Datos institucionales incompletos → advertencia con enlace a Ajustes.
  const faltanDatos = !church.direccion || !church.telefono || !church.secretaria_nombre;

  function marcar<T>(setter: (v: T) => void) {
    return (v: T) => { setDirty(true); setter(v); };
  }

  function cmd(comando: string) {
    cuerpoRef.current?.focus();
    document.execCommand(comando);
    setDirty(true);
  }

  function insertar(texto: string) {
    cuerpoRef.current?.focus();
    document.execCommand("insertText", false, texto);
    setDirty(true);
  }

  /** Aplica la plantilla con las variables resueltas al momento. */
  function aplicarPlantilla(p: Plantilla) {
    const ctx = contextoDe(church, {
      miembro: miembroSel,
      folio: carta?.folio ?? t("cartas.folioPendiente"),
      fechaEmision,
    });
    setTipo(p.tipo);
    setAsunto(aplicarVariables(p.asunto ?? "", ctx));
    setSaludo(aplicarVariables(p.saludo ?? "", ctx));
    setDespedida(aplicarVariables(p.despedida ?? "", ctx));
    if (cuerpoRef.current) cuerpoRef.current.innerHTML = aplicarVariables(p.cuerpo_html, ctx);
    setDirty(true);
    setPendingPlantilla(null);
  }

  function pedirAplicarPlantilla(p: Plantilla) {
    // Si ya hay contenido escrito, aplicar la plantilla lo reemplazaría.
    const hayContenido = (cuerpoRef.current?.textContent ?? "").trim().length > 0;
    if (hayContenido) setPendingPlantilla(p);
    else aplicarPlantilla(p);
  }

  async function generarConIA() {
    const puntos = iaPuntos.trim();
    if (!puntos) { setIaError(t("cartas.ia.vacio")); return; }
    setIaGenerando(true);
    setIaError(null);
    try {
      const html = await redactarCarta({
        tipo,
        puntos,
        iglesia: church.nombre,
        destinatario: destTipo === "miembro" ? (miembroSel?.nombre ?? "") : destNombre.trim(),
        pastor: church.pastor_nombre ?? "",
        idioma: i18n.language?.startsWith("en") ? "en" : "es",
      });
      if (cuerpoRef.current) cuerpoRef.current.innerHTML = html;
      setDirty(true);
      setIaAbierta(false);
      setIaPuntos("");
      playSound("guardado");
    } catch (e) {
      setIaError(t("cartas.ia.error", { error: String((e as { message?: string })?.message ?? e) }));
    } finally {
      setIaGenerando(false);
    }
  }

  function nombreFirma(rol: RolFirma): { nombre: string; cargo: string } {
    if (rol === "pastor") return { nombre: church.pastor_nombre ?? "", cargo: church.pastor_cargo ?? t("rol.pastor") };
    if (rol === "secretaria") return { nombre: church.secretaria_nombre ?? "", cargo: church.secretaria_cargo ?? t("cartas.rolSecretaria") };
    if (rol === "tesorero") return { nombre: church.tesorero_nombre ?? "", cargo: church.tesorero_cargo ?? t("rol.tesorero") };
    if (rol === "presidente") return { nombre: "", cargo: t("cartas.rolPresidente") };
    return { nombre: "", cargo: "" };
  }

  function toggleFirma(rol: RolFirma) {
    setDirty(true);
    setFirmas((fs) => {
      const existente = fs.find((f) => f.rol === rol);
      if (existente) return fs.filter((f) => f.rol !== rol);
      const base = nombreFirma(rol);
      return [...fs, { rol, nombre: base.nombre, cargo: base.cargo, firmado: false, fecha: null }];
    });
  }

  function setFirma(rol: string, patch: Partial<CartaFirma>) {
    setDirty(true);
    setFirmas((fs) => fs.map((f) => (f.rol === rol ? { ...f, ...patch } : f)));
  }

  function payloadActual(): NewCarta | null {
    setError(null);
    const nombre = destTipo === "miembro" ? (miembroSel?.nombre ?? "") : destNombre.trim();
    if (!nombre) { setError(t("cartas.destinatarioObligatorio")); return null; }
    if (!fechaEmision) { setError(t("cartas.fechaObligatoria")); return null; }
    if (estado === "entregada" && fechaEntrega && fechaEntrega < fechaEmision) {
      setError(t("cartas.entregaAntesDeEmision")); return null;
    }
    return {
      tipo,
      fecha_emision: fechaEmision,
      lugar_emision: lugarEmision.trim() || null,
      destinatario_tipo: destTipo,
      member_id: destTipo === "miembro" ? memberId : null,
      destinatario_nombre: nombre,
      destinatario_direccion: destDireccion.trim() || null,
      asunto: asunto.trim() || null,
      saludo: saludo.trim() || null,
      cuerpo_html: cuerpoRef.current?.innerHTML ?? "",
      despedida: despedida.trim() || null,
      firmas,
      observaciones: observaciones.trim() || null,
      estado,
      entregada_a: estado === "entregada" ? entregadaA.trim() || null : null,
      fecha_entrega: estado === "entregada" ? fechaEntrega || null : null,
    };
  }

  const firmasPendientes = firmas.some((f) => !f.firmado);

  async function guardar(confirmado = false) {
    const payload = payloadActual();
    if (!payload) return;
    // No marcar entregada sin advertir si hay firmas pendientes.
    if (payload.estado === "entregada" && firmasPendientes && !confirmado) {
      setConfirmEntrega(true);
      return;
    }
    setSaving(true);
    try {
      if (carta) {
        await updateCarta(carta.id, church.id, payload, carta.estado);
        playSound("guardado");
        showToast(t("cartas.toastGuardada"));
        setDirty(false);
        onSaved(null);
      } else {
        const creada = await insertCarta(church.id, payload);
        playSound("guardado");
        showToast(t("cartas.toastCreada", { folio: creada?.folio ?? "" }));
        setDirty(false);
        onSaved(creada);
      }
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
    } finally {
      setSaving(false);
    }
  }

  async function generarHtml(): Promise<string> {
    return buildCartaHtml(
      church,
      {
        folio: carta?.folio ?? t("cartas.folioPendiente"),
        fecha_emision: fechaEmision,
        lugar_emision: lugarEmision.trim() || null,
        destinatario_nombre: destTipo === "miembro" ? (miembroSel?.nombre ?? "") : destNombre.trim(),
        destinatario_direccion: destDireccion.trim() || null,
        asunto: asunto.trim() || null,
        saludo: saludo.trim() || null,
        cuerpo_html: cuerpoRef.current?.innerHTML ?? "",
        despedida: despedida.trim() || null,
      },
      firmas
    );
  }

  async function verPrevia() {
    setPreview(await generarHtml());
  }

  async function imprimir() {
    try {
      const html = await generarHtml();
      await abrirCartaParaImprimir(html, carta?.folio ?? "carta-borrador");
    } catch (e) {
      showToast(t("common.noSePudoImprimir", { error: String(e) }));
    }
  }

  return (
    <div className="card pad-lg enter">
      {vinculo && (
        <div style={{ marginBottom: 14 }}>
          <span className="tag donacion">{t("cartas.vinculadaA", { folio: vinculo })}</span>
        </div>
      )}
      {faltanDatos && (
        <div className="form-warning" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <IconWarn size={15} />
          <span>
            {t("cartas.faltanDatosInstitucionales")}{" "}
            <Link to="/configuracion">{t("cartas.irAjustes")}</Link>
          </span>
        </div>
      )}

      <Seccion titulo={t("cartas.secDocumento")}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">{t("cartas.tipoCarta")}</label>
            <select className="form-input" value={tipo} onChange={(e) => marcar(setTipo)(e.target.value)}>
              {TIPOS_CARTA.map((ti) => (
                <option key={ti} value={ti}>{t(`cartas.tipoDoc.${ti}`)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t("cartas.numeroInterno")}</label>
            <input className="form-input" value={carta?.folio ?? t("cartas.folioPendiente")} disabled />
          </div>
          <div className="form-group">
            <label className="form-label">{t("cartas.fechaEmision")}</label>
            <input type="date" className="form-input" value={fechaEmision} onChange={(e) => marcar(setFechaEmision)(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t("cartas.lugarEmision")}</label>
            <input className="form-input" value={lugarEmision} onChange={(e) => marcar(setLugarEmision)(e.target.value)} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo={t("cartas.secDestinatario")}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">{t("cartas.tipoDestinatario")}</label>
            <select className="form-input" value={destTipo} onChange={(e) => marcar(setDestTipo)(e.target.value)}>
              {DESTINATARIOS.map((d) => (
                <option key={d} value={d}>{t(`cartas.destinatario.${d}`)}</option>
              ))}
            </select>
          </div>
          {destTipo === "miembro" ? (
            <div className="form-group">
              <label className="form-label">{t("cartas.miembro")}</label>
              <select
                className="form-input"
                value={memberId ?? ""}
                onChange={(e) => marcar(setMemberId)(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">{t("cartas.eligeMiembro")}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">{t("cartas.nombreDestinatario")}</label>
              <input className="form-input" value={destNombre} onChange={(e) => marcar(setDestNombre)(e.target.value)} />
            </div>
          )}
          <div className="form-group full">
            <label className="form-label">{t("cartas.direccionDestinatario")} <span className="opt">{t("common.opcional")}</span></label>
            <input className="form-input" value={destDireccion} onChange={(e) => marcar(setDestDireccion)(e.target.value)} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo={t("cartas.secContenido")}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">{t("cartas.asunto")}</label>
            <input className="form-input" value={asunto} onChange={(e) => marcar(setAsunto)(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t("cartas.saludo")}</label>
            <input className="form-input" placeholder={t("cartas.saludoPlaceholder")} value={saludo} onChange={(e) => marcar(setSaludo)(e.target.value)} />
          </div>
        </div>

        {(plantillas ?? []).length > 0 && (
          <div className="form-group full">
            <label className="form-label">{t("plantillas.usarPlantilla")}</label>
            <select
              className="form-input"
              value=""
              onChange={(e) => {
                const p = (plantillas ?? []).find((x) => x.id === Number(e.target.value));
                if (p) pedirAplicarPlantilla(p);
                e.target.value = "";
              }}
            >
              <option value="">{t("plantillas.elegirPlantilla")}</option>
              {(plantillas ?? [])
                .slice()
                .sort((a, b) => (a.tipo === tipo ? -1 : 0) - (b.tipo === tipo ? -1 : 0) || (b.predeterminada - a.predeterminada))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.tipo === tipo && p.predeterminada === 1 ? ` — ${t("plantillas.predeterminadaBadge")}` : ""}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div className="form-group full">
          <label className="form-label">{t("cartas.cuerpo")}</label>
          <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn secondary" style={{ fontWeight: 800, minWidth: 34 }} title={t("cartas.negrita")} onClick={() => cmd("bold")}>B</button>
            <button type="button" className="btn secondary" style={{ fontStyle: "italic", minWidth: 34 }} title={t("cartas.cursiva")} onClick={() => cmd("italic")}>I</button>
            <button type="button" className="btn secondary" title={t("cartas.lista")} onClick={() => cmd("insertUnorderedList")}>• —</button>
            <button type="button" className="btn secondary" title={t("cartas.listaNum")} onClick={() => cmd("insertOrderedList")}>1. —</button>
            <button type="button" className="btn secondary" title={t("cartas.alinearIzq")} onClick={() => cmd("justifyLeft")}>⇤</button>
            <button type="button" className="btn secondary" title={t("cartas.alinearCentro")} onClick={() => cmd("justifyCenter")}>↔</button>
            <button type="button" className="btn secondary" title={t("cartas.alinearDer")} onClick={() => cmd("justifyRight")}>⇥</button>
            <select
              className="form-input"
              style={{ width: "auto", padding: "6px 10px" }}
              value=""
              aria-label={t("cartas.insertarDato")}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                if (v === "fecha") insertar(new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }));
                if (v === "iglesia") insertar(church.nombre);
                if (v === "pastor") insertar(church.pastor_nombre ?? "");
                if (v === "secretaria") insertar(church.secretaria_nombre ?? "");
                if (v === "miembro") insertar(miembroSel?.nombre ?? "");
                if (v === "fechaMembresia") insertar(miembroSel?.fecha_ingreso ?? "");
                if (v === "fechaCongregacion") insertar(miembroSel?.fecha_congregacion ?? "");
                e.target.value = "";
              }}
            >
              <option value="">{t("cartas.insertarDato")}</option>
              <option value="fecha">{t("cartas.varFecha")}</option>
              <option value="iglesia">{t("cartas.varIglesia")}</option>
              <option value="pastor">{t("cartas.varPastor")}</option>
              <option value="secretaria">{t("cartas.varSecretaria")}</option>
              {miembroSel && <option value="miembro">{t("cartas.varMiembro")}</option>}
              {miembroSel?.fecha_ingreso && <option value="fechaMembresia">{t("cartas.varFechaMembresia")}</option>}
              {miembroSel?.fecha_congregacion && <option value="fechaCongregacion">{t("cartas.varFechaCongregacion")}</option>}
            </select>
            {iaHabilitada && (
              <button
                type="button"
                className="btn ia"
                style={{ marginLeft: "auto" }}
                title={t("cartas.ia.boton")}
                onClick={() => { setIaError(null); setIaAbierta(true); }}
              >
                <IconSparkles size={14} /> {t("cartas.ia.boton")}
              </button>
            )}
          </div>
          <div
            ref={cuerpoRef}
            contentEditable
            role="textbox"
            aria-multiline="true"
            aria-label={t("cartas.cuerpo")}
            className="form-textarea"
            style={{ minHeight: 180, lineHeight: 1.6, overflowY: "auto" }}
            onInput={() => setDirty(true)}
          />
        </div>

        <div className="form-group full">
          <label className="form-label">{t("cartas.despedida")}</label>
          <input className="form-input" placeholder={t("cartas.despedidaPlaceholder")} value={despedida} onChange={(e) => marcar(setDespedida)(e.target.value)} />
        </div>
      </Seccion>

      <Seccion titulo={t("cartas.secFirmas")}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {ROLES_FIRMA.map((rol) => (
            <button
              key={rol}
              type="button"
              className={`chip${firmas.some((f) => f.rol === rol) ? " active" : ""}`}
              onClick={() => toggleFirma(rol)}
            >
              {t(`cartas.firmaRol.${rol}`)}
            </button>
          ))}
        </div>
        {firmas.map((f) => (
          <div key={f.rol} className="form-grid" style={{ gridTemplateColumns: "1fr 1fr auto", alignItems: "end" }}>
            <div className="form-group">
              <label className="form-label">{t("usuarios.colNombre")} — {t(`cartas.firmaRol.${f.rol}`)}</label>
              <input className="form-input" value={f.nombre} onChange={(e) => setFirma(f.rol, { nombre: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t("tesorero.cargo")}</label>
              <input className="form-input" value={f.cargo} onChange={(e) => setFirma(f.rol, { cargo: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="roster-followup" style={{ fontSize: 12.5, paddingBottom: 10 }}>
                <input type="checkbox" checked={f.firmado} onChange={(e) => setFirma(f.rol, { firmado: e.target.checked })} />
                {t("cartas.firmado")}
              </label>
            </div>
          </div>
        ))}
      </Seccion>

      <Seccion titulo={t("cartas.secEstado")}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">{t("membresia.colEstado")}</label>
            <select className="form-input" value={estado} onChange={(e) => marcar(setEstado)(e.target.value)}>
              {ESTADOS_CARTA.map((es) => (
                <option key={es} value={es}>{t(`cartas.estado.${es}`)}</option>
              ))}
            </select>
          </div>
          {estado === "entregada" && (
            <>
              <div className="form-group">
                <label className="form-label">{t("cartas.entregadaA")}</label>
                <input className="form-input" value={entregadaA} onChange={(e) => marcar(setEntregadaA)(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("cartas.fechaEntrega")}</label>
                <input type="date" className="form-input" min={fechaEmision} value={fechaEntrega} onChange={(e) => marcar(setFechaEntrega)(e.target.value)} />
              </div>
            </>
          )}
          <div className="form-group full">
            <label className="form-label">{t("cartas.observaciones")} <span className="opt">{t("cartas.noSeImprime")}</span></label>
            <textarea className="form-textarea" rows={2} value={observaciones} onChange={(e) => marcar(setObservaciones)(e.target.value)} />
          </div>
        </div>
      </Seccion>

      {error && <div className="field-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button className="btn secondary" onClick={verPrevia}>{t("cartas.vistaPrevia")}</button>
        <button className="btn secondary" onClick={imprimir}>
          <IconPrinter size={13} /> {t("cartas.imprimirPdf")}
        </button>
        <button className="btn primary" onClick={() => guardar()} disabled={saving}>
          {saving ? t("common.guardando") : carta ? t("common.guardarCambios") : t("cartas.guardarBorrador")}
        </button>
      </div>

      {preview && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPreview(null); }}>
          <div className="modal-card" style={{ width: 900, height: "92vh", display: "flex", flexDirection: "column" }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{t("cartas.vistaPrevia")}</div>
                <div className="modal-sub">{t("cartas.vistaPreviaSub")}</div>
              </div>
              <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={() => setPreview(null)}><IconClose /></button>
            </div>
            <iframe title={t("cartas.vistaPrevia")} srcDoc={preview} style={{ flex: 1, border: "none", background: "#f0f0f0" }} />
          </div>
        </div>
      )}

      {pendingPlantilla && (
        <ConfirmDialog
          title={t("plantillas.reemplazarTitulo")}
          message={t("plantillas.reemplazarMensaje", { nombre: pendingPlantilla.nombre })}
          confirmLabel={t("plantillas.aplicar")}
          danger
          onConfirm={() => aplicarPlantilla(pendingPlantilla)}
          onCancel={() => setPendingPlantilla(null)}
        />
      )}

      {iaAbierta && (
        <div className="modal-overlay hoja-ia" onClick={(e) => { if (e.target === e.currentTarget && !iaGenerando) setIaAbierta(false); }}>
          <div className="modal-card hoja-ia" style={{ width: 560, maxWidth: "94vw" }}>
            <div className="modal-header">
              <div>
                <div className="modal-title modal-title-ia"><IconSparkles size={17} /> {t("cartas.ia.titulo")}</div>
                <div className="modal-sub">{t("cartas.ia.sub")}</div>
              </div>
              <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={() => { if (!iaGenerando) setIaAbierta(false); }}><IconClose /></button>
            </div>
            <div className="ia-cuerpo">
              <textarea
                className="form-textarea"
                rows={6}
                autoFocus
                placeholder={t("cartas.ia.placeholder")}
                value={iaPuntos}
                onChange={(e) => setIaPuntos(e.target.value)}
                disabled={iaGenerando}
              />
              {(cuerpoRef.current?.textContent ?? "").trim().length > 0 && (
                <div className="form-warning" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <IconWarn size={14} /> <span>{t("cartas.ia.reemplazar")}</span>
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.72 }}>{t("cartas.ia.nota")}</div>
              {iaError && <div className="field-error" style={{ marginTop: 10 }}>{iaError}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button className="btn secondary" onClick={() => setIaAbierta(false)} disabled={iaGenerando}>{t("cartas.ia.cancelar")}</button>
                <button className="btn ia-primary" onClick={generarConIA} disabled={iaGenerando || !iaPuntos.trim()}>
                  <IconSparkles size={14} /> {iaGenerando ? t("cartas.ia.generando") : t("cartas.ia.generar")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmEntrega && (
        <ConfirmDialog
          title={t("cartas.firmasPendientesTitulo")}
          message={t("cartas.firmasPendientesMensaje")}
          confirmLabel={t("cartas.marcarEntregada")}
          danger
          onConfirm={() => { setConfirmEntrega(false); guardar(true); }}
          onCancel={() => setConfirmEntrega(false)}
        />
      )}
    </div>
  );
}
