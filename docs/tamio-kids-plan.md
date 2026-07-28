# Tamio Kids — Plan de desarrollo dentro de Tamio

> **Evaluación de viabilidad (revisión técnica, 28 jul 2026):** ver la sección
> "Veredicto de viabilidad" al final. Resumen: **sí se puede implementar, y esta
> versión es la buena.** Al pasar a **un solo dispositivo (el iPad designado)** se
> elimina la parte más riesgosa (servidor en la Mac + red local + sync entre
> iPads). Lo que queda encaja casi por completo con patrones que Tamio ya tiene:
> SQLite cifrada, sync por lista de tablas, roles, sidebar por secciones, motor de
> PDF, respaldos. El único detalle nuevo a verificar temprano es excluir el
> archivo del respaldo de iCloud (`isExcludedFromBackup`) desde Tauri iOS.

Plan por fases para construir Kids como tercera sección de la app existente. Cada fase se entrega funcionando y se puede pausar ahí sin dejar el proyecto a medias.

---

## Decisiones ya cerradas (no volver a abrirlas)

Escritas aquí para que no se renegocien a mitad del desarrollo:

1. Kids es una sección de la app Tamio, no una app aparte.
2. Un solo dispositivo: el iPad designado del ministerio infantil. Sin servidor en la Mac, sin red local, sin sincronización entre dispositivos de Kids.
3. Secretaría → Kids, una vía: `persona_id`, nombre, fecha de nacimiento, vínculo familiar.
4. Kids → Secretaría, una vía: solo conteos.
5. Salud y autorizados: locales al iPad designado. Nunca a Supabase.
6. Sincronización por **lista blanca** de tablas.
7. Un rol `infantil` en Supabase; las voluntarias se identifican con PIN de turno dentro de Kids.
8. Sin QR en v1. Sin impresora térmica en v1. Etiquetas en PDF.
9. Modo emergencia va en v1.
10. Sin consentimiento firmado, el código no permite capturar datos de salud.

---

## Puntos de integración con lo que ya existe

Antes de escribir nada nuevo, hay que localizar y reutilizar:

| Ya existe en Tamio | Cómo lo usa Kids |
|---|---|
| Tabla de personas / miembros | Kids no crea miembros. Lee los activos y les agrega ficha infantil |
| Tabla de servicios (Secretaría) | `sesiones_kids` cuelga de `servicio_id`. La asistencia infantil suma al mismo culto |
| Roles en backend (admin/tesorero/secretaria) | Se agrega `infantil` con el mismo mecanismo de restricción |
| Sidebar con secciones TREASURY / SECRETARY | Tercera sección CHILDREN |
| Kit de PDF con membrete y firmas | Etiquetas, hoja de alergias, asistencia mensual, formulario de inscripción |
| Exportar/importar respaldo | Se extiende con el respaldo cifrado de Kids |
| Tutorial guiado y página de Ayuda | Se agregan las pantallas de Kids |
| Indicador "Synced" del sidebar | Se le agrega el estado local de Kids |

Regla: si Tamio ya lo hace, Kids no lo reimplementa.

---

## Fase 0 — Andamiaje (S)

Objetivo: que la sección exista, vacía, con los permisos correctos. Nada funcional todavía.

**Se entrega**

- Rol `infantil` en Supabase y en la validación del backend
- Tercera sección del sidebar: CHILDREN, con sus ítems en gris/deshabilitados
- Matriz de visibilidad: admin ve las tres secciones; `infantil` ve solo CHILDREN; tesorero y secretaria no ven CHILDREN
- Bandera de compilación `kidsEnabled` para poder publicar Tamio sin Kids mientras se desarrolla
- Concepto de **dispositivo designado**: campo en Configuración, y aviso en cualquier otro dispositivo

**Criterio de aceptación**

- Login como tesorero: CHILDREN no aparece ni es alcanzable por deep link
- Login como `infantil`: solo CHILDREN, sin Tesorería ni Secretaría
- Intento de leer un endpoint de Kids con rol tesorero → rechazado en el backend, no solo oculto en la UI
- En un iPhone que no es el designado, la sección muestra el aviso y no campos vacíos

---

## Fase 1 — Esquema y contrato de sincronización (M)

La fase más importante del proyecto. Si esto queda mal, todo lo demás hereda el error.

**Se entrega**

- Migración con las tablas del esquema (ver documento de plan revisado)
- **Lista blanca de sincronización** como una sola constante en un solo archivo:

