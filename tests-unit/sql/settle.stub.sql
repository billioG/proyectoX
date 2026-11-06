-- Esquema mínimo (columnas reales del volcado de producción) para probar migrations/random-event-settle-atomic.sql.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
create table public.students (id uuid primary key, gems integer default 0);
create table public.teachers (id uuid primary key, gems integer default 0);
create table public.random_events (
  id uuid primary key default gen_random_uuid(), scheduled_for timestamptz not null default now(), duration_minutes integer not null default 15,
  gem_pool integer not null default 100, status text not null default 'active', target_role text not null default 'estudiante'
);
create table public.event_participants (
  id uuid primary key default gen_random_uuid(), event_id uuid not null, user_id uuid not null, submitted_at timestamptz, score integer,
  time_taken_ms integer, gems_awarded integer not null default 0, rank integer, unique (event_id, user_id)
);
