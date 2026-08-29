/**
 * ConfirmarBorradoIOS.tsx — la pantalla que frena la mano (maqueta S10).
 *
 * Tres decisiones, y ninguna es de aspecto:
 *
 * 1. El inventario va ARRIBA y en rojo. Un "¿estás seguro?" no deja ver nada;
 *    "1 148 movimientos" sí. Quien se equivocó de iglesia o de botón lo
 *    descubre aquí, leyendo cifras que reconoce.
 * 2. La palabra de confirmación deja de ser "BORRAR" y pasa a ser el NOMBRE
 *    de la iglesia. "BORRAR" está escrito en la misma pantalla que lo pide:
 *    se copia sin leer. El nombre hay que saberlo —o salir a Institución a
 *    buscarlo y volver—, y esa ida y vuelta es exactamente la fricción que se
 *    busca.
 * 3. El botón nace apagado, en gris, y solo se enciende en rojo cuando el
 *    nombre está completo. No hay ningún instante en que un toque de más
 *    ejecute el borrado.
 *
 * Lo que borra es lo de siempre (`borrarDatosIglesia` / `reinicioDeFabrica`):
 * esto es la puerta, no el motor.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Church, InventarioIglesia } from "../../db";
import { IconWarn } from "../../icons";
import { IOSPantalla, Section } from "../ios/FormularioIOS";

/** Qué se va a borrar: solo los registros (A) o todo, configuración incluida
 *  (B). Los mismos dos de siempre. */
export type AccionBorrado = "datos" | "fabrica";

/** El orden en que se leen: primero lo que más duele perder. No es
 *  alfabético ni el de la base — es el de la conversación que alguien tendría
 *  con su tesorero. */
const ORDEN: (keyof InventarioIglesia)[] = [
  "miembros", "movimientos", "depositos", "cortes", "cartas", "actas", "servicios", "agenda",
];

interface Props {
  church: Church;
  accion: AccionBorrado;
  inventario: InventarioIglesia | null;
  /** Cierra la pantalla sin hacer nada. */
  onVolver: () => void;
  /** Ejecuta el borrado ya confirmado. */
  onConfirmar: () => Promise<void>;
  /** Nombre de la pantalla anterior, junto al galón de volver. */
  volverA: string;
}

export default function ConfirmarBorradoIOS({
  church, accion, inventario, onVolver, onConfirmar, volverA,
}: Props) {
  const { t } = useTranslation();
  const [texto, setTexto] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Sin acentos no vale, y es a propósito: escribir «í» en el teclado de iOS
     cuesta un pulsado largo, y ese segundo de más es el que hace falta. Las
     mayúsculas sí se perdonan —la primera letra la pone el teclado solo, y
     castigar eso sería castigar al teclado, no al descuido. */
  const objetivo = church.nombre.trim();
  const habilitado = texto.trim().toLocaleLowerCase() === objetivo.toLocaleLowerCase();

  const filas = ORDEN
    .map((clave) => ({ clave, n: inventario?.[clave] ?? 0 }))
    .filter((f) => f.n > 0);

  async function confirmar() {
    if (!habilitado || trabajando) return;
    setTrabajando(true);
    setError(null);
    try {
      await onConfirmar();
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
      setTrabajando(false);
    }
  }

  return (
    <IOSPantalla
      titulo={t("zonaSensible.confirmarTitulo")}
      volverA={volverA}
      onVolver={onVolver}
    >
      <Section
        header={t("zonaSensible.seVaAEliminar")}
        footer={accion === "fabrica" ? t("zonaSensible.piePerdidaFabrica") : t("zonaSensible.piePerdidaDatos")}
      >
        {filas.length === 0 ? (
          <div className="ios-row ios-row--dato ios-row--rasa">
            <span className="ios-row-label">{t("zonaSensible.nadaCapturado")}</span>
          </div>
        ) : filas.map(({ clave, n }) => (
          <div className="ios-row ios-row--dato ios-row--rasa" key={clave}>
            <span className="ios-row-label">{t(`inventario.${clave}`)}</span>
            <span className="ios-row-value ios-row-value--peligro">{n.toLocaleString()}</span>
          </div>
        ))}
      </Section>

      <Section
        header={t("zonaSensible.escribeNombre")}
        footer={t("zonaSensible.pieNombre", { nombre: objetivo })}
      >
        <label className="ios-field ios-field--solo">
          <input
            className="ios-field-input ios-field-input--izq"
            value={texto}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t("zonaSensible.nombrePlaceholder")}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && habilitado) void confirmar(); }}
          />
        </label>
      </Section>

      <section className="ios-section">
        <button
          type="button"
          className="ios-accion-bloque ios-accion-bloque--peligro"
          disabled={!habilitado || trabajando}
          onClick={() => void confirmar()}
        >
          {trabajando
            ? t("common.guardando")
            : (accion === "datos" ? t("reset.borrarDatosBtn") : t("reset.fabricaBtn"))}
        </button>
        <p className="ios-section-footer">{t("zonaSensible.pieBoton")}</p>
      </section>

      {error && (
        <section className="ios-section">
          <p className="ios-section-footer ios-pie-aviso">
            <IconWarn size={13} /> {error}
          </p>
        </section>
      )}

      {/* Salir es la acción esperada de esta pantalla, así que va sin caja y
          sin peso: un enlace, no un botón que compita con el rojo. */}
      <section className="ios-section">
        <button type="button" className="ios-accion-suelta" onClick={onVolver} disabled={trabajando}>
          {t("zonaSensible.cancelarYVolver")}
        </button>
      </section>
    </IOSPantalla>
  );
}
