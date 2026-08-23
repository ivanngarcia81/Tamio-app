# Registro de cáscaras — lo visible que aún no tiene motor

_Abierto el 22 de agosto de 2026, con el handoff 2. La regla la puso Iván:
"si ves funciones que no existen en la aplicación, constrúyelas… aunque solo
sea decoración; ya después construimos su función". Este archivo es la otra
mitad de esa regla: la lista de la que se tacha. Y es lo que se revisa antes
de mandar una versión a REVISIÓN del App Store (a TestFlight no le importa):
un control que no hace nada es motivo de rechazo (guideline 2.1)._

## Cómo se apunta

Cada entrada dice QUÉ se ve, DÓNDE, qué le falta por detrás, y qué haría
falta para dárselo. Cuando se cablea, se tacha con la fecha.

## Membresía (maestro-detalle, handoff 2)

- **Nada quedó de cáscara.** Todo lo que el handoff dibujó se cableó a datos
  reales: asistencia (`AsistenciaLigera`), expediente (`camposFaltantes`),
  alertas (racha ≥ umbral y nuevo sin revisar, con `seguimiento_revisado_en`),
  movimientos (`historial_estados` + hitos de la ficha), las ocho tarjetas
  (`resumenMembresia`) y la analítica (`resumenAsistencia`).
- **"Dirección" en el expediente** — el prototipo la lista como campo del
  expediente; `members` no tiene columna de dirección. NO se pintó (un campo
  que jamás puede llenarse no es cáscara, es mentira permanente). Si se
  quiere, es una migración + campo en la ficha; entonces entra al expediente.
- **Paginación ‹ › del pie** — en el prototipo pagina; aquí la lista es de
  desplazamiento continuo y los botones desplazan una página de alto. No es
  cáscara (hacen algo real), pero se anota porque el gesto difiere del
  dibujo.

## Informes de membresía (índice maestro, handoff 2)

- **Nada quedó de cáscara.** El índice, el periodo, las cuatro vistas, la
  barrita con Imprimir/Exportar y los subtítulos con números reales ya
  existían como funciones; el trabajo fue de alojamiento, no de motor.
- **La hoja del periodo del prototipo** (`infper_abrir`, un picker en hoja)
  se resolvió con los campos inline bajo los chips — misma función, sin hoja.
  Si Iván prefiere la hoja del dibujo, es solo presentación.

## Mensajes (chat de columna centrada, handoff 2)

- **Nada quedó de cáscara.** Enviar, borrar lo propio con confirmación, el
  hilo, el estado vacío y ⌘↩ ya funcionaban; lo nuevo (columna de 720
  centrada, separadores por día, hora en la burbuja y la nota de
  visibilidad) es presentación sobre datos que ya existían.
- **El aviso "lo ven las tres áreas"** dice la verdad: `mensajes` no tiene
  destinatario, es un hilo único por iglesia. Si algún día se quiere
  mensajería dirigida, es columna nueva y no un cambio de texto.

---

> ⚠️ **Este archivo se quedó parado nueve pantallas.** Se abrió el 22 de
> agosto con Membresía, Informes y Mensajes, y **dejó de escribirse ahí**
> mientras el repaso página a página seguía por Inicio, Movimientos,
> Aportantes, Reportes, Depósitos, Por revisar, Actas, Servicios, Cartas,
> Agenda y Configuración. Lo que sigue lo pone al día: la mitad que construye
> se hizo, la mitad que apunta no. Lo cazó Iván preguntando.

## Inicio (§14)

- **Nada de cáscara.** El segmentado Mes/Trimestre/Año, las dos gráficas, los
  cuatro KPI y "Esta semana" salen de datos reales.
- **`Folio 1042` bajo cada movimiento** — el handoff lo pone; `transactions`
  no tiene columna `folio` (las cartas sí). **NO se pintó**, y no como cáscara
  sino porque un folio inventado se lee como un dato de contabilidad. Pide
  migración + numerador. **Pendiente de tu decisión.**

