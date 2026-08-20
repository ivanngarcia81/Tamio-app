# Lo que queda del rediseño de macOS

_Escrito el 20 de agosto de 2026, al cerrar las ocho piezas del handoff
`Tamio App macOS native` de Claude Design._

Las doce pantallas están convertidas. Esto es lo que **no** está: primero lo
que hay que mirar en la Mac de verdad, luego lo que falta por hacer.

---

## 1. Mirar esto primero, en la Mac

Todo lo demás del rediseño se midió con las páginas de verdad en un arnés de
Playwright. **Estas cuatro piezas no.** El arnés monta las páginas contra un
stub de SQL, y a estas no supe darles los datos en la forma que esperan: en el
arnés salen vacías, con el mensaje de "aún no hay suficientes datos". Así que
su maquetación **no está verificada** y es lo primero que conviene abrir.

| Dónde | Qué mirar |
|---|---|
| Inicio | "Ingresos vs. gastos" — las barras por semana |
| Inicio | "Evolución del balance" — el área de 30 días |
| Reportes | "Distribución de gastos" — la dona y su leyenda |
| Reportes | "Distribución de ingresos" — la dona y su leyenda |

Qué se le cambió alrededor y puede haberlas afectado: las tarjetas que las
contienen pasaron de 18/20/14 px de relleno a 12/14, y el panel gris que las
envolvía (`.dash-canvas`) perdió sus 28 px. Si algo se ve apretado o cortado,
es por ahí.

---

## 2. Falta por hacer

### ~~Botón de ocultar la barra lateral~~ — hecho el 20 de agosto

Está en el shell (`App.tsx`, clase `.btn-sidebar`), con ⌃⌘S y la preferencia
guardada por dispositivo. Lo único que conviene comprobar en la Mac de verdad:
**que el botón no se meta debajo de los semáforos** cuando la barra está
escondida. Se corre de 232 a 78 px para dejarlos pasar, y 78 sale de dónde los
dibuja el sistema (x≈20/40/60) — si tu macOS los pinta en otro sitio, ese
número es el que hay que mover.

### Ajustes

Queda fuera a propósito — se acordó que iba aparte. El handoff trae DOS
diseños para esto:

- `Tamio Mac - App completa.dc.html`, bloque `esAjustes` (~300 líneas):
  índice de zonas a la izquierda, una zona a la vez a la derecha.
- `Tamio Mac - Configuración v2.dc.html` (16 KB): la segunda versión, con el
  lenguaje de Ajustes del Sistema de macOS — barra lateral con buscador e
  iconos tintados, y filas agrupadas en el panel derecho.

**Hay que elegir cuál**, no son compatibles entre sí.

### El cuerpo gris de los modales

El mockup pinta el cuerpo del modal en gris con los campos agrupados en
tarjetas blancas. Se dejó blanco a propósito: el gris solo funciona cuando
TODOS los grupos son tarjetas, y nuestros modales mezclan `.form-group`
sueltos con rejillas de dos columnas y algún `.form-subcard`. Reagruparlos es
trabajo de marcado en siete modales, no de hoja de estilos.

---

## 3. Lo que quedó pendiente del iPhone

De antes del rediseño de Mac, sin tocar:

### Formularios que en el iPhone siguen siendo modales de escritorio

`PlantillaModal` (8 campos), `EditRecurrenteModal` (6), `settings/UsuarioModal`
(5), `BajaMemberModal` (3).

### Pantallas de lectura para las que pedí una maqueta antes de tocarlas

`GenericCsvImportModal`, `MemberDetailModal`, `SeguimientoModal`,
`PerfilModal`, `FusionarMiembroModal`, `ActividadDetalle`, `AlcanceDialog`.

### Siete campos que se desbordan solo a 320 px

Medidos y no corregidos — a 375 px entran todos:

- Culto: "Dirigió el culto", "Título del mensaje", "Texto bíblico principal",
  "Maestro(a) de la clase"
- Traslado de entrada: "Nombre completo", "Correo electrónico"
- Agenda: "Ministerio / departamento"

---

## 4. Bugs que salieron al medir, ya corregidos

Se apuntan porque son el tipo de cosa que vuelve si alguien deshace un cambio
sin saber por qué estaba:

| Qué pasaba | Dónde quedó |
|---|---|
| La columna del concepto en Ingresos/Gastos se dibujaba a **0 px** en ventanas por debajo de ~1400 | `TxTable.tsx`, `COLS_MAC` |
| Un `useState` por debajo de la puerta de sesión tumbaba la app entera (React #310) | `App.tsx`, y `npm run verificar-hooks` para que no vuelva |
| En Actas, "Pendiente de aprobación" partía en dos y esa fila medía 54 px en vez de 34 | `Actas.tsx`, `COLS_MAC` + `nowrap` en los chips de tabla |
| La pastilla de categoría de "Mayor gasto" se estiraba de lado a lado | `.stat-card > .tag { align-self: flex-start }` |
| Miembros tenía una cabecera de tabla vacía de 17 px | el `:has(> .search-input-wrap:only-child)` del bloque de lienzo |
| "Nueva actividad" se salía del botón, y a 1024 px la toolbar de Agenda se desbordaba 60 px | `nowrap` en los botones y `min-width: 0` en `.header-actions` |
