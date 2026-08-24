import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  asignarPuesto, deletePasoOrden, fmtFechaCorta, insertPasoOrden, listCandidatosPuesto,
  listOrdenCulto, listPuestosServicio, moverPasoOrden, quitarPuesto, updatePasoOrden,
  PUESTOS, type PasoOrden, type PuestoAsignado, type Servicio,
} from "../db";
import { IOSBuscadorSheet } from "./ios/IOSBuscadorSheet";
import PasoOrdenIOS from "./PasoOrdenIOS";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { IconChevronLeft, IconEdit, IconPlus, IconTrash } from "../icons";

interface Props {
  servicio: Servicio;
  /** Los cultos anteriores (los mismos que ya tiene cargados la página), para
   *  la tira de asistencia. No se consultan aparte: se filtran de la lista. */
  historial: Servicio[];
  churchId: number;
  tituloLista: string;
  onVolver: () => void;
  onEditar: (s: Servicio) => void;
  onEliminar: (s: Servicio) => void;
}

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
 * **El Roster y el Orden del culto: con motor desde la migración 43.** Eran
 * los dos huecos grandes que quedaban del handoff. El roster pedía seis
 * puestos y la tabla guardaba dos (`predica` y `dirige`); los otros cuatro
 * decían "Sin asignar" con un botón apagado al lado. Del orden del culto no
 * había nada: la tarjeta existía solo para explicar que faltaba.
 *
 * Cómo quedó repartido, y por qué no es una inconsistencia:
 *
 *  - **Predicación y Dirección siguen en sus columnas.** Se escriben en el
 *    formulario del culto desde la primera versión y salen en los informes;
 *    moverlos a la tabla nueva habría obligado a migrar datos reales para no
 *    ganar nada. Se editan donde siempre: en el formulario.
 *  - **Los otros cuatro viven en `servicio_puestos`** y se asignan desde
 *    aquí, con la hoja del buscador — la misma que elige aportante en Nuevo
 *    ingreso—, que además deja escribir un nombre que no está en el padrón.
 *  - **El orden del culto vive en `servicio_orden`**, y lo manda `posicion`,
 *    no la hora: hay pasos sin hora, y ordenarlos por una hora vacía los
 *    mandaría todos al principio.
 *
 * "Asistencia del último mes" es real desde siempre: son los cultos
 * anteriores, que la página ya tiene cargados.
 */
