# Handoff 2 — inventario y plan

_22 de agosto de 2026. El handoff nuevo trae **5.612 líneas** contra las 3.973
del primero, y su barra lateral tiene DOS entradas que la del primero no
tenía: `informes` y `mensajes` — las dos pantallas huérfanas que Iván
encontró probando la 1.2._

## Regla nueva de Iván, y qué cambia

> "Revisa cada página y construye una por una. Si ves funciones que no
> existen en la aplicación, constrúyela… aunque solo sea decoración; ya
> después construimos su función."

Esto **deroga el criterio del handoff 1**, donde lo que no tenía datos detrás
se descartaba (`docs/ipad-rediseno.md` §4 y §10.3). Aquello evitó dibujar
campos que nadie podía llenar; ahora el orden se invierte: primero se ve,
después funciona. La contrapartida es `docs/cascaras-1-2.md`, el registro de
lo que queda visible sin motor — que hay que revisar antes de mandar una
versión a **revisión del App Store** (a TestFlight no le afecta): un control
que no hace nada es motivo de rechazo, guideline 2.1.

## Estado

### ✅ Hechas en esta tanda

| Pantalla | Qué se construyó | Cáscara |
|---|---|---|
| **Membresía** | maestro-detalle de 400 con tres vistas, ocho tarjetas-filtro, ficha con expediente y alertas, analítica de asistencia | ninguna |
| **Informes de membresía** | índice de 330 (Periodo + cuatro informes) y detalle con su barrita | ninguna |
| **Mensajes** | chat de 720 centrado, separadores por día, hora en burbuja, nota de visibilidad | ninguna |

Las tres salieron sin cáscara: el esquema ya tenía todo lo que el handoff
pedía. La regla nueva todavía no ha hecho falta.

### 🔜 Lo que el handoff 2 vuelve a pedir y el handoff 1 descartó

**Aquí sí aplica la regla nueva.** Son las siete funciones que se rechazaron
por no tener datos detrás y que el diseño insiste en dibujar. Ordenadas por
lo que cuesta darles motor de verdad después:

| # | Pantalla | Lo que el handoff dibuja | Qué falta por detrás |
|---|---|---|---|
| 1 | **Por revisar** | Taxonomía de alertas: monto sin comprobante, duplicado probable, categoría vacía, miembro no encontrado, recurrente vencido. Más "Aprobar todo" y las acciones por alerta (Adjuntar y aprobar, Aprobar sin comprobante, Devolver al tesorero) | Hoy `Bandeja` solo lista movimientos en estado pendiente. Las cinco alertas son consultas calculables con lo que ya hay — **esta es la más barata y la más útil** |
| 2 | **Actas** | "Recopilar firmas", "Cerrar acta", tercera firma de Testigo | El estado se cambia en el formulario; el modelo guarda preside y secretario. Cerrar acta ≈ transición de estado con freno (es el punto 7 del plan 1.3) |
| 3 | **Servicios** | Roster por puestos (Predicación, Alabanza, Ujieres, Sonido…), "Orden del culto" con horas, "Asignar encargado" | No hay catálogo de puestos ni horario. Tabla nueva |
| 4 | **Depósitos** | Desglose Efectivo/Cheques, "Movimientos incluidos", "Marcar depositado", ficha con cámara | Un depósito es una fila: no guarda qué lo compone ni la forma del dinero. Es el bloque de conciliación de la 2.0 |
| 5 | **Movimientos** | "Rastro de auditoría" (creado por, editado a las…) | `transactions` solo tiene `updated_at`. Tabla nueva + escrituras en cada mutación |
| 6 | **Cartas** | Tercera columna de 298 con "Campos de la carta" | `CartaEditor` ya los enseña; es duplicación, no falta de datos |
| 7 | **Reportes** | "Conciliación bancaria" y "Depósitos del periodo" en el catálogo | La conciliación no existe (ver 4); Depósitos es una pantalla con su entrada propia |

### ⚪ Sin cambios respecto a lo construido

Inicio, Ingresos/Gastos, Aportantes, Agenda y Configuración: lo que el
handoff 2 dibuja ya está hecho. Su prototipo añade dos controles de vista
previa —`acento` (cinco colores, que la app YA tiene en Ajustes) y
`sidebarFijo`— que son del lienzo del diseñador, no ajustes de la app.

## Orden propuesto

**1 → 2 → 3**, y parar ahí a revisar con Iván. Por revisar es la que más da
por lo que cuesta (sus cinco alertas se calculan con datos existentes),
Actas engancha con el punto 7 del plan 1.3, y Servicios ya pide tabla nueva.
Las cuatro últimas tocan el bloque de conciliación, que el propio plan
manda a la 2.0 como una sola función y no como cuatro.
