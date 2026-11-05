-- Esquema de la nube (tal como lo dio information_schema) para probar migrations/node-feedback.sql sin Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create table public.students (id uuid primary key default gen_random_uuid(), school_code text, grade text, section text);
create table public.teachers (id uuid primary key default gen_random_uuid());
create table public.teacher_assignments (id serial primary key, teacher_id uuid references public.teachers(id), school_code text, grade text, section text);
create table public.student_suggestions (
  id serial primary key, student_id uuid references public.students(id) on delete cascade, type varchar not null, message text, rating integer, created_at timestamp default now()
);
create table public.teacher_ratings (
  id serial primary key, student_id uuid references public.students(id), teacher_id uuid references public.teachers(id), rating numeric check (rating >= 1 and rating <= 5), message text,
  created_at timestamp default now(), q_interest integer default 0, q_practice integer default 0, q_resources integer default 0, q_respect integer default 0, q_clarity integer default 0, best_moment text,
  unique (student_id, teacher_id)
);
