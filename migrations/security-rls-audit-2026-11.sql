-- ============================================================
-- AUDITORÍA RLS -- NOVIEMBRE 2026: políticas demasiado abiertas
--
-- Hallazgos (sobre supabase/schema.sql, el volcado de producción, y revisando cada uso en js/ y supabase/functions/):
--
--  A. ESCRITURA abierta (WITH CHECK (true)) -- cualquiera, incluso sin sesión (rol "public" = anon + authenticated):
--       notifications        "Anyone can insert notifications"   -> podía mandar avisos falsos a la campanita de CUALQUIER usuario
--       teacher_notifications teacher_notifications_insert_authenticated -> igual, a docentes
--       teacher_badges       "Inserción de insignias" y "Sistema puede otorgar insignias" -> darle insignias a cualquier docente
--     Ningún archivo de la app ni de las funciones escribe en notifications ni teacher_notifications (solo funciones de la base
--     con SECURITY DEFINER, que no pasan por RLS), así que se quitan. teacher_badges SÍ la escribe la app (js/badges.js, awardBadge):
--     se reemplaza por una regla que solo deja otorgar a uno mismo o al personal, igual que student_badges.
--
--  B. LECTURA abierta (USING (true)) a todo el mundo, incluso SIN sesión (rol "public"):
--       - tablas que la app NUNCA lee y que no deben ser públicas: evaluation_scores, votes, likes, user_badges
--         -> solo personal.
--       - datos internos de personal que solo usan docentes/administradores: weekly_evidence (evidencias semanales de los docentes),
--         dynamic_kpis, kpi_tasks (indicadores y tareas de bonos), seasonal_milestones -> solo personal.
--       - datos que usan estudiantes y docentes pero SOLO con sesión iniciada: badges, system_config, project_likes,
--         class_weekly_topics, cosmetic_items, tournament_seasons/teams/team_members/matches -> rol authenticated (se quita anon).
--
-- No cambia lo que ve ningún usuario con sesión en estas pantallas, salvo: un estudiante ya no puede leer las evidencias semanales
-- ni los indicadores de bono de los docentes (que la app nunca le mostró).
--
-- Cada cambio se salta si la tabla o la política no existe en tu base (re-ejecutable). ADITIVO salvo las políticas retiradas.
-- Requiere: fix-is-staff-coordinador.sql (is_staff() debe reconocer al coordinador). Pegar completo en el SQL Editor.
-- ============================================================

begin;
set local lock_timeout = '10s';

do $$
begin
  if to_regprocedure('public.is_staff()') is null then
    raise exception 'security-rls-audit-2026-11: falta la función is_staff() (corre fix-is-staff-coordinador.sql primero). No se cambió nada.';
  end if;
end $$;

-- ---------- A. escrituras abiertas ----------
drop policy if exists "Anyone can insert notifications" on public.notifications;
drop policy if exists teacher_notifications_insert_authenticated on public.teacher_notifications;
drop policy if exists "Inserción de insignias" on public.teacher_badges;
drop policy if exists "Sistema puede otorgar insignias" on public.teacher_badges;

do $$
begin
  if to_regclass('public.teacher_badges') is not null then
    drop policy if exists teacher_badges_insert_own_or_staff on public.teacher_badges;
    create policy teacher_badges_insert_own_or_staff on public.teacher_badges
      for insert to authenticated
      with check (teacher_id = (select auth.uid()) or public.is_staff());
  end if;
end $$;

-- ---------- B1. lecturas solo para el personal ----------
do $$
declare
  r record;
begin
  for r in select * from (values
    ('evaluation_scores', 'Anyone can view scores'),
    ('votes',             'Anyone can view votes'),
    ('likes',             'Todos pueden ver likes'),
    ('user_badges',       'Anyone can view user badges'),
    ('weekly_evidence',   'Permitir lectura a todos'),
    ('dynamic_kpis',      'Lectura pública de KPIs'),
    ('kpi_tasks',         'Lectura pública de tareas'),
    ('seasonal_milestones','Lectura pública de hitos')
  ) as t(tbl, pol)
  loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tbl and policyname = r.pol) then
      execute format('alter policy %I on public.%I to authenticated using (public.is_staff())', r.pol, r.tbl);
    end if;
  end loop;
end $$;

-- ---------- B2. lecturas solo con sesión iniciada (se quita anon; el contenido es el mismo) ----------
do $$
declare
  r record;
begin
  for r in select * from (values
    ('badges',                 'Anyone can view badges'),
    ('system_config',          'Everyone can view config'),
    ('project_likes',          'Likes públicos'),
    ('class_weekly_topics',    'class_weekly_topics_select_all'),
    ('cosmetic_items',         'cosmetic_items_select_all'),
    ('tournament_seasons',     'tournament_seasons_select'),
    ('tournament_teams',       'tournament_teams_select'),
    ('tournament_team_members','tournament_team_members_select'),
    ('tournament_matches',     'tournament_matches_select')
  ) as t(tbl, pol)
  loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.tbl and policyname = r.pol) then
      execute format('alter policy %I on public.%I to authenticated', r.pol, r.tbl);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;

-- ---------- Verificación: no debe quedar ninguna política de ESCRITURA con (true) para public/anon/authenticated ----------
select tablename, policyname, cmd, roles::text
from pg_policies
where schemaname = 'public'
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  and (coalesce(qual, '') ~* '^\(?\s*true\s*\)?$' or coalesce(with_check, '') ~* '^\(?\s*true\s*\)?$')
  and not (roles::text ~* 'service_role' and roles::text !~* '(public|anon|authenticated)')
order by tablename, policyname;
