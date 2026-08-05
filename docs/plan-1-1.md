# Tamio 1.1 — Mapa de trabajo

_Escrito el 3 de agosto de 2026, con la 1.0 en revisión de Apple._

La 1.0 es una app que funciona. **La 1.1 es la versión que se vende sola**:
alguien la compra en tamio.church, invita a su tesorero y a su secretaria, y
cada quien entra con su rol. Todo lo demás de esta lista existe para sostener
eso.

**Nada de esto se empieza hasta que Apple responda.** Un cambio grande en
`main` mientras hay un build en revisión es un riesgo sin ninguna prisa que
lo justifique.

---

## Alcance — decidido el 4 de agosto de 2026

Los diez puntos de abajo eran demasiado para una sola versión. **La 1.1 lleva
cuatro; los otros seis pasan a la 1.2.** El criterio: la 1.1 es lo que hace que
Tamio se pueda comprar, y nada más.

| En la 1.1 | A la 1.2 |
|---|---|
| 1. Centavos enteros | 4. Exportaciones que faltan |
| 2. Login + roles reales | 5. Asistencia = lista + contadores |
| 3. Encender la tienda | 6. Panel de trabajo de Secretaría |
| 9. Guarda de canal del actualizador | 7. Integridad de documentos oficiales |
| | 8. Avisos de Agenda en Inicio |
| | 10. Higiene: errores con rastro |

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

El webhook ya está escrito y adaptado a Lemon Squeezy, **pero escrito no es
desplegado**: el código vive en `supabase/functions/pago-webhook/` y nada en
el repositorio demuestra que esté corriendo. La guía paso a paso está en
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

### 9. Apagar el buscador de actualizaciones en los builds de App Store

Ver `docs/checklist-app-store.md` → *El otro enlace externo*.
`UpdateBanner.tsx:53` manda a descargar un `.dmg` de GitHub; `update.ts:49`
ya lo corta en iOS pero **no en macOS**, así que un build de la Mac App
Store lo mostraría. Hoy no dispara porque el manifiesto está en `1.0.0`, que
es una barrera de datos, no de build. Mismo patrón de canal que
`VITE_URL_COMPRA`: que `VITE_UPDATE_URL` admita un valor de apagado (hoy un
valor vacío cae al por defecto por el `||`).

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
