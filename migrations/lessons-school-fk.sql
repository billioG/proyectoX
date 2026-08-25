-- Falta esta FK para que PostgREST pueda resolver el embed lessons->schools
-- (select('*, schools(name)')) -- sin ella tira "Could not find a
-- relationship between 'lessons' and 'schools'".
alter table public.lessons
  add constraint lessons_school_code_fkey
  foreign key (school_code) references public.schools(code);
