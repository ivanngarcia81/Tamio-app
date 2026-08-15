import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Las credenciales se leen de variables de entorno de Vite (.env en la raíz).
// El anon key es seguro para el cliente; NUNCA se usa aquí la service_role.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Interruptor global del inicio de sesión en la nube. Encendido en 1.1: la
 *  puerta de entrada (`invitar-usuario`, disparador de iglesia en el
 *  registro) ya está desplegada y comprobada — ver docs/plan-1-1.md, punto 2.
 *  Sigue en modo local si no hay credenciales en el .env (ver authHabilitado
 *  abajo), así que una instalación sin configurar no se rompe. */
export const LOGIN_HABILITADO = true;

/** true solo cuando el login está habilitado Y hay credenciales configuradas.
 *  Si es false, Tamio funciona en modo local sin inicio de sesión. */
export const authHabilitado = LOGIN_HABILITADO && Boolean(url && anon);

export const supabase: SupabaseClient | null = authHabilitado
  ? createClient(url as string, anon as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
