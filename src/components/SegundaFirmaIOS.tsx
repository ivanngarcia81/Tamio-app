/**
 * SegundaFirmaIOS.tsx — la hoja de la **doble firma del corte**
 * (migración 47).
 *
 * Qué es, con las palabras de Iván: la tesorera cuenta el dinero, y hay una
 * segunda persona —la asistente, la que la sustituye cuando falta— que lo
 * vuelve a contar y confirma que todo está bien.
 *
 * Dos modos, y **los elige quien firma**, no la app:
 *
 *  - **Conteo.** Con el dinero delante. La hoja **tapa el total** y le pide el
 *    suyo. Si cuadra, firma; si no, las dos cifras quedan escritas y la firma
 *    no se da. Es el único control de toda la app que compara el efectivo
 *    físico contra lo registrado.
 *  - **Revisión.** Cuando la firma llega días después —desde Por revisar, con
 *    el dinero ya en el banco— contar no es posible. Lo que sí puede decir es
 *    que el registro es coherente: los movimientos, el total, la cuenta.
 *
 * Que los dos no se disfracen el uno del otro es el punto entero de tener dos
 * modos. El comprobante los imprime con esas palabras.
 *
 * **El límite, dicho en voz alta:** es ciego al TECLEAR, no a mirar. Quien
 * arma el corte vio el total un momento antes en su pantalla. Contra un error
 * honesto —que es de lo que protege contar dos veces— funciona; contra dos
 * personas puestas de acuerdo, no. Ninguna app lo hace, y fingir lo contrario
 * sería peor que no tenerlo.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import { Section } from "./ios/FormularioIOS";
import { IOSBuscadorField } from "./ios/IOSBuscadorSheet";
import { fmtMoney, type Corte, type Usuario } from "../db";
import { deTextoTecleado, restar, type Centavos } from "../dinero";
import { useEscapeClose } from "../hooks/useEscapeClose";

type Modo = "conteo" | "revision";

interface Props {
  corte: Corte;
  /** El total del corte, calculado de sus movimientos. NO se enseña en el
   *  modo conteo: es justo lo que la segunda persona tiene que averiguar. */
  total: Centavos;
  moneda: string;
  /** Quiénes pueden firmar: el directorio SIN quien registró el corte. */
  candidatos: Usuario[];
  /** true cuando el dinero ya está en el banco: contar deja de ser posible y
   *  solo cabe revisar. Lo decide el llamador con el estado del corte. */
  soloRevision: boolean;
  onFirmar: (v: { nombre: string; rol: string | null; modo: Modo; conteo: Centavos | null }) => void;
  /** Contó, no cuadró, y lo deja registrado sin firmar. */
  onDescuadre: (conteo: Centavos) => void;
  onClose: () => void;
}

