# Del handoff a hoy: qué se hizo y qué falta por cablear

*24 de agosto de 2026. Rama `claude/charming-sagan-hknqp1`.*

Este archivo responde a dos preguntas de Iván: **qué se ha hecho desde el
handoff** y **qué queda por ponerle motor**. Es un balance, no un plan: lo que
está hecho está medido contra el repo, y lo que falta lleva al lado lo que
concretamente le falta, no una etiqueta.

Los otros dos archivos siguen siendo la fuente: `docs/ipad-rediseno.md` cuenta
**cómo** se hizo cada pantalla (§1–§38) y `docs/cascaras-1-2.md` es el registro
vivo de cáscaras. Aquí se juntan las dos vistas en una página.

---

## 1. De qué handoff hablamos

Fueron **tres entregas de diseño**, no una:

| | Qué traía | Estado |
|---|---|---|
| **Handoff 1** | Las 16 pantallas del iPad: maestro-detalle, cromo, hojas de formulario | construido |
| **Handoff 2** | Membresía, Informes de membresía, Mensajes, y la taxonomía de alertas de "Por revisar" | construido |
| **Handoff 3** | Depósitos entera: Pendientes como revisión previa al banco, Depositados con su detalle, y la hoja "Nuevo corte" | construido |

Y una regla que Iván puso al empezar el handoff 3, que explica la mitad de este
archivo:

> *"Si hay algún botón que no tiene función se crea para después darle motor al
> final del diseño. No te detengas porque no le veas función al botón."*

De ahí salen las **cáscaras**: controles dibujados y apagados, con su `title`
diciendo qué les falta. Nunca encendidos y mudos.

---

## 2. Lo que se hizo: el diseño (1.2.0 → 1.2.9)

Diez versiones a TestFlight. Resumidas por lo que cada una arregló:

| Versión | Qué trajo |
|---|---|
| **1.2.0** | El rediseño de iPad completo: las seis pantallas de maestro-detalle y Membresía |
| **1.2.1** | El iPad Pro de 12.9" en vertical pasa a dos columnas |
| **1.2.2** | La build de revisión del handoff 2: Membresía, Informes de membresía, Mensajes, y Cartas con crear solo en el "+" |
| **1.2.3** | El primer arreglo salido de probarla en un iPad de verdad: la barra lateral por **orientación** y no por ancho, y el gris único del cromo |
| **1.2.4** | El handoff 2 completo con Agenda y Configuración: las once pantallas recorridas |
| **1.2.5** | El panel de detalle pasa al gris del lienzo y deja de fundirse con la barra; y se pintan los **diez controles apagados** del handoff |
| **1.2.6** | El cromo terminado: las cinco superficies que pedían cromo con el token equivocado, con guarda sobre el archivo |
| **1.2.7** | La tanda salida de probar la 1.2.6 en el iPad de verdad |
| **1.2.8** | Editar un miembro va a la hoja de iOS, no al modal viejo; y la raya de la barra deja de ir pegada a los botones (16 pantallas de golpe) |
| **1.2.9** | Depósitos rehecha con el handoff 3, y los dos textos que no respiraban |

**La 1.2.8.1 que se pidió no puede existir**, y quedó documentado en
`docs/testflight.md`: no es semver válido (cargo lo rechaza) y Tauri
**sobrescribe** `CFBundleVersion` desde `tauri.conf.json` en cada `ios build`,
así que "misma versión, build nuevo" tampoco está disponible. Salió la 1.2.9.

---

## 3. Lo que se hizo DESPUÉS del diseño: el motor (24 ago)

Aquí empieza lo que Iván pidió al terminar el handoff 3: *"dale motor a lo que
se construyó"*. Cinco migraciones en un día.

### Migración 38 — la tabla de cortes

La más grande. **Apagó ocho cáscaras de una vez.** Antes hubo que decidir con
Iván qué es un *corte*, porque no estaba escrito en ningún sitio:

> El dinero contado que la tesorera **entrega a alguien** —en su iglesia, el
> pastor— para que lo lleve al banco. No es el depósito: es el paso de antes.

