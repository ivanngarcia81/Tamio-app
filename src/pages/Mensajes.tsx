import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fmtRelativo, insertMensaje, listMensajes, marcarMensajesLeidos,
  type Church, type Mensaje,
} from "../db";
import type { Role } from "../role";
import LoadingState from "../components/LoadingState";
import { EmptyState } from "../components/TxList";
import { IconMail } from "../icons";
import { showToast } from "../toast";
import { playSound } from "../sound";

interface Props {
  church: Church;
  role: Role;
  refreshKey: number;
  onChanged: () => void;
}

export default function Mensajes({ church, role, refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    listMensajes(church.id)
      .then(async (rows) => {
        if (cancelado) return;
        setMensajes(rows);
        // Al abrir, se marcan como leídos los mensajes recibidos y se refresca
        // el contador del sidebar.
        await marcarMensajesLeidos(church.id, role);
        onChanged();
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [church.id, role, refreshKey]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes.length]);

  function nombreRol(r: string): string {
    return t(`rol.${r === "secretaria" ? "secretaria" : "tesorero"}`);
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
      <div className="header">
        <div>
          <div className="page-title">{t("mensajes.titulo")}</div>
          <div className="page-sub">{t("mensajes.sub")}</div>
        </div>
      </div>

      <div className="content">
        <div className="card msg-card">
          <div className="msg-thread">
            {loading ? (
              <LoadingState />
            ) : mensajes.length === 0 ? (
              <EmptyState
                icon={<IconMail size={20} strokeWidth={1.8} />}
                titulo={t("mensajes.vacioTitulo")}
                sub={t("mensajes.vacioSub")}
              />
            ) : (
              <>
                {mensajes.map((m) => {
                  const propio = m.de_rol === role;
                  return (
                    <div key={m.id} className={`msg-row${propio ? " propio" : ""}`}>
                      <div className="msg-bubble">
                        <div className="msg-meta">
                          <span className="msg-autor">{nombreRol(m.de_rol)}</span>
                          <span className="msg-fecha">{fmtRelativo(m.creado_en)}</span>
                        </div>
                        <div className="msg-cuerpo">{m.cuerpo}</div>
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
        </div>
      </div>
    </>
  );
}
