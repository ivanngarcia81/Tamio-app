import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import ConfirmDialog from "../ConfirmDialog";
import {
  cancelarRestauracion, confirmarRestauracion, pausarSyncPorRestauracion,
  prepararRestauracion, reiniciarApp, type ResumenRespaldo,
} from "../../services/restaurar";
import { IconUpload, IconWarn } from "../../icons";

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
 */
export default function RestoreSettings() {
  const { t } = useTranslation();
  const [resumen, setResumen] = useState<ResumenRespaldo | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** El respaldo quedó marcado y se pidió el cierre. */
  const [cerrando, setCerrando] = useState(false);
  /** El respaldo quedó listo pero la app no llegó a cerrarse sola. */
  const [noCerro, setNoCerro] = useState(false);

  async function elegir() {
    setError(null);
    try {
      const origen = await openFileDialog({
        multiple: false,
        title: t("restaurar.elegirTitulo"),
        // Se aceptan los dos: el paquete nuevo y el .db suelto de los
        // respaldos antiguos. El formato real se reconoce por contenido.
        filters: [{ name: t("restaurar.filtro"), extensions: ["zip", "db"] }],
      });
      if (typeof origen !== "string") return;
      setTrabajando(true);
      setResumen(await prepararRestauracion(origen));
    } catch (e) {
      setError(String(e));
    } finally {
      setTrabajando(false);
    }
  }

  async function confirmar() {
    setTrabajando(true);
    // El diálogo se cierra AQUÍ, en el clic, antes de esperar a nada.
    //
    // Mientras seguía abierto tapaba la tarjeta entera, así que ni el aviso de
    // "no se cerró" ni un error se veían: quedaban pintados DEBAJO del modal.
    // Desde fuera el botón rojo parecía muerto aunque el trabajo estuviera
    // hecho. Cerrándolo ya, lo que pase después se ve.
    setResumen(null);
    try {
      await confirmarRestauracion();
      // La sincronización queda pausada ANTES de reiniciar, para que el
      // arranque siguiente ya la encuentre en pausa y no suba ni baje nada
      // antes de que un humano mire los datos.
      pausarSyncPorRestauracion();
      setCerrando(true);

      // Si el cierre funciona, este componente deja de existir antes de que
      // salte el aviso. Si NO funciona, el `invoke` se queda esperando para
      // siempre. El respaldo ya está preparado y con su marcador, así que
      // cerrar a mano termina el trabajo igual: hay que decirlo.
      setTimeout(() => setNoCerro(true), 3000);
      await reiniciarApp();
    } catch (e) {
      setError(String(e));
      setTrabajando(false);
      setCerrando(false);
    }
  }

  async function cancelar() {
    setResumen(null);
    await cancelarRestauracion().catch(() => {});
  }

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconUpload size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("restaurar.titulo")}</div>
            <div className="card-title-sub">{t("restaurar.sub")}</div>
          </div>
        </div>
      </div>

      <button type="button" className="btn secondary" onClick={elegir} disabled={trabajando}>
        <IconUpload size={13} /> {trabajando ? t("common.preparando") : t("restaurar.boton")}
      </button>

      <div className="form-hint" style={{ marginTop: "var(--space-3)" }}>{t("restaurar.hint")}</div>
      {/* Sello de compilación: una captura de esta tarjeta basta para saber
          qué versión del código está corriendo. Ver vite.config.ts. */}
      <div className="form-hint" style={{ marginTop: "var(--space-2)", color: "var(--text-3)" }}>
        {t("restaurar.compilacion", { fecha: __FECHA_BUILD__ })}
      </div>

      {error && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "var(--space-3)" }}>
          <IconWarn size={13} /> {error}
        </div>
      )}

      {cerrando && !noCerro && (
        <div className="form-hint" style={{ marginTop: "var(--space-3)" }}>{t("restaurar.cerrando")}</div>
      )}

      {noCerro && (
        <div className="form-warning" style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: "var(--space-3)" }}>
          <IconWarn size={13} /> {t("restaurar.noCerro")}
        </div>
      )}

      {resumen && (
        <ConfirmDialog
          danger
          title={t("restaurar.confirmarTitulo")}
          message={[
            // El nombre va primero y solo. Es lo que delata que el archivo es
            // de otra congregación, y eso hay que verlo antes que las cifras:
            // dos iglesias parecidas pueden tener números parecidos.
            resumen.iglesia ? t("restaurar.confirmarIglesia", { nombre: resumen.iglesia }) : "",
            // Tres cantidades en una frase, y i18next solo pluraliza una por
            // clave: se arma con tres piezas ya pluralizadas para que no salga
            // "1 depósitos".
            t("restaurar.confirmarTrae", {
              movimientos: t("restaurar.nMovimientos", { count: resumen.movimientos }),
              miembros: t("restaurar.nMiembros", { count: resumen.miembros }),
              depositos: t("restaurar.nDepositos", { count: resumen.depositos }),
            }),
            resumen.hasta ? t("restaurar.confirmarHasta", { fecha: resumen.hasta }) : "",
            resumen.formato_antiguo
              ? t("restaurar.confirmarSinDocumentos")
              : t("restaurar.confirmarDocumentos", { count: resumen.documentos }),
            t("restaurar.confirmarReemplaza"),
            t("restaurar.confirmarSync"),
            t("restaurar.confirmarReinicio"),
          ].filter(Boolean).join("\n\n")}
          confirmLabel={t("restaurar.confirmarBoton")}
          onConfirm={confirmar}
          onCancel={cancelar}
        />
      )}
    </div>
  );
}
