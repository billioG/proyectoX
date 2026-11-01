-- Esquema mínimo para probar migrations/xp-events.sql sin Supabase: solo las tablas y roles que la migración usa.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  xp integer, gems integer, daily_chest_last_claimed date,
  school_code text, grade text, section text
);
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  school_code text not null, grade text not null, section text not null
);
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id),
  school_code text not null, grade text not null, section text not null
);
create table public.lesson_completions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score numeric,
  status text,
  unique (lesson_id, student_id)
);
