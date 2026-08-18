/**
 * AccesosSettingsIOS.tsx — zona "Accesos y áreas" con el patrón de lista
 * agrupada de iOS, SOLO para iPhone. Mac/iPad siguen con las cuatro tarjetas
 * de escritorio (`PlanSettings`, `RoleSettings`, `InvitarUsuario`,
 * `SyncSettings`), que no se tocan.
 *
 * Era la última de las seis zonas de Ajustes sin variante de iPhone: ahí se
 * pintaban los componentes de escritorio dentro de `settings-masonry`, con
 * tarjetas dentro de tarjetas, etiquetas encima de cajas de ancho completo y
 * segmentados con el activo en NEGRO. Aquí es un solo nivel de grupo, filas
 * con el valor a la derecha, y las acciones como filas centradas en el color
 * de acento en vez de botones sueltos.
 *
 * **Nada de lógica cambia.** La invitación sale del hook `useInvitacion`, que
 * comparte con la tarjeta de escritorio; el sync usa el mismo `useSync` /
 * `ejecutarSync` de siempre; y las guardas de visibilidad son literalmente
 * las mismas cuatro que aplica Configuracion.tsx en el camino de Mac.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateSuscripcion, type Church } from "../../db";
import { authHabilitado } from "../../supabase";
import { PLANES, incluyeSecretaria, incluyeTesoreria } from "../../plan";
import { ROLES_ACCESO, type Role } from "../../role";
import { SYNC_HABILITADO, ejecutarSync, useSync } from "../../syncManager";
import { playSound } from "../../sound";
import { ActionField, Section, TextField } from "../ios/FormularioIOS";
import { IOSPickerField } from "../ios/IOSPickerField";
import { useInvitacion } from "./InvitarUsuario";

interface Props {
  church: Church;
  role: Role;
  onRoleChange: (r: Role) => void;
  onChurchUpdated: (c: Church) => void;
  esAdmin: boolean;
  authActivo: boolean;
}

/** Fila de solo lectura: etiqueta a la izquierda, valor a la derecha. No es
 *  un botón porque no lleva a ninguna parte — sin esto un estado de sync
 *  parecería tocable. */
function FilaValor({ label, value, tono }: { label: string; value: string; tono?: "pos" }) {
  return (
    <div className="ios-field">
      <span className="ios-field-label">{label}</span>
      <span className={`ios-field-value${tono === "pos" ? " ios-field-value--pos" : ""}`}>{value}</span>
    </div>
  );
}

