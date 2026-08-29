# El Registro de la iglesia — tres encargos, uno por aparato

_29 de agosto de 2026. Para pasar a tres chats de diseño trabajando en
paralelo: uno de iPhone, uno de iPad y uno de Mac._

Los tres prompts de abajo se copian **enteros y tal cual**. Cada uno es
autosuficiente: el chat que lo reciba no habrá visto esta conversación.

---

## Por qué van separados, y qué los hace seguros en paralelo

Tamio tiene **cuatro capas de CSS**, una por aparato, y **ninguna regla se
comparte**:

```
:root.mac      508 reglas
:root.ipad     941 reglas
:root.iphone   944 reglas
:root.movil    363 reglas   ← la base que hace que funcione en un teléfono
```

Los tres chats van a tocar el **mismo archivo** (`src/styles.css`, 22 790
líneas). Eso no es un problema **si y solo si** cada uno escribe únicamente
dentro de su prefijo: git fusiona sin conflicto añadidos en zonas distintas, y
lo hemos hecho ya media docena de veces esta semana.

Por eso cada prompt lleva la misma prohibición en mayúsculas. **Si un chat
toca la capa de otro, la fusión se convierte en un conflicto a mano y alguien
pierde trabajo.**

---

# PROMPT 1 — iPhone

```
Trabajas en la rama `claude/mobile-handoff-redesign-x16x07` del repositorio
Tamio (tesorería para iglesias, Tauri 2 + React 19 + TypeScript). Antes de
nada: `git pull origin claude/mobile-handoff-redesign-x16x07` y luego trae lo
último del motor con `git merge origin/main` — hay trabajo nuevo que no
tienes.

## Qué hay que hacer

Diseñar **el Registro de la iglesia** para iPhone. Es la ruta `/inbox`, el
archivo `src/pages/Registro.tsx`.

Es la ÚNICA pantalla de la app sin diseño de aparato: sus clases `.reg-*`
tienen CERO reglas en `:root.mac`, `:root.ipad`, `:root.iphone` y
`:root.movil`. No está rota —se ve y funciona con el estilo base— pero al lado
de sus catorce vecinas se lee como una página web y ellas parecen iOS.

Nació de una frase del dueño el 25 de agosto («la página de mensajes debería
ser otra función; ya las personas tienen WhatsApp e iMessage») y sustituyó a
Mensajes. Por eso no está en ningún handoff: se dibujó el chat, no lo que vino
después.

## Qué ES la pantalla

El diario de la iglesia: **lo que ha pasado**, escrito solo por la app. Diez
tipos de apunte:

  De tesorería   movimiento eliminado · corte entregado · corte depositado ·
                 segunda firma · descuadre
  De secretaría  cambio de estado de un miembro · baja del padrón ·
                 carta emitida · acta cerrada
  General        la NOTA A MANO, lo único que escribe una persona

No confundir con «Por revisar» (`/bandeja`): aquélla dice qué te FALTA por
hacer y se vacía al resolver; ésta dice qué HA PASADO y no se vacía nunca.

Cada quien ve lo de su área: el tesorero lo del dinero, la secretaria lo del
padrón, el administrador todo.

## Lo que hay hoy en el marcado

    .reg-nota          tarjeta con un textarea, para escribir una nota
    .reg-lista
      .reg-dia         separador de día
      .reg-fila        punto de color + cuerpo + meta (autor · hora)
      .reg-fila--nota  igual, con una barra a la izquierda
      .reg-punto--tesoreria / --secretaria / --general

## DOS COSAS QUE NO SE PUEDEN PERDER

Son la función, no el adorno. Si el rediseño las borra, no sirve:

1. **El punto de color por área.** Es lo que deja ver de un vistazo de qué
   habla cada línea, y va ligado a quién puede verla.
2. **La marca de la nota a mano.** Sin algo que distinga lo que escribió una
   persona de lo que anotó la app, la pantalla vuelve a ser el tablón del que
   veníamos — que es exactamente lo que se quiso evitar al retirar Mensajes.

Puedes cambiar CÓMO se distinguen (la barra izquierda no es sagrada). Lo que
no puede es dejar de distinguirse.

## Reglas del repositorio

- **ESCRIBE SOLO DENTRO DE `:root.iphone`.** Hay otros dos chats trabajando a
  la vez en `:root.ipad` y `:root.mac`, en este mismo archivo. Si tocas su
  capa, la fusión se convierte en un conflicto a mano y alguien pierde
  trabajo. Las reglas genéricas `.reg-*` que ya existen NO se tocan ni se
  borran: se les añade la capa de iPhone encima.
- **Todo tamaño de texto va con la escala.** `font-size: calc(15px *
  var(--fs-escala))`, nunca `font-size: 15px`. Hay un ajuste de tamaño de
  letra en Ajustes y esto es lo que lo hace funcionar. Lo vigila
  `npm run verificar-tipografia`, que falla el build si se te escapa uno.
- **Comentarios, commits y textos de interfaz en ESPAÑOL.**
- El vocabulario ya resuelto está en `.ios-listcard`, `.ios-txrow`,
  `.ios-section-header`, `SeccionIOS`. Míralo en `src/pages/Movimientos.tsx` o
  `src/pages/Depositos.tsx`, que son las conversiones más parecidas.

## Cómo se comprueba

    node pruebas/capturas-iphone.mjs     # fotografía la app real a 393×852
    node pruebas/hoja-contactos.mjs      # junta las capturas en UNA imagen

La hoja de contactos es la prueba de verdad: una pantalla a la vez enseña si
ESA está bien; las 38 juntas enseñan si son la misma app. **Añade el Registro
a la lista `PANTALLAS` de `capturas-iphone.mjs`**, que hoy no está.

Y antes de dar por bueno:

    npm run verificar-tipografia
    npx tsc --noEmit
    node pruebas/medir-margenes.mjs      # ¿empieza todo en la misma línea?
    node pruebas/medir-ritmo.mjs         # el aire vertical

## Una pregunta que decides tú

La nota a mano hoy es una tarjeta con un textarea suelto en medio de la lista.
En el teléfono probablemente quiera ser una hoja, como el resto de lo que se
escribe. Tú decides; si la cambias, dilo en el commit.
```