```
SYNC_ALLOWLIST = [
  familias, familia_personas, ninos_ficha_publica,
  sesiones_kids, kids_conteos
]
```

- `ninos_salud`, `autorizados_recogida`, `checkins`, `incidentes` y `auditoria` **no están en la lista** y por tanto no existen para el sincronizador
- Separación de `ninos_ficha` en dos: la parte que sincroniza (salón, estado, inicio de asistencia) y la que no
- Triggers que bloquean `UPDATE` y `DELETE` en `checkins` y `auditoria`
- Base cifrada con SQLCipher; llave en Keychain; archivo excluido del respaldo de iCloud (`isExcludedFromBackup`)

**Criterio de aceptación — pruebas automatizadas obligatorias**

- Test que falla si `ninos_salud` o `autorizados_recogida` aparecen en la carga de sincronización
- Test que falla si se agrega una tabla nueva y sincroniza sin estar en la lista blanca
- `UPDATE` sobre `checkins` → error del trigger
- Inspeccionar el tráfico de red durante una sesión completa de captura: cero campos de salud
- Verificar en el sistema de archivos que el `.sqlite` tiene el atributo de exclusión de iCloud

Esta fase no se cierra hasta que esas pruebas están en verde y corren en cada compilación. Son las que sostienen la promesa que le vas a hacer a los padres.

---

## Fase 2 — Personas (M)

**Se entrega**

- Familias, con vínculo a personas de Secretaría
- Ficha infantil: fecha de nacimiento, salón, estado, inicio de asistencia, foto opcional
- Salones con rango de edad, capacidad y ratio objetivo
- Asignación automática de salón por edad, con cambio manual
- Registro rápido de visitante (queda local hasta que Secretaría registre a la familia)
- Consentimientos: formulario imprimible con tu membrete, captura de fecha y firmante, adjuntar escaneo, casillas separadas para foto y para salud, vencimiento anual

**Criterio de aceptación**

- Un niño registrado en Secretaría aparece en Kids sin captura manual
- Un visitante creado en Kids no aparece en Secretaría
- Cambiar el nombre en Secretaría se refleja en Kids
- No se puede guardar salud si no hay consentimiento con `permite_medico = 1`

---

## Fase 3 — Salud y autorizados (M)

**Se entrega**

- `ninos_salud`: alergias, medicamentos, instrucciones, restricciones alimentarias, contacto de emergencia, gravedad
- `autorizados_recogida` con los tres estados: permanente, temporal con vencimiento, restringido
- Restringido solo lo crea o quita un administrador, con documento adjunto
- Insignia **Solo en este dispositivo** en toda pantalla con estos datos
- Auditoría de cada consulta a salud
- Visibilidad por rol: voluntaria ve el símbolo y las instrucciones esenciales; encargado ve todo

**Criterio de aceptación**

- Rol voluntaria intentando leer `ninos_salud` completo → 403 y registro en auditoría
- Un autorizado temporal vencido aparece en amarillo y no permite entrega sin excepción
- El motivo de una restricción no es visible para una voluntaria

---

## Fase 4 — La puerta (L)

La fase más grande y la única que se prueba con gente real.

**Se entrega**

- Pantalla Puerta a pantalla completa, con salida por PIN
- PIN de turno: abrir turno, indicador `Turno: María R.` visible, cambio rápido, cierre por inactividad
- Check-in: búsqueda por apellido y por últimos 4 dígitos del teléfono, lista de familias del domingo pasado, selección múltiple de hermanos, asignación de salón, alerta discreta de salud, generación de código
- Código de seguridad: alfabeto sin confusables, único por sesión con reintento
- Check-out: código, verificación contra autorizados, **recogida parcial con casillas**, confirmación e invalidación por niño
- Pantalla roja de bloqueo sin botón de continuar
- Protocolo de excepción con PIN de encargado y motivo obligatorio
- Etiquetas en PDF: hoja adhesiva con etiqueta del niño y recibo del tutor
- Camino de falla: tarjetas pre-impresas numeradas

**Criterio de aceptación**

- Check-in completo de una familia de tres niños en menos de 45 segundos
- Recogida parcial invalida solo los códigos entregados
- Persona restringida: sin ninguna ruta para completar la entrega desde la puerta
- Código duplicado en la misma sesión: imposible
- Impresora desconectada: el check-in se completa igual

---

