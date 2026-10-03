-- Notificación al dueño del proyecto (y a su equipo, si es de grupo) cuando
-- alguien reacciona. Las filas las crea SOLO el trigger (security definer): el
-- cliente nunca inserta acá, así nadie puede fabricar avisos falsos.
--
-- Privacidad de menores: el aviso NO dice quién reaccionó. actor_id se guarda
-- (hace falta para actualizar la misma fila si esa persona cambia de reacción)
-- pero el destinatario no puede leerlo: el select está limitado por columna.
--
-- Una fila por (destinatario, proyecto, quién reaccionó): cambiar de reacción
-- la actualiza en vez de crear otra, y quitar la reacción deja reaction = null
-- (la bandeja la oculta). La fila se conserva para no perder pushed_at, que
-- limita el push a 1 cada 10 min por persona (anti-spam al alternar).
--
-- Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.

create table if not exists public.project_reaction_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id integer not null references public.projects(id) on delete cascade,
  actor_id uuid not null,
  reaction text,
  read boolean not null default false,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, project_id, actor_id)
);

create index if not exists project_reaction_notifications_user_idx
  on public.project_reaction_notifications (user_id, read);

alter table public.project_reaction_notifications enable row level security;

drop policy if exists project_reaction_notifications_select_own on public.project_reaction_notifications;
create policy project_reaction_notifications_select_own on public.project_reaction_notifications
  for select using (auth.uid() = user_id);

drop policy if exists project_reaction_notifications_update_own on public.project_reaction_notifications;
create policy project_reaction_notifications_update_own on public.project_reaction_notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists project_reaction_notifications_delete_own on public.project_reaction_notifications;
create policy project_reaction_notifications_delete_own on public.project_reaction_notifications
  for delete using (auth.uid() = user_id);

revoke all on public.project_reaction_notifications from anon, authenticated;
grant select (id, user_id, project_id, reaction, read, created_at) on public.project_reaction_notifications to authenticated;
grant update (read) on public.project_reaction_notifications to authenticated;
grant delete on public.project_reaction_notifications to authenticated;

create or replace function public.notify_project_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id integer;
  v_actor uuid;
  v_reaction text;
  v_owner uuid;
  v_group integer;
  v_recipient uuid;
begin
  if tg_op = 'DELETE' then
    v_project_id := old.project_id; v_actor := old.user_id; v_reaction := null;
  else
    v_project_id := new.project_id; v_actor := new.user_id; v_reaction := new.reaction;
  end if;

  select user_id, group_id into v_owner, v_group from public.projects where id = v_project_id;
  -- Proyecto ya borrado (cascade) o sin dueño: nada que avisar.
  if not found then
    return coalesce(new, old);
  end if;

  if v_reaction is null then
    update public.project_reaction_notifications
      set reaction = null
      where project_id = v_project_id and actor_id = v_actor;
    return coalesce(new, old);
  end if;

  for v_recipient in
    select distinct s.uid from (
      select v_owner as uid
      union
      select gm.student_id from public.group_members gm where v_group is not null and gm.group_id = v_group
    ) s
    where s.uid is not null and s.uid <> v_actor
  loop
    insert into public.project_reaction_notifications (user_id, project_id, actor_id, reaction)
      values (v_recipient, v_project_id, v_actor, v_reaction)
    on conflict (user_id, project_id, actor_id)
    do update set reaction = excluded.reaction, read = false, created_at = now();
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists project_likes_notify on public.project_likes;
create trigger project_likes_notify
  after insert or update of reaction or delete on public.project_likes
  for each row execute function public.notify_project_reaction();

notify pgrst, 'reload schema';
