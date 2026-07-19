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
2. El pago (Lemon Squeezy / Paddle / Stripe) actualiza ese campo por **webhook**.
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

**Pendiente (siguientes partes):**
- Bloqueo **duro** al vencer (pantalla con botón "renovar") — va junto con el
  pago, porque sin botón de pago un bloqueo total es un callejón sin salida.
- Formulario de **miembro básico** dentro de Tesorería (plan solo-Tesorería).
- **Integración** exclusiva del Completo (que Tesorería consuma miembros de
  Secretaría) — gate con `integracionActiva()`.
- **Pago real** (webhook de Lemon Squeezy/Paddle) que escriba estos campos, y
  sincronizar la suscripción desde la nube como autoridad.

## Decisiones tomadas
- Tres planes: Tesorería, Secretaría, Completo (Completo más barato que la suma).
- La integración entre áreas es exclusiva del Completo.
- Tesorería-solo puede crear **miembros básicos** (nombre, contacto, RFC, nota).
- Subir de plan enriquece los miembros existentes sin perder datos.

## Pendientes de decidir (a futuro)
- Precios concretos y periodicidad (mensual / anual, descuento anual).
- Proveedor de pago definitivo (recomendado: Lemon Squeezy o Paddle por manejar
  impuestos por país).
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