De ahí salieron `cortes` y `corte_movimientos`, y con ellas: la hoja "Nuevo
corte" entera, el responsable, "Marcar depositado", "Reabrir el corte", el
desglose real, los movimientos del corte, la conciliación y el chip "Sin
depositar" de Ingresos.

Una decisión suya que quedó escrita: eligió **constancia** (se anota a quién se
le entregó) y no **acuse** (que el que recibe confirme). Por eso "Pedir doble
firma" sigue apagada — por decisión, no por hueco.

### Migración 39 — "Registrado por"

Quién tecleó cada cifra. **No es un `usuario_id`** que apunte a una tabla: son
el **nombre y el rol como instantánea**, para que el registro siga diciendo
quién fue aunque esa persona deje la iglesia. Es el concepto que Iván describió:

> *"El administrador invita a la persona que va a ser la tesorera… El
> administrador es el supervisor mayor que, si un día entra porque la tesorera
> estuvo enferma, pues el nombre queda como registrado por."*

Con ella se apagó también el rastro de auditoría del handoff 1.

### Migración 40 — los cortes, listos para viajar

`uid`, `updated_at` y borrado en blando en `corte_movimientos`, con el índice
único vuelto **parcial** para que soltar un enganche devuelva ese dinero a la
caja. Las dos tablas se crearon también **en Supabase**, con RLS y sus cuatro
políticas cada una.

### Migración 41 — el testigo del acta

El renglón de firma que se imprimía en blanco porque `actas` solo conocía a
quien preside y a quien redacta. La raya discontinua se queda cuando no hay
nombre, pero ya no significa "sin motor" sino "todavía nadie ha firmado aquí".

### Migración 42 — nacimiento, dirección y estado civil

Las tres filas grises de la ficha del miembro. **Eran dos columnas, no tres**:
`direccion` existía desde la migración 1 y hasta viajaba en la sincronización,
pero nunca tuvo campo en un formulario, así que se podía leer y jamás escribir.

### Y dos cosas que no fueron migración

- **"Ocultar montos al bloquear"** — cableado (`src/privacidad.ts`): tapa las
  cifras cuando la app pasa a segundo plano.
- **"Barra lateral siempre visible"** — **RETIRADO**, el primero que sale de la
  app en vez de recibir motor, por decisión de Iván. Fijar la barra en vertical
  se come 318px y deja el maestro-detalle por debajo de los 700 que necesita
  para partirse. Y **⌃⌘S se queda solo en el Mac**, con guarda para que no se
  cuele al iPad.

---

## 4. Lo que TODAVÍA necesita motor

Ordenado por lo que cuesta, de menos a más. **Lo pequeño primero** no es
capricho: cada uno de los tres primeros es de una tarde.

### Pequeño — una consulta o una columna

| Qué | Dónde | Qué le falta exactamente |
|---|---|---|
| **"N movimientos" por categoría** | Config → Categorías | Nada nuevo: `conteoCategoriaIngreso`/`Gasto` **ya existen**. Es pintarlo |
| **Asa de arrastre para reordenar categorías** | ídem | Una columna de orden en la tabla de categorías |
| **`Folio 1042`** | Inicio y panel de Movimientos | Columna `folio` en `transactions` + un numerador. **NO se pintó** a propósito: un folio inventado se lee como un dato de contabilidad. **Pendiente de tu decisión** |

### Mediano — una función nueva, sin estructura nueva

| Qué | Dónde | Qué le falta exactamente |
|---|---|---|
| **Compartir un depósito** | Depositados, cabecera del detalle | Una hoja de compartir. La app no tiene ninguna todavía |
| **La sincronización de los cortes** | invisible, pero real | **Media hecha.** Las dos tablas ya existen en Supabase y la base local ya lleva `uid`/`updated_at`/borrado en blando. Falta **el paso en `sincronizarTodo`**: mapear ids locales ↔ uids, como ya hace `sincronizarRoster`. Hasta entonces, un corte vive en el aparato donde se hizo |
| **4 permisos del rol Tesorería** | Config → Acceso y áreas | Permisos **por acción** en vez de por rol. Hoy las cuatro filas enseñan el estado que YA se cumple con el rol (dos sí, dos no), no un estado inventado |
| **Tamaño de texto** | Config → Preferencias | **Aplazado con razón**: las pantallas del iPad usan px literales, no los tokens `--fs-*`. Encenderlo hoy escalaría la mitad de la app y la otra mitad no |
| ~~**"Recopilar firmas"**~~ | Actas | **hecho** (migración 44): recoge la constancia —quién firmó y cuándo—, no una firma digital |
| **Cierre de mes** | Config → Controles de tesorería | Hoy la app cierra por **mes natural** y la fila lo dice. "Último domingo" no es un ajuste: es otra forma de contar |

