-- ============================================================
-- Evaluación por IA -- segunda opinión junto a la del docente
-- ============================================================

create table if not exists public.ai_evaluations (
  project_id integer primary key references public.projects(id) on delete cascade,
  creativity_score int,
  clarity_score int,
  functionality_score int,
  teamwork_score int,
  social_impact_score int,
  total_score int,
  feedback text,
  model text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.ai_evaluations enable row level security;

drop policy if exists "ai_evaluations_select_staff" on public.ai_evaluations;
create policy "ai_evaluations_select_staff"
  on public.ai_evaluations for select
  to authenticated
  using (public.is_staff());

drop policy if exists "ai_evaluations_write_service_role" on public.ai_evaluations;
create policy "ai_evaluations_write_service_role"
  on public.ai_evaluations for all
  to service_role
  using (true) with check (true);

notify pgrst, 'reload schema';
