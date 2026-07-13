/** Indicador breve mientras llegan los datos al cambiar de mes/página —
 *  evita el salto brusco de "vacío" a "lleno" sin ninguna transición. */
export default function LoadingState() {
  return (
    <div className="loading-state">
      <span className="spinner" />
    </div>
  );
}
