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

### ~~Ajustes~~ — hecho el 20 de agosto

Se eligió `Configuración v2` (el handoff volvió con ese archivo crecido de
16 a 43 KB, los otros tres sin tocar), y se acordó hacerla **dentro de la
app**: la maqueta dibuja una ventana propia de macOS —con sus semáforos, la
identidad de la iglesia y el pie de versión— pero eso ya lo lleva la barra
lateral, así que se tomó su lenguaje visual y no su cáscara.

El directorio de usuarios también se convirtió: lista con avatar,
nombre/correo, el rol en un desplegable de la propia fila y pie "+ / −".
Ojo con una cosa que la maqueta da por supuesta y no es así — dibuja el
desplegable con los roles de PERMISO de la app (Administrador / Tesorero /
Secretaria), pero ese directorio no controla el acceso y sus roles son los de
`ROLES_USUARIO`: tesorero, pastor, secretario, auditor, consejo, otro.

Los pies de nota también se hicieron, y no todos igual: donde hay una caja por
bloque (Acceso, Categorías) salen fuera, como en la maqueta; en Zona sensible,
donde las cuatro tarjetas están fundidas en una sola caja, se recogen al final
del grupo para que dejen de partir la lista de siete acciones; y en
Preferencias se quedan donde están, porque ahí cada uno explica el control que
tiene justo encima. Las tres ayudas de CAMPO de Iglesia (logo, EIN, saldo de
apertura) siguen bajo su control, que es lo que hace macOS.

De esa pantalla ya no queda nada pendiente.

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
