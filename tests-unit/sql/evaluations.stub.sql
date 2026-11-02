-- Esquema mínimo para probar migrations/node-evaluations.sql sin Supabase: solo lo que la migración usa.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create table public.teachers (id uuid primary key default gen_random_uuid(), full_name text, role text default 'docente');
create table public.students (id uuid primary key default gen_random_uuid(), school_code text, grade text, section text);
create table public.teacher_assignments (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  school_code text not null, grade text not null, section text not null
);
create table public.projects (
  id integer primary key,
  user_id uuid not null references public.students(id),
  client_metadata jsonb,
  score integer
);
create table public.evaluations (
  id bigint generated always as identity primary key,
  project_id integer not null unique references public.projects(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id),
  total_score integer, creativity_score integer, clarity_score integer, functionality_score integer,
  teamwork_score integer, social_impact_score integer, feedback text
);
