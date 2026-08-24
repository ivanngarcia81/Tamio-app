-- ============================================================================
-- Tamio · Sincronización CO1 — tablas espejo de los CORTES DE CAJA
-- Ejecuta en Supabase → SQL Editor → New query → Run (una sola vez).
-- Requiere E1 (iglesias), T1 (transactions) y D1 (depositos_bancarios).
--
-- Un CORTE es el dinero en efectivo y cheques que la tesorería cuenta junto y
-- entrega a una persona para que lo lleve al banco (migración local 38). Cubre
-- el hueco entre que el dinero sale de la caja y aparece un depósito en el
-- banco — que es justo donde una tesorera necesita estar protegida.
--
-- ⚠️ ESTE ARCHIVO SE ESCRIBIÓ DESPUÉS DE LAS TABLAS. Las dos se crearon a mano
-- en el proyecto el 24 de agosto de 2026 y el script no llegó al repo, así que
-- durante un día no hubo forma de reproducirlas. Esto refleja EXACTAMENTE lo
-- que hay en producción (columnas, índices y las ocho políticas, verificadas
-- contra `information_schema` y `pg_indexes`), y es idempotente: correrlo sobre
-- un proyecto que ya las tiene no cambia nada.
--
-- Todo se enlaza por uid globales —`deposito_uid`, `corte_uid`, `tx_uid`— y
-- nunca por el id local, que no significa nada fuera de su base. La app mapea
-- id → uid al subir y uid → id al bajar (`sincronizarCortes` y
-- `sincronizarCorteMovimientos` en src/sync.ts).
-- ============================================================================

create table if not exists public.cortes (
  uid             text primary key,
  church_id       uuid not null references public.iglesias (id) on delete cascade,
  fecha           text,          -- YYYY-MM-DD: el día que sale de la caja
  nombre          text,
  cuenta_banco    text,
  -- TEXTO, no una referencia a un perfil: quien lleva el dinero puede no usar
  -- la app, y el nombre tiene que quedar escrito aunque esa persona se borre.
  responsable     text,
  estado          text,          -- 'abierto' | 'depositado'
  -- El depósito que cerró el corte, por uid. No hay clave foránea a propósito:
  -- los depósitos pueden bajar después que los cortes, y una FK convertiría un
  -- orden de llegada en un error. La app se salta el corte hasta que su
  -- depósito exista localmente.
  deposito_uid    text,
  notas           text,
  registrado_por  text,
  registrado_rol  text,
  created_at      text,
  updated_at      timestamptz not null default now(),
  deleted         boolean not null default false
);

create index if not exists idx_cortes_church on public.cortes (church_id);
create index if not exists idx_cortes_deposito on public.cortes (deposito_uid);

-- La puente: de qué movimientos se compone cada corte.
create table if not exists public.corte_movimientos (
  uid        text primary key,
  church_id  uuid not null references public.iglesias (id) on delete cascade,
  corte_uid  text,
  tx_uid     text,
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);

create index if not exists idx_corte_movs_church on public.corte_movimientos (church_id);
create index if not exists idx_corte_movs_corte on public.corte_movimientos (corte_uid);

-- ⚠️ El índice que manda la regla del negocio, y el que más cuidado pide:
-- un movimiento pertenece a un corte VIGENTE como mucho. Es PARCIAL —solo
-- sobre las filas vivas— para que soltar un enganche devuelva ese dinero a la
-- caja; con un índice completo, la lápida seguiría ocupando el sitio.
--
-- Su consecuencia para el cliente: dos aparatos que enganchen el mismo
-- movimiento en cortes distintos NO producen un conflicto de uid que el upsert
-- sepa resolver — rompen este índice y devuelven error, y un error corta la
-- sincronización entera, no solo la de esta tabla. Por eso
-- `sincronizarCorteMovimientos` resuelve el choque ANTES de subir: gana el más
-- reciente y el otro se entierra en su propia llamada.
create unique index if not exists idx_corte_movs_tx_vivo
  on public.corte_movimientos (tx_uid) where (deleted = false);

alter table public.cortes enable row level security;
alter table public.corte_movimientos enable row level security;

-- Las cuatro de siempre, por iglesia del perfil que consulta.
drop policy if exists "cortes_select" on public.cortes;
create policy "cortes_select" on public.cortes for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "cortes_insert" on public.cortes;
create policy "cortes_insert" on public.cortes for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "cortes_update" on public.cortes;
create policy "cortes_update" on public.cortes for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "cortes_delete" on public.cortes;
create policy "cortes_delete" on public.cortes for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));

drop policy if exists "corte_movs_select" on public.corte_movimientos;
create policy "corte_movs_select" on public.corte_movimientos for select
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "corte_movs_insert" on public.corte_movimientos;
create policy "corte_movs_insert" on public.corte_movimientos for insert
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "corte_movs_update" on public.corte_movimientos;
create policy "corte_movs_update" on public.corte_movimientos for update
  using (church_id = (select church_id from public.perfiles where id = auth.uid()))
  with check (church_id = (select church_id from public.perfiles where id = auth.uid()));
drop policy if exists "corte_movs_delete" on public.corte_movimientos;
create policy "corte_movs_delete" on public.corte_movimientos for delete
  using (church_id = (select church_id from public.perfiles where id = auth.uid()));
