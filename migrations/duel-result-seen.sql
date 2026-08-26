-- Permite mostrar la animacion de resultado del duelo UNA vez por cuenta
-- (no por dispositivo) cuando ambos ya respondieron.
alter table public.student_duel_answers add column if not exists result_seen boolean not null default false;

create policy student_duel_answers_update_own_result_seen on public.student_duel_answers
  for update using (auth.uid() = student_id) with check (auth.uid() = student_id);

notify pgrst, 'reload schema';
