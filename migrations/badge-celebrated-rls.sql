-- El alumno/docente necesita poder marcar SU PROPIA insignia como
-- "celebrated" (ya vio la animación de desbloqueo) -- antes solo staff
-- podía hacer UPDATE en student_badges, y teacher_badges no tenía ninguna
-- policy de UPDATE.
create policy student_badges_update_own on public.student_badges
  for update using (auth.uid() = student_id) with check (auth.uid() = student_id);

create policy teacher_badges_update_own on public.teacher_badges
  for update using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

notify pgrst, 'reload schema';
