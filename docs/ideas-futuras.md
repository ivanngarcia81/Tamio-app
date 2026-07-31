# Tamio — Hoja de ruta de ideas futuras

Notas de producto para después del lanzamiento en la App Store. No es un
compromiso ni un orden fijo; es para no perder las buenas ideas.

_Última actualización: 28 de julio de 2026_

---

## 🚨 BLOQUEANTE antes de publicar cualquier actualización

### Banner de actualizaciones: ocultarlo en iOS
`src/components/UpdateBanner.tsx` se renderiza sin condición de plataforma en
`src/App.tsx` (~línea 296). En iPhone/iPad eso significa que:

1. La app consulta `version.json` en GitHub al arrancar (petición de red silenciosa).
2. Si hay una versión más nueva, muestra un botón **"Descargar"** que abre un
   **`.dmg` de Mac** — lo que **Apple prohíbe** (directrices 3.1.1 / 2.5.2: una
   app de iOS no puede dirigir a descargar software fuera del App Store).

**Por qué no bloqueó la 1.0:** `web/version.json` dice `1.0.0` y la app es
`1.0.7`, así que `esMasNueva()` da false y el banner nunca se muestra. El
revisor no lo vio. **Decisión (28 jul 2026, Iván): se deja para la 1.1.**

> ⚠️ **PELIGRO:** el día que actualices `version.json` a una versión mayor (p. ej.
> `1.1.0`) para avisar a los usuarios de **Mac**, los usuarios de **iPhone**
> empezarán a ver un banner ofreciéndoles descargar un `.dmg`. **NO toques
> `version.json` hasta haber arreglado esto.**

**Arreglo:** condicionar `<UpdateBanner />` a que la plataforma no sea iOS
(p. ej. con `platform()` de `@tauri-apps/plugin-os`, o una bandera de build).
Toca `App.tsx`, que es código compartido con Mac/iPad.

### Tarjeta de plan: restaurar estado y vencimiento con el login
En la 1.0 (modo local) `PlanSettings.tsx` se reduce a elegir **áreas**: se
quitaron el estado (Activa/Cortesía/Prueba/Vencida) y la fecha de vencimiento.

**Por qué:** con el login apagado la tarjeta quedó *editable*, así que cualquiera
—incluido el revisor de Apple— veía "Plan / Trial / Expired / Vence el…" y podía
autoconcederse "Cortesía (no caduca)". Eso (a) usa vocabulario de suscripción
sin que exista forma de comprarla en la app, roce con la directriz 3.1.1;
(b) contradice las notas al revisor, que dicen que la app es gratis y sin muro de
pago; y (c) exponía un control del vendedor ("sirve para regalar cuentas") a los
clientes.

**Para la 1.1:** al reactivar el login la tarjeta vuelve sola a su modo de
**solo lectura** (rama `soloLectura`, ya escrita), donde la nube manda y sí tiene
sentido mostrar estado y vencimiento. No hay que rehacer nada, solo comprobar que
se ve bien.

---

## 🥇 Prioridad alta (después de lanzar)

### 1. Invitar usuarios desde la app + roles reales  — 🎯 objetivo: versión 1.1
Hoy existe la pantalla **Configuración → Usuarios**, pero es solo un directorio:
no crea la cuenta de acceso ni envía invitación. Al registrarse, cada usuario
queda como **administrador de su propia iglesia** (trigger en Supabase); no hay
forma de que una segunda persona se una a la MISMA iglesia con rol de tesorero o
secretaria desde la app. Falta conectarlo al login real para que el comprador
invite a su equipo y asigne roles **sin tocar Supabase**.
- La separación de roles **ya funciona** (cada rol ve solo su área).
- Falta: crear/invitar cuenta + unir a la misma iglesia (church_id) + asignar rol
  (función de Supabase, como la de "borrar cuenta") + pantalla de invitación.
