-- ============================================================
-- Evita que un docente envíe varios informes duplicados del mismo mes
-- (pasó porque el botón "Informe" no reflejaba si ya se había enviado).
-- ============================================================

alter table public.teacher_monthly_reports
  add constraint teacher_monthly_reports_unique_period
  unique (teacher_id, month, year);

notify pgrst, 'reload schema';
