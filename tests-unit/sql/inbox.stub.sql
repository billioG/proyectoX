-- Esquema de la nube (columnas tal como las dio information_schema) con RLS y las políticas de ANTES, para probar migrations/feedback-inbox.sql sin Supabase. La sesión se simula con test.uid.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('test.uid', true), '')::uuid $f$;
create table public.schools (code text primary key, name text);
create table public.students (id uuid primary key default gen_random_uuid(), full_name text, school_code text, grade text, section text);
create table public.teachers (id uuid primary key default gen_random_uuid(), full_name text, role text, coordinator_of uuid);
create table public.teacher_assignments (id serial primary key, teacher_id uuid references public.teachers(id), school_code text, grade text, section text);
create or replace function public.is_admin() returns boolean language sql stable security definer as $f$ select exists (select 1 from public.teachers where id = auth.uid() and role = 'admin') $f$;
create or replace function public.is_staff() returns boolean language sql stable security definer as $f$ select exists (select 1 from public.teachers where id = auth.uid()) $f$;
-- coordinador: el docente cuyo id está en coordinator_of coordina a ese docente (basta para la prueba)
create or replace function public.is_coordinator_of(p_teacher uuid) returns boolean language sql stable security definer as $f$ select exists (select 1 from public.teachers where id = auth.uid() and coordinator_of = p_teacher) $f$;
create table public.student_suggestions (id serial primary key, student_id uuid references public.students(id) on delete cascade, type varchar not null, message text, rating integer, created_at timestamp default now());
create table public.teacher_ratings (
  id serial primary key, student_id uuid references public.students(id), teacher_id uuid references public.teachers(id), rating numeric, message text, created_at timestamp default now(),
  q_interest integer default 0, q_practice integer default 0, q_resources integer default 0, q_respect integer default 0, q_clarity integer default 0, best_moment text, unique (student_id, teacher_id)
);
alter table public.student_suggestions enable row level security;
alter table public.teacher_ratings enable row level security;
grant select on all tables in schema public to authenticated;
grant usage on schema auth to authenticated;
grant execute on all functions in schema auth to authenticated;
-- Políticas de ANTES (el docente podía leer de más):
create policy "student_suggestions_select_own_or_staff" on public.student_suggestions for select using (auth.uid() = student_id or public.is_staff());
create policy "teacher_ratings_select_participant_or_admin" on public.teacher_ratings for select
  using (auth.uid() = student_id or auth.uid() = teacher_id or public.is_admin() or public.is_coordinator_of(teacher_id));
