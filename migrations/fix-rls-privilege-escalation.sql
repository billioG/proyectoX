-- ============================================================
-- FIX CRÍTICO: escalación de privilegios en proyectoX
--
-- Causa raíz encontrada en auditoría:
--   1) Varias tablas tenían una política "<tabla>_all" con
--      USING(true) WITH CHECK(true) para el rol {public} -- esto
--      anula CUALQUIER otra política más restrictiva en esa tabla
--      (las políticas RLS son permisivas y se combinan con OR), es
--      decir: cualquier persona con la anon key (autenticada o NO)
--      podía leer/insertar/actualizar/borrar CUALQUIER fila.
--   2) La más grave: "teachers_all" permitía que cualquier usuario
--      se auto-insertara una fila en `teachers` con role='admin',
--      o que cualquier docente actualizara su propia fila para
--      poner role='admin' o inflar su propio salario/bonos.
--   3) Dos políticas ("Admin total access" en attendance_waivers y
--      "Admins ven todos los docentes" en teachers) validaban el
--      admin leyendo auth.jwt() -> 'user_metadata' ->> 'role' --
--      ese campo lo edita el propio usuario desde el navegador
--      (auth.updateUser({data:{role:'admin'}})), así que esas
--      políticas eran auto-otorgables.
--
-- Este script es ADITIVO/NO DESTRUCTIVO: solo hace DROP POLICY +
-- CREATE POLICY + crea funciones/triggers nuevos. No toca datos ni
-- estructura de columnas. Seguro de correr en producción y de
-- re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Funciones helper de rol (server-side, no confían en JWT/metadata)
-- ------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.teachers
    where teachers.id = auth.uid() and teachers.role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.teachers
    where teachers.id = auth.uid() and teachers.role in ('admin','docente')
  );
$$;

-- ------------------------------------------------------------
-- 1. Trigger: protege columnas privilegiadas de `teachers`
--    (role, salario, bonos, is_coordinator, etc.) -- solo un admin
--    puede cambiarlas; cualquier otro cambio a esas columnas se
--    ignora en silencio (se conserva el valor anterior / default
--    seguro), sin romper el resto de la fila.
-- ------------------------------------------------------------
create or replace function public.protect_teacher_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'docente';
    new.base_salary := 0;
    new.bonus_admin_max := 0;
    new.bonus_prod_max := 0;
    new.bonus_coordinator_max := 0;
    new.is_coordinator := false;
    new.is_1bot_team := false;
    new.certification_points := 0;
    new.rank_title := coalesce(new.rank_title, 'Tutor Junior');
  else
    new.role := old.role;
    new.base_salary := old.base_salary;
    new.bonus_admin_max := old.bonus_admin_max;
    new.bonus_prod_max := old.bonus_prod_max;
    new.bonus_coordinator_max := old.bonus_coordinator_max;
    new.is_coordinator := old.is_coordinator;
    new.is_1bot_team := old.is_1bot_team;
    new.certification_points := old.certification_points;
    new.rank_title := old.rank_title;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_teacher_privileged on public.teachers;
create trigger trg_protect_teacher_privileged
before insert or update on public.teachers
for each row execute function public.protect_teacher_privileged_fields();

-- ------------------------------------------------------------
-- 2. Trigger: protege columnas de identidad/reportería en `students`
--    (role, school_code, grade, section, username, cui) -- solo
--    staff (docente/admin) puede cambiarlas.
-- ------------------------------------------------------------
create or replace function public.protect_student_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_staff() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.role := old.role;
    new.school_code := old.school_code;
    new.grade := old.grade;
    new.section := old.section;
    new.username := old.username;
    new.cui := old.cui;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_student_privileged on public.students;
create trigger trg_protect_student_privileged
before insert or update on public.students
for each row execute function public.protect_student_privileged_fields();

-- ------------------------------------------------------------
-- 3. TEACHERS -- elimina el open-door y la política basada en metadata
-- ------------------------------------------------------------
drop policy if exists "teachers_all" on public.teachers;
drop policy if exists "Admins ven todos los docentes" on public.teachers;

create policy "teachers_select_self_or_admin"
  on public.teachers for select
  using (auth.uid() = id or public.is_admin());

create policy "teachers_insert_self_or_admin"
  on public.teachers for insert
  with check (auth.uid() = id or public.is_admin());

create policy "teachers_update_self_or_admin"
  on public.teachers for update
  using (auth.uid() = id or public.is_admin());

create policy "teachers_delete_admin_only"
  on public.teachers for delete
  using (public.is_admin());

