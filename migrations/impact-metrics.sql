-- ============================================================
-- TABLERO DE IMPACTO (admin) -- los números que piden MINEDUC, SENACYT,
-- UNICEF y fundaciones: uso real, aprendizaje, asistencia y familias.
-- Todo agregado por establecimiento, sin nombres de estudiantes.
--
--   get_impact_metrics(desde, hasta) -> una fila por establecimiento
--   get_impact_trend(meses)          -> evolución mensual de toda la red
--
-- Solo admin. Excluye estudiantes dados de baja. ADITIVO. Seguro de
-- re-ejecutar.
-- ============================================================

create or replace function public.get_impact_metrics(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Solo administración'; end if;

  with st as (
    select id, school_code from public.students
    where coalesce(status, 'active') <> 'baja' and school_code is not null
  ),
  enrolled as (select school_code, count(*) as n from st group by school_code),
  active as (
    select st.school_code, count(distinct a.user_id) as n, coalesce(sum(a.total_seconds), 0) as secs
    from public.active_time_tracking a join st on st.id = a.user_id
    where a.activity_date between p_from and p_to
    group by st.school_code
  ),
  lessons as (
    select st.school_code, count(*) as n, count(distinct lc.student_id) as students
    from public.lesson_completions lc join st on st.id = lc.student_id
    where lc.completed_at::date between p_from and p_to
    group by st.school_code
  ),
  duels as (
    select st.school_code, count(*) as n from (
      select challenger_id, resolved_at from public.student_duels where status = 'completed'
      union all select challenger_id, resolved_at from public.student_hangman_duels where status = 'completed'
      union all select challenger_id, resolved_at from public.student_timed_math_duels where status = 'completed'
      union all select challenger_id, resolved_at from public.student_debug_duels where status = 'completed'
      union all select challenger_id, resolved_at from public.student_spelling_duels where status = 'completed'
    ) d join st on st.id = d.challenger_id
    where d.resolved_at::date between p_from and p_to
    group by st.school_code
  ),
  att as (
    select st.school_code,
           count(*) as records,
           count(*) filter (where at.status in ('present', 'late')) as present
    from public.attendance at join st on st.id = at.student_id
    where at.date between p_from and p_to
    group by st.school_code
  ),
  fam as (
    select st.school_code, count(distinct g.student_id) as n
    from public.student_guardians g join st on st.id = g.student_id
    group by st.school_code
  )
  select coalesce(jsonb_agg(row_to_json(r) order by r.school_name), '[]'::jsonb) into v_result
  from (
    select e.school_code,
           coalesce(sc.name, e.school_code) as school_name,
           e.n as enrolled,
           coalesce(a.n, 0) as active_students,
           round(coalesce(a.secs, 0) / 60.0 / nullif(a.n, 0), 1) as minutes_per_active,
           coalesce(l.n, 0) as lessons_completed,
           coalesce(l.students, 0) as students_completing,
           coalesce(d.n, 0) as duels_played,
           case when coalesce(att.records, 0) > 0 then round(100.0 * att.present / att.records, 1) end as attendance_pct,
           coalesce(f.n, 0) as students_with_family
    from enrolled e
    left join public.schools sc on sc.code = e.school_code
    left join active a on a.school_code = e.school_code
    left join lessons l on l.school_code = e.school_code
    left join duels d on d.school_code = e.school_code
    left join att on att.school_code = e.school_code
    left join fam f on f.school_code = e.school_code
  ) r;

  return v_result;
end;
$$;
grant execute on function public.get_impact_metrics(date, date) to authenticated;

create or replace function public.get_impact_trend(p_months integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Solo administración'; end if;

  select coalesce(jsonb_agg(row_to_json(r) order by r.month), '[]'::jsonb) into v_result
  from (
    select to_char(m.month, 'YYYY-MM') as month,
           (select count(distinct a.user_id) from public.active_time_tracking a
             join public.students s on s.id = a.user_id
             where date_trunc('month', a.activity_date) = m.month) as active_students,
           (select count(*) from public.lesson_completions lc
             where date_trunc('month', lc.completed_at) = m.month) as lessons_completed
    from generate_series(
      date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1),
      date_trunc('month', now()),
      interval '1 month'
    ) as m(month)
  ) r;

  return v_result;
end;
$$;
grant execute on function public.get_impact_trend(integer) to authenticated;

notify pgrst, 'reload schema';
