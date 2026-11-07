-- ============================================================
-- BUZÓN: dónde leen las sugerencias y las evaluaciones de la clase (student_suggestions y teacher_ratings).
--   * ADMINISTRADOR: ve todo, con el nombre de quien lo escribió (y de qué docente es la evaluación).
--   * DOCENTE: ve solo el CONTENIDO, de forma ANÓNIMA: las evaluaciones que recibió y las sugerencias de los estudiantes de sus clases; nunca el id ni el nombre de quien las escribió.
--   * COORDINADOR: las evaluaciones de los docentes que coordina, también anónimas.
-- Para que el anonimato sea real y no solo de pantalla, el docente deja de poder leer estas dos tablas directamente (antes podía leer el estudiante de cada fila): solo lo hace por las funciones de
-- abajo, que no devuelven quién fue. El estudiante sigue viendo lo suyo; el administrador y el coordinador (sus docentes) siguen con su acceso de siempre.
--
-- ADITIVO salvo el cambio de las dos políticas de lectura (mismo nombre, solo quita al docente). Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- ============================================================

-- Lectura directa: antes «propio o personal» (is_staff) en sugerencias, y «participante» (incluye al docente evaluado) en evaluaciones.
drop policy if exists "student_suggestions_select_own_or_staff" on public.student_suggestions;
drop policy if exists "student_suggestions_select_own_or_admin" on public.student_suggestions;
create policy "student_suggestions_select_own_or_admin"
  on public.student_suggestions for select
  using (auth.uid() = student_id or public.is_admin());

drop policy if exists "teacher_ratings_select_participant_or_admin" on public.teacher_ratings;
create policy "teacher_ratings_select_participant_or_admin"
  on public.teacher_ratings for select
  using (auth.uid() = student_id or public.is_admin() or public.is_coordinator_of(teacher_id));

-- El buzón. p_school filtra por establecimiento (solo el administrador lo usa); p_days, la antigüedad máxima. Hasta 500 de cada una, lo más nuevo primero.
create or replace function public.get_feedback_inbox(p_school text default null, p_days integer default 365)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin boolean;
  v_since timestamp := timezone('utc', now()) - make_interval(days => greatest(1, least(coalesce(p_days, 365), 3650)));
  v_suggestions jsonb;
  v_ratings jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  v_admin := public.is_admin();

  -- Sugerencias: el administrador ve todas (con nombre); el docente, las de los estudiantes de SUS clases, sin quién fue.
  select coalesce(jsonb_agg(row order by (row ->> 'created_at') desc), '[]'::jsonb) into v_suggestions from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', g.id, 'message', g.message, 'created_at', g.created_at, 'rating', g.rating,
      'school_code', st.school_code, 'school_name', sc.name, 'grade', st.grade, 'section', st.section,
      'student_name', case when v_admin then st.full_name else null end
    )) as row
    from public.student_suggestions g
    join public.students st on st.id = g.student_id
    left join public.schools sc on sc.code = st.school_code
    where g.created_at >= v_since
      and (p_school is null or st.school_code = p_school)
      and (v_admin or exists (select 1 from public.teacher_assignments ta where ta.teacher_id = auth.uid() and ta.school_code = st.school_code and ta.grade = st.grade and ta.section = st.section))
    order by g.created_at desc limit 500
  ) x;

  -- Evaluaciones de la clase: el administrador ve todas (con nombre y docente); el docente, las suyas; el coordinador, las de sus docentes; sin quién las escribió.
  select coalesce(jsonb_agg(row order by (row ->> 'created_at') desc), '[]'::jsonb) into v_ratings from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', r.id, 'rating', r.rating, 'message', r.message, 'best_moment', r.best_moment, 'created_at', r.created_at,
      'bimestre', to_jsonb(r) -> 'bimestre', -- to_jsonb: si la columna no existiera devuelve null en vez de fallar
      'q_interest', r.q_interest, 'q_practice', r.q_practice, 'q_resources', r.q_resources, 'q_respect', r.q_respect, 'q_clarity', r.q_clarity,
      'school_code', st.school_code, 'school_name', sc.name, 'grade', st.grade, 'section', st.section,
      'teacher_name', case when v_admin or r.teacher_id <> auth.uid() then t.full_name else null end,
      'student_name', case when v_admin then st.full_name else null end
    )) as row
    from public.teacher_ratings r
    join public.students st on st.id = r.student_id
    left join public.teachers t on t.id = r.teacher_id
    left join public.schools sc on sc.code = st.school_code
    where r.created_at >= v_since
      and (p_school is null or st.school_code = p_school)
      and (v_admin or r.teacher_id = auth.uid() or public.is_coordinator_of(r.teacher_id))
    order by r.created_at desc limit 500
  ) x;

  return jsonb_build_object('role', case when v_admin then 'admin' else 'teacher' end, 'suggestions', v_suggestions, 'ratings', v_ratings);
end;
$$;

revoke all on function public.get_feedback_inbox(text, integer) from public, anon;
grant execute on function public.get_feedback_inbox(text, integer) to authenticated;

-- Las notas que recibió el docente (sin quién las puso): su perfil promedia `rating`.
create or replace function public.get_my_ratings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('rating', rating)), '[]'::jsonb) from public.teacher_ratings where teacher_id = auth.uid();
$$;

revoke all on function public.get_my_ratings() from public, anon;
grant execute on function public.get_my_ratings() to authenticated;

notify pgrst, 'reload schema';