export default function AccesosSettingsIOS({
  church, role, onRoleChange, onChurchUpdated, esAdmin, authActivo,
}: Props) {
  const { t } = useTranslation();
  const inv = useInvitacion();
  const snap = useSync();

  // Mismas cuatro guardas que Configuracion.tsx aplica a las tarjetas de
  // escritorio. Si una deja su grupo vacío, el grupo no se pinta.
  const verPlan = esAdmin || !authActivo;
  const verRol = !authActivo;
  const verInvitar = esAdmin && authActivo;
  const verSync = authActivo && SYNC_HABILITADO;

  // Mismo criterio que PlanSettings: con login manda la nube y esto es solo
  // lectura; en modo local solo se eligen áreas.
  const soloLectura = authHabilitado;
  const [plan, setPlan] = useState(church.plan || "completo");
  const [errorPlan, setErrorPlan] = useState<string | null>(null);
  const planVista = soloLectura ? (church.plan || "completo") : plan;
  const estadoVista = church.sub_estado || "activa";
  const venceVista = church.sub_vence ?? "";

  async function elegirPlan(p: string) {
    if (soloLectura || p === plan) return;
    setPlan(p);
    setErrorPlan(null);
    try {
      // Igual que en la tarjeta de escritorio: elegir un área ES guardarla, y
      // estado y vencimiento se conservan tal cual.
      const actualizada = await updateSuscripcion(church.id, p, estadoVista, venceVista || null);
      playSound("guardado");
      onChurchUpdated(actualizada);
    } catch (e) {
      setErrorPlan(t("common.noSePudoGuardar", { error: String(e) }));
    }
  }

  const areas = [
    incluyeTesoreria(planVista) ? t("plan.areaTesoreria") : null,
    incluyeSecretaria(planVista) ? t("plan.areaSecretaria") : null,
  ].filter(Boolean).join(" · ");

  const sincronizando = snap.estado === "sincronizando";
  const estadoSync = t(`sync.estado.${snap.estado}`);
  const detalleSync = snap.estado === "error"
    ? (snap.motivo === "sin-iglesia" ? t("sync.errorSinIglesia") : snap.motivo === "sin-login" ? t("sync.errorSinLogin") : t("sync.errorGeneral"))
    : snap.estado === "offline" ? t("sync.errorSinConexion") : null;

  return (
    <div className="ios-form">
      {verInvitar && (
        <Section
          header={t("invitar.titulo")}
          /* El texto de qué verá el rol sale del grupo y vive aquí: cambia al
             cambiar la fila de Rol, que es justo lo que hay que ver. */
          footer={
            <>
              {inv.error && <span className="ios-section-footer--error">{inv.error}</span>}
              {t(`invitar.queVe.${inv.rol}`)}
            </>
          }
        >
          <TextField
            label={t("invitar.correo")}
            value={inv.email}
            onChange={(v) => { inv.setEmail(v); inv.setError(null); }}
            placeholder="tesorero@iglesia.org"
            type="email"
            inputMode="email"
          />
          <TextField
            label={t("invitar.nombre")}
            value={inv.nombre}
            onChange={inv.setNombre}
            placeholder={t("invitar.nombreOpcional")}
          />
          {/* `IOSPickerField` y no `IOSPickerInput`: esta es una fila de
              lista, no un control dentro de una rejilla `.form-group`. */}
          <IOSPickerField
            label={t("invitar.rol")}
            options={ROLES_ACCESO.map((r) => ({ value: r, label: t(`rolAcceso.${r}`) }))}
            value={inv.rol}
            onSelect={(v) => inv.setRol(v as Role)}
          />
          <ActionField
            label={inv.enviando ? t("invitar.enviando") : t("invitar.enviar")}
            onPress={() => void inv.invitar()}
            disabled={!inv.listo}
          />
        </Section>
      )}

      {verSync && (
        <Section
          header={t("sync.titulo")}
          /* El detalle técnico del fallo se conserva, pero como parte del pie
             y no como bloque aparte al final de la tarjeta. */
          footer={
            <>
              {t("sync.hintAuto")}
              {detalleSync && <span className="ios-section-footer--error">{detalleSync}</span>}
              {(snap.estado === "offline" || snap.estado === "error") && snap.error && (
                <span className="ios-section-footer--tecnico">{snap.error}</span>
              )}
            </>
          }
        >
          <FilaValor label={t("sync.estadoLabel")} value={estadoSync} tono={snap.estado === "ok" ? "pos" : undefined} />
          {snap.estado === "ok" && snap.ultima != null && (
            <FilaValor
              label={t("sync.ultimoCambio")}
              value={t("sync.resultadoCorto", { subidos: snap.subidos, bajados: snap.bajados })}
            />
          )}
          <ActionField
            label={sincronizando ? t("sync.sincronizando") : t("sync.sincronizarAhora")}
            onPress={() => { void ejecutarSync(); }}
            disabled={sincronizando}
          />
        </Section>
      )}

      {(verPlan || verRol) && (
        <Section
          header={soloLectura ? t("plan.titulo") : t("plan.tituloAreas")}
          footer={
            <>
              {`${t("plan.resumenAreas")}: ${areas || t("plan.ninguna")}`}
              <span>{soloLectura ? t("plan.nubeManda") : t("plan.seGuardaSolo")}</span>
              {errorPlan && <span className="ios-section-footer--error">{errorPlan}</span>}
              {verRol && <span>{t("rolConfig.hint")}</span>}
            </>
          }
        >
          {verPlan && (soloLectura ? (
            <>
              <FilaValor label={t("plan.plan")} value={t(`plan.nombre.${planVista}`)} />
              <FilaValor label={t("plan.estado")} value={t(`plan.estadoNombre.${estadoVista}`)} />
              {venceVista && estadoVista !== "cortesia" && (
                <FilaValor label={t("plan.vence")} value={venceVista} />
              )}
            </>
          ) : (
            /* Antes un `.tabs-segmented` con el activo en negro. */
            <IOSPickerField
              label={t("plan.areas")}
              options={PLANES.map((p) => ({ value: p, label: t(`plan.nombre.${p}`) }))}
              value={planVista}
              onSelect={(v) => void elegirPlan(v)}
            />
          ))}
          {verRol && (
            <IOSPickerField
              label={t("rolConfig.titulo")}
              options={(["administrador", "tesorero", "secretaria"] as Role[]).map((r) => ({ value: r, label: t(`rol.${r}`) }))}
              value={role}
              onSelect={(v) => onRoleChange(v as Role)}
            />
          )}
        </Section>
      )}
    </div>
  );
}
