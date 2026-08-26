-- #6: recurso "quiz" dentro de un curso (opcion multiple, V/F, numero, rango, texto abierto).
alter table public.lessons add column if not exists quiz_data jsonb;

-- #7: evaluacion IA de codigo en bloques (capturas o .mblock) que el
-- docente sube manualmente para un proyecto ya compartido.
create table if not exists public.ai_code_evaluations (
  id uuid primary key default gen_random_uuid(),
  project_id integer not null references public.projects(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id),
  input_type text not null check (input_type in ('screenshot', 'mblock_file')),
  rubric jsonb not null default '[]'::jsonb,
  score integer,
  feedback text,
  criteria_feedback jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.ai_code_evaluations enable row level security;

create policy ai_code_evaluations_select_staff on public.ai_code_evaluations
  for select using (is_staff());

create policy ai_code_evaluations_insert_staff on public.ai_code_evaluations
  for insert with check (is_staff() and auth.uid() = teacher_id);

notify pgrst, 'reload schema';
