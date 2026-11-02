-- Esquema mínimo para probar migrations/node-companion.sql sin Supabase: lo que usan las migraciones reales de la mascota.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$;
create table public.students (id uuid primary key default gen_random_uuid(), gems integer not null default 0, gems_earned_total integer not null default 0);
