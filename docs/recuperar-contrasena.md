# Recuperar contraseña — configuración en Supabase

Tamio ya tiene el enlace **"¿Olvidaste tu contraseña?"** en la pantalla de login.
El flujo ocurre **dentro de la app** (no en una página web), con un **código de
verificación** que llega por correo:

1. El usuario pulsa "¿Olvidaste tu contraseña?" → escribe su correo → **Enviar código**.
2. Supabase le manda un código a su correo.
3. Escribe el código + su nueva contraseña → **Cambiar contraseña** → entra.

Para que esto funcione hace falta **un ajuste único en Supabase**, porque por
defecto el correo de recuperación trae un **enlace**, no un código.

---

## Paso único: que el correo mande el CÓDIGO (no un enlace)

1. Entra a **Supabase → tu proyecto → Authentication → Emails**
   (en algunas versiones aparece como **Email Templates**).
2. Abre la plantilla **"Reset Password"** (Restablecer contraseña).
3. Edita el cuerpo para que incluya el token con `{{ .Token }}`. Ejemplo:

   ```
   Hola,

   Tu código para restablecer la contraseña de Tamio es:

   {{ .Token }}

   Escríbelo en la app para crear una contraseña nueva. El código vence pronto.
   Si no fuiste tú, ignora este correo.
   ```

4. **Guarda.**

> Lo importante es que la plantilla contenga `{{ .Token }}`. Si dejas la
> plantilla por defecto (que usa `{{ .ConfirmationURL }}`), el correo trae un
> enlace en vez de un código y la app no podrá completar el cambio.

---

## Notas

- **Vencimiento del código:** en Authentication → Providers → Email hay un
  ajuste de expiración del OTP (por defecto ~1 hora). No hace falta cambiarlo.
- **Correo llega a spam:** en pruebas, revisa la carpeta de spam. Para producción
  conviene configurar un **SMTP propio** (Authentication → SMTP Settings), porque
  el correo por defecto de Supabase tiene límites bajos de envío.
- **Alternativa manual (siempre disponible):** el administrador puede restablecer
  la contraseña de cualquier usuario desde
  **Supabase → Authentication → Users → (usuario) → ⋯ → Send password recovery**
  o **Reset password**. Útil si alguien no recibe el correo.

---

## Detalle técnico (para referencia)

En el código, el flujo usa:
- `supabase.auth.resetPasswordForEmail(email)` — envía el correo con el código.
- `supabase.auth.verifyOtp({ email, token, type: "recovery" })` — valida el código
  e inicia sesión.
- `supabase.auth.updateUser({ password })` — guarda la nueva contraseña.

Archivo: `src/components/Login.tsx`.
