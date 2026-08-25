-- ============================================================================
-- Tamio · R1 — el REGISTRO de lo que pasa en la iglesia
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias).
--
-- **Sustituye a `mensajes` como pantalla**, por decisión de Iván (25 ago 2026)
-- y con un argumento que se sostiene solo: *"las personas ya tienen WhatsApp e
-- iMessage"*. Un chat dentro de Tamio compite con algo que hace mejor otra
-- app y obliga a mirar dos sitios.
--
-- Lo que SÍ tiene sentido ya estaba enterrado ahí dentro: la app avisaba del
-- cambio de estado de un miembro, mezclado entre mensajes tecleados a mano.
-- Eso —lo que solo Tamio sabe que pasó— es lo que aquí se convierte en la
-- función entera.
--
-- No confundir con la BANDEJA: aquella dice qué te FALTA POR HACER; esta, qué
-- HA PASADO. Ninguna sustituye a la otra.
--
-- Tres decisiones de la tabla, y las tres tienen su porqué:
--
--   · `tipo` + `datos` (JSON) en vez del texto ya compuesto. Es como
--     `mensajes` NO lo hacía, y por eso su aviso se quedaba congelado en el
--     idioma en que se escribió. Guardando la clave y sus piezas, el texto lo
--     compone i18n al leer y sigue el idioma de quien mira. De regalo,
--     `verificar-traducciones` puede vigilar esos textos, cosa que con la
--     frase ya armada era imposible.
--   · `area` decide QUIÉN lo ve. El tesorero ve lo del dinero, la secretaria
--     lo del padrón, el administrador todo (decisión de Iván). Va en columna y
--     no se deduce del `tipo` para que añadir un suceso no obligue a tocar la
--     tabla de quién-ve-qué.
--   · `cuerpo` es SOLO para las notas a mano. Un suceso automático nunca lo
--     usa: su texto se compone. Así la lista distingue de un vistazo lo que
--     escribió la app de lo que escribió una persona.
-- ============================================================================

create table if not exists public.registro (
  uid        text primary key,
  church_id  uuid not null references public.iglesias (id) on delete cascade,
  -- Clave del suceso ('mov_eliminado', 'corte_entregado', 'carta_emitida'…) o
  -- 'nota' cuando lo escribió una persona.
  tipo       text,
  -- tesoreria | secretaria | general. General es lo que ve todo el mundo.
  area       text,
  -- Las piezas del texto, en JSON: {"nombre":"María","de":"activo"}. Vacío en
  -- las notas.
  datos      text default '{}',
  -- Solo notas a mano. NULL en los sucesos automáticos.
  cuerpo     text,
  -- Quién lo hizo, como INSTANTÁNEA del nombre: si esa persona se da de baja
  -- del directorio, el registro tiene que seguir diciendo quién fue.
  quien      text,
  creado_en  text,
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);
create index if not exists idx_registro_church on public.registro (church_id, creado_en);
create index if not exists idx_registro_area on public.registro (church_id, area);

alter table public.registro enable row level security;

drop policy if exists "registro_select" on public.registro;
create policy "registro_select" on public.registro for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "registro_insert" on public.registro;
create policy "registro_insert" on public.registro for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "registro_update" on public.registro;
create policy "registro_update" on public.registro for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "registro_delete" on public.registro;
create policy "registro_delete" on public.registro for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
