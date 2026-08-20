import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Church } from "../../db";
import { backupDatabase, exportMiembrosCsv, exportMovimientosCsv, type BackupResult } from "../../services/backup";
import { IconCheck, IconDownload, IconFileText, IconWarn } from "../../icons";
import FilaAccion from "./FilaAccion";

type Accion = "movimientos" | "miembros" | "bd";

interface Props {
  church: Church;
}

export default function BackupSettings({ church }: Props) {
  const { t } = useTranslation();
  const [working, setWorking] = useState<Accion | null>(null);
  const [done, setDone] = useState<Accion | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(accion: Accion, fn: () => Promise<BackupResult>) {
    setError(null);
    setDone(null);
    setWorking(accion);
    try {
      const result = await fn();
      if (result === "guardado") {
        setDone(accion);
        setTimeout(() => setDone(null), 2500);
      } else if (result === "vacio") {
        setError(t("respaldo.sinDatos"));
      }
      // "cancelado": el usuario cerró el diálogo — sin mensaje.
    } catch (e) {
      setError(t("common.noSePudoExportar", { error: String(e) }));
    } finally {
      setWorking(null);
    }
  }

  /* Una fila por acción, como el resto de la zona sensible: tile de color,
     qué hace y el botón. El icono de estado (✓ mientras dura el "guardado")
     se queda en el BOTÓN y no en el tile: el tile dice de qué es la fila y no
     debe cambiar de dibujo cada vez que se exporta algo. */
  const fila = (accion: Accion, titulo: string, nota: string, icono: ReactNode, tinte: string, fn: () => Promise<BackupResult>) => (
    <FilaAccion icono={icono} tinte={tinte} titulo={titulo} nota={nota}>
      <button type="button" className="btn secondary" onClick={() => run(accion, fn)} disabled={working !== null}>
        {done === accion && <IconCheck size={13} />}{" "}
        {working === accion ? t("common.generando") : t("respaldo.accion")}
      </button>
    </FilaAccion>
  );

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconDownload size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("respaldo.titulo")}</div>
            <div className="card-title-sub">{t("respaldo.sub")}</div>
          </div>
        </div>
      </div>

      {fila("bd", t("respaldo.copiaBd"), t("respaldo.copiaBdNota"), <IconDownload size={12} />, "var(--ios-green)", backupDatabase)}
      {fila("movimientos", t("respaldo.exportarMovimientos"), t("respaldo.exportarNota"), <IconFileText size={12} />, "var(--ios-blue)", () => exportMovimientosCsv(church.id))}
      {fila("miembros", t("respaldo.exportarMiembros"), t("respaldo.exportarNota"), <IconFileText size={12} />, "var(--ios-blue)", () => exportMiembrosCsv(church.id))}

      <div className="form-hint">{t("respaldo.hint")}</div>

      {error && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
          <IconWarn size={13} /> {error}
        </div>
      )}
    </div>
  );
}
