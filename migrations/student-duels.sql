-- ============================================================
-- Desafíos 1v1 entre estudiantes -- quiz de trivia generado por IA,
-- apuesta de gemas.
-- ============================================================

create table if not exists public.student_duels (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.students(id) on delete cascade,
  opponent_id uuid not null references public.students(id) on delete cascade,
  wager_gems integer not null check (wager_gems >= 0),
  topic text not null,
  question_count integer not null default 5 check (question_count between 1 and 15),
  questions jsonb, -- [{question, options[4], correctIndex}], generado por IA al aceptar
  status text not null default 'pending' check (status in ('pending','rejected','active','completed')),
  winner_id uuid references public.students(id),
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  check (challenger_id <> opponent_id)
);

create table if not exists public.student_duel_answers (
  duel_id uuid not null references public.student_duels(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  answers jsonb not null, -- [selectedIndex, ...]
  score integer not null,
  completed_at timestamptz not null default timezone('utc', now()),
  primary key (duel_id, student_id)
);

alter table public.student_duels enable row level security;
alter table public.student_duel_answers enable row level security;

drop policy if exists "student_duels_select_participant_or_staff" on public.student_duels;
create policy "student_duels_select_participant_or_staff"
  on public.student_duels for select
  using (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_staff());

drop policy if exists "student_duels_insert_challenger" on public.student_duels;
create policy "student_duels_insert_challenger"
  on public.student_duels for insert
  with check (auth.uid() = challenger_id);

drop policy if exists "student_duels_update_participant" on public.student_duels;
create policy "student_duels_update_participant"
  on public.student_duels for update
  using (auth.uid() = challenger_id or auth.uid() = opponent_id or public.is_staff());

drop policy if exists "student_duel_answers_select_participant" on public.student_duel_answers;
create policy "student_duel_answers_select_participant"
  on public.student_duel_answers for select
  using (exists (select 1 from public.student_duels d where d.id = duel_id and (auth.uid() = d.challenger_id or auth.uid() = d.opponent_id)) or public.is_staff());

drop policy if exists "student_duel_answers_insert_own" on public.student_duel_answers;
create policy "student_duel_answers_insert_own"
  on public.student_duel_answers for insert
  with check (auth.uid() = student_id);

notify pgrst, 'reload schema';
