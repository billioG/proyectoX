-- ============================================================
-- Dos políticas RLS demasiado abiertas, encontradas en la misma revisión
-- que fix-password-reset-rpc-exposure.sql (correr esa primero).
--
-- 1. students_select_authenticated dejaba leer TODAS las columnas de
--    TODOS los estudiantes de TODOS los colegios a cualquier usuario
--    logueado (hasta un alumno) -- nombre completo, CUI, fecha de
--    nacimiento, género. El truncado a "Nombre I." del ranking es solo
--    cosmético contra esto: con select('*') directo se saca todo.
--    Se restringe a: uno mismo, el staff (admin/docente/coordinador, ya
--    cubierto por is_staff()), o un compañero de la MISMA clase (mismo
--    colegio + grado + sección) -- que es lo único que el código
--    realmente necesita (duelos, grupos, ranking de la clase).
--
-- 2. teacher_notifications_insert_authenticated dejaba insertar avisos
--    a CUALQUIER autenticado, incluido un alumno -- podía inyectar un
--    aviso falso en el feed de un docente/admin. No hay ningún insert a
--    esta tabla en js/ ni en funciones SQL, así que restringir no rompe
--    nada existente -- se deja solo para staff, listo para cuando algo
--    lo necesite de verdad.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

drop policy if exists "students_select_authenticated" on public.students;

create policy "students_select_self_staff_or_classmate"
  on public.students for select to authenticated
  using (
    public.is_staff()
    or auth.uid() = id
    or exists (
      select 1 from public.students me
      where me.id = auth.uid()
        and me.school_code = students.school_code
        and me.grade = students.grade
        and me.section = students.section
    )
  );

drop policy if exists "teacher_notifications_insert_authenticated" on public.teacher_notifications;

create policy "teacher_notifications_insert_staff"
  on public.teacher_notifications for insert to authenticated
  with check (public.is_staff());

notify pgrst, 'reload schema';
