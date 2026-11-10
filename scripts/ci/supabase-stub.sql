-- Lo mínimo de Supabase que necesitan schema.sql y las migraciones para correr en un PostgreSQL común (CI).
-- NO es Supabase: son roles, esquemas y funciones vacías con la misma forma. Sirve para comprobar que el SQL aplica y deja el estado esperado.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'supabase_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I nologin', r); end if;
  end loop;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login; end if;
end $$;
grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- auth: usuarios y las funciones que usan las políticas (leen los claims de la sesión, como en Supabase).
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  deleted_at timestamptz, banned_until timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz,
  updated_at timestamptz default now(), phone text, is_anonymous boolean default false,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
create or replace function auth.role() returns text language sql stable
  as $$ select coalesce(current_setting('request.jwt.claim.role', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), 'anon') $$;
create or replace function auth.jwt() returns jsonb language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
grant usage on schema auth to anon, authenticated, service_role;

-- storage: solo las tablas que tocan las migraciones de los buckets.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb
);
alter table storage.objects enable row level security;
insert into storage.buckets (id, name, public) values
  ('profile-photos','profile-photos',true),('project-videos','project-videos',true),
  ('comment-attachments','comment-attachments',true),('teacher-evidence','teacher-evidence',true),
  ('course-content','course-content',true)
on conflict (id) do nothing;
grant usage on schema storage to anon, authenticated, service_role;

-- Publicación de Realtime (algunas migraciones agregan tablas).
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
