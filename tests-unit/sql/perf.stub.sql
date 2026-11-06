-- Esquema mínimo para probar migrations/performance-2026-11.sql sin Supabase. Faltan a propósito varias tablas (se deben saltar sin error).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('test.uid', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table public.students (id uuid primary key, school_code text);
create table public.teachers (id uuid primary key, role text);
create table public.teacher_assignments (id serial primary key, teacher_id uuid, school_code text);
create table public.active_time_tracking (
  id uuid default gen_random_uuid() primary key, user_id uuid not null, school_code text, role text not null,
  activity_date date default current_date, total_seconds integer default 0, last_heartbeat timestamptz default now(),
  unique (user_id, school_code, activity_date)
);
-- Con índices: projects y announcement_reads (existen); sin tabla: push_subscriptions, resource_comments, survey_responses, teacher_challenges, duelos.
create table public.projects (id serial primary key, votes integer, score integer, user_id uuid);
create table public.announcement_reads (announcement_id int, user_id uuid, unique (announcement_id, user_id));
create table public.attendance (id serial primary key, teacher_id uuid, date date);
-- Tabla con la columna que falta (topic): se debe saltar.
create table public.student_duels (id serial primary key, created_at timestamptz);
grant select on public.active_time_tracking to authenticated; -- la app puede leer (como en producción); escribir no
