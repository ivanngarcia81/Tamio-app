# Tamio 1.4 — Mapa de trabajo

_Abierto el 22 de agosto de 2026, al preparar la 1.2 para TestFlight._

Esto **no se escribió hoy**. Son los siete puntos que el reparto del 4 de
agosto apartó de la 1.1 (`docs/plan-1-1.md` → *Alcance*), y que aquel plan
dejó dicho que se moverían a un archivo propio en cuanto la 1.1 cerrara.
La 1.1 cerró.

> **Corregido el 24 de agosto de 2026, por la noche.** Esta línea decía "la
> 1.1.9 está en TestFlight" y **no era verdad**: Iván comprobó en App Store
> Connect que lo más alto subido es la **1.2.8**. La 1.1.9 se preparó y nunca
> llegó a subir, igual que la 1.2.9. Lo que cerró la 1.1 fue el trabajo, no
> una subida. Ver el recuadro de `docs/testflight.md` sobre por qué el
> repositorio no distingue "preparada" de "subida".

**Iban a la 1.2, luego a la 1.3, y ahora van a la 1.4.** La 1.2 se usó para
otra cosa —el rediseño de iPad, que se hizo entero entre el 21 y el 22 de
agosto y no estaba en ninguna lista—, así que el número se lo llevó ese
trabajo y estos siete puntos corrieron un puesto.

> **Corrieron OTRO puesto el 26 de agosto de 2026, por decisión de Iván:**
> *"mover los planes de la versión 1.3 a 1.4 y hacer 1.3 la versión para
> TestFlight para revisar"*. El archivo pasó de `plan-1-3.md` a
> `plan-1-4.md`.
>
> Y el motivo es el mismo que la vez anterior, lo cual ya empieza a ser un
> patrón que conviene nombrar: **el número lo reclama el trabajo que de
> verdad se hizo, no el que estaba apuntado.** La serie 1.2.x acumuló once
> versiones —el rediseño de iPad entero, el de iPhone, los permisos de
> Tesorería, el tamaño de texto, el registro de la iglesia— y a la undécima
> ya no era una serie de parches: era una versión nueva. La 1.3.0 es ese
> trabajo. Estos siete puntos siguen esperando su turno, intactos.

Nada de lo de abajo cambió de contenido en ninguna de las dos mudanzas; se
movió tal cual se decidió, con sus fechas.

| # | Punto | Coste | Toca la base de datos |
|---|---|---|---|
| 4 | Las exportaciones que faltan | bajo | no |
| 5 | Asistencia = lista + contadores | medio | **sí** (`modelo_asistencia`) |
| 6 | Panel de trabajo de Secretaría | medio | no |
| 7 | Integridad de los documentos oficiales | medio | **sí** (`historial_estados` del acta) |
| 8 | Avisos de Agenda también en Inicio | bajo | no |
| 10 | Higiene: que los errores dejen rastro | bajo | no |
| 12 | Ideas traídas de "Proyecto B" | de bajo a **alto** | según cuál |

Del punto 12, lo que aquel reparto mandó a la 1.2 —y por tanto viene aquí—
es la Bandeja ensanchada, Ajustes con índice, el catálogo de informes, el
**Presupuesto** (la candidata a función bandera) y el cierre mensual. La
conciliación de depósitos, los fondos designados, el ciclo de vida de la
entrada y el selector de periodo global **siguen en la 2.0**, y siguen
siendo una sola función y no cuatro.

> **Ojo con dos cosas que ya no están como el plan las dejó**, porque se
> movieron con el rediseño de iPad del 21–22 de agosto y conviene mirarlas
> antes de darlas por pendientes:
>
> - **Ajustes con índice** (punto 12). En iPad ya sale en dos columnas a
>   partir de 761 px, con su columna de secciones a la izquierda. Lo que
>   queda es Mac y el teléfono.
> - **El detalle en panel lateral en vez de modal** (punto 12, el cierre).
>   Agenda, Actas, Servicios, Cartas, Reportes, Depósitos y Membresía ya son
>   maestro-detalle en iPad (`docs/ipad-rediseno.md`). En Mac siguen abriendo
>   modal.

