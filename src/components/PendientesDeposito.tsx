/**
 * PendientesDeposito.tsx — la columna derecha de Depósitos › **Pendientes**:
 * la revisión del dinero en caja ANTES de llevarlo al banco.
 *
 * El handoff 3 (24 ago 2026) convierte esta pestaña —que hasta la 1.2.8 era
 * un bloque explicando que le faltaba motor— en una pantalla de trabajo: tres
 * cifras vivas, un bloque de avisos, la lista de lo que hay en caja con su
 * palomita, y a la derecha la ficha de cómo va a quedar registrado.
 *
 * **Qué es real y qué no**, porque aquí es donde el diseño y el esquema no
 * dicen lo mismo:
 *
 *  - **Los movimientos son reales.** Salen de `transactions`: ingresos
 *    aprobados cobrados en efectivo o en cheque. El agrupado por día —lo que
 *    el diseño llama "un corte"— también es real: es la fecha del movimiento.
 *  - **Las tres cifras son reales** y se recalculan con las palomitas, igual
 *    que en el prototipo: efectivo, cheques y total salen de la MISMA
 *    selección, así que marcar o desmarcar no las puede descuadrar.
 *  - **El efectivo estimado en caja es real**: `efectivoDisponibleHasta`, la
 *    misma cuenta que el Inicio usa para su "Saldo en caja" (apertura +
 *    aprobados − ya depositado).
 *  - **Los movimientos marcados por revisar son reales**: `countPendingTx`,
 *    los mismos que enseña Por revisar.
 *  - **Lo que NO existe es el vínculo depósito↔movimiento.** `transactions`
 *    no guarda si un movimiento ya fue al banco, y `depositos_bancarios` no
 *    guarda qué movimientos lo componen. Por eso la selección **no se
 *    guarda** y por eso la lista no puede esconder lo ya depositado: eso se
 *    dice en su propio aviso, con todas las letras, en vez de dejar que se
 *    suponga. La cifra agregada de caja sí descuenta los depósitos
 *    registrados; el detalle movimiento a movimiento, no.
 *
 * "Marcar depositado" **sí tiene motor**: abre el formulario de depósito con
 * el total, la cuenta y el periodo del corte ya puestos. Era la única forma
 * de que las dos cifras —lo que revisaste y lo que registras— no dependan de
 * volver a teclearlas.
 */
import { useTranslation } from "react-i18next";
import { fmtFechaCorta, fmtMoney, mesLegible, metodoAbr, type Church, type Corte, type Tx } from "../db";
import { sumar, type Centavos } from "../dinero";
import { IconChevronLeft, IconPlus } from "../icons";

/** Un día con dinero que TODAVÍA está en la caja: los movimientos de esa
 *  fecha que no han entrado en ningún corte. No confundir con `Corte`, que es
 *  la fila de la base — el dinero que ya salió de la caja. */
export interface DiaEnCaja {
  /** El día del que es el dinero, "YYYY-MM-DD". Es su identidad. */
  fecha: string;
  /** Título ya formateado ("Corte del 23 ago"). */
  titulo: string;
  movs: Tx[];
}

interface Props {
  church: Church;
  dia: DiaEnCaja;
  /** Si lo que se está mirando es un corte YA ENTREGADO, su fila. Cambia lo
   *  que se puede hacer: su composición es fija —el dinero ya salió de la
   *  caja— y lo que queda es cerrarlo contra el depósito o deshacerlo. */
  entregado?: Corte | null;
  /** Ids de los movimientos marcados. Vive en la página, no aquí: el modal de
   *  depósito lo necesita para prellenarse. */
  sel: Set<number>;
  onToggle: (id: number) => void;
  /** Cuántos movimientos están marcados por revisar en toda la iglesia. */
  porRevisar: number;
  /** Efectivo estimado en caja hasta hoy. */
  efectivoEnCaja: Centavos;
  /** Cuántos depósitos hay registrados sin corte detrás. Mientras haya
   *  alguno, parte del dinero de la lista puede estar ya en el banco. */
  depSinCorte: number;
  /** La cuenta que se va a proponer: la del último depósito. */
  cuenta: string;
  /** Fecha y periodo con los que se registraría, ya formateados. */
  fechaRegistro: string;
  periodo: string;
  tituloLista: string;
  onVolver: () => void;
  onIrPorRevisar: () => void;
  onNuevoCorte: () => void;
  onMarcarDepositado: () => void;
  /** Solo para un corte entregado: devolver su dinero a la caja. */
  onDeshacer?: () => void;
  /** Abrir la hoja de la segunda firma (migración 47). Solo en un corte
   *  entregado: mientras el dinero sigue en la caja no hay corte que firmar. */
  onSegundaFirma?: () => void;
  /** Deshacer una segunda firma dada por error. */
  onQuitarFirma?: () => void;
}

