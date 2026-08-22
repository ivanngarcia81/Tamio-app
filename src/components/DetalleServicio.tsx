import { useTranslation } from "react-i18next";
import { fmtFecha, fmtFechaCorta, type Servicio, type ServicioVisitante } from "../db";
import { IconChevronLeft, IconEdit, IconTrash } from "../icons";

interface Props {
  servicio: Servicio;
  /** Título de la lista ("Servicios"): el texto del botón de volver del modo
   *  de empuje. En columnas el CSS lo esconde, igual que en movimientos. */
  tituloLista: string;
  onVolver: () => void;
  onEditar: (s: Servicio) => void;
  onEliminar: (s: Servicio) => void;
}

function parseNombres(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseVisitantes(json: string): ServicioVisitante[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * DetalleServicio — la columna derecha del maestro-detalle de Servicios.
 *
 * La ficha del culto por secciones, en el mismo orden que el formulario de
 * registro (conteo, mensaje, participaciones, escuela, visitantes, eventos):
 * quien lo llenó lo encuentra donde lo dejó. Solo pinta las secciones con
 * datos — un culto sin escuela bíblica no enseña un rótulo vacío.
 *
 * El diseño de referencia traía además el "Orden del culto" con horarios
 * (10:00 Bienvenida, 10:10 Alabanza…) y el roster por rol (Predicación,
 * Ujieres, Sonido) con "Asignar encargado". Nada de eso existe: `servicios`
 * es una BITÁCORA de lo que ya pasó, no una planeación — no guarda orden del
 * programa ni roles asignados. Se toma la estructura (lista de 358px +
 * panel), no los datos inventados (docs/ipad-rediseno.md §4).
 */
export default function DetalleServicio({ servicio: s, tituloLista, onVolver, onEditar, onEliminar }: Props) {
  const { t } = useTranslation();
  const f = fmtFecha(s.fecha);
  const participaciones = parseNombres(s.participaciones);
  const visitantes = parseVisitantes(s.visitantes);
  const totalConteo = s.ninos + s.jovenes + s.adultos;
  const asistentes = parseNombres(s.asistentes);
  const ausentes = parseNombres(s.ausentes);

  const fila = (etiqueta: string, valor: string | null | undefined) =>
    valor ? (
      <div className="dm-campo">
        <span className="dm-campo-etiqueta">{etiqueta}</span>
        <span className="dm-campo-valor">{valor}</span>
      </div>
    ) : null;

  return (
    <div className="dm">
      <button type="button" className="dm-volver" onClick={onVolver}>
        <IconChevronLeft size={17} strokeWidth={2.4} /> {tituloLista}
      </button>

      <div className="dm-cab">
        <h2 className="dm-doc-titulo">{t(`servicios.tipo.${s.tipo}`)}</h2>
        <p className="dm-sub">
          {[`${f.nombreDia} ${fmtFechaCorta(s.fecha)}`, s.dirige ? `${t("servicios.dirige")}: ${s.dirige}` : null]
            .filter(Boolean).join(" · ")}
        </p>
        <div className="dm-acciones">
          <button type="button" className="btn secondary dm-eliminar" onClick={() => onEliminar(s)}>
            <IconTrash size={14} strokeWidth={2} /> {t("common.eliminar")}
          </button>
          <button type="button" className="btn primary" onClick={() => onEditar(s)}>
            <IconEdit size={14} strokeWidth={2} /> {t("common.editar")}
          </button>
        </div>
      </div>

      {totalConteo > 0 && (
        <div>
          <div className="dm-seccion">{t("servicios.secConteo")}</div>
          <div className="dm-ficha">
            {s.ninos > 0 ? fila(t("servicios.ninos"), String(s.ninos)) : null}
            {s.jovenes > 0 ? fila(t("servicios.jovenes"), String(s.jovenes)) : null}
            {s.adultos > 0 ? fila(t("servicios.adultos"), String(s.adultos)) : null}
            {fila(t("servicios.totalPresentes"), String(totalConteo))}
          </div>
        </div>
      )}

      {(s.predica || s.titulo_mensaje || s.texto_biblico || s.resumen_mensaje) && (
        <div>
          <div className="dm-seccion">{t("servicios.secMensaje")}</div>
          <div className="dm-ficha">
            {fila(t("servicios.predica"), s.predica)}
            {fila(t("servicios.tituloMensaje"), s.titulo_mensaje)}
            {fila(t("servicios.textoBiblico"), s.texto_biblico)}
            {fila(t("servicios.resumenMensaje"), s.resumen_mensaje)}
          </div>
        </div>
      )}

      {participaciones.length > 0 && (
        <div>
          <div className="dm-seccion">{t("servicios.secParticipaciones")}</div>
          <div className="dm-ficha">
            {participaciones.map((p, i) => (
              <div className="dm-campo" key={i}>
                <span className="dm-campo-valor">{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(s.tema_escuela || s.maestro_escuela) && (
        <div>
          <div className="dm-seccion">{t("servicios.secEscuela")}</div>
          <div className="dm-ficha">
            {fila(t("servicios.temaEscuela"), s.tema_escuela)}
            {fila(t("servicios.maestroEscuela"), s.maestro_escuela)}
          </div>
        </div>
      )}

      {(asistentes.length > 0 || ausentes.length > 0) && (
        <div>
          <div className="dm-seccion">{t("servicios.secAsistencia")}</div>
          <div className="dm-ficha">
            {asistentes.length > 0 ? fila(t("servicios.presentes"), asistentes.join(", ")) : null}
            {ausentes.length > 0 ? fila(t("servicios.ausentesLabel"), ausentes.join(", ")) : null}
          </div>
        </div>
      )}

      {visitantes.length > 0 && (
        <div>
          <div className="dm-seccion">{t("servicios.visitantes")}</div>
          <div className="dm-ficha">
            {visitantes.map((v, i) => (
              <div className="dm-campo" key={i}>
                <span className="dm-campo-valor">
                  {v.nombre}
                  {v.invitado_por && <span style={{ color: "var(--text-2)", fontWeight: 400 }}> · {v.invitado_por}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {s.eventos && (
        <div>
          <div className="dm-seccion">{t("servicios.secEventos")}</div>
          <div className="dm-ficha">
            <div className="dm-campo">
              <span className="dm-campo-valor" style={{ whiteSpace: "pre-wrap", fontWeight: 400 }}>{s.eventos}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
