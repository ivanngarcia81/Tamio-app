import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Las credenciales se leen de variables de entorno de Vite (.env en la raíz).
// El anon key es seguro para el cliente; NUNCA se usa aquí la service_role.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true solo cuando hay credenciales configuradas. Si es false, Tamio sigue
 *  funcionando en modo local sin inicio de sesión (comportamiento actual). */
export const authHabilitado = Boolean(url && anon);

export const supabase: SupabaseClient | null = authHabilitado
  ? createClient(url as string, anon as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
