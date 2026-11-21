-- Aislamiento de proyectos en los DOS sentidos (Hall de la Fama / feed de proyectos).
--
-- Antes (fix-cross-school-public-projects.sql): el interruptor schools.public_projects
-- apagado solo ocultaba los proyectos de ESA escuela a las demás. Pero los alumnos,
-- docentes y coordinadores de esa escuela seguían viendo los proyectos de las otras.
--
-- Ahora: si MI escuela tiene el interruptor apagado, solo veo proyectos de MIS
-- escuelas (la del alumno, las asignadas al docente, las de los docentes del
-- coordinador). Si ninguna de mis escuelas lo tiene apagado, todo sigue igual:
-- veo las mías y las públicas de las demás. El admin (public.is_admin()) lo ve todo.
--
-- 1) public.viewer_school_codes(): las escuelas propias de auth.uid() (SECURITY
--    DEFINER, no depende de la RLS de students).
-- 2) public.project_author_visible(uuid): se redefine con esa regla. La política
--    restrictiva "projects_select_restrict_private_school" ya la usa (no se recrea)
--    y public_project_authors() también.
--
-- ADITIVO. Seguro de re-ejecutar. Requiere haber corrido antes
-- fix-cross-school-public-projects.sql (crea project_author_visible y la política).
-- Para deshacer: volver a correr migrations/fix-cross-school-public-projects.sql.

create or replace function public.viewer_school_codes()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct c), array[]::text[])
  from (
    select s.school_code::text as c
      from public.students s
      where s.id = auth.uid()
    union
    select ta.school_code::text
      from public.teacher_assignments ta
      where ta.teacher_id = auth.uid()
    union
    select ta2.school_code::text
      from public.coordinator_assignments ca
      join public.teacher_assignments ta2 on ta2.teacher_id = ca.teacher_id
      where ca.coordinator_id = auth.uid()
  ) t
  where c is not null;
$$;
revoke all on function public.viewer_school_codes() from public;
revoke all on function public.viewer_school_codes() from anon;
grant execute on function public.viewer_school_codes() to authenticated;

create or replace function public.project_author_visible(p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.students s
      join public.schools sc on sc.code = s.school_code
      where s.id = p_author
        and (
          -- una de mis escuelas
          s.school_code = any((select public.viewer_school_codes())::text[])
          -- o una escuela pública, siempre que NINGUNA de mis escuelas tenga el interruptor apagado
          or (
            coalesce(sc.public_projects, true) = true
            and not exists (
              select 1 from public.schools mine
              where mine.code = any((select public.viewer_school_codes())::text[])
                and mine.public_projects = false
            )
          )
        )
    );
$$;
grant execute on function public.project_author_visible(uuid) to authenticated;

-- La política restrictiva "projects_select_restrict_private_school" (en projects) y
-- public.public_project_authors(uuid[]) ya llaman a project_author_visible por nombre:
-- al redefinirla aquí, ambas toman la regla nueva sin recrearlas.

notify pgrst, 'reload schema';

-- Comprobación: debe dar funcion_ok = true.
select position('viewer_school_codes' in pg_get_functiondef('public.project_author_visible(uuid)'::regprocedure)) > 0 as funcion_ok;
