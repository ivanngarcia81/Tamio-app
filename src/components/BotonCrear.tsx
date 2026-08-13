import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconPlus } from "../icons";
import { EVENTO_FILA, hayFilaAbierta } from "./useFilaDeslizable";

interface Props {
  onCrear: () => void;
}

/**
 * Botón flotante de crear. **Vive aparte de la barra inferior a propósito**:
 * el iPad no lleva barra de pestañas —tiene sitio de sobra para la barra
 * lateral, igual que el Mac— pero sí merece el atajo de crear. Si el botón
 * fuera parte de la barra, darle el atajo al iPad obligaría a darle también
 * una barra que ahí sobra.
 *
 * Dónde aparece y a qué altura lo decide el CSS: en el iPhone se sienta encima
 * de la barra; en el iPad, en la esquina, porque no hay barra debajo. En el Mac
 * no sale: ahí está Cmd+N y el botón de cada pantalla.
 */
export default function BotonCrear({ onCrear }: Props) {
  const { t } = useTranslation();

  // Se aparta mientras hay una fila deslizada: los botones de Editar y
  // Eliminar salen por este mismo borde derecho, y es el único sitio de la app
  // donde un toque equivocado borra algo.
  const [filaAbierta, setFilaAbierta] = useState(false);
  useEffect(() => {
    const mirar = () => setFilaAbierta(hayFilaAbierta());
    window.addEventListener(EVENTO_FILA, mirar);
    return () => window.removeEventListener(EVENTO_FILA, mirar);
  }, []);

  return (
    <button
      type="button"
      className={`btn-crear${filaAbierta ? " oculto" : ""}`}
      onClick={onCrear}
      aria-label={t("crear.titulo")}
    >
      <IconPlus size={24} strokeWidth={2.4} />
    </button>
  );
}