export default function SegundaFirmaIOS({
  corte, total, moneda, candidatos, soloRevision, onFirmar, onDescuadre, onClose,
}: Props) {
  const { t } = useTranslation();
  const titulo = t("dobleFirma.titulo");
  useEscapeClose(onClose);

  const [modo, setModo] = useState<Modo>(soloRevision ? "revision" : "conteo");
  const [quien, setQuien] = useState("");
  const [contado, setContado] = useState("");
  /** Se pone al pulsar "Comprobar": hasta entonces no se enseña nada del total. */
  const [veredicto, setVeredicto] = useState<{ cifra: Centavos; cuadra: boolean } | null>(null);

  const usuario = candidatos.find((u) => u.nombre === quien) ?? null;
  const cifra = contado.trim() ? deTextoTecleado(contado.trim()) : null;
  const puedeComprobar = cifra !== null;
  const listo = !!quien.trim() && (modo === "revision" || veredicto?.cuadra === true);

  function comprobar() {
    if (cifra === null) return;
    setVeredicto({ cifra, cuadra: cifra === total });
  }

  function firmar() {
    onFirmar({
      nombre: quien.trim(),
      rol: usuario?.rol ?? null,
      modo,
      conteo: modo === "conteo" ? veredicto?.cifra ?? null : null,
    });
  }

  const dinero = (c: Centavos) => `${fmtMoney(c)} ${moneda}`;

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
              <button type="button" className="ios-nav-action" disabled={!listo} onClick={firmar}>
                {t("dobleFirma.firmar")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body nm-cuerpo">
            <p className="nm-aviso nm-aviso--info" role="note">
              {soloRevision ? t("dobleFirma.yaEnBanco") : t("dobleFirma.queEs")}
            </p>

            <Section header={t("dobleFirma.quienFirma")} footer={t("dobleFirma.quienFirmaPie")}>
              {/* El directorio sin quien registró: nadie se firma a sí mismo.
                  Se puede escribir un nombre suelto, como el responsable del
                  corte — en una iglesia pequeña firma el pastor. */}
              <IOSBuscadorField
                label={t("dobleFirma.firmante")}
                valor={quien}
                vacio={t("dobleFirma.elegirFirmante")}
                title={t("dobleFirma.quienFirma")}
                placeholder={t("dobleFirma.buscarFirmante")}
                opciones={candidatos.map((u) => ({
                  id: String(u.id),
                  titulo: u.nombre,
                  sub: t(`rol.${u.rol}`, { defaultValue: u.rol }),
                }))}
                seleccionado={usuario ? quien : null}
                textoInicial={quien}
                onElegir={(op) => setQuien(op.titulo)}
                onTextoLibre={(texto) => setQuien(texto)}
                etiquetaTextoLibre={(texto) => t("dobleFirma.anotar", { nombre: texto })}
              />
            </Section>

            {!soloRevision && (
              <Section header={t("dobleFirma.queHizo")} footer={t("dobleFirma.queHizoPie")}>
                {(["conteo", "revision"] as Modo[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`ios-field ios-field--marcar${modo === m ? " sel" : ""}`}
                    aria-pressed={modo === m}
                    onClick={() => { setModo(m); setVeredicto(null); }}
                  >
                    <span className="dep-mov-check" aria-hidden="true">{modo === m ? "✓" : ""}</span>
                    <span className="ios-field-textos">
                      <span className="ios-field-label">{t(`dobleFirma.modo.${m}`)}</span>
                      <span className="ios-field-sub">{t(`dobleFirma.modoSub.${m}`)}</span>
                    </span>
                  </button>
                ))}
              </Section>
            )}

            {modo === "conteo" && (
              <Section header={t("dobleFirma.cuantoContaste")} footer={t("dobleFirma.aCiegasPie")}>
                {/* Aquí NO se enseña el total. El campo se teclea a ciegas y
                    "Comprobar" es lo único que revela si cuadra: sin eso, el
                    doble conteo sería copiar un número de la línea de arriba. */}
                <label className="ios-field ios-field--stacked">
                  <span className="ios-field-label">{t("dobleFirma.tuTotal")}</span>
                  <input
                    className="ios-field-input"
                    value={contado}
                    inputMode="decimal"
                    placeholder={t("dobleFirma.tuTotalEjemplo")}
                    onChange={(e) => { setContado(e.target.value); setVeredicto(null); }}
                  />
                </label>
                {!veredicto && (
                  <button
                    type="button"
                    className="ios-field ios-field--action"
                    disabled={!puedeComprobar}
                    onClick={comprobar}
                  >
                    {t("dobleFirma.comprobar")}
                  </button>
                )}
                {veredicto && (
                  <div className={`dep-aviso dep-aviso--${veredicto.cuadra ? "ok" : "warn"}`}>
                    <span
                      className={`dep-aviso-punto dep-aviso-punto--${veredicto.cuadra ? "ok" : "warn"}`}
                      aria-hidden="true"
                    >
                      {veredicto.cuadra ? "✓" : "!"}
                    </span>
                    <span className="dep-aviso-textos">
                      <span className="dep-aviso-titulo">
                        {veredicto.cuadra ? t("dobleFirma.cuadra") : t("dobleFirma.noCuadra")}
                      </span>
                      <span className="dep-aviso-texto">
                        {veredicto.cuadra
                          ? t("dobleFirma.cuadraSub", { monto: dinero(total) })
                          : t("dobleFirma.noCuadraSub", {
                              tuyo: dinero(veredicto.cifra),
                              registrado: dinero(total),
                              diferencia: dinero(restar(veredicto.cifra, total)),
                            })}
                      </span>
                    </span>
                  </div>
                )}
                {veredicto && !veredicto.cuadra && (
                  <>
                    {/* Volver a contar es lo primero que se ofrece: un
                        descuadre casi siempre es un billete mal contado. */}
                    <button
                      type="button"
                      className="ios-field ios-field--action"
                      onClick={() => { setVeredicto(null); setContado(""); }}
                    >
                      {t("dobleFirma.contarOtraVez")}
                    </button>
                    {/* Y si de verdad no cuadra, la cifra queda registrada SIN
                        firma. Perder ese número sería tirar justo el dato por
                        el que se cuenta dos veces. */}
                    <button
                      type="button"
                      className="ios-field ios-field--destructive"
                      onClick={() => onDescuadre(veredicto.cifra)}
                    >
                      {t("dobleFirma.registrarDescuadre")}
                    </button>
                  </>
                )}
              </Section>
            )}

            <p className="dep-nota dep-nota--hoja">
              {t("dobleFirma.corteNombre", { nombre: corte.nombre })}
            </p>
          </div>
        </div>
      </div>
    </Portal>
  );
}
