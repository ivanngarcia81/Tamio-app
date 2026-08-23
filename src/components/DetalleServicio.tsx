import { useTranslation } from "react-i18next";
import { fmtFechaCorta, type Servicio } from "../db";
import { IconChevronLeft, IconEdit, IconTrash } from "../icons";

interface Props {
  servicio: Servicio;
  /** Los cultos anteriores (los mismos que ya tiene cargados la página), para
   *  la tira de asistencia. No se consultan aparte: se filtran de la lista. */
  historial: Servicio[];
  tituloLista: string;
  onVolver: () => void;
  onEditar: (s: Servicio) => void;
  onEliminar: (s: Servicio) => void;
}

/**
 * Los cinco puestos que dibuja el handoff, y de qué columna sale cada uno.
 *
 * `campo: null` = el puesto existe en el diseño y la tabla no lo guarda
 * todavía. No se esconde: la fila sale con su nombre y "sin asignar", que es
 * lo que deja ver el hueco. Cuando haya roster por puesto, esto se cambia por
 * la consulta y el resto de la tarjeta no se entera.
 */
const PUESTOS: { clave: string; campo: "predica" | "dirige" | null }[] = [
  { clave: "predicacion", campo: "predica" },
  { clave: "direccion", campo: "dirige" },
  { clave: "alabanza", campo: null },
  { clave: "ujieres", campo: null },
  { clave: "ofrenda", campo: null },
  { clave: "sonido", campo: null },
];

/** Las iniciales de un nombre, para el círculo de 30px del roster. */
function inicialesDe(nombre: string): string {
  return nombre.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? "").join("");
}

