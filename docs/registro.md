# Registro self-service (crear cuenta)

Tamio ya tiene el enlace **"Crear una cuenta nueva"** en la pantalla de login.
Con esto cada iglesia puede **registrarse sola**, sin que tú (el desarrollador)
tengas que crear el usuario a mano en Supabase.

Flujo en la app:
1. En el login, "Crear una cuenta nueva" → nombre (opcional), correo y contraseña.
2. Se crea la cuenta en Supabase.
3. El usuario queda como **administrador** de su propia iglesia (rol automático).

---

## Configuración en Supabase (una sola vez)

### 1) Trigger que asigna el rol de administrador
Está en `supabase/setup.sql` (sección 4). Cópialo en **Supabase → SQL Editor →
New query → Run**. Crea el perfil como `administrador` automáticamente cada vez
que nace un usuario nuevo:

```sql
create or replace function public.crear_perfil_al_registrarse()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), 'administrador')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_al_registrarse();
```

### 2) Confirmación de correo (decisión tuya)
En **Supabase → Authentication → Providers → Email**:
- **Confirmar correo activado** (recomendado para producción): al registrarse,
  el usuario recibe un correo y debe confirmarlo antes de entrar. La app muestra
  "Revisa tu correo para confirmarla". Requiere un buen SMTP (ver abajo).
- **Confirmar correo desactivado** (cómodo para pruebas): al registrarse entra
  directo, sin correo.

### 3) SMTP para producción
El correo por defecto de Supabase tiene límites bajos de envío. Para producción
configura un **SMTP propio** en **Authentication → SMTP Settings** (por ejemplo
Resend, SendGrid, Amazon SES). Aplica tanto a la confirmación de registro como
al código de recuperar contraseña.

---

## Notas importantes
- **Todos quedan como administrador de SU app.** Como hoy cada instalación tiene
  su propia base local (sin sincronización), esto es correcto: cada quien manda
  en su propia copia. Cuando exista la sincronización multi-iglesia, el
  administrador podrá invitar a su tesorero/secretaria dentro de la app.
- **No se sube ningún dato financiero** en el registro: solo se crea el usuario
  (auth) y su fila de rol en `perfiles`.
- **Seguridad:** en el cliente solo va la clave publishable/anon. La
  `service_role` nunca se usa en la app.

Archivos: `src/components/Login.tsx`, `supabase/setup.sql`.