- **Por qué importa:** es la pieza que hace realidad el modelo "un producto donde
  el comprador reparte los roles en su iglesia".
- **Decisión (28 jul 2026):** se construye en la **1.1** (opción B). Para la 1.0,
  la descripción de la App Store y del sitio se ajustaron para NO prometer la
  invitación todavía (solo "acceso por roles"). Para los primeros clientes, el
  admin/rol se asigna a mano en Supabase.

### 2. Face ID / Touch ID para iniciar sesión
Usar biometría (plugin oficial de Tauri) para desbloquear Tamio sin escribir la
contraseña cada vez, estilo apps de banco. También puede servir de "candado"
para abrir la app.
- Funciona en iPhone/iPad (Face ID / Touch ID) y Mac (Touch ID).
- **Esfuerzo:** bajo-medio. **Ideal para una app de finanzas** (capa extra de
  seguridad + comodidad).

### 3. Familias / hogares en Secretaría — cimiento de Kids
Hoy Secretaría registra **miembros individuales**. Agregar el concepto de
**familia / hogar** que agrupa personas, y donde los niños quedan dentro de su
familia.
- **Sirve por sí sola:** directorio por hogar, cartas/certificados a nombre de la
  familia, reportes por familia (no solo personas sueltas), niños registrados
  dentro de su hogar aunque no sean miembros formales.
- **Es el cimiento de Tamio Kids:** el plan de Kids (decisión 3) ya asume que las
  familias vienen de Secretaría. Construir esto primero evita que Kids lo
  reinvente. Piénsalo como la "Fase -1" de Kids.
- **Decisión de diseño clave:** una **familia** agrupa **personas**, y cada persona
  puede ser **miembro** (formal), **niño/dependiente** o **visitante**. Los niños
  **no** deben contar como miembros formales en los reportes, salvo que se quiera.
- **Tiempo sugerido:** mejora de Secretaría que puede ir en 1.1, justo antes de
  Kids. Factible: encaja con el modelo de personas que ya existe.
- Ver también: [`docs/tamio-kids-plan.md`](./tamio-kids-plan.md).

---

## 🚀 Expansión de plataformas

### 4. Android
La base ya es multiplataforma (Tauri) y la vista compacta de celular **ya está
lista** (la hicimos para iPhone). Faltaría construir el `.apk`, probarlo, y abrir
cuenta en **Google Play** ($25 una sola vez).
- **Por qué importa:** muchas iglesias con presupuesto ajustado usan Android.
  Podría abrir un mercado grande.

### 5. Windows
Generar el instalador `.exe` (requiere una PC con Windows o un servicio en la
nube) y probar cosas nativas (guardar archivos, imprimir). El diseño ya es
adaptable, así que la mayor parte funcionaría.

---

## 🌟 Módulo nuevo (versión 2.0)

### 6. Tamio Kids — seguridad y registro infantil
Módulo que controla la **entrada y salida de los niños** del culto y garantiza
que cada niño se vaya con la persona correcta. No es enseñanza ni contenido: es
**seguridad y registro**.

> 📄 **Plan técnico detallado por fases + veredicto de viabilidad:** ver
> [`docs/tamio-kids-plan.md`](./tamio-kids-plan.md). Resumen: **sí se puede
> implementar** — esta versión usa **un solo iPad designado** (sin servidor en la
> Mac ni red local), y sincroniza lo operativo por Supabase mientras salud y
> autorizados se quedan locales por no estar en la lista blanca. Encaja casi por
> completo con lo que Tamio ya tiene. Único detalle nuevo a probar temprano:
> excluir el archivo del respaldo de iCloud. Se construye por fases (0 a 7)
> después del lanzamiento en la App Store.

**Flujo de un domingo:**
1. La familia escanea su código en la tablet de la puerta y elige a sus niños.
2. Se imprimen dos etiquetas: una para el niño (nombre, sala, alergia, código de
   4 caracteres) y un recibo para el padre con el mismo código.
