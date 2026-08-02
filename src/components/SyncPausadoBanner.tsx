import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { reactivarSync, syncPausadoPorRestauracion } from "../services/restaurar";
import { IconWarn } from "../icons";

/**
 * Aviso persistente tras restaurar un respaldo.
 *
 * No es un toast a propósito: un toast se va solo y esto tiene que seguir ahí
 * mañana si el tesorero no ha revisado nada. Mientras esté visible, la
 * sincronización no corre.
 *
 * El motivo de la pausa está en `services/restaurar.ts`: con last-write-wins,
 * dejar que la nube y lo recién restaurado se mezclen solos da un resultado
 * malo en los dos sentidos posibles, y la decisión de cuál debe ganar es de un
 * humano que mire los datos primero.
 */
export default function SyncPausadoBanner() {
  const { t } = useTranslation();
  const [pausado, setPausado] = useState(syncPausadoPorRestauracion);

  // Otra pestaña o el propio arranque pueden cambiar la bandera.
  useEffect(() => {
    const onStorage = () => setPausado(syncPausadoPorRestauracion());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!pausado) return null;

  return (
    <div className="sync-pausado">
      <span className="sync-pausado-icono"><IconWarn size={15} /></span>
      <div className="sync-pausado-texto">
        <b>{t("restaurar.syncPausadoTitulo")}</b> — {t("restaurar.syncPausadoTexto")}
      </div>
      <button
        className="btn secondary sm"
        onClick={() => { reactivarSync(); setPausado(false); }}
      >
        {t("restaurar.syncReactivar")}
      </button>
    </div>
  );
}
