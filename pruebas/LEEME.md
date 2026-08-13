# Banco de pruebas del gesto de deslizar

```
npx vite pruebas
```

y abrir `http://localhost:5173/gesto.html`.

Es una página suelta con **el hook de verdad**
(`src/components/useFilaDeslizable.ts`) sobre filas de mentira. Sirve para
probar el gesto sin compilar la app entera ni tener un iPhone delante: en el
navegador, con las herramientas de desarrollo en modo táctil, el arrastre se
comporta igual.

Las filas **1, 2 y 4** llevan borrado al deslizar —simulan las listas que
tienen "Deshacer"—; **la 3 no**, y sirve para comprobar que topa con la pared
en vez de borrarse.

No entra en ningún build: `vite build` solo empaqueta el `index.html` de la
raíz.

## Lo que se comprobó al escribirlo (11 ago 2026)

Con Playwright mandando eventos táctiles reales en una ventana de 390×700:

- Un arrastre en diagonal vertical **no** mueve la fila: es un scroll.
- 40 px no llegan al umbral y la fila vuelve sola a su sitio.
- Pasado el umbral se abre a 168 px, los dos botones enteros.
- Abrir una fila cierra la que estuviera abierta.
- Desde una fila abierta, arrastrar a la derecha la cierra **sin tener que
  recorrer todo el camino de vuelta**. Es lo que descubrió que hacía falta un
  umbral distinto para abrir y para cerrar: con uno solo, abrir costaba 67 px
  y cerrar 101, y la fila abierta se sentía pegajosa.
- Sin "Deshacer": el deslizamiento completo topa (se estira hasta 194 px y no
  más), nunca entra en modo borrar, y la fila sigue ahí después.
- Con "Deshacer": avisa antes de soltar, borra, y avisa al padre **una sola
  vez**.
