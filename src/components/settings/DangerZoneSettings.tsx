import { useState } from "react";
import { useTranslation } from "react-i18next";
import { borrarDatosIglesia, reinicioDeFabrica, type Church } from "../../db";
import { IconWarn } from "../../icons";

interface Props {
  church: Church;
}

type Accion = "datos" | "fabrica";

/** Zona de peligro (solo administrador): borra registros conservando la
 *  configuración (A) o reinicia de fábrica todo (B). Cada acción exige escribir
 *  una palabra de confirmación y recarga la app al terminar para partir de un
 *  estado limpio. Es irreversible: conviene exportar un respaldo antes. */
export default function DangerZoneSettings({ church }: Props) {
  const { t } = useTranslation();
  const [accion, setAccion] = useState<Accion | null>(null);
  const [texto, setTexto] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const palabra = t("reset.palabraConfirmar");
  const habilitado = texto.trim().toUpperCase() === palabra.toUpperCase();

  function abrir(a: Accion) { setAccion(a); setTexto(""); setError(null); }
  function cerrar() { if (!trabajando) { setAccion(null); setTexto(""); setError(null); } }

  async function confirmar() {
    if (!habilitado || !accion) return;
    setTrabajando(true);
    setError(null);
    try {
      if (accion === "datos") {
        await borrarDatosIglesia(church.id);
      } else {
        await reinicioDeFabrica();
        // Vuelve a mostrarse la bienvenida y el tutorial en la app reiniciada.
        try {
          localStorage.removeItem("tesoreria-welcomed");
          localStorage.removeItem("tamio-tour-hecho-v2");
        } catch { /* noop */ }
      }
      // Recarga para reconstruir todo el estado desde la base ya limpia.
      window.location.reload();
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
      setTrabajando(false);
    }
  }

  return (
    <div className="card pad-lg settings-card danger-zone">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-head-titles">
            <div className="card-title-lg">{t("reset.titulo")}</div>
            <div className="card-title-sub">{t("reset.sub")}</div>
          </div>
        </div>
      </div>

      <div className="danger-row">
        <div style={{ minWidth: 0 }}>
          <div className="danger-row-title">{t("reset.borrarDatosTitulo")}</div>
          <div className="form-hint">{t("reset.borrarDatosDesc")}</div>
        </div>
        <button type="button" className="btn danger-btn" onClick={() => abrir("datos")}>{t("reset.borrarDatosBtn")}</button>
      </div>

      <div className="danger-row">
        <div style={{ minWidth: 0 }}>
          <div className="danger-row-title">{t("reset.fabricaTitulo")}</div>
          <div className="form-hint">{t("reset.fabricaDesc")}</div>
        </div>
        <button type="button" className="btn danger-btn" onClick={() => abrir("fabrica")}>{t("reset.fabricaBtn")}</button>
      </div>

      {accion && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
          <div className="modal-card" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div><div className="modal-title">{t("reset.confirmarTitulo")}</div></div>
            </div>
            <div className="modal-body">
              <div className="form-warning" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <IconWarn size={15} />
                <span>{accion === "datos" ? t("reset.confirmarDatos") : t("reset.confirmarFabrica")}</span>
              </div>
              <div className="form-group full" style={{ marginTop: 14 }}>
                <label className="form-label">{t("reset.escribePalabra", { palabra })}</label>
                <input
                  className="form-input"
                  value={texto}
                  autoFocus
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && habilitado) confirmar(); }}
                  placeholder={palabra}
                />
              </div>
              {error && (
                <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <IconWarn size={13} /> {error}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <div />
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn secondary" onClick={cerrar} disabled={trabajando}>{t("common.cancelar")}</button>
                <button className="btn primary danger" onClick={confirmar} disabled={!habilitado || trabajando}>
                  {trabajando ? t("common.guardando") : (accion === "datos" ? t("reset.borrarDatosBtn") : t("reset.fabricaBtn"))}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
