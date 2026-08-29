import { useTranslation } from "react-i18next";
import FilaAccion from "./FilaAccion";
import ConfirmDialog from "../ConfirmDialog";
import { useRestaurar } from "./restaurar";
import { IconRefreshCw, IconWarn } from "../../icons";

/**
 * Restaurar un respaldo.
 *
 * Es la operación más destructiva de la app —más que el reinicio de fábrica,
 * porque además del borrado hay una sustitución— así que va en la zona roja y
 * con doble confirmación.
 *
 * La segunda confirmación no es un "¿seguro?" genérico: dice **qué trae el
 * paquete** (cuántos movimientos, miembros y depósitos, hasta qué fecha y
 * cuántos documentos) y que la base actual se aparta. Con esos números el
 * tesorero puede darse cuenta de que ha elegido el archivo equivocado, que es
 * justo lo que un "¿seguro?" no le deja ver.
 *
 * El estado y esa frase viven en `restaurar.ts`: el teléfono los usa desde su
 * propia pantalla (zona sensible, maqueta S9) y no conviene tener dos copias
 * de una lógica que se afinó arreglando fallos.
 */
export default function RestoreSettings() {
  const { t } = useTranslation();
  const r = useRestaurar();

  return (
    <div className="card pad-lg settings-card">
      {/* Sin cabecera de tarjeta: la fila de abajo ya dice el título y el
          subtítulo, y con las dos cosas salía el mismo texto dos veces. */}
      <FilaAccion
        icono={<IconRefreshCw size={12} />}
        tinte="var(--ios-orange)"
        titulo={t("restaurar.titulo")}
        nota={t("restaurar.sub")}
      >
        <button type="button" className="btn secondary" onClick={r.elegir} disabled={r.trabajando}>
          {r.trabajando ? t("common.preparando") : t("restaurar.boton")}
        </button>
      </FilaAccion>

      <div className="form-hint" style={{ marginTop: "var(--space-3)" }}>{t("restaurar.hint")}</div>
      {/* Sello de compilación: una captura de esta tarjeta basta para saber
          qué versión del código está corriendo. Ver vite.config.ts. */}
      <div className="form-hint" style={{ marginTop: "var(--space-2)", color: "var(--text-3)" }}>
        {t("restaurar.compilacion", { fecha: __FECHA_BUILD__ })}
      </div>

      {r.error && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "var(--space-3)" }}>
          <IconWarn size={13} /> {r.error}
        </div>
      )}

      {r.cerrando && !r.noCerro && (
        <div className="form-hint" style={{ marginTop: "var(--space-3)" }}>{t("restaurar.cerrando")}</div>
      )}

      {r.noCerro && (
        <div className="form-warning" style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: "var(--space-3)" }}>
          <IconWarn size={13} /> {t("restaurar.noCerro")}
        </div>
      )}

      {r.resumen && (
        <ConfirmDialog
          danger
          title={t("restaurar.confirmarTitulo")}
          message={r.mensajeConfirmar(r.resumen)}
          confirmLabel={t("restaurar.confirmarBoton")}
          onConfirm={r.confirmar}
          onCancel={r.cancelar}
        />
      )}
    </div>
  );
}
