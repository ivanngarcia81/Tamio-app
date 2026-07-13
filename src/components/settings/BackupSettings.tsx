import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Church } from "../../db";
import { backupDatabase, exportMiembrosCsv, exportMovimientosCsv, type BackupResult } from "../../services/backup";
import { IconCheck, IconDownload, IconWarn } from "../../icons";

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

  const boton = (accion: Accion, label: string, fn: () => Promise<BackupResult>) => (
    <button type="button" className="btn secondary" onClick={() => run(accion, fn)} disabled={working !== null}>
      {done === accion ? <IconCheck size={13} /> : <IconDownload size={13} />}{" "}
      {working === accion ? t("common.generando") : label}
    </button>
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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {boton("movimientos", t("respaldo.exportarMovimientos"), () => exportMovimientosCsv(church.id))}
        {boton("miembros", t("respaldo.exportarMiembros"), () => exportMiembrosCsv(church.id))}
        {boton("bd", t("respaldo.copiaBd"), backupDatabase)}
      </div>

      <div className="form-hint">{t("respaldo.hint")}</div>

      {error && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
          <IconWarn size={13} /> {error}
        </div>
      )}
    </div>
  );
}
