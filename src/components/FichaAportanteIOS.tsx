/**
 * FichaAportanteIOS.tsx — la ficha de un aportante en el teléfono
 * (maquetas T9, T10 y T11).
 *
 * Hasta ahora el iPhone abría `MemberDetailModal`, que es un modal de 720 px
 * de escritorio: tres tarjetas de estadística en fila, una tabla de cinco
 * columnas y un pie de tres botones. En 393 px eso se apila en una torre y la
 * tabla se lee de lado.
 *
 * Lo que cambia, y por qué:
 *
 * - **De cinco columnas a tres datos por fila.** Categoría como pastilla, día
 *   e importe en el primer renglón; concepto y método bajan al segundo, que es
 *   donde se leen solo si hacen falta.
 * - **Agrupado por mes con subtotal**, igual que Ingresos: quien abre esto
 *   busca «lo de agosto», no la fila 34.
 * - **El año sale de las cifras y sube a la barra.** Es un control, no un
 *   dato: arriba se lee como filtro de todo lo de abajo. Y con él se va la
 *   tercera tarjeta de estadística, que era su envoltorio.
 * - **El pie de tres botones se queda en uno.** En iOS «Imprimir» y «Enviar»
 *   son la misma hoja de compartir que ya abre la constancia
 *   (`openForPrint` → `entregarArchivo` en móvil), así que tres botones
 *   disparaban tres veces lo mismo. Queda «Constancia anual», al final de la
 *   lista, donde termina el año. Y «Cerrar» desaparece: «‹ Aportantes» ya lo
 *   hace.
 *
 * No es una pantalla flotante: es la MISMA página un nivel más adentro —banda
 * verde, título grande, barra de pestañas abajo—, el patrón del documento
 * abierto de Informes y del detalle del periodo de Inicio. Por eso se lleva la
 * cabecera entera y no solo el cuerpo.
 *
 * El ESTADO no es nuevo: es `useFichaMiembro`, el mismo hook que alimentan el
 * modal del Mac y el panel del iPad. Una fuente de datos, tres maneras de
 * enseñarla.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  catNombre, categoriaInfo, fmtFechaCorta, fmtMoney, metodoNombre, METODOS_PAGO,
  type Church, type Member, type Tx,
} from "../db";
import { sumar } from "../dinero";
import { iniciales } from "../services/avatar";
import { useFichaMiembro } from "./MemberDetailModal";
import SeccionIOS, { IosChevron } from "./ios/SeccionIOS";
import { agruparPorMes } from "./ios/agrupado";
import IOSPickerSheet from "./ios/IOSPickerSheet";
import { IconChevronLeft, IconWarn } from "../icons";

/** «28 jun» — la fecha corta sin el año.
 *
 *  El año ya lo dicen el selector de la barra y el encabezado del mes, y
 *  repetirlo en cada una de las catorce filas es ruido. Se quita del texto ya
 *  formateado en vez de armar otro formateador: así sigue saliendo de
 *  `fmtFechaCorta`, que es quien sabe el idioma («28 jun 2026» / «Jun 28,
 *  2026»), y la coma del inglés se va con el año. */
function diaCorto(fecha: string): string {
  return fmtFechaCorta(fecha).replace(/,?\s*\d{4}$/, "");
}

interface Props {
  church: Church;
  member: Member;
  /** Nombre de la lista de la que se viene ("Aportantes"), junto al galón. */
  tituloLista: string;
  onVolver: () => void;
  /** Abre el alta de un ingreso con esta persona ya puesta. Sin permiso para
   *  crear no se pasa, y la fila no se pinta. */
  onNuevoAporte?: () => void;
}

