import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * El botón flotante "+" del teléfono manda aquí con `state: { crear: true }`
 * (ver App.tsx, HojaCrear) para las seis acciones que no abren su modal
 * directo desde la hoja — a diferencia de ingreso/gasto, estas navegan
 * primero a su página. Sin este enganche, "Crear carta" (o acta, servicio…)
 * dejaba a medio camino: llegabas a la pantalla y ahí no pasaba nada, porque
 * el botón que de verdad abría el formulario es el de la cabecera, que en el
 * teléfono ya no se pinta (duplica a este mismo "+").
 *
 * `abrir` se llama UNA vez al entrar con la señal puesta, y el estado se
 * limpia enseguida (`replace`) para que un refresco o un "atrás" no vuelva a
 * abrir el formulario solo.
 */
export function useAbrirCrearDesdeMas(abrir: () => void): void {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!(location.state as { crear?: boolean } | null)?.crear) return;
    abrir();
    navigate(location.pathname, { replace: true });
    // Solo al montar / si la señal cambia — `abrir` no entra en las
    // dependencias a propósito: es una función nueva en cada render de la
    // página, y meterla aquí dispararía el efecto sin que nada real cambiara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
}
