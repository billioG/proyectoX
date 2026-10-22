-- ============================================================
-- PONDERACIÓN POR RECURSO DENTRO DE UN CURSO (v1.0.173)
--
-- Antes: los puntos del curso se repartían SIEMPRE en partes iguales entre
-- los recursos con nota (Quiz/H5P/SCORM), sin que el docente pudiera cambiarlo.
-- Ahora la app SUGIERE un reparto (según el tamaño de cada actividad y si es
-- una evaluación final) y el docente lo aprueba tal cual o pone los puntos a
-- mano. Mientras no lo apruebe, la nota usa la sugerencia.
--
-- Además, protege las notas de lesson_completions:
--   * se limitan a 0-100 (un paquete SCORM que reporte 8 de 10 como "8" ya no
--     se guarda como 8 %: la app ahora convierte a porcentaje; esto es la
--     segunda barrera);
--   * al reabrir una actividad la nota ya NO baja: se conserva la mejor
--     (antes un SCORM que al reiniciar reportaba 0 borraba la nota obtenida);
--   * un recurso ya completado no vuelve a quedar "incompleto" (eso bloqueaba
--     los recursos siguientes del curso).
--
-- ADITIVO / NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL
-- Editor de Supabase. Funciona con la app vieja y con la nueva.
-- ============================================================

alter table public.lessons add column if not exists grade_points numeric(6,2);
alter table public.lessons add column if not exists counts_for_grade boolean;
alter table public.lessons drop constraint if exists lessons_grade_points_check;
alter table public.lessons add constraint lessons_grade_points_check check (grade_points is null or grade_points >= 0);

alter table public.courses add column if not exists weights_approved_at timestamptz;
alter table public.courses add column if not exists weights_approved_by uuid;


-- ---------- Guardar la ponderación aprobada por el docente ----------
-- p_items: [{"lesson_id": "...", "counts": true, "points": 5}, ...]
-- Los puntos de los recursos que cuentan deben sumar exactamente lo que vale
-- el curso. Puede hacerlo quien creó el curso, el admin o un docente asignado
-- a esa clase.
create or replace function public.set_course_resource_points(p_course uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  it jsonb;
  v_counts boolean;
  v_points numeric;
  v_sum numeric := 0;
begin
  select * into c from public.courses where id = p_course;
  if not found then
    raise exception 'Curso no encontrado';
  end if;

  if not (
    c.created_by = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.teacher_assignments ta
      where ta.teacher_id = auth.uid()
        and ta.school_code = c.school_code and ta.grade = c.grade and ta.section = c.section
    )
  ) then
    raise exception 'No tienes permiso para ponderar este curso';
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_counts := coalesce((it->>'counts')::boolean, false);
    v_points := case when v_counts then round(greatest(0, coalesce((it->>'points')::numeric, 0)), 2) else 0 end;
    update public.lessons
       set counts_for_grade = v_counts,
           grade_points = v_points
     where id = (it->>'lesson_id')::uuid
       and course_id = p_course;
    v_sum := v_sum + v_points;
  end loop;

  if abs(v_sum - c.weight) > 0.01 then
    raise exception 'Los puntos de los recursos suman % y el curso vale %', v_sum, c.weight;
  end if;

  update public.courses
     set weights_approved_at = now(), weights_approved_by = auth.uid()
   where id = p_course;
end;
$$;
revoke all on function public.set_course_resource_points(uuid, jsonb) from public, anon;
grant execute on function public.set_course_resource_points(uuid, jsonb) to authenticated;


-- ---------- Notas de recursos: rango 0-100, la mejor se conserva ----------
create or replace function public.guard_lesson_completion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.score is not null then
    new.score := least(100, greatest(0, new.score));
  end if;

  if tg_op = 'UPDATE' then
    if old.score is not null and (new.score is null or new.score < old.score) then
      new.score := old.score;
    end if;
    if old.status is not null and old.status <> 'incomplete' and new.status = 'incomplete' then
      new.status := old.status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_lesson_completion on public.lesson_completions;
create trigger trg_guard_lesson_completion
  before insert or update on public.lesson_completions
  for each row execute function public.guard_lesson_completion();

notify pgrst, 'reload schema';
