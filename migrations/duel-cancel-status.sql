-- Permite que el challenger cancele un desafío 1v1 que todavía está
-- pendiente (antes no tenía forma de "deshacer" un reto enviado).
alter table public.student_duels drop constraint if exists student_duels_status_check;
alter table public.student_duels add constraint student_duels_status_check
  check (status = any (array['pending'::text, 'rejected'::text, 'cancelled'::text, 'active'::text, 'completed'::text]));

notify pgrst, 'reload schema';
