import { useCallback, useEffect, useState } from "react";
import { authHabilitado, supabase } from "./supabase";
import type { Role } from "./role";

export interface EstadoAuth {
  cargando: boolean;
  autenticado: boolean;
  email: string | null;
  nombre: string | null;
  /** Rol tomado del perfil en Supabase; null si el usuario no tiene rol asignado. */
  role: Role | null;
  /** true cuando el usuario entró pero no tiene un perfil/rol válido. */
  sinRol: boolean;
}

const VACIO: EstadoAuth = {
  cargando: authHabilitado, autenticado: false, email: null, nombre: null, role: null, sinRol: false,
};

/** Maneja la sesión de Supabase y deriva el rol del perfil del usuario.
 *  Si no hay credenciales configuradas, no hace nada (modo local). */
export function useSupabaseAuth(): { estado: EstadoAuth; salir: () => Promise<void> } {
  const [estado, setEstado] = useState<EstadoAuth>(VACIO);

  const cargarPerfil = useCallback(async (userId: string, email: string | null) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("perfiles")
      .select("rol, nombre")
      .eq("id", userId)
      .single();
    const rol = (data as { rol?: string; nombre?: string } | null)?.rol;
    const roleOk: Role | null = rol === "tesorero" || rol === "secretaria" ? rol : null;
    setEstado({
      cargando: false,
      autenticado: true,
      email,
      nombre: (data as { nombre?: string } | null)?.nombre ?? null,
      role: roleOk,
      sinRol: Boolean(error) || !roleOk,
    });
  }, []);

  useEffect(() => {
    if (!authHabilitado || !supabase) {
      setEstado((e) => ({ ...e, cargando: false }));
      return;
    }
    let activo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return;
      const s = data.session;
      if (s?.user) cargarPerfil(s.user.id, s.user.email ?? null);
      else setEstado({ ...VACIO, cargando: false });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!activo) return;
      if (session?.user) {
        setEstado((e) => ({ ...e, cargando: true }));
        cargarPerfil(session.user.id, session.user.email ?? null);
      } else {
        setEstado({ ...VACIO, cargando: false });
      }
    });
    return () => { activo = false; sub.subscription.unsubscribe(); };
  }, [cargarPerfil]);

  const salir = useCallback(async () => { await supabase?.auth.signOut(); }, []);
  return { estado, salir };
}