## Fase 5 — Cierre y respaldo (M)

**Se entrega**

- Cierre de sesión que **no se puede completar** con niños en `presente`: obliga a resolver cada uno
- `cerrado_auto` con motivo escrito y alerta al día siguiente
- Respaldo cifrado `.tamiokids` obligatorio antes de cerrar, con dos destinos
- Llave de recuperación impresa en la instalación
- Restauración con **pantalla de verificación de conteos**
- Checklist de cierre: respaldo hecho, iPad guardado en el gabinete

**Criterio de aceptación**

- No existe forma de cerrar el servicio sin exportar respaldo
- Restaurar en un iPad limpio reproduce los conteos exactos
- La instalación no se marca completa hasta que se restauró una vez en otro dispositivo

---

## Fase 6 — Emergencia y reportes (S)

**Se entrega**

- Modo emergencia: botón siempre visible, lista por salón, impresión automática de la hoja, estados evacuado / entregado / pendiente / requiere ayuda, conteo grande de "dentro del edificio"
- Reportes: asistencia por servicio y por salón, niños nuevos, visitantes por seguir, promedio mensual, excepciones, ratio adulto:niño
- Hoja de alergias por salón para pegar en la pared
- Conteos a Secretaría vía la tabla sincronizada `kids_conteos`
- Asistencia mensual en PDF firmada por el director infantil

**Criterio de aceptación**

- Ningún reporte que salga de Kids contiene un dato médico, salvo la hoja de alergias por salón
- Secretaría ve conteos y nunca nombres asociados a salud

---

## Fase 7 — Endurecimiento y ensayo (M)

**Se entrega**

- Política de retención configurable y herramienta de purga con vista previa
- Exportar todo lo de un niño en PDF; borrar todo lo de un niño
- Política escrita de aviso por pérdida de dispositivo
- Tutorial de Kids y página de Ayuda
- Ensayo del miércoles con la iglesia

**Ensayo (obligatorio antes del primer domingo)**

1. Diez familias de prueba, tres salones, 25 niños
2. Corrida completa con cronómetro
3. Simular: etiqueta perdida, impresora sin papel, persona restringida, hermanos en distinto salón, recogida parcial, iPad reiniciado a media corrida
4. Simulacro de evacuación con hoja impresa
5. La voluntaria más nueva opera sola, sin ayuda

Si no puede sola, la interfaz está mal — no la voluntaria.

---

## Orden de trabajo con Claude Code

Una fase por sesión, y en cada una:

1. Pegar las decisiones cerradas de este documento como contexto fijo
2. Pegar solo el esquema de las tablas de esa fase
3. Pedir primero las pruebas, después la implementación
4. Terminar la sesión cuando los criterios de aceptación pasan
5. No empezar la siguiente fase con la anterior en amarillo

Las fases 1 y 4 son las que no se deben apurar. La 1 sostiene la promesa de privacidad; la 4 es la que puede fallar con veinte familias esperando en la puerta.

---

## Lista de verificación antes de publicar

- [ ] Pruebas de lista blanca en verde
- [ ] Tráfico de red inspeccionado: cero salud
- [ ] Exclusión de iCloud verificada en el dispositivo
- [ ] Restauración probada en un iPad distinto
- [ ] Llave de recuperación impresa y guardada
- [ ] Persona restringida sin ruta de escape
- [ ] Cierre de servicio bloqueado con niños presentes
- [ ] Emergencia imprime sin depender de red
- [ ] Ensayo del miércoles completado
- [ ] Formularios de consentimiento impresos y firmados por las familias

---

## Fuera de alcance de v1

QR familiar y de recibo, impresora térmica de red, varias estaciones, servidor local, pase digital para padres, notificaciones a tutores, kiosco de autoservicio, firma digital, varias sedes, reservas anticipadas.

Todo eso entra cuando una iglesia real haya usado la v1 durante un mes y te diga cuál falta primero. Antes de eso, cualquier orden que elijas es una adivinanza.

---

## Veredicto de viabilidad (revisión técnica)

**Contexto:** Tamio es Tauri 2 + React + SQLite/SQLCipher (una conexión Rust bajo
mutex, `foreign_keys ON`, WAL), **ya es local-first con sincronización a Supabase
por una lista explícita de tablas** (sync.ts), tiene roles (role.ts), sidebar por
secciones (ya hechas Tesorería y Secretaría), motor de PDF propio, respaldos en
Configuración, y arnés de pruebas headless con `node:sqlite`.

