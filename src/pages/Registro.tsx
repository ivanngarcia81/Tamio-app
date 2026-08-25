/**
 * Registro.tsx — **lo que ha pasado en la iglesia.**
 *
 * Sustituye al chat de Mensajes por decisión de Iván (25 ago 2026), con un
 * argumento que se sostiene solo: *"las personas ya tienen WhatsApp e
 * iMessage"*. Un chat dentro de Tamio compite con algo que hace mejor otra app
 * y obliga a mirar dos sitios.
 *
 * Y el código le daba más razón: `mensajes` **nunca fue un chat** por dentro
 * —guardaba `de_rol` y `cuerpo`, sin destinatario ni conversación—, y lo único
 * valioso que había ahí era un aviso AUTOMÁTICO (el cambio de estado de un
 * miembro) enterrado entre texto tecleado a mano. Eso es lo que aquí pasa a
 * ser la función entera.
 *
 * **No confundir con la Bandeja.** Aquella dice qué te FALTA POR HACER; esta,
 * qué HA PASADO. Ninguna sustituye a la otra, y por eso el registro no lleva
 * acciones: no se aprueba nada desde aquí, solo se lee.
 *
 * Tres cosas que se ven en pantalla y tienen su porqué:
 *
 *  - **Cada quien ve lo suyo.** El tesorero, lo del dinero; la secretaria, lo
 *    del padrón; el administrador, todo (decisión de Iván). Lo decide
 *    `areasDelRol` en `db.ts`, no esta pantalla.
 *  - **Se distingue lo que escribió la app de lo que escribió una persona.**
 *    Un suceso lleva el nombre de Tamio; una nota, el de quien la escribió y
 *    su etiqueta. Sin eso, las notas volverían a convertir esto en un tablón.
 *  - **"Sin ver" es de este dispositivo.** Se guarda en localStorage, no en la
 *    base. Era el fallo de `mensajes`: una sola bandera `leido` para todos, así
 *    que si la tesorera abría un mensaje se le apagaba el aviso al pastor.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fmtFechaCorta, listRegistro, marcarRegistroVisto, registrarNota,
  type Church, type Suceso,
} from "../db";
import type { Role } from "../role";
import { useBarraEstado } from "../components/BarraEstado";
import LoadingState from "../components/LoadingState";
import { EmptyState } from "../components/TxList";
import { IconClipboardList } from "../icons";
import { showToast } from "../toast";
import { esIPhone, esMac } from "../movil";

/** El día de un `creado_en` ("2026-08-22 17:04:11" → "2026-08-22"). */
function diaDe(iso: string): string {
  return iso.slice(0, 10);
}

/** La hora local corta ("17:04"). */
function horaDe(iso: string): string {
  return iso.slice(11, 16);
}

interface Props {
  church: Church;
  role: Role;
  refreshKey: number;
}

export default function Registro({ church, role, refreshKey }: Props) {
  const { t } = useTranslation();
  const enIPhone = esIPhone();
  const [sucesos, setSucesos] = useState<Suceso[]>([]);
  const [loading, setLoading] = useState(true);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [abriendoNota, setAbriendoNota] = useState(false);

  useBarraEstado(t("barraEstado.registro", { count: sucesos.length }));

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    listRegistro(church.id, role)
      .then(async (rows) => {
        if (cancelado) return;
        setSucesos(rows);
        /* Al abrir se marca visto: quien está mirando la lista ya la vio. El
           contador del sidebar se apaga en el próximo refresco. */
        await marcarRegistroVisto(church.id);
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [church.id, role, refreshKey]);

  function etiquetaDia(dia: string): string {
    const hoy = new Date();
    const pd = (x: number) => String(x).padStart(2, "0");
    const iso = (d: Date) => `${d.getFullYear()}-${pd(d.getMonth() + 1)}-${pd(d.getDate())}`;
    if (dia === iso(hoy)) return t("registro.hoy");
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    if (dia === iso(ayer)) return t("registro.ayer");
    return fmtFechaCorta(dia);
  }

  /** El texto del suceso, compuesto AL LEER con las piezas guardadas.
   *
   *  Aquí está la diferencia con `mensajes`, que guardaba la frase ya armada y
   *  por eso se quedaba congelada en el idioma de quien la provocó. Si la
   *  clave no existe —un registro de una versión más nueva— se enseña la clave
   *  en crudo en vez de una línea vacía: decir "no sé traducir esto" es mejor
   *  que fingir que no pasó nada. */
  function textoDe(s: Suceso): string {
    if (s.tipo === "nota") return s.cuerpo ?? "";
    let datos: Record<string, string> = {};
    try { datos = JSON.parse(s.datos || "{}"); } catch { /* noop */ }
    return t(`registro.suceso.${s.tipo}`, { ...datos, defaultValue: s.tipo });
  }

  async function anotar() {
    if (!nota.trim()) return;
    setGuardando(true);
    try {
      await registrarNota(church.id, nota);
      setNota("");
      setAbriendoNota(false);
      setSucesos(await listRegistro(church.id, role));
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        {!enIPhone && (
          <div>
            <div className="page-title">{t("registro.titulo")}</div>
            {!esMac() && <div className="page-sub">{t("registro.sub")}</div>}
          </div>
        )}
        <div className="header-actions">
          <button type="button" className="btn secondary" onClick={() => setAbriendoNota((v) => !v)}>
            {t("registro.escribirNota")}
          </button>
        </div>
      </div>

      <div className="content">
        {abriendoNota && (
          <div className="card pad-lg reg-nota">
            <textarea
              className="form-textarea"
              rows={2}
              placeholder={t("registro.notaPlaceholder")}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void anotar(); }
              }}
            />
            <button className="btn primary" onClick={() => void anotar()} disabled={guardando || !nota.trim()}>
              {t("registro.notaGuardar")}
            </button>
          </div>
        )}

        {loading ? (
          <LoadingState />
        ) : sucesos.length === 0 ? (
          <EmptyState
            pagina
            icon={<IconClipboardList size={20} strokeWidth={1.8} />}
            titulo={t("registro.vacio")}
            sub={t("registro.vacioSub")}
          />
        ) : (
          <div className="reg-lista">
            {sucesos.map((s, i) => {
              const dia = diaDe(s.creado_en);
              const nuevoDia = i === 0 || diaDe(sucesos[i - 1].creado_en) !== dia;
              const esNota = s.tipo === "nota";
              return (
                <div key={s.id}>
                  {nuevoDia && <div className="reg-dia"><span>{etiquetaDia(dia)}</span></div>}
                  <div className={`reg-fila${esNota ? " reg-fila--nota" : ""}`}>
                    <span className={`reg-punto reg-punto--${s.area}`} aria-hidden="true" />
                    <span className="reg-textos">
                      <span className="reg-cuerpo">{textoDe(s)}</span>
                      <span className="reg-meta">
                        {/* Quién lo escribió. Un suceso lo escribió la app; una
                            nota, una persona — y si no hay sesión (modo local)
                            no se inventa un nombre, se dice "Nota" a secas. */}
                        <span className="reg-autor">
                          {esNota ? (s.quien ?? t("registro.nota")) : t("registro.porApp")}
                        </span>
                        <span className="reg-hora">{horaDe(s.creado_en)}</span>
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
