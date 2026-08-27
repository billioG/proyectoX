-- Like + feedback de un docente hacia un curso de OTRO docente en la
-- Biblioteca Compartida (courses.is_shared = true).

create table if not exists public.course_feedback (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  liked boolean,
  feedback text,
  created_at timestamptz not null default now(),
  unique (course_id, teacher_id)
);

alter table public.course_feedback enable row level security;

drop policy if exists course_feedback_select on public.course_feedback;
create policy course_feedback_select on public.course_feedback
  for select using (
    auth.uid() = teacher_id
    or public.is_staff()
    or auth.uid() = (select created_by from public.courses where id = course_feedback.course_id)
  );

drop policy if exists course_feedback_insert on public.course_feedback;
create policy course_feedback_insert on public.course_feedback
  for insert with check (
    auth.uid() = teacher_id
    and exists (
      select 1 from public.courses c
      where c.id = course_feedback.course_id and c.is_shared = true and c.created_by <> auth.uid()
    )
  );

drop policy if exists course_feedback_update on public.course_feedback;
create policy course_feedback_update on public.course_feedback
  for update using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);

drop policy if exists course_feedback_delete on public.course_feedback;
create policy course_feedback_delete on public.course_feedback
  for delete using (auth.uid() = teacher_id or public.is_staff());

notify pgrst, 'reload schema';
