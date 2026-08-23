import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  catNombre, categoriaInfo, currentYear, fmtFechaCorta, fmtMoney, listAsistenciaLigera,
  metodoNombre, METODOS_PAGO, type AsistenciaLigera, type Church, type Member, type Tx,
} from "../db";
import type { Centavos } from "../dinero";

/**
 * El cuerpo de la ficha de Aportantes en el iPad, como lo dibuja el handoff:
 * un segmentado de cuatro pestañas a la izquierda y, fija a la derecha, la
 * columna del dinero — porque esta pantalla es la de TESORERÍA y el aporte es
 * lo que se viene a ver.
 *
 * Las cuatro pestañas del diseño y de dónde sale cada una:
 *
 *   · **Datos** — `members`: teléfono, correo y el expediente de membresía
 *     (ingreso, bautismo, ministerios, cargos). Real.
 *   · **Aportes** — `listMemberAportes`, la tabla del año. Real; es la que ya
 *     enseñaba el modal de Mac, traída aquí dentro.
 *   · **Asistencia** — `listAsistenciaLigera`. Real.
 *   · **Familia** — **no hay datos**. `members` no guarda parentesco: no hay
 *     tabla de relaciones ni columna de familia. La pestaña se construye igual
 *     y dice qué le falta, en vez de desaparecer: una sección sin datos
 *     todavía no es lo mismo que una que no aplica.
 *
 * Y tres campos del diseño —nacimiento, dirección y estado civil— **se pintan
 * sin motor**, por decisión de Iván (23 ago): primero la plantilla, el dato
 * después. `members` no tiene esas columnas; la fila sale con su etiqueta y
 * dice que todavía no se captura, para que se vea el hueco que va a llenarse
 * y no parezca que el campo no existe. Mismo trato que la pestaña Familia.
 * Cuando lleguen las columnas, solo cambia de qué se lee.
 * Ver docs/ipad-rediseno.md §16.
 */

export type PestanaFicha = "datos" | "aportes" | "familia" | "asistencia";

interface Props {
  church: Church;
  member: Member;
  /** Los aportes del año elegido, ya cargados por `useFichaMiembro`. */
  aportes: Tx[];
  total: Centavos;
  year: string;
  years: string[];
  onYear: (y: string) => void;
}

