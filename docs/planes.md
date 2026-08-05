# Planes de suscripción de Tamio (diseño)

> Fase de venta (cuando haya Apple Developer / web propia). Nada de esto se
> construye todavía; es el plan acordado con el usuario para no perderlo.
> Relacionado: `docs/fase-2.md` (venta) y `docs/sincronizacion.md` (multi-Mac).

## Idea central

Tamio se vende **por suscripción**, y como la app ya separa el trabajo en dos
áreas (**Tesorería** y **Secretaría**), se puede vender **por módulos**:

| Plan | Qué incluye | Precio (idea) |
|---|---|---|
| **Tesorería** | Ingresos, gastos, depósitos, reportes, constancias, PDF financieros | $ |
| **Secretaría** | Miembros (ficha completa), actas, cartas, traslados, servicios, asistencia | $ |
| **Completo** | Todo, integrado, con roles | $$ (menos que Tesorería + Secretaría por separado) |

**Gancho de precio:** el Completo debe costar **menos que los dos sueltos**, para
empujar a la mayoría al plan grande (que es lo que casi toda iglesia querrá).

---

## Plan Completo = una iglesia integrada (lo que la app ya hace hoy)

- Quien compra es el **administrador** (dueño de la cuenta de esa iglesia).
- Él crea los usuarios y **asigna los roles** (tesorero, secretaria).
- Los datos **fluyen entre áreas**:
  - Tesorería **usa los miembros** que registra Secretaría (aportes, constancias).
  - Secretaría **puede ver los reportes** de Tesorería.
- Es exactamente el Tamio actual: un solo grupo, roles, datos compartidos.

## Planes por separado = islas cerradas

- **Solo Tesorería:** ve *únicamente* el módulo de dinero. Nada de fichas de
  membresía, actas ni cartas.
- **Solo Secretaría:** ve *únicamente* miembros/actas/cartas. Nada de finanzas.
- No hay cruce entre áreas.

**Regla de venta importante:** la **integración** (que Tesorería reciba los
miembros y Secretaría vea el reporte) es el **beneficio exclusivo del Completo**.
Contratar los dos módulos por separado los deja como islas; para conectarlos,
se contrata Completo. Eso es lo que hace atractivo el plan grande.

---

## Miembros: cómo funciona en "solo Tesorería"

Tesorería **siempre** puede añadir miembros (sin ellos no hay a quién vincular un
aporte ni a quién emitir constancia). Lo que cambia es **el detalle de la ficha**:

- **Solo Tesorería → ficha básica** (lo que el dinero necesita):
  - Nombre
  - Teléfono / email (contacto)
  - **RFC** (clave para las constancias)
  - Nota / etiqueta
  - NO: bautismo, ministerios, instrumentos, estado de membresía, asistencia,
    seguimiento, cartas (eso es de Secretaría).
- **Solo Secretaría → ficha completa**, pero sin nada financiero.
- **Completo →** Secretaría maneja la ficha completa y Tesorería la consume.

Un tesorero no necesita saber qué instrumento toca alguien; necesita su nombre y
RFC para el recibo. Por eso "básica" no le estorba: su trabajo funciona completo.

### Subir de plan no pierde nada
Si una iglesia con "solo Tesorería" pasa a **Completo**, los **mismos miembros**
que ya creó se **enriquecen** con la ficha completa (Secretaría solo llena lo que
faltaba). Cero pérdida, cero duplicados. Upsell natural.

---

## Cómo se traduce por dentro (técnico)

Encaja casi 1:1 con lo que la app ya tiene (roles + datos compartidos):

1. Cada iglesia lleva en la nube un campo **`plan`** = `tesoreria` | `secretaria`
   | `completo` (y su estado de suscripción / fecha de vencimiento).
2. El pago (**Lemon Squeezy**, decidido el 4 ago 2026) actualiza ese campo por
   **webhook**.
3. Al iniciar sesión, Tamio lee el `plan` y **muestra solo los módulos pagados**
   — la app ya oculta secciones por rol; se le suma "según el plan".
