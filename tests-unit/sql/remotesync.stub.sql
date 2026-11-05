-- Esquema mínimo para probar migrations/node-remote-sync.sql sin Supabase: la sesión se simula con el parámetro test.uid.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('test.uid', true), '')::uuid $f$;
create table public.teachers (id uuid primary key default gen_random_uuid(), role text);
create table public.schools (code text primary key, name text);
create table public.teacher_assignments (id serial primary key, teacher_id uuid, school_code text, grade text, section text);
create or replace function public.is_admin() returns boolean language sql stable as $f$ select exists (select 1 from public.teachers where id = auth.uid() and role = 'admin') $f$;
create table public.school_nodes (
  id uuid primary key default gen_random_uuid(), school_code text not null, name text not null, token_hash text not null unique, created_at timestamptz not null default now(),
  last_sync_at timestamptz, last_sync_info jsonb, revoked_at timestamptz
);
