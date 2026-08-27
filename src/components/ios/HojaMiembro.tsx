import { useTranslation } from "react-i18next";
import { fmtFechaCorta, type Member } from "../../db";
import { camposFaltantes, estadoEfectivo, type AsistenciaMiembro } from "../../services/informes/membresia";
import type { Detente } from "./HojaDetentesIOS";

/** Iniciales para el círculo, con la misma regla que la lista del padrón. */
function inicialesDe(nombre: string): string {
  return nombre.split(" ").filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    || nombre.slice(0, 2).toUpperCase();
}

interface Props {
  m: Member;
  detente: Detente;
  asis: AsistenciaMiembro | undefined;
  alertas: string[];
  onSubir: () => void;
  onVisita: () => void;
  onExpediente: () => void;
  onBaja: () => void;
}

/**
 * El cuerpo de la hoja de Membresía en sus dos alturas cortas.
 *
 * La tercera —la ficha entera— no pasa por aquí: la pinta `DetalleMembresia`,
 * que es la misma columna que el iPad ya tenía. Aquí solo viven las dos que la
 * maqueta describe como el trabajo del día a día:
 *
 * - **Asomada** (113 px): quién es y qué le pasa. Nada más. Es lo que se mira
 *   de reojo mientras se recorre el padrón, y por eso cabe en dos renglones:
 *   si hubiera que leerlo, ya no sería de reojo.
 * - **Media** (57 %): «la altura que se usa el 90 % del tiempo». Por qué me
 *   importa este miembro (la alerta), tres cifras, y las tres cosas que se
 *   hacen con él.
 *
 * Las tres cifras y las tres acciones son las de la maqueta, y las tres
 * acciones llevan a lo que YA existe en el repo: anotar una visita abre
 * `SeguimientoModal`, completar el expediente abre la ficha, y dar de baja
 * abre `BajaMemberModal` con su motivo obligatorio. Ninguna es nueva.
 */
export default function HojaMiembro({
  m, detente, asis, alertas, onSubir, onVisita, onExpediente, onBaja,
}: Props) {
  const { t } = useTranslation();
  const estado = estadoEfectivo(m);
  const faltan = camposFaltantes(m);
  const pct = asis?.pct ?? null;

  /* La línea de la altura asomada: el estado y, si lo hay, el pendiente. Es
     lo único que la maqueta deja ver ahí, y en ese orden — primero qué es,
     después qué le falta. */
  const resumen = [
    t(`membresia.estado.${estado}`),
    alertas[0] ?? (faltan.length > 0 ? t("membresia.expPorLlenar", { count: faltan.length }) : null),
  ].filter(Boolean).join(" · ");

  return (
    <div className="hm">
      <div className="hm-cabeza">
        <span className="hm-avatar" aria-hidden="true">{inicialesDe(m.nombre)}</span>
        <span className="hm-quien">
          <span className="hm-nombre">{m.nombre}</span>
          <span className="hm-sub">{resumen}</span>
        </span>
      </div>

      {detente === "media" && (
        <>
          {/* La alerta primero: es la respuesta a «por qué me importa este
              miembro», y sin ella las tres cifras de abajo son solo datos. */}
          {alertas.length > 0 && (
            <p className="hm-alerta">{alertas.join(" · ")}</p>
          )}

          <div className="hm-cifras">
            <span className="hm-cifra">
              <span className="hm-cifra-rot">{t("membresia.colAsistencia")}</span>
              <span className="hm-cifra-num">{pct === null ? "—" : `${pct}%`}</span>
              <span className="hm-cifra-pie">
                {asis ? `${asis.asistidos} / ${asis.enRoster}` : "—"}
              </span>
            </span>
            <span className="hm-cifra">
              <span className="hm-cifra-rot">{t("membresia.expediente")}</span>
              <span className={`hm-cifra-num${faltan.length > 0 ? " es-aviso" : ""}`}>{faltan.length || "✓"}</span>
              <span className="hm-cifra-pie">
                {faltan.length > 0 ? t("membresia.expPorLlenar", { count: faltan.length }) : t("membresia.expCompleto")}
              </span>
            </span>
            <span className="hm-cifra">
              <span className="hm-cifra-rot">{t("membresia.ultimaVisita")}</span>
              <span className="hm-cifra-num hm-cifra-num--fecha">
                {asis?.ultimaAsistencia ? fmtFechaCorta(asis.ultimaAsistencia) : "—"}
              </span>
              <span className="hm-cifra-pie">
                {asis && asis.racha > 0 ? t("membresia.rachaServicios", { count: asis.racha }) : ""}
              </span>
            </span>
          </div>

          <div className="ios-listcard hm-acciones">
            <button type="button" className="ios-txrow ios-txrow--clickable" onClick={onVisita}>
              <div className="ios-txrow-main"><div className="ios-txrow-title es-accion">{t("membresia.anotarVisita")}</div></div>
            </button>
            <button type="button" className="ios-txrow ios-txrow--clickable" onClick={onExpediente}>
              <div className="ios-txrow-main"><div className="ios-txrow-title es-accion">{t("membresia.completarExpediente")}</div></div>
            </button>
            <button type="button" className="ios-txrow ios-txrow--clickable" onClick={onBaja}>
              <div className="ios-txrow-main"><div className="ios-txrow-title es-destructiva">{t("membresia.darDeBaja")}</div></div>
            </button>
          </div>

          <button type="button" className="hm-completa" onClick={onSubir}>
            {t("membresia.verFichaCompleta")}
          </button>
        </>
      )}
    </div>
  );
}
