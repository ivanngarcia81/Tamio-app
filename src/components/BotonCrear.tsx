import { useTranslation } from "react-i18next";
import { PlusIcon } from "./icons/IOSIcons";

interface Props {
  onCrear: () => void;
}

/**
 * Botón de crear de iPhone/iPad: un glifo "+" solo, sin círculo ni fondo ni
 * sombra —el patrón nativo de iOS (Notas, Recordatorios), no el círculo
 * flotante de Material Design que llevaba antes—, fijo en la fila superior
 * de cada pantalla, extremo derecho.
 *
 * La acción es CONTEXTUAL: quien lo renderiza (`App.tsx`) decide qué hace
 * `onCrear` según la ruta actual —crear un ingreso en /ingresos, un gasto en
 * /gastos, etc.— y solo lo pinta en las pantallas donde de verdad hay algo
 * que crear. Ya no hay un paso intermedio de "¿qué desea crear?": estando en
 * la pantalla, el "+" ya sabe qué hacer.
 *
 * Dónde aparece lo decide el CSS: en el iPhone comparte fila con el ícono de
 * compartir de cada pantalla; en el iPad, misma fila, porque no lleva la
 * barra de pestañas del teléfono —tiene sitio de sobra para la barra
 * lateral, igual que el Mac— pero sí merece el atajo de crear. En el Mac no
 * sale: ahí está Cmd+N y el botón de cada pantalla.
 */
export default function BotonCrear({ onCrear }: Props) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      className="btn-crear"
      onClick={onCrear}
      aria-label={t("crear.ayuda")}
    >
      <PlusIcon size={22} />
    </button>
  );
}
