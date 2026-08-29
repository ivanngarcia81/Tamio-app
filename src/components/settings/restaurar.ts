/**
 * restaurar.ts — el estado de "restaurar un respaldo", sin una línea de
 * pintura.
 *
 * Vivía dentro de `RestoreSettings.tsx`. Se saca aquí por el mismo motivo que
 * se sacaron los del movimiento recurrente y la solicitud: el teléfono deja de
 * usar la tarjeta de escritorio y pasa a una fila de la zona sensible (maqueta
 * S9), y con la lógica duplicada la segunda copia se habría quedado atrás a la
 * primera corrección. Y esta lógica no es una que convenga tener por
 * duplicado: la parte delicada —cerrar el diálogo ANTES de esperar, pausar la
 * sincronización antes de reiniciar, avisar si la app no llegó a cerrarse
 * sola— se descubrió arreglando fallos, no escribiéndola.
 *
 * Aquí no se decide nada de aspecto: qué se pinta con `resumen`, `error` o
 * `noCerro` es cosa de cada pantalla.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import {
  cancelarRestauracion, confirmarRestauracion, pausarSyncPorRestauracion,
  prepararRestauracion, reiniciarApp, type ResumenRespaldo,
} from "../../services/restaurar";

export function useRestaurar() {
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

      // Si el cierre funciona, quien llama deja de existir antes de que salte
      // el aviso. Si NO funciona, el `invoke` se queda esperando para siempre.
      // El respaldo ya está preparado y con su marcador, así que cerrar a mano
      // termina el trabajo igual: hay que decirlo.
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

  /** El texto del segundo aviso: no un "¿seguro?" genérico, sino QUÉ trae el
   *  paquete. Con esos números el tesorero puede darse cuenta de que ha
   *  elegido el archivo equivocado, que es justo lo que un "¿seguro?" no le
   *  deja ver. */
  const mensajeConfirmar = (r: ResumenRespaldo) => [
    // El nombre va primero y solo. Es lo que delata que el archivo es de otra
    // congregación, y eso hay que verlo antes que las cifras: dos iglesias
    // parecidas pueden tener números parecidos.
    r.iglesia ? t("restaurar.confirmarIglesia", { nombre: r.iglesia }) : "",
    // Tres cantidades en una frase, y i18next solo pluraliza una por clave: se
    // arma con tres piezas ya pluralizadas para que no salga "1 depósitos".
    t("restaurar.confirmarTrae", {
      movimientos: t("restaurar.nMovimientos", { count: r.movimientos }),
      miembros: t("restaurar.nMiembros", { count: r.miembros }),
      depositos: t("restaurar.nDepositos", { count: r.depositos }),
    }),
    r.hasta ? t("restaurar.confirmarHasta", { fecha: r.hasta }) : "",
    r.formato_antiguo
      ? t("restaurar.confirmarSinDocumentos")
      : t("restaurar.confirmarDocumentos", { count: r.documentos }),
    t("restaurar.confirmarReemplaza"),
    t("restaurar.confirmarSync"),
    t("restaurar.confirmarReinicio"),
  ].filter(Boolean).join("\n\n");

  return {
    resumen, trabajando, error, cerrando, noCerro,
    elegir, confirmar, cancelar, mensajeConfirmar,
  };
}