3. El maestro ve su sala: quiénes entraron, alergias y contacto de emergencia.
4. Al salir, el padre presenta el recibo. Si el código coincide y la persona está
   autorizada, se entrega al niño y queda registrada la hora y quién lo recogió.

**Lo que le queda a la iglesia:** asistencia infantil real por sala y culto (que
suma al culto de Secretaría), historial de quién recogió a cada niño, lista de
alergias, bitácora de incidentes, proporción maestros/niño.

**Diferenciador clave:** funciona **sin internet** y los datos de los niños
**nunca salen del edificio**.

**A cuidar:**
- El hardware es el mayor reto: tablet en la puerta + **impresora de etiquetas**.
  → **Prototipar la impresión primero.**
- Competencia establecida (Planning Center, KidCheck). Ganar en el terreno
  propio: offline, datos locales, español, iglesias pequeñas.
- En los términos, dejar claro que es una herramienta de apoyo, no una garantía.

**Idea de negocio:** podría ser un **complemento de pago aparte** (p. ej. +$8/mes
sobre el plan) para iglesias con ministerio infantil grande.

---

### 7. Conciliación bancaria (Plaid en solo lectura) — idea para la 2.0

**Idea (Iván, 29 jul 2026):** que los depósitos y movimientos del banco aparezcan
solos en Tamio, para que el presupuesto refleje lo que de verdad hay en la cuenta
y la tesorera no trabaje a ciegas. **Solo lectura**: leer transacciones y saldos,
nunca mover dinero.

#### Veredicto: viable, y no rompe el local-first

El banco **no es la autoridad**; el libro de la iglesia lo sigue siendo. Las
transacciones entran como **candidatos a conciliar**, no como registros:

1. Una Edge Function de Supabase habla con Plaid (el `access_token` es una
   credencial permanente al banco y **nunca** puede vivir en el cliente).
2. La app descarga las transacciones a una tabla local de movimientos del banco.
3. La tesorera **concilia**: empareja cada línea con un registro de Tamio, o crea
   uno. Nada se contabiliza automáticamente.

SQLite sigue siendo la fuente de verdad, todo sigue cifrado y la app sigue
funcionando sin conexión con lo último descargado. **Ya existe el patrón de UI:**
es el mismo flujo de "Pendiente de revisión".

#### Restricciones que condicionan el proyecto

- **Depende de la 1.1.** Plaid exige cuenta y token en servidor, así que solo
  puede existir para usuarios de nube/pago; es imposible en el modo local
  gratuito. Va después de que login y sync estén sólidos. (Como contrapartida,
  es una función que justifica muy bien la suscripción.)
- **Mueve la app al terreno "Finance" con Apple.** Hoy la categoría es *Business*
  justamente para evitar escrutinio extra. Conectar cuentas bancarias reales
  cambia la etiqueta de privacidad (Financial Info vinculada al usuario), obliga
  a reescribir la política otra vez y añade el proceso de aprobación de Plaid
  para Producción. Es hacedero, pero es un envío delicado por sí solo.
- **Costo por cuenta conectada.** El producto de transacciones se cobra por
  cuenta y mes (del orden de 1–1.5 USD, **verificar al contratar**). Con 1–2
  cuentas es asumible sobre 19 USD de ingreso; con 5 cuentas se come el margen.
  Conviene limitarlo al plan alto o incluir un número máximo de cuentas. Usar
  Producción sin mínimo mensual, no un contrato con mínimo (~500 USD).

#### Lo que de verdad hace valiosa la función: control, no importación

**Refinamiento de Iván (29 jul 2026), que cambia la recomendación anterior.** El
objetivo no es "traer transacciones", es que **nada salga del banco sin
justificación**: cada débito del banco debe emparejarse con un gasto registrado y
su comprobante, y cada crédito con un ingreso. Eso convierte a Tamio de un
sistema de *contabilidad* (anotar lo que pasó) en uno de **control interno**
(demostrar que nada salió sin respaldo).

