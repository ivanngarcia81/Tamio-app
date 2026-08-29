/**
 * ZonaSensibleSettingsIOS.tsx — «Zona sensible» en el teléfono (maqueta S9).
 *
 * La zona dejó de ser una lista de iguales. En escritorio, respaldar,
 * restaurar, compactar y borrarlo todo eran cuatro filas del mismo tamaño con
 * cuatro botones del mismo tamaño; la única diferencia era el color del tile,
 * y el color del tile no frena a nadie. Aquí:
 *
 * - **Lo peligroso ya no comparte tarjeta con lo inocuo.** Cada acción
 *   irreversible es su propia tarjeta, con una frase de consecuencia contada
 *   en CIFRAS REALES —las de esta iglesia, leídas de la base— y un solo botón.
 * - **La primera tarjeta es la salida de emergencia**: respaldar, antes de que
 *   exista la tentación. Y dice cuándo fue el último respaldo, que es el dato
 *   que decide si hace falta uno nuevo.
 * - **«Continuar…»**, con los puntos suspensivos: el botón rojo de esta
 *   pantalla no borra nada, abre la pantalla que sí (`ConfirmarBorradoIOS`).
 *
 * Reescritura del MARCADO: respaldar, restaurar, compactar y borrar siguen
 * llamando exactamente a lo que llamaban las tarjetas de escritorio.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import {
  borrarDatosIglesia, contarDatosIglesia, fmtRelativo, reinicioDeFabrica,
  type Church, type InventarioIglesia,
} from "../../db";
import { compactarBase, contarPurgables } from "../../sync";
import { SYNC_HABILITADO } from "../../syncManager";
import {
  backupDatabase, exportMiembrosCsv, exportMovimientosCsv, ultimoRespaldo,
  type BackupResult, type UltimoRespaldo,
} from "../../services/backup";
import { showToast } from "../../toast";
import { IconWarn } from "../../icons";
import { IOSPantalla, IosChevron, Section } from "../ios/FormularioIOS";
import ConfirmDialog from "../ConfirmDialog";
import ConfirmarBorradoIOS, { type AccionBorrado } from "./ConfirmarBorradoIOS";
import { useRestaurar } from "./restaurar";

/** "4.2 MB". Un decimal y nada más: el tamaño del respaldo sirve para saber
 *  si cabe en el correo, no para auditar bytes. */
