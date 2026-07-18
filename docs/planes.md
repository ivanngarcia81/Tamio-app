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
