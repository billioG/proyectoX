-- El admin necesita poder lanzar un evento manualmente (para probar o
-- para reforzar la sorpresa fuera del sorteo automático nocturno) y
-- cancelar uno programado antes de que dispare.
create policy random_events_insert_staff on public.random_events
  for insert with check (is_staff());

create policy random_events_update_staff on public.random_events
  for update using (is_staff());

notify pgrst, 'reload schema';
