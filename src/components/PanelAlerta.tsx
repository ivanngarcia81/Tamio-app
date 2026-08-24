import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { catNombre, fmtFechaCorta, fmtMoney, metodoNombre } from "../db";
import type { Alerta } from "../services/bandeja/alertas";
import type { Centavos } from "../dinero";

/**
 * La cabecera del panel de "Por revisar", como la dibuja el handoff:
 * pastilla "Requiere revisión", titular grande, un PÁRRAFO que explica el
 * caso con sus datos, y la fila de acciones propias de esa alerta.
 *
 * La explicación es el corazón de esta pantalla y por eso se redacta con los
 * valores reales (folio, monto, fecha, umbral) en vez de un texto fijo: quien
 * abre la bandeja tiene que poder decidir sin ir a buscar el movimiento.
 *
 * Lo que va DEBAJO —la ficha de campos, el comprobante, el rastro— no se
 * duplica aquí: lo pinta `DetalleMovimiento`, que ya lo hace bien y es el
 * mismo movimiento. Esta pieza es solo el encabezado que cambia según por qué
 * el asunto llegó a la bandeja.
 */

interface Props {
  alerta: Alerta;
  /** El umbral vigente, para poder citarlo en el texto de "sin comprobante". */
  umbral: Centavos;
  moneda: string;
  /** Las acciones de esta alerta, ya resueltas por la página. */
  acciones: ReactNode;
}

export default function PanelAlerta({ alerta, umbral, moneda, acciones }: Props) {
  const { t } = useTranslation();
  const tx = alerta.tx;

  /* El párrafo, con los datos dentro. Cada tipo cuenta lo suyo; los que
     comparten forma (un movimiento y su importe) comparten variables. */
  const datos = {
    concepto: tx?.concepto ?? "",
    monto: tx ? `${fmtMoney(tx.monto)} ${moneda}` : "",
    fecha: tx ? fmtFechaCorta(tx.fecha) : "",
    metodo: tx ? metodoNombre(tx.metodo_pago) : "",
    umbral: `${fmtMoney(umbral)} ${moneda}`,
    categoria: tx ? catNombre(tx.categoria) : "",
    gemelo: alerta.gemelo ? fmtFechaCorta(alerta.gemelo.fecha) : "",
    gemeloMonto: alerta.gemelo ? `${fmtMoney(alerta.gemelo.monto)} ${moneda}` : "",
    miembro: alerta.miembro?.nombre ?? "",
    recurrente: alerta.recurrente?.concepto ?? "",
    meses: (alerta.meses ?? []).length,
    /* El corte al que le falta la segunda firma. `registro` dice quién lo
       hizo, que es la mitad del mensaje: la firma le toca a alguien más. */
    corte: alerta.corte?.nombre ?? "",
    registro: alerta.corte?.registrado_por ?? t("common.sinEspecificar"),
  };

  return (
    <div className="al-cab">
      <span className="al-pastilla">{t("bandeja.requiereRevision")}</span>
      <h1 className="al-titulo">{t(`bandeja.alerta_${alerta.tipo}`)}</h1>
      <p className="al-texto">{t(`bandeja.explica_${alerta.tipo}`, datos)}</p>
      <div className="al-acciones">{acciones}</div>
    </div>
  );
}
