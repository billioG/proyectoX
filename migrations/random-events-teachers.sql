-- Ítem 12: eventos sorpresa también para docentes -- totalmente
-- separados de los de estudiante (nunca comparten pozo de gemas ni
-- ranking, el admin/el cron eligen el target_role al crear el evento).
-- push_subscriptions y event_participants pasan de student_id a un
-- user_id genérico porque ahora pueden pertenecer a un estudiante O a
-- un docente (misma auth.uid(), tablas distintas, sin una sola FK
-- posible).

alter table public.push_subscriptions drop constraint push_subscriptions_student_id_fkey;
alter table public.push_subscriptions rename column student_id to user_id;

alter table public.event_participants drop constraint event_participants_student_id_fkey;
alter table public.event_participants drop constraint event_participants_event_id_student_id_key;
alter table public.event_participants rename column student_id to user_id;
alter table public.event_participants add constraint event_participants_event_id_user_id_key unique (event_id, user_id);

alter table public.random_events add column if not exists target_role text not null default 'estudiante'
  check (target_role in ('estudiante', 'docente'));

-- Las policies existentes ya usaban auth.uid() = student_id -- Postgres
-- no permite renombrar una columna referenciada en una policy sin
-- recrearla, así que se recrean apuntando a user_id.
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists event_participants_select_participant on public.event_participants;
create policy event_participants_select_participant on public.event_participants
  for select using (auth.uid() = user_id or is_staff());

drop policy if exists event_participants_insert_own on public.event_participants;
create policy event_participants_insert_own on public.event_participants
  for insert with check (auth.uid() = user_id);

-- select column-level grant en random_events necesita incluir target_role.
grant select (id, scheduled_for, duration_minutes, topic, question_count, gem_pool, status, created_at, target_role)
  on public.random_events to authenticated;

notify pgrst, 'reload schema';
