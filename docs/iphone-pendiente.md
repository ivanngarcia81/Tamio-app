# Lo que le falta a la versión de iPhone

> ## PUESTO AL DÍA el 29 de agosto de 2026 — y quedaban DOS, no siete
>
> Lo de abajo se escribió el 26 y en dos días envejeció: entraron unas cuatro
> tandas de la rama del móvil. Medido otra vez hoy, regla por regla:
>
> | Hueco del 26 | Hoy |
> |---|---|
> | Configuración | **hecho** — de 5 reglas a 12, las ocho zonas |
> | Las hojas (`ios-sheet`) | **hecho** — de 0 a 3 |
> | Actas | **empezado** — de 0 a 1 |
> | Ayuda | igual (9 de 18), y sigue sin urgencia |
> | **El Registro de la iglesia** | **PENDIENTE.** Sigue en 0 y 0 |
> | **Inicio de Secretaría** | **PENDIENTE.** Sigue en 0 y 0 |
>
> Y una **corrección de un error mío**, no del código: escribí que no se sabía
> qué eran las pantallas 9, 11, 12 y 16 del handoff, y que averiguarlo era «lo
> primero». Sí se sabía, y estaba en el mismo archivo que miré: no salen en la
> lista `PANTALLAS` porque se fotografían APARTE, después, con su estado
> abierto — `9-informe`, `11-cartas`, `12-cartas-editor`, `16-membresia`. Miré
> una lista y no el archivo entero, y de ahí saqué una alarma que no existía.
> No falta ninguna pantalla del handoff.
>
> **Así que la lista de verdad son dos pantallas**, las dos por el mismo
> motivo: nacieron DESPUÉS de que se dibujara el handoff, así que nunca
> tuvieron maqueta. Ninguna está rota —la capa `:root.movil` las sostiene—,
> pero se leen más «web» que sus vecinas.


---

## EL ENCARGO, listo para la rama del móvil

_Escrito el 29 de agosto de 2026. Son DOS pantallas y no hay que inventar un
sistema: hay que aplicarle a estas dos el que las otras catorce ya tienen._

Las dos comparten causa. **Nacieron después de que se dibujara el handoff**,
así que nunca tuvieron maqueta — y por eso se quedaron con las clases
genéricas mientras sus vecinas se convertían. No están rotas; se leen como una
página web al lado de catorce que parecen iOS.

### A · El Registro de la iglesia (`/inbox`)

Hoy pinta, dentro de un `.content` pelado:

```
.reg-nota      una .card con un textarea (la nota a mano)
.reg-lista
  .reg-dia     el separador de día
  .reg-fila    punto de color + cuerpo + meta (autor · hora)
  .reg-fila--nota   la barra izquierda que distingue lo tecleado
```

Sus 16 reglas no llevan prefijo de aparato: valen igual en Mac, iPad y
teléfono. **No hay que quitarlas**, hay que añadir la capa `:root.iphone`
encima, como se hizo con Movimientos.

Lo que el sistema ya resuelto sugiere, y queda a tu criterio:

- `.reg-lista` dentro de una `.ios-listcard`, y cada `.reg-fila` con el
  tratamiento de `.ios-txrow` (alto, inset de 16, hairline al ras).
- `.reg-dia` como `.ios-section-header` — versalitas, el mismo aire de 44
  entre grupos que ya se midió.
- La nota a mano: hoy es una `.card` con un textarea suelto. En el teléfono
  probablemente quiera ser una hoja, como el resto de lo que se escribe.

**Dos cosas que NO se pueden perder al convertir**, porque son la función y no
el adorno:

1. **El punto de color por área** (`.reg-punto--tesoreria` / `--secretaria` /
   `--general`). Es lo que deja ver de un vistazo de qué habla cada línea.
2. **La marca de la nota a mano** (`.reg-fila--nota`, barra a la izquierda).
   Sin ella, lo que escribió una persona se confunde con lo que anotó la app,
   y esto vuelve a ser el tablón del que veníamos — que es exactamente lo que
   se quiso evitar al retirar Mensajes.

### B · Inicio de Secretaría (`InicioSecretaria.tsx`)

Es la PORTADA de quien tiene rol de secretaria: lo primero que ve al abrir. Y
sigue en tarjetas de escritorio (`.card.pad-lg` con `.card-head`), con la lista
de próximas actividades en `.agenda-grupo` / `.agenda-fila`.

Ojo con la confusión que ya me tragué una vez: la pantalla de **Agenda** SÍ
está rehecha. Ésta es otra, comparte prefijo de clase y no es la misma.

