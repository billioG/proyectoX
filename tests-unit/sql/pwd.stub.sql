-- Esquema mínimo para probar security-hardening-2026-10.sql y student-password-hash.sql sin Supabase (la sesión se simula con test.uid).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('test.uid', true), '')::uuid $f$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.teachers (id uuid primary key, role text);
create table public.teacher_assignments (id serial primary key, teacher_id uuid, school_code text, grade text, section text);
create table public.students (
  id uuid primary key, username text, full_name text, email text, school_code text, grade text, section text, status text default 'activo',
  gems_earned_total integer default 0, xp integer default 0, birth_date date, gender text, codigo_personal text, cui varchar(20),
  created_at timestamptz default now(), created_by uuid, qr_code text, qr_data text, pin_hash text, pin_salt text,
  password_generated varchar(50)
);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.teachers where id = auth.uid() and role = 'admin') $f$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.teachers where id = auth.uid()) $f$;

-- Permisos de tabla completos para la app, como en una base de Supabase sin endurecer.
grant select, update on public.students to authenticated;
grant select on public.students to anon;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
