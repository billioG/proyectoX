-- ============================================================
-- Máximo 1 evidencia semanal por docente por semana ISO (respaldo a
-- nivel de base de datos -- la validación del cliente se puede saltar).
-- ============================================================

alter table public.weekly_evidence add column if not exists iso_week text
  generated always as (
    extract(isoyear from (created_at at time zone 'UTC'))::text || '-' ||
    lpad(extract(week from (created_at at time zone 'UTC'))::text, 2, '0')
  ) stored;

alter table public.weekly_evidence
  add constraint weekly_evidence_one_per_week
  unique (teacher_id, iso_week);

notify pgrst, 'reload schema';
