# Bitácora — 1 y 2 de agosto de 2026

Qué se hizo mientras Apple revisaba la 1.0, por qué, y qué queda.

**50 commits en `main`. 82 archivos, +3957 / −766 líneas.**
Ningún build subido. `version.json` sin tocar. La 1.0 (build 1.0.8) sigue en
revisión y nada de esto se ha publicado.

---

## 1. Lo que se arregló, agrupado por lo que importa

### 1.1 Cosas que daban un número equivocado

**Un depósito podía no contar en ningún total.** Los totales suman por
*período*, no por fecha, y los dos campos pueden diferir a propósito (depositar
en agosto el dinero de julio). Cuando diferían sin querer, el depósito
desaparecía de los totales del mes y nadie se enteraba. Ahora se avisa al
escribirlo, la fila lo dice cuando difiere, y la tarjeta de resumen nombra el
período. Se mantiene la posibilidad de que difieran: es un caso legítimo.

**La tarjeta "diezmadores" contaba etiquetas, no diezmos.** Contaba miembros con
la etiqueta "diezmador" puesta a mano el día del alta, que nadie mantiene
después. Ahora cuenta a quien tiene al menos un ingreso de categoría diezmo en
el año, y el rótulo lo dice.

**El dinero se mostraba con un solo decimal.** `10.50` salía como `$10.5`, lo que
además descuadraba la columna. Siempre dos decimales, en pantalla y en PDF.

**Los importes de los PDF estaban fijos en formato de EE. UU.** Un estado
financiero de una iglesia en España o Colombia salía `1,250.50` en vez de
`1.250,50`. En pantalla el formato sigue al dispositivo (es tu app); en el PDF
sigue al **país de la iglesia**, porque el documento se imprime y se entrega. El
separador se deduce de la moneda configurada, no del campo "País", que es texto
libre del que no se puede deducir nada.

### 1.2 Riesgos de seguridad

**La app podía leer toda tu carpeta de usuario.** El permiso estaba en
`$HOME/**`: `~/.ssh`, `~/.aws`, `~/Library` entera (llaveros, cookies, Correo),
los perfiles del navegador. Nada de eso tiene que ver con la tesorería de una
iglesia.

Acotarlo requería **tres pasos en orden**, porque hacerlo a secas habría roto en
silencio todos los comprobantes que apuntaban al Escritorio o a iCloud:

1. El comprobante se **copia** a la carpeta de la app al guardarlo, en vez de
   guardar la ruta del archivo del usuario.
2. Una migración trae adentro los de instalaciones anteriores.
3. Solo entonces se acota el permiso — y en dos archivos separados, porque Mac e
   iOS no son el mismo problema: en iOS `$HOME` **es** el contenedor de la app,
   ya lo acota el sistema.

**La ventana no tenía ninguna política de contenido** (`"csp": null`). Si algún
día entrara contenido ajeno en la vista (un nombre con HTML, el cuerpo de una
carta, un CSV importado), nada impedía que ejecutara código ni que se llevara
datos a cualquier servidor. Ahora hay una política real, y el build **falla** si
el hash del script en línea deja de cuadrar — ese fallo solo se notaría en el
build firmado, que es el que va a Apple.

**El webhook de pagos regalaba el plan completo.** Un producto que no estuviera
en el mapa —un dedazo en un secreto, un producto de prueba— concedía la app
entera. Y comprar las dos áreas por separado daba solo una. Ninguno hacía daño
hoy (un solo producto), los dos se abrían con el primer plan barato.

### 1.3 El agujero más grande: respaldo sin restauración

Tamio tenía respaldo y **no tenía forma de restaurarlo**. Si la Mac se moría, el
tesorero abría Tamio en la nueva, tenía el archivo en la mano y no había ningún
botón donde ponerlo. Lo único reimportable era el CSV de movimientos y el de
miembros: en un desastre real se perdían depósitos, actas, cartas, cultos con su
asistencia, agenda y todos los comprobantes.