export default function FichaAportanteIOS({ church, member, tituloLista, onVolver, onNuevoAporte }: Props) {
  const { t } = useTranslation();
  const f = useFichaMiembro(church, member);
  const [hojaAnios, setHojaAnios] = useState(false);
  const { aportes, year, anios } = f;

  const meses = agruparPorMes(aportes, (a) => a.fecha);

  /* El ejercicio con movimientos más reciente que NO es el que se está
     mirando. Es lo que casi siempre explica un cero: la persona aportó, pero
     en otro año. Sale de los mismos datos que alimentan el selector, no es un
     dato nuevo. */
  const otroAnio = anios.find((a) => a.anio !== year);

  let etiquetas: string[] = [];
  try { etiquetas = JSON.parse(member.etiquetas); } catch { /* noop */ }

  const fila = (a: Tx) => {
    const cat = categoriaInfo("ingreso", a.categoria);
    const metodo = METODOS_PAGO.some((m) => m.id === a.metodo_pago)
      ? metodoNombre(a.metodo_pago)
      : a.metodo_pago;
    /* Concepto y método en el segundo renglón, separados por el punto medio
       que ya usa el resto de la app. Sin concepto queda el método solo: nunca
       un renglón vacío ni un punto suelto. */
    /* …y el concepto se cae cuando REPITE la categoría, que es el caso más
       común de todos: un diezmo se captura con el concepto «Diezmo». La
       pastilla ya lo dice, y «Diezmo · Diezmo · Efectivo» es ruido. */
    const nombreCat = catNombre(a.categoria);
    const concepto = a.concepto.trim().toLowerCase() === nombreCat.toLowerCase() ? "" : a.concepto;
    const segunda = [concepto, metodo].filter(Boolean).join(" · ");
    return (
      <div className="ios-txrow fa-fila" key={a.id}>
        <div className="ios-txrow-main">
          <div className="fa-linea1">
            {/* Aquí la pastilla SÍ cabe, y en Ingresos no: allí el primer
                renglón es el concepto entero y el chip se comía media fila
                (por eso allí la categoría es un punto de color). Aquí el
                primer renglón es un día —«28 jun»— y sobra sitio. */}
            <span className={`tag ${cat.tagClass} fa-cat`}>{nombreCat}</span>
            <span className="fa-dia">{diaCorto(a.fecha)}</span>
          </div>
          <div className="tx-secundaria-movil" title={segunda}>{segunda}</div>
        </div>
        <div className="ios-txrow-trailing">
          {/* Sin «+» y en el color del texto: aquí TODO es ingreso, así que un
              signo que nunca cambia no informa de nada. */}
          <span className="tx-amount">{fmtMoney(a.monto)}</span>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* `fa-header` es el gancho para que la cáscara sepa que esta pantalla
          es un NIVEL MÁS ADENTRO: el carrusel de secciones de Tesorería y el
          «+» de «nuevo aportante» son controles de la lista, no de la ficha de
          una persona, y aquí estorban. Ver el bloque 35 de styles.css. */}
      <div className="header fa-header">
        <div>
          <button type="button" className="ios-nav-volver" onClick={onVolver}>
            <IconChevronLeft size={17} strokeWidth={2.4} /> {tituloLista}
          </button>
          {/* Avatar y nombre en el mismo renglón: el avatar es de quién es la
              ficha, no un adorno del título, y debajo no tendría a qué
              pertenecer. `data-titulo-fijo` es lo que la barra compacta lee al
              plegarse (maqueta T10) — el mecanismo ya existe, ver App.tsx. */}
          <div className="fa-identidad">
            <span className="fa-avatar" aria-hidden="true">{iniciales(member.nombre, member.email)}</span>
            <div className="page-title" data-titulo-fijo={member.nombre}>{member.nombre}</div>
          </div>
          {/* Los datos de contacto como pastillas dentro de la banda: son
              identidad —«¿es este el Julio Tovar que busco?»— y no ajustes,
              así que viajan con el nombre y no en un grupo de la lista. */}
          <div className="fa-chips">
            <span className="fa-chip fa-chip--estado">
              {member.activo === 1 ? t("detalleMiembro.activo") : t("detalleMiembro.inactivo")}
            </span>
            {member.telefono && <span className="fa-chip">{member.telefono}</span>}
            {member.rfc && <span className="fa-chip">{member.rfc}</span>}
            {etiquetas.map((et) => (
              <span className="fa-chip" key={et}>{t(`etiqueta.${et}`, { defaultValue: et })}</span>
            ))}
          </div>
        </div>
        {/* El año, en la barra fija. `.ios-nav-btn` es la acción de texto que
            ya usan «Aprobar todo» y los filtros de Membresía: misma ranura,
            mismo material, y dentro de la banda ya sale en blanco. */}
        <button type="button" className="ios-nav-btn" onClick={() => setHojaAnios(true)}>
          {year}
        </button>
      </div>

      <div className="content content-lienzo">
        {/* Dos cifras, no tres: el total del año grande a la izquierda; el
            conteo y el último aporte, pequeños, a la derecha. */}
        <div className="fa-cifras">
          <span className="fa-cifras-izq">
            <span className="fa-cifras-etiqueta">{t("detalleMiembro.totalAnio", { anio: year })}</span>
            <span className={`fa-total${aportes.length === 0 ? " es-cero" : ""}`}>{fmtMoney(f.total)}</span>
          </span>
          <span className="fa-cifras-der">
            {aportes.length > 0 ? (
              <>
                <span className="fa-cifras-dato">{t("detalleMiembro.aportes", { count: aportes.length })}</span>
                <span className="fa-cifras-etiqueta">
                  {t("fichaAportante.ultimo", { fecha: f.ultimo ? diaCorto(f.ultimo) : "—" })}
                </span>
              </>
            ) : (
              <span className="fa-cifras-etiqueta">{t("fichaAportante.sinAportaciones")}</span>
            )}
          </span>
        </div>

        {aportes.length === 0 ? (
          /* El vacío deja de ser un icono gris en medio de la nada y pasa a
             ser una tarjeta con salidas: registrar la primera —con esta
             persona ya puesta— y saltar al último año con movimientos, que es
             lo que casi siempre explica el cero. */
          <section className="ios-section">
            <div className="ios-listcard">
              <div className="fa-vacio">
                <span className="fa-vacio-titulo">{t("fichaAportante.vacioTitulo", { anio: year })}</span>
                {onNuevoAporte && (
                  <span className="fa-vacio-texto">{t("fichaAportante.vacioTexto", { nombre: member.nombre })}</span>
                )}
              </div>
              {onNuevoAporte && (
                <button type="button" className="ios-txrow fa-accion" onClick={onNuevoAporte}>
                  <div className="ios-txrow-main">
                    <div className="ios-txrow-title fa-accion-texto es-fuerte">{t("fichaAportante.registrar")}</div>
                  </div>
                  <div className="ios-txrow-trailing"><IosChevron /></div>
                </button>
              )}
              {otroAnio && (
                <button type="button" className="ios-txrow fa-accion" onClick={() => f.setYear(otroAnio.anio)}>
                  <div className="ios-txrow-main">
                    <div className="ios-txrow-title fa-accion-texto">{t("fichaAportante.verAnio", { anio: otroAnio.anio })}</div>
                  </div>
                  <div className="ios-txrow-trailing">
                    <span className="ios-fila-valor">{fmtMoney(otroAnio.total)}</span>
                    <IosChevron />
                  </div>
                </button>
              )}
            </div>
            {otroAnio && <p className="ios-section-footer">{t("fichaAportante.pieOtroAnio")}</p>}
          </section>
        ) : (
          meses.map((mes) => (
            <SeccionIOS
              key={mes.clave}
              titulo={mes.etiqueta}
              total={fmtMoney(sumar(...mes.items.map((a) => a.monto)))}
            >
              {mes.items.map(fila)}
            </SeccionIOS>
          ))
        )}

        {/* La constancia, al final del año. Apagada cuando no hay nada que
            certificar: quitarla dejaría la pregunta «¿y la constancia?» sin
            respuesta; apagada, la respuesta está a la vista. */}
        <section className="ios-section">
          <div className="ios-listcard">
            <button
              type="button"
              className="ios-txrow fa-accion"
              onClick={f.handleConstancia}
              disabled={f.exporting !== null || aportes.length === 0}
            >
              <div className="ios-txrow-main">
                <div className="ios-txrow-title fa-accion-texto">
                  {f.exporting === "pdf" ? t("common.generando") : t("fichaAportante.constanciaAnio", { anio: year })}
                </div>
              </div>
              {aportes.length > 0 && <div className="ios-txrow-trailing"><IosChevron /></div>}
            </button>
          </div>
          <p className="ios-section-footer">
            {aportes.length === 0 ? t("fichaAportante.pieSinConstancia") : t("fichaAportante.pieConstancia")}
          </p>
        </section>

        {f.error && (
          <p className="ios-section-footer ios-pie-aviso"><IconWarn size={13} /> {f.error}</p>
        )}
      </div>

      {hojaAnios && (
        <IOSPickerSheet
          title={t("fichaAportante.ejercicios")}
          value={year}
          options={f.years.map((y) => {
            const dato = anios.find((a) => a.anio === y);
            return {
              value: y,
              label: y,
              detalle: dato ? fmtMoney(dato.total) : t("fichaAportante.sinAportaciones"),
            };
          })}
          onSelect={(y) => { f.setYear(y); setHojaAnios(false); }}
          onCancel={() => setHojaAnios(false)}
        />
      )}
    </>
  );
}
