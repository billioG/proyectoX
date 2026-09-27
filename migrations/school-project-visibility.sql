-- ============================================================
-- VISIBILIDAD DE PROYECTOS POR ESTABLECIMIENTO + REPORTES DEL
-- COORDINADOR
--
-- 1) schools.public_projects (default true) -- si un colegio lo apaga,
--    sus proyectos dejan de verse en el Hall de la Fama y en el feed de
--    OTRAS escuelas. Sus propios docentes/alumnos, el admin, y cualquier
--    coordinador de sus docentes lo siguen viendo igual.
-- 2) Política RESTRICTIVA en "projects": se agrega a lo que ya existe
--    (no reemplaza ninguna política), así que solo puede achicar quién
--    ve un proyecto, nunca ampliarlo.
-- 3) RPC set_school_public_projects: para que un coordinador pueda
--    prender/apagar el switch de SUS escuelas (las de sus docentes
--    asignados) sin darle permiso de editar la tabla schools entera.
-- 4) Política de lectura de "attendance" para coordinador (para el
--    reporte de asistencia de su establecimiento) -- ya podía leer
--    teachers/teacher_ratings/evaluations de sus docentes asignados
--    (ver coordinador-role.sql); attendance no estaba cubierta.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase. Requiere haber corrido antes
-- migrations/coordinador-role.sql (usa is_coordinator_of).
-- ============================================================

-- ------------------------------------------------------------
-- 1. schools.public_projects
-- ------------------------------------------------------------
alter table public.schools add column if not exists public_projects boolean not null default true;

-- ------------------------------------------------------------
-- 2. Política restrictiva en projects
-- ------------------------------------------------------------
alter table public.projects enable row level security;

drop policy if exists "projects_select_restrict_private_school" on public.projects;
create policy "projects_select_restrict_private_school"
  on public.projects for select
  as restrictive
  using (
    public.is_admin()
    or exists (
      select 1
      from public.students s
      join public.schools sc on sc.code = s.school_code
      where s.id = projects.user_id
        and (
          coalesce(sc.public_projects, true) = true
          -- el propio alumno o un compañero de su escuela
          or s.school_code = (select school_code from public.students where id = auth.uid())
          -- un docente asignado a esa escuela
          or exists (
            select 1 from public.teacher_assignments ta
            where ta.teacher_id = auth.uid() and ta.school_code = s.school_code
          )
          -- un coordinador de algún docente de esa escuela
          or exists (
            select 1 from public.coordinator_assignments ca
            join public.teacher_assignments ta2 on ta2.teacher_id = ca.teacher_id
            where ca.coordinator_id = auth.uid() and ta2.school_code = s.school_code
          )
        )
    )
  );

-- ------------------------------------------------------------
-- 3. RPC para que el coordinador prenda/apague sus escuelas
-- ------------------------------------------------------------
create or replace function public.set_school_public_projects(p_school_code text, p_public boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.is_admin()
    or exists (
      select 1 from public.coordinator_assignments ca
      join public.teacher_assignments ta on ta.teacher_id = ca.teacher_id
      where ca.coordinator_id = auth.uid() and ta.school_code = p_school_code
    )
  ) then
    raise exception 'No tenés permiso sobre ese establecimiento';
  end if;

  update public.schools set public_projects = p_public where code = p_school_code;
end;
$$;
grant execute on function public.set_school_public_projects(text, boolean) to authenticated;

-- ------------------------------------------------------------
-- 4. ATTENDANCE -- lectura para coordinador (reporte de su establecimiento)
-- ------------------------------------------------------------
drop policy if exists "attendance_select_coordinator" on public.attendance;
create policy "attendance_select_coordinator"
  on public.attendance for select
  using (public.is_coordinator_of(teacher_id));

notify pgrst, 'reload schema';
