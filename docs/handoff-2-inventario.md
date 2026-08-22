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

> ⚠️ **Esta tabla se rehízo el 22 de agosto por la tarde, y la primera versión
> estaba MAL.** Iván avisó de algo que yo no sabía: *"el handoff 2 fue
> diseñado usando el repo, debería ser fiel a la aplicación"*. Al verificar
> columna por columna contra `src-tauri/src/lib.rs` resultó que tenía razón:
> **de las siete funciones que declaré imposibles, solo dos lo son.** Las
> otras cinco se apoyan en datos que ya existen y que yo di por ausentes sin
> comprobarlo.
>
> La lección es la del §12 de `docs/ipad-rediseno.md` otra vez, del otro lado:
> allí fue "lo que no está en la maqueta no se revisa"; aquí fue "lo que no
> busqué en el esquema, lo declaré inexistente". Un diseño hecho SOBRE el
> repo merece que se compruebe el repo antes de contradecirlo.

| # | Pantalla | Lo que el handoff dibuja | Qué hace falta DE VERDAD |
|---|---|---|---|
| 1 | **Actas** | "Cerrar acta" | **Nada.** `actas.estado` ya tiene `aprobada` y `archivada`, y `fecha_aprobacion` existe. Es un botón sobre una transición que ya se puede hacer desde el formulario — el punto 7 del plan 1.3 le pone el freno |
| 2 | **Cartas** | Tercera columna "Campos de la carta" | **Nada.** `CartaEditor` ya los enseña, y `cartas.firmas` existe. Es decisión de maquetación, no falta de datos |
| 3 | **Movimientos** | "Registrado por: Rosa Elena Vega · tesorera" | **Una columna.** La tabla `usuarios` YA existe con `nombre` y `rol` — es exactamente el dato del diseño. Falta `transactions.usuario_id` y escribirlo al insertar. Dije "tabla nueva + escrituras en cada mutación": lo primero era falso |
| 4 | **Actas** | Tercera firma de "Testigo" | **Una columna.** `preside` y `secretario` ya están; falta `testigo` |
| 5 | **Por revisar** | Las cinco alertas + "Aprobar todo" | **Nada.** Ya está el servicio (`services/bandeja/alertas.ts`): las cinco se calculan con lo que hay |
| 6 | **Servicios** | Roster por puestos y "Orden del culto" con horas | **Estructura nueva.** `participaciones` es JSON sin forma; hace falta catálogo de puestos y horario. Hueco real |
| 7 | **Depósitos** | Desglose Efectivo/Cheques, "Movimientos incluidos", "Marcar depositado" | **Estructura nueva.** `depositos_bancarios` no tiene estado ni vínculo con `transactions`. Hueco real, y es el bloque de conciliación de la 2.0 |

**Solo 6 y 7 necesitan estructura nueva.** Las cinco primeras se construyen
con datos reales, así que la regla de "aunque sea decoración" NO aplica a
ellas: salen cableadas de verdad.

### ⚪ Sin cambios respecto a lo construido

Inicio, Ingresos/Gastos, Aportantes, Agenda y Configuración: lo que el
handoff 2 dibuja ya está hecho. Su prototipo añade dos controles de vista
previa —`acento` (cinco colores, que la app YA tiene en Ajustes) y
`sidebarFijo`— que son del lienzo del diseñador, no ajustes de la app.

## Orden propuesto

Con la tabla corregida, el orden cambia y se acorta:

1. **Por revisar** (motor ya escrito) — cablear la pantalla.
2. **Movimientos**: "Registrado por". Una columna y un join con `usuarios`.
3. **Actas**: "Cerrar acta" (ya se puede) y la firma de Testigo (una columna).
4. **Cartas**: decidir si la tercera columna se pinta o se descarta por
   duplicar lo que `CartaEditor` ya enseña. Es decisión de Iván, no técnica.
5. **Servicios** y **Depósitos**, los dos únicos con estructura nueva, al
   final — y Depósitos va con el bloque de conciliación que el plan manda
   a la 2.0 como una sola función.
