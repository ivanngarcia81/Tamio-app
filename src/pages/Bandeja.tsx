import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  categoriaInfo, fmtFecha, fmtFechaCorta, fmtMoney, listArchivedMembers, listPendingTx,
  markTxReviewed, restoreMember, type Church, type Member, type Tx,
} from "../db";
import { EmptyState } from "../components/TxList";
import LoadingState from "../components/LoadingState";
import { useBarraEstado } from "../components/BarraEstado";
import Pagination from "../components/Pagination";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { esIPad, esIPhone, esMac } from "../movil";
import { useMediaQuery } from "../hooks/useMediaQuery";
import DetalleMovimiento from "../components/DetalleMovimiento";
import DetalleMiembro from "../components/DetalleMiembro";
import ComprobantePreview from "../components/ComprobantePreview";
import { IconCheck, IconRefreshCw } from "../icons";

interface Props {
  church: Church;
  refreshKey: number;
  onEditTx: (tx: Tx) => void;
  onChanged: () => void;
}

const PAGE_SIZE = 15;

export default function Bandeja({ church, refreshKey, onEditTx, onChanged }: Props) {
  const { t } = useTranslation();
  const enIPhone = esIPhone();
  /* Maestro-detalle del iPad, los mismos dos umbrales que Movimientos y
     Aportantes (docs/ipad-rediseno.md): partido desde 700, columnas desde
     1150, y entre medias el detalle empuja. */
  const anchoPartido = useMediaQuery("(min-width: 700px)");
  const anchoColumnas = useMediaQuery("(min-width: 1150px)");
  const partido = esIPad() && anchoPartido;
  const angosto = partido && !anchoColumnas;
  const [pendientes, setPendientes] = useState<Tx[]>([]);
  const [archivados, setArchivados] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagPendientes, setPagPendientes] = useState(1);
  const [pagArchivados, setPagArchivados] = useState(1);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    Promise.all([listPendingTx(church.id), listArchivedMembers(church.id)])
      .then(([nuevosPendientes, nuevosArchivados]) => {
        if (cancelado) return;
        setPendientes(nuevosPendientes);
        setArchivados(nuevosArchivados);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, refreshKey]);

  useEffect(() => { setPagPendientes(1); setPagArchivados(1); }, [refreshKey]);

  /* El asunto abierto. Aquí la lista es HETEROGÉNEA —un movimiento pendiente
     y un miembro archivado no son lo mismo— así que la selección guarda el
     tipo además del id, y de ahí sale qué panel se pinta. Como en las otras
     dos pantallas se guarda el ID y no el objeto: al resolver un asunto la
     recarga lo saca de su lista y el panel se cierra solo. */
  const [sel, setSel] = useState<{ tipo: "tx" | "miembro"; id: number } | null>(null);
  const selTx = sel?.tipo === "tx" ? pendientes.find((x) => x.id === sel.id) ?? null : null;
  const selMiembro = sel?.tipo === "miembro" ? archivados.find((m) => m.id === sel.id) ?? null : null;
  const ultimoSel = useRef<{ tx: Tx | null; miembro: Member | null }>({ tx: null, miembro: null });
  if (selTx) ultimoSel.current = { tx: selTx, miembro: null };
  if (selMiembro) ultimoSel.current = { tx: null, miembro: selMiembro };
  const [previewSel, setPreviewSel] = useState<string | null>(null);

  async function handleReviewed(tx: Tx) {
    // Resuelto el asunto, deja de estar en la bandeja: el panel se cierra.
    setSel((s) => (s?.tipo === "tx" && s.id === tx.id ? null : s));
    await markTxReviewed(tx.id, church.id);
    showToast(t("toast.marcadoRevisado"));
    playSound("guardado");
    onChanged();
  }

  async function handleRestore(m: Member) {
    setSel((s) => (s?.tipo === "miembro" && s.id === m.id ? null : s));
    await restoreMember(m.id, church.id);
    showToast(t("toast.miembroRestaurado"));
    playSound("guardado");
    onChanged();
  }

  const total = pendientes.length + archivados.length;

  /* Pie de ventana (solo Mac): el mismo par que ya llevaba `page-sub`, que
     aquí sí cabe entero. */
  useBarraEstado(total === 0
    ? t("bandeja.sinPendientes")
    : `${t("bandeja.porRevisar", { count: pendientes.length })} · ${t("bandeja.archivados", { count: archivados.length })}`);
  const totalPagPendientes = Math.max(1, Math.ceil(pendientes.length / PAGE_SIZE));
  const totalPagArchivados = Math.max(1, Math.ceil(archivados.length / PAGE_SIZE));
  const paginaPendientes = pendientes.slice((pagPendientes - 1) * PAGE_SIZE, pagPendientes * PAGE_SIZE);
  const paginaArchivados = archivados.slice((pagArchivados - 1) * PAGE_SIZE, pagArchivados * PAGE_SIZE);

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("bandeja.titulo")}</div>
            <div className="page-sub">
              {total === 0
                ? t("bandeja.sinPendientes")
                : `${t("bandeja.porRevisar", { count: pendientes.length })} · ${t("bandeja.archivados", { count: archivados.length })}`}
            </div>
          </div>
        )}
      </div>

      {/* ---- Maestro-detalle (iPad) ----
          La columna maestra junta los dos grupos que la página ya tenía
          —movimientos pendientes y miembros archivados— en una sola lista
          con dos cabeceras. El panel reutiliza los MISMOS componentes de
          Ingresos y Aportantes, cambiándoles solo los botones: aquí un
          movimiento se mira para aprobarlo, no para borrarlo.

          El handoff maquetaba esta pantalla con una taxonomía de alertas
          ("duplicado probable", "categoría vacía", "recurrente vencido")
          que NO existe en la app: `listPendingTx` da movimientos en estado
          pendiente y `listArchivedMembers` da miembros archivados, y eso es
          todo. Se toma la estructura del diseño, no sus datos inventados. */}
      {partido ? (
        <div className={`md-split md-bandeja${sel ? " md-abierto" : ""}`}>
          {loading ? (
            <LoadingState />
          ) : (
            <>
              <div className="md-lista">
                <div className="md-filas">
                  {total === 0 ? (
                    <div className="md-filas-vacio">
                      <EmptyState pagina titulo={t("bandeja.sinPendientes")} sub={t("bandeja.emptySub")} />
                    </div>
                  ) : (
                    <>
                      <div className="md-grupo">{t("bandeja.pendientesRevision")}</div>
                      {pendientes.length === 0 ? (
                        <div className="md-grupo-vacio">{t("bandeja.noMovsRevisar")}</div>
                      ) : pendientes.map((tx) => {
                        const cat = categoriaInfo(tx.tipo, tx.categoria);
                        const sub = [
                          tx.tipo === "ingreso" ? t("tx.ingreso") : t("tx.gasto"),
                          cat.nombre,
                          fmtFechaCorta(tx.fecha),
                        ].join(" · ");
                        return (
                          <div
                            key={`tx-${tx.id}`}
                            className={`md-fila${sel?.tipo === "tx" && sel.id === tx.id ? " sel" : ""}`}
                            onClick={() => setSel({ tipo: "tx", id: tx.id })}
                          >
                            <span className="md-cat-dot md-punto-aviso" aria-hidden="true" />
                            <span className="md-fila-textos">
                              <span className="md-fila-titular"><span className="truncate">{tx.concepto}</span></span>
                              <span className="md-fila-sub truncate">{sub}</span>
                            </span>
                            <span className="md-fila-monto">{fmtMoney(tx.monto)}</span>
                          </div>
                        );
                      })}

                      <div className="md-grupo">{t("bandeja.miembrosArchivadosLabel")}</div>
                      {archivados.length === 0 ? (
                        <div className="md-grupo-vacio">{t("bandeja.noMiembrosArchivados")}</div>
                      ) : archivados.map((m) => (
                        <div
                          key={`m-${m.id}`}
                          className={`md-fila${sel?.tipo === "miembro" && sel.id === m.id ? " sel" : ""}`}
                          onClick={() => setSel({ tipo: "miembro", id: m.id })}
                        >
                          <span className="md-fila-textos">
                            <span className="md-fila-titular"><span className="truncate">{m.nombre}</span></span>
                            <span className="md-fila-sub truncate">
                              {m.email ?? m.rfc ?? t("bandeja.sinCorreoRegistrado")}
                            </span>
                          </span>
                          <span className="tag rol-otro">{t("bandeja.archivado")}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                <div className="md-pie">
                  <span>{t("bandeja.porRevisar", { count: pendientes.length })}</span>
                  <span className="md-pie-total">{t("bandeja.archivados", { count: archivados.length })}</span>
                </div>
              </div>

              <div className="md-detalle">
                {(() => {
                  const tx = angosto ? selTx ?? ultimoSel.current.tx : selTx;
                  const miembro = angosto ? selMiembro ?? ultimoSel.current.miembro : selMiembro;
                  if (tx) {
                    return (
                      <DetalleMovimiento
                        tx={tx}
                        tituloLista={t("bandeja.titulo")}
                        onVolver={() => setSel(null)}
                        onEditar={onEditTx}
                        onEliminar={() => {}}
                        onVerComprobante={setPreviewSel}
                        acciones={
                          <>
                            <button type="button" className="btn secondary" onClick={() => onEditTx(tx)}>
                              {t("common.editar")}
                            </button>
                            <button type="button" className="btn primary" onClick={() => void handleReviewed(tx)}>
                              <IconCheck size={14} strokeWidth={2.4} /> {t("bandeja.marcarRevisado")}
                            </button>
                          </>
                        }
                      />
                    );
                  }
                  if (miembro) {
                    return (
                      <DetalleMiembro
                        church={church}
                        member={miembro}
                        tituloLista={t("bandeja.titulo")}
                        onVolver={() => setSel(null)}
                        onEditar={() => {}}
                        onEliminar={() => {}}
                        acciones={
                          <button type="button" className="btn primary" onClick={() => void handleRestore(miembro)}>
                            <IconRefreshCw size={14} strokeWidth={2.2} /> {t("bandeja.restaurar")}
                          </button>
                        }
                      />
                    );
                  }
                  if (angosto) return null;
                  return (
                    <div className="md-vacio">
                      <div className="md-vacio-hint">
                        <h3>{total === 0 ? t("bandeja.todoAlDia") : t("bandeja.eligeAsunto")}</h3>
                        <p>{total === 0 ? t("bandeja.emptySub") : t("bandeja.eligeAsuntoSub")}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      ) : (
      <div className="content">
        {loading ? (
          <LoadingState />
        ) : total === 0 ? (
          <EmptyState
            pagina
            titulo={t("bandeja.sinPendientes")}
            sub={t("bandeja.emptySub")}
          />
        ) : (
          <>
            {/* El dato que llevaba `page-sub` ("N por revisar · M archivados")
                no se pierde al ocultar la cabecera: baja al encabezado de
                cada bloque, donde además dice a qué lista pertenece cada
                número. Se reutiliza la misma etiqueta de sección que Mac ya
                usa en vez de inventar una llave nueva. */}
            {enIPhone ? (
              <div className="ios-panel-head">
                <h2>{t("bandeja.pendientesRevision")} ({pendientes.length})</h2>
              </div>
            ) : (
              <div className="inbox-section-label">{t("bandeja.pendientesRevision")}</div>
            )}
            {pendientes.length === 0 ? (
              enIPhone ? (
                <div className="ios-panel-empty">{t("bandeja.noMovsRevisar")}</div>
              ) : (
                <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 20 }}>
                  {t("bandeja.noMovsRevisar")}
                </div>
              )
            ) : enIPhone ? (
              <>
                <div className="ios-listcard" style={{ marginBottom: 8 }}>
                  {paginaPendientes.map((tx) => {
                    const cat = categoriaInfo(tx.tipo, tx.categoria);
                    const secundaria = [
                      tx.tipo === "ingreso" ? t("tx.ingreso") : t("tx.gasto"),
                      cat.nombre,
                      fmtFechaCorta(tx.fecha),
                    ].join(" · ");
                    return (
                      /* Los dos botones de texto de Mac ("Editar" y "Marcar
                         revisado") no caben junto al concepto y el monto: el
                         gesto de editar pasa a la fila entera y solo la acción
                         positiva se queda visible, como botón redondo. */
                      <div
                        className="ios-txrow ios-txrow--clickable"
                        key={tx.id}
                        onClick={() => onEditTx(tx)}
                      >
                        <div className="ios-txrow-main">
                          <div className="ios-txrow-title" title={tx.concepto}>
                            <span className="truncate">{tx.concepto}</span>
                          </div>
                          <div className="tx-secundaria-movil" title={secundaria}>{secundaria}</div>
                        </div>
                        <div className="ios-txrow-trailing">
                          <span className={`tx-amount ${tx.tipo === "ingreso" ? "positive" : "negative"}`}>
                            {tx.tipo === "ingreso" ? "+" : "−"}{fmtMoney(tx.monto).replace("−", "")}
                            <span className="cur">{tx.moneda}</span>
                          </span>
                          <button
                            type="button"
                            className="ios-row-accion"
                            aria-label={t("bandeja.marcarRevisado")}
                            title={t("bandeja.marcarRevisado")}
                            onClick={(e) => { e.stopPropagation(); void handleReviewed(tx); }}
                          >
                            <span><IconCheck size={15} strokeWidth={2.6} /></span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Pagination page={pagPendientes} totalPages={totalPagPendientes} onPageChange={setPagPendientes} />
              </>
            ) : (
              <>
                <div className="inbox-list" style={{ marginBottom: 8 }}>
                  {paginaPendientes.map((tx) => {
                    const cat = categoriaInfo(tx.tipo, tx.categoria);
                    const f = fmtFecha(tx.fecha);
                    return (
                      <div className="inbox-item" key={tx.id}>
                        <div className="inbox-icon warn">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        </div>
                        <div className="inbox-body">
                          <div className="inbox-title-row">
                            <span className="inbox-type-tag warn">
                              {tx.tipo === "ingreso" ? t("tx.ingreso") : t("tx.gasto")} · {cat.nombre}
                            </span>
                            <span className="inbox-time">{f.dia} {f.mesAnio} · {f.hora}</span>
                          </div>
                          <div className="inbox-desc"><strong>{tx.concepto}</strong></div>
                          {(tx.member_nombre || tx.beneficiario || tx.detalle) && (
                            <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-2)" }}>
                              {tx.member_nombre ?? tx.beneficiario ?? tx.detalle}
                            </div>
                          )}
                        </div>
                        <div className="inbox-side">
                          <div className="inbox-amount">
                            {tx.tipo === "ingreso" ? "+" : "−"}
                            {fmtMoney(tx.monto).replace("−", "")}
                            <span className="cur">{tx.moneda}</span>
                          </div>
                          <div className="inbox-actions">
                            <button className="btn secondary sm" onClick={() => onEditTx(tx)}>{t("common.editar")}</button>
                            <button className="btn primary sm" onClick={() => handleReviewed(tx)}>{t("bandeja.marcarRevisado")}</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Pagination page={pagPendientes} totalPages={totalPagPendientes} onPageChange={setPagPendientes} />
              </>
            )}

            {enIPhone ? (
              <div className="ios-panel-head" style={{ marginTop: 26 }}>
                <h2>{t("bandeja.miembrosArchivadosLabel")} ({archivados.length})</h2>
              </div>
            ) : (
              <div className="inbox-section-label" style={{ marginTop: 20 }}>{t("bandeja.miembrosArchivadosLabel")}</div>
            )}
            {archivados.length === 0 ? (
              enIPhone ? (
                <div className="ios-panel-empty">{t("bandeja.noMiembrosArchivados")}</div>
              ) : (
                <div style={{ color: "var(--text-3)", fontSize: 13 }}>
                  {t("bandeja.noMiembrosArchivados")}
                </div>
              )
            ) : enIPhone ? (
              <>
                <div className="ios-listcard" style={{ marginBottom: 8 }}>
                  {paginaArchivados.map((m) => (
                    /* La fila no lleva `--clickable`: en Mac tocarla tampoco
                       hace nada, la única acción es "Restaurar". */
                    <div className="ios-txrow" key={m.id}>
                      <div className="ios-txrow-main">
                        <div className="ios-txrow-title" title={m.nombre}>
                          <span className="truncate">{m.nombre}</span>
                        </div>
                        <div className="tx-secundaria-movil">
                          {m.email ?? m.rfc ?? t("bandeja.sinCorreoRegistrado")}
                        </div>
                      </div>
                      <div className="ios-txrow-trailing">
                        <button
                          type="button"
                          className="ios-row-accion"
                          aria-label={t("bandeja.restaurar")}
                          title={t("bandeja.restaurar")}
                          onClick={() => void handleRestore(m)}
                        >
                          <span><IconRefreshCw size={15} strokeWidth={2.2} /></span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={pagArchivados} totalPages={totalPagArchivados} onPageChange={setPagArchivados} />
              </>
            ) : (
              <>
                <div className="inbox-list">
                  {paginaArchivados.map((m) => (
                    <div className="inbox-item resolved" key={m.id}>
                      <div className="inbox-icon done">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                        </svg>
                      </div>
                      <div className="inbox-body">
                        <div className="inbox-title-row">
                          <span className="inbox-type-tag done">{t("bandeja.archivado")}</span>
                        </div>
                        <div className="inbox-desc"><strong>{m.nombre}</strong></div>
                        <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-2)" }}>
                          {m.email ?? m.rfc ?? t("bandeja.sinCorreoRegistrado")}
                        </div>
                      </div>
                      <div className="inbox-side">
                        <div className="inbox-actions">
                          <button className="btn secondary sm" onClick={() => handleRestore(m)}>{t("bandeja.restaurar")}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={pagArchivados} totalPages={totalPagArchivados} onPageChange={setPagArchivados} />
              </>
            )}
          </>
        )}
      </div>
      )}

      {previewSel && <ComprobantePreview path={previewSel} onClose={() => setPreviewSel(null)} />}
    </>
  );
}
