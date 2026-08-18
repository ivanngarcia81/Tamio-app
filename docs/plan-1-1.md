# Tamio 1.1 — Mapa de trabajo

_Escrito el 3 de agosto de 2026, con la 1.0 en revisión de Apple._

La 1.0 es una app que funciona. **La 1.1 es la versión que se vende sola**:
alguien la compra en tamio.church, invita a su tesorero y a su secretaria, y
cada quien entra con su rol. Todo lo demás de esta lista existe para sostener
eso.

> **✅ Apple aprobó y Tamio se publicó el 13 de agosto de 2026.** La frase de
> abajo era la regla mientras había un build en la cola; ya no aplica. `main`
> está libre y la 1.1 puede empezar en cuanto la rama `centavos` pase su vuelta
> en la Mac.

~~**Nada de esto se empieza hasta que Apple responda.** Un cambio grande en
`main` mientras hay un build en revisión es un riesgo sin ninguna prisa que
lo justifique.~~

---

## Alcance — decidido el 4 de agosto de 2026

Los diez puntos de abajo eran demasiado para una sola versión. **La 1.1 lleva
cuatro; los otros seis pasan a la 1.2.** El criterio: la 1.1 es lo que hace que
Tamio se pueda comprar, y nada más.

| En la 1.1 | A la 1.2 |
|---|---|
| 1. Centavos enteros ✅ | 4. Exportaciones que faltan |
| 2. Login + roles reales ✅ | 5. Asistencia = lista + contadores |
| 3. Encender la tienda ✅ | 6. Panel de trabajo de Secretaría |
| 9. Guarda de canal del actualizador ✅ | 7. Integridad de documentos oficiales |
| | 8. Avisos de Agenda en Inicio |
| | 10. Higiene: errores con rastro |
| | 11. Deslizar la fila en el móvil ✅ |
| | 12. Ideas de "Proyecto B" |

Los seis de la derecha se quedan documentados aquí hasta que la 1.1 cierre;
entonces se mueven a un `docs/plan-1-2.md` propio.

**Procesador de pago: Lemon Squeezy.** Paddle también aprobó (3–4 ago) y queda
como respaldo. Son la misma empresa desde 2024 y las comisiones son
equivalentes; el desempate fue que el webhook y la guía ya están escritos para
Lemon Squeezy. Las páginas legales publicadas decían Paddle y se corrigieron el
4 ago.

---

## Orden de ejecución

El orden importa y no es negociable en sus dos primeros puntos: los centavos
tocan toda la base de dinero (mejor antes de que haya usuarios reales con
datos), y el login es el cimiento de la venta, la tienda y el panel.

**La migración de los centavos es la número 36** — la última existente en
`src-tauri/src/lib.rs` es la 35.

### 1. Dinero en centavos enteros — *rama propia, primero de todo*

El plan completo está en `docs/plan-centavos.md`. Los montos pasan de decimal
a entero de centavos, eliminando de raíz los errores de redondeo al sumar.

- Toca migración de base de datos, `db.ts`, formularios, PDF, CSV y sync.
- Es la única entrada de la lista que puede corromper datos si sale mal: va
  en su propia rama, con pruebas, y no se mezcla con nada más.
- **Por qué ahora:** cuanto más tarde, más iglesias con más datos que migrar.

### 2. Login + invitar usuarios con roles reales — *la pieza ancla*

Decidido el 28 jul 2026. Hoy cada quien que se registra queda como
administrador de su propia iglesia; no hay forma de que una segunda persona
se una a la MISMA iglesia con otro rol sin tocar Supabase a mano.

- Crear/invitar cuenta por correo + unirla al mismo `church_id` + asignar rol
  (función de Supabase, como la de "borrar cuenta") + pantalla de invitación.
- La separación de roles **ya funciona**: lo que falta es la puerta de entrada.
- Al terminar: **volver a mostrar la tarjeta Usuarios** en Ajustes (hoy
  oculta a propósito, porque sin login no hace nada) y que la tarjeta de plan
  muestre estado y vencimiento reales.

### 3. Encender la tienda — *no depende de Apple; se puede empezar hoy*

