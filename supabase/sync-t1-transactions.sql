-- ============================================================================
-- Tamio · Sincronización T1 — tabla espejo de TRANSACCIONES en la nube
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias + perfiles.church_id) y E2 (members) ya corridos.
--
-- Clave: el vínculo con el aportante NO se guarda por id numérico local (que
-- difiere entre Macs), sino por `member_uid` (el uid global del miembro). Al
-- bajar, cada Mac resuelve ese uid a su id local. El `recurrente_id` (link a
-- gastos recurrentes locales) NO se sincroniza todavía, así que no viaja aquí.
-- ============================================================================

create table if not exists public.transactions (
  uid                text primary key,
  church_id          uuid not null references public.iglesias (id) on delete cascade,
  member_uid         text,               -- ref global al miembro (nullable)
  tipo               text,
  categoria          text,
  subcategoria       text,
  concepto           text,
  detalle            text,
  fecha              text,
  monto              double precision,
  moneda             text,
  metodo_pago        text,
  beneficiario       text,
  beneficiario_rfc   text,
  comprobante_path   text,
  emitir_constancia  int default 0,
  estado             text default 'aprobado',
  notas              text,
  created_at         text,
  updated_at         timestamptz not null default now(),
  deleted            boolean not null default false
);

create index if not exists idx_tx_church_updated
  on public.transactions (church_id, updated_at);

-- ---------------------------------------------------------------------------
-- Seguridad por iglesia (RLS): cada usuario solo ve/escribe filas de SU iglesia.
-- ---------------------------------------------------------------------------
-- "Registrado por" (migración local 39): el nombre y el rol de quien tecleó la
-- cifra, como INSTANTÁNEA y no como referencia a un perfil — un rastro de
-- auditoría tiene que seguir diciendo quién fue aunque esa persona se vaya.
alter table public.transactions add column if not exists registrado_por text;
alter table public.transactions add column if not exists registrado_rol text;

alter table public.transactions enable row level security;

drop policy if exists "tx_select" on public.transactions;
create policy "tx_select" on public.transactions for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "tx_insert" on public.transactions;
create policy "tx_insert" on public.transactions for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "tx_update" on public.transactions;
create policy "tx_update" on public.transactions for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "tx_delete" on public.transactions;
create policy "tx_delete" on public.transactions for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));

-- ============================================================================
-- Después de correr esto:
-- - En Table Editor → transactions debe existir la tabla (vacía).
-- - La app la empieza a usar en T2 (motor push/pull con mapeo member_uid).
-- ============================================================================
