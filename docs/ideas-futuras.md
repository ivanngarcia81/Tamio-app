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
