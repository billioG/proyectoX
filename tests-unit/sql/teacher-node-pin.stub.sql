-- Esquema mínimo para probar migrations/teacher-node-pin.sql sin Supabase: solo lo que la migración usa.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- auth.uid() de Supabase: sale de la sesión (aquí, de un ajuste que cada prueba cambia).
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;

create table public.teachers (id uuid primary key, full_name text);
create table public.students (id uuid primary key);
