/**
 * NuevoCorteIOS.tsx — la hoja "Nuevo corte".
 *
 * Un **corte** es el dinero en efectivo y cheques que la tesorera cuenta junto
 * y entrega a una persona para que lo lleve al banco. Definido con Iván el 24
 * de agosto de 2026, después de dos días usando la palabra del handoff sin que
 * nadie hubiera dicho qué significaba en esta iglesia.
 *
 * **Tiene motor desde la migración 38.** Hasta la 1.2.9 la hoja se llenaba y
 * "Crear" salía apagado, porque no había dónde guardarla. Ahora crea el corte
 * y engancha sus movimientos: a partir de ese momento ese dinero deja de estar
 * "en caja" y pasa a estar "entregado, todavía no en el banco".
 *
 * Dos decisiones de la conversación que se ven aquí:
 *
 * - **Constancia, no acuse.** Se anota a quién se le entregó; esa persona no
 *   confirma nada en la app. Por eso "Pedir doble firma" sigue apagado: es la
 *   opción que Iván NO eligió, no un hueco pendiente.
 * - **El responsable se elige, no es un rol.** *"No necesariamente tiene que
 *   ser el pastor, puede ser cualquier persona que esté asignada a ese
 *   trabajo."* Sale de `usuarios`, se puede escribir uno que no esté dado de
 *   alta, y **se propone el del corte anterior** — si casi siempre es la misma
 *   persona, teclearla cada domingo es trabajo inventado.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import { ActionField, Section, SwitchField, TextField } from "./ios/FormularioIOS";
import { IOSBuscadorField } from "./ios/IOSBuscadorSheet";
import { showToast } from "../toast";
import { playSound } from "../sound";
import {
  fmtFechaCorta, fmtMoney, insertCorte, listUsuarios, metodoAbr,
  type Church, type Tx, type Usuario,
} from "../db";
import { sumar, type Centavos } from "../dinero";
import { useEscapeClose } from "../hooks/useEscapeClose";

interface Props {
  church: Church;
  /** Los movimientos del corte abierto, con su selección viva. */
  movs: Tx[];
  sel: Set<number>;
  onToggle: (id: number) => void;
  /** Nombre propuesto ("Corte del 23 ago") y la cuenta del último depósito. */
  nombre: string;
  cuenta: string;
  fecha: string;
  /** El responsable del corte anterior: se propone, no se impone. */
  responsablePrevio: string;
  onClose: () => void;
  /** Se llama con el corte ya creado, para recargar la pantalla. */
  onCreado: () => void;
}

const esCheque = (t: Tx) => t.metodo_pago === "cheque";

