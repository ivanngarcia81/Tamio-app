# Las maquetas que faltan

_29 de agosto de 2026. Escrito para pasárselo a Claude Design tal cual._

Medido contra el código, clase por clase, no de memoria. El método está al
final por si alguien quiere repetirlo dentro de un mes.

---

## Antes de nada: hay DOS maquetas, no una

Tamio no tiene un diseño; tiene dos, hechos por separado y sin una regla en
común. Cada bloque va prefijado a su aparato para que el otro no vea ninguna:

| Entrega | Qué cubrió | Su CSS |
|---|---|---|
| **Handoffs 1, 2 y 3** | las 16 pantallas del iPad, Membresía, Informes, Depósitos | `:root.ipad` — **936 reglas** |
| **«Tamio app rediseño iOS nativo»** (iOS 26) | 17 pantallas de iPhone | `:root.iphone` — **~600 reglas** |

Debajo de las dos hay una tercera capa, `:root.movil` (330 reglas), que es la
que hace que la app **funcione** en un teléfono desde antes de cualquier
rediseño. Por eso nada de esta lista está roto: lo que falta es el acabado.

**Consecuencia para quien lea esta lista:** que algo esté dibujado para el
iPhone no lo deja dibujado para el iPad, ni al revés. Los tres encargos de
abajo dicen para qué aparato es cada uno.

---

## 1 · El Registro de la iglesia — para los DOS aparatos

**La única pantalla de la app sin diseño en ningún sitio.** Sus ocho clases
propias dan cero en las tres capas:

```
reg-lista   ipad:0  iphone:0  movil:0
reg-fila    ipad:0  iphone:0  movil:0
reg-dia     ipad:0  iphone:0  movil:0
reg-nota    ipad:0  iphone:0  movil:0
reg-punto   ipad:0  iphone:0  movil:0
```

**Por qué se quedó fuera:** no salió de un handoff. Salió de una frase de Iván
el 25 de agosto — *«la página de mensajes debería ser otra función, no de
recibir mensajes como si fuera un chat; ya las personas tienen WhatsApp e
iMessage»*. Los tres handoffs de iPad dibujaron **Mensajes**, y el de iPhone
también. Nadie ha dibujado nunca lo que lo sustituyó.

### Qué es la pantalla

No es una bandeja de entrada y no es una lista de tareas. Es **lo que ha
pasado en la iglesia**, escrito solo por la app. Nueve sucesos: un movimiento
eliminado, un corte entregado, un corte depositado, una segunda firma, un
descuadre, un cambio de estado en el padrón, una baja, una carta emitida, un
acta cerrada. Más las **notas a mano** que escribe una persona.

No confundir con la **Bandeja** («Por revisar»): aquella dice qué te FALTA por
hacer; ésta, qué HA PASADO.

### Lo que hay hoy

```
.reg-nota          una tarjeta con un textarea (escribir una nota)
.reg-lista
  .reg-dia         separador de día
  .reg-fila        · punto de color + cuerpo + meta (autor · hora)
  .reg-fila--nota  · lo mismo, con una barra a la izquierda
```

### DOS COSAS QUE NO SE PUEDEN PERDER

No son adorno; son la función:

1. **El punto de color por área** — `tesoreria`, `secretaria`, `general`. Es
   lo que deja ver de un vistazo de qué habla cada línea, y va ligado a quién
   puede verla: el tesorero no ve lo del padrón.
2. **La marca de la nota a mano** — hoy una barra a la izquierda. Sin algo que
   distinga lo que escribió una persona de lo que anotó la app, la pantalla
   **vuelve a ser el tablón del que veníamos**, que es justo lo que se quiso
   evitar al retirar Mensajes.

### Dos preguntas de diseño, sinceras

- En el **iPad**, ¿es una lista a lo ancho, o entra en el maestro-detalle como
  sus vecinas? Una línea del registro no tiene "detalle" que abrir, así que
  quizá no.
- La **nota a mano** hoy es una tarjeta con un textarea suelto en medio de la
  lista. En el teléfono probablemente quiera ser una hoja, como todo lo demás
  que se escribe.

---

## 2 · Inicio de Secretaría — solo para iPad

**El teléfono lo tiene; la tableta no.** Sus clases propias:

```
iPhone:  60 reglas     iPad:  0 reglas
```

Es la **portada** de quien tiene rol de secretaria: lo primero que ve al abrir
la app, en cualquier aparato. En el teléfono se rehízo (commit `0c8f8ee`, «la
portada de Secretaría»); en el iPad se quedó con tarjetas de escritorio.

Su hermana, el Inicio de Tesorería, se rehízo **tres veces** en la rama del
móvil hasta dar con las cuatro cifras en una tarjeta y el segmentado abajo.
Esta portada debería leerse como ella, y en el iPad no lo hace.

---

## 3 · La cabecera de marca — solo para iPad

```
area-cabecera:   iPhone:  5 reglas     iPad:  0 reglas
```

La banda verde con la rueda y el nombre del área. Es **identidad de la app**,
y el iPad no la tiene.

**Puede que sea a propósito** y por eso va como pregunta y no como encargo: el
iPad tiene barra lateral, y ahí el área ya se ve. Si la respuesta es «no hace
falta», mejor que quede escrito que dejarlo en el aire.

---

## 4 · «Devolver» deslizando — revisión, no encargo

Construido el 29 de agosto **sin maqueta**: lo decidí yo. Funciona y está
probado, pero es criterio de quien escribe el motor, no de quien diseña.

En la Bandeja del teléfono, deslizar una fila hacia la izquierda descubre
«Devolver al tesorero». Va en el gesto y no en un segundo botón
redondo —que cabría— porque devolver le rebota a alguien su trabajo, y dos
círculos idénticos a 44 px lo convierten en un resbalón del pulgar.

El botón revelado va en **ámbar**, no en rojo: el rojo es para borrar, lo que
se va y no vuelve. Devolver no destruye nada.

**Lo que se pide:** una mirada. Si el gesto está bien elegido, si el ámbar es
el correcto, y si «Devolver al tesorero» cabe y se lee en 393 px.

---

## Lo que NO necesita maqueta todavía

- **Los siete puntos de `docs/plan-1-4.md`** — son alcance, no pantallas. Se
  dibujan cuando se decida cuáles entran.
- **La conciliación bancaria** — no se puede dibujar sin saber qué exporta el
  banco. Primero el archivo, después la pantalla.

---

## Cómo se midió, por si hay que repetirlo

Contando reglas de CSS por clase, y **solo las clases propias** de cada
pantalla — las que aparecen en uno o dos archivos, no `btn` o `content`, que
están en todas y engordan cualquier cuenta hasta que parece que todo está
hecho.

```bash
# Para una clase:
grep -cE ":root\.ipad[^{]*\.reg-fila\b"   src/styles.css
grep -cE ":root\.iphone[^{]*\.reg-fila\b" src/styles.css
```

Y **mirar el archivo entero, no un marcador**. El 29 de agosto di dos falsas
alarmas por esto: dije que Inicio de Secretaría estaba sin hacer porque busqué
una clase residual, y dije que faltaban cuatro pantallas del handoff porque
miré una lista y no el resto del archivo que las tenía. Las dos veces la
pantalla estaba bien y el que medía mal era yo.