> **✅ Corrección (13 ago 2026): el webhook SÍ está desplegado.** Se comprobó
> contra el proyecto `hkpbkpojeierxqtbmagh`: `pago-webhook` está **activo, en su
> versión 7**, con `verify_jwt: false`, que es lo correcto para un webhook
> —quien llama es Lemon Squeezy, no un usuario con sesión—. El párrafo de abajo
> decía lo contrario porque desde el repositorio no había forma de saberlo.

~~El webhook ya está escrito y adaptado a Lemon Squeezy, **pero escrito no es
desplegado**: el código vive en `supabase/functions/pago-webhook/` y nada en
el repositorio demuestra que esté corriendo.~~ La guía paso a paso está en
`docs/guia-lemon-squeezy.md`, con las Fases 1–4 en modo de prueba.

- Producto único "Tamio", **$23.99/mes** (ver `docs/planes.md` → Precio).
- Lo hace Iván a mano: crear producto y webhook en Lemon Squeezy, desplegar
  la función y guardar el secreto `LEMON_WEBHOOK_SECRET` con la CLI de
  Supabase, y poner `VITE_URL_COMPRA` en el `.env`.
- **Prueba de fuego:** una compra falsa (tarjeta `4242…`) deja un
  `subscription_created` con respuesta 200 en el registro de entregas de
  Lemon Squeezy. Sin login todavía, el 404 "usuario no encontrado" también
  vale: prueba la firma y el formato, que es lo que se puede probar hoy.
- **Lo único que espera a Apple** es que los botones de compra aparezcan en
  la app: `VITE_URL_COMPRA` se lee al compilar, y no se sube build nuevo.

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

### 9. Apagar el buscador de actualizaciones en los builds de App Store — ✅ HECHO (11 ago 2026)

El detalle completo está en `docs/checklist-app-store.md` → *El otro enlace
externo*. Resumen de lo que quedó:

- **`src/canal.ts` (nuevo).** Una sola variable de compilación, `VITE_CANAL`,
  decide las dos reglas de Apple a la vez: el enlace de compra (3.1.1) y el
  aviso de versión nueva (2.5.2). Una variable y no un interruptor por regla,
  porque con dos banderas tarde o temprano se quedan en desacuerdo y ese build
  llega a revisión.
- **`npm run verificar-canal`,** que corre solo al final de cada
  `npm run build`. Mira el **bundle ya construido**, no la variable: la
  variable dice lo que se quería construir, el bundle dice lo que se
  construyó, y es lo único que el revisor va a ver.
- Comprobado construyendo los dos canales de verdad, incluido el caso del
  olvido típico —canal `appstore` con `VITE_URL_COMPRA` puesta— y el de la
  errata en el nombre del canal.

Lo que **no** cambia: el candado del manifiesto de `Tamio-web` sigue puesto
hasta que un build con esta guarda esté **publicado** en las dos tiendas. Una
app ya instalada no se arregla desde el servidor.

### 11. Deslizar la fila para editar y borrar — en el móvil

**Idea (Iván, 11 ago 2026),** traída de otra app suya: en el iPhone, deslizar
una fila hacia la izquierda descubre **Editar** y **Eliminar**. Es más limpio
que los tres puntitos, que son un objetivo pequeño y un patrón de ratón: en un
teléfono hay que apuntar a un `···` de 20 px y luego a un menú que se abre
encima del contenido.

**Es más barato de lo que parece.** Los trece sitios que hoy tienen acciones de
fila pasan **todos** por un único componente, `src/components/RowMenu.tsx`, con
el mismo contrato: `onEdit`, `onDelete`, `deleteLabel`, `extraItems`. Envolver
ese contrato en una fila deslizable lo arregla en los nueve archivos de golpe:

`TxList`, `TxTable`, `DepositoTable`, `UsersSettings`, `Miembros`, `Membresía`,
`Actas`, `Cartas`, `Servicios`.

Los tres puntitos **se quedan en el escritorio**, donde además ya hay clic
derecho (`onContextMenu` en `TxList.tsx:106`). Y el CSS ya tiene la separación
por tamaño de pantalla lista (`.solo-escritorio`, `styles.css:4707`).

