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