---

## Orden sugerido

El del plan original, con una salvedad. Lo barato y que no toca la base va
primero —4, 8, 10 y la Bandeja del 12— porque se puede probar en TestFlight
sin arriesgar datos de iglesias reales. Después el 7 y el 5, que sí traen
migración y quieren su propia rama, como la tuvieron los centavos. El 6 y el
catálogo de informes cuelgan de que el 8 y el 4 estén hechos. El Presupuesto
y el cierre mensual, al final, porque son los dos grandes y son aditivos: no
bloquean a nadie.

---

### 4. Las exportaciones que faltan

Halladas en el inventario 5.6 (`docs/auditoria-5-4-5-6.md`). El patrón a
seguir ya existe en `services/backup.ts` (BOM UTF-8 + `entregarArchivo`, que
resuelve Mac y iPad).

- **CSV de Secretaría:** actas, bitácora de cultos, cartas y agenda.
- **Depósitos:** hoy no se pueden sacar de la app de ninguna forma, ni CSV ni
  PDF — siendo un dato contable que un revisor externo pediría.
- **PDF de la bitácora de cultos:** Actas (su vecina) sí lo tiene.

### 5. Asistencia de cultos: total = lista + contadores

Decidido contigo el 3 ago (P1). Hoy el total sale solo de los contadores; la
1.0 lo rotula y avisa en las dos direcciones, que era el arreglo seguro.

- La lista nominal cuenta a los miembros presentes; los contadores pasan a
  ser solo gente fuera del rol (niños, visitantes); "Total" se calcula.

**Cómo se separa lo histórico — decidido el 4 ago 2026 (Iván):**

Una columna nueva **`modelo_asistencia`** en cada culto, que guarda con qué
regla se registró. Los cultos existentes se marcan como antiguos en la
migración; los nuevos nacen con el modelo nuevo. Cada informe lee cada
culto con su propia regla, así que **ningún número histórico cambia por
detrás**.

**Por qué no se hace por fecha**, que era la salida obvia: la fecha del
culto no sirve de frontera porque un culto se puede registrar tarde. La
secretaria anota el domingo pasado el miércoles siguiente, ya después del
cambio, y ese registro usaría la regla nueva con una fecha vieja. Editar un
culto antiguo lo rompe igual. Un campo no puede equivocarse; una fecha sí.

### 6. Panel de trabajo de Secretaría — *después de los roles*

Detalle completo en `docs/ideas-futuras.md` → entrada 1-bis. `InicioSecretaria`
existe y funciona; se evoluciona de panel de indicadores a panel de pendientes.

- Actas por aprobar, cartas por firmar, actividades sin confirmar, ausencias
  que piden seguimiento, y la tarjeta nueva más valiosa: **"falta registrar
  el culto del domingo pasado"**.
- **Regla de oro:** cada tarjeta lleva a la pantalla donde se resuelve, y el
  panel no recalcula nada — lee las mismas funciones que ya usan Actas,
  Cartas, Agenda e Informes.
- Primer paso: las cuatro tarjetas actuales son `div` sin clic.

### 7. Integridad de los documentos oficiales — *el 3.8, decidido el 4 ago*

Detalle y razonamiento completos abajo, en *Preguntas contestadas*. En orden:

1. **Transiciones de estado con freno.** Bloquear los saltos hacia atrás
   desde `aprobada` (acta) y `entregada` (carta), o exigir confirmación
   explícita; y registrar en `historial_estados` todo cambio posterior a la
   aprobación, con quién y cuándo. Hoy las escalas son un `<select>` con la
   lista entera y un acta puede pasar de borrador a aprobada de un clic.
2. **`historial_estados` en el acta** (requisito del punto 1: hoy el acta es
   el único módulo sin traza).
3. **`cancelada` en el acta.**

No se fusionan `aprobada` y `lista` de la carta: riesgo real sobre filas
guardadas a cambio de un beneficio estético.

