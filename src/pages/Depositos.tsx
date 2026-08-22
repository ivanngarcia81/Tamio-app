import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  countDepositos, currentMonth, currentYear, deleteDeposito, fmtFechaCorta, fmtMoney, listDepositos,
  mesLegible, monthDepositos, undeleteDeposito,
  type Church, type Deposito,
} from "../db";
import { EmptyState } from "../components/TxList";
import DepositoTable from "../components/DepositoTable";
import DepositoModal from "../components/DepositoModal";
import DetalleDeposito from "../components/DetalleDeposito";
import ComprobantePreview from "../components/ComprobantePreview";
import ConfirmDialog from "../components/ConfirmDialog";
import { useBarraEstado } from "../components/BarraEstado";
import LoadingState from "../components/LoadingState";
import Pagination from "../components/Pagination";
import { IconBank, IconClock, IconPlus } from "../icons";
import CountUp from "../components/CountUp";
import { CERO, sumar, type Centavos } from "../dinero";
import { useAbrirCrearDesdeMas } from "../hooks/useAbrirCrearDesdeMas";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { esIPad, esIPhone, esMac } from "../movil";
import { showToast } from "../toast";
import { playSound } from "../sound";

const PAGE_SIZE = 40;

interface Props {
  church: Church;
  refreshKey: number;
  onChanged: () => void;
}

