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
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  areasDelRol, fmtFechaCorta, listRegistro, marcarRegistroVisto, registrarNota,
  type Church, type Suceso,
} from "../db";
import { puedeVer, type Role } from "../role";
import { useBarraEstado } from "../components/BarraEstado";
import LoadingState from "../components/LoadingState";
import { EmptyState } from "../components/TxList";
import { IconClipboardList, IconEdit } from "../icons";
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

/** Lo que el filtro de arriba puede pedir: un área, las notas, o todo. */
type Filtro = "todo" | "tesoreria" | "secretaria" | "notas";

export default function Registro({ church, role, refreshKey }: Props) {
  const { t } = useTranslation();
  const enIPhone = esIPhone();
  const [sucesos, setSucesos] = useState<Suceso[]>([]);
  const [loading, setLoading] = useState(true);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [abriendoNota, setAbriendoNota] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todo");

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

  /* El rol ya recortó la lista en `listRegistro`; el filtro solo trabaja
     sobre lo que esa persona puede ver. Un chip no puede enseñar algo que el
     rol no ve, y por eso el orden es este y no al revés. */
  const visibles = useMemo(() => {
    if (filtro === "todo") return sucesos;
    if (filtro === "notas") return sucesos.filter((x) => x.tipo === "nota");
    return sucesos.filter((x) => x.area === filtro);
  }, [sucesos, filtro]);

  /** Un día = un grupo, con su cuenta. El separador es cabecera de sección y
   *  no una fila más, que es lo que le deja envolver la tarjeta del día. */
  const dias = useMemo(() => {
    const out: { dia: string; filas: Suceso[] }[] = [];
    for (const x of visibles) {
      const d = diaDe(x.creado_en);
      const ultimo = out[out.length - 1];
      if (ultimo && ultimo.dia === d) ultimo.filas.push(x);
      else out.push({ dia: d, filas: [x] });
    }
    return out;
  }, [visibles]);

  /* Los chips que existen dependen del rol: ofrecerle "Secretaría" a la
     tesorera sería un filtro que siempre da cero. */
  const areas = areasDelRol(role);
  const chips: { id: Filtro; label: string; n: number }[] = [
    { id: "todo", label: t("registro.chipTodo"), n: sucesos.length },
    ...(areas.includes("tesoreria")
      ? [{ id: "tesoreria" as Filtro, label: t("registro.chipTesoreria"), n: sucesos.filter((x) => x.area === "tesoreria").length }]
      : []),
    ...(areas.includes("secretaria")
      ? [{ id: "secretaria" as Filtro, label: t("registro.chipSecretaria"), n: sucesos.filter((x) => x.area === "secretaria").length }]
      : []),
    { id: "notas", label: t("registro.chipNotas"), n: sucesos.filter((x) => x.tipo === "nota").length },
  ];

  const alcance = role === "tesorero"
    ? t("registro.alcanceTesorero")
    : role === "secretaria" ? t("registro.alcanceSecretaria") : t("registro.alcanceAdmin");

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
            {/* Con la cuenta delante, que es lo que dibuja el handoff: "38
                apuntes · lo que ha pasado en la iglesia". Un registro sin
                número no dice si hay tres cosas o trescientas. */}
            {!esMac() && <div className="page-sub">{t("registro.subConCuenta", { count: sucesos.length })}</div>}
          </div>
        )}
        <div className="header-actions">
          {/* Marcado mientras el redactor está abierto: es el mismo botón el
              que abre y el que cierra, y sin la marca no se sabe cuál de las
              dos cosas va a hacer. */}
          <button
            type="button"
            className={`btn secondary reg-btn-nota${abriendoNota ? " active" : ""}`}
            aria-pressed={abriendoNota}
            onClick={() => setAbriendoNota((v) => !v)}
          >
            <IconEdit size={16} strokeWidth={1.6} /> {t("registro.escribirNota")}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="reg-columna">
          {/* El filtro por área. No cambia lo que la persona PUEDE ver —eso lo
              decidió `listRegistro` con su rol—, solo lo que está mirando
              ahora. La cuenta va dentro del chip porque un filtro que da cero
              se distingue antes de pulsarlo. */}
          <div className="reg-chips">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`reg-chip reg-chip--${c.id}${filtro === c.id ? " active" : ""}`}
                aria-pressed={filtro === c.id}
                onClick={() => setFiltro(c.id)}
              >
                <span className="reg-chip-punto" aria-hidden="true" />
                {c.label}
                <span className="reg-chip-n">{c.n}</span>
              </button>
            ))}
            {/* Por qué la lista es la que es. Sin esto, un tesorero que no ve
                una carta emitida no sabe si es que no la hay o que no le
                toca — y las dos respuestas se parecen demasiado. */}
            <span className="reg-alcance">{alcance}</span>
          </div>

          {abriendoNota && (
            <div className="card pad-lg reg-nota">
              <textarea
                className="form-textarea"
                rows={2}
                autoFocus
                placeholder={t("registro.notaPlaceholder")}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void anotar(); }
                }}
              />
              <div className="reg-nota-pie">
                {/* Se dice ANTES de escribir, no después de guardar: que queda
                    con su nombre y que no se va a poder corregir cambia lo que
                    uno escribe. */}
                <span className="reg-nota-hint">{t("registro.notaPie")}</span>
                <kbd className="reg-nota-kbd">⌘↩</kbd>
                <button className="btn primary" onClick={() => void anotar()} disabled={guardando || !nota.trim()}>
                  {t("registro.notaGuardar")}
                </button>
              </div>
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
          ) : dias.length === 0 ? (
            /* Vacío del FILTRO, que no es el vacío de la pantalla: aquí sí hay
               cosas anotadas y decir "todavía no ha pasado nada" sería falso. */
            <EmptyState
              icon={<IconClipboardList size={20} strokeWidth={1.8} />}
              titulo={t("registro.sinCoincidencias")}
              sub={t("registro.sinCoincidenciasSub")}
            />
          ) : (
            <div className="reg-lista">
              {dias.map((g) => (
                <div key={g.dia} className="reg-grupo">
                  <div className="reg-dia">
                    <span>{etiquetaDia(g.dia)}</span>
                    <span className="reg-dia-n">{t("registro.cuenta", { count: g.filas.length })}</span>
                  </div>
                  <div className="reg-tarjeta">
                    {g.filas.map((s) => {
                      const esNota = s.tipo === "nota";
                      return (
                        <div key={s.id} className={`reg-fila${esNota ? " reg-fila--nota" : ""}`}>
                          <span className={`reg-punto reg-punto--${s.area}`} aria-hidden="true" />
                          <span className="reg-textos">
                            <span className="reg-cuerpo">{textoDe(s)}</span>
                            <span className="reg-meta">
                              {/* La nota se marca DOS veces —la etiqueta y el
                                  plano tintado— porque perder una sola no la
                                  borra del todo: impresa en blanco y negro se
                                  va el tinte y queda la etiqueta. */}
                              {esNota && <span className="reg-tag">{t("registro.nota")}</span>}
                              {/* Quién lo escribió. Un suceso lo escribió la app; una
                                  nota, una persona — y si no hay sesión (modo local)
                                  no se inventa un nombre, se dice "Nota" a secas. */}
                              <span className="reg-autor">
                                {esNota ? (s.quien ?? t("registro.nota")) : t("registro.porApp")}
                              </span>
                              <span className="reg-sep" aria-hidden="true">·</span>
                              <span className="reg-hora">{horaDe(s.creado_en)}</span>
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="reg-pie">
            {t("registro.pie")}
            {/* El enlace solo si esa persona puede entrar: la secretaria NO ve
                la Bandeja (`role.ts`), y ofrecerle un camino que le va a dar
                con la puerta cerrada es peor que no ofrecerlo. Cuando no lo
                ve, la frase termina en el punto anterior y se lee igual. */}
            {puedeVer(role, "/bandeja") && (
              <> {t("registro.piePendiente")} <Link to="/bandeja">{t("nav.porRevisar")}</Link>.</>
            )}
          </p>
        </div>
      </div>
    </>
  );
}
