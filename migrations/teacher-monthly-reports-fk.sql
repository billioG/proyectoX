-- ============================================================
-- teacher_monthly_reports.teacher_id no tenía FK hacia teachers,
-- lo que rompe el embed `teachers(full_name, email)` desde PostgREST
-- (error 400: "Could not find a relationship").
-- ============================================================

alter table public.teacher_monthly_reports
  add constraint teacher_monthly_reports_teacher_id_fkey
  foreign key (teacher_id) references public.teachers(id) on delete cascade;

notify pgrst, 'reload schema';
