# Tamio · Fase 2 — De app interna a producto vendible

> **Cuándo se arranca esto:** cuando consigas la cuenta de **Apple Developer**
> ($99/año). Hasta entonces, Tamio se usa en modo interno (ver
> `DISTRIBUCION.md`). Esta fase convierte la app en algo que puedes repartir a
> otras iglesias sin fricción y, si quieres, cobrar por ella.
>
> El orden de abajo es de **menos a más esfuerzo**. No hace falta hacerlo todo
> de golpe: cada bloque aporta valor por sí solo.

---

## Bloque 1 · Firma y notarización (lo primero e imprescindible)

**Problema que resuelve:** hoy el `.dmg` da el aviso *"desarrollador no
identificado"* y en otras Macs cuesta abrirlo. Firmar + notarizar lo elimina.

1. Crear la cuenta en <https://developer.apple.com> ($99/año).
2. En Xcode, descargar el certificado **"Developer ID Application"**.
3. Configurar la firma en `src-tauri/tauri.conf.json` (bloque `macOS` →
   `signingIdentity`) y las credenciales de notarización como variables de
   entorno (`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`).
4. `npm run dist` — Tauri firma y notariza el `.dmg` automáticamente.

**Resultado:** el `.dmg` se abre con doble clic en cualquier Mac, sin avisos.

> Con esto ya puedes **repartir Tamio a otras iglesias** por tu cuenta (fuera
> del App Store). Para muchos casos, esto es suficiente.

---

## Bloque 2 · Auto-gestión de usuarios (para no crear cuentas a mano)

**Problema que resuelve:** hoy TÚ creas cada usuario en Supabase. Con muchos
clientes eso no escala. Se necesita que cada iglesia se administre sola.

1. **Registro self-service:** pantalla de "Crear cuenta"
   (`supabase.auth.signUp`). El primer usuario de cada iglesia queda como
   `administrador` y desde la app invita al tesorero y la secretaria.
2. **Trigger en Postgres:** al nacer un usuario en `auth.users`, se crea solo
   su fila en `perfiles` con rol por defecto (SQL ya bosquejado en el chat).
3. **Recuperar contraseña:** enlace "¿Olvidaste tu contraseña?"
   (`supabase.auth.resetPasswordForEmail`). Supabase manda el correo solo.

**Esfuerzo:** ~1 pantalla nueva + el trigger. Cambia el modelo de "yo doy
acceso" a "el cliente se registra solo".

---

## Bloque 3 · Sincronización entre dispositivos (Fase 2 de Supabase)

**Problema que resuelve:** hoy los datos son **locales por Mac** (SQLite). Si
una iglesia usa dos computadoras, no comparten movimientos ni miembros.

- Subir los datos financieros y de miembros a Supabase (Postgres) con
  Row Level Security por iglesia (cada quien solo ve lo suyo).
- Estrategia de sincronización local ↔ nube (offline-first: la app sigue
  funcionando sin internet y sincroniza al reconectar).

**Esfuerzo:** el más grande de todos. Es un cambio de arquitectura de datos.
Solo vale la pena si de verdad hay iglesias con varios equipos.

> ⚠️ Decisión de privacidad: subir datos financieros y de miembros a la nube
> es un salto importante. Confirmar que las iglesias lo quieren antes de
> construirlo. Alternativa: mantener todo local y ofrecer solo respaldo
> manual (como hoy).

---

## Bloque 4 · Requisitos del App Store (solo si publicas ahí)

Repartir el `.dmg` firmado (Bloque 1) NO requiere App Store. Pero si quieres
estar **dentro** del App Store de Mac, Apple exige:

- **Sign in with Apple** como opción de login (obligatorio si ofreces otros
  logins).
- **Borrar cuenta** desde dentro de la app.
- **In-App Purchase** si cobras por la app o suscripción (Apple se lleva
  15–30%). El login de Supabase es aparte del pago.
- Cumplir las **App Review Guidelines** (privacidad, política de datos, etc.).
- Empaquetar como `.pkg` para el App Store (no `.dmg`).

---

## Resumen de decisión

| Objetivo | Qué necesitas |
|---|---|
| Que el `.dmg` se abra sin avisos en otras Macs | **Bloque 1** |
| Repartir a varias iglesias que se auto-gestionan | Bloques 1 + 2 |
| Iglesias con varios dispositivos sincronizados | Bloques 1 + 2 + 3 |
| Vender dentro del App Store de Mac | Bloques 1 + 2 + 4 (y 3 si aplica) |

**Recomendación:** empezar por el **Bloque 1** en cuanto tengas el Apple
Developer. Es lo que desbloquea todo lo demás y ya te deja repartir Tamio de
forma profesional. Los demás bloques se hacen según la demanda real.

---

## Datos del proyecto (para retomar rápido)

- **Supabase project:** `hkpbkpojeierxqtbmagh`
  (URL `https://hkpbkpojeierxqtbmagh.supabase.co`).
- **Roles actuales:** `administrador` (todo), `tesorero` (solo Tesorería),
  `secretaria` (Secretaría + Reporte de Tesorería).
- **Identifier de la app:** `com.tesoreria.app` — **nunca cambiar** (de él
  depende la carpeta de datos local).
- **Clave publishable (pública, segura):**
  `sb_publishable_ID9sV2QyuwYtLUC8ipf8iQ_RaWJ--lt`. La `service_role` y la
  contraseña de la base **nunca** van en el cliente.