En una iglesia eso es el problema real: el tesorero maneja dinero ajeno. Hoy, ante
un "¿dónde está el dinero?", la respuesta es "según mis anotaciones…"; con esto,
es "el banco dice esto y cada movimiento tiene su comprobante". Es **protección
para el tesorero** y confianza para la congregación — mucho más valioso que un
ahorro de tiempo.

**Dónde vive:** la pantalla de **Depósitos / banco** ya existe y es su hogar
natural.

#### Recomendación (corregida): desacoplar la fuente, pero lanzar con Plaid

La propuesta anterior era construir primero la importación de archivo para validar
barato. **Se descarta como plan de validación**, por dos razones:

1. El CSV **no** está atado al cierre de mes (los bancos de EE.UU. dejan descargar
   cualquier rango de fechas). La diferencia real no es mensual vs. semanal, sino
   **manual vs. automático**: ninguna tesorera va a entrar al banco, descargar un
   archivo e importarlo cada semana.
2. Por eso, validar con la versión manual daría un **falso negativo**: la
   rechazarían por tediosa y se concluiría que "la conciliación no interesa",
   cuando lo que falla es la fricción.

El plan correcto es **un motor con la fuente desacoplada**:

```
        [ Plaid ]        [ Archivo CSV/OFX ]
              \              /
               v            v
        Movimientos del banco (tabla local)
                     |
                     v
        MOTOR DE CONCILIACIÓN Y CONTROL
        · emparejar banco <-> registros de Tamio
        · marcar lo que salió sin justificar
        · exigir comprobante en cada gasto
```

- **En desarrollo** se usa la importación de archivo: gratis, sin cuenta de Plaid,
  sin esperar su aprobación de Producción y con datos de prueba.
- **Se lanza con Plaid**, que es donde está el valor.
- **El archivo se queda como respaldo permanente**: bancos que Plaid no soporte y
  iglesias del plan gratuito.

#### Advertencia de diseño: implacable, pero no bloqueante

Si la app **bloquea** o regaña de más, la tesorera la abandona. Las iglesias reales
tienen semanas desordenadas (alguien saca efectivo el domingo y trae el recibo el
jueves). Lo que funciona es una lista visible y persistente del tipo *"3 salidas
del banco sin justificar — $450"* que no desaparece hasta resolverse. **La
disciplina la impone la visibilidad, no el bloqueo.**

---

## 🔧 Pulido para la 1.1

- **Reorganizar el layout de Ajustes.** El grid de 2 columnas deja huecos
  verticales cuando una columna es más alta que la otra. Hay una propuesta
  (primitivas `SettingsPage` / `SettingsColumns` / `SettingsStack` con columnas
  de altura independiente) para que las tarjetas se apilen pegadas. Es cosmético,
  toca la pantalla de Ajustes (compartida), y conviene probarlo en simulador. Se
  dejó para la 1.1 para no arriesgar el envío de la 1.0.

---

## 💡 Ideas menores / pendientes

- Ocultar/limpiar el correo del menú lateral en capturas de marketing.
- Selector nativo de iOS (`<select>`) que respete el tema oscuro (necesitaría
  algo de Swift).
- Mover el sitio web (`docs/`) a un repo aparte para poder hacer **privado** el
  repo del código de la app.
- Definiciones de "miembro activo" y conteos (revisar con calma).

---

## ✅ Ya hecho (para referencia)

- App para Mac, iPhone y iPad (Apple).
- Tesorería + Secretaría con separación de roles.
- Sincronización en la nube (Supabase), datos locales cifrados (SQLCipher).
- Funciones de IA para redactar.
- Borrar cuenta dentro de la app + política de privacidad.
- Pagos con Paddle (en proceso de aprobación).
- Sitio web tamio.church.
