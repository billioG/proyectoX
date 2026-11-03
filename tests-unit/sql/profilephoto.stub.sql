-- Esquema mínimo para probar migrations/node-profile-photo.sql sin Supabase.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create table public.students (id uuid primary key default gen_random_uuid(), profile_photo_url text, xp integer not null default 0, gems integer not null default 0);
create table public.teachers (id uuid primary key default gen_random_uuid(), profile_photo_url text, xp integer not null default 0, gems integer not null default 0);
