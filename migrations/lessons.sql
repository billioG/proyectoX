-- ============================================================
-- Módulo de Lecciones (Fase 1: video/PDF/imagen, sin nota automática)
-- ============================================================

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  content_type text not null check (content_type in ('video','pdf','image')),
  content_url text not null,
  school_code text not null,
  grade text not null,
  section text not null,
  created_by uuid not null references public.teachers(id),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.lessons enable row level security;

drop policy if exists "lessons_select_authenticated" on public.lessons;
create policy "lessons_select_authenticated"
  on public.lessons for select
  to authenticated
  using (true);

drop policy if exists "lessons_insert_staff" on public.lessons;
create policy "lessons_insert_staff"
  on public.lessons for insert
  with check (public.is_staff() and created_by = auth.uid());

drop policy if exists "lessons_update_own_or_admin" on public.lessons;
create policy "lessons_update_own_or_admin"
  on public.lessons for update
  using (created_by = auth.uid() or public.is_admin());

drop policy if exists "lessons_delete_own_or_admin" on public.lessons;
create policy "lessons_delete_own_or_admin"
  on public.lessons for delete
  using (created_by = auth.uid() or public.is_admin());

create table if not exists public.lesson_completions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  completed_at timestamptz not null default timezone('utc', now()),
  unique (lesson_id, student_id)
);

alter table public.lesson_completions enable row level security;

drop policy if exists "lesson_completions_select_own_or_staff" on public.lesson_completions;
create policy "lesson_completions_select_own_or_staff"
  on public.lesson_completions for select
  using (student_id = auth.uid() or public.is_staff());

drop policy if exists "lesson_completions_insert_own" on public.lesson_completions;
create policy "lesson_completions_insert_own"
  on public.lesson_completions for insert
  with check (student_id = auth.uid());

drop policy if exists "lesson_completions_delete_own_or_admin" on public.lesson_completions;
create policy "lesson_completions_delete_own_or_admin"
  on public.lesson_completions for delete
  using (student_id = auth.uid() or public.is_admin());
