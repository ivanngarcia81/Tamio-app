import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { fmtFechaCorta, type AsistenciaLigera, type Member } from "../db";
import {
  camposFaltantes, estadoEfectivo, type AsistenciaMiembro, type Periodo,
} from "../services/informes/membresia";
import { IconEdit } from "../icons";

interface Props {
  member: Member;
  /** Resumen ya calculado por la página (el mismo mapa de la lista). */
  asis: AsistenciaMiembro | undefined;
  /** Las filas de asistencia de ESTE miembro, para las barras por mes.
   *  Se filtran del arreglo que la página ya tiene: no se consulta aparte. */
  filasAsis: AsistenciaLigera[];
  periodo: Periodo;
  /** Umbral de "N servicios seguidos sin asistir" (umbrales configurables). */
  umbralRacha: number;
  onEditar: (m: Member) => void;
  onSeguimiento: (m: Member) => void;
}

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Un arreglo JSON tolerante: basura → vacío, nunca tumbar el panel. */
function lista<T>(json: string | null): T[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/** Claves de catálogo traducidas; el texto libre pasa tal cual. */
function catalogo(t: (k: string) => string, json: string, prefijo: string): string {
  const items = lista<string>(json).map((c) => {
    const clave = `${prefijo}.${c}`;
    const tr = t(clave);
    return tr === clave ? c : tr;
  });
  return items.join(" · ");
}

function inicialesDe(nombre: string): string {
  return nombre.split(" ").filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

/**
 * DetalleMembresia — la columna derecha del maestro-detalle de Membresía
 * (handoff 2, 22 ago 2026). No confundir con `DetalleMiembro`, que es la
 * ficha de TESORERÍA (Aportantes: sus aportes, su constancia). Esta es la de
 * SECRETARÍA: el documento del padrón — asistencia, expediente y los
 * movimientos de membresía.
 *
 * Todo lo que pinta sale del esquema real. Las tres piezas que el handoff
 * dibuja y que aquí se cablean de verdad, no como cáscara:
 *
 *  - la asistencia (barras por mes, roster, racha, última visita) sale de
 *    `AsistenciaLigera`, que la página ya tiene cargada;
 *  - el expediente usa `camposFaltantes()`, la MISMA regla del informe de
 *    membresía, y no la lista de cinco campos del prototipo: el requisito real
 *    es "correo O teléfono", no los dos. "Dirección" ya tiene columna desde el
 *    24 ago 2026 y se pinta entre los datos, pero **no entra en el expediente**
 *    y eso es a propósito: `camposFaltantes` marca lo OBLIGATORIO, y meterla
 *    ahí dejaría el padrón entero en rojo de un día para otro por un campo que
 *    nadie había podido llenar nunca;
 *  - las alertas son las dos computables hoy: racha ≥ umbral, y nuevo en el
 *    periodo sin revisión de seguimiento (`seguimiento_revisado_en`).
 */
export default function DetalleMembresia({
  member: m, asis, filasAsis, periodo, umbralRacha, onEditar, onSeguimiento,
}: Props) {
  const { t } = useTranslation();

  const estado = estadoEfectivo(m);
  const faltan = camposFaltantes(m);
  const ministerios = catalogo(t, m.ministerios, "ficha.ministerio");
  const cargos = catalogo(t, m.cargos, "ficha.cargo");
  const instrumentos = catalogo(t, m.instrumentos, "ficha.instrumento");

  /* Barras por mes: % de asistencia de ESTE miembro en cada mes del periodo
     donde estuvo en algún roster. Sin roster ese mes, la barra no se pinta
     llena ni vacía: se pinta el hueco (un 0% inventado acusaría). */
  const barras = useMemo(() => {
    const por = new Map<string, { asis: number; roster: number }>();
    for (const f of filasAsis) {
      const mes = f.fecha.slice(0, 7);
      const e = por.get(mes) ?? { asis: 0, roster: 0 };
      e.roster += 1;
      if (f.presente === 1) e.asis += 1;
      por.set(mes, e);
    }
    return [...por.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-8)
      .map(([mes, v]) => ({
        etiqueta: MESES_CORTOS[Number(mes.slice(5, 7)) - 1] ?? mes,
        pct: v.roster > 0 ? Math.round((v.asis / v.roster) * 100) : null,
      }));
  }, [filasAsis]);

  /* Las alertas computables hoy. Cada una lleva a Seguimiento, que es donde
     se anota la visita y se marca revisado. */
  const alertas = useMemo(() => {
    const out: { titulo: string; detalle: string }[] = [];
    if (estado === "activo" && asis && asis.racha >= umbralRacha) {
      out.push({
        titulo: t("membresia.alertaRacha", { n: asis.racha }),
        detalle: asis.ultimaAsistencia
          ? t("membresia.alertaRachaDesde", { fecha: fmtFechaCorta(asis.ultimaAsistencia) })
          : t("membresia.alertaRachaSinVisita"),
      });
    }
    const fechaNuevo = m.fecha_ingreso ?? m.fecha_congregacion;
    const esNuevo = fechaNuevo != null
      && (!periodo.desde || fechaNuevo >= periodo.desde)
      && (!periodo.hasta || fechaNuevo <= periodo.hasta);
    if (esNuevo && !m.seguimiento_revisado_en) {
      out.push({
        titulo: t("membresia.alertaNuevo"),
        detalle: t("membresia.alertaNuevoDetalle", { fecha: fmtFechaCorta(fechaNuevo!) }),
      });
    }
    return out;
  }, [m, asis, estado, umbralRacha, periodo, t]);

  /* Los movimientos de membresía: el historial de estados guardado, más los
     tres hitos de la ficha. Del más nuevo al más viejo, como una bitácora. */
  const movimientos = useMemo(() => {
    const out: { titulo: string; detalle: string; fecha: string }[] = [];
    for (const h of lista<{ de: string; a: string; fecha: string }>(m.historial_estados)) {
      if (!h || !h.fecha) continue;
      out.push({
        titulo: t("membresia.movEstado", {
          de: t(`membresia.estado.${h.de}`, { defaultValue: h.de }),
          a: t(`membresia.estado.${h.a}`, { defaultValue: h.a }),
        }),
        detalle: fmtFechaCorta(h.fecha),
        fecha: h.fecha,
      });
    }
    if (m.fecha_ingreso) out.push({ titulo: t("membresia.movAlta"), detalle: fmtFechaCorta(m.fecha_ingreso), fecha: m.fecha_ingreso });
    if (m.fecha_bautismo_agua) out.push({ titulo: t("membresia.movBautismo"), detalle: fmtFechaCorta(m.fecha_bautismo_agua), fecha: m.fecha_bautismo_agua });
    if (m.fecha_congregacion) out.push({ titulo: t("membresia.movCongrega"), detalle: fmtFechaCorta(m.fecha_congregacion), fecha: m.fecha_congregacion });
    return out.sort((a, b) => (a.fecha > b.fecha ? -1 : 1)).slice(0, 6);
  }, [m, t]);

  /* Los renglones del expediente: los REQUISITOS reales de la app, con la
     clave de cada uno en `camposFaltantes`. */
  const expediente: { etiqueta: string; falta: boolean }[] = [
    { etiqueta: t("membresia.expNombre"), falta: faltan.includes("nombre") },
    { etiqueta: t("membresia.expCongregacion"), falta: faltan.includes("fechaCongregacion") },
    { etiqueta: t("membresia.expContacto"), falta: faltan.includes("contacto") },
    { etiqueta: t("membresia.expIngreso"), falta: faltan.includes("fechaIngreso") },
  ];

  const chipEstado = {
    activo: "activo", inactivo: "baja", visitante: "servicios", enProceso: "donacion",
    trasladado: "administracion", retirado: "baja", fallecido: "baja", baja: "baja",
  }[estado] ?? "otros";

  const fila = (etiqueta: string, valor: string | null | undefined) => (
    <div className="mb-dato">
      <span className="mb-dato-k">{etiqueta}</span>
      <span className="mb-dato-v">{valor || "—"}</span>
    </div>
  );

  /* Sin `.dm` ni volver propios: este componente es el CUERPO de la ficha.
     El panel lo compone la página — las ocho tarjetas del padrón arriba y
     esta ficha debajo, como dibuja el handoff — y el volver del modo de
     empuje también es de la página, porque vale igual para la ficha que
     para el panel de asistencia. */
  return (
    <div className="mb-det">
      <div className="mb-cab">
        <span className="mb-cab-avatar">{inicialesDe(m.nombre)}</span>
        <div className="mb-cab-textos">
          <h1 className="mb-cab-nombre">{m.nombre}</h1>
          <div className="mb-cab-chips">
            <span className={`tag ${chipEstado}`}>{t(`membresia.estado.${estado}`, { defaultValue: estado })}</span>
            {m.fecha_ingreso && <span className="mb-chip">{t("membresia.chipIngreso", { anio: m.fecha_ingreso.slice(0, 4) })}</span>}
            <span className="mb-chip">{ministerios || t("membresia.sinMinisterio")}</span>
          </div>
        </div>
        <div className="mb-cab-acciones">
          <button type="button" className="btn secondary" onClick={() => onSeguimiento(m)}>
            {t("membresia.btnSeguimiento")}
          </button>
          <button type="button" className="btn primary" onClick={() => onEditar(m)}>
            <IconEdit size={14} strokeWidth={2} /> {t("common.editar")}
          </button>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="mb-alertas">
          {alertas.map((a, i) => (
            <div key={i} className="mb-alerta">
              <span className="mb-alerta-punto">!</span>
              <span className="mb-alerta-textos">
                <span className="mb-alerta-titulo">{a.titulo}</span>
                <span className="mb-alerta-detalle">{a.detalle}</span>
              </span>
              <button type="button" className="mb-alerta-revisar" onClick={() => onSeguimiento(m)}>
                {t("membresia.revisar")}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-rejilla">
        <div className="mb-col">
          <section className="mb-carta">
            <div className="mb-carta-cab">
              <h3 className="mb-carta-titulo">{t("membresia.asistenciaPeriodo")}</h3>
              <span className="mb-carta-cifra">{asis?.pct != null ? `${asis.pct}%` : "—"}</span>
            </div>
            {barras.length > 0 && (
              <div className="mb-barras">
                {barras.map((b) => (
                  <span key={b.etiqueta} className="mb-barra-col">
                    <span className="mb-barra-hueco">
                      {b.pct != null && <span className="mb-barra" style={{ height: `${Math.max(4, b.pct)}%` }} />}
                    </span>
                    <span className="mb-barra-mes">{b.etiqueta}</span>
                  </span>
                ))}
              </div>
            )}
            <div className="mb-metricas">
              <span className="mb-metrica"><span>{t("membresia.enRoster")}</span><strong>{asis ? `${asis.asistidos} de ${asis.enRoster}` : "—"}</strong></span>
              <span className="mb-metrica"><span>{t("membresia.racha")}</span><strong>{asis ? t("membresia.rachaServicios", { count: asis.racha }) : "—"}</strong></span>
              <span className="mb-metrica"><span>{t("membresia.ultimaVisita")}</span><strong>{asis?.ultimaAsistencia ? fmtFechaCorta(asis.ultimaAsistencia) : "—"}</strong></span>
            </div>
          </section>

          <section className="mb-carta mb-carta-lisa">
            {fila(t("detalleMiembro.nacimiento"), m.fecha_nacimiento ? fmtFechaCorta(m.fecha_nacimiento) : null)}
            {fila(t("detalleMiembro.estadoCivil"), m.estado_civil
              ? t(`ficha.estadoCivil.${m.estado_civil}`, { defaultValue: m.estado_civil })
              : null)}
            {fila(t("detalleMiembro.direccion"), m.direccion)}
            {fila(t("membresia.colIngreso"), m.fecha_ingreso ? fmtFechaCorta(m.fecha_ingreso) : null)}
            {fila(t("ficha.fechaCongregacion"), m.fecha_congregacion ? fmtFechaCorta(m.fecha_congregacion) : null)}
            {fila(t("membresia.labelBautismo"), m.fecha_bautismo_agua ? fmtFechaCorta(m.fecha_bautismo_agua) : (m.bautizado_agua === 1 ? t("common.si") : null))}
            {fila(t("membresia.colCargos"), cargos)}
            {fila(t("membresia.colInstrumentos"), instrumentos)}
          </section>
        </div>

        <div className="mb-col">
          <section className="mb-carta">
            <div className="mb-carta-cab">
              <h3 className="mb-carta-titulo">{t("membresia.expediente")}</h3>
              <span className={`mb-exp-estado${faltan.length ? " pendiente" : ""}`}>
                {faltan.length === 0 ? t("membresia.expCompleto") : t("membresia.expPorLlenar", { count: faltan.length })}
              </span>
            </div>
            <div className="mb-exp-lista">
              {expediente.map((c) => (
                <span key={c.etiqueta} className="mb-exp-campo">
                  <span className={`mb-exp-icono${c.falta ? " falta" : ""}`}>{c.falta ? "!" : "✓"}</span>
                  <span className={c.falta ? "mb-exp-nombre falta" : "mb-exp-nombre"}>{c.etiqueta}</span>
                </span>
              ))}
            </div>
          </section>

          <section className="mb-carta">
            <h3 className="mb-carta-titulo">{t("membresia.movimientos")}</h3>
            <div className="mb-movs">
              {movimientos.length === 0 && <span className="mb-movs-vacio">{t("membresia.sinMovimientos")}</span>}
              {movimientos.map((mv, i) => (
                <span key={i} className="mb-mov">
                  <span className={`mb-mov-punto${i === 0 ? " reciente" : ""}`} />
                  <span className="mb-mov-textos">
                    <span className="mb-mov-titulo">{mv.titulo}</span>
                    <span className="mb-mov-detalle">{mv.detalle}</span>
                  </span>
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