**La decisión que hay que tomar antes de programar: el deslizamiento completo.**
En la app de la que viene la idea, deslizar del todo borra. Aquí eso depende de
si hay marcha atrás, y **solo tres de las nueve listas la tienen**:

| Con "Deshacer" hoy | Sin marcha atrás |
|---|---|
| Movimientos (`TxList`), Miembros, Depósitos | Actas, Cartas, Membresía, Servicios, Usuarios |

Borrar un acta de una asamblea con un dedo que resbala, y sin deshacer, no es
un patrón bonito: es una pérdida. **Propuesta:** el deslizamiento descubre los
botones en las nueve; el deslizamiento completo borra **solo donde ya existe el
"Deshacer"**, y en el resto se queda a medio camino esperando el toque. Y si se
quiere el gesto en todas, entonces el trabajo empieza por añadir el "Deshacer"
a las cinco que faltan, no por el gesto.

*No hay conflicto con el gesto de "atrás" de iOS: ese es un arrastre hacia la
derecha desde el borde izquierdo, y este es hacia la izquierda desde el centro
de la fila.*

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

**Dónde va:** es la candidata natural a ser **la función bandera de la 1.2**, o
el arranque de la 2.0 si la 1.2 se queda en pulido. Lo que no es, es cáscara.

#### Cierre mensual — auditabilidad, y sale barato

En su barra lateral hay una sección **"Cierre mensual"** que Tamio no tiene y
que no habíamos considerado: cerrar el periodo para que nada cambie después de
haber emitido el estado financiero.

Para una tesorería que rinde cuentas es exactamente el control que falta. Hoy
en Tamio se puede editar un movimiento de marzo en agosto, después de que el
estado financiero de marzo se imprimió y se entregó, **y nada avisa**. Con el
periodo cerrado, esa edición pide desbloquear a propósito y queda registrada.

Cuesta poco en comparación con lo que da: una marca de cierre por periodo y un
freno en las escrituras. Va a la 1.2.

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

### 10. Higiene: que los errores dejen rastro

De la auditoría 5.4. Los 11 `catch` silenciados de `App.tsx` (y los de los
modales) pasan a `console.warn` con contexto.

- **Por qué:** un error que solo se ve "no haciendo nada" costó tres días de
  diagnóstico con el botón de restaurar; uno que deja rastro cuesta minutos.
- De paso: tipar el `payload` del tooltip de Recharts (los dos únicos `any`).

---

## Preguntas contestadas, decisiones pendientes

Dos puntos de la tanda de Secretaría pedían una respuesta, no código, y se
quedaron sin contestar. Investigados el 4 ago; la decisión sigue siendo de
Iván.

### P2 — Los recordatorios de Agenda: qué hacen hoy

**Se leen, pero solo dentro de la app, y solo en la pantalla de Agenda.**
No hay entrega de ninguna clase: ni correo, ni notificación del sistema, ni
tarea programada. Comprobado: no hay `tauri-plugin-notification` en
`src-tauri/Cargo.toml` (solo opener, dialog y fs), no hay `pg_cron` ni
trabajo agendado en `supabase/`, y las tres Edge Functions que existen
(`borrar-cuenta`, `pago-webhook`, `redactar-ia`) no tienen que ver.

El único consumidor es `Agenda.tsx:312-323`: arma una franja "Recordatorios"
arriba de la página con las actividades cuya fecha cae dentro del margen
elegido, saltando las canceladas, las completadas y las pasadas. La franja
se pinta en `Agenda.tsx:498`. `grep` de `recordatorios` no da resultados en
`Dashboard.tsx` ni en `InicioSecretaria.tsx`.

**Consecuencia:** el aviso solo existe si alguien abre Agenda ese día. Quien
marque "un día antes" y no entre, no ve nada. El rótulo dice "Recordatorios"
sin ninguna nota que lo acote.

**Tres salidas, en orden de coste:**

1. **Renombrar y explicar** (una tarde). El campo pasa a llamarse algo como
   "Avisar en Agenda" y gana una línea de ayuda: *"aparece en la lista de
   Agenda los días indicados; Tamio no envía correos ni notificaciones"*.
   Honesto y barato.