Se cerró el circuito entero:

- **El respaldo pasa a ser un paquete `.zip`** con la base más los documentos.
  Antes era solo el `.db`, y eso funcionaba *por accidente*: los comprobantes
  vivían en el Escritorio del usuario y se los llevaba su Time Machine. Al
  moverlos dentro de la app —que era lo correcto— ese accidente desapareció.
- **Restaurar**, con doble confirmación que dice **qué trae el paquete**
  (cuántos movimientos, miembros y depósitos, hasta qué fecha, cuántos
  documentos). Con esos números uno se da cuenta de que eligió el archivo
  equivocado; un "¿seguro?" no deja verlo.
- **Acepta los dos formatos**, reconocidos por contenido y no por extensión.
- **La base actual se aparta con fecha**, nunca se borra.

Dos decisiones que se tomaron por escrito antes de codificar:

**Cómo sustituir la base con la conexión abierta:** preparar a un lado y aplicar
en el arranque siguiente, reiniciando. El único momento en que nadie tiene la
base abierta es antes de abrirla. Hacerlo en caliente obligaba a cirugía en el
`Mutex` y dejaba el frontend con datos viejos cargados sobre una base nueva.

**Qué pasa con la nube:** restaurar queda **deliberadamente local**, con la
sincronización en pausa y un aviso visible. Con last-write-wins ninguna regla
automática acierta —o la nube pisa lo restaurado, o lo restaurado resucita lo
que se borró a propósito— y quien restaura lo hace porque algo salió mal.

### 1.4 Lo que apareció al probar de verdad

Tres cosas que **solo salieron porque Iván abrió el archivo y miró**:

**El paquete llevaba basura.** Dentro había una docena de PDF y HTML que genera
la propia app al imprimir. Material derivado, que se rehace con un clic. Ahora
el respaldo lleva solo lo que el usuario aportó.

**Las firmas nunca se copiaban dentro de la app.** Guardaban la ruta del PNG del
Escritorio. Si lo movías, **todos los documentos oficiales salían sin firmar**,
sin ningún aviso. Y no entraban en el respaldo: la restauración recién construida
dejaba la Mac nueva emitiendo constancias sin firma. Justo el escenario para el
que se hizo. El logo tenía el mismo problema en otra forma (ruta absoluta con el
nombre de usuario dentro).

**La pantalla en blanco tras restaurar.** Tres rondas de diagnóstico:

1. Se añadió una red de seguridad para errores de pintado → no mostró nada, lo
   que **descartó** esa causa.
2. Se descubrió que la app devolvía `null` mientras cargaba, así que un arranque
   colgado daba una ventana muda para siempre. Ahora dice en qué paso se quedó.
3. La prueba decisiva la hizo Iván: **cerrar con Cmd+Q y reabrir funcionaba**.
   Eso probó que la restauración estaba bien y el fallo era `restart()`, que en
   macOS re-ejecuta el binario de dentro del bundle y deja una ventana que nunca
   pinta. Ahora se relanza con `open -n` sobre el `.app`.

### 1.5 Sistema visual y accesibilidad

- **Escala tipográfica** en tokens. Quedan 7 tamaños en px, todos excepciones
  documentadas (entre ellas: los campos de formulario a 16px, porque por debajo
  iOS hace zoom al enfocar).
- **Escala de espaciado**, 186 huecos migrados en dos pasos: primero los 85 que
  coincidían exactos (cero cambio visual), luego los 101 intermedios.
- **Una sola paleta de categorías.** Había dos listas de colores para lo mismo;
  los once gastos coincidían por casualidad y los cuatro ingresos no. El chip
  "Ofrenda" y su porción del donut eran verdes distintos.
- **Accesibilidad:** 33 controles que eran `<div onClick>` pasan a `<button>`
  reales. El anillo de foco ya existía en el CSS — lo que faltaba es que esos
  elementos pudieran recibirlo.