### Grande — estructura nueva

| Qué | Dónde | Qué le falta exactamente |
|---|---|---|
| **Roster por puestos** | Servicios | **Cuatro de seis puestos son plantilla**: Predicación y Dirección salen de `servicios.predica`/`.dirige`; Alabanza, Ujieres, Ofrenda y Sonido dicen "Sin asignar". Pide catálogo de puestos + asignación por servicio. Con él se encienden los cuatro **"Asignar encargado"** |
| **Orden del culto** | Servicios | `servicios` no guarda el minuto a minuto |
| **Pestaña "Familia"** | Ficha del miembro | Tabla de parentescos. `members` no guarda relaciones |
| **Mensajería dirigida** | Mensajes | `mensajes` no tiene destinatario: es un hilo único por iglesia. El aviso "lo ven las tres áreas" **dice la verdad** |

### Lo que está apagado por DECISIÓN, no por hueco

Estos no son deuda. Están así porque se decidió que estén así:

- **"Pedir doble firma"** en el corte — Iván eligió constancia, no acuse.
- **"Adjuntar foto de la ficha"** en el corte — la ficha la da el banco, así que
  en el corte todavía no existe. Se adjunta un paso después, al registrar el
  depósito, donde el campo lleva funcionando desde siempre.
- **"Barra lateral siempre visible"** — retirada.
- **Chip "Todas las categorías"** en Reportes — filtrar por categoría cambiaría
  lo que dice el PDF y el estado financiero dejaría de cuadrar contra el saldo.
- **Dirección en el EXPEDIENTE** — ya tiene columna y se pinta entre los datos,
  pero no entra en `camposFaltantes`: esa función marca lo **obligatorio**, y
  meterla ahí habría puesto el padrón entero en rojo de un día para otro.

---

## 5. Lo que viene después del motor

El orden lo puso Iván: **motor primero, después Supabase, después el cobro.**

1. **Motor** — lo de la sección 4. Va por la mitad larga.
2. **Supabase** — el backend y las credenciales de login. La 1.0 que está en el
   App Store es gratis, sin login y solo local; se hizo así para pasar la
   revisión de Apple. Esta versión activa el backend.
   - Queda abierta una pregunta que hay que contestar antes de mandarla: si la
     cuenta va a ser **obligatoria u opcional** (directriz 5.1.1(v) de Apple).
   - `docs/checklist-app-store.md` todavía describe el modelo de la 1.0 y hay
     que reescribirlo.
   - Hay datos de prueba (3 iglesias, 6 perfiles, 58 movimientos) en el
     proyecto de Supabase de producción.
   - La protección contra contraseñas filtradas está **apagada** en Supabase
     Auth. Es decisión de Iván encenderla.
3. **El cobro** — In-App Purchase / StoreKit. **No hay una línea de código
   todavía.** `urlCompra` se anula a la fuerza en los builds de App Store por
   la regla 3.1.1 de Apple.

---

## 6. Cómo se sabe que lo hecho sigue en pie

El arnés de Playwright (`pruebas/arnes-ipad.mjs`) corre **799 comprobaciones**
sobre el iPad, con las migraciones reales parseadas de `lib.rs`. Cada cosa que
se cablea entra ahí con una guarda, y **cada guarda se prueba volviendo a meter
el fallo** para ver que falla de verdad: una guarda que nunca ha fallado no ha
demostrado nada.

Se corre así:

```
pkill -f 'vite --port 142[0]'
CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node pruebas/arnes-ipad.mjs
```

Más `npx tsc --noEmit`, `npm run verificar-traducciones` (2654 claves en cada
idioma) y `npm run build:appstore`.