4. **Offline:** la app guarda el último estado de suscripción válido y da un
   **periodo de gracia** (p. ej. 7–14 días sin conexión) antes de limitar, para
   no dejar a nadie fuera en una asamblea sin wifi.

### Trabajo de construcción que implica
- **Gate por plan** además del gate por rol que ya existe (mostrar/ocultar áreas).
- **Formulario de "miembro básico"** con su propio botón **dentro de Tesorería**
  (hoy los miembros solo se añaden desde Secretaría) — versión reducida a los
  4 campos.
- **Suscripción**: tabla/campos en Supabase + webhook de pago + chequeo con
  periodo de gracia offline. (Es la parte laboriosa; la división por módulos es
  la fácil, porque la app ya está partida en dos áreas.)

---

## Estado de construcción

**Parte 1 — Cimiento de módulos por plan: HECHA** (migración v31).

- La iglesia guarda `plan` (completo/tesoreria/secretaria), `sub_estado`
  (activa/cortesia/prueba/vencida) y `sub_vence` en la tabla `churches`.
  Por defecto **completo/activa** → las instalaciones actuales no cambian nada.
- El **sidebar oculta el área no contratada** según el plan (lógica en
  `src/plan.ts`, aplicada en `Sidebar.tsx`). El gate por plan se suma al gate
  por rol que ya existía.
- Panel **Ajustes → Plan y suscripción** (`PlanSettings.tsx`) donde el dueño
  (admin, o cualquiera en modo local) elige plan/estado/vencimiento. Esto hace
  también de mecanismo de **cortesía** manual mientras no haya pagos.
- Se puede **probar hoy** en local: cambia el plan en Ajustes y mira cómo el
  menú lateral muestra/oculta Tesorería o Secretaría.

**Parte 2 — Guardas por ruta + aviso de vigencia: HECHA.**

- **Guarda por ruta** (`rutaPermitidaPorPlan` en `plan.ts`, aplicada en el
  `guard()` de `App.tsx`): entrar por URL directa al área no contratada ahora
  redirige al inicio. Cierra el hueco que dejaba el ocultar-solo-el-menú.
- **Aviso de vigencia** (`SubBanner.tsx`): banner no bloqueante que avisa
  cuando la suscripción está por vencer (≤7 días), en gracia o vencida. Solo
  con login en la nube; en cortesía o sin fecha no aparece (el dueño no lo ve).
  Usa `evaluarVigencia()` (con `diasGracia`).

**Parte 3 — Miembro básico en Tesorería: HECHA.**

- El **alta/edición de miembro básico** ya existía (pestaña "Miembro" del modal:
  nombre, email, teléfono, RFC, nota + selector Miembro/Visitante) y el detalle
  en Tesorería es puramente financiero (aportes + constancia). Las secciones de
  Secretaría (bautismo, ministerios…) viven en la ficha completa, que ya queda
  oculta por plan. Así que el "miembro básico" estaba cubierto por diseño.
- Se añadió el botón **"Nuevo miembro"** en la página de Miembros (antes solo se
  podía desde el botón global "Nuevo registro"), clave para el plan
  solo-Tesorería, donde los miembros son el centro del trabajo.

**Parte 4 — Nube como autoridad + bloqueo duro + webhook: HECHA.**

- **`supabase/sub-1-plan.sql`** *(correr en Supabase una vez)*: la iglesia lleva
  `plan/sub_estado/sub_vence` en la nube. Los usuarios solo LEEN; escribe el
  webhook de pago o el dueño desde el panel (Table Editor). Un cliente no puede
  auto-regalarse el plan.
- **La app obedece la nube**: `sincronizarPlan()` baja el plan en cada
  sincronización y lo aplica en local (con sesión, la nube manda; el panel de
  Ajustes lo avisa). En modo local sin login, el panel sigue mandando.
- **Bloqueo duro**: con sesión, si la suscripción venció Y pasó el periodo de
  gracia, la app muestra una pantalla de "Suscripción vencida" (datos intactos,
  se recuperan al renovar). La cortesía y el modo local jamás se bloquean.
