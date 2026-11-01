-- Esquema mínimo para probar migrations/node-reactions.sql sin Supabase: solo lo que la migración usa.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- Supabase trae auth.uid(); las políticas del disparador real de avisos lo usan.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$;

create table public.students (id uuid primary key default gen_random_uuid(), school_code text);
create table public.projects (id integer primary key, user_id uuid not null references public.students(id), group_id integer, votes integer not null default 0);
create table public.group_members (id integer primary key, group_id integer not null, student_id uuid not null);
create table public.project_likes (
  id bigint generated always as identity primary key,
  project_id integer not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.students(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like', 'excelente', 'wow', 'destacar', 'animo')),
  unique (project_id, user_id)
);
