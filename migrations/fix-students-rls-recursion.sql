-- ============================================================
-- CRÍTICO: fix-students-and-notifications-rls.sql rompió TODA lectura de
-- la tabla students -- "infinite recursion detected in policy for
-- relation students". La política nueva comparaba contra la MISMA tabla
-- con un subquery directo (select ... from public.students me where ...):
-- Postgres necesita evaluar la política de RLS para leer esa subconsulta,
-- y esa política vuelve a necesitar la subconsulta -- círculo infinito,
-- error duro en vez de colgarse.
--
-- Mismo error que ya se evitó en otras políticas de este proyecto (ver
-- is_staff()/is_admin()/is_assigned_teacher_for_project()): la consulta a
-- la MISMA tabla protegida tiene que pasar por una función SECURITY
-- DEFINER, que al ejecutarse con privilegios del dueño de la función NO
-- vuelve a pasar por RLS -- rompe el círculo.
--
-- Efecto real en producción mientras estuvo activa: CUALQUIER select a
-- students fallaba con 500 -- login se veía "sin clase asignada" y en
-- 0 gemas/XP/racha (el dato en la base seguía intacto, solo no se podía
-- leer), los 5 retos 1v1 no cargaban compañeros de clase, cursos no
-- cargaba. No fue pérdida de datos.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL
-- Editor de Supabase YA -- students no se puede leer hasta correr esto.
-- ============================================================

create or replace function public.my_classroom_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select school_code || '|' || grade || '|' || section
  from public.students
  where id = auth.uid();
$$;

grant execute on function public.my_classroom_key() to authenticated;

drop policy if exists "students_select_self_staff_or_classmate" on public.students;

create policy "students_select_self_staff_or_classmate"
  on public.students for select to authenticated
  using (
    public.is_staff()
    or auth.uid() = id
    or public.my_classroom_key() = (school_code || '|' || grade || '|' || section)
  );

notify pgrst, 'reload schema';
