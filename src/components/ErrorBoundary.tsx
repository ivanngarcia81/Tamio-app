import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Red de seguridad para errores de pintado.
 *
 * Sin esto, cualquier excepción al renderizar desmonta el árbol entero y deja
 * **una ventana en blanco con el color de fondo**: ni mensaje, ni pista, ni
 * forma de saber qué pasó. En una app de escritorio empaquetada tampoco hay
 * consola a mano, así que el usuario solo puede decir "se puso en blanco" y
 * nosotros solo podemos adivinar.
 *
 * Aquí se muestra el error, dónde ocurrió y un botón para reintentar. No
 * arregla el fallo: lo hace visible, que es la diferencia entre diagnosticar en
 * un minuto y diagnosticar a ciegas.
 *
 * Texto en español fijo, sin i18n: si lo que falló fuera el propio i18n, una
 * pantalla de error que depende de i18n tampoco se vería.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componente: string | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componente: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Queda también en la consola de `tauri dev`, con la pila completa.
    console.error("Error al pintar la aplicación:", error, info.componentStack);
    this.setState({ componente: info.componentStack ?? null });
  }

  render(): ReactNode {
    const { error, componente } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="pantalla-error">
        <h2>Algo falló al mostrar esta pantalla</h2>
        <p>
          Tus datos no se han perdido: el fallo es al dibujar, no al guardar.
          Copia este texto y pásalo por el chat para que se pueda arreglar.
        </p>
        <pre>{error.message || String(error)}</pre>
        {componente && <pre className="pantalla-error-pila">{componente.trim()}</pre>}
        <div className="pantalla-error-acciones">
          <button className="btn primary" onClick={() => window.location.reload()}>
            Reintentar
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(
                `${error.message}\n\n${error.stack ?? ""}\n\n${componente ?? ""}`
              );
            }}
          >
            Copiar el error
          </button>
        </div>
      </div>
    );
  }
}
