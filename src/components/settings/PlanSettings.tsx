import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateSuscripcion, type Church } from "../../db";
import { authHabilitado } from "../../supabase";
import { PLANES, evaluarVigencia, incluyeTesoreria, incluyeSecretaria } from "../../plan";
import { IconIdBadge } from "../../icons";
import { playSound } from "../../sound";
import GuardadoChip, { type EstadoGuardado } from "./GuardadoChip";

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
  const [estado, setEstado] = useState<EstadoGuardado>({ tipo: "oculto" });

  // En solo lectura se muestra SIEMPRE lo que dice la iglesia (la nube), no el
  // estado editable local. El estado y el vencimiento nunca se editan aquí.
  const planVista = soloLectura ? (church.plan || "completo") : plan;
  const estadoVista = church.sub_estado || "activa";
  const venceVista = church.sub_vence ?? "";

  const vig = evaluarVigencia(estadoVista, venceVista || null);

  // Modelo A: elegir un área ES guardarla. El chip también avisa si falló
  // (y en ese caso la selección local se conserva para reintentar tocando
  // otra vez).
  async function elegir(p: string) {
    if (soloLectura || p === plan) return;
    setPlan(p);
    setEstado({ tipo: "guardando" });
    try {
      // Solo cambian las áreas; estado y vencimiento se conservan tal cual.
      const actualizada = await updateSuscripcion(church.id, p, estadoVista, venceVista || null);
      playSound("guardado");
      onSaved(actualizada);
      setEstado({ tipo: "guardado" });
      setTimeout(() => setEstado((e) => (e.tipo === "guardado" ? { tipo: "oculto" } : e)), 2500);
    } catch (e) {
      setEstado({ tipo: "error", detalle: t("common.noSePudoGuardar", { error: String(e) }) });
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
        {!soloLectura && <GuardadoChip estado={estado} />}
      </div>

      {soloLectura ? (
        <>
          {/* Vista informativa: qué plan tiene la iglesia hoy, sin controles. */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">{t("plan.plan")}</label>
            <div className="form-valor">{t(`plan.nombre.${planVista}`)}</div>
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">{t("plan.estado")}</label>
            <div className="form-valor">{t(`plan.estadoNombre.${estadoVista}`)}</div>
          </div>
          {venceVista && estadoVista !== "cortesia" && (
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">{t("plan.vence")}</label>
              <div className="form-valor">{venceVista}</div>
            </div>
          )}
        </>
      ) : (
        /* Modo local: solo el selector de áreas. */
        <>
          <label className="form-label">{t("plan.areas")}</label>
          <div className="tabs-segmented" style={{ marginBottom: 12 }}>
            {PLANES.map((p) => (
              <button type="button" key={p} className={`seg${plan === p ? " active" : ""}`} aria-pressed={plan === p} onClick={() => void elegir(p)}>
                {t(`plan.nombre.${p}`)}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Vigencia y áreas: en solo lectura son FILAS del formulario, como Plan
          y Suscripción, y no pies de texto. Eran datos con la misma
          importancia que los de arriba escritos en gris pequeño detrás de dos
          puntos, y la pestaña entera se leía a dos alturas distintas. */}
      {soloLectura ? (
        <>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">{t("plan.resumenEstado")}</label>
            <div className="form-valor" style={{ color: vig.activa ? "var(--pos)" : "var(--neg)" }}>
              {vig.activa ? t("plan.vigente") : t("plan.noVigente")}
              {vig.enGracia && ` — ${t("plan.enGracia", { dias: vig.diasGracia ?? 0 })}`}
              {estadoVista === "cortesia" && ` — ${t("plan.esCortesia")}`}
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            {/* `plan.areas` ("Áreas en uso") y no `resumenAreas` ("Verá"):
                el segundo es un fragmento de frase que funcionaba como pie
                —"Verá: Tesorería · Secretaría"— pero como etiqueta de fila,
                al lado de Plan y Suscripción, no dice qué es el dato. */}
            <label className="form-label">{t("plan.areas")}</label>
            <div className="form-valor">{areas || t("plan.ninguna")}</div>
          </div>
          <div className="form-hint">{t("plan.nubeManda")}</div>
        </>
      ) : (
        <div className="form-hint" style={{ marginBottom: 12 }}>
          {t("plan.resumenAreas")}: <b>{areas || t("plan.ninguna")}</b>
        </div>
      )}

      {!soloLectura && (
        <div className="form-hint">{t("plan.seGuardaSolo")}</div>
      )}
    </div>
  );
}
