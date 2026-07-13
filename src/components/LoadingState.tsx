/** Skeleton de carga genérico: imita una fila de tarjetas y unas filas de
 *  tabla mientras llegan los datos, en lugar de dejar la pantalla vacía o
 *  mostrar un spinner. Los bloques usan los mismos tokens de superficie
 *  del tema, así que funcionan igual en claro y oscuro. */
export default function LoadingState() {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="skeleton-cards">
        {[0, 1, 2, 3].map((i) => (
          <div className="skeleton-card" key={i}>
            <div className="skeleton skeleton-line w40" />
            <div className="skeleton skeleton-line lg w60" />
          </div>
        ))}
      </div>
      <div className="skeleton-table">
        {[0, 1, 2, 3, 4].map((i) => (
          <div className="skeleton-row" key={i}>
            <div className="skeleton skeleton-line w15" />
            <div className="skeleton skeleton-line w30" />
            <div className="skeleton skeleton-line w20" />
            <div className="skeleton skeleton-line w10" />
          </div>
        ))}
      </div>
    </div>
  );
}