export default function Depositos({ church, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const enIPhone = esIPhone();
  /* Maestro-detalle del iPad (docs/ipad-rediseno.md): mismos dos umbrales que
     Movimientos — partido desde 700, columnas desde 1150; entre medias el
     detalle EMPUJA a la lista. La lista mide 378px (la medida del diseño para
     esta pantalla, en styles.css). */
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const anchoColumnas = useMediaQuery("(min-width: 1150px)");
  const partido = esIPad() && anchoPartido;
  const angosto = partido && !anchoColumnas;
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [totalMes, setTotalMes] = useState<Centavos>(CERO);
  const [conteoMes, setConteoMes] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Deposito | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const mes = currentMonth();

  /* La fila abierta del maestro-detalle: un ID que se re-busca en cada
     recarga, no una copia congelada — editar refresca el panel en sitio y
     borrar lo cierra solo. `ultimoSel` conserva el último objeto real para
     que el panel no se vacíe a mitad de la animación de salida del empuje. */
  const [selId, setSelId] = useState<number | null>(null);
  const sel = selId != null ? depositos.find((d) => d.id === selId) ?? null : null;
  const ultimoSel = useRef<Deposito | null>(null);
  if (sel) ultimoSel.current = sel;
  const [pendingDeleteSel, setPendingDeleteSel] = useState<Deposito | null>(null);
  const [previewSel, setPreviewSel] = useState<string | null>(null);

  /* Pie de ventana (solo Mac): los del mes y su suma. `conteoMes` y
     `totalMes` ya venían calculados para las tarjetas de arriba. */
  useBarraEstado(t("barraEstado.depositos", {
    count: conteoMes,
    mes: mesLegible(mes),
    total: `${fmtMoney(totalMes)} ${church.moneda}`,
  }));

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([
      listDepositos(church.id),
      monthDepositos(church.id, mes),
      countDepositos(church.id, mes),
    ])
      .then(([nuevosDepositos, nuevoTotal, nuevoConteo]) => {
        if (cancelado) return;
        setDepositos(nuevosDepositos);
        setTotalMes(nuevoTotal);
        setConteoMes(nuevoConteo);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey, mes]);

  useEffect(() => setPage(1), [refreshKey]);

  // La fila tenía una sola tarjeta y tres cuartos vacíos. Estos dos derivados
  // salen de `depositos`, que ya se carga entero: no hacen falta consultas
  // nuevas. El año se mide por PERÍODO, igual que el resto de los totales.
  const anio = currentYear();
  const totalAnio = sumar(
    ...depositos.filter((d) => d.periodo.startsWith(anio)).map((d) => d.monto),
  );
  const ultimo = depositos.reduce<Deposito | null>(
    (mejor, d) => (mejor === null || d.fecha > mejor.fecha ? d : mejor),
    null,
  );

  function abrirNuevo() {
    setEditing(null);
    setModalOpen(true);
  }
  useAbrirCrearDesdeMas(abrirNuevo);

  function abrirEditar(dep: Deposito) {
    setEditing(dep);
    setModalOpen(true);
  }

  function cerrarModal() {
    setModalOpen(false);
    setEditing(null);
  }

  /** El mismo borrado con "Deshacer" de DepositoTable, para el botón Eliminar
   *  del panel de detalle (que no pasa por la tabla). Borrado suave: deshacer
   *  restaura la MISMA fila, con su mismo uid. */
  async function borrarSelConDeshacer(borrado: Deposito) {
    setPendingDeleteSel(null);
    setSelId(null);
    await deleteDeposito(borrado.id, borrado.church_id);
    onChanged();
    playSound("eliminar");
    showToast(t("deshacer.depositoEliminado"), {
      actionLabel: t("deshacer.accion"),
      onAction: async () => {
        await undeleteDeposito(borrado.id, borrado.church_id);
        onChanged();
      },
    });
  }

  /* ---- Piezas que se pintan en más de un sitio ----
     Las tres tarjetas del resumen salen en el layout de siempre Y en el
     maestro-detalle del iPad (en columnas viven en el panel derecho mientras
     no hay fila abierta; en el modo de empuje, arriba de la lista). */
  const resumenEscritorio = (
    <div className="summary-4 enter">
      <div className="stat-card accent" style={{ "--accent-color": "var(--accent-4)" } as CSSProperties}>
        <div className="stat-head">
          <span className="stat-label">{t("depositos.depositosDelMes")}</span>
          <div className="stat-icon neutral"><IconBank size={15} strokeWidth={1.8} /></div>
        </div>
        <div className="stat-value md">
          <CountUp value={totalMes} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
        </div>
        <div className="stat-foot">
          {t("depositos.conteo", { count: conteoMes, mes: mesLegible(mes) })}
        </div>
      </div>

      <div className="stat-card accent" style={{ "--accent-color": "var(--accent-3)" } as CSSProperties}>
        <div className="stat-head">
          <span className="stat-label">{t("depositos.totalAnio")}</span>
          <div className="stat-icon neutral"><IconBank size={15} strokeWidth={1.8} /></div>
        </div>
        <div className="stat-value md">
          <CountUp value={totalAnio} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
        </div>
        <div className="stat-foot">{anio}</div>
      </div>

      <div className="stat-card accent" style={{ "--accent-color": "var(--accent-1)" } as CSSProperties}>
        <div className="stat-head">
          <span className="stat-label">{t("depositos.ultimoDeposito")}</span>
          <div className="stat-icon neutral"><IconClock size={15} strokeWidth={1.8} /></div>
        </div>
        <div className="stat-value md">
          {ultimo
            ? <><CountUp value={ultimo.monto} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></>
            : <span style={{ color: "var(--text-3)" }}>—</span>}
        </div>
        <div className="stat-foot">
          {ultimo
            ? `${fmtFechaCorta(ultimo.fecha)} · ${ultimo.cuenta_banco}`
            : t("depositos.sinDepositos")}
        </div>
      </div>
    </div>
  );

  const estadoVacio = (
    <EmptyState
      titulo={t("depositos.emptyTitulo")}
      sub={t("depositos.emptySub")}
      icon={<IconBank size={22} strokeWidth={1.6} />}
      accion={{ label: t("depositos.nuevoDeposito"), onClick: abrirNuevo }}
      duplicaCrear
    />
  );

  /* Los grupos por período de la lista del maestro-detalle. Por PERÍODO y no
     por mes de la fecha a propósito: es como agrupan los totales y los
     reportes, así que un depósito de julio pagado el 2 de agosto sale bajo
     "Julio 2026" — donde suma. */
  const gruposPeriodo: { periodo: string; items: Deposito[] }[] = [];
  if (partido) {
    const ordenados = [...depositos].sort((a, b) =>
      a.periodo === b.periodo ? (a.fecha < b.fecha ? 1 : -1) : (a.periodo < b.periodo ? 1 : -1));
    for (const dep of ordenados) {
      const ultimoGrupo = gruposPeriodo[gruposPeriodo.length - 1];
      if (ultimoGrupo && ultimoGrupo.periodo === dep.periodo) ultimoGrupo.items.push(dep);
      else gruposPeriodo.push({ periodo: dep.periodo, items: [dep] });
    }
  }

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("depositos.titulo")}</div>
            {/* En Mac el subtítulo comparte renglón con los botones, así que
                lleva un DATO corto y no la frase que explica la pantalla —esa
                se fue al pie de la ventana, junto al recuento (BarraEstado).
                Mismo criterio que las otras nueve pantallas convertidas. */}
            <div className="page-sub">{esMac() ? mesLegible(mes) : t("depositos.sub")}</div>
          </div>
        )}
        {/* El botón se queda: `.btn-nuevo-cabecera` ya lo oculta en el
            teléfono, donde crear un depósito lo cubre el "+" flotante — el
            `useAbrirCrearDesdeMas(abrirNuevo)` de arriba es justo lo que
            conecta ese "+" con este mismo modal. */}
        <div className="header-actions">
          <button className="btn primary btn-nuevo-cabecera" onClick={abrirNuevo}>
            <IconPlus size={14} /> {t("depositos.nuevoDeposito")}
          </button>
        </div>
      </div>

      {/* ---- Maestro-detalle (iPad) ----
          Lista de 378px con los depósitos agrupados por período y el detalle
          al lado; el resumen del mes vive en el panel sin fila abierta (o
          arriba de la lista, en el modo de empuje). */}
      {partido ? (
        <div className={`md-split md-depositos${selId != null ? " md-abierto" : ""}`}>
          {loading ? (
            <LoadingState />
          ) : (
            <>
              <div className="md-lista">
                <div className="md-filas">
                  {angosto && <div className="md-extra">{resumenEscritorio}</div>}
                  {depositos.length === 0 ? (
                    <div className="md-filas-vacio">{estadoVacio}</div>
                  ) : (
                    gruposPeriodo.map((g) => (
                      <div key={g.periodo}>
                        <div className="md-grupo">{mesLegible(g.periodo)}</div>
                        {g.items.map((dep) => (
                          <div
                            key={dep.id}
                            className={`md-fila${selId === dep.id ? " sel" : ""}`}
                            onClick={() => setSelId(dep.id)}
                          >
                            <span className="md-fila-textos">
                              <span className="md-fila-titular"><span className="truncate">{dep.cuenta_banco}</span></span>
                              <span className="md-fila-sub truncate">
                                {[fmtFechaCorta(dep.fecha), dep.referencia].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            <span className="md-fila-monto">{fmtMoney(dep.monto)}</span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>

                <div className="md-pie">
                  <span>{t("depositos.registrados", { count: depositos.length })}</span>
                  <span className="md-pie-total">
                    {fmtMoney(sumar(...depositos.map((d) => d.monto)))} {church.moneda}
                  </span>
                </div>
              </div>

              <div className="md-detalle">
                {(() => {
                  const detDep = angosto ? sel ?? ultimoSel.current : sel;
                  if (detDep) {
                    return (
                      <DetalleDeposito
                        dep={detDep}
                        tituloLista={t("nav.depositosCorto")}
                        onVolver={() => setSelId(null)}
                        onEditar={abrirEditar}
                        onEliminar={setPendingDeleteSel}
                        onVerComprobante={setPreviewSel}
                      />
                    );
                  }
                  if (angosto) return null;
                  return (
                    <div className="md-vacio">
                      <div className="md-vacio-hint">
                        <h3>{t("depositos.eligeDeposito")}</h3>
                        <p>{t("depositos.eligeDepositoSub")}</p>
                      </div>
                      {resumenEscritorio}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      ) : (
      <div className="content content-lienzo">
        {enIPhone ? (
          /* Sin la franja de color de `.stat-card accent` ni el icono en
             recuadro: en una tarjeta de la mitad del ancho compiten con la
             cifra, que es lo único que se viene a leer. Las tres siguen
             llevando su pie —cuántos y de qué mes, qué año, cuándo y a qué
             cuenta fue el último— porque sin él la cifra no dice de qué
             período habla. Tres tarjetas en dos columnas dejan un hueco en
             la última fila; es lo que ya hace Servicios, que también tiene
             tres. */
          <div className="ios-panel">
            <div className="ios-panel-head"><h2>{t("depositos.seccionResumen")}</h2></div>
            <div className="ios-panel-grid">
              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("depositos.depositosDelMes")}</span></div>
                <span className="ios-stat-num money">
                  <CountUp value={totalMes} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                </span>
                <div className="stat-pct">{t("depositos.conteo", { count: conteoMes, mes: mesLegible(mes) })}</div>
              </div>
              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("depositos.totalAnio")}</span></div>
                <span className="ios-stat-num money">
                  <CountUp value={totalAnio} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span>
                </span>
                <div className="stat-pct">{anio}</div>
              </div>
              <div className="ios-stat" style={{ cursor: "default" }}>
                <div className="ios-stat-top"><span className="ios-stat-label">{t("depositos.ultimoDeposito")}</span></div>
                <span className="ios-stat-num money">
                  {ultimo
                    ? <><CountUp value={ultimo.monto} format={fmtMoney} paso={100} /><span className="stat-cur">{church.moneda}</span></>
                    : <span style={{ color: "var(--text-3)" }}>—</span>}
                </span>
                <div className="stat-pct">
                  {ultimo
                    ? `${fmtFechaCorta(ultimo.fecha)} · ${ultimo.cuenta_banco}`
                    : t("depositos.sinDepositos")}
                </div>
              </div>
            </div>
          </div>
        ) : resumenEscritorio}

        {enIPhone ? (
          <div className="ios-panel-head"><h2>{t("depositos.historial")}</h2></div>
        ) : (
          <div className="tx-head">
            <div className="tx-title">{t("depositos.historial")}</div>
          </div>
        )}

        {loading ? (
          <LoadingState />
        ) : depositos.length === 0 ? (
          <EmptyState
            pagina
            titulo={t("depositos.emptyTitulo")}
            sub={t("depositos.emptySub")}
            icon={<IconBank size={22} strokeWidth={1.6} />}
            accion={{ label: t("depositos.nuevoDeposito"), onClick: abrirNuevo }}
            duplicaCrear
          />
        ) : (
          <>
            <DepositoTable
              depositos={depositos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
              onEdit={abrirEditar}
              onChanged={onChanged}
            />
            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(depositos.length / PAGE_SIZE))}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
      )}

      {modalOpen && (
        <DepositoModal
          church={church}
          editing={editing}
          onClose={cerrarModal}
          onSaved={onChanged}
        />
      )}

      {pendingDeleteSel && (
        <ConfirmDialog
          title={t("depositos.eliminarTitulo")}
          message={t("depositos.eliminarMensaje", { monto: `${fmtMoney(pendingDeleteSel.monto)} ${pendingDeleteSel.moneda}`, cuenta: pendingDeleteSel.cuenta_banco })}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={() => void borrarSelConDeshacer(pendingDeleteSel)}
          onCancel={() => setPendingDeleteSel(null)}
        />
      )}

      {previewSel && <ComprobantePreview path={previewSel} onClose={() => setPreviewSel(null)} />}
    </>
  );
}
