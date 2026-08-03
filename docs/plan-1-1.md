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

## Orden de ejecución

El orden importa y no es negociable en sus dos primeros puntos: los centavos
tocan toda la base de dinero (mejor antes de que haya usuarios reales con
datos), y el login es el cimiento de la venta, la tienda y el panel.

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

### 3. Encender la tienda

El webhook ya está escrito y adaptado a Lemon Squeezy; la guía paso a paso
está en `docs/guia-lemon-squeezy.md`.

- Producto único "Tamio", **$23.99/mes** (ver `docs/planes.md` → Precio).
- Fases 1–4 de la guía en modo de prueba; Fase 5 en producción.
- Enlace de compra en tamio.church, con el correo de la cuenta en el checkout.
- **Prueba de fuego:** una compra falsa activa el plan de esa iglesia sola,
  sin que nadie toque Supabase.

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
- **Decidir antes de codificar:** qué se hace con los cultos ya guardados,
  donde los contadores incluían a todo el mundo (sumarles la lista los
  contaría dos veces). La opción simple: dejar lo histórico como está y
  aplicar la regla nueva desde la fecha del cambio.

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

### 7. Higiene: que los errores dejen rastro

De la auditoría 5.4. Los 11 `catch` silenciados de `App.tsx` (y los de los
modales) pasan a `console.warn` con contexto.

- **Por qué:** un error que solo se ve "no haciendo nada" costó tres días de
  diagnóstico con el botón de restaurar; uno que deja rastro cuesta minutos.
- De paso: tipar el `payload` del tooltip de Recharts (los dos únicos `any`).

---

## Candidatos si el tiempo alcanza

- **Face ID / Touch ID** para abrir la app (plugin oficial de Tauri).
- **Recordatorios de Agenda:** decidir si se rotulan como aviso interno —hoy
  solo pintan una franja dentro de la propia Agenda— o se vuelven
  notificación real del sistema. La pregunta quedó abierta el 3 ago.
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