2. **Notificación real del sistema** (1.1 o después). `tauri-plugin-notification`
   es oficial y funciona en macOS e iOS. Pero una notificación programada
   necesita que algo la programe: con la app cerrada no hay quien dispare
   nada, así que lo realista es avisar al ABRIR la app, no a una hora fija.
3. **Correo** (2.0). Necesita servidor y que la iglesia esté sincronizada.
   Fuera de alcance por ahora.

**Decidido el 4 ago 2026 (Iván): la 1, y hecho el mismo día.** El argumento
que cerró el caso: con la app cerrada no hay quien dispare nada, así que un
aviso "un día antes" que solo puede aparecer cuando alguien abre la app no
es un recordatorio, es un letrero. Construir notificaciones reales no
cumpliría la promesa, la haría más confusa.

- Etiqueta: **"Avisar en Agenda" / "Notice in Agenda"**.
- Línea de ayuda bajo el campo diciendo que el aviso aparece en la pantalla
  de Agenda durante los días elegidos y que Tamio no envía correos ni
  notificaciones del sistema.
- La lógica de `Agenda.tsx:312-323` **no se tocó**: funcionaba, el problema
  era la palabra.

**Y una idea que sale de esto, para la 1.1 — mejor que las notificaciones.**
El aviso solo se pinta en Agenda; `recordatorios` no aparece ni en
`Dashboard.tsx` ni en `InicioSecretaria.tsx`. **Mostrarlos también en
Inicio**, que es donde la gente entra a diario, resuelve el problema real
sin plugin ni servidor: el dato ya existe, ya está calculado y solo falta
enseñarlo donde se ve. Encaja exactamente con el panel de trabajo de
Secretaría (punto 6): es una tarde, no un proyecto.

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

---

## Candidatos si el tiempo alcanza

- **Face ID / Touch ID** para abrir la app (plugin oficial de Tauri).
- **Layout de Ajustes:** los huecos que salgan de las pruebas en Mac e iPad.

## Trámites del humano (no dependen de código ni de nadie)

### ✅ App Store Small Business Program — HECHO el 3 ago 2026

Baja la comisión de Apple del **30 % al 15 %**. Se completaron los dos pasos
el mismo día:

1. **Paid Applications Agreement** firmado en App Store Connect → Business →
   *Agreements, Tax, and Banking*, con sus datos bancarios y el formulario
   fiscal de EE. UU. (persona física / *sole proprietor*, *non-exempt
   payee* — lo normal para un desarrollador individual).
2. **Inscripción enviada** en
   <https://developer.apple.com/app-store/small-business-program/>, con las
   cuatro preguntas de *Associated Developer Accounts* en "No" (una sola
   cuenta, sin socios ni cuentas relacionadas).

**Queda pendiente de Apple:** la tarifa del 15 % entra en vigor el **primer
día del mes siguiente** a la aprobación.

**Por qué se hizo ahora aunque todavía no sirva:** el 15 % solo se cobra
sobre compras DENTRO de la app, y Tamio se vende por la web (Apple no cobra
nada por una app gratis). Empieza a importar el día que se añada la compra
dentro de la app — que la 1.1 descarta a propósito. Pero tarda un mes en
activarse y no cuesta nada: mejor hecho por adelantado que con prisa.

De paso, el Paid Applications Agreement deja la cuenta lista para cobrar por
Apple el día que haga falta, sin volver a tocar papeleo.

## Higiene del repositorio (independiente, en cuanto Apple apruebe)

Anotado desde julio, sin relación con el código de la app:

1. Separar `docs/*.html` + `CNAME` al sitio público.
2. Mover GitHub Pages a `main` y verificar tamio.church.
3. Solo entonces, borrar la rama `claude/hello-9v3atw` (hoy sirve el sitio).
4. Hacer el repositorio privado. `web/` es peso muerto.

---

## Lo que NO va en la 1.1

- **Compras dentro de la app (App Store).** El precio ya está listo para
  cuando toque ($23.99 en ambos canales), pero implementarlo es un proyecto
  en sí mismo y no hay razón para hacerlo antes de tener clientes. (La
  inscripción al Small Business Program sí conviene hacerla ya — ver
  *Trámites del humano*.)