- **Webhook de pago listo**: `supabase/functions/pago-webhook/index.ts`
  (Lemon Squeezy). Verifica la firma, encuentra la iglesia por el correo del
  comprador y escribe el plan. Mapeo variant→plan por nombre; la cortesía es
  intocable (un evento de pago nunca degrada una cuenta regalada). Se despliega
  cuando exista la cuenta de Lemon Squeezy (instrucciones en el archivo).

**Parte 5 — Botón Renovar/Comprar: HECHA.** El banner de vigencia y la
pantalla de bloqueo muestran "Renovar suscripción" (abre el checkout en el
navegador) cuando `VITE_URL_COMPRA` está en el `.env`. Sin la variable, los
botones no aparecen (igual que la IA con su bandera).

## ✅ CIRCUITO COMPLETO PROBADO (2026-07-21)

Compra de prueba real en modo test (Tamio Complete, tarjeta 4242): Lemon
Squeezy → webhook `pago-webhook` → `iglesias` actualizada sola
(`plan=completo, sub_estado=activa, sub_vence=2026-08-21`). Tienda:
`tamio1.lemonsqueezy.com` con 3 productos (Complete $15/150, Treasury
$10/100, Secretariat $10/100). Web pública:
`ivanngarcia81.github.io/Tamio-web` (es/en + privacidad).
**El sistema de suscripciones queda terminado y validado de punta a punta.**
Falta solo: aprobación de la tienda por Lemon Squeezy (trámite) y apagar el
modo test cuando llegue.

## Cómo conectar Lemon Squeezy (pasos del dueño)

1. **Cuenta y tienda:** <https://lemonsqueezy.com> → Sign up → crear tu
   *store* (nombre: Tamio). Se puede trabajar en **modo test** de inmediato;
   activar pagos reales pide verificación (días).
