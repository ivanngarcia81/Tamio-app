import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Las credenciales se leen de variables de entorno de Vite (.env en la raíz).
// El anon key es seguro para el cliente; NUNCA se usa aquí la service_role.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Interruptor global del inicio de sesión en la nube. En 1.0 está APAGADO:
 *  Tamio funciona 100% local, sin login obligatorio. La sincronización y la
 *  suscripción llegan en 1.1. Cambiar a true para reactivar el login. */
export const LOGIN_HABILITADO = false;

/** true solo cuando el login está habilitado Y hay credenciales configuradas.
 *  Si es false, Tamio funciona en modo local sin inicio de sesión. */
export const authHabilitado = LOGIN_HABILITADO && Boolean(url && anon);

export const supabase: SupabaseClient | null = authHabilitado
  ? createClient(url as string, anon as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