### 8. Avisos de Agenda también en Inicio

El dato ya existe y ya está calculado (`Agenda.tsx:312`); solo se muestra en
Agenda. Enseñarlo en Inicio es lo que convierte el letrero en algo útil, sin
plugin de notificaciones ni servidor. Va con el punto 6 (panel de Secretaría).


### 10. Higiene: que los errores dejen rastro

De la auditoría 5.4. Los 11 `catch` silenciados de `App.tsx` (y los de los
modales) pasan a `console.warn` con contexto.

- **Por qué:** un error que solo se ve "no haciendo nada" costó tres días de
  diagnóstico con el botón de restaurar; uno que deja rastro cuesta minutos.
- De paso: tipar el `payload` del tooltip de Recharts (los dos únicos `any`).


---

### 12. Ideas traídas de "Proyecto B" (13 ago 2026)

Iván tiene otro prototipo de app de iglesia y mandó capturas de su versión de
Mac y de móvil. **Es una maqueta: no tiene backend ni motor de datos** —lo dice
su propia pantalla de ajustes, "los cambios se guardan solamente en este
navegador", y sus saldos dicen "de demostración"—. Él mismo lo recordó, y ese
recordatorio es la clave para leerlo bien:

> **En una maqueta, una función difícil y una fácil cuestan lo mismo: una línea
> de texto.**

Así que lo de abajo está ordenado por lo que Tamio puede **calcular de verdad**,
no por lo bonito que se ve.

**Y una cosa que dijo Iván y que manda sobre todo esto:** *"si sale la versión
2.0 en un futuro, la app no puede verse igual que la 1.0"*. Tiene razón, y ya
está medio pagado — el gesto de deslizar, la barra inferior del teléfono, el
híbrido del iPad y el botón de crear ya cambiaron la cara. Lo que falta de
aspecto son las tres de abajo (Bandeja, Ajustes con índice, catálogo de
informes). **La 2.0 no necesita otra capa de pintura: necesita las funciones
que aquí se marcan como caras.** Una app que se ve distinta y hace lo mismo no
justifica un número nuevo.

#### La mejor: la campana no es un buzón, es "qué me falta por hacer"

En Proyecto B, el icono de campana abre cuatro avisos que **salen de sus propios
datos**, no de mensajes que alguien manda: dos entradas pendientes de depositar,
una diferencia de $10 en un depósito, un acta sin firmar y dos fichas
incompletas.

Tamio tiene algo parecido pero **mucho más estrecho**: `Bandeja` son solo los
movimientos con estado pendiente (`db.ts:665`). Los otros avisos no existen.

| Aviso | ¿Tamio puede calcularlo? |
|---|---|
| Entradas pendientes de depositar, con su importe | **Sí, hoy.** Los datos están; es una consulta |
| Acta pendiente de firma | **Sí.** Las actas ya tienen estados |
| Fichas incompletas | **Sí**, en cuanto se defina qué es "incompleto" |
| Diferencia entre lo contado y lo depositado | **No.** Ver más abajo: es una función entera |

**Ensanchar la Bandeja a "todo lo que está a medias" es barato, sale de lo que ya
hay, y es de lo poco de esa maqueta que hace a Tamio más útil y no solo más
bonito.** Es lo primero que haría de esta lista.

#### Ajustes con índice, en vez de una página larga

Proyecto B pone una columna de secciones a la izquierda y muestra **una a la
vez**. Tamio tiene las mismas seis zonas —Iglesia, Acceso, Documentos,
Categorías, Preferencias, Zona delicada— pero apiladas en una página con veinte
tarjetas, así que **hay que hacer scroll para saber qué existe**. Es el mismo
problema del menú escondido: lo que no se ve, no existe, y en Ajustes duele más
porque ahí viven cosas que se configuran una vez (el logo, la firma del pastor,
el respaldo).