---

# PROMPT 2 — iPad

```
Trabajas en la rama `claude/charming-sagan-hknqp1` del repositorio Tamio
(tesorería para iglesias, Tauri 2 + React 19 + TypeScript). Antes de nada:
`git pull origin claude/charming-sagan-hknqp1` y luego trae lo último del
motor con `git merge origin/main` — esa rama lleva días parada y hay mucho
trabajo nuevo.

## Qué hay que hacer

Diseñar **el Registro de la iglesia** para iPad. Es la ruta `/inbox`, el
archivo `src/pages/Registro.tsx`.

Es la ÚNICA pantalla de la app sin diseño de aparato: sus clases `.reg-*`
tienen CERO reglas en `:root.mac`, `:root.ipad`, `:root.iphone` y
`:root.movil`. No está rota —se ve y funciona con el estilo base— pero al lado
de sus vecinas, que sí recibieron el handoff, se lee como una página web.

Nació de una frase del dueño el 25 de agosto («la página de mensajes debería
ser otra función; ya las personas tienen WhatsApp e iMessage») y sustituyó a
Mensajes. Los tres handoffs de iPad dibujaron Mensajes; nadie dibujó lo que
vino después.

## Qué ES la pantalla

El diario de la iglesia: **lo que ha pasado**, escrito solo por la app. Diez
tipos de apunte:

  De tesorería   movimiento eliminado · corte entregado · corte depositado ·
                 segunda firma · descuadre
  De secretaría  cambio de estado de un miembro · baja del padrón ·
                 carta emitida · acta cerrada
  General        la NOTA A MANO, lo único que escribe una persona

No confundir con «Por revisar» (`/bandeja`): aquélla dice qué te FALTA por
hacer y se vacía al resolver; ésta dice qué HA PASADO y no se vacía nunca.

Cada quien ve lo de su área: el tesorero lo del dinero, la secretaria lo del
padrón, el administrador todo.

## Lo que hay hoy en el marcado

    .reg-nota          tarjeta con un textarea, para escribir una nota
    .reg-lista
      .reg-dia         separador de día
      .reg-fila        punto de color + cuerpo + meta (autor · hora)
      .reg-fila--nota  igual, con una barra a la izquierda
      .reg-punto--tesoreria / --secretaria / --general

## DOS COSAS QUE NO SE PUEDEN PERDER

Son la función, no el adorno. Si el rediseño las borra, no sirve:

1. **El punto de color por área.** Es lo que deja ver de un vistazo de qué
   habla cada línea, y va ligado a quién puede verla.
2. **La marca de la nota a mano.** Sin algo que distinga lo que escribió una
   persona de lo que anotó la app, la pantalla vuelve a ser el tablón del que
   veníamos — que es exactamente lo que se quiso evitar al retirar Mensajes.

Puedes cambiar CÓMO se distinguen. Lo que no puede es dejar de distinguirse.

## LA DECISIÓN DE FONDO, que es tuya

El iPad usa **maestro-detalle** en seis pantallas: lista a la izquierda, panel
a la derecha (`.md-split`, `.md-fila`, y `DetalleMovimiento` como ejemplo de
panel). La pregunta es si el Registro entra en ese patrón o no.

Argumento para que NO: una línea del registro **no tiene detalle que abrir**.
«Se eliminó el movimiento X de $8,500 (folio 2026-0042)» ya lo dice todo; un
panel a la derecha se quedaría vacío o repitiendo la misma frase más grande.

Argumento para que SÍ: la coherencia con sus vecinas, y que un panel podría
enseñar el objeto del que habla el apunte.

Lo segundo tiene un problema real que conviene que sepas: el registro guarda
**instantáneas, no referencias** — el nombre y el folio tal como eran, a
propósito, para que siga diciendo la verdad cuando la fila de la que habla ya
no exista. Así que «abrir el movimiento» a veces no lleva a ninguna parte.

Decide y déjalo escrito en el commit. Una lista a lo ancho de la columna de
lectura es una respuesta perfectamente buena.

## Reglas del repositorio

- **ESCRIBE SOLO DENTRO DE `:root.ipad`.** Hay otros dos chats trabajando a la
  vez en `:root.iphone` y `:root.mac`, en este mismo archivo. Si tocas su
  capa, la fusión se convierte en un conflicto a mano y alguien pierde
  trabajo. Las reglas genéricas `.reg-*` que ya existen NO se tocan ni se
  borran: se les añade la capa de iPad encima.
- **Todo tamaño de texto va con la escala.** `font-size: calc(15px *
  var(--fs-escala))`, nunca `font-size: 15px`. Hay un ajuste de tamaño de
  letra en Ajustes y esto es lo que lo hace funcionar. Lo vigila
  `npm run verificar-tipografia`, que falla el build si se te escapa uno.
- **Comentarios, commits y textos de interfaz en ESPAÑOL.**
- La columna de lectura del iPad tiene tope de 680 px; míralo en
  `docs/ipad-rediseno.md`.

## Cómo se comprueba

    CHROMIUM=/opt/pw-browsers/chromium node pruebas/arnes-ipad.mjs

Son ~1116 comprobaciones sobre la app real en un iPad simulado, y tienen que
quedar TODAS en verde. Si añades comprobaciones para el Registro, pruébalas
rompiendo el código a propósito: una comprobación que nunca se ha puesto en
rojo no comprueba nada.

Y antes de dar por bueno:

    npm run verificar-tipografia
    npx tsc --noEmit
```

