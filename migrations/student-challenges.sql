-- ============================================================
-- Reto del mes tambien para estudiantes (antes solo docentes via
-- teacher_challenges). Tabla separada porque student_id referencia
-- students(id), no teachers(id).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create table if not exists public.student_challenges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  challenge_id text not null,
  comment text not null,
  created_at timestamptz not null default now(),
  unique (student_id, challenge_id)
);

alter table public.student_challenges enable row level security;

drop policy if exists "student_challenges_select_own_or_staff" on public.student_challenges;
create policy "student_challenges_select_own_or_staff" on public.student_challenges
  for select using (auth.uid() = student_id or public.is_staff());

drop policy if exists "student_challenges_insert_own" on public.student_challenges;
create policy "student_challenges_insert_own" on public.student_challenges
  for insert with check (auth.uid() = student_id);