Barato, porque el contenido ya está organizado: las zonas existen con su título
y subtítulo, y las tarjetas ya son componentes sueltos en
`src/components/settings/`. Cambia el contenedor, no el contenido. Y arregla
Mac, iPad **y** teléfono a la vez: hoy Ajustes en el iPhone es la peor pantalla
de la app.

**Lo que NO se copia:** su botón azul de "Guardar información". Tamio guarda
solo. Un botón de guardar es una cosa más que se puede olvidar, y en Ajustes
olvidarlo significa que el nombre de la iglesia no sale en el estado financiero
y no te enteras hasta que lo imprimes.

#### Un catálogo de informes, con vista previa antes de imprimir

Proyecto B tiene una pantalla "Informes de Tesorería" con dos columnas: a la
izquierda, **la lista de los once informes que existen**; a la derecha, la
vista previa del elegido con sus filtros (periodo, fondo, agrupar por) y los
botones de Exportar CSV e Imprimir.

En Tamio esos documentos **ya existen todos** —el motor de PDF está hecho y
probado— pero están **repartidos por cinco sitios distintos**:

```
src/pages/Reportes.tsx              src/pages/Movimientos.tsx
src/pages/Dashboard.tsx             src/components/MemberDetailModal.tsx
src/pages/Actas.tsx
```

Es otra vez el mismo problema, y en el peor sitio posible: **la constancia
anual de contribuciones vive dentro del modal de un miembro**. Un tesorero que
no abra la ficha de alguien no sabrá nunca que Tamio la genera — y esa
constancia es justo el papel que la iglesia entrega en enero a quien va a
deducir sus donaciones (IRC §170(f)(8), ver `ideas-futuras.md` 6-bis).

Barato en proporción a lo que da: los generadores están escritos; lo que falta
es **una pantalla que los liste y los enseñe antes de imprimir**. Ahora mismo
imprimir es un acto de fe: se genera el PDF y se abre en Vista Previa, y si el
periodo estaba mal se descubre ahí.

De esta lista, es lo tercero que haría, después de la Bandeja ensanchada y de
Ajustes con índice.

#### Lo cosmético y barato

- **Chips de estado sistemáticos** (Completado / Borrador / Verificado). Tamio
  los tiene a medias —la insignia de "pendiente", los de actas—, pero no como
  sistema.
- **Miembros con pestañas de estado y barra de asistencia.** La tabla ya existe;
  esto es adorno útil.

#### 🏆 Presupuesto — lo mejor de todo lo que mandó, y no es cáscara

