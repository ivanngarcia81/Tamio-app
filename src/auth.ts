import { useCallback, useEffect, useRef, useState } from "react";
import { authHabilitado, supabase } from "./supabase";
import type { Role } from "./role";

export interface EstadoAuth {
  cargando: boolean;
  autenticado: boolean;
  email: string | null;
  nombre: string | null;
  /** Foto de perfil (data URL) o null. Se guarda en perfiles.foto y sincroniza. */
  foto: string | null;
  /** Rol tomado del perfil en Supabase; null si el usuario no tiene rol asignado. */
  role: Role | null;
  /** true cuando el usuario entró pero no tiene un perfil/rol válido. */
  sinRol: boolean;
}

const VACIO: EstadoAuth = {
  cargando: authHabilitado, autenticado: false, email: null, nombre: null, foto: null, role: null, sinRol: false,
};

/** Maneja la sesión de Supabase y deriva el rol del perfil del usuario.
 *  Si no hay credenciales configuradas, no hace nada (modo local). */
export function useSupabaseAuth(): {
  estado: EstadoAuth;
  salir: () => Promise<void>;
  guardarPerfil: (cambios: { nombre: string; foto: string | null }) => Promise<void>;
  borrarCuenta: () => Promise<void>;
} {
  const [estado, setEstado] = useState<EstadoAuth>(VACIO);
  const userIdRef = useRef<string | null>(null);

  const cargarPerfil = useCallback(async (userId: string, email: string | null) => {
    if (!supabase) return;
    userIdRef.current = userId;
    const { data, error } = await supabase
      .from("perfiles")
      .select("rol, nombre, foto")
      .eq("id", userId)
      .single();
    const rol = (data as { rol?: string; nombre?: string } | null)?.rol;
    const roleOk: Role | null = rol === "tesorero" || rol === "secretaria" || rol === "administrador" ? rol : null;
    setEstado({
      cargando: false,
      autenticado: true,
      email,
      nombre: (data as { nombre?: string } | null)?.nombre ?? null,
      foto: (data as { foto?: string | null } | null)?.foto ?? null,
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

  /** Elimina la cuenta del usuario (requisito de Apple). Llama a la función de
   *  servidor `borrar-cuenta` —que borra perfil, iglesia y cuenta de auth con
   *  permisos de admin— y luego cierra la sesión. El llamador se encarga de
   *  vaciar los datos locales y recargar. */
  const borrarCuenta = useCallback(async () => {
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { error } = await supabase.functions.invoke("borrar-cuenta", { body: {} });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const cuerpo = await ctx.json().catch(() => null) as { error?: string } | null;
        if (cuerpo?.error) throw new Error(cuerpo.error);
      }
      throw error;
    }
    await supabase.auth.signOut();
  }, []);

  const guardarPerfil = useCallback(async (cambios: { nombre: string; foto: string | null }) => {
    if (!supabase || !userIdRef.current) return;
    const nombre = cambios.nombre.trim() || null;
    const { error } = await supabase
      .from("perfiles")
      .update({ nombre, foto: cambios.foto })
      .eq("id", userIdRef.current);
    if (error) throw error;
    setEstado((e) => ({ ...e, nombre, foto: cambios.foto }));
  }, []);

  return { estado, salir, guardarPerfil, borrarCuenta };
}
