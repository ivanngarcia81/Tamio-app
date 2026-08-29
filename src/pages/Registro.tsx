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
  fmtFechaCorta, listRegistro, marcarRegistroVisto, registrarNota, registroVistoDesde,
  type Church, type Suceso,
} from "../db";
import type { Role } from "../role";
import { useBarraEstado } from "../components/BarraEstado";
import LoadingState from "../components/LoadingState";
import { EmptyState } from "../components/TxList";
import { IconClipboardList, IconEdit } from "../icons";
import SeccionIOS, { IosChevron } from "../components/ios/SeccionIOS";
import IOSFormSheet from "../components/ios/IOSFormSheet";
import { TextAreaField } from "../components/ios/FormularioIOS";
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
  /* Hasta dónde se había leído ANTES de abrir. Se lee una vez y se guarda:
     el efecto de abajo marca todo como visto enseguida, así que leerlo
     después daría siempre «nada sin ver». */
  const [vistoDesde] = useState(() => registroVistoDesde());

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

  /** Un suceso que no se había visto en este aparato. */
  const sinVer = (s: Suceso) => s.id > vistoDesde;

  /* Los días, en el orden en que llegan (la consulta ya viene de lo más nuevo
     a lo más viejo), con sus sucesos dentro. Solo lo usa el teléfono: en
     escritorio la lista sigue siendo continua con su separador de día. */
  const porDia: { dia: string; items: Suceso[] }[] = [];
  if (enIPhone) {
    for (const s of sucesos) {
      const dia = diaDe(s.creado_en);
      const ultimo = porDia[porDia.length - 1];
      if (ultimo && ultimo.dia === dia) ultimo.items.push(s);
      else porDia.push({ dia, items: [s] });
    }
  }

  /** Una fila del diario en el teléfono: punto de color a la altura de la
   *  PRIMERA línea (no centrado: un apunte puede ocupar dos renglones), el
   *  texto, y debajo quién lo escribió y a qué hora. */
  const filaIPhone = (s: Suceso) => {
    const esNota = s.tipo === "nota";
    return (
      <div className={`reg-ios${sinVer(s) ? " es-sinver" : ""}`} key={s.id}>
        <span className={`reg-punto reg-punto--${s.area}`} aria-hidden="true" />
        <span className="reg-ios-textos">
          <span className="reg-ios-cuerpo">{textoDe(s)}</span>
          <span className="reg-ios-meta">
            {/* El lápiz distingue de un vistazo lo que escribió una persona de
                lo que escribió la app, que es la única distinción que esta
                pantalla tiene que sostener. */}
            {esNota && <IconEdit size={13} strokeWidth={2} />}
            {esNota
              ? <><b>{s.quien ?? t("registro.nota")}</b> · {horaDe(s.creado_en)}</>
              : <>{t("registro.porApp")} · {horaDe(s.creado_en)}</>}
          </span>
        </span>
      </div>
    );
  };

  /* La hoja de la nota. Antes era un `textarea` suelto que se abría EN MEDIO
     de la lista: con el teclado arriba empujaba los apuntes y dejaba medio a
     la vista, y un campo permanente en una pantalla que es de LEER invita a
     escribir, que es justo lo que se quitó al retirar Mensajes. */
  const hojaNota = abriendoNota && (
    <IOSFormSheet
      title={t("registro.nota")}
      saveLabel={t("registro.notaAnadir")}
      canSave={!!nota.trim() && !guardando}
      onSave={() => void anotar()}
      onCancel={() => { setAbriendoNota(false); setNota(""); }}
    >
      <section className="ios-section">
        <div className="ios-group">
          <TextAreaField
            value={nota}
            onChange={setNota}
            rows={4}
            placeholder={t("registro.notaPlaceholder")}
          />
        </div>
        <p className="ios-section-footer">{t("registro.notaPie")}</p>
      </section>
      {/* Quién la va a leer, dicho antes de escribirla y no después: una nota
          es del área general y la lee cualquiera con acceso a la app. */}
      <section className="ios-section">
        <div className="ios-group">
          <div className="ios-row ios-row--dato ios-row--rasa">
            <span className="ios-row-label">{t("registro.laVeran")}</span>
            <span className="ios-row-value">
              <span className="reg-punto reg-punto--general" aria-hidden="true" /> {t("registro.todos")}
            </span>
          </div>
        </div>
        <p className="ios-section-footer">{t("registro.laVeranPie")}</p>
      </section>
    </IOSFormSheet>
  );

  if (enIPhone) {
    return (
      <>
        <div className="header">
          <div>
            <div className="page-title" data-titulo-fijo={t("registro.titulo")}>{t("registro.titulo")}</div>
            <div className="page-sub">{t("registro.subIOS")}</div>
          </div>
          {/* La única acción de la pantalla, en la barra fija: lo demás aquí
              se lee, no se toca. */}
          <button type="button" className="ios-nav-btn" onClick={() => setAbriendoNota(true)}>
            <IconEdit size={15} strokeWidth={2} /> {t("registro.nota")}
          </button>
        </div>

        <div className="content content-lienzo reg-ios-content">
          {loading ? (
            <LoadingState />
          ) : sucesos.length === 0 ? (
            <>
              {/* El vacío como tarjeta con salida, no como icono gris en medio
                  de la nada: lo único que una persona puede añadir aquí es una
                  nota, así que la puerta va dentro del propio vacío. */}
              <section className="ios-section">
                <div className="ios-listcard">
                  <div className="reg-vacio">
                    <span className="reg-vacio-titulo">{t("registro.vacio")}</span>
                    <span className="reg-vacio-texto">{t("registro.vacioSub")}</span>
                  </div>
                  <button type="button" className="ios-txrow reg-accion" onClick={() => setAbriendoNota(true)}>
                    <div className="ios-txrow-main"><div className="ios-txrow-title reg-accion-texto">{t("registro.escribirNota")}</div></div>
                    <div className="ios-txrow-trailing"><IosChevron /></div>
                  </button>
                </div>
                <p className="ios-section-footer">{t("registro.notaQueEs")}</p>
              </section>

              {/* La leyenda del color solo sale en el vacío: es el mejor
                  momento para explicarla, porque no compite con nada que leer,
                  y desaparece en cuanto hay una línea. */}
              <SeccionIOS titulo={t("registro.leyendaTitulo")} compacta>
                {(["tesoreria", "secretaria", "general"] as const).map((area) => (
                  <div className="ios-txrow reg-leyenda" key={area}>
                    <span className={`reg-punto reg-punto--${area}`} aria-hidden="true" />
                    <div className="ios-txrow-main"><div className="ios-txrow-title">{t(`registro.area.${area}`)}</div></div>
                  </div>
                ))}
              </SeccionIOS>
            </>
          ) : (
            porDia.map((g, i) => {
              const nuevos = g.items.filter(sinVer).length;
              return (
                <SeccionIOS
                  key={g.dia}
                  titulo={etiquetaDia(g.dia)}
                  indexada
                  accion={nuevos > 0 ? <span className="reg-sinver">{t("registro.nuevos", { count: nuevos })}</span> : undefined}
                  /* El pie solo bajo el primer día: explica el «sin ver» de
                     arriba, y repetido en cada grupo sería una letanía. */
                  pie={i === 0 && nuevos > 0 ? t("registro.pieVisto") : undefined}
                >
                  {g.items.map(filaIPhone)}
                </SeccionIOS>
              );
            })
          )}
        </div>

        {hojaNota}
      </>
    );
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
