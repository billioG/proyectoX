-- Ítem 5 (parte 2): encuestas del admin -- varias preguntas de distinto
-- tipo (opción múltiple, texto libre, escala 1-5), dirigidas a
-- estudiantes/docentes/todos, con vista de resultados agregados.

create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  title text not null,
  description text,
  audience text not null check (audience in ('students', 'teachers', 'all')),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  order_index integer not null default 0,
  type text not null check (type in ('multiple_choice', 'text', 'scale')),
  question text not null,
  options jsonb, -- solo para multiple_choice: array de strings
  scale_min integer default 1,
  scale_max integer default 5
);

create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  user_id uuid not null,
  submitted_at timestamptz not null default timezone('utc', now()),
  unique (survey_id, user_id)
);

create table if not exists public.survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.survey_responses(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  answer_text text,
  answer_choice integer,
  answer_scale integer
);

alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers enable row level security;

create policy surveys_select on public.surveys for select using (
  is_staff()
  or (status = 'active' and (
    audience = 'all'
    or (audience = 'students' and exists (select 1 from public.students where id = auth.uid()))
    or (audience = 'teachers' and exists (select 1 from public.teachers where id = auth.uid()))
  ))
);
create policy surveys_insert_staff on public.surveys for insert with check (is_staff() and created_by = auth.uid());
create policy surveys_update_staff on public.surveys for update using (is_staff());

create policy survey_questions_select on public.survey_questions for select using (
  exists (
    select 1 from public.surveys s where s.id = survey_questions.survey_id and (
      is_staff() or (s.status = 'active' and (
        s.audience = 'all'
        or (s.audience = 'students' and exists (select 1 from public.students where id = auth.uid()))
        or (s.audience = 'teachers' and exists (select 1 from public.teachers where id = auth.uid()))
      ))
    )
  )
);
create policy survey_questions_insert_staff on public.survey_questions for insert with check (is_staff());

create policy survey_responses_select on public.survey_responses for select using (auth.uid() = user_id or is_staff());
create policy survey_responses_insert_own on public.survey_responses for insert with check (auth.uid() = user_id);

create policy survey_answers_select on public.survey_answers for select using (
  is_staff() or exists (select 1 from public.survey_responses r where r.id = survey_answers.response_id and r.user_id = auth.uid())
);
create policy survey_answers_insert_own on public.survey_answers for insert with check (
  exists (select 1 from public.survey_responses r where r.id = survey_answers.response_id and r.user_id = auth.uid())
);

notify pgrst, 'reload schema';