- **Planes por módulo a la venta.** Están diseñados y el webhook los soporta;
  se ponen a la venta cuando haya demanda que lo pida.
- **Tamio Kids, conciliación bancaria, Android/Windows.** Versión 2.0 —
  siguen en `docs/ideas-futuras.md`.

---

## Punto 2, primera pieza: la Edge Function `invitar-usuario` (13 ago 2026)

Escrita y comprobada. **No toca la base local**, así que se pudo adelantar sin
esperar a que se funda la rama `centavos`: trabaja contra la tabla `perfiles`
de Supabase (Postgres, en el servidor), no contra el SQLite que migra la 36.
Cero solape.

**Falta desplegarla y probarla**, y eso lo hace Iván:

```
supabase functions deploy invitar-usuario
```

No necesita secretos: usa `SUPABASE_URL`, `SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_ROLE_KEY`, que ya existen en el proyecto.

### Lo que apareció leyendo el SQL, y no se veía de otra forma

**El disparador que trabaja en contra.** `sync-e1.sql:63` tiene
`al_crear_usuario`, que al insertar en `auth.users` **le crea una iglesia nueva
a cada cuenta**, con rol `administrador`. Está bien para el que se registra
solo; para una invitación es exactamente lo contrario de lo que se quiere. No
se puede evitar —es de la base— así que la función lo corrige después:
sobrescribe el perfil con la iglesia de verdad y **borra la iglesia huérfana**
que acaba de nacer. Sin ese barrido, cada invitación dejaría una iglesia vacía
en la tabla para siempre.

**Dos listas de roles que se parecen y no son lo mismo.** Los roles de acceso
son tres (`tesorero | secretaria | administrador`, `src/role.ts`). El
directorio local de personas tiene otros seis (`ROLES_USUARIO` en `db.ts`:
pastor, auditor, consejo…), que son **descriptivos y no dan acceso a nada**.
Aceptar uno de esos en la invitación le daría permisos a quien solo figura en
una lista. La función solo admite los tres de acceso, y hay una prueba que lo
vigila.

### Las tres reglas, y `npm run verificar-invitacion`

1. **La iglesia no viaja en la petición.** Se lee del perfil de quien invita,
   nunca del cuerpo. Si el cliente pudiera mandarla, cualquiera con una cuenta
   entraría en la congregación que quisiera escribiendo su identificador.
2. **Solo un administrador invita**, comprobado contra el perfil guardado.
3. **A nadie se le roba de su iglesia:** un correo que ya pertenece a otra se
   rechaza en vez de mudarlo en silencio.

La prueba es estática —la función corre en Deno contra Supabase y aquí no se
puede ejecutar— pero vigila justo lo que al romperse **no da ningún error**:
la app seguiría funcionando y solo se notaría el día que alguien entre donde no
debe.

### Punto 2: cerrado y probado de punta a punta (15 ago 2026)

- La pantalla de invitación ya estaba escrita, en `InvitarUsuario.tsx`, junto
  a `UsersSettings` en Ajustes sin mezclarse con ella (esa sigue siendo el
  directorio LOCAL de personas, `insertUsuario`/`deleteUsuario` de `db.ts`,
  que no son cuentas).
- `centavos` se fundió en `main`, y con eso se encendieron
  `LOGIN_HABILITADO` (`src/supabase.ts`) y `SYNC_HABILITADO`
  (`src/syncManager.ts`). Sin credenciales de Supabase en el `.env`,
  `authHabilitado` sigue en `false` y la app queda 100% local igual — el
  interruptor solo importa en builds configurados para la nube.

**Probado en una Mac real, con el proyecto de Supabase de producción:**

1. Con `.env` configurado, la app pide iniciar sesión en vez de entrar
   directo — los datos locales (SQLCipher) siguen intactos, el login solo
   decide rol y sincronización.
2. Registro de la primera cuenta: crea iglesia propia y queda como
   `administrador` (disparador `al_crear_usuario`). La tarjeta de invitar
   solo aparece para administradores — confirma el rol sin necesidad de
   una etiqueta explícita en pantalla.