El paralelo obvio es Inicio de Tesorería, que en esta misma rama se rehízo
tres veces hasta dar con las cuatro cifras en una tarjeta y el segmentado
abajo. Esta portada debería leerse como su hermana.

### Cómo comprobarlo

Las dos ya salen en la hoja de contactos —`20-inicio-secretaria` está; el
Registro habría que añadirlo a `PANTALLAS` en `capturas-iphone.mjs`—, y ahí es
donde se ve si son la misma app:

```
node pruebas/capturas-iphone.mjs
node pruebas/hoja-contactos.mjs
```

Y las dos reglas que miden ya existen: `medir-margenes.mjs` para que empiecen
en la misma línea que las demás, y `medir-ritmo.mjs` para el aire vertical.

### Lo único que puede romperse desde el motor

`npm run verificar-tipografia`. Si el CSS nuevo mete un `font-size: 15px` a
pelo, la guarda lo para antes de que llegue a la rama del motor. Todo tamaño
va con `calc(Npx * var(--fs-escala))` — incluido el de las cifras.


_Escrito el 26 de agosto de 2026, justo después de fusionar
`claude/mobile-handoff-redesign-x16x07` en la rama del motor (commit `2d2ebe3`)._

Iván preguntó si la versión del iPhone coincide con el motor. **El número sí**
—las tres ramas son el mismo commit y las cinco copias de la versión dicen
1.2.12—, pero el rediseño de iPhone se dibujó **antes** de que existieran las
últimas piezas del motor, y hay pantallas que se quedaron sin su pasada de
iOS 26.

Esto es esa lista. No es una lista de fallos: **nada de lo de aquí está roto**.
Todo funciona en el teléfono, porque debajo del rediseño sigue estando la capa
`:root.movil` de siempre. Lo que falta es el acabado.

---

## Cómo leer esto: hay TRES capas, no dos

```
:root.movil    330 reglas   la app funciona en un teléfono   (existía desde antes)
:root.iphone   377 reglas   el acabado iOS 26 del handoff    (lo nuevo)
:root.ipad     936 reglas   la tableta                       (otra historia)
```

Una pantalla con reglas `movil` y sin reglas `iphone` **se usa perfectamente**;
lo que pasa es que al lado de sus vecinas se lee más "web" y menos "iOS".

Y una advertencia para no perder el tiempo: **el maestro-detalle (`.md-*`) y el
editor de la carta (`.ce-*`) son EXCLUSIVOS del iPad** —151 y 19 reglas, todas
bajo `:root.ipad`, ninguna sin prefijo—. En el teléfono esas pantallas son
otras. No hay nada que portar ahí.

---

## 1. El Registro de la iglesia — lo más urgente

**Ruta `/inbox`. Reglas `:root.iphone`: 0. Reglas `:root.movil`: 0.**

Es la pantalla más nueva del motor (migración 50, 25 de agosto) y nació **dos
días después** de que la rama del iPhone se separara. Por eso no está ni en las
once pantallas del handoff ni en la lista de capturas.

Sus 16 reglas (`.reg-lista`, `.reg-dia`, `.reg-fila`, `.reg-punto`,
`.reg-fila--nota`…) son **genéricas, sin prefijo de aparato**. Eso tiene una
parte buena y una mala:

- **Buena**: en el teléfono se ve y funciona. La lista, los separadores por
  día, el punto de color del área y la barra de la nota a mano están todos ahí.
- **Mala**: no tiene el trato de tarjeta agrupada (`.ios-listcard`) ni los
  márgenes que el handoff dio a las otras once. Va a cantar al lado de ellas.

**Qué haría falta**: la misma pasada que recibieron Movimientos o Depósitos.
Probablemente `.reg-lista` dentro de una `ios-listcard`, las filas como
`.ios-listrow`, y el separador de día como `.ios-section-header`.

---

## 2. Configuración — y ahí viven tres cosas del motor

**Ruta `/configuracion`. Reglas `:root.iphone`: 5, de 302 reglas `settings`.**

Cinco de trescientas. Está prácticamente sin tocar, y no es una pantalla
cualquiera: dentro están **las tres últimas piezas que se le dieron motor**:

- el **tamaño de texto** (el segmentado chico/normal/grande),
- los **dos permisos del rol Tesorería**,
- los avisos de tesorería (sin comprobante, duplicados).

Es la pantalla donde un administrador toma decisiones, y en el teléfono es
donde peor se ve. **Yo la pondría por delante del Registro** si hay que elegir
una sola.

---

## 3. Actas — la única con una TABLA de verdad en el teléfono