**Este plan encaja con esa base casi por completo. Sí se puede implementar.**

### ✅ Lo que ya calza con patrones existentes (bajo riesgo)
- **Sección CHILDREN en el sidebar** → se agrega igual que se agregaron Tesorería y
  Secretaría. Patrón ya resuelto dos veces.
- **Rol `infantil`** → mismo mecanismo de roles que ya existe.
- **Lista blanca de sincronización** → Tamio **ya sincroniza por lista de tablas**;
  las tablas de Kids operativas se agregan a esa lista y las sensibles simplemente
  no. La constante única + el test que falla si una tabla sincroniza sin estar en
  la lista es una salvaguarda fácil de añadir. Esto responde exactamente a la
  duda "usar Supabase": se usa para lo operativo, y lo sensible se queda local por
  no estar en la lista. **Modelo correcto.**
- **Modelo de datos, código de 4 chars, autorizados/restringidos, máquina de
  estados, recogida parcial, excepción** → lógica de aplicación sobre el mismo motor.
- **Triggers que bloquean UPDATE/DELETE** en checkins/auditoria → SQLite nativo.
- **Etiquetas, recibo, hoja de alergias, inscripción, asistencia** → reutilizan el
  kit de PDF (solo falta el formato de hoja adhesiva; trabajo de plantilla).
- **Salud con permiso por rol + consentimiento que bloquea captura** → los roles ya
  están; el bloqueo es una regla de negocio.
- **Respaldo cifrado + llave de recuperación** → extiende el respaldo existente.
- **Asistencia ligada al `servicio`** → conecta con la tabla actual de Secretaría.
- **Emergencia (consulta de solo lectura + impresión)** → barata y de alto valor.
- Todas las pruebas de las fases 1–7 caben en el arnés headless actual.

### ⚠️ Los pocos puntos nuevos a verificar temprano (no bloqueantes)
1. **Excluir el `.sqlite` del respaldo de iCloud (`isExcludedFromBackup`).** Es el
   único detalle nativo de iOS que Tamio hoy no hace. Es un atributo de archivo
   (`NSURLIsExcludedFromBackupKey`) que probablemente requiera un pedacito de código
   Rust/nativo o un plugin. **Sugerencia: probarlo en la Fase 1, aislado**, porque
   sostiene la promesa "los datos de los niños no salen del iPad".
2. **Rechazo en el backend, no solo en la UI (Fase 0).** Hoy el gateo de roles de
   Tamio es sobre todo en el frontend (role.ts). El plan pide (bien) que el backend
   rechace. Aterrizarlo: para tablas que sí van a Supabase, **políticas RLS** por
   rol `infantil`; para las tablas locales (salud, autorizados), **chequeos en la
   capa Rust/motordb**. Son dos puntos de aplicación, ambos factibles, pero es
   trabajo real, no gratis.
3. **El respaldo cifrado es la ÚNICA copia de lo sensible.** Como salud/autorizados
   nunca van a la nube, si se pierde el iPad y no hay respaldo, ese dato se perdió.
   El plan ya lo cubre (Fase 5: respaldo obligatorio antes de cerrar, dos destinos,
   llave impresa, restauración probada). Solo subrayarlo: **esa fase no es opcional.**

### Sugerencias
- **Empieza por Fase 0 + Fase 1 y no avances hasta que la 1 esté 100% en verde.** El
  plan ya lo dice; lo reafirmo: la promesa de privacidad vive o muere en la Fase 1.
- **Prototipa el `isExcludedFromBackup` primerísimo**, antes de construir pantallas.
  Si por alguna razón no se pudiera en el contexto Tauri iOS, es mejor saberlo el
  día 1 y ajustar la promesa, no el día 40.
- **Mantén `kidsEnabled` en falso en producción** hasta que las fases 0–6 estén
  completas, para poder seguir publicando Tamio sin Kids a medias.
- El resto del plan (fases, criterios de aceptación, ensayo del miércoles, orden de
  trabajo con Claude Code) está muy bien pensado — se sigue tal cual.

**Conclusión:** esta versión es la implementable. La decisión de "un solo iPad" quitó
el riesgo grande, y el modelo "sincroniza lo operativo por Supabase, guarda lo
sensible local por no estar en la lista blanca" es exactamente el correcto. Se
construye después del lanzamiento en la App Store, fase por fase, empezando por 0 y 1.
