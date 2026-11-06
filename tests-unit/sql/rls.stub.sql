-- Esquema mínimo para probar security-rls-audit-2026-11.sql, security-function-exposure-2026-11.sql y rls-auth-uid-initplan.sql sin Supabase.
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

create table public.teachers (id uuid primary key, role text);
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.teachers where id = auth.uid()) $f$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.teachers where id = auth.uid() and role = 'admin') $f$;
grant execute on function public.is_staff(), public.is_admin() to anon, authenticated, service_role;

-- Tablas con las políticas peligrosas tal como están en el volcado de producción.
create table public.notifications (id serial primary key, user_id uuid, title text);
create table public.teacher_notifications (id serial primary key, teacher_id uuid, title text);
create table public.teacher_badges (id serial primary key, teacher_id uuid, badge_id int);
create table public.evaluation_scores (id serial primary key, score int);
create table public.weekly_evidence (id serial primary key, teacher_id uuid, note text);
create table public.system_config (key text primary key, value text);
create table public.badges (id serial primary key, name text);
create table public.tournament_teams (id serial primary key, name text);
create table public.mine (id serial primary key, owner uuid, secret text);
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
alter table public.notifications enable row level security;
alter table public.teacher_notifications enable row level security;
alter table public.teacher_badges enable row level security;
alter table public.evaluation_scores enable row level security;
alter table public.weekly_evidence enable row level security;
alter table public.system_config enable row level security;
alter table public.badges enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.mine enable row level security;

create policy "Anyone can insert notifications" on public.notifications for insert with check (true);
create policy "Users can read own notifications" on public.notifications for select using (user_id = auth.uid());
create policy teacher_notifications_insert_authenticated on public.teacher_notifications for insert to authenticated with check (true);
create policy "Docentes ven sus insignias" on public.teacher_badges for select using (auth.uid() = teacher_id);
create policy "Inserción de insignias" on public.teacher_badges for insert with check (true);
create policy "Sistema puede otorgar insignias" on public.teacher_badges for insert with check (true);
create policy "Anyone can view scores" on public.evaluation_scores for select using (true);
create policy "Permitir lectura a todos" on public.weekly_evidence for select using (true);
create policy "Everyone can view config" on public.system_config for select using (true);
create policy "Anyone can view badges" on public.badges for select using (true);
create policy tournament_teams_select on public.tournament_teams for select using (true);
-- Políticas con auth.uid() sin envolver, de varias formas (USING, WITH CHECK, dentro de OR/AND, subconsulta, funciones).
create policy mine_select on public.mine for select to authenticated using (owner = auth.uid() or public.is_staff());
create policy mine_insert on public.mine for insert to authenticated with check ((auth.uid() = owner) and not public.is_admin());
create policy mine_update on public.mine for update to authenticated using (auth.uid() = owner) with check (auth.uid() = owner);
create policy mine_delete on public.mine for delete to authenticated using (exists (select 1 from public.teachers t where t.id = auth.uid()));

-- Funciones DEFINER: una para el ingreso (anon la necesita), una interna sin chequeo (la puerta abierta), una solo de servicio.
create function public.get_class_login_mode(p_school text) returns text language sql stable security definer set search_path = public as $f$ select 'ok'::text $f$;
create function public.resolve_login_mode_by_username(p_user text) returns text language sql stable security definer set search_path = public as $f$ select 'ok'::text $f$;
create function public.reset_anyone(p_user uuid) returns text language sql security definer set search_path = public as $f$ select 'reseteado'::text $f$;
create function public.only_for_service() returns text language sql security definer set search_path = public as $f$ select 'servicio'::text $f$;
create function public.plain_invoker() returns text language sql as $f$ select 'invoker'::text $f$;
revoke all on function public.only_for_service() from public;
grant execute on function public.only_for_service() to service_role;
grant execute on function public.reset_anyone(uuid), public.get_class_login_mode(text), public.resolve_login_mode_by_username(text), public.plain_invoker() to anon, authenticated, service_role;