---

# PROMPT 3 — Mac

```
Trabajas en el repositorio Tamio (tesorería para iglesias, Tauri 2 + React 19
+ TypeScript). Crea una rama nueva desde `main` para este trabajo:

    git fetch origin && git checkout -b claude/registro-mac origin/main

## Qué hay que hacer

Diseñar **el Registro de la iglesia** para macOS. Es la ruta `/inbox`, el
archivo `src/pages/Registro.tsx`.

Es la ÚNICA pantalla de la app sin diseño de aparato: sus clases `.reg-*`
tienen CERO reglas en `:root.mac`, `:root.ipad`, `:root.iphone` y
`:root.movil`. No está rota —se ve y funciona con el estilo base— pero no
recibió la pasada del handoff «Tamio App macOS native» que sí recibieron sus
vecinas.

Nació de una frase del dueño el 25 de agosto («la página de mensajes debería
ser otra función; ya las personas tienen WhatsApp e iMessage») y sustituyó a
Mensajes. El handoff de macOS dibujó Mensajes; nadie dibujó lo que vino
después.

## Qué ES la pantalla

El diario de la iglesia: **lo que ha pasado**, escrito solo por la app. Diez
tipos de apunte:

  De tesorería   movimiento eliminado · corte entregado · corte depositado ·
                 segunda firma · descuadre
  De secretaría  cambio de estado de un miembro · baja del padrón ·
                 carta emitida · acta cerrada
  General        la NOTA A MANO, lo único que escribe una persona

No confundir con «Por revisar» (`/bandeja`): aquélla dice qué te FALTA por
hacer y se vacía al resolver; ésta dice qué HA PASADO y no se vacía nunca.

Cada quien ve lo de su área: el tesorero lo del dinero, la secretaria lo del
padrón, el administrador todo.

## Lo que hay hoy en el marcado

    .reg-nota          tarjeta con un textarea, para escribir una nota
    .reg-lista
      .reg-dia         separador de día
      .reg-fila        punto de color + cuerpo + meta (autor · hora)
      .reg-fila--nota  igual, con una barra a la izquierda
      .reg-punto--tesoreria / --secretaria / --general

## DOS COSAS QUE NO SE PUEDEN PERDER

Son la función, no el adorno. Si el rediseño las borra, no sirve:

1. **El punto de color por área.** Es lo que deja ver de un vistazo de qué
   habla cada línea, y va ligado a quién puede verla.
2. **La marca de la nota a mano.** Sin algo que distinga lo que escribió una
   persona de lo que anotó la app, la pantalla vuelve a ser el tablón del que
   veníamos — que es exactamente lo que se quiso evitar al retirar Mensajes.

Puedes cambiar CÓMO se distinguen. Lo que no puede es dejar de distinguirse.

## Lo propio del Mac

Es la única plataforma con ventana redimensionable, teclado y ratón. Cosas que
en el teléfono no se plantean y aquí sí:

- **Anchura.** La ventana puede ser muy ancha. Una línea de texto a 2000 px de
  ancho no se lee; el resto de la app resuelve esto con columna de lectura.
- **El puntero.** Hay estado `:hover`, que en iOS no existe.
- **Densidad.** En el Mac se ven muchas más filas de golpe, y ahí una lista de
  cien apuntes puede necesitar algo que en el teléfono no hacía falta.
- **Teclado.** Si añades atajos, mira antes `scripts/verificar-hooks.mjs` y
  el menú nativo en `src-tauri/src/lib.rs`.

## Reglas del repositorio

- **ESCRIBE SOLO DENTRO DE `:root.mac`.** Hay otros dos chats trabajando a la
  vez en `:root.iphone` y `:root.ipad`, en este mismo archivo. Si tocas su
  capa, la fusión se convierte en un conflicto a mano y alguien pierde
  trabajo. Las reglas genéricas `.reg-*` que ya existen NO se tocan ni se
  borran: se les añade la capa de Mac encima.
- **Todo tamaño de texto va con la escala.** `font-size: calc(15px *
  var(--fs-escala))`, nunca `font-size: 15px`. Hay un ajuste de tamaño de
  letra en Ajustes y esto es lo que lo hace funcionar. Lo vigila
  `npm run verificar-tipografia`, que falla el build si se te escapa uno.
- **Comentarios, commits y textos de interfaz en ESPAÑOL.**

## Cómo se comprueba

    npm run verificar-tipografia
    npx tsc --noEmit
    npm run build

No hay arnés de Mac: el arnés existente simula iPad e iPhone. Si te parece que
hace falta uno, dilo, pero no lo montes sin pedirlo — es una decisión del
dueño, no del encargo.
```

---

## Después, para quien fusione

Las tres ramas se traen a `claude/motor-botones-ipad-rymuod` una por una, y en
cada fusión se corre la tanda entera: `npx tsc --noEmit`, las nueve
verificaciones `verificar-*`, el build del canal appstore y el arnés del iPad.

Y una comprobación que esta semana ha cazado cosas dos veces: después de
fusionar, buscar en el bundle compilado las **cadenas** de los dos lados
—nunca nombres de función, que el minificador renombra— para confirmar que la
fusión no se comió ninguno.