De las capturas del 13 ago. Proyecto B tiene una pantalla de Presupuesto con
vista mensual y anual: barras de presupuestado contra gasto real, un resumen
(presupuestado / gastado / disponible, "78 % del presupuesto mensual
utilizado"), y una fila por categoría con su etiqueta —*Dentro del
presupuesto* / *Cerca del límite*—, lo gastado, lo presupuestado, una barra y
lo que queda. Con un botón **"Copiar año anterior"**, que es el detalle que
lo hace usable de verdad.

**Tamio no tiene nada de esto.** Cero: `presupuesto` no aparece ni una vez en
`src-tauri/src/lib.rs`.

Y es la función que más pide una iglesia después de la contabilidad básica,
porque el ciclo es real: la asamblea aprueba un presupuesto en enero y el
tesorero rinde cuentas contra él todo el año. Hoy en Tamio ese informe se hace
a mano, en papel o en Excel.

**Por qué la pongo por encima de la conciliación aunque las dos sean grandes:**
el presupuesto es **aditivo**. Una tabla nueva de presupuestos por categoría y
periodo, y nada más — no toca ni una columna de las que ya guardan dinero, así
que no puede corromper lo que ya existe. La conciliación sí toca los depósitos.
A igual valor, primero lo que no puede romper nada.

**Dónde va:** es la candidata natural a ser **la función bandera de esta
versión**, o el arranque de la 2.0 si se queda en pulido. Lo que no es, es
cáscara. _(Escrito el 13 ago decía "de la 1.2"; el número corrió, el
argumento no.)_

#### Cierre mensual — auditabilidad, y sale barato

En su barra lateral hay una sección **"Cierre mensual"** que Tamio no tiene y
que no habíamos considerado: cerrar el periodo para que nada cambie después de
haber emitido el estado financiero.

Para una tesorería que rinde cuentas es exactamente el control que falta. Hoy
en Tamio se puede editar un movimiento de marzo en agosto, después de que el
estado financiero de marzo se imprimió y se entregó, **y nada avisa**. Con el
periodo cerrado, esa edición pide desbloquear a propósito y queda registrada.

Cuesta poco en comparación con lo que da: una marca de cierre por periodo y un
freno en las escrituras. Va en esta versión, con el Presupuesto: son las dos
grandes y las dos son aditivas.

#### Lo caro, y por qué se ve barato en la maqueta

- **Conciliación de depósitos.** Ese "Diferencia de $10 · DEP-072" es, en Tamio,
  una columna nueva, una migración y una pantalla: hoy se guarda **un solo
  `monto` por depósito**, así que no sabe qué se contó y qué recibió el banco.
  En una maqueta es una cadena de texto. Va a la 2.0, y es de las funciones que
  de verdad piden los concilios.
- **Cuentas y fondos designados.** En Tamio `cuenta_banco` es texto libre en cada
  depósito y hay un solo `saldo_inicial`. Fondos para misiones o construcción no
  se pueden llevar. También 2.0, también toca la base.
- **El ciclo de vida de la entrada.** En sus capturas, cada entrada tiene estado
  *Pendiente → Preparada → Incluida*, y los depósitos *Pendiente de verificación
  → Verificado / Con diferencia → Depositado*. Tamio tiene un `estado` en los
  movimientos, pero es de **revisión** (`pendiente | aprobado | rechazado`,
  `db.ts:264`), no de depósito: son dos ejes distintos y hoy solo existe uno.

**Estas tres son UNA sola función, no tres.** La conciliación no significa nada
sin saber qué entradas entraron en cada depósito, y los fondos designados no
significan nada sin que cada entrada diga a qué fondo va. Intentar una sola
deja media función. Van juntas a la **2.0**, y son el bloque de trabajo más
grande de toda esta lista.
- **Selector de periodo global** ("Año fiscal 2026 · Agosto" en la barra
  superior). Idea buena y de las más invasivas: **todas** las consultas pasarían
  a depender de ese periodo. En una maqueta es un desplegable que no filtra nada.

#### Lo que Tamio ya tiene

Conviene dejarlo escrito para no "arreglar" lo que no está roto:

- **La hoja de "¿Qué desea crear?" en escritorio** sale con ⌘K desde cualquier
  pantalla. Tamio ya tiene `CmdPalette` con ⌘K, aunque la suya es de búsqueda +
  acciones y la de Proyecto B es solo de crear. Conviene compararlas antes de
  tocar nada; puede que solo falte añadirle las creaciones que no estén.
- **El calendario en rejilla, con Mes / Semana / Lista.** `Agenda.tsx` ya tiene
  exactamente esas tres vistas —`type Vista = "mes" | "semana" | "lista" |
  "historial"`, con su `matrizMes()`— y encima una cuarta que Proyecto B no
  tiene, el historial. Aquí Tamio va por delante.

  Lo único distinto: Proyecto B enseña el detalle del evento en un **panel
  lateral fijo** y Tamio lo abre en un **modal** (`ActividadDetalle`). En una
  pantalla ancha el panel gana, porque se puede saltar de un evento a otro sin
  abrir y cerrar; en el teléfono el modal es mejor. O sea que sería un cambio
  solo para Mac e iPad, y de los baratos.


---

## Apéndice — la decisión 3.8, de la que cuelga el punto 7

_Se movió entera desde `docs/plan-1-1.md` → "Preguntas contestadas". El punto
7 es su ejecución: sin este razonamiento, ese punto es una lista de tareas sin
el porqué._

### 3.8 — Acta y Carta tienen escalas de estado distintas

Son cinco vocabularios distintos, no dos:

| Acta (5) | Carta (9) | Solicitud (7) | Traslado (11) | Actividad (5) |
|---|---|---|---|---|
| borrador | borrador | nueva | borrador | borrador |
| pendiente | preparacion | revision | solicitud | programada |
| aprobada | revision | preparacion | revision | confirmada |
| corregida | firma | firma | aprobacion | completada |
| archivada | aprobada | lista | aprobado | cancelada |
| | lista | entregada | cartaPreparacion | |
| | entregada | cancelada | cartaEmitida | |
| | archivada | | cartaEntregada | |
| | cancelada | | confirmacion | |
| | | | completado | |
| | | | cancelado | |

Definidos en `ActaModal.tsx:19`, `CartaEditor.tsx:25`, `db.ts:2112`,
`db.ts:1856` y `db.ts:2876`.

**Lectura: la divergencia es real en su mayor parte, pero no toda.**

Lo que SÍ responde al dominio y debe quedarse:

- El acta tiene **`corregida`** (un acta aprobada que después se enmienda) y
  no tiene `entregada`: un acta no se entrega a nadie, se aprueba y se
  archiva.
- La carta tiene **`preparacion → firma → lista → entregada`**, que es el
  camino físico de un papel que alguien firma y otro recibe. Un acta no lo
  recorre.
- Carta y Solicitud comparten cuatro estados porque se diseñaron juntas en
  la Fase 2 y son las dos caras del mismo trámite. Eso es coherencia, no
  duplicación.

Lo que parece histórico:

- **La carta tiene `aprobada` Y `lista` y la propia app las trata igual**:
  `Cartas.tsx:428` cuenta `["aprobada", "lista"]` en el mismo grupo. Dos
  estados que la interfaz no distingue son un estado con dos nombres.
- **El acta no tiene `cancelada`** y las otras cuatro escalas sí. Un acta
  que se convoca y no se celebra no tiene dónde ir salvo quedarse en
  borrador o borrarse.
- **`historial_estados` es desigual:** carta, solicitud, traslado y miembro
  lo llevan; el acta no. Es el módulo donde una traza de quién aprobó y
  cuándo tendría más valor, siendo el documento legal de la iglesia.
- **Ninguna escala impone transiciones.** Todas son un `<select>` con la
  lista entera (`CartaEditor.tsx:516`), así que una carta puede saltar de
  borrador a entregada de un clic. Es intencional para no estorbar, pero
  conviene saberlo antes de llamarlas "flujos".

**Decidido el 4 ago 2026 (Iván):**

1. **Antes que nada, las transiciones.** Que ninguna escala imponga orden
   pesa más que cualquier estado que falte: un acta puede pasar de borrador
   a aprobada sin haber estado pendiente, y una carta de borrador a
   entregada de un clic. En documentos que se firman y se archivan como
   respaldo legal eso importa más que el vocabulario. No hace falta un flujo
   rígido, bastan dos cosas:
   - **Bloquear los saltos hacia atrás** desde `aprobada` y desde
     `entregada`, o exigir confirmación explícita para deshacerlos.
   - **Registrar en `historial_estados` cualquier cambio posterior a la
     aprobación**, con quién y cuándo.
2. **`cancelada` en el acta.** Una reunión que se convoca y no se celebra
   hoy no tiene dónde ir. Hueco real.
3. **`historial_estados` en el acta.** El acta es el documento legal de la
   iglesia y saber quién aprobó y cuándo es literalmente su función. Que sea
   el único módulo sin traza es lo contrario de lo que debería ser.
4. **NO fundir `aprobada` y `lista` en la carta.** La interfaz ya las trata
   igual (`Cartas.tsx:428`), así que el beneficio visible es cero y a cambio
   toca filas guardadas: riesgo real, ganancia estética. Quedan documentadas
   como sinónimos y ya.

Los puntos 1 y 3 se solapan: `historial_estados` en el acta es requisito del
1, así que se hacen juntos.
