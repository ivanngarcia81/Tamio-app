import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { insertPlantilla, updatePlantilla, type Church, type NewPlantilla, type Plantilla } from "../db";
import { aplicarVariables, contextoDe, VARIABLES } from "../services/cartas/plantillas";
import { renderCartaHtml } from "../services/cartas/renderCarta";
import { TIPOS_CARTA } from "./CartaEditor";
import { Seccion, SwitchRow } from "./FichaMiembroModal";
import { IconClose } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";

interface Props {
  church: Church;
  plantilla: Plantilla | null;
  /** Copia inicial (duplicar): misma información, nombre "(copia)". */
  base?: Plantilla | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function PlantillaModal({ church, plantilla, base, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const origen = plantilla ?? base ?? null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [nombre, setNombre] = useState(
    plantilla?.nombre ?? (base ? t("plantillas.nombreCopia", { nombre: base.nombre }) : "")
  );
  const [tipo, setTipo] = useState(origen?.tipo ?? "personalizada");
  const [asunto, setAsunto] = useState(origen?.asunto ?? "");
  const [saludo, setSaludo] = useState(origen?.saludo ?? "");
  const [despedida, setDespedida] = useState(origen?.despedida ?? "");
  const [activa, setActiva] = useState(origen ? origen.activa === 1 : true);
  const [predeterminada, setPredeterminada] = useState(plantilla ? plantilla.predeterminada === 1 : false);

  const cuerpoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (cuerpoRef.current) cuerpoRef.current.innerHTML = origen?.cuerpo_html ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function insertarVariable(clave: string) {
    cuerpoRef.current?.focus();
    document.execCommand("insertText", false, `{{${clave}}}`);
  }

  function payloadActual(): NewPlantilla | null {
    setError(null);
    if (!nombre.trim()) { setError(t("plantillas.nombreObligatorio")); return null; }
    return {
      nombre: nombre.trim(),
      tipo,
      asunto: asunto.trim() || null,
      saludo: saludo.trim() || null,
      cuerpo_html: cuerpoRef.current?.innerHTML ?? "",
      despedida: despedida.trim() || null,
      activa,
      predeterminada,
    };
  }

  async function guardar() {
    const payload = payloadActual();
    if (!payload) return;
    setSaving(true);
    try {
      if (plantilla) {
        await updatePlantilla(plantilla.id, church.id, payload);
      } else {
        await insertPlantilla(church.id, payload);
      }
      playSound("guardado");
      showToast(t("plantillas.toastGuardada"));
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  /** Vista previa con las variables resueltas (datos de ejemplo donde falte). */
  function verPrevia() {
    const payload = payloadActual();
    if (!payload) return;
    const ctx = contextoDe(church, {
      folio: "CAR-2026-0001",
      fechaEmision: new Date().toISOString().slice(0, 10),
      iglesiaDestino: t("plantillas.ejemploIglesia"),
      iglesiaProcedencia: t("plantillas.ejemploIglesia"),
    });
    ctx.miembro_nombre = t("plantillas.ejemploMiembro");
    ctx.fecha_membresia = ctx.fecha_actual;
    ctx.estado_membresia = t("membresia.estado.activo");
    setPreview(
      renderCartaHtml({
        church: {
          nombre: church.nombre,
          direccion: church.direccion,
          ciudad: church.ciudad,
          region: church.region,
          pais: church.pais,
          telefono: church.telefono,
          email: church.email,
          pieInstitucional: church.pie_institucional,
          logoDataUrl: null,
        },
        folio: "CAR-2026-0001",
        fechaLarga: ctx.fecha_actual ?? "",
        lugarEmision: church.ciudad,
        destinatarioNombre: t("plantillas.ejemploMiembro"),
        destinatarioDireccion: null,
        asunto: aplicarVariables(payload.asunto ?? "", ctx) || null,
        saludo: aplicarVariables(payload.saludo ?? "", ctx) || null,
        cuerpoHtml: aplicarVariables(payload.cuerpo_html, ctx),
        despedida: aplicarVariables(payload.despedida ?? "", ctx) || null,
        firmas: [
          ...(church.pastor_nombre ? [{ rol: "pastor", nombre: church.pastor_nombre, cargo: church.pastor_cargo ?? t("rol.pastor"), firmado: false, fecha: null }] : []),
          ...(church.secretaria_nombre ? [{ rol: "secretaria", nombre: church.secretaria_nombre, cargo: church.secretaria_cargo ?? t("cartas.rolSecretaria"), firmado: false, fecha: null }] : []),
        ],
        papel: "letter",
        etiquetaFolio: t("cartas.etiquetaFolio"),
      })
    );
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{ width: 720 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{plantilla ? t("plantillas.editarPlantilla") : t("plantillas.nuevaPlantilla")}</div>
            <div className="modal-sub">{t("plantillas.sub")}</div>
          </div>
          <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          <Seccion titulo={t("plantillas.secDatos")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("usuarios.colNombre")}</label>
                <input className="form-input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("cartas.tipoCarta")}</label>
                <select className="form-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS_CARTA.map((ti) => (
                    <option key={ti} value={ti}>{t(`cartas.tipoDoc.${ti}`)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <SwitchRow label={t("plantillas.activa")} value={activa} onChange={setActiva} />
              </div>
              <div className="form-group">
                <SwitchRow label={t("plantillas.predeterminada")} value={predeterminada} onChange={setPredeterminada} />
              </div>
            </div>
          </Seccion>

          <Seccion titulo={t("plantillas.secContenido")}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">{t("cartas.asunto")}</label>
                <input className="form-input" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t("cartas.saludo")}</label>
                <input className="form-input" value={saludo} onChange={(e) => setSaludo(e.target.value)} />
              </div>
            </div>
            <div className="form-group full">
              <label className="form-label">{t("cartas.cuerpo")}</label>
              <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <select
                  className="form-input"
                  style={{ width: "auto", padding: "6px 10px" }}
                  value=""
                  aria-label={t("plantillas.insertarVariable")}
                  onChange={(e) => { if (e.target.value) insertarVariable(e.target.value); e.target.value = ""; }}
                >
                  <option value="">{t("plantillas.insertarVariable")}</option>
                  {VARIABLES.map((v) => (
                    <option key={v} value={v}>{t(`plantillas.variable.${v}`)}</option>
                  ))}
                </select>
                <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{t("plantillas.variableHint")}</span>
              </div>
              <div
                ref={cuerpoRef}
                contentEditable
                role="textbox"
                aria-multiline="true"
                aria-label={t("cartas.cuerpo")}
                className="form-textarea"
                style={{ minHeight: 160, lineHeight: 1.6, overflowY: "auto" }}
              />
            </div>
            <div className="form-group full">
              <label className="form-label">{t("cartas.despedida")}</label>
              <input className="form-input" value={despedida} onChange={(e) => setDespedida(e.target.value)} />
            </div>
          </Seccion>

          {error && <div className="field-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn secondary" onClick={verPrevia}>{t("cartas.vistaPrevia")}</button>
            <button className="btn secondary" onClick={onClose}>{t("common.cancelar")}</button>
            <button className="btn primary" onClick={guardar} disabled={saving}>
              {saving ? t("common.guardando") : t("common.guardar")}
            </button>
          </div>
        </div>
      </div>

      {preview && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPreview(null); }}>
          <div className="modal-card" style={{ width: 900, height: "92vh", display: "flex", flexDirection: "column" }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{t("cartas.vistaPrevia")}</div>
                <div className="modal-sub">{t("plantillas.previaSub")}</div>
              </div>
              <button type="button" className="modal-close" aria-label={t("common.cerrar")} onClick={() => setPreview(null)}><IconClose /></button>
            </div>
            <iframe title={t("cartas.vistaPrevia")} srcDoc={preview} style={{ flex: 1, border: "none", background: "#f0f0f0" }} />
          </div>
        </div>
      )}
    </div>
  );
}
