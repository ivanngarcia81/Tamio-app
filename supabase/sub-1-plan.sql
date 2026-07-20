-- ============================================================================
-- Tamio · Suscripciones SUB-1 — el plan vive en la nube (autoridad)
-- Ejecuta esto en Supabase → SQL Editor → New query → Run (una sola vez).
--
-- La iglesia lleva su plan/estado/vencimiento en la tabla `iglesias`. Los
-- usuarios SOLO pueden leerlo (la política de lectura ya existe desde E1);
-- no hay política de escritura, así que únicamente el service_role puede
-- cambiarlo: el webhook de pago (función Edge) o tú desde el panel de
-- Supabase (Table Editor). Así un cliente no puede auto-regalarse el plan.
-- ============================================================================

alter table public.iglesias
  add column if not exists plan text not null default 'completo';
alter table public.iglesias
  add column if not exists sub_estado text not null default 'activa';
alter table public.iglesias
  add column if not exists sub_vence date;

-- Valores válidos (protege de typos al editar a mano en el panel).
do $$ begin
  alter table public.iglesias
    add constraint iglesias_plan_valido
    check (plan in ('completo', 'tesoreria', 'secretaria'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.iglesias
    add constraint iglesias_sub_estado_valido
    check (sub_estado in ('activa', 'cortesia', 'prueba', 'vencida'));
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Después de correr esto:
-- - Table Editor → iglesias: cada iglesia muestra plan/sub_estado/sub_vence
--   (por defecto completo/activa/null → nadie pierde acceso).
-- - Para REGALAR una cuenta (cortesía): pon sub_estado = 'cortesia' y deja
--   sub_vence vacío en la fila de esa iglesia. Tu propia iglesia va así.
-- - La app baja el plan en cada sincronización: la nube manda sobre lo local
--   cuando hay sesión iniciada.
-- ============================================================================