export default function NuevoCorteIOS({
  church, movs, sel, onToggle, nombre, cuenta, fecha, responsablePrevio, onClose, onCreado,
}: Props) {
  const { t } = useTranslation();
  const titulo = t("depositos.nuevoCorte");
  const [nombreCorte, setNombreCorte] = useState(nombre);
  /* La política de la iglesia es el valor por OMISIÓN, no una orden: este
     corte puede pedirla o no aunque la iglesia diga otra cosa. */
  const [dobleFirma, setDobleFirma] = useState(church.pedir_doble_firma === 1);
  const [responsable, setResponsable] = useState(responsablePrevio);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [guardando, setGuardando] = useState(false);
  useEscapeClose(onClose);

  useEffect(() => {
    let cancelado = false;
    listUsuarios(church.id)
      .then((us) => { if (!cancelado) setUsuarios(us); })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [church.id]);

  const marcados = movs.filter((m) => sel.has(m.id));
  const suma = (f: (x: Tx) => boolean): Centavos =>
    sumar(...marcados.filter(f).map((m) => m.monto));
  const efectivo = suma((m) => !esCheque(m));
  const cheques = suma(esCheque);
  const total = sumar(efectivo, cheques);
  const nCheques = marcados.filter(esCheque).length;
  const sinNada = marcados.length === 0 || !nombreCorte.trim();

  async function crear() {
    setGuardando(true);
    try {
      const id = await insertCorte(
        church.id,
        {
          fecha,
          nombre: nombreCorte.trim(),
          cuenta_banco: cuenta || null,
          responsable: responsable.trim() || null,
          dobleFirma,
        },
        marcados.map((m) => m.id),
      );
      if (id == null) throw new Error("sin id");
      playSound("guardado");
      showToast(t("depositos.toastCorteCreado", { n: marcados.length }));
      onCreado();
      onClose();
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
      setGuardando(false);
    }
  }

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="ios-sheet nm-hoja" role="dialog" aria-label={titulo}>
          <span className="nm-tirador" aria-hidden="true" />

          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onClose}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{titulo}</h1>
            <span className="ios-nav-status">
              {/* Encendido desde la migración 38. Solo se apaga si no hay
                  nada marcado o el corte se quedó sin nombre: un corte vacío
                  no dice nada y uno sin nombre no se distingue del de al
                  lado en la lista. */}
              <button
                type="button"
                className="ios-nav-action"
                onClick={() => void crear()}
                disabled={guardando || sinNada}
              >
                {guardando ? t("common.guardando") : t("depositos.crearCorte")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body nm-cuerpo">
            <div className="nm-monto nm-monto--lectura">
              <span className="nm-monto-et">{t("depositos.totalADepositar")}</span>
              <span className="nm-monto-cifra">{fmtMoney(total)}</span>
              <span className="nm-monto-pie">
                {t("depositos.nDeMSeleccionados", { n: marcados.length, total: movs.length })}
              </span>
            </div>

            {/* Lo que va a pasar al pulsar Crear, dicho antes de pulsarlo:
                ese dinero deja de contar como "en caja". */}
            <p className="nm-aviso nm-aviso--info" role="note">{t("depositos.corteQueHace")}</p>

            <Section header={t("depositos.datosDelCorte")}>
              <TextField label={t("depositos.nombreCorte")} value={nombreCorte} onChange={setNombreCorte} stacked />
              <div className="ios-field">
                <span className="ios-field-label">{t("depositos.colCuenta")}</span>
                <span className="ios-field-value">{cuenta || t("depositos.sinCuentaAun")}</span>
              </div>
              <div className="ios-field">
                <span className="ios-field-label">{t("depositos.fechaDeposito")}</span>
                <span className="ios-field-value">{fmtFechaCorta(fecha)}</span>
              </div>
              {/* Quién se lleva el dinero. Sale de `usuarios` y se puede
                  escribir uno que no esté dado de alta —quien lleva el dinero
                  no tiene por qué usar la app—, con el del corte anterior ya
                  propuesto. Mismo trato que la cuenta bancaria del depósito. */}
              <IOSBuscadorField
                label={t("depositos.responsable")}
                valor={responsable}
                vacio={t("depositos.responsableElegir")}
                title={t("depositos.responsable")}
                placeholder={t("depositos.responsableBuscar")}
                opciones={usuarios.map((u) => ({ id: String(u.id), titulo: u.nombre, sub: t(`rol.${u.rol}`, { defaultValue: u.rol }) }))}
                seleccionado={usuarios.find((u) => u.nombre === responsable) ? responsable : null}
                textoInicial={responsable}
                onElegir={(o) => setResponsable(o.titulo)}
                onTextoLibre={(tx) => setResponsable(tx)}
                etiquetaTextoLibre={(tx) => t("depositos.responsableNuevo", { texto: tx })}
                onLimpiar={responsable ? () => setResponsable("") : undefined}
              />
            </Section>

            <Section header={t("depositos.movsSinDepositar")}>
              {movs.length === 0 ? (
                <div className="ios-field"><span className="ios-field-label">{t("depositos.sinMovsEnCaja")}</span></div>
              ) : movs.map((m) => {
                const marcado = sel.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`ios-field ios-field--marcar${marcado ? " sel" : ""}`}
                    aria-pressed={marcado}
                    onClick={() => onToggle(m.id)}
                  >
                    <span className="dep-mov-check" aria-hidden="true">{marcado ? "✓" : ""}</span>
                    <span className="ios-field-textos">
                      <span className="ios-field-label truncate">
                        {m.concepto}{m.member_nombre ? ` · ${m.member_nombre}` : ""}
                      </span>
                      <span className="ios-field-sub">{metodoAbr(m.metodo_pago)}</span>
                    </span>
                    <span className="ios-field-value">{fmtMoney(m.monto)}</span>
                  </button>
                );
              })}
            </Section>

            <Section header={t("depositos.desgloseYComprobante")}>
              <div className="ios-field">
                <span className="ios-field-label">{t("depositos.efectivo")}</span>
                <span className="ios-field-value">{fmtMoney(efectivo)}</span>
              </div>
              <div className="ios-field">
                <span className="ios-field-label">
                  {nCheques > 0 ? t("depositos.chequesConteo", { n: nCheques }) : t("depositos.cheques")}
                </span>
                <span className="ios-field-value">{fmtMoney(cheques)}</span>
              </div>
              {/* Sigue apagado, y ahora se sabe POR QUÉ mejor: la ficha la da
                  el banco, así que en el corte todavía no hay ninguna que
                  adjuntar. Se adjunta un paso después, al registrar el
                  depósito, donde el campo lleva funcionando desde siempre. */}
              <ActionField
                label={t("depositos.adjuntarFotoFicha")}
                onPress={() => { }}
                disabled
                title={t("depositos.fichaLaDaElBanco")}
              />
              {/* **Encendido desde la migración 47.** Estuvo apagado dos
                  veces y por motivos distintos: primero por falta de columna,
                  y después un día entero por decisión —constancia y no
                  acuse—. La conversación del 24 de agosto cambió esa
                  decisión al aclarar qué es la segunda firma en esta iglesia:
                  no que el que recibe confirme, sino que otra persona vuelva
                  a CONTAR el dinero antes de que salga.

                  Nace con lo que diga la política de la iglesia, y aquí se
                  cambia para este corte suelto. El handoff dibuja un control
                  en cada sitio y ahora los dos significan algo. */}
              <SwitchField
                label={t("controlesTesoreria.dobleFirma")}
                sub={t("depositos.dobleFirmaSub")}
                checked={dobleFirma}
                onChange={setDobleFirma}
              />
            </Section>

            <p className="dep-nota dep-nota--hoja">
              {t("depositos.corteMoneda", { moneda: church.moneda })}
            </p>
          </div>
        </div>
      </div>
    </Portal>
  );
}
