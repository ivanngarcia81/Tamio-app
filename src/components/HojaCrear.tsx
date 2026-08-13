import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import {
  IconArrowDown, IconArrowUp, IconBank, IconBookOpen, IconCalendar,
  IconClose, IconFileText, IconIdBadge, IconMail,
} from "../icons";
import { accionesCrearVisibles } from "../navegacion";
import type { Role } from "../role";

interface Props {
  role: Role;
  onCerrar: () => void;
  /** Qué crear. El id viene de ACCIONES_CREAR en navegacion.ts. */
  onElegir: (id: string) => void;
}

const ICONOS: Record<string, React.ReactNode> = {
  ingreso: <IconArrowUp size={20} />,
  gasto: <IconArrowDown size={20} />,
  deposito: <IconBank size={20} />,
  miembro: <IconIdBadge size={20} />,
  servicio: <IconBookOpen size={20} />,
  acta: <IconFileText size={20} />,
  carta: <IconMail size={20} />,
  evento: <IconCalendar size={20} />,
};

/**
 * Hoja de "¿Qué desea crear?", la que abre el botón flotante del teléfono.
 *
 * Antes, registrar un diezmo desde cualquier pantalla eran tres toques —abrir
 * el cajón arriba a la izquierda, elegir Ingresos, buscar el "+"—, y el
 * primero en la esquina que peor alcanza el pulgar. Aquí son dos, los dos
 * abajo.
 *
 * La lista y sus permisos salen de `navegacion.ts`: lo que el rol no puede ver
 * no se le ofrece crear.
 */
export default function HojaCrear({ role, onCerrar, onElegir }: Props) {
  const { t } = useTranslation();
  const acciones = accionesCrearVisibles(role);

  useEffect(() => {
    function esc(e: KeyboardEvent) { if (e.key === "Escape") onCerrar(); }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCerrar]);

  return createPortal(
    <div className="hoja-telon" onClick={onCerrar}>
      <div className="hoja-crear" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <span className="hoja-agarre" aria-hidden />
        <div className="hoja-encabezado">
          <span className="hoja-kicker">{t("crear.kicker")}</span>
          <h2 className="hoja-titulo">{t("crear.titulo")}</h2>
        </div>
        <div className="hoja-rejilla">
          {acciones.map((a) => (
            <button key={a.id} type="button" className="hoja-tarjeta" onClick={() => onElegir(a.id)}>
              <span className={`hoja-icono ${a.id}`}>{ICONOS[a.id]}</span>
              <span className="hoja-tarjeta-titulo">{t(a.clave)}</span>
              <span className="hoja-tarjeta-sub">{t(a.claveSub)}</span>
            </button>
          ))}
        </div>
        <button type="button" className="hoja-cerrar" onClick={onCerrar} aria-label={t("common.cerrar")}>
          <IconClose size={20} />
        </button>
      </div>
    </div>,
    document.body
  );
}