-- ------------------------------------------------------------
-- 4. STUDENTS -- solo staff crea/edita/borra; lectura amplia se mantiene
--    (necesaria para ranking/leaderboard) pero solo para autenticados.
-- ------------------------------------------------------------
drop policy if exists "students_all" on public.students;

create policy "students_select_authenticated"
  on public.students for select
  to authenticated
  using (true);

create policy "students_insert_staff_only"
  on public.students for insert
  with check (public.is_staff());

create policy "students_update_self_or_staff"
  on public.students for update
  using (auth.uid() = id or public.is_staff());

create policy "students_delete_staff_only"
  on public.students for delete
  using (public.is_staff());

-- ------------------------------------------------------------
-- 5. SCHOOLS -- lectura amplia (autenticados), escritura solo admin
-- ------------------------------------------------------------
drop policy if exists "schools_all" on public.schools;

create policy "schools_select_authenticated"
  on public.schools for select
  to authenticated
  using (true);

create policy "schools_write_admin_only"
  on public.schools for all
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- 6. GROUPS / GROUP_MEMBERS -- lectura amplia, escritura solo staff
-- ------------------------------------------------------------
drop policy if exists "groups_all" on public.groups;

create policy "groups_select_authenticated"
  on public.groups for select
  to authenticated
  using (true);

create policy "groups_write_staff_only"
  on public.groups for all
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "group_members_all" on public.group_members;

create policy "group_members_select_authenticated"
  on public.group_members for select
  to authenticated
  using (true);

create policy "group_members_write_staff_only"
  on public.group_members for all
  using (public.is_staff())
  with check (public.is_staff());

-- ------------------------------------------------------------
-- 7. PROJECTS -- lectura amplia (feed), escritura: dueño o staff
-- ------------------------------------------------------------
drop policy if exists "projects_all" on public.projects;

create policy "projects_select_authenticated"
  on public.projects for select
  to authenticated
  using (true);

create policy "projects_insert_own_or_staff"
  on public.projects for insert
  with check (auth.uid() = user_id or public.is_staff());

create policy "projects_update_own_or_staff"
  on public.projects for update
  using (auth.uid() = user_id or public.is_staff());

create policy "projects_delete_own_or_staff"
  on public.projects for delete
  using (auth.uid() = user_id or public.is_staff());

-- ------------------------------------------------------------
-- 8. EVALUATIONS -- lectura amplia, escritura: el docente evaluador o admin
--    (la política "Estudiantes pueden ver detalles..." ya existente se deja intacta)
-- ------------------------------------------------------------
drop policy if exists "evaluations_all" on public.evaluations;

create policy "evaluations_select_authenticated"
  on public.evaluations for select
  to authenticated
  using (true);

create policy "evaluations_write_teacher_or_admin"
  on public.evaluations for all
  using (auth.uid() = teacher_id or public.is_admin())
  with check (auth.uid() = teacher_id or public.is_admin());

-- ------------------------------------------------------------
-- 9. PROFILES -- tabla no usada por el código actual del cliente;
--    se cierra por completo salvo lectura propia/admin.
-- ------------------------------------------------------------
drop policy if exists "profiles_all" on public.profiles;

create policy "profiles_select_self_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles_write_admin_only"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- 10. PROJECT_LIKES -- se elimina solo el open-door; las 3 políticas
--     granulares que ya existían (públicas/insert propio/delete propio)
--     cubren correctamente el uso real y se dejan intactas.
-- ------------------------------------------------------------
drop policy if exists "project_likes_all" on public.project_likes;

-- ------------------------------------------------------------
-- 11. STUDENT_BADGES -- lectura amplia, insert solo propio o staff,
--     update/delete solo staff (evita que un alumno borre insignias ajenas).
--     Nota: un alumno aún puede auto-otorgarse una insignia propia --
--     es una limitación de diseño del sistema de gamificación (no hay
--     validación server-side del criterio), fuera de alcance de este fix.
-- ------------------------------------------------------------
drop policy if exists "student_badges_all" on public.student_badges;

create policy "student_badges_select_authenticated"
  on public.student_badges for select
  to authenticated
  using (true);

create policy "student_badges_insert_own_or_staff"
  on public.student_badges for insert
  with check (auth.uid() = student_id or public.is_staff());

create policy "student_badges_update_staff_only"
  on public.student_badges for update
  using (public.is_staff());

create policy "student_badges_delete_staff_only"
  on public.student_badges for delete
  using (public.is_staff());

