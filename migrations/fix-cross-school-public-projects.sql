-- Regresión de fix-students-and-notifications-rls.sql: al restringir `students`
-- a "uno mismo / personal / compañeros de clase", la política restrictiva de
-- projects (school-project-visibility.sql) dejó de ver al autor de los
-- proyectos de OTRAS clases (su subquery a students pasa por RLS), y ocultaba
-- proyectos de colegios públicos. Además el embed students(...) de esos
-- proyectos llegaba null, sin nombre de autor.
--
-- 1) La lógica de visibilidad pasa a una función SECURITY DEFINER (no depende
--    de la RLS de students), que la política reutiliza.
-- 2) public_project_authors(): devuelve SOLO nombre/curso/escuela/foto de los
--    autores de proyectos que el usuario puede ver -- sin exponer el resto de
--    la fila de students (cui, email, contraseñas, pin, etc.).

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
          coalesce(sc.public_projects, true) = true
          or s.school_code = (select school_code from public.students where id = auth.uid())
          or exists (
            select 1 from public.teacher_assignments ta
            where ta.teacher_id = auth.uid() and ta.school_code = s.school_code
          )
          or exists (
            select 1 from public.coordinator_assignments ca
            join public.teacher_assignments ta2 on ta2.teacher_id = ca.teacher_id
            where ca.coordinator_id = auth.uid() and ta2.school_code = s.school_code
          )
        )
    );
$$;
grant execute on function public.project_author_visible(uuid) to authenticated;

drop policy if exists "projects_select_restrict_private_school" on public.projects;
create policy "projects_select_restrict_private_school"
  on public.projects as restrictive for select
  using (public.project_author_visible(user_id));

create or replace function public.public_project_authors(p_user_ids uuid[])
returns table (
  id uuid,
  full_name text,
  school_code text,
  grade text,
  section text,
  school_name text,
  profile_photo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.full_name, s.school_code::text, s.grade::text, s.section::text,
         sc.name, s.profile_photo_url
  from public.students s
  left join public.schools sc on sc.code = s.school_code
  where s.id = any(p_user_ids)
    and exists (select 1 from public.projects p where p.user_id = s.id)
    and public.project_author_visible(s.id);
$$;
grant execute on function public.public_project_authors(uuid[]) to authenticated;

notify pgrst, 'reload schema';
