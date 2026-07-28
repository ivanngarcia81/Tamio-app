# Tamio — Hoja de ruta de ideas futuras

Notas de producto para después del lanzamiento en la App Store. No es un
compromiso ni un orden fijo; es para no perder las buenas ideas.

_Última actualización: 28 de julio de 2026_

---

## 🥇 Prioridad alta (después de lanzar)

### 1. Invitar usuarios desde la app + roles reales
Hoy existe la pantalla **Configuración → Usuarios**, pero es solo un directorio:
no crea la cuenta de acceso ni envía invitación. Falta conectarla al login real
para que el comprador pueda invitar a su equipo y asignar roles (tesorero /
secretaria / administrador) **sin tocar Supabase**.
- La separación de roles **ya funciona** (cada rol ve solo su área).
- Falta: crear cuenta + asignar rol + invitar por correo (función de Supabase,
  como la de "borrar cuenta").
- **Por qué importa:** es la pieza que hace realidad el modelo "un producto donde
  el comprador reparte los roles en su iglesia".

### 2. Face ID / Touch ID para iniciar sesión
Usar biometría (plugin oficial de Tauri) para desbloquear Tamio sin escribir la
contraseña cada vez, estilo apps de banco. También puede servir de "candado"
para abrir la app.
- Funciona en iPhone/iPad (Face ID / Touch ID) y Mac (Touch ID).
- **Esfuerzo:** bajo-medio. **Ideal para una app de finanzas** (capa extra de
  seguridad + comodidad).

---

## 🚀 Expansión de plataformas

### 3. Android
La base ya es multiplataforma (Tauri) y la vista compacta de celular **ya está
lista** (la hicimos para iPhone). Faltaría construir el `.apk`, probarlo, y abrir
cuenta en **Google Play** ($25 una sola vez).
- **Por qué importa:** muchas iglesias con presupuesto ajustado usan Android.
  Podría abrir un mercado grande.

### 4. Windows
Generar el instalador `.exe` (requiere una PC con Windows o un servicio en la
nube) y probar cosas nativas (guardar archivos, imprimir). El diseño ya es
adaptable, así que la mayor parte funcionaría.

---

## 🌟 Módulo nuevo (versión 2.0)

### 5. Tamio Kids — seguridad y registro infantil
Módulo que controla la **entrada y salida de los niños** del culto y garantiza
que cada niño se vaya con la persona correcta. No es enseñanza ni contenido: es
**seguridad y registro**.

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