3. Invitar a un correo con rol `tesorero` (probado con un alias `+` de Gmail,
   sin necesitar una segunda cuenta de correo real): llega el correo de
   Supabase, el enlace cae en `tamio.church/invitacion.html` (no en una
   página genérica — la *Site URL* del proyecto está bien apuntada), pide
   contraseña y activa la cuenta.
4. Esa cuenta entra a Tamio con rol Tesorero: ve solo Tesorería (sin
   Secretaría ni Usuarios) y los MISMOS movimientos locales que la cuenta
   de administrador — confirma que quedó en la misma iglesia y que la nube
   no separa los datos del dispositivo, solo el rol de quien entra.

Quedan en el proyecto de producción una iglesia y una cuenta de prueba
(`+tesorero`); no estorban, se pueden borrar cuando convenga antes de tener
clientes reales.

### La página de aterrizaje de la invitación (13 ago 2026)

`docs/invitacion.html`. Existe porque al preparar el despliegue apareció que
**la invitación manda un correo con un enlace, y ese enlace no iba a ninguna
parte**: Supabase manda al invitado a la *Site URL* del proyecto, y en
tamio.church solo había cuatro páginas —inicio, privacidad, términos y
reembolsos—. La función habría funcionado, el correo habría salido, y el
invitado habría pinchado y aterrizado en la nada, sin que nada pareciera roto
por nuestro lado.

Recibe el token, deja poner una contraseña y le dice que abra Tamio. **No
guarda nada** ni conoce ningún dato de la iglesia, y usa la API de auth
directamente en vez de cargar `supabase-js` de un CDN: una página estática de
un solo uso no necesita otra dependencia.

**Dos detalles que no se ven y hacen falta:**

- **Admite las dos formas del enlace.** Supabase manda la invitación en el
  fragmento (`#access_token=…`) o en la consulta (`?token_hash=…`, que hay que
  canjear en `/auth/v1/verify`) según cómo esté configurado el proyecto, y no
  se puede saber cuál de antemano. Soportar solo una habría funcionado en
  pruebas y fallado en producción —o al revés— sin ninguna pista de por qué.
- **El token se borra de la barra de direcciones** en cuanto se lee. No tiene
  por qué quedarse en el historial del navegador de nadie.

**Las claves ya están puestas** (13 ago): proyecto `hkpbkpojeierxqtbmagh`. El
anon key es **público por diseño** —lo que protege los datos es la política RLS
de cada tabla, no el secreto de la clave, y esta misma clave ya viaja dentro del
binario que está en la App Store—. La `service_role` no se pone ahí nunca.

~~**Quedan dos cosas a mano:**~~ **✅ Las dos están hechas (comprobado el 18 ago
2026).** Se dejan escritas porque la regla —tamio.church se sirve desde
`claude/hello-9v3atw`, no desde `main`— sigue valiendo para cualquier cambio
futuro del sitio.

1. ~~**Copiarla a la rama que sirve Pages.**~~ Hecho: `docs/invitacion.html` es
   byte a byte igual en `main` y en `claude/hello-9v3atw`.
2. ~~En Supabase → Authentication → URL Configuration, la **Site URL**.~~ Hecho:
   la prueba de punta a punta del 15 ago (arriba, punto 3) confirma que el
   enlace de la invitación aterriza en `tamio.church/invitacion.html`.

Comprobada con Playwright: sin token enseña "este enlace no es válido"; con
token deja escribir y valida largo y coincidencia; el token desaparece de la
dirección; y en un navegador en inglés sale en inglés.

---

## Estado real del proyecto de Supabase (comprobado el 13 ago 2026)

Se leyó el proyecto directamente, en vez de deducirlo del repositorio. Proyecto
de Tamio: **`hkpbkpojeierxqtbmagh`** (`https://hkpbkpojeierxqtbmagh.supabase.co`).
Hay una segunda cuenta, "Jubileo app", que **no es esta** — conviene tenerlo
escrito para no desplegar en la equivocada.