## Ingresos y Gastos (§15)

- **"Registrado por · Rosa Elena Vega · tesorera"** en la cabecera del panel —
  la tabla `usuarios` ya existe con `nombre` y `rol`; falta
  `transactions.usuario_id` y escribirlo al insertar. **NO se pintó.**
  Decisión tuya del 23 de agosto: *"déjalo registrado y cuando terminemos con
  el diseño se le agregan los usuarios"*. Aquí queda registrado.
- **Chip "Sin depositar"** en la lista de Ingresos — necesita la relación
  depósito↔movimiento. **NO se pintó.** Decisión tuya: *"se lo ponemos después
  del diseño"*.

## Aportantes / ficha de miembro (§16)

- **Nacimiento, dirección y estado civil** — `FichaMiembroIPad.tsx`,
  `filaSinMotor()`. **Construidos como plantilla**, en gris cursiva y con
  `title` que lo explica (`detalleMiembro.sinCapturarAyuda`). Falta migración
  de `members` con las tres columnas. Decisión tuya: *"déjalo construida la
  plantilla y después se le pone motor"*.
- **Pestaña "Familia"** — **construida vacía y con su explicación**. `members`
  no tiene relaciones ni columna de familia. Pide tabla de parentescos.

## Reportes (§17)

- **Nada de cáscara.**
- **Chip "Todas las categorías"** — **NO se construyó**, y esta vez no por
  falta de dato: filtrar por categoría cambiaría lo que dice el PDF y el
  estado financiero dejaría de cuadrar contra el saldo. Si lo quieres, lo
  natural es el informe "Ingresos por categoría" que ya está en el índice.

## Depósitos (§18)

- **Desglose Efectivo / Cheques** — `DetalleDeposito.tsx`,
  `dep-cifra--sinmotor`. **Construido como plantilla** con su explicación
  (`depositos.sinDesgloseAyuda`).
- **"Movimientos incluidos"** — **construido como plantilla**.
- **Pestaña "Pendientes"** — **construida**, y da el número que sí se sabe
  (`efectivoDisponibleHasta`, el efectivo por depositar) más la explicación de
  por qué no hay lista.
- **"Marcar depositado"** — **NO se construyó.** Ver el recuadro del final.

Las tres primeras se resuelven con **una sola pieza**: guardar qué movimientos
componen cada depósito (tabla puente `deposito_movimientos` + estado del
corte). Esa pieza también apaga el chip "Sin depositar" de §15.

## Por revisar (§19)

- **Nada de cáscara.** Las siete alertas y "Aprobar todo" se calculan con
  columnas que ya existen — que fue justo el hallazgo de esa pantalla.

## Actas (§20)

- **Renglón de firma "Testigo"** — `DetalleActa.tsx`, `da-firma--sinmotor`,
  raya discontinua y cargo en cursiva. **Construido como plantilla**, y se
  imprime igual para poder firmarlo a mano (`actas.testigoAyuda`). Falta
  **una columna**: `actas.testigo`, junto a `preside` y `secretario`.
- **"Recopilar firmas"** — **construido y DESHABILITADO**, con su `title`. No
  hay flujo de recolección de firmas. Cuando lo haya, se le quita el
  `disabled` y ya está en su sitio.
- **"Cerrar acta"** — real desde el primer día (`estado = 'aprobada'` +
  `fecha_aprobacion`).

## Servicios (§21)

- **Roster por puestos: cuatro de seis son plantilla.** Predicación y
  Dirección salen de `servicios.predica` y `.dirige`; Alabanza, Ujieres,
  Ofrenda y Sonido dicen **"Sin asignar"**. El mapeo vive en la constante
  `PUESTOS` con `campo: null`: cuando exista el roster, se cambia esa tabla y
  el resto de la tarjeta ni se entera. Pide estructura nueva (catálogo de
  puestos + asignación por servicio).
