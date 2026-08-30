-- FIX del fix: el REVOKE UPDATE (columna) de economy-server-side.sql NO
-- alcanzó -- Supabase ya tenía un GRANT UPDATE de TABLA COMPLETA a
-- "authenticated" desde antes (probablemente el "grant all on all tables"
-- por defecto). En Postgres, un privilegio a nivel de COLUMNA revocado no
-- anula un privilegio más amplio a nivel de TABLA que sigue vigente --
-- por eso la prueba de la consola (update({gems:99999})) seguía
-- funcionando (status 204, sin error) después de correr la primera
-- migración.
--
-- La forma correcta (mismo patrón que ya usa duel-harden.sql para ocultar
-- la columna "questions"): REVOCAR TODO el privilegio de UPDATE de la
-- tabla, y volver a otorgarlo solo en la lista explícita de columnas
-- permitidas -- todas MENOS las de economía. Se arma la lista
-- dinámicamente desde information_schema en vez de escribirla a mano,
-- para no repetir el error de asumir qué columnas existen (ya pasó con
-- streak_freeze en teachers).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL
-- Editor de Supabase.

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'students'
    and column_name not in ('xp', 'gems', 'daily_chest_last_claimed', 'streak_freeze', 'has_gold_frame', 'has_mascot_glasses');

  execute 'revoke update on public.students from authenticated';
  execute format('grant update (%s) on public.students to authenticated', cols);
end $$;

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'teachers'
    and column_name not in ('xp', 'gems', 'daily_chest_last_claimed', 'streak_freeze');

  execute 'revoke update on public.teachers from authenticated';
  execute format('grant update (%s) on public.teachers to authenticated', cols);
end $$;

-- Mismo problema pudo haber afectado projects.votes -- se aplica el
-- mismo arreglo por las dudas (revoca TODO, regranta todo menos "votes").
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'projects'
    and column_name not in ('votes');

  execute 'revoke update on public.projects from authenticated';
  execute format('grant update (%s) on public.projects to authenticated', cols);
end $$;

notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICAR después de correr esto (debe fallar con "permission denied
-- for column gems"):
--   update students set gems = 99999 where id = auth.uid();
-- corrido como usuario autenticado (o repetir la prueba de la consola del
-- navegador con supabase.from('students').update({gems:99999})...).
-- ============================================================
