-- ============================================================
-- Relevo de progreso offline (Fase 1 offline).
-- El alumno sin internet le pasa su progreso al docente (QR / archivo), y
-- el docente lo sube cuando tiene señal. Antes eso fallaba siempre: la
-- regla de lesson_completions solo acepta que el propio alumno escriba su
-- fila (student_id = auth.uid()), y la subida iba con la sesión del
-- docente -- el progreso quedaba trabado o se perdía.
--
-- relay_lesson_completions() guarda en nombre del alumno SOLO si el
-- alumno es de una clase asignada al docente (o si es admin), y nunca
-- pisa una nota mejor que ya estuviera guardada.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create or replace function public.relay_lesson_completions(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_item jsonb;
  v_data jsonb;
  v_student uuid;
  v_lesson uuid;
  v_score numeric;
  v_status text;
  v_accepted jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.teachers where id = auth.uid()) then
    raise exception 'Solo un docente puede subir progreso de sus alumnos';
  end if;
  v_is_admin := exists (select 1 from public.teachers where id = auth.uid() and role = 'admin');

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_data := v_item->'data';
    begin
      v_student := (v_data->>'student_id')::uuid;
      v_lesson := (v_data->>'lesson_id')::uuid;
    exception when others then
      continue;
    end;
    if v_student is null or v_lesson is null then continue; end if;

    if not v_is_admin and not exists (
      select 1 from public.students s
      join public.teacher_assignments ta
        on ta.school_code = s.school_code and ta.grade = s.grade and ta.section = s.section
      where s.id = v_student and ta.teacher_id = auth.uid()
    ) then
      continue;
    end if;
    if not exists (select 1 from public.lessons where id = v_lesson) then continue; end if;

    v_score := least(100, greatest(0, nullif(v_data->>'score', '')::numeric));
    v_status := coalesce(nullif(v_data->>'status', ''), 'completed');

    insert into public.lesson_completions (lesson_id, student_id, score, status, raw_data)
      values (v_lesson, v_student, v_score, v_status, v_data->'raw_data')
    on conflict (lesson_id, student_id) do update set
      score = case
        when excluded.score is null then public.lesson_completions.score
        when public.lesson_completions.score is null then excluded.score
        else greatest(public.lesson_completions.score, excluded.score) end,
      status = case
        when public.lesson_completions.status = 'completed' or excluded.status = 'completed' then 'completed'
        else excluded.status end,
      raw_data = case
        when excluded.score is not null and (public.lesson_completions.score is null or excluded.score > public.lesson_completions.score)
          then excluded.raw_data
        else public.lesson_completions.raw_data end;

    v_accepted := v_accepted || to_jsonb(v_item->'qid');
  end loop;

  return jsonb_build_object('accepted', v_accepted);
end;
$$;

grant execute on function public.relay_lesson_completions(jsonb) to authenticated;

notify pgrst, 'reload schema';