function lista(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function totalPresentes(s: Servicio): number {
  return s.ninos + s.jovenes + s.adultos;
}

/**
 * DetalleServicio — la columna derecha del maestro-detalle de Servicios.
 *
 * **El Roster y el Orden del culto: dibujados, medio cableados.** El handoff
 * pide un roster por PUESTOS —Predicación, Alabanza, Ujieres, Ofrenda,
 * Sonido— y un orden del culto con horas. En Tamio un servicio guarda
 * `predica`, `dirige` y una lista de `participaciones`: dos de los cinco
 * puestos existen de verdad, el resto no, y del horario no hay nada.
 *
 * Por la regla de Iván del 23 de agosto —primero la plantilla, el motor
 * después— las dos secciones se construyen: los puestos con columna se
 * llenan, los que no la tienen dicen "sin asignar" en el gris de pendiente, y
 * el orden del culto explica qué le falta. Ver docs/ipad-rediseno.md §21.
 *
 * "Asistencia del último mes" sí es real desde siempre: son los cultos
 * anteriores, que la página ya tiene cargados.
 */
export default function DetalleServicio({ servicio: s, historial, tituloLista, onVolver, onEditar, onEliminar }: Props) {
  const { t } = useTranslation();

  const participaciones = lista(s.participaciones);
  const asistentes = lista(s.asistentes);
  const ausentes = lista(s.ausentes);
  const visitantes = lista(s.visitantes);
  const total = totalPresentes(s);

  /* Este culto y los tres anteriores, del más viejo al más nuevo: la tira se
     lee de izquierda a derecha como pasa el tiempo. */
  const tira = historial
    .filter((x) => x.fecha <= s.fecha)
    .slice(0, 4)
    .reverse();
  const techo = Math.max(...tira.map(totalPresentes), 1);

  const campo = (etiqueta: string, valor: string | null | undefined) =>
    valor ? (
      <div className="dm-campo">
        <span className="dm-campo-etiqueta">{etiqueta}</span>
        <span className="dm-campo-valor">{valor}</span>
      </div>
    ) : null;

  /** Una sección de la ficha; sin filas dentro no se pinta, para que un culto
   *  a medio llenar no enseñe encabezados vacíos. */
  const seccion = (titulo: string, filas: React.ReactNode[]) => {
    const utiles = filas.filter(Boolean);
    if (utiles.length === 0) return null;
    return (
      <section className="ds-seccion">
        <h3 className="ds-seccion-titulo">{titulo}</h3>
        <div className="dm-ficha">{utiles}</div>
      </section>
    );
  };

  return (
    <div className="dm ds">
      <button type="button" className="dm-volver" onClick={onVolver}>
        <IconChevronLeft size={17} strokeWidth={2.4} /> {tituloLista}
      </button>

      <div className="dm-cab">
        <h2 className="da-titulo">{t(`servicios.tipo.${s.tipo}`)}</h2>
        <p className="dm-sub">
          {[fmtFechaCorta(s.fecha), s.titulo_mensaje].filter(Boolean).join(" · ")}
        </p>
        <div className="dm-acciones">
          {/* Las dos del handoff. Las dos abren el MISMO formulario, y eso no
              es un atajo: ahí dentro están la lista de asistencia (que guarda
              por diferencias en `servicio_asistencia`) y los campos de quién
              predica y quién dirige. Lo que cambia es la intención con la que
              se entra, y el rótulo la dice. */}
          <button type="button" className="btn secondary" onClick={() => onEditar(s)}>
            {t("servicios.tomarAsistencia")}
          </button>
          <button type="button" className="btn secondary dm-eliminar" onClick={() => onEliminar(s)}>
            <IconTrash size={14} strokeWidth={2} /> {t("common.eliminar")}
          </button>
          <button type="button" className="btn primary" onClick={() => onEditar(s)}>
            <IconEdit size={14} strokeWidth={2} /> {t("common.editar")}
          </button>
        </div>
      </div>

      {/* El roster por puestos del handoff. Los dos que la tabla guarda se
          llenan; los otros cuatro salen con su nombre y "sin asignar", para
          que se vea el hueco que va a llenarse. */}
      <section className="sv-roster">
        <div className="sv-roster-cab">{t("servicios.roster")}</div>
        {PUESTOS.map((p) => {
          const valor = p.campo ? (p.campo === "predica" ? s.predica : s.dirige) : null;
          return (
            <div className={`sv-puesto${valor ? "" : " sin"}`} key={p.clave}>
              <span className="sv-puesto-rol">{t(`servicios.puesto.${p.clave}`)}</span>
              {valor ? (
                <>
                  <span className="sv-puesto-avatar">{inicialesDe(valor)}</span>
                  <span className="sv-puesto-nombre truncate">{valor}</span>
                </>
              ) : (
                <span
                  className="sv-puesto-nombre sv-puesto-sin"
                  title={p.campo ? undefined : t("servicios.puestoAyuda")}
                >
                  {t("servicios.sinAsignar")}
                </span>
              )}
            </div>
          );
        })}
        {participaciones.length > 0 && (
          <div className="sv-puesto">
            <span className="sv-puesto-rol">{t("servicios.participaciones")}</span>
            <span className="sv-puesto-nombre truncate">{participaciones.join(" · ")}</span>
          </div>
        )}
      </section>

      {/* "Orden del culto": el handoff lo dibuja con horas y el servicio no
          guarda ninguna. Se construye la tarjeta con su explicación en vez de
          desaparecer, igual que la pestaña Familia de Aportantes. */}
      <section className="sv-orden">
        <div className="sv-roster-cab">{t("servicios.ordenCulto")}</div>
        <div className="fm-vacio fm-vacio--pendiente sv-orden-vacio">
          <span className="fm-vacio-titulo">{t("servicios.sinOrdenTitulo")}</span>
          <span className="fm-vacio-sub">{t("servicios.sinOrdenSub")}</span>
        </div>
      </section>

      {/* El conteo, primero y en grande: es la cifra que sale en los informes
          del mes y lo que se viene a comprobar de un culto pasado. */}
      <section className="ds-conteo">
        <div className="ds-conteo-total">
          <span className="ds-conteo-cifra">{total || "—"}</span>
          <span className="ds-conteo-etiqueta">{t("servicios.totalPresentes")}</span>
        </div>
        <div className="ds-conteo-desglose">
          <div><span>{s.ninos}</span>{t("servicios.ninos")}</div>
          <div><span>{s.jovenes}</span>{t("servicios.jovenes")}</div>
          <div><span>{s.adultos}</span>{t("servicios.adultos")}</div>
        </div>
      </section>

      {/* La tira del handoff, con datos de verdad: este culto y los tres
          anteriores. Con uno solo no se pinta — una barra sola no compara. */}
      {tira.length >= 2 && (
        <section className="ds-seccion">
          <h3 className="ds-seccion-titulo">{t("servicios.colAsistencia")}</h3>
          <div className="ds-tira">
            {tira.map((x) => {
              const v = totalPresentes(x);
              return (
                <div key={x.id} className={`ds-tira-col${x.id === s.id ? " es-actual" : ""}`}>
                  <span className="ds-tira-cifra">{v || "—"}</span>
                  {/* La barra vive en su propio hueco flexible: si su alto en
                      % se midiera contra la columna entera, la cifra y la
                      fecha se sumarían encima y la última se recortaría. */}
                  <span className="ds-tira-hueco">
                    <span className="ds-tira-barra" style={{ height: `${Math.max(4, (v / techo) * 100)}%` }} />
                  </span>
                  <span className="ds-tira-fecha">{fmtFechaCorta(x.fecha)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {seccion(t("servicios.secServicio"), [
        campo(t("servicios.dirige"), s.dirige),
        campo(t("servicios.predica"), s.predica),
      ])}

      {seccion(t("servicios.secMensaje"), [
        campo(t("servicios.tituloMensaje"), s.titulo_mensaje),
        campo(t("servicios.textoBiblico"), s.texto_biblico),
        campo(t("servicios.resumenMensaje"), s.resumen_mensaje),
      ])}

      {seccion(t("servicios.secParticipaciones"), [
        campo(t("servicios.participaciones"), participaciones.join(", ")),
      ])}

      {seccion(t("servicios.secEscuela"), [
        campo(t("servicios.temaEscuela"), s.tema_escuela),
        campo(t("servicios.maestroEscuela"), s.maestro_escuela),
      ])}

      {seccion(t("servicios.secAsistenciaMiembro"), [
        asistentes.length + ausentes.length > 0
          ? campo(
              t("servicios.totalRoster"),
              t("servicios.resumenPadron", {
                presentes: asistentes.length,
                ausentes: ausentes.length,
                total: asistentes.length + ausentes.length,
              }),
            )
          : null,
        campo(t("servicios.visitantes"), visitantes.join(", ")),
      ])}

      {seccion(t("servicios.secEventos"), [campo(t("servicios.secEventos"), s.eventos)])}
    </div>
  );
}
