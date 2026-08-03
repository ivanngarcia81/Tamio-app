import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/**
 * Monta sus hijos directamente en <body>, fuera del árbol donde se declaran.
 *
 * Existe por un fallo real de WebKit: un `position: fixed` dentro de un
 * contenedor con columnas CSS (`.settings-masonry`) se PINTA en un sitio pero
 * los clics se calculan en otro — el diálogo de restaurar se veía centrado y
 * el mouse tocaba lo que estaba detrás. En Chromium no pasa, por eso las
 * pruebas allí no lo veían. Igual que hacen RowMenu/HeaderMenu/ContextMenu
 * con sus menús, la salida es colgar el overlay de <body>, donde ningún
 * ancestro con columnas o transform puede capturarlo.
 */
export default function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
