-- ============================================================
-- courses.school_code sin FK -- rompe el embed courses(*, schools(name))
-- (mismo error que ya se dio antes con lessons.school_code).
-- ============================================================

alter table public.courses
  add constraint courses_school_code_fkey
  foreign key (school_code) references public.schools(code);

notify pgrst, 'reload schema';