function enMB(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Las tres cosas de las que más hay, dichas con su plural. Es la frase de
 *  consecuencia de la tarjeta roja, y se arma con lo que esta iglesia tiene
 *  de verdad: en una recién instalada no puede salir «312 miembros». */
function frasePerdida(inv: InventarioIglesia | null): string | null {
  if (!inv) return null;
  const piezas = (Object.keys(inv) as (keyof InventarioIglesia)[])
    .map((clave) => ({ clave, n: inv[clave] }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((x) => i18n.t(`inventario.n.${x.clave}`, { count: x.n }));
  if (piezas.length === 0) return i18n.t("zonaSensible.nadaCapturado");
  /* "a, b y c" a mano y no con `Intl.ListFormat`: la conjunción es UNA
     palabra y la trae el diccionario, mientras que `ListFormat` obligaría a
     subir el `lib` de TypeScript para las dos únicas listas de la app. */
  const lista = piezas.length === 1
    ? piezas[0]
    : `${piezas.slice(0, -1).join(", ")} ${i18n.t("common.y")} ${piezas[piezas.length - 1]}`;
  return i18n.t("zonaSensible.seVan", { lista });
}

interface Props {
  church: Church;
}

export default function ZonaSensibleSettingsIOS({ church }: Props) {
  const { t } = useTranslation();

  /* ---- Respaldo ---- */
  const [respaldando, setRespaldando] = useState(false);
  const [ultimo, setUltimo] = useState<UltimoRespaldo | null>(() => ultimoRespaldo());
  const [errorRespaldo, setErrorRespaldo] = useState<string | null>(null);
  /** La subpantalla de exportar a CSV. */
  const [exportando, setExportando] = useState(false);
  const [exportandoQue, setExportandoQue] = useState<"movimientos" | "miembros" | null>(null);

  /* ---- Restaurar: el mismo estado que usa la tarjeta de escritorio ---- */
  const r = useRestaurar();

  /* ---- Mantenimiento ---- */
  const [purgables, setPurgables] = useState<number | null>(null);
  const [compactando, setCompactando] = useState(false);

  /* ---- Borrado ---- */
  const [inventario, setInventario] = useState<InventarioIglesia | null>(null);
  const [borrado, setBorrado] = useState<AccionBorrado | null>(null);

  useEffect(() => {
    contarDatosIglesia(church.id).then(setInventario).catch(() => setInventario(null));
    contarPurgables(church.id).then(setPurgables).catch(() => setPurgables(null));
  }, [church.id]);

  async function respaldar() {
    setErrorRespaldo(null);
    setRespaldando(true);
    try {
      const res = await backupDatabase();
      if (res === "guardado") {
        setUltimo(ultimoRespaldo());
        showToast(t("respaldo.guardado"));
      } else if (res === "vacio") {
        setErrorRespaldo(t("respaldo.sinDatos"));
      }
      // "cancelado": cerró el diálogo — sin mensaje.
    } catch (e) {
      setErrorRespaldo(t("common.noSePudoExportar", { error: String(e) }));
    } finally {
      setRespaldando(false);
    }
  }

  async function exportarCsv(que: "movimientos" | "miembros", fn: () => Promise<BackupResult>) {
    setErrorRespaldo(null);
    setExportandoQue(que);
    try {
      const res = await fn();
      if (res === "guardado") showToast(t("respaldo.guardado"));
      else if (res === "vacio") setErrorRespaldo(t("respaldo.sinDatos"));
    } catch (e) {
      setErrorRespaldo(t("common.noSePudoExportar", { error: String(e) }));
    } finally {
      setExportandoQue(null);
    }
  }

  async function compactar() {
    setCompactando(true);
    try {
      const res = await compactarBase(church.id);
      if (!res.ok) {
        showToast(t("compactar.error", { error: res.error ?? "" }));
      } else {
        showToast(res.filasLocal > 0 ? t("compactar.listo", { count: res.filasLocal }) : t("compactar.yaCompacta"));
        setPurgables(await contarPurgables(church.id).catch(() => null));
      }
    } catch (e) {
      showToast(t("compactar.error", { error: String(e) }));
    } finally {
      setCompactando(false);
    }
  }

  async function ejecutarBorrado() {
    if (borrado === "datos") {
      await borrarDatosIglesia(church.id);
    } else {
      await reinicioDeFabrica();
      // Vuelve a mostrarse la bienvenida en la app reiniciada.
      try { localStorage.removeItem("tesoreria-welcomed"); } catch { /* noop */ }
    }
    // Recarga para reconstruir todo el estado desde la base ya limpia.
    window.location.reload();
  }

  const perdida = frasePerdida(inventario);
  const hayQueCompactar = (purgables ?? 0) > 0;
  const cuandoUltimo = ultimo ? fmtRelativo(ultimo.cuando) : null;

  return (
    <div className="ios-form">
      {/* 1 · La salida de emergencia. Va PRIMERA, antes que nada de lo que
          hay debajo: un respaldo tarda segundos y es lo único que puede
          devolver lo que se pierda. */}
      <section className="ios-section">
        <div className="ios-tarjeta-aviso">
          <div className="ita-cuerpo">
            <span className="ita-titulo">{t("zonaSensible.antesDeTocar")}</span>
            <span className="ita-texto">
              {cuandoUltimo
                ? t("zonaSensible.antesDeTocarConFecha", { cuando: cuandoUltimo })
                : t("zonaSensible.antesDeTocarSinFecha")}
            </span>
          </div>
          <button type="button" className="ita-accion" onClick={() => void respaldar()} disabled={respaldando}>
            {respaldando ? t("common.generando") : t("zonaSensible.respaldarAhora")}
          </button>
        </div>
      </section>

      {/* 2 · Los respaldos, como datos: cuándo fue el último y por dónde sale
          una copia. Nada de esto pierde nada. */}
      <Section header={t("zonaSensible.grupoRespaldos")} footer={t("zonaSensible.pieRespaldos")}>
        <div className="ios-row ios-row--dato ios-row--rasa">
          <span className="ios-row-label">{t("zonaSensible.ultimoRespaldo")}</span>
          <span className="ios-row-value">
            {cuandoUltimo
              ? (ultimo?.bytes ? `${cuandoUltimo} · ${enMB(ultimo.bytes)}` : cuandoUltimo)
              : t("zonaSensible.ninguno")}
          </span>
        </div>
        <button type="button" className="ios-row ios-row--rasa" onClick={() => setExportando(true)}>
          <span className="ios-row-label">{t("zonaSensible.exportarArchivo")}</span>
          <IosChevron />
        </button>
      </Section>

      {/* 3 · Mantenimiento. Tampoco pierde nada —solo tira lo ya borrado— y
          por eso va antes de las dos que sí. El estado es la NOTA de la fila:
          es lo que explica por qué el botón está o no disponible. */}
      <Section header={t("zonaSensible.grupoMantenimiento")} footer={t("zonaSensible.pieMantenimiento")}>
        <button
          type="button"
          className="ios-row ios-row--rasa ios-row--dos"
          onClick={() => void compactar()}
          disabled={compactando || !hayQueCompactar}
        >
          <span className="ios-row-textos">
            <span className="ios-row-label">{t("compactar.titulo")}</span>
            <span className="ios-row-sub">
              {purgables === null
                ? "—"
                : hayQueCompactar
                  ? t("compactar.pendientes", { count: purgables })
                  : t("compactar.estaCompacta")}
            </span>
          </span>
          {hayQueCompactar && <IosChevron />}
        </button>
      </Section>

      {/* 4 · Restaurar. Sustituye: es la primera de las graves, y por eso sale
          de la tarjeta de los respaldos y se queda sola en la suya. */}
      <section className="ios-section">
        <div className="ios-group">
          <button type="button" className="ios-row ios-row--rasa ios-row--dos" onClick={() => void r.elegir()} disabled={r.trabajando}>
            <span className="ios-row-textos">
              <span className="ios-row-label">{t("restaurar.titulo")}</span>
              <span className="ios-row-sub ios-row-sub--dos">{t("zonaSensible.restaurarNota")}</span>
            </span>
            <IosChevron />
          </button>
        </div>
        {r.cerrando && !r.noCerro && <p className="ios-section-footer">{t("restaurar.cerrando")}</p>}
        {r.noCerro && <p className="ios-section-footer ios-pie-aviso"><IconWarn size={13} /> {t("restaurar.noCerro")}</p>}
        {r.error && <p className="ios-section-footer ios-pie-aviso"><IconWarn size={13} /> {r.error}</p>}
      </section>

      {/* 5 y 6 · Las dos que no tienen vuelta atrás, cada una en su tarjeta con
          contorno rojo y su propia frase de consecuencia. El botón termina en
          «Continuar…»: no borra, abre la pantalla que pregunta. */}
      <section className="ios-section">
        <div className="ios-tarjeta-aviso ios-tarjeta-aviso--peligro">
          <div className="ita-cuerpo">
            <span className="ita-titulo">{t("reset.borrarDatosTitulo")}</span>
            <span className="ita-texto">
              {perdida}{perdida ? " " : ""}
              {SYNC_HABILITADO ? t("zonaSensible.tambienEnLosDemas") : t("zonaSensible.seConservaConfig")}
            </span>
          </div>
          <button type="button" className="ita-accion" onClick={() => setBorrado("datos")}>
            {t("zonaSensible.continuar")}
          </button>
        </div>
      </section>

      <section className="ios-section">
        <div className="ios-tarjeta-aviso ios-tarjeta-aviso--peligro">
          <div className="ita-cuerpo">
            <span className="ita-titulo">{t("reset.fabricaTitulo")}</span>
            <span className="ita-texto">{t("zonaSensible.fabricaFrase")}</span>
          </div>
          <button type="button" className="ita-accion" onClick={() => setBorrado("fabrica")}>
            {t("zonaSensible.continuar")}
          </button>
        </div>
        <p className="ios-section-footer">{t("zonaSensible.pieBorrado")}</p>
      </section>

      {errorRespaldo && (
        <section className="ios-section">
          <p className="ios-section-footer ios-pie-aviso"><IconWarn size={13} /> {errorRespaldo}</p>
        </section>
      )}

      {/* Sello de compilación: una captura basta para saber qué versión está
          corriendo. Estaba en la tarjeta de restaurar del escritorio. */}
      <p className="ios-section-footer ios-pie-compilacion">
        {t("restaurar.compilacion", { fecha: __FECHA_BUILD__ })}
      </p>

      {exportando && (
        <IOSPantalla
          titulo={t("zonaSensible.exportarArchivo")}
          volverA={t("config.zona.delicada")}
          onVolver={() => setExportando(false)}
        >
          <Section footer={t("zonaSensible.pieExportar")}>
            <button
              type="button"
              className="ios-row ios-row--rasa"
              onClick={() => void exportarCsv("movimientos", () => exportMovimientosCsv(church.id))}
              disabled={exportandoQue !== null}
            >
              <span className="ios-row-label">{t("respaldo.exportarMovimientos")}</span>
              {exportandoQue === "movimientos" && <span className="ios-row-value">{t("common.generando")}</span>}
            </button>
            <button
              type="button"
              className="ios-row ios-row--rasa"
              onClick={() => void exportarCsv("miembros", () => exportMiembrosCsv(church.id))}
              disabled={exportandoQue !== null}
            >
              <span className="ios-row-label">{t("respaldo.exportarMiembros")}</span>
              {exportandoQue === "miembros" && <span className="ios-row-value">{t("common.generando")}</span>}
            </button>
          </Section>
        </IOSPantalla>
      )}

      {borrado && (
        <ConfirmarBorradoIOS
          church={church}
          accion={borrado}
          inventario={inventario}
          volverA={t("config.zona.delicada")}
          onVolver={() => setBorrado(null)}
          onConfirmar={ejecutarBorrado}
        />
      )}

      {/* El segundo aviso de restaurar dice QUÉ TRAE el paquete elegido, que es
          lo que delata el archivo equivocado. Se queda como diálogo: es una
          decisión de sí o no sobre algo que ya se eligió, no una pantalla. */}
      {r.resumen && (
        <ConfirmDialog
          danger
          title={t("restaurar.confirmarTitulo")}
          message={r.mensajeConfirmar(r.resumen)}
          confirmLabel={t("restaurar.confirmarBoton")}
          onConfirm={r.confirmar}
          onCancel={r.cancelar}
        />
      )}
    </div>
  );
}
