-- ============================================================
-- Buzón del estudiante hecho EN EL NODO escolar sin internet: sugerencias (student_suggestions) y evaluación semanal del docente (teacher_ratings). La función node-sync (service_role)
-- las aplica con esta función para un estudiante dado, porque el nodo no tiene sesión de Supabase (auth.uid() sería null). El nodo trae el `id` de la fila (un entero del rango reservado
-- 1 500 000 000 a 2 099 999 999, lejos de los que reparte la secuencia), así que reenviar la misma no la duplica.
--  * sugerencia: se inserta tal cual (type 'suggestion', mensaje de 1 a 2000 caracteres).
--  * evaluación: el docente tiene que estar asignado a la clase del estudiante; si el estudiante ya evaluó a ese docente (UNIQUE estudiante+docente de la nube) no se repite ni se pisa.
--
-- Solo service_role puede ejecutarla (ni la app ni anon). ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function public.apply_node_feedback(p_kind text, p_student uuid, p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student record;
  v_id integer := (p_row ->> 'id')::integer;
  v_created timestamp := coalesce(((p_row ->> 'created_at')::timestamptz) at time zone 'utc', timezone('utc', now()));
  v_message text := p_row ->> 'message';
  v_count integer;
begin
  select id, school_code, grade, section into v_student from public.students where id = p_student;
  if v_student.id is null then raise exception 'Estudiante no encontrado'; end if;
  if (p_row ->> 'student_id')::uuid is distinct from p_student then raise exception 'Mensaje inválido'; end if;
  if v_id is null or v_id < 1500000000 or v_id > 2099999999 then raise exception 'Identificador inválido'; end if;
  if v_message is not null and length(v_message) > 2000 then raise exception 'Mensaje inválido'; end if;

  if p_kind = 'suggestion' then
    if v_message is null or length(btrim(v_message)) < 1 then raise exception 'Sugerencia inválida'; end if;
    insert into public.student_suggestions (id, student_id, type, message, rating, created_at)
      values (v_id, p_student, 'suggestion', v_message, nullif(p_row ->> 'rating', '')::integer, v_created)
      on conflict (id) do nothing;
    get diagnostics v_count = row_count;
    return jsonb_build_object('inserted', v_count > 0);

  elsif p_kind = 'rating' then
    if not exists (
      select 1 from public.teacher_assignments ta
      where ta.teacher_id = (p_row ->> 'teacher_id')::uuid and ta.school_code = v_student.school_code and ta.grade = v_student.grade and ta.section = v_student.section
    ) then
      raise exception 'Ese docente no es de la clase del estudiante';
    end if;
    -- Sin «on conflict (id)»: también cubre el UNIQUE (estudiante, docente): una evaluación por docente.
    insert into public.teacher_ratings (id, student_id, teacher_id, rating, message, best_moment, q_interest, q_practice, q_resources, q_respect, q_clarity, created_at)
      values (v_id, p_student, (p_row ->> 'teacher_id')::uuid, (p_row ->> 'rating')::numeric, v_message, p_row ->> 'best_moment',
              coalesce((p_row ->> 'q_interest')::integer, 0), coalesce((p_row ->> 'q_practice')::integer, 0), coalesce((p_row ->> 'q_resources')::integer, 0),
              coalesce((p_row ->> 'q_respect')::integer, 0), coalesce((p_row ->> 'q_clarity')::integer, 0), v_created)
      on conflict do nothing;
    get diagnostics v_count = row_count;
    return jsonb_build_object('inserted', v_count > 0);

  else
    raise exception 'Tipo de mensaje no soportado';
  end if;
end;
$$;

revoke all on function public.apply_node_feedback(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_node_feedback(text, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