-- ------------------------------------------------------------
-- 12. STUDENT_SUGGESTIONS -- feedback de alumnos: solo el propio autor
--     y staff pueden leerlo/gestionarlo (antes era público para todos).
-- ------------------------------------------------------------
drop policy if exists "student_suggestions_all" on public.student_suggestions;

create policy "student_suggestions_select_own_or_staff"
  on public.student_suggestions for select
  using (auth.uid() = student_id or public.is_staff());

create policy "student_suggestions_insert_own"
  on public.student_suggestions for insert
  with check (auth.uid() = student_id);

create policy "student_suggestions_update_staff_only"
  on public.student_suggestions for update
  using (public.is_staff());

create policy "student_suggestions_delete_staff_only"
  on public.student_suggestions for delete
  using (public.is_staff());

-- ------------------------------------------------------------
-- 13. TEACHER_ASSIGNMENTS -- define qué docente cubre qué
--     escuela/grado/sección; es la base de otras reglas de negocio,
--     por eso su escritura queda exclusiva de admin.
-- ------------------------------------------------------------
drop policy if exists "teacher_assignments_all" on public.teacher_assignments;

create policy "teacher_assignments_select_authenticated"
  on public.teacher_assignments for select
  to authenticated
  using (true);

create policy "teacher_assignments_write_admin_only"
  on public.teacher_assignments for all
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- 14. TEACHER_NOTIFICATIONS -- cualquiera puede insertar (igual que la
--     tabla genérica `notifications`, para poder notificar a un docente
--     desde cualquier flujo), pero solo el dueño o admin lee/actualiza/borra.
-- ------------------------------------------------------------
drop policy if exists "teacher_notifications_all" on public.teacher_notifications;

create policy "teacher_notifications_select_own_or_admin"
  on public.teacher_notifications for select
  using (auth.uid() = teacher_id or public.is_admin());

create policy "teacher_notifications_insert_authenticated"
  on public.teacher_notifications for insert
  to authenticated
  with check (true);

create policy "teacher_notifications_update_own_or_admin"
  on public.teacher_notifications for update
  using (auth.uid() = teacher_id or public.is_admin());

create policy "teacher_notifications_delete_own_or_admin"
  on public.teacher_notifications for delete
  using (auth.uid() = teacher_id or public.is_admin());

-- ------------------------------------------------------------
-- 15. TEACHER_RATINGS -- calificación de alumno a docente; solo
--     participantes (alumno que calificó / docente calificado) o admin
--     pueden leer; solo el alumno inserta su propia calificación.
-- ------------------------------------------------------------
drop policy if exists "teacher_ratings_all" on public.teacher_ratings;

create policy "teacher_ratings_select_participant_or_admin"
  on public.teacher_ratings for select
  using (auth.uid() = student_id or auth.uid() = teacher_id or public.is_admin());

create policy "teacher_ratings_insert_own_student"
  on public.teacher_ratings for insert
  with check (auth.uid() = student_id);

create policy "teacher_ratings_update_admin_only"
  on public.teacher_ratings for update
  using (public.is_admin());

create policy "teacher_ratings_delete_admin_only"
  on public.teacher_ratings for delete
  using (public.is_admin());

-- ------------------------------------------------------------
-- 16. ATTENDANCE -- se elimina solo el open-door; las políticas
--     granulares existentes (docente inserta/ve solo lo propio, admin
--     gestiona todo) ya son correctas y se dejan intactas.
-- ------------------------------------------------------------
drop policy if exists "attendance_all" on public.attendance;

-- ------------------------------------------------------------
-- 17. ATTENDANCE_WAIVERS -- se reemplazan las 2 políticas basadas en
--     auth.jwt()->user_metadata (auto-otorgables) por is_admin() puro.
--     La política "Docentes pueden crear solicitudes" ya existente
--     (insert propio) se deja intacta.
-- ------------------------------------------------------------
drop policy if exists "Admin total access" on public.attendance_waivers;
drop policy if exists "Admins pueden actualizar solicitudes" on public.attendance_waivers;

create policy "attendance_waivers_admin_all"
  on public.attendance_waivers for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "attendance_waivers_select_own_or_admin"
  on public.attendance_waivers for select
  using (auth.uid() = teacher_id or public.is_admin());

-- ============================================================
-- FIN. Revisar el listado de abajo tras correr esto:
--   select tablename, policyname, cmd, roles from pg_policies
--   where schemaname='public' order by tablename;
-- y confirmar que ya no aparece ninguna política "*_all" con
-- qual/with_check = true, ni ninguna que lea auth.jwt()->'user_metadata'.
-- ============================================================
