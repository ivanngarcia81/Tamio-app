# Prompt · Diseño de la conciliación bancaria (Plaid)

> Pega este bloque en **Claude Design** (o en cualquier herramienta de diseño
> con IA) para maquetar las pantallas de la función bancaria antes de
> codificarla. El plan técnico completo está en `docs/plan-plaid.md`.

---

Eres un diseñador de producto que me ayuda con **Tamio**, y quiero maquetas de
una función nueva: la **conciliación bancaria**.

**Contexto de la app**

Tamio es una app de administración para **iglesias** (tesorería y secretaría)
que corre en **Mac, iPad y iPhone**. La usan personas **no técnicas**: la
tesorera y la secretaria de una iglesia. Identidad visual: logo/ícono **verde**
(una "T" sobre barras de crecimiento), interfaz limpia con tema **claro y
oscuro**, en **español**. En Mac/iPad hay un sidebar de navegación; en iPhone
la app usa hojas deslizables nativas de iOS. El dinero se muestra como
"$1,234.56".

**Qué es la función nueva**

Tamio se conecta al banco de la iglesia (con Plaid, en solo lectura) y muestra
los movimientos reales de la cuenta para que la tesorera los **concilie** con
su libro: cada salida del banco debe emparejarse con un gasto registrado y su
comprobante, y cada entrada con un ingreso o depósito. El lema de diseño:
**"nada sale del banco sin justificación"** — pero la app **nunca bloquea ni
regaña**; la disciplina la impone una lista visible y persistente, no un muro.
El banco no es la autoridad: el libro de la iglesia sigue mandando, y nada se
contabiliza automáticamente.

**Pantallas que quiero maquetar (un artboard por pantalla, en versión Mac y
versión iPhone):**

1. **Depósitos → segmento "Banco"** (el hogar de la función):
   - Tarjetas de las cuentas conectadas (nombre del banco, "···0442", saldo,
     "actualizado hace 2 h") con estado normal y estado "Reconectar" (cuando el
     banco pide volver a iniciar sesión). Máximo 2 cuentas, más un botón
     "Conectar banco".
   - Banner persistente, calmado pero imposible de ignorar:
     **"3 salidas sin justificar — $450.00"**. No es un error ni un modal: es
     una franja que vive ahí hasta que se resuelve.
   - La lista de movimientos del banco con **dos vistas conmutables**:
     - **Cronológica:** cada fila con fecha, descripción, monto; créditos
       (entró) y débitos (salió) claramente diferenciados; los "pendientes en
       el banco" atenuados.
     - **Agrupada por categoría:** una fila por categoría (Supermercado,
       Servicios, etc.) con el total y el número de movimientos, expandible; y
       una fila especial "Recurrentes / Suscripciones" que agrupa los cobros
       que se repiten cada mes.
   - En cada movimiento sin conciliar, la **sugerencia** al lado: "Coincide con:
     Gasto 'Luz CFE' · $85.00 · 12 ago" con un botón de un solo toque
     **Vincular**, y acciones secundarias: **Crear gasto**, **Crear depósito**,
     **Ignorar**.

2. **Movimientos (gastos e ingresos) — referencia cruzada:**
   - La lista de siempre del libro, donde cada registro ya conciliado lleva una
     insignia discreta **"Banco ✓"**; al tocarla se ve el detalle del movimiento
     del banco emparejado (fecha, cuenta, descripción).
   - Un panel o filtro **"Banco"** que muestra, junto al libro y en solo
     lectura, lo que entró y salió del banco en el mismo periodo — como
     referencia, con acceso directo a conciliar lo que falte.

3. **Flujo "Conectar banco":** botón → aviso de que se abrirá el navegador para
   conectar con el banco de forma segura (Plaid) → estado de espera con botón
   **"Ya conecté"** → la cuenta aparece en su tarjeta. Tono tranquilizador:
   Tamio solo LEE los movimientos, nunca puede mover dinero.

4. **Hoja de conciliación en iPhone:** la hoja deslizable de iOS para conciliar
   un movimiento: el movimiento del banco arriba, la sugerencia destacada con
   "Vincular" grande, y debajo las opciones de crear gasto/ingreso/depósito o
   ignorar.

**Principios que las maquetas deben respetar**

- Nada de jerga técnica ("Plaid", "sync", "item") de cara a la usuaria: se dice
  "tu banco", "actualizar", "reconectar".
- La lista de "salidas sin justificar" es persistente pero serena: informa, no
  culpa.
- Solo lectura siempre visible: ninguna pantalla debe sugerir que desde Tamio
  se pueda mover dinero.
- Consistencia con una app de gestión seria: tablas legibles, mucho aire,
  acciones de un toque para el caso común.

Con este contexto, maqueta las pantallas anteriores: [AJUSTA AQUÍ SI QUIERES
EMPEZAR POR UNA SOLA PANTALLA]
