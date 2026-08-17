/**
 * CuentaSettingsIOS.tsx — pantalla "Cuenta" con el patrón de LISTA de iOS
 * (no de formulario: aquí no se edita nada, cada fila navega o dispara una
 * acción). Reutiliza `.ios-section`/`.ios-group`/`.ios-row`/`.ios-chevron`
 * — las mismas piezas ya usadas por el índice de Ajustes (Package 1) — en
 * vez de las piezas de formulario (`Section`/`TextField`) del resto de
 * pantallas de Ajustes, porque esta pantalla nunca fue un formulario.
 *
 * Mismos props que la sección "cuenta" ya tenía en Configuracion.tsx:
 * reescritura del MARCADO, no de a dónde lleva cada fila.
 */
import { useTranslation } from "react-i18next";
import { IconHelp, IconInfo, IconLogout, IconUser } from "../../icons";
import { iniciales } from "../../services/avatar";
import SyncIndicator from "../SyncIndicator";
import { SYNC_HABILITADO } from "../../syncManager";
import { IosChevron } from "../ios/FormularioIOS";

interface Props {
  authActivo: boolean;
  sesionEmail?: string | null;
  sesionNombre?: string | null;
  sesionFoto?: string | null;
  onEditarPerfil?: () => void;
  onAyuda: () => void;
  onAcercaDe: () => void;
  onCerrarSesion: () => void;
}

export default function CuentaSettingsIOS({
  authActivo, sesionEmail, sesionNombre, sesionFoto, onEditarPerfil, onAyuda, onAcercaDe, onCerrarSesion,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="ios-form">
      {authActivo && (
        <section className="ios-section">
          <div className="ios-group">
            <button type="button" className="ios-row" onClick={onEditarPerfil}>
              <span className="ios-icon" style={{ background: "var(--accent-4, #06b6d4)" }}>
                {sesionFoto
                  ? <img src={sesionFoto} alt="" />
                  : <span className="ios-icon-texto">{iniciales(sesionNombre ?? null, sesionEmail ?? null) || <IconUser size={15} />}</span>}
              </span>
              <span className="ios-row-textos">
                <span className="ios-row-label">{(sesionNombre && sesionNombre.trim()) || t("cuenta.sinNombre")}</span>
                {sesionEmail && <span className="ios-row-sub">{sesionEmail}</span>}
              </span>
              <IosChevron />
            </button>
            {SYNC_HABILITADO && (
              <div className="ios-row">
                <SyncIndicator />
              </div>
            )}
          </div>
        </section>
      )}

      <section className="ios-section">
        <div className="ios-group">
          <button type="button" className="ios-row" onClick={onAyuda}>
            <span className="ios-icon" style={{ background: "var(--text-3)" }}><IconHelp size={15} /></span>
            <span className="ios-row-label">{t("cuenta.ayuda")}</span>
            <IosChevron />
          </button>
          <button type="button" className="ios-row" onClick={onAcercaDe}>
            <span className="ios-icon" style={{ background: "var(--text-3)" }}><IconInfo size={15} /></span>
            <span className="ios-row-label">{t("cuenta.acercaDe")}</span>
            <IosChevron />
          </button>
        </div>
      </section>

      {authActivo && (
        <section className="ios-section">
          <div className="ios-group">
            <button type="button" className="ios-row ios-row--destructive" onClick={onCerrarSesion}>
              <span className="ios-icon" style={{ background: "var(--ios-red)" }}><IconLogout size={15} /></span>
              <span className="ios-row-label">{t("cuenta.cerrarSesion")}</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
