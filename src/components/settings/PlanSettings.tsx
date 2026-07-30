import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateSuscripcion, type Church } from "../../db";
import { authHabilitado } from "../../supabase";
import { PLANES, evaluarVigencia, incluyeTesoreria, incluyeSecretaria } from "../../plan";
import { IconIdBadge, IconCheck } from "../../icons";
import { showToast } from "../../toast";
import { playSound } from "../../sound";

interface Props {
  church: Church;
  onSaved: (c: Church) => void;
}

/**
 * Panel de áreas / suscripción. Dos modos según haya login:
 *
 * - **Con login (nube): SOLO LECTURA.** La autoridad es la nube (webhook de pago
 *   o el dueño en Supabase) y el sync baja el valor. Antes los controles
 *   quedaban editables y, sin conexión, cualquiera podía autoconcederse
 *   "Completo/Activa" indefinidamente desde Ajustes.
 * - **Modo local (sin login): solo ÁREAS.** No hay licencia que administrar, así
 *   que la tarjeta se limita a elegir qué áreas usa esta instalación. No se
 *   muestran estado ni vencimiento a propósito: ese vocabulario de suscripción
 *   (prueba, vencida, vence el…) no aplica cuando no hay nada que cobrar, y en
 *   la App Store daría a entender que hay un plan de pago sin forma de
 *   comprarlo dentro de la app.
 */
export default function PlanSettings({ church, onSaved }: Props) {
  const { t } = useTranslation();
  const soloLectura = authHabilitado;
  const [plan, setPlan] = useState(church.plan || "completo");
  const [saving, setSaving] = useState(false);

  // En solo lectura se muestra SIEMPRE lo que dice la iglesia (la nube), no el
  // estado editable local. El estado y el vencimiento nunca se editan aquí.
  const planVista = soloLectura ? (church.plan || "completo") : plan;
  const estadoVista = church.sub_estado || "activa";
  const venceVista = church.sub_vence ?? "";

  const dirty = !soloLectura && plan !== church.plan;
  const vig = evaluarVigencia(estadoVista, venceVista || null);

  async function guardar() {
    if (soloLectura) return;
    setSaving(true);
    try {
      // Solo cambian las áreas; estado y vencimiento se conservan tal cual.
      const actualizada = await updateSuscripcion(church.id, plan, estadoVista, venceVista || null);
      playSound("guardado");
      showToast(t("plan.guardado"));
      onSaved(actualizada);
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    } finally {
      setSaving(false);
    }
  }

  const areas = [
    incluyeTesoreria(planVista) ? t("plan.areaTesoreria") : null,
    incluyeSecretaria(planVista) ? t("plan.areaSecretaria") : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconIdBadge size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{soloLectura ? t("plan.titulo") : t("plan.tituloAreas")}</div>
            <div className="card-title-sub">{soloLectura ? t("plan.subNube") : t("plan.subAreas")}</div>
          </div>
        </div>
      </div>

      {soloLectura ? (
        <>
          {/* Vista informativa: qué plan tiene la iglesia hoy, sin controles. */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">{t("plan.plan")}</label>
            <div style={{ fontWeight: 700 }}>{t(`plan.nombre.${planVista}`)}</div>
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">{t("plan.estado")}</label>
            <div style={{ fontWeight: 700 }}>{t(`plan.estadoNombre.${estadoVista}`)}</div>
          </div>
          {venceVista && estadoVista !== "cortesia" && (
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">{t("plan.vence")}</label>
              <div style={{ fontWeight: 700 }}>{venceVista}</div>
            </div>
          )}
        </>
      ) : (
        /* Modo local: solo el selector de áreas. */
        <>
          <label className="form-label">{t("plan.areas")}</label>
          <div className="tabs-segmented" style={{ marginBottom: 12 }}>
            {PLANES.map((p) => (
              <div key={p} className={`seg${plan === p ? " active" : ""}`} onClick={() => setPlan(p)}>
                {t(`plan.nombre.${p}`)}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Resumen de lo que ve la iglesia */}
      <div className="form-hint" style={{ marginBottom: 12 }}>
        {t("plan.resumenAreas")}: <b>{areas || t("plan.ninguna")}</b>
      </div>

      {soloLectura ? (
        <>
          <div className="form-hint" style={{ marginBottom: 12 }}>
            {t("plan.resumenEstado")}:{" "}
            <b style={{ color: vig.activa ? "var(--verde, #059669)" : "var(--rojo, #dc2626)" }}>
              {vig.activa ? t("plan.vigente") : t("plan.noVigente")}
            </b>
            {vig.enGracia && ` — ${t("plan.enGracia", { dias: vig.diasGracia ?? 0 })}`}
            {estadoVista === "cortesia" && ` — ${t("plan.esCortesia")}`}
          </div>
          <div className="form-hint">{t("plan.nubeManda")}</div>
        </>
      ) : (
        <>
          <button className="btn primary" onClick={guardar} disabled={saving || !dirty}>
            {saving ? t("common.guardando") : t("common.guardarCambios")}
          </button>
          {!dirty && (
            <span className="settings-saved-pill" style={{ marginLeft: 10 }}>
              <IconCheck size={14} /> {t("common.guardado")}
            </span>
          )}
        </>
      )}
    </div>
  );
}