export default function DetalleServicio({ servicio: s, historial, churchId, tituloLista, onVolver, onEditar, onEliminar }: Props) {
  const { t } = useTranslation();

  /* Lo que se guarda aparte del servicio. Se recarga con `recargar()` después
     de cada cambio en vez de tocar el estado a mano: la lista es de seis
     renglones y una consulta de seis filas cuesta menos que un bug de estado
     desincronizado con la base. */
  const [puestos, setPuestos] = useState<PuestoAsignado[]>([]);
  const [orden, setOrden] = useState<PasoOrden[]>([]);
  const [candidatos, setCandidatos] = useState<{ id: number; nombre: string; sub: string | null }[]>([]);
  /** Clave del puesto que se está asignando, o null si la hoja está cerrada. */
  const [asignando, setAsignando] = useState<string | null>(null);
  /** Paso del orden en edición: `null` = cerrado, `"nuevo"` = alta. */
  const [pasoEdit, setPasoEdit] = useState<PasoOrden | "nuevo" | null>(null);

  const recargar = useCallback(async () => {
    const [ps, os] = await Promise.all([listPuestosServicio(s.id), listOrdenCulto(s.id)]);
    setPuestos(ps);
    setOrden(os);
  }, [s.id]);

  useEffect(() => { void recargar().catch(console.error); }, [recargar]);

  /* El padrón se pide una sola vez por iglesia y no por culto: es la misma
     lista para todos, y volver a leer cuatrocientos nombres al cambiar de
     fila de la lista se nota al deslizar. */
  useEffect(() => {
    let cancelado = false;
    listCandidatosPuesto(churchId)
      .then((ms) => {
        if (cancelado) return;
        setCandidatos(ms.map((m) => ({
          id: m.id,
          nombre: m.nombre,
          // Cargo primero y ministerio después: lo que distingue a dos
          // personas del mismo nombre es lo que hacen en la iglesia.
          sub: [...lista(m.cargos), ...lista(m.ministerios)][0] ?? null,
        })));
      })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [churchId]);

  const porPuesto = new Map(puestos.map((p) => [p.puesto, p]));

  async function guardarPuesto(puesto: string, nombre: string, memberId: number | null) {
    try {
      await asignarPuesto(churchId, s.id, puesto, nombre, memberId);
      playSound("guardado");
      await recargar();
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    }
    setAsignando(null);
  }

  async function soltarPuesto(puesto: string) {
    try {
      await quitarPuesto(s.id, puesto);
      await recargar();
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    }
    setAsignando(null);
  }

  async function guardarPaso(v: { hora: string | null; titulo: string; encargado: string | null }) {
    try {
      if (pasoEdit && pasoEdit !== "nuevo") await updatePasoOrden(pasoEdit.id, churchId, v);
      else await insertPasoOrden(churchId, s.id, v);
      playSound("guardado");
      await recargar();
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    }
    setPasoEdit(null);
  }

  async function borrarPaso(paso: PasoOrden) {
    try {
      await deletePasoOrden(paso.id, churchId);
      playSound("eliminar");
      await recargar();
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    }
  }

  async function moverPaso(paso: PasoOrden, direccion: -1 | 1) {
    try {
      await moverPasoOrden(s.id, churchId, paso.id, direccion);
      await recargar();
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    }
  }

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

      {/* El roster por puestos. Los seis renglones se llenan de dos sitios
          distintos y el que lee no tiene por qué notarlo: Predicación y
          Dirección de las columnas del servicio, los otros cuatro de
          `servicio_puestos`. */}
      <section className="sv-roster">
        <div className="sv-roster-cab">{t("servicios.roster")}</div>
        {PUESTOS.map((p) => {
          const asignado = p.campo === null ? porPuesto.get(p.clave) ?? null : null;
          const valor = p.campo
            ? (p.campo === "predica" ? s.predica : s.dirige)
            : asignado?.nombre ?? null;
          return (
            <div className={`sv-puesto${valor ? "" : " sin"}`} key={p.clave}>
              <span className="sv-puesto-rol">{t(`servicios.puesto.${p.clave}`)}</span>
              {valor && (
                <>
                  <span className="sv-puesto-avatar">{inicialesDe(valor)}</span>
                  <span className="sv-puesto-nombre truncate">{valor}</span>
                </>
              )}
              {!valor && p.campo && (
                /* Predicación y Dirección sin llenar. No llevan botón porque
                   no se asignan aquí: se escriben en el formulario del culto,
                   que es donde han estado siempre y de donde salen impresos. */
                <span className="sv-puesto-nombre sv-puesto-sin">{t("servicios.sinAsignar")}</span>
              )}
              {p.campo === null && (
                /* El botón del handoff, ya encendido. Con alguien puesto dice
                   "Cambiar" y abre la misma hoja: reasignar y asignar son el
                   mismo gesto, y separarlos en dos controles habría llenado
                   la fila para no decir nada nuevo. */
                <button
                  type="button"
                  className="sv-puesto-asignar sv-puesto-asignar--vivo"
                  onClick={() => setAsignando(p.clave)}
                >
                  {valor ? t("common.cambiar") : t("servicios.asignarEncargado")}
                </button>
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

      {/* "Orden del culto": el minuto a minuto, con motor desde la migración
          43. Vacío enseña su invitación en vez de un cartel de "falta motor",
          que es lo que decía hasta la 1.2.9. */}
      <section className="sv-orden">
        <div className="sv-roster-cab sv-orden-cab">
          <span>{t("servicios.ordenCulto")}</span>
          <button type="button" className="sv-orden-anadir" onClick={() => setPasoEdit("nuevo")}>
            <IconPlus size={13} strokeWidth={2.4} /> {t("servicios.anadirPaso")}
          </button>
        </div>
        {orden.length === 0 ? (
          <div className="fm-vacio fm-vacio--pendiente sv-orden-vacio">
            <span className="fm-vacio-titulo">{t("servicios.sinOrdenTitulo")}</span>
            <span className="fm-vacio-sub">{t("servicios.sinOrdenSub")}</span>
          </div>
        ) : (
          orden.map((paso, i) => (
            <div className="sv-paso" key={paso.id}>
              {/* La hora ocupa su columna esté o no: sin ella, los títulos de
                  los pasos con hora y los de sin hora arrancarían en dos
                  márgenes distintos y la lista dejaría de leerse en vertical. */}
              <span className={`sv-paso-hora${paso.hora ? "" : " sv-paso-hora--sin"}`}>
                {paso.hora ?? "—"}
              </span>
              <span className="sv-paso-textos">
                <button type="button" className="sv-paso-titulo" onClick={() => setPasoEdit(paso)}>
                  {paso.titulo}
                </button>
                {paso.encargado && <span className="sv-paso-encargado truncate">{paso.encargado}</span>}
              </span>
              <span className="sv-paso-mandos">
                {/* Dos flechas y no arrastre: en una lista de seis renglones
                    en un iPad, una flecha se acierta siempre y un arrastre
                    con el dedo, a veces. */}
                <button
                  type="button"
                  aria-label={t("servicios.subirPaso")}
                  title={t("servicios.subirPaso")}
                  disabled={i === 0}
                  onClick={() => void moverPaso(paso, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={t("servicios.bajarPaso")}
                  title={t("servicios.bajarPaso")}
                  disabled={i === orden.length - 1}
                  onClick={() => void moverPaso(paso, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="sv-paso-borrar"
                  aria-label={t("servicios.quitarPaso")}
                  title={t("servicios.quitarPaso")}
                  onClick={() => void borrarPaso(paso)}
                >
                  <IconTrash size={13} strokeWidth={2} />
                </button>
              </span>
            </div>
          ))
        )}
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

      {/* La hoja del buscador, la misma que elige aportante en Nuevo ingreso.
          `onTextoLibre` es lo que hace que sirva aquí: quien ayuda en sonido
          un domingo puede no estar en el padrón, y obligar a darlo de alta
          para poder anotarlo convertiría un apunte en un trámite. */}
      {asignando && (() => {
        const actual = porPuesto.get(asignando) ?? null;
        const puestoActual = asignando;
        return (
          <IOSBuscadorSheet
            title={t("servicios.asignarTitulo", { puesto: t(`servicios.puesto.${puestoActual}`) })}
            placeholder={t("servicios.asignarBuscar")}
            opciones={candidatos.map((c) => ({ id: String(c.id), titulo: c.nombre, sub: c.sub }))}
            seleccionado={actual?.member_id != null ? String(actual.member_id) : null}
            textoInicial={actual?.nombre ?? ""}
            onElegir={(op) => void guardarPuesto(puestoActual, op.titulo, Number(op.id))}
            onTextoLibre={(texto) => void guardarPuesto(puestoActual, texto, null)}
            etiquetaTextoLibre={(texto) => t("servicios.asignarLibre", { nombre: texto })}
            onLimpiar={actual ? () => void soltarPuesto(puestoActual) : undefined}
            onCancel={() => setAsignando(null)}
          />
        );
      })()}

      {pasoEdit && (
        <PasoOrdenIOS
          paso={pasoEdit === "nuevo" ? null : pasoEdit}
          onGuardar={(v) => void guardarPaso(v)}
          onClose={() => setPasoEdit(null)}
        />
      )}
    </div>
  );
}