/** El JSON de una columna de arreglo, sin reventar si viene mal. */
function lista(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Traduce las claves de un catálogo ABIERTO y las junta con " · ".
 *
 * Ministerios, cargos y etiquetas admiten escribir uno a mano además de los
 * del catálogo, y esos no tienen clave. i18next devuelve la clave tal cual
 * cuando no la encuentra, así que sin la vuelta atrás la ficha diría
 * "ficha.ministerio.Damas". Es la misma cautela que ya tiene `ministeriosDe`
 * en Membresía; aquí sirve para los tres campos.
 */
function catalogoAbierto(t: (k: string) => string, prefijo: string, valores: string[]): string {
  return valores
    .map((x) => {
      const clave = `${prefijo}.${x}`;
      const texto = t(clave);
      return texto === clave ? x : texto;
    })
    .join(" · ");
}

const MESES_CORTOS = 12;

export default function FichaMiembroIPad({ church, member, aportes, total, year, years, onYear }: Props) {
  const { t, i18n } = useTranslation();
  const [pestana, setPestana] = useState<PestanaFicha>("datos");
  const [asis, setAsis] = useState<AsistenciaLigera[]>([]);

  /* La asistencia solo se pide cuando se abre su pestaña: es una consulta que
     recorre TODOS los servicios de la iglesia y filtra después, y en una ficha
     que se abre para ver un aporte no tiene por qué pagarse. */
  useEffect(() => {
    if (pestana !== "asistencia") return;
    listAsistenciaLigera(church.id, `${year}-01-01`, `${year}-12-31`)
      .then((filas) => setAsis(filas.filter((f) => f.member_id === member.id)))
      .catch(console.error);
  }, [pestana, church.id, member.id, year]);

  /* Las barras del año: un aporte cae en el mes de su fecha. La escala es el
     mes más alto, no el total, para que la forma se vea aunque la iglesia sea
     pequeña. El mes en curso va en tono lleno, como en el diseño. */
  const barras = useMemo(() => {
    const porMes = new Array<number>(MESES_CORTOS).fill(0);
    for (const a of aportes) {
      const m = Number(a.fecha.slice(5, 7)) - 1;
      if (m >= 0 && m < MESES_CORTOS) porMes[m] += a.monto;
    }
    // Solo hasta el mes en curso si es el año en curso; el resto del año no
    // son ceros, es futuro, y dibujarlo deja media gráfica en blanco.
    const hasta = year === currentYear() ? new Date().getMonth() + 1 : MESES_CORTOS;
    const usados = porMes.slice(0, hasta);
    const tope = Math.max(...usados, 0);
    const conMonto = usados.filter((v) => v > 0).length;
    return {
      meses: usados.map((v, i) => ({
        mes: i,
        monto: v as Centavos,
        pct: tope > 0 && v > 0 ? Math.max(6, Math.round((v / tope) * 100)) : 0,
        actual: i === hasta - 1,
      })),
      /* El promedio se saca sobre los meses CON aporte y no sobre los
         transcurridos: quien diezma cada dos meses no aporta "la mitad", y
         dividir entre los meses vacíos convertiría su ficha en un reproche. */
      promedio: (conMonto > 0 ? Math.round(total / conMonto) : 0) as Centavos,
      conMonto,
    };
  }, [aportes, total, year]);

  const nombreMes = (i: number) =>
    new Date(2000, i, 1).toLocaleDateString(i18n.language.startsWith("en") ? "en-US" : "es-ES", { month: "short" })
      .replace(".", "");

  const ministerios = lista(member.ministerios);
  const cargos = lista(member.cargos);
  const etiquetas = lista(member.etiquetas);

  /** Una fila etiqueta·valor; sin valor no se pinta. */
  const fila = (etiqueta: string, valor: string | null | undefined) =>
    valor ? (
      <div className="dm-campo" key={etiqueta}>
        <span className="dm-campo-etiqueta">{etiqueta}</span>
        <span className="dm-campo-valor">{valor}</span>
      </div>
    ) : null;

  /**
   * Una fila del diseño que TODAVÍA no tiene columna detrás.
   *
   * No es lo mismo que `fila()` con el valor vacío: aquella se esconde porque
   * el campo existe y esta ficha no lo trae; esta se enseña porque el campo va
   * a existir y el hueco es la información. Se distingue a la vista (valor en
   * gris claro, en cursiva) para que nadie la confunda con un dato borrado, y
   * lleva `title` explicando por qué.
   */
  const filaSinMotor = (etiqueta: string) => (
    <div className="dm-campo dm-campo--sinmotor" key={etiqueta} title={t("detalleMiembro.sinCapturarAyuda")}>
      <span className="dm-campo-etiqueta">{etiqueta}</span>
      <span className="dm-campo-valor">{t("detalleMiembro.sinCapturar")}</span>
    </div>
  );

  const PESTANAS: PestanaFicha[] = ["datos", "aportes", "familia", "asistencia"];

  /* Los últimos tres aportes, que en el diseño van bajo la tarjeta del año.
     `listMemberAportes` ya devuelve por fecha descendente. */
  const ultimos = aportes.slice(0, 3);

  return (
    <>
      <div className="fm-seg" role="tablist" aria-label={t("detalleMiembro.seccionesAria")}>
        {PESTANAS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pestana === p}
            className={pestana === p ? "sel" : ""}
            onClick={() => setPestana(p)}
          >
            {t(`detalleMiembro.pestana_${p}`)}
          </button>
        ))}
      </div>

      <div className="fm-cuerpo">
        <div className="fm-izq">
          {pestana === "datos" && (
            <div className="dm-ficha">
              {fila(t("detalleMiembro.telefono"), member.telefono)}
              {fila(t("detalleMiembro.correo"), member.email)}
              {/* Los tres del diseño que esperan columna. Van aquí, entre el
                  correo y el expediente, que es su sitio en el handoff. */}
              {filaSinMotor(t("detalleMiembro.nacimiento"))}
              {filaSinMotor(t("detalleMiembro.direccion"))}
              {filaSinMotor(t("detalleMiembro.estadoCivil"))}
              {fila(t("detalleMiembro.idFiscal"), member.rfc)}
              {fila(t("detalleMiembro.desde"), member.fecha_ingreso ? fmtFechaCorta(member.fecha_ingreso) : null)}
              {fila(t("detalleMiembro.congregaDesde"), member.fecha_congregacion ? fmtFechaCorta(member.fecha_congregacion) : null)}
              {fila(t("detalleMiembro.bautismo"), member.bautizado_agua
                ? member.fecha_bautismo_agua ? fmtFechaCorta(member.fecha_bautismo_agua) : t("common.si")
                : null)}
              {fila(t("detalleMiembro.ministerios"), catalogoAbierto(t, "ficha.ministerio", ministerios) || null)}
              {fila(t("detalleMiembro.cargos"), catalogoAbierto(t, "ficha.cargo", cargos) || null)}
              {fila(t("detalleMiembro.etiquetas"), catalogoAbierto(t, "etiqueta", etiquetas) || null)}
              {fila(t("recordModal.notas"), member.notas)}
            </div>
          )}

          {pestana === "aportes" && (
            aportes.length === 0 ? (
              <div className="fm-vacio">{t("detalleMiembro.sinAportes", { anio: year })}</div>
            ) : (
              <div className="dm-ficha">
                {aportes.map((a) => {
                  const cat = categoriaInfo("ingreso", a.categoria);
                  const metodo = METODOS_PAGO.some((m) => m.id === a.metodo_pago)
                    ? metodoNombre(a.metodo_pago)
                    : a.metodo_pago;
                  return (
                    <div className="dm-campo fm-aporte" key={a.id}>
                      <span className="dm-campo-etiqueta">{fmtFechaCorta(a.fecha)}</span>
                      <span className="dm-campo-valor">
                        {catNombre(cat.id)}
                        <span className="fm-aporte-metodo"> · {metodo}</span>
                      </span>
                      <span className="fm-aporte-monto">{fmtMoney(a.monto)}</span>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {pestana === "familia" && (
            /* La pestaña que el handoff pide y la base no puede llenar. Se
               construye igual, con su explicación: quien la abre tiene que
               saber que no está vacía por error. */
            <div className="fm-vacio fm-vacio--pendiente">
              <span className="fm-vacio-titulo">{t("detalleMiembro.familiaTitulo")}</span>
              <span className="fm-vacio-sub">{t("detalleMiembro.familiaSub")}</span>
            </div>
          )}

          {pestana === "asistencia" && (
            asis.length === 0 ? (
              <div className="fm-vacio">{t("detalleMiembro.sinAsistencia", { anio: year })}</div>
            ) : (
              <div className="dm-ficha">
                {(() => {
                  const presentes = asis.filter((a) => a.presente === 1).length;
                  const pct = Math.round((presentes / asis.length) * 100);
                  return (
                    <>
                      {fila(t("detalleMiembro.serviciosRegistrados"), String(asis.length))}
                      {fila(t("detalleMiembro.presencias"), `${presentes} · ${pct}%`)}
                      {fila(t("detalleMiembro.ultimaVisita"), (() => {
                        const u = asis.find((a) => a.presente === 1);
                        return u ? fmtFechaCorta(u.fecha) : null;
                      })())}
                    </>
                  );
                })()}
              </div>
            )
          )}
        </div>

        {/* La columna del dinero, fija: es Aportantes, y el aporte del año es
            la razón de abrir esta ficha. No cambia con la pestaña. */}
        <div className="fm-der">
          <div className="fm-tarjeta">
            <div className="fm-tarjeta-cab">
              <span className="dm-tarjeta-titulo">{t("detalleMiembro.totalAnio", { anio: year })}</span>
              <span className="fm-total">{fmtMoney(total)}</span>
            </div>
            {barras.conMonto > 0 ? (
              <>
                <div className="fm-barras">
                  {barras.meses.map((m) => (
                    <div
                      key={m.mes}
                      className={`fm-barra${m.actual ? " actual" : ""}`}
                      style={{ height: `${m.pct}%` }}
                      title={`${nombreMes(m.mes)} · ${fmtMoney(m.monto)} ${church.moneda}`}
                      aria-label={`${nombreMes(m.mes)} · ${fmtMoney(m.monto)} ${church.moneda}`}
                    />
                  ))}
                </div>
                <span className="fm-tarjeta-pie">
                  {t("detalleMiembro.promedioMes", { monto: fmtMoney(barras.promedio), count: barras.conMonto })}
                </span>
              </>
            ) : (
              <span className="fm-tarjeta-pie">{t("detalleMiembro.sinAportes", { anio: year })}</span>
            )}
            {years.length > 1 && (
              <div className="fm-anios">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    className={`chip${y === year ? " active" : ""}`}
                    onClick={() => onYear(y)}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>

          {ultimos.length > 0 && (
            <div className="dm-ficha">
              {ultimos.map((a) => (
                <div className="dm-campo fm-ultimo" key={a.id}>
                  <span className="dm-campo-valor truncate">
                    {catNombre(a.categoria)} · {fmtFechaCorta(a.fecha)}
                  </span>
                  <span className="fm-aporte-monto">{fmtMoney(a.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
