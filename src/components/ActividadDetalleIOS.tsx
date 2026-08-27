import { useTranslation } from "react-i18next";
import { fmtFecha, type Actividad } from "../db";
import { parseRecurrencia } from "../services/agenda/recurrencia";
import { IconCheck, IconChevronLeft, IconClock, IconEdit } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import SeccionIOS from "./ios/SeccionIOS";

interface Props {
  actividad: Actividad;
  responsableNombre: string | null;
  esRecurrente?: boolean;
  onClose: () => void;
  onEditar: () => void;
  onDuplicar: () => void;
  onEliminar: () => void;
  onEstado: (nuevoEstado: string) => void;
  onRegistrarServicio?: () => void;
}

/** Fila de dato. Devuelve null si no hay valor: «los campos vacíos no se
 *  pintan», que es lo que separa una ficha de un formulario en blanco. */
function Dato({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="ios-txrow">
      <div className="ios-txrow-main"><div className="ios-txrow-title">{label}</div></div>
      <div className="ios-txrow-trailing"><span className="ios-fila-valor">{value}</span></div>
    </div>
  );
}

/** Una acción de estado, como fila de lista. */
function Accion({ icono, label, onClick, destructiva }: {
  icono?: React.ReactNode; label: string; onClick: () => void; destructiva?: boolean;
}) {
  return (
    <button type="button" className="ios-txrow ios-txrow--clickable" onClick={onClick}>
      <div className="ios-txrow-main">
        <div className={`ios-txrow-title ${destructiva ? "es-destructiva" : "es-accion"}`}>
          {icono}{label}
        </div>
      </div>
    </button>
  );
}

/**
 * El detalle de una actividad, como PANTALLA del teléfono (maqueta A5).
 *
 * «El modal del iPad hecho pantalla.» Hasta ahora el iPhone abría
 * `ActividadDetalle` tal cual: una `.modal-card` de 520 px de ancho, con su
 * cabecera de título y ✕, sus filas clave-valor de escritorio, sus acciones
 * como botones-píldora envueltos en tres renglones desparejos, y un pie fijo
 * con Eliminar · Cerrar · Editar. En 393 px eso no es una pantalla de iOS: es
 * una ventana de Mac encogida.
 *
 * Estructura y contenido son los del artboard; el VOCABULARIO es el de la v2,
 * que es posterior. El artboard dibuja el título en negro sobre gris y las
 * tarjetas con radio 18 —así era el rediseño antes de la cabecera de marca—;
 * aquí el título va en blanco sobre la banda verde y las listas llevan el
 * radio 10 y el hairline de 0.33 del resto de la app. Seguir el artboard al
 * pie en eso habría dejado la única pantalla del teléfono sin banda.
 *
 * No es una ruta: se abre desde la Agenda, encima de ella, y se cierra
 * volviendo. Por eso pinta su propia banda —la fija de la app queda debajo— y
 * por eso el «volver» dice «Agenda» y no es el `.ios-nav-volver` de las
 * pantallas que sí son rutas.
 */
