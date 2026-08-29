import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { fmtMoney, type Church } from "../../db";
import {
  listarComprobantesPendientes, reasignarComprobante, type ComprobantePendiente,
} from "../../services/comprobantes";
import { IconCheck, IconUpload, IconWarn } from "../../icons";
import { showToast } from "../../toast";
import { playSound } from "../../sound";
import { esMovil } from "../../movil";
import { Section } from "../ios/FormularioIOS";

interface Props {
  church: Church;
}

/**
 * Comprobantes que quedaron apuntando fuera de la carpeta de la app y que la
 * migración no pudo traer adentro.
 *
 * Por qué existe esta tarjeta y no basta con que Rust copie:
 *
 * Rust resuelve el caso de hoy —lee iCloud, discos externos, cualquier ruta que
 * el sistema permita— pero no todos. Si algún día Tamio se empaqueta para el
 * sandbox del Mac App Store, ni Rust puede leer rutas arbitrarias que el
 * usuario no haya elegido explícitamente en un diálogo. **El diálogo de
 * archivos concede acceso siempre, con sandbox o sin él: es el único mecanismo
 * garantizado.**
 *
 * Y aparte de lo técnico, es lo honesto: sin esta lista el tesorero descubre
 * que falta un comprobante meses después, cuando alguien se lo pide. Aquí lo ve
 * y lo arregla en dos clics.
 *
 * La tarjeta **no aparece** cuando no hay nada que recuperar, que es el caso
 * normal: no tiene sentido ocupar sitio en Ajustes para decir "todo bien".
 */
export default function ComprobantesPendientes({ church }: Props) {
  const { t } = useTranslation();
  const [pendientes, setPendientes] = useState<ComprobantePendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clave = (p: ComprobantePendiente) => `${p.tabla}:${p.id}`;

  const recargar = useCallback(() => {
    listarComprobantesPendientes(church.id)
      .then(setPendientes)
      .catch(() => setPendientes([]))
      .finally(() => setCargando(false));
  }, [church.id]);

  useEffect(recargar, [recargar]);

  async function volverAElegir(p: ComprobantePendiente) {
    setError(null);
    try {
      const elegido = await openFileDialog({
        multiple: false,
        title: t("comprobantesPendientes.elegirTitulo"),
        filters: [{ name: t("tx.comprobante"), extensions: ["pdf", "png", "jpg", "jpeg", "heic"] }],
      });
      if (typeof elegido !== "string") return; // canceló
      setTrabajando(clave(p));
      await reasignarComprobante(p, elegido, church.id);
      playSound("guardado");
      showToast(t("comprobantesPendientes.recuperado"));
      recargar();
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
    } finally {
      setTrabajando(null);
    }
  }

  if (cargando || pendientes.length === 0) return null;

  /* En el teléfono y el iPad la zona sensible es una lista agrupada, y una
     tarjeta de escritorio metida al final se veía como un parche pegado. Es
     el MISMO contenido —qué comprobante falta, de qué movimiento, y el botón
     para volver a señalarlo— en filas de dos líneas. La ruta original va en
     el `title` y no en la fila: en 393 px no cabe, y quien la necesita la
     necesita para buscar el archivo, no para reconocer el movimiento. */
  if (esMovil()) {
    return (
      <Section
        header={t("comprobantesPendientes.titulo")}
        footer={error
          ? <span className="ios-pie-aviso"><IconWarn size={13} /> {error}</span>
          : t("comprobantesPendientes.explicacion")}
      >
        {pendientes.map((p) => (
          <button
            type="button"
            className="ios-row ios-row--rasa ios-row--dos"
            key={clave(p)}
            onClick={() => void volverAElegir(p)}
            disabled={trabajando !== null}
            title={p.rutaOriginal}
          >
            <span className="ios-row-textos">
              <span className="ios-row-label">{p.descripcion} · {fmtMoney(p.monto)}</span>
              <span className="ios-row-sub">{p.fecha}</span>
            </span>
            <span className="ios-row-value">
              {trabajando === clave(p) ? t("common.guardando") : t("comprobantesPendientes.volverAElegir")}
            </span>
          </button>
        ))}
      </Section>
    );
  }

  return (
    <div className="card pad-lg settings-card">
      <div className="card-head">
        <div className="card-head-left">
          <div className="card-icon"><IconWarn size={16} /></div>
          <div className="card-head-titles">
            <div className="card-title-lg">{t("comprobantesPendientes.titulo")}</div>
            <div className="card-title-sub">
              {t("comprobantesPendientes.sub", { count: pendientes.length })}
            </div>
          </div>
        </div>
      </div>

      <div className="form-hint" style={{ marginBottom: "var(--space-3)" }}>
        {t("comprobantesPendientes.explicacion")}
      </div>

      <div className="pendientes-lista">
        {pendientes.map((p) => (
          <div className="pendiente-fila" key={clave(p)}>
            <div className="pendiente-datos">
              <div className="pendiente-titulo">
                {p.descripcion} · <b>{fmtMoney(p.monto)}</b>
              </div>
              <div className="pendiente-meta">{p.fecha}</div>
              <div className="pendiente-ruta" title={p.rutaOriginal}>{p.rutaOriginal}</div>
            </div>
            <button
              type="button"
              className="btn secondary sm"
              onClick={() => volverAElegir(p)}
              disabled={trabajando !== null}
            >
              {trabajando === clave(p)
                ? <><IconCheck size={13} /> {t("common.guardando")}</>
                : <><IconUpload size={13} /> {t("comprobantesPendientes.volverAElegir")}</>}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "var(--space-3)" }}>
          <IconWarn size={13} /> {error}
        </div>
      )}
    </div>
  );
}
