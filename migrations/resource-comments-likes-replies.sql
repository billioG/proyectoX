-- Likes + respuestas anidadas para resource_comments.

alter table public.resource_comments add column if not exists parent_id uuid references public.resource_comments(id) on delete cascade;

create table if not exists public.resource_comment_likes (
  comment_id uuid not null references public.resource_comments(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.resource_comment_likes enable row level security;

drop policy if exists resource_comment_likes_select on public.resource_comment_likes;
create policy resource_comment_likes_select on public.resource_comment_likes
  for select using (
    exists (
      select 1 from public.resource_comments rc
      where rc.id = resource_comment_likes.comment_id
        and (public.is_staff() or exists (
          select 1 from public.group_members gm
          where gm.group_id = rc.group_id and gm.student_id = auth.uid()
        ))
    )
  );

drop policy if exists resource_comment_likes_insert on public.resource_comment_likes;
create policy resource_comment_likes_insert on public.resource_comment_likes
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.resource_comments rc
      where rc.id = resource_comment_likes.comment_id
        and (public.is_staff() or exists (
          select 1 from public.group_members gm
          where gm.group_id = rc.group_id and gm.student_id = auth.uid()
        ))
    )
  );

drop policy if exists resource_comment_likes_delete on public.resource_comment_likes;
create policy resource_comment_likes_delete on public.resource_comment_likes
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
