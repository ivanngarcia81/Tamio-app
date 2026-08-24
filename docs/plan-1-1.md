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
cuatro; los otros seis pasaron a la 1.2 y de ahí a la 1.3.** El criterio: la 1.1 es lo que hace que
Tamio se pueda comprar, y nada más.

| En la 1.1 | A la 1.3 |
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

> **Movidos el 22 ago 2026, y no a la 1.2 sino a `docs/plan-1-3.md`.** La 1.1
> cerró —el trabajo, no una subida: esto decía "la 1.1.9 está en TestFlight" y
> **era falso**, corregido el 24 ago; ver `docs/testflight.md`— así que tocaba
> mudarlos. El número que
> les correspondía se lo llevó el rediseño de iPad, que se hizo entre el 21 y
> el 22 de agosto y no estaba en ninguna lista: la 1.2 es esa. Estos siete
> corren un puesto y nada de su contenido cambió al mudarse.
>
> Lo que queda abajo de cada uno es el título y un puntero. El razonamiento
> vive ahora en un solo sitio, que es como no acaba en dos versiones que se
> contradicen.

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
### 5. Asistencia de cultos: total = lista + contadores
### 6. Panel de trabajo de Secretaría
### 7. Integridad de los documentos oficiales — *el 3.8*
### 8. Avisos de Agenda también en Inicio

Los cinco, en **`docs/plan-1-3.md`**, con su razonamiento entero: cómo se
separa lo histórico de la asistencia (la columna `modelo_asistencia`, y por
qué no vale la fecha), la regla de oro del panel de Secretaría, y el orden de
las tres piezas de la integridad.

_(Movido a `docs/plan-1-3.md` el 22 ago 2026, cuando la 1.1 cerró con la 1.1.9 en TestFlight.)_

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

### 10. Higiene: que los errores dejen rastro

Los dos, en **`docs/plan-1-3.md`**. Del 12 salieron el Presupuesto y el cierre
mensual —lo mejor de aquellas capturas y lo único que no es cáscara—, la
Bandeja ensanchada, Ajustes con índice y el catálogo de informes; la
conciliación, los fondos designados y el ciclo de vida de la entrada se
quedaron en la 2.0, y siguen siendo una sola función y no tres.

_(Movido a `docs/plan-1-3.md` el 22 ago 2026, cuando la 1.1 cerró con la 1.1.9 en TestFlight.)_

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

Las cinco escalas comparadas, lo que de verdad diverge y lo que es histórico,
y las cuatro decisiones del 4 ago (las transiciones primero, `cancelada` en el
acta, `historial_estados` en el acta, y NO fundir `aprobada` con `lista`):
**`docs/plan-1-3.md` → *Apéndice***, junto al punto 7, que es su ejecución.

_(Movido a `docs/plan-1-3.md` el 22 ago 2026, cuando la 1.1 cerró con la 1.1.9 en TestFlight.)_

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