/** Suma de los movimientos marcados que cumplen el filtro. */
function suma(movs: Tx[], sel: Set<number>, filtro: (t: Tx) => boolean): Centavos {
  return sumar(...movs.filter((m) => sel.has(m.id) && filtro(m)).map((m) => m.monto));
}

const esCheque = (t: Tx) => t.metodo_pago === "cheque";

export default function PendientesDeposito({
  church, dia, entregado, sel, onToggle, porRevisar, efectivoEnCaja, depSinCorte, cuenta,
  fechaRegistro, periodo, tituloLista, onVolver, onIrPorRevisar, onNuevoCorte, onMarcarDepositado,
  onDeshacer, onSegundaFirma, onQuitarFirma,
}: Props) {
  const { t } = useTranslation();
  const movs = dia.movs;

  const efectivo = suma(movs, sel, (m) => !esCheque(m));
  const cheques = suma(movs, sel, esCheque);
  const total = sumar(efectivo, cheques);
  const nCheques = movs.filter((m) => sel.has(m.id) && esCheque(m)).length;
  const nSel = movs.filter((m) => sel.has(m.id)).length;

  /* El aviso que compara lo que vas a sacar de caja con lo que la app cree
     que hay. No bloquea nada —es la misma cortesía que el aviso de
     `excedeEfectivo` al guardar—, pero se lee antes de ir al banco y no
     después. */
  const alcanza = efectivo <= efectivoEnCaja;
  const dinero = (c: Centavos) => `${fmtMoney(c)} ${church.moneda}`;

  const aviso = (
    tono: "warn" | "ok" | "info",
    glifo: string,
    titulo: string,
    texto: string,
    accion?: { label: string; onClick: () => void },
  ) => (
    <div className="dep-aviso">
      <span className={`dep-aviso-punto dep-aviso-punto--${tono}`} aria-hidden="true">{glifo}</span>
      <span className="dep-aviso-textos">
        <span className="dep-aviso-titulo">{titulo}</span>
        <span className="dep-aviso-texto">{texto}</span>
      </span>
      {accion && (
        <button type="button" className="dep-aviso-accion" onClick={accion.onClick}>{accion.label}</button>
      )}
    </div>
  );

  return (
    <div className="dm dep-pen">
      <button type="button" className="dm-volver" onClick={onVolver}>
        <IconChevronLeft size={17} strokeWidth={2.4} /> {tituloLista}
      </button>

      <div className="dep-pen-cab">
        <div className="dep-pen-titulos">
          <div className="dep-pen-linea">
            <h1 className="dm-titular">{dia.titulo}</h1>
            <span className={`dep-chip dep-chip--${entregado ? "pendiente" : "caja"}`}>
              {entregado ? t("depositos.sinDepositar") : t("depositos.enCaja")}
            </span>
          </div>
          <p className="dm-sub">
            {entregado
              ? entregado.responsable
                ? t("depositos.entregadoA", {
                    quien: entregado.responsable,
                    fecha: fmtFechaCorta(entregado.fecha),
                  })
                : t("depositos.entregadoSinQuien", { fecha: fmtFechaCorta(entregado.fecha) })
              : t("depositos.pendienteSub")}
          </p>
          {/* Quién hizo el corte: no es lo mismo que quién se llevó el dinero
              —una lo contó, el otro lo lleva— y por eso son dos líneas. */}
          {entregado?.registrado_por && (
            <p className="dm-sub dm-registrado">
              {t("tx.registradoPor", {
                quien: [entregado.registrado_por, entregado.registrado_rol
                  ? t(`rol.${entregado.registrado_rol}`, { defaultValue: entregado.registrado_rol })
                  : null].filter(Boolean).join(" · "),
              })}
            </p>
          )}
        </div>
      </div>

      <div className="dep-cifras">
        <div className="dep-cifra">
          <span className="dep-cifra-et">{t("depositos.efectivoSeleccionado")}</span>
          <span className="dep-cifra-val">{fmtMoney(efectivo)}</span>
          <span className="dep-cifra-pie">{t("depositos.deEstimadosEnCaja", { monto: fmtMoney(efectivoEnCaja) })}</span>
        </div>
        <div className="dep-cifra">
          <span className="dep-cifra-et">
            {nCheques > 0 ? t("depositos.chequesConteo", { n: nCheques }) : t("depositos.cheques")}
          </span>
          <span className="dep-cifra-val">{fmtMoney(cheques)}</span>
          <span className="dep-cifra-pie">{t("depositos.mismaFicha")}</span>
        </div>
        <div className="dep-cifra">
          <span className="dep-cifra-et">{t("depositos.listoParaDepositar")}</span>
          <span className="dep-cifra-val dep-cifra-val--total">{fmtMoney(total)}</span>
          <span className="dep-cifra-pie">{t("depositos.nDeMSeleccionados", { n: nSel, total: movs.length })}</span>
        </div>
      </div>

      <div className="dep-cuerpo">
        <div className="dep-col">
          <section className="dep-carta">
            <h2 className="dep-carta-cab">{t("depositos.antesDeDepositar")}</h2>

            {/* 1. Los marcados por revisar. Real: `countPendingTx`. */}
            {porRevisar > 0 && aviso(
              "warn", "!",
              t("depositos.avisoPorRevisar", { count: porRevisar }),
              t("depositos.avisoPorRevisarSub"),
              { label: t("depositos.irPorRevisar"), onClick: onIrPorRevisar },
            )}

            {/* 2. ¿Alcanza el efectivo? Real: `efectivoDisponibleHasta`. */}
            {aviso(
              alcanza ? "ok" : "warn",
              alcanza ? "✓" : "!",
              alcanza ? t("depositos.efectivoAlcanza") : t("depositos.efectivoNoAlcanza"),
              alcanza
                ? t("depositos.efectivoAlcanzaSub", { efectivo: dinero(efectivo), caja: dinero(efectivoEnCaja) })
                : t("depositos.efectivoNoAlcanzaSub", { efectivo: dinero(efectivo), caja: dinero(efectivoEnCaja) }),
            )}

            {/* 3. El periodo contable. Es la misma advertencia que ya da el
                   formulario al guardar, dicha antes de empezar. */}
            {aviso("info", "?", t("depositos.periodoContable", { periodo: mesLegible(periodo) }), t("depositos.periodoContableSub"))}

            {/* 4. Éste no está en el diseño y ya no es permanente: solo sale
                   mientras queden depósitos registrados SIN corte detrás —los
                   de antes de que los cortes existieran, o los que se
                   registraron con "Nuevo depósito" a secas—. De ese dinero la
                   app no sabe de qué movimientos salió, así que puede seguir
                   apareciendo aquí. Cuando todos los depósitos tengan corte,
                   el aviso desaparece solo. */}
            {depSinCorte > 0 && aviso(
              "info", "i",
              t("depositos.depSinCorteTitulo", { count: depSinCorte }),
              t("depositos.depSinCorteSub"),
            )}
          </section>

          <section className="dep-carta">
            <h2 className="dep-carta-cab">
              <span className="dep-carta-cab-t">
                {entregado ? t("depositos.movsDelCorteTitulo") : t("depositos.movsEnCaja")}
              </span>
              <span>{t("tx.colMonto")}</span>
            </h2>
            {movs.length === 0 ? (
              <p className="dep-carta-vacio">{t("depositos.sinMovsEnCaja")}</p>
            ) : (
              movs.map((m) => {
                const marcado = sel.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`dep-mov${marcado ? " sel" : ""}`}
                    aria-pressed={marcado}
                    /* Un corte entregado no se re-marca: ese dinero ya salió
                       de la caja y cambiarlo aquí sería reescribir lo que se
                       contó delante de dos personas. Para corregirlo está
                       "Deshacer el corte". */
                    disabled={!!entregado}
                    onClick={() => onToggle(m.id)}
                  >
                    <span className="dep-mov-check" aria-hidden="true">{marcado ? "✓" : ""}</span>
                    <span className="dep-mov-metodo">{metodoAbr(m.metodo_pago)}</span>
                    <span className="dep-mov-textos">
                      <span className="dep-mov-concepto">
                        {m.concepto}
                        <span className="dep-mov-folio"> · {m.id}</span>
                      </span>
                      <span className="dep-mov-sub truncate">
                        {[m.member_nombre, m.detalle, m.fecha.slice(11, 16)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="dep-mov-monto">{fmtMoney(m.monto)}</span>
                  </button>
                );
              })
            )}
            {movs.length > 0 && (
              <div className="dep-carta-pie">
                <span>{t("depositos.nDeMSeleccionados", { n: nSel, total: movs.length })}</span>
                <span className="dep-carta-pie-total">{fmtMoney(total)}</span>
              </div>
            )}
          </section>
        </div>

        <div className="dep-col">
          <section className="dep-carta">
            <h2 className="dep-carta-cab">{t("depositos.seRegistraraAsi")}</h2>
            <div className="dep-par"><span>{t("depositos.colCuenta")}</span><span>{cuenta || t("depositos.sinCuentaAun")}</span></div>
            <div className="dep-par"><span>{t("tx.colFecha")}</span><span>{fechaRegistro}</span></div>
            <div className="dep-par"><span>{t("depositos.periodoCorrespondiente")}</span><span>{mesLegible(periodo)}</span></div>
            <div className="dep-par dep-par--fuerte">
              <span>{t("tx.colMonto")}</span><span>{fmtMoney(total)} {church.moneda}</span>
            </div>
            {/* Las dos formas de que el dinero llegue al banco:
                  · **Entregar el corte** — alguien se lo lleva. Es el camino
                    normal y por eso es el botón primario mientras el dinero
                    sigue en la caja.
                  · **Marcar depositado** — fue directo al banco, sin entrega.
                Sobre un corte ya entregado solo queda cerrarlo, o deshacerlo
                si el corte se hizo por error. */}
            <div className="dep-carta-accion">
              {entregado ? (
                <>
                  <button type="button" className="btn primary" onClick={onMarcarDepositado}>
                    {t("depositos.marcarDepositado")}
                  </button>
                  {onDeshacer && (
                    <button type="button" className="btn secondary dm-eliminar" onClick={onDeshacer}>
                      {t("depositos.deshacerCorte")}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" className="btn primary" onClick={onNuevoCorte} disabled={nSel === 0}>
                    <IconPlus size={14} /> {t("depositos.entregarCorte")}
                  </button>
                  <button type="button" className="btn secondary" onClick={onMarcarDepositado} disabled={nSel === 0}>
                    {t("depositos.marcarDepositado")}
                  </button>
                </>
              )}
            </div>
          </section>

          {/* La segunda firma (migración 47). Solo en un corte ENTREGADO:
              mientras el dinero sigue en la caja no hay nada que firmar, y
              adelantar el control a ese momento lo convertiría en un trámite
              de más. */}
          {entregado && (
            <section className="dep-carta">
              <h2 className="dep-carta-cab">{t("dobleFirma.filaComprobante")}</h2>
              {entregado.segunda_firma ? (
                <>
                  <div className="dep-par dep-par--fuerte">
                    <span>{t(`rol.${entregado.segunda_firma_rol}`, {
                      defaultValue: entregado.segunda_firma_rol ?? t("dobleFirma.firmante"),
                    })}</span>
                    <span>
                      {entregado.segunda_firma_modo === "conteo"
                        ? t("dobleFirma.firmadoConteo", {
                            nombre: entregado.segunda_firma,
                            monto: fmtMoney((entregado.segunda_conteo ?? 0) as Centavos),
                            fecha: fmtFechaCorta((entregado.segunda_firma_en ?? "").slice(0, 10)),
                          })
                        : t("dobleFirma.firmadoRevision", {
                            nombre: entregado.segunda_firma,
                            fecha: fmtFechaCorta((entregado.segunda_firma_en ?? "").slice(0, 10)),
                          })}
                    </span>
                  </div>
                  {onQuitarFirma && (
                    <div className="dep-carta-accion">
                      <button type="button" className="btn secondary dm-eliminar" onClick={onQuitarFirma}>
                        {t("dobleFirma.quitar")}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Contó y NO cuadró: la cifra queda escrita aunque no haya
                      firma. Tirar ese número sería tirar justo el dato por el
                      que se cuenta dos veces. */}
                  {entregado.segunda_conteo != null
                    ? aviso("warn", "!", t("dobleFirma.noCuadra"),
                        t("dobleFirma.descuadreAviso", {
                          monto: `${fmtMoney(entregado.segunda_conteo as Centavos)} ${church.moneda}`,
                          registrado: `${fmtMoney(total)} ${church.moneda}`,
                        }))
                    : aviso(
                        entregado.doble_firma_pedida === 1 ? "warn" : "info",
                        entregado.doble_firma_pedida === 1 ? "!" : "i",
                        t("dobleFirma.pendiente"),
                        t("dobleFirma.pendienteSub"),
                      )}
                  {onSegundaFirma && (
                    <div className="dep-carta-accion">
                      <button type="button" className="btn secondary" onClick={onSegundaFirma}>
                        {t("dobleFirma.titulo")}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          <section className="dep-carta dep-carta--acolchada">
            <h2 className="dep-carta-cab dep-carta-cab--suelta">{t("depositos.ficha")}</h2>
            <div className="dep-ficha-hueco">
              <span className="dep-ficha-hueco-t">{t("depositos.fotoFicha")}</span>
              <span className="dep-ficha-hueco-s">{t("depositos.seAdjuntaAlRegistrar")}</span>
            </div>
          </section>

          <p className="dep-nota">{t("pdf.notaDepositos")}</p>
        </div>
      </div>
    </div>
  );
}