- **Tarjeta "Orden del culto"** — **construida como plantilla** con su
  explicación. `servicios` no guarda el minuto a minuto.
- **"Asignar encargado"** (el enlace azul del puesto vacío) — **NO se
  construyó.** Ver el recuadro del final.
- **"Tomar asistencia"** — real; ya existía sin botón que lo dijera.

## Cartas (§22)

- **Nada de cáscara.** El papel del editor carga `buildCartaHtml`, el mismo
  HTML que sale por la impresora y por el PDF.

## Agenda (§23)

- **Nada de cáscara.** Las cuatro vistas, el color por familia de actividad y
  el tachado de lo completado salen de `agenda.tipo` y `agenda.estado`.

## Configuración (§24)

- **Nada de cáscara**, y a propósito: lo que el handoff dibuja de más aquí son
  **interruptores**, no adornos. Ver el recuadro del final.
- **"N movimientos" por categoría** — el conteo se puede calcular
  (`conteoCategoriaIngreso`/`Gasto` ya existen); no se pintó por no meter una
  consulta nueva en la pantalla de Ajustes. Es trabajo pequeño si lo quieres.
- **Asa de arrastre para reordenar categorías** — pide una columna de orden en
  la tabla de categorías. No se pintó.
- **Cabecera de logo de "Iglesia"** (tile de 64 con iniciales + nombre a 22px
  + "Cambiar logo · Eliminar") — no se construyó porque el héroe de zona ya
  ocupa ese sitio con el mismo tamaño. Es presentación, no motor.

---

## Lo que NO se construyó, y que es decisión tuya

La regla que pusiste dice **construir aunque sea decoración**. La apliqué a
todo lo pasivo —campos, tarjetas, pestañas, renglones de firma, un botón
**apagado**— pero **me frené en los controles encendidos**, por mi cuenta y
sin preguntarte cada vez. El criterio que usé: *un campo vacío es pasivo; un
botón invita a pulsarlo, y un primario que no hace nada le miente a quien lo
toca*. Y el aviso de la cabecera de este archivo: un control que no hace nada
es motivo de rechazo del App Store (guideline 2.1) — a TestFlight no le
importa, a revisión sí.

Eso es una regla mía sobre una regla tuya, así que aquí está la lista para
que la revoques si quieres:

| Control | Dónde | Por qué me frené | Si dices que sí |
|---|---|---|---|
| **"Marcar depositado"** | Depósitos, cabecera del corte | primario grande sobre cada corte | se pinta apagado, o encendido con un aviso |
| **"Asignar encargado"** | Servicios, puesto vacío del roster | enlace azul que no lleva a ningún sitio | se pinta en gris sin enlace, o apagado |
| **"Tamaño de texto"** | Configuración → Apariencia | segmentado que no cambia nada | igual que arriba |
| **"Sidebar siempre visible"** | Configuración → Apariencia | interruptor sin nada detrás | igual |
| **"Ocultar montos al bloquear"** | Configuración → Apariencia | interruptor sin nada detrás | igual |
| **4 permisos del rol Tesorería** | Configuración → Acceso | cuatro interruptores sin nada detrás | igual |

Los tres de Apariencia y los cuatro de Acceso son, además, los que el handoff
1 ya había marcado como **inventados** (§4 de `docs/ipad-rediseno.md`): no
existen en el repo ni en el esquema.

## Cuando toque cablear, el orden que rinde más

1. **`deposito_movimientos` + estado del corte** — apaga cuatro entradas de
   una vez: desglose, movimientos incluidos, "Sin depositar" y "Marcar
   depositado".
2. **`transactions.usuario_id`** — "Registrado por", y de paso el rastro de
   auditoría que el handoff 1 pedía.
3. **`actas.testigo`** — una columna, un renglón.
4. **Tres columnas personales en `members`** — nacimiento, dirección, estado
   civil.
5. **Roster por puestos y orden del culto** — la más grande de las cinco;
   estructura nueva, no columnas.
