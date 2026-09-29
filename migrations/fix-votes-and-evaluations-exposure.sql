-- ============================================================
-- Dos hallazgos más de la misma revisión (correr después de
-- fix-password-reset-rpc-exposure.sql y fix-students-and-notifications-rls.sql).
--
-- 1. increment_votes/decrement_votes/increment_project_votes/
--    decrement_project_votes: 4 funciones VIEJAS que tocan projects.votes
--    directo, sin SECURITY DEFINER coherente, SIN ningún chequeo de
--    auth.uid(), otorgadas a "anon". El voto real de verdad hoy pasa por
--    toggle_project_like() (ver migrations/project-votes-server-side.sql),
--    que sí es seguro (cuenta project_likes real, un voto por usuario).
--    Estas 4 quedaron colgadas de una implementación vieja -- nada del
--    código las llama (ni js/ ni supabase/functions/), así que se les
--    saca el acceso sin romper nada: cualquiera podía inflar/desinflar
--    el contador de votos público de cualquier proyecto sin login.
--
-- 2. evaluations tenía DOS políticas de SELECT permisivas al mismo
--    tiempo -- Postgres las une con OR, así que la política ancha
--    (evaluations_select_authenticated, USING (true)) anulaba a la
--    estricta que sí filtraba por dueño del proyecto. Cualquier usuario
--    autenticado (hasta un alumno) podía leer notas y feedback de
--    evaluaciones de CUALQUIER estudiante, de cualquier colegio. Se
--    reemplaza por is_staff() -- el personal (admin/docente) sigue
--    viendo todo igual que antes (lo usan kpi-engine, admin-dashboard,
--    team-performance-widget, etc.), pero un alumno ya no puede leer
--    evaluaciones ajenas por esta vía (la política vieja que sí lo deja
--    ver LAS SUYAS, "Estudiantes pueden ver detalles de sus
--    evaluaciones", no se toca).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

revoke all on function public.increment_votes(integer) from anon, authenticated, public;
revoke all on function public.decrement_votes(integer) from anon, authenticated, public;
revoke all on function public.increment_project_votes(bigint) from anon, authenticated, public;
revoke all on function public.decrement_project_votes(bigint) from anon, authenticated, public;

drop policy if exists "evaluations_select_authenticated" on public.evaluations;

create policy "evaluations_select_staff"
  on public.evaluations for select to authenticated
  using (public.is_staff());

notify pgrst, 'reload schema';
