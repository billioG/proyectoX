-- Notificación al autor de un comentario cuando le responden o le dan like.
-- Las filas las crea SOLO el trigger (security definer) -- el cliente nunca
-- inserta acá directo, así nadie puede fabricar notificaciones falsas.

create table if not exists public.comment_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  actor_id uuid not null,
  actor_name text,
  comment_id uuid not null references public.resource_comments(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  type text not null check (type in ('reply','like')),
  content_preview text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists comment_notifications_user_idx on public.comment_notifications (user_id, read);

alter table public.comment_notifications enable row level security;

drop policy if exists comment_notifications_select_own on public.comment_notifications;
create policy comment_notifications_select_own on public.comment_notifications
  for select using (auth.uid() = user_id);

drop policy if exists comment_notifications_update_own on public.comment_notifications;
create policy comment_notifications_update_own on public.comment_notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists comment_notifications_delete_own on public.comment_notifications;
create policy comment_notifications_delete_own on public.comment_notifications
  for delete using (auth.uid() = user_id);

create or replace function public.notify_comment_reply()
returns trigger
language plpgsql
security definer
as $$
declare
  parent_author uuid;
begin
  if new.parent_id is not null then
    select author_id into parent_author from public.resource_comments where id = new.parent_id;
    if parent_author is not null and parent_author <> new.author_id then
      insert into public.comment_notifications (user_id, actor_id, actor_name, comment_id, lesson_id, type, content_preview)
      values (parent_author, new.author_id, new.author_name, new.parent_id, new.lesson_id, 'reply', left(new.content, 80));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists resource_comments_notify_reply on public.resource_comments;
create trigger resource_comments_notify_reply after insert on public.resource_comments
  for each row execute function public.notify_comment_reply();

create or replace function public.notify_comment_like()
returns trigger
language plpgsql
security definer
as $$
declare
  c_author uuid;
  c_lesson uuid;
begin
  select author_id, lesson_id into c_author, c_lesson from public.resource_comments where id = new.comment_id;
  if c_author is not null and c_author <> new.user_id then
    insert into public.comment_notifications (user_id, actor_id, comment_id, lesson_id, type)
    values (c_author, new.user_id, new.comment_id, c_lesson, 'like');
  end if;
  return new;
end;
$$;

drop trigger if exists resource_comment_likes_notify on public.resource_comment_likes;
create trigger resource_comment_likes_notify after insert on public.resource_comment_likes
  for each row execute function public.notify_comment_like();

notify pgrst, 'reload schema';