**El esquema ya está aplicado.** Las dieciséis tablas existen —`perfiles`,
`iglesias`, `transactions`, `actas`, `cartas`, `servicios`, `agenda`…— y
**todas con RLS activado**. Todas a cero filas, que es lo esperado con la
sincronización apagada.

**Funciones desplegadas y activas:**

| Función | Versión | `verify_jwt` |
|---|---|---|
| `redactar-ia` | 13 | sí |
| `pago-webhook` | 7 | **no** — correcto: quien llama es Lemon Squeezy |
| `borrar-cuenta` | 1 | sí |
| `invitar-usuario` | **1 (13 ago)** | sí |

O sea que de los pasos que quedaban en Supabase, **el SQL ya estaba hecho y la
función ya está desplegada**. ~~Lo único que sigue pendiente allí es la *Site
URL*, que es un ajuste del panel.~~ La *Site URL* también quedó puesta; se vio
en la prueba del 15 ago.

---

## Punto 3: la tienda encendida (18 ago 2026)

**La tienda está abierta y en modo real**, no en pruebas. Tienda de Lemon
Squeezy: `tamio1.lemonsqueezy.com`. Dos variantes de un solo producto, ya
enlazadas desde `docs/index.html`:

| Plan | Precio | Checkout |
|---|---|---|
| Mensual | $23.99 | `/checkout/buy/b94288df-8c4d-4e3c-973a-d5f891124f82` |
| Anual | $239.99 (2 meses gratis) | `/checkout/buy/6836ff75-6173-401f-954a-96ae87a4aad8` |

**El webhook no necesita tocarse.** Al no haber secretos `LEMON_PLAN_*`
configurados, `planDe()` devuelve `"completo"` para cualquier pago
(`pago-webhook/index.ts:113`), que con un producto único de dos variantes es
justo lo que se quiere. Los secretos solo harán falta el día que se vendan
planes por área.

### La descarga, que faltaba y no se veía

Al revisar la página apareció el otro medio camino: **se podía pagar y no había
de dónde bajar la app**. `docs/index.html` tenía "See pricing" y los dos
Subscribe, y ni un enlace de descarga ni al App Store. El cobro entraba, el
cliente se quedaba sin nada que instalar y nada parecía roto.

Se añadió la sección `#download` apuntando a
`github.com/ivanngarcia81/Tamio-app/releases/latest/download/Tamio_universal.dmg`
—la forma `latest` para no editar la página en cada versión— más una línea que
manda a iPad y iPhone a la ficha de la App Store:
`apps.apple.com/us/app/tamio/id6794741319`. Es el primer sitio del repositorio
donde queda escrito el identificador de la app (`6794741319`), que hasta ahora
no constaba en ninguna parte.

**Tres cosas que aparecieron mirando el release, y conviene tener escritas:**

- El repositorio **se llama hoy `Tamio-app`**; `tesoreria-Mac-` sigue
  funcionando solo por la redirección de GitHub. `web/version.json:3` todavía
  usa el nombre viejo.
- El release publicado está etiquetado **v1.0.0** aunque la app va por 1.0.8: el
  `.dmg` se resubió encima el 15 ago (16 MB, 0 descargas). La etiqueta miente
  sobre la versión que se baja.
- **El día que el repositorio se haga privado, este enlace muere.** Ya estaba
  avisado en `docs/dia-de-la-aprobacion.md`, paso 5; ahora además hay una página
  pública que depende de él. Antes de cerrar el repositorio hay que decidir
  dónde viven los `.dmg`.

### Lo que queda por confirmar

1. **Recompilar la app con `VITE_URL_COMPRA`.** Se lee al COMPILAR
   (`src/plan.ts:37`): sin recompilar, "Comprar" y "Renovar" siguen sin salir
   (`App.tsx:355`, `SubBanner.tsx`). El valor real ya está en `.env.example`.
2. **Un `subscription_created` con respuesta 200** en el registro de entregas de
   Lemon Squeezy. Un **500** ahí significa que falta `LEMON_WEBHOOK_SECRET` en
   Supabase (`pago-webhook/index.ts:134`), y ese caso es el feo: al comprador se
   le cobra y a la iglesia no se le activa el plan.