**Ruta `/actas`. `data-table`: 185 reglas, 23 de `movil`, 0 de `iphone`.**

Actas es la única pantalla de la lista que sigue pintando una `data-table`
—una tabla de columnas— donde sus hermanas ya se convirtieron en filas
(`TxTable` pasó a `.ios-txrow`, `DepositoTable` igual).

Funciona: la capa `movil` lleva 23 reglas para que una tabla se lea en 393px.
Pero es exactamente la conversión que el handoff ya hizo dos veces, y aquí no
llegó.

---

## 4. Inicio de Secretaría

**`InicioSecretaria.tsx`. Reglas `:root.iphone`: 0. Reglas `:root.movil`: 0.**

Es la portada de quien tiene rol de secretaria: lo primero que ve al abrir la
app. Usa `.agenda-fila*` y `.agenda-grupo`, diez y cuatro reglas, **todas
genéricas**.

Ojo con la confusión: la pantalla de **Agenda** SÍ se rehízo
(`.agenda-mandos-ios`, los filtros a una hoja, el calendario visible sin
desplazar). La que no es esta otra, que comparte prefijo pero no es la misma.

---

## 5. Ayuda — a medias

**Ruta `/ayuda`. Reglas `:root.iphone`: 9, de 18.**

La mitad. No sé si el corte fue a propósito o se quedó ahí; conviene mirarla
antes de decidir si merece la otra mitad.

---

## 6. Las hojas (`ios-sheet`) — transversal, no es una pantalla

**7 reglas `:root.ipad`, 8 `:root.movil`, 0 `:root.iphone`.**

Las hojas son donde ocurren las operaciones: hacer un corte, recoger la segunda
firma, marcar un depósito, asignar un encargado. Tienen capa de teléfono desde
antes, pero ninguna del material iOS 26.

Es un arreglo de una sola vez que toca muchos sitios a la vez: el radio de 18,
el material de la barra y los márgenes del handoff aplicados a `.ios-sheet`
valdrían para todas ellas de golpe. **Es la mejor relación esfuerzo/resultado
de toda esta lista.**

---

## 7. Cuatro pantallas del handoff que ni siquiera se fotografían

La lista de capturas de `pruebas/capturas-iphone.mjs` lleva los números del
handoff, y **saltan**:

```
1 2 3 4 5 6 7 8 _ 10 _ _ 13 14 15 _ 17
              9     11 12          16
```

Faltan la **9**, la **11**, la **12** y la **16**. No sé qué son —la guía del
handoff (`rediseno-iphone/GUIA.md`) y las maquetas
(`Tamio iPhone iOS26.dc.html`) **no están en el repositorio**, así que desde
aquí no se puede saber—. Puede que estén hechas y sin capturar, o que no estén
hechas. **Es lo primero que hay que averiguar**, porque cambia el tamaño de
todo lo demás.

---

## El orden que yo seguiría

1. **Averiguar qué son la 9, 11, 12 y 16.** Es lo único que puede cambiar el
   tamaño de la lista, y se resuelve mirando la guía del handoff.
2. **Las hojas (`ios-sheet`).** Un arreglo, muchas pantallas.
3. **Configuración.** Donde vive lo último que se construyó y donde peor se ve.
4. **El Registro.** La pantalla más nueva y la única sin ninguna capa.
5. **Actas.** La conversión de tabla a filas que ya se hizo dos veces.
6. **Inicio de Secretaría.** Es una portada; se mira todos los días.
7. **Ayuda.** La otra mitad, si merece la pena.

---

## Antes de tocar nada: mírelo

No hace falta un iPhone para ver cómo está hoy:

```
node pruebas/capturas-iphone.mjs
```

Fotografía la app real a 393×852 —el iPhone 15/16 Pro, el mismo lienzo de las
maquetas— **en claro y en oscuro**, y deja las imágenes en `pruebas/capturas/`,
que no entra en git. Trece pantallas, más Informes, Cartas, Membresía y Agenda
con sus estados abiertos.

Esta lista dice qué le falta a cada una; las capturas dicen **cuánto**. Con las
dos cosas delante, la decisión de por dónde empezar deja de ser una corazonada.

## Y una regla que ahora se aplica sola

La rama del iPhone ya trae `npm run verificar-tipografia`. Si el diseño nuevo
mete un `font-size: 15px` a pelo, la guarda lo para antes de que llegue a la
rama del motor. No es un estorbo: es lo que evitó que las 888 líneas de CSS de
esta fusión rompieran el tamaño de texto que Iván puede cambiar en Ajustes.
