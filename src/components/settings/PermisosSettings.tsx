/**
 * PermisosSettings.tsx — los DOS permisos del rol Tesorería (migración 49).
 *
 * De los cuatro interruptores que el rediseño de iPad dibujó quedan dos,
 * porque los otros dos nunca fueron permisos: «Registrar ingresos y gastos» y
 * «Cerrar cortes y depósitos» SON el rol de tesorería. Apagarlos no le habría
 * quitado un permiso a la tesorera: la habría dejado dentro de Tesorería sin
 * poder hacer nada, que es otro rol —uno de solo lectura— y no un permiso.
 *
 * Los dos que quedan tiran para lados distintos, y por eso el pie de cada uno
 * dice lo que dice:
 *
 *  · **Ver el padrón** DA. Hoy el tesorero no entra a Membresía; el permiso le
 *    abre esa pantalla —y solo esa— para la iglesia chica donde la misma
 *    persona lleva la tesorería y el padrón.
 *  · **Eliminar movimientos** QUITA. Hoy sí puede, y esto se lo retira.
 *
 * **Hasta dónde llega cada uno**, dicho sin adornos:
 *
 *  - El del borrado es un control de verdad. Esconder el botón no basta —el
 *    aparato podría escribir la fila igual—, así que el que manda es el
 *    disparador `frenar_borrado_tesorero` de Supabase: deshace la baja y
 *    devuelve el movimiento vivo. Lo de aquí solo evita enseñar un botón que
 *    no va a funcionar.
 *  - El del padrón NO es una barrera de datos, y no puede serlo: el padrón ya
 *    se sincroniza entero a todos los aparatos de la iglesia, porque el
 *    tesorero necesita los miembros para Aportantes. El permiso abre una
 *    PANTALLA. Convertirlo en barrera real significaría no bajarle los
 *    miembros, y entonces Aportantes dejaría de funcionar.
 *
 * Viven en la IGLESIA y no en la persona (decisión de Iván, 24 ago 2026), y la
 * verdad está en Supabase: se escriben por RPC y bajan como el plan. La copia
 * local es un espejo para que la interfaz sepa qué esconder sin señal.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getOrCreateChurch, type Church } from "../../db";
import { fijarPermisosTesoreria } from "../../sync";
import { IconLlave } from "../../icons";

export type ClavePermiso = "padron" | "eliminar";

export interface EstadoPermisos {
  vePadron: boolean;
  puedeEliminar: boolean;
  guardando: ClavePermiso | null;
  error: string | null;
  cambiar: (clave: ClavePermiso, valor: boolean) => void;
}

/**
 * El motor, compartido por la lista de iOS y la tarjeta del Mac.
 *
 * Optimista NO: el interruptor se mueve **después** de que el servidor acepte.
 * Un permiso que se pinta encendido y luego se cae solo es peor que uno lento,
 * porque quien lo tocó se va creyendo que lo dejó puesto.
 */
export function usePermisosTesoreria(church: Church, onChurchUpdated: (c: Church) => void): EstadoPermisos {
  const [guardando, setGuardando] = useState<ClavePermiso | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vePadron = church.tesorero_ve_padron !== 0;
  const puedeEliminar = church.tesorero_puede_eliminar !== 0;

  function cambiar(clave: ClavePermiso, valor: boolean) {
    if (guardando) return;
    setGuardando(clave);
    setError(null);
    const siguiente = {
      vePadron: clave === "padron" ? valor : vePadron,
      puedeEliminar: clave === "eliminar" ? valor : puedeEliminar,
    };
    void fijarPermisosTesoreria(church.id, siguiente)
      // Se relee de la base en vez de fiarse de lo que se acaba de mandar:
      // `fijarPermisosTesoreria` solo escribe el espejo si el servidor aceptó,
      // así que lo que hay en la fila ES lo que quedó arriba.
      .then(() => getOrCreateChurch())
      .then((fresca) => { if (fresca) onChurchUpdated(fresca); })
      .catch((e) => setError(String((e as { message?: string })?.message ?? e)))
      .finally(() => setGuardando(null));
  }

  return { vePadron, puedeEliminar, guardando, error, cambiar };
}

interface Props {
  church: Church;
  onChurchUpdated: (c: Church) => void;
}

/**
 * La cara de escritorio. Existe —y las de la migración 45 y 47 no— porque
 * estas dos no son avisos: son permisos, y quien los pone es el
 * administrador, que muy probablemente trabaja en un Mac. Sin esta tarjeta,
 * una iglesia sin iPad no podría usarlos nunca.
 */
export default function PermisosSettings({ church, onChurchUpdated }: Props) {
  const { t } = useTranslation();
  const p = usePermisosTesoreria(church, onChurchUpdated);

  const filas: { clave: ClavePermiso; valor: boolean; label: string; pie: string }[] = [
    { clave: "padron", valor: p.vePadron, label: t("permisos.padron"), pie: t("permisos.padronPie") },
    { clave: "eliminar", valor: p.puedeEliminar, label: t("permisos.eliminar"), pie: t("permisos.eliminarPie") },
  ];

  return (
    <div className="settings-bloque">
      <div className="card pad-lg settings-card">
        <div className="card-head">
          <div className="card-head-left">
            <div className="card-icon"><IconLlave size={16} /></div>
            <div className="card-head-titles">
              <div className="card-title-lg">{t("permisos.titulo")}</div>
              <div className="card-title-sub">{t("permisos.sub")}</div>
            </div>
          </div>
        </div>

        {filas.map((f) => (
          <div className="form-group" key={f.clave}>
            {/* Casilla y no interruptor, por lo mismo que en SoundSettings: el
                control de 52×31 de iOS canta en una ventana de escritorio. */}
            <label className="mac-check">
              <input
                type="checkbox"
                checked={f.valor}
                disabled={p.guardando !== null}
                onChange={(e) => p.cambiar(f.clave, e.target.checked)}
              />
              <span>{f.label}</span>
            </label>
            <div className="form-hint">{f.pie}</div>
          </div>
        ))}

        {p.error && <div className="form-error">{t("permisos.error")}</div>}
      </div>
      <p className="settings-nota">{t("permisos.hint")}</p>
    </div>
  );
}
