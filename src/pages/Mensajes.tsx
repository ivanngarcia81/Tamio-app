import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  deleteMensaje, fmtFechaCorta, fmtRelativo, insertMensaje, listMensajes, marcarMensajesLeidos,
  type Church, type Mensaje,
} from "../db";
import type { Role } from "../role";
import { useBarraEstado } from "../components/BarraEstado";
import LoadingState from "../components/LoadingState";
import ConfirmDialog from "../components/ConfirmDialog";
import { EmptyState } from "../components/TxList";
import { IconClose, IconMail } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { esIPad, esIPhone, esMac } from "../movil";

/** El día de un `creado_en` ("2026-08-22 17:04:11" → "2026-08-22"). */
function diaDe(iso: string): string {
  return iso.slice(0, 10);
}

/** La hora local corta ("17:04"). Dentro de la burbuja se enseña la HORA y no
 *  el "hace 3 h" de antes: con el separador de día encima, el relativo
 *  duplicaba una información que ya está arriba y encima se contradecía con
 *  ella ("Ayer" sobre una burbuja que decía "hace 20 h"). */
function horaDe(iso: string): string {
  const hm = iso.slice(11, 16);
  return hm || fmtRelativo(iso);
}

interface Props {
  church: Church;
  role: Role;
  refreshKey: number;
  onChanged: () => void;
}

export default function Mensajes({ church, role, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const enIPhone = esIPhone();
  const enIPad = esIPad();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Mensaje | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

  /* Pie de ventana (solo Mac). */
  useBarraEstado(t("barraEstado.mensajes", { count: mensajes.length }));

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    listMensajes(church.id)
      .then(async (rows) => {
        if (cancelado) return;
        setMensajes(rows);
        // Al abrir, se marcan como leídos los mensajes recibidos y se refresca
        // el contador del sidebar. Solo se notifica si de verdad se marcó algo,
        // para no reactivar este mismo efecto (onChanged sube refreshKey) en un
        // lazo infinito que hace parpadear la lista.
        const marcados = await marcarMensajesLeidos(church.id, role);
        if (marcados > 0) onChanged();
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [church.id, role, refreshKey]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes.length]);

  /* La etiqueta del separador de día: Hoy, Ayer o la fecha. Se calcula
     contra el día de HOY, no contra el mensaje anterior, para que un hilo
     abierto a medianoche no diga "Ayer" sobre lo que se acaba de escribir. */
  function etiquetaDia(dia: string): string {
    const hoy = new Date();
    const pd = (x: number) => String(x).padStart(2, "0");
    const iso = (d: Date) => `${d.getFullYear()}-${pd(d.getMonth() + 1)}-${pd(d.getDate())}`;
    if (dia === iso(hoy)) return t("fechas.hoy");
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    if (dia === iso(ayer)) return t("fechas.ayer");
    return fmtFechaCorta(dia);
  }

  function nombreRol(r: string): string {
    if (r === "secretaria") return t("rol.secretaria");
    if (r === "administrador") return t("rol.administrador");
    return t("rol.tesorero");
  }

  async function confirmarBorrar() {
    if (!pendingDelete) return;
    await deleteMensaje(pendingDelete.id, church.id);
    setPendingDelete(null);
    playSound("eliminar");
    showToast(t("mensajes.eliminado"));
    const rows = await listMensajes(church.id);
    setMensajes(rows);
    onChanged();
  }

  async function enviar() {
    const cuerpo = texto.trim();
    if (!cuerpo || enviando) return;
    setEnviando(true);
    try {
      await insertMensaje(church.id, role, cuerpo);
      setTexto("");
      playSound("guardado");
      showToast(t("mensajes.enviado"));
      const rows = await listMensajes(church.id);
      setMensajes(rows);
      onChanged();
    } catch (e) {
      console.error(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("mensajes.titulo")}</div>
            {!esMac() && <div className="page-sub">{t("mensajes.sub")}</div>}
          </div>
        )}
      </div>

      <div className="content">
        {/* `msg-card` se queda en el teléfono aunque ya no parezca tarjeta:
            de él cuelga toda la maquinaria de chat (`.main:has(.msg-card)`,
            el hilo que desplaza por dentro, el compositor pegado abajo).
            Lo que se va es `card`, que es lo que le ponía borde, radio y
            superficie propia. */}
        <div className={`${enIPhone ? "msg-card" : "card msg-card"}${enIPad ? " msg-card-ipad" : ""}`}>
          <div className="msg-thread">
            {loading ? (
              <LoadingState />
            ) : mensajes.length === 0 ? (
              <EmptyState
                pagina
                icon={<IconMail size={20} strokeWidth={1.8} />}
                titulo={t("mensajes.vacioTitulo")}
                sub={t("mensajes.vacioSub")}
              />
            ) : (
              <>
                {mensajes.map((m, i) => {
                  const propio = m.de_rol === role;
                  /* Separador de día cuando cambia respecto al mensaje de
                     arriba (y siempre antes del primero). */
                  const dia = diaDe(m.creado_en);
                  const nuevoDia = i === 0 || diaDe(mensajes[i - 1].creado_en) !== dia;
                  return (
                    <div key={m.id} className="msg-grupo">
                    {nuevoDia && <div className="msg-dia"><span>{etiquetaDia(dia)}</span></div>}
                    <div className={`msg-row${propio ? " propio" : ""}`}>
                      <div className="msg-bubble">
                        <div className="msg-meta">
                          <span className="msg-autor">{nombreRol(m.de_rol)}</span>
                          <span className="msg-fecha">{horaDe(m.creado_en)}</span>
                          {propio && (
                            <button className="msg-del" aria-label={t("mensajes.eliminar")} title={t("mensajes.eliminar")} onClick={() => setPendingDelete(m)}>
                              <IconClose size={12} strokeWidth={2.4} />
                            </button>
                          )}
                        </div>
                        <div className="msg-cuerpo">{m.cuerpo}</div>
                      </div>
                    </div>
                    </div>
                  );
                })}
                <div ref={finRef} />
              </>
            )}
          </div>

          <div className="msg-composer">
            <textarea
              className="form-textarea"
              rows={2}
              placeholder={t("mensajes.placeholder")}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); enviar(); }
              }}
            />
            <button className="btn primary" onClick={enviar} disabled={enviando || !texto.trim()}>
              {t("mensajes.enviar")}
            </button>
          </div>

          {/* Quién lo ve y cómo se manda. Lo pide el handoff 2, y contesta la
              pregunta que un hilo compartido plantea sola —"¿esto lo lee
              todo el mundo?"— justo donde se escribe. Fuera del teléfono,
              donde no hay teclas de atajo ni sitio para dos renglones. */}
          {!enIPhone && (
            <div className="msg-pie">
              <span>{t("mensajes.visibilidad")}</span>
              <span className="msg-atajo">{t("mensajes.atajoEnviar")}</span>
            </div>
          )}
        </div>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={t("mensajes.eliminarTitulo")}
          message={t("mensajes.eliminarMensaje")}
          confirmLabel={t("common.eliminar")}
          danger
          onConfirm={confirmarBorrar}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