export default function ActividadDetalleIOS({
  actividad: a, responsableNombre, esRecurrente, onClose, onEditar, onDuplicar, onEliminar, onEstado, onRegistrarServicio,
}: Props) {
  const { t } = useTranslation();
  useEscapeClose(onClose);

  const tipoLabel = a.tipo === "otra" && a.tipo_personalizado ? a.tipo_personalizado : t(`agenda.tipos.${a.tipo}`);
  const horario = a.dia_completo
    ? t("agenda.diaCompletoCorto")
    : a.hora_inicio
      ? `${a.hora_inicio}${a.hora_fin ? ` – ${a.hora_fin}` : ""}`
      : null;

  /* La fecha larga de la maqueta: «Miércoles 26 ago 2026». `fmtFecha` ya
     devuelve el nombre del día y el mes en el idioma activo. */
  const f = fmtFecha(a.fecha);
  const fechaLarga = `${f.nombreDia} ${f.dia} ${f.mesAnio.toLowerCase()}`;

  /* La regla de repetición, en palabras. Sale del mismo JSON que expande la
     serie, así que no puede decir una cosa distinta de la que se pinta en el
     calendario. Solo el tipo —«Semanal», «Mensual»—: los días concretos ya
     los dice la fila de la fecha. */
  const rec = parseRecurrencia(a.recurrencia);
  const repite = rec.tipo === "ninguna" ? null : t(`agenda.rec.${rec.tipo}`);

  return (
    <div className="pantalla-ios" role="dialog" aria-modal="true" aria-label={a.nombre}>
      <div className="pi-banda">
        <div className="pi-nav">
          <button type="button" className="pi-volver" onClick={onClose}>
            <IconChevronLeft size={17} strokeWidth={2.4} /> {t("nav.agendaCorto")}
          </button>
        </div>
        <h1 className="pi-titulo">{a.nombre}</h1>
        {/* Las pastillas: qué es, en qué estado está y si es de una serie. Van
            en la banda y no en el cuerpo porque describen al título, no a los
            datos — y ahí arriba se leen antes de desplazar. */}
        <div className="pi-pastillas">
          <span className={`pi-pastilla es-${a.estado}`}>{t(`agenda.estados.${a.estado}`)}</span>
          <span className="pi-pastilla">{tipoLabel}</span>
          {esRecurrente && <span className="pi-pastilla">{t("agenda.recurrenteBadge")}</span>}
          {a.es_fecha_importante === 1 && <span className="pi-pastilla">{t("agenda.fechaImportanteBadge")}</span>}
        </div>
      </div>

      <div className="pi-cuerpo">
        <SeccionIOS compacta pie={t("agenda.detallePie")}>
          <Dato label={t("agenda.colFecha")} value={fechaLarga} />
          <Dato label={t("agenda.horario")} value={horario} />
          <Dato label={t("agenda.lugar")} value={a.lugar} />
          <Dato label={t("agenda.responsable")} value={responsableNombre} />
          <Dato label={t("agenda.ministerio")} value={a.responsable_ministerio} />
          <Dato label={t("agenda.invitado")} value={a.invitado} />
          <Dato label={t("agenda.contacto")} value={a.contacto} />
          <Dato label={t("agenda.repeticion")} value={repite} />
        </SeccionIOS>

        {/* La descripción no cabe en una fila de dos columnas: puede ser un
            párrafo. Va en su propio grupo, con el texto a lo ancho. */}
        {a.descripcion && (
          <SeccionIOS titulo={t("agenda.descripcion")}>
            <div className="ios-txrow pi-parrafo">{a.descripcion}</div>
          </SeccionIOS>
        )}

        <SeccionIOS titulo={t("agenda.acciones")} compacta>
          {a.estado !== "confirmada" && a.estado !== "cancelada" && (
            <Accion icono={<IconCheck size={15} />} label={t("agenda.accConfirmar")} onClick={() => onEstado("confirmada")} />
          )}
          {a.estado !== "completada" && (
            <Accion icono={<IconCheck size={15} />} label={t("agenda.accCompletar")} onClick={() => onEstado("completada")} />
          )}
          {/* La que amarra la Agenda con Secretaría: abre la Bitácora con la
              fecha y el tipo ya puestos. */}
          {onRegistrarServicio && (
            <Accion icono={<IconEdit size={15} />} label={t("agenda.accRegistrarServicio")} onClick={onRegistrarServicio} />
          )}
          <Accion label={t("agenda.accDuplicar")} onClick={onDuplicar} />
          {a.estado !== "cancelada" && (
            <Accion icono={<IconClock size={15} />} label={t("agenda.accCancelar")} onClick={() => onEstado("cancelada")} destructiva />
          )}
        </SeccionIOS>
      </div>

      {/* Las dos que no son «cambiar el estado de esto», sino «acabar con
          esto» o «rehacerlo». Van fijas abajo, como en la maqueta: si vivieran
          en la lista de acciones, «Eliminar» quedaría a un dedo de
          «Duplicar». */}
      <div className="pi-pie">
        <button type="button" className="pi-eliminar" onClick={onEliminar}>{t("common.eliminar")}</button>
        <button type="button" className="pi-editar" onClick={onEditar}>{t("common.editar")}</button>
      </div>
    </div>
  );
}