- Más: flechas que ahora siguen el signo, importes que no se parten en dos
  líneas, columnas iguales en Ingresos y Gastos, estados vacíos centrados,
  modales con altura tope, barra de guardado pegada, botones separados del borde.

---

## 2. Lo que se comprobó antes de tocarlo

La auditoría externa que originó parte de este trabajo traía dos afirmaciones
que resultaron **falsas o dañinas**, y se verificaron antes de actuar:

- **"No hay cifrado local"** — falso. La base usa SQLCipher con la clave en el
  Llavero de macOS.
- **El arreglo propuesto para el formato de moneda** habría sido una regresión:
  proponía seguir el *idioma* de la app, y el separador de miles es una
  convención del **país**. México, Puerto Rico y EE. UU. escriben `1,250.50`;
  España y Argentina `1.250,50`. Los tres en español.

---

## 3. Qué queda

### Código

| | |
|---|---|
| **4.2 — dinero en centavos enteros** | Plan escrito en `docs/plan-centavos.md`. Va **después** de la aprobación de Apple y en su propia rama: si Apple rechaza y hay que mandar un arreglo urgente, `main` no puede estar a medio migrar la base. |
| **Secretaría sin exportación CSV** | Actas, cartas, servicios y agenda solo salen dentro del paquete. Movimientos y miembros sí exportan. |

### Repositorio (después de la aprobación, en este orden)

1. Separar el sitio público (`docs/*.html`, `CNAME`) del repo de código
2. Mover GitHub Pages a `main` y verificar que tamio.church sigue en pie
3. Solo entonces, borrar `claude/hello-9v3atw`
4. Eso desbloquea hacer el repo privado. `web/` es peso muerto y se va con ello

### Infraestructura

Desplegar el webhook (`supabase functions deploy pago-webhook --no-verify-jwt`)
cuando se elija procesador de pagos.

### Pruebas pendientes en la Mac

- Comprobante nuevo desde el Escritorio, y ver uno viejo
- Los dos CSV guardados en Documentos
- **Un PDF con firma y logo** — verifica la migración de `imagenes/`
- Modo oscuro sin destello blanco al abrir
- **Un respaldo nuevo**: dentro solo `comprobantes/`, `imagenes/`, `adjuntos/` y
  `tamio.db`, sin PDF sueltos
- Reportes: que el color del donut coincida con el de la etiqueta
- Tab dentro de un modal: anillo de foco visible, Enter cierra

---

## 4. Documentos que dejó este trabajo

| Archivo | Qué contiene |
|---|---|
| `docs/plan-centavos.md` | El plan de 4.2: inventario, orden, la trampa del `CAST` sin `ROUND`, pruebas y marcha atrás |
| `docs/respaldo.md` | Formato del paquete y la política de fusión al restaurar, con su porqué |
| `docs/restaurar.md` | Las dos decisiones de diseño de la restauración |
| `docs/ideas-futuras.md` | Hoja de ruta al día, con lo confirmado y lo desmentido de la auditoría |

---

## 5. Una nota sobre el método

Lo que más valor dio en estos dos días no fue escribir código: fue **verificar
antes de actuar** y **mirar el resultado real**.

- Dos afirmaciones de la auditoría eran falsas; actuar sobre ellas habría metido
  una regresión.
- El orden de los tres pasos del permiso de archivos era la diferencia entre
  acotarlo y romper todos los comprobantes en silencio.
- Las firmas rotas y la basura del respaldo salieron porque Iván **abrió el .zip
  y miró lo que había dentro**, no porque el código lo dijera.
- La pantalla en blanco se resolvió con una prueba de diez segundos —Cmd+Q y
  reabrir— que descartó media hipótesis de golpe. Sin ella se habrían mandado
  tres builds a ver si alguna acertaba.
