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
import { IconHelp, IconInfo, IconUser } from "../../icons";
import { iniciales } from "../../services/avatar";
import SyncIndicator from "../SyncIndicator";
import { SYNC_HABILITADO } from "../../syncManager";
import { IosChevron } from "../ios/FormularioIOS";

interface Props {
  authActivo: boolean;
  /** Versión de la app, para la fila del grupo «Aplicación». */
  version?: string | null;
  /** Rol y áreas: la respuesta a «¿con qué permisos entro?». */
  rol?: string;
  areas?: string;
  sesionEmail?: string | null;
  sesionNombre?: string | null;
  sesionFoto?: string | null;
  onEditarPerfil?: () => void;
  onAyuda: () => void;
  onAcercaDe: () => void;
  onCerrarSesion: () => void;
}

export default function CuentaSettingsIOS({
  authActivo, version, rol, areas, sesionEmail, sesionNombre, sesionFoto,
  onEditarPerfil, onAyuda, onAcercaDe, onCerrarSesion,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="ios-form">
      {/* La identidad no es una fila: es una TARJETA con avatar de 56, nombre,
          correo y el rol con sus áreas. Es la respuesta a «¿con qué permisos
          estoy entrando?», que no es un ajuste más de una lista —y como fila
          de 44 no le cabía ni el correo entero (maqueta S2). */}
      {authActivo && (
        <section className="ios-section">
          <button type="button" className="ios-tarjeta-cuenta" onClick={onEditarPerfil}>
            <span className="itc-avatar">
              {sesionFoto
                ? <img src={sesionFoto} alt="" />
                : (iniciales(sesionNombre ?? null, sesionEmail ?? null) || <IconUser size={22} />)}
            </span>
            <span className="itc-textos">
              <span className="itc-nombre">{(sesionNombre && sesionNombre.trim()) || t("cuenta.sinNombre")}</span>
              {sesionEmail && <span className="itc-linea">{sesionEmail}</span>}
              {rol && <span className="itc-linea">{areas ? `${rol} · ${areas}` : rol}</span>}
            </span>
            <IosChevron />
          </button>
          {SYNC_HABILITADO && (
            <div className="ios-group">
              <div className="ios-row"><SyncIndicator /></div>
            </div>
          )}
        </section>
      )}

      {/* APLICACIÓN: la versión y adónde se pregunta por ella. La versión es
          un DATO, así que va como valor a la derecha y sin galón —no lleva a
          ninguna parte—; hasta ahora vivía en un `<p>` suelto al pie del
          índice, que es donde nadie la busca cuando hace falta para reportar
          un fallo. */}
      <section className="ios-section">
        <h2 className="ios-section-header">{t("cuenta.aplicacion")}</h2>
        <div className="ios-group">
          {version && (
            <div className="ios-row ios-row--dato">
              <span className="ios-icon" style={{ background: "var(--text-3)" }}><IconInfo size={15} /></span>
              <span className="ios-row-label">{t("cuenta.version")}</span>
              <span className="ios-row-value">{version}</span>
            </div>
          )}
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

      {/* Centrada y sola en su grupo, sin icono: es el patrón de iOS para la
          única acción de una pantalla. Y el pie desactiva el miedo ANTES de
          que aparezca —quien duda de si perderá datos no toca el botón. */}
      {authActivo && (
        <section className="ios-section">
          <div className="ios-group">
            <button type="button" className="ios-row ios-row--centrada ios-row--destructive" onClick={onCerrarSesion}>
              <span className="ios-row-label">{t("cuenta.cerrarSesion")}</span>
            </button>
          </div>
          <p className="ios-section-footer">{t("cuenta.pieCerrarSesion")}</p>
        </section>
      )}
    </div>
  );
}