2. **Productos:** para la 1.1 se vende **un solo producto** "Tamio"
   (suscripción mensual, $22 USD — ver *Precio*, más abajo).
   - ⚠️ **Corregido el 3 ago 2026:** una versión anterior de este documento
     decía que el webhook mapea los planes por el NOMBRE de la variante
     (que contenga "tesoreria"/"secretaria"). **Eso no es lo que hace el
     código.** `pago-webhook` mapea por **ID de producto o de variante**,
     configurados como secretos:
     ```bash
     supabase secrets set LEMON_PLAN_TESORERIA="123456"
     supabase secrets set LEMON_PLAN_SECRETARIA="234567"
     supabase secrets set LEMON_PLAN_COMPLETO="345678"
     ```
     Se hizo así a propósito: el nombre de una variante se puede editar en
     cualquier momento desde el panel y un cambio inocente ("Tamio
     Tesorería 2026") regalaría o quitaría áreas sin que nadie lo note.
   - Mientras **no** se configure ningún `LEMON_PLAN_*` —el caso de hoy, con
     un único producto— todo pago concede plan **completo**, que es lo
     correcto. Con el mapa configurado, un producto que no esté en él NO
     concede nada (deja el plan como estaba y lo avisa en la respuesta).
3. **Webhook:** Settings → Webhooks → New:
   - URL: `https://hkpbkpojeierxqtbmagh.supabase.co/functions/v1/pago-webhook`
   - Signing secret: inventa uno fuerte y guárdalo.
   - Eventos: `subscription_created`, `subscription_updated`,
     `subscription_expired`, `subscription_cancelled`.
4. **Desplegar la función** (en la Mac, una vez):
   ```bash
   cd ~/Desktop/tesoreria-mac-
   supabase functions deploy pago-webhook --no-verify-jwt
   supabase secrets set LEMON_WEBHOOK_SECRET=el-secreto-del-paso-3
   ```
5. **Enlace de compra en la app:** copiar la URL de checkout de la tienda
   (botón Share/Buy del producto) y ponerla en el `.env`:
   ```
   VITE_URL_COMPRA=https://TU-TIENDA.lemonsqueezy.com/checkout/...
   ```
   Reconstruir (`npm run tauri dev` o `npm run firmar:manual`).
6. **Prueba en modo test:** comprar con la tarjeta de prueba de Lemon Squeezy
   usando el correo de una cuenta de prueba de Tamio → en Supabase → iglesias,
   esa iglesia debe cambiar a plan/estado según lo comprado → la app lo baja
   en su siguiente sincronización.

> Importante: el comprador debe pagar con **el mismo correo** de su cuenta de
> Tamio (así el webhook encuentra su iglesia). El checkout de Lemon Squeezy
> pide el correo; conviene decirlo en la página de venta.
- **Integración** exclusiva del Completo (que Tesorería consuma miembros de
  Secretaría) — gate con `integracionActiva()`.
- **Pago real** (webhook de Lemon Squeezy) que escriba estos campos, y
  sincronizar la suscripción desde la nube como autoridad.

## Precio (decidido el 3 de agosto de 2026)

**$23.99 USD al mes por iglesia — UN SOLO PRECIO en todos los canales.**

Dos requisitos fijaron el número:

1. **Quedarse con $20 limpios** por iglesia, pase lo que pase.
2. **Un solo precio publicado**, igual en la web y en la App Store. Dos
   precios distintos para el mismo producto confunden al comprador y obligan
   a explicar por qué (y "porque Apple me cobra más" no es asunto suyo).

Como el precio debe ser el mismo en los dos sitios, lo manda **el canal más
caro**: Apple. El mínimo para netear $20 con su 15 % es `20 / 0.85 = $23.53`,
que se redondea a **$23.99**.

| Precio | Neto Lemon Squeezy (5 % + $0.50) | Neto Apple (15 %) | ¿Cumple $20 en ambos? |
|---|---|---|---|
| $19 | $17.55 | $16.15 | no |
| $21.58 | $20.00 | $18.34 | no |
| $22 | $20.40 | $18.70 | no |
| **$23.99** | **$22.29** | **$20.39** | **sí** |

Con este precio, cada iglesia deja **como mínimo $20.39**, y $22.29 cuando
compra por la web — el canal preferido. La diferencia (~$1.90) es el margen
extra por vender directo, no un precio distinto.

**En la 1.1 solo se vende por la web** (tamio.church con Lemon Squeezy),
aunque el precio ya esté listo para la App Store:
- Implementar compras dentro de la app es un proyecto en sí mismo y no hay
  razón para hacerlo antes de tener clientes.
- Por la web se controlan precios, cupones y cortesías al instante; en Apple
  todo pasa por su sistema de niveles.
- Es legal y común (Netflix, Spotify): la app puede pedir iniciar sesión con
  una cuenta comprada fuera. Lo único **prohibido** por Apple es poner dentro
  de la app un botón o mensaje que mande a comprar afuera.

Cuando algún día se añada la compra dentro de la app, **el precio no cambia**:
por eso se eligió $23.99 desde el principio. Subir el precio a clientes que ya
pagan es mucho más caro (en confianza) que empezar $2 más arriba.

**Lo que Lemon Squeezy da a cambio de su 5 %:** actúa como *Merchant of
Record*, o sea que legalmente el vendedor son ellos y se encargan de los
impuestos de cada estado y país. Para una persona sola, eso vale más que la
comisión. (Las tarjetas internacionales pueden sumar ~1.5 %: aun así el neto
se queda en ~$21.9, muy por encima de la meta.)

## Decisiones tomadas
- Tres planes: Tesorería, Secretaría, Completo (Completo más barato que la suma).
- La integración entre áreas es exclusiva del Completo.
- Tesorería-solo puede crear **miembros básicos** (nombre, contacto, RFC, nota).
- Subir de plan enriquece los miembros existentes sin perder datos.
- **Proveedor de pago: Lemon Squeezy** (cuenta aprobada el 3 ago 2026).
- **Precio: $23.99/mes por iglesia, el mismo en todos los canales** (ver
  arriba). En la 1.1 se vende solo por la web.
- Para la 1.1 se vende **un solo producto** (plan completo). Los tres planes
  por módulo quedan diseñados y soportados por el webhook, pero no se ponen a
  la venta todavía: primero hay que tener clientes.

## Pendientes de decidir (a futuro)
- Descuento por pago anual (p. ej. 2 meses gratis).
- Precios de los planes por módulo, si algún día se ponen a la venta.
- Prueba gratis / periodo de evaluación.
- Qué pasa exactamente al vencer (solo lectura vs bloqueo total).

---

## Regalar cuentas sin cobro (modo "cortesía")

Como dueño, se puede regalar una versión completa sin que la persona pague. La
suscripción es solo un **dato** que dice "esta cuenta está activa"; regalar es
marcarla activa **sin pasar por el cobro**.

Diseño acordado: el campo de estado de la cuenta incluye un valor **`cortesia`**
(además de `activa` y `vencida`). Una cuenta de regalo queda:

| campo | regalo |
|---|---|
| `plan` | `completo` |
| `estado` | `cortesia` |
| `vence` | `null` (nunca caduca) |

- La app solo pregunta *"¿está activa?"* — le da igual si es de pago o cortesía.
- Se mantiene **separado** de `activa` para distinguir en reportes quién paga de
  quién es regalo (y no cortar por error una cuenta que "no pagó").
- Con `vence = null` nunca caduca; el modo offline ni molesta.
- Solo el **dueño/administrador general** puede otorgar cortesías (un usuario
  normal no puede auto-regalarse).
- Alternativa: **códigos de licencia** que se generan y se entregan (para
  regalar sin conocer el correo de antemano, p. ej. en una conferencia).

### La cuenta del dueño NUNCA paga
El dueño (quien vende Tamio) **no se cobra a sí mismo**. Su propia cuenta va en
estado **`cortesia`** con `vence = null`: activa para siempre, sin cobro y sin
avisos de suscripción. Además, en **modo local** (sin login en la nube) no hay
ninguna revisión de suscripción: la app corre completa siempre. El cobro solo
aplica a las cuentas de **clientes** marcadas como de pago. En resumen: el dueño
controla el interruptor de las suscripciones, no está del lado de quien paga.

---

## Hoja de ruta general (orden completo del proyecto)

Dónde encaja cada gran bloque, incluida la app de iPad. Orden lógico, no fechas.

| # | Bloque | Estado | De quién |
|---|---|---|---|
| 1 | App Mac completa (Tesorería + Secretaría) | ✅ Hecho | — |
| 2 | Sincronización en la nube entre Macs | ✅ Código listo; falta probar 2 Macs | Tú (probar) |
| 3 | **Cuenta Apple Developer** ($99/año) — firmar/notarizar | 🔴 Pendiente | Tú (trámite) |
| 4 | **Suscripciones** (planes por módulo + cortesía + pago) | 🟡 Diseñado, sin construir | Yo |
| 5 | Política de privacidad + términos | 🟡 Pendiente | Los dos |
| 6 | **IA**: cartas (lista), luego actas, resúmenes, preguntas | 🟢 Cartas hecha; resto por hacer | Yo (+ tu clave) |
| 7 | **📱 Tamio para iPad** (ver `docs/ipad-plan.md`) | ⚪ Planeado, al final | Yo |

### Por qué el iPad va casi al final
No es por dificultad de programar (Tauri 2 soporta iPad y se reutiliza el
70–80% del código), sino porque **depende de los pasos previos**:

- Necesita la **cuenta Apple Developer** (#3) — sin ella no se instala en iPad.
- Necesita la **sincronización en la nube ya probada** (#2) — es lo que permite
  que iPad y Mac compartan datos; sin eso el iPad sería una isla.

Por eso, cerrar la sincronización (lo de ahora) es justo el **cimiento** del
iPad. El grueso del trabajo de iPad no es reprogramar, son dos cosas: la
**interfaz táctil** (Fase 2 de `docs/ipad-plan.md`) y el **trámite de Apple**.

### Recomendación de secuencia
1. **Ahora:** probar sync de las 2 Macs (#2) + generar el `.dmg` final.
2. **Luego:** Apple Developer (#3) → suscripciones (#4) para poder vender.
3. **Después:** más IA (#6) e iPad (#7), sobre la base ya estable y en uso.
