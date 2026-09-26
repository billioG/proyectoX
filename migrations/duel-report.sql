-- ============================================================
-- Reporte de duelos para el docente: % de aciertos por tema y por alumno
-- en su clase, sumando los 5 juegos 1v1 -- para saber qué reforzar.
-- Solo el docente asignado a esa clase (o un admin).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create or replace function public.get_class_duel_report(p_school text, p_grade text, p_section text, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v_result jsonb;
begin
  if not exists (
    select 1 from public.teacher_assignments
    where teacher_id = auth.uid() and school_code = p_school and grade = p_grade and section = p_section
  ) and not exists (select 1 from public.teachers where id = auth.uid() and role = 'admin') then
    raise exception 'No sos docente de esa clase';
  end if;

  with class_students as (
    select id, full_name from public.students
    where school_code = p_school and grade = p_grade and section = p_section
  ),
  plays as (
    select 'quiz'::text as game, d.topic, a.student_id,
           least(1, a.score::numeric / nullif(d.question_count, 0)) as ok
      from public.student_duel_answers a join public.student_duels d on d.id = a.duel_id
      where a.student_id in (select id from class_students) and d.created_at > v_since
    union all
    select 'hangman', d.topic, r.student_id, case when r.solved then 1 else 0 end
      from public.student_hangman_results r join public.student_hangman_duels d on d.id = r.duel_id
      where r.student_id in (select id from class_students) and d.created_at > v_since
    union all
    select 'spelling', d.topic, r.student_id, case when r.correct then 1 else 0 end
      from public.student_spelling_results r join public.student_spelling_duels d on d.id = r.duel_id
      where r.student_id in (select id from class_students) and d.created_at > v_since
    union all
    select 'debug', d.topic, r.student_id, case when r.correct then 1 else 0 end
      from public.student_debug_results r join public.student_debug_duels d on d.id = r.duel_id
      where r.student_id in (select id from class_students) and d.created_at > v_since
    union all
    select 'timed_math', 'Cálculo mental', r.student_id, least(1, r.score::numeric / nullif(d.problem_count, 0))
      from public.student_timed_math_results r join public.student_timed_math_duels d on d.id = r.duel_id
      where r.student_id in (select id from class_students) and d.created_at > v_since
  ),
  by_topic as (
    select game, topic, count(*) as plays, count(distinct student_id) as students,
           round(avg(coalesce(ok, 0)) * 100) as pct
    from plays group by game, topic
  ),
  by_student as (
    select p.student_id, s.full_name, count(*) as plays, round(avg(coalesce(p.ok, 0)) * 100) as pct
    from plays p join class_students s on s.id = p.student_id
    group by p.student_id, s.full_name
  )
  select jsonb_build_object(
    'total_plays', (select count(*) from plays),
    'active_students', (select count(distinct student_id) from plays),
    'class_size', (select count(*) from class_students),
    'topics', coalesce((select jsonb_agg(t order by t.pct asc, t.plays desc) from by_topic t), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(st order by st.pct asc, st.plays desc) from by_student st), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_class_duel_report(text, text, text, integer) to authenticated;

notify pgrst, 'reload schema';
