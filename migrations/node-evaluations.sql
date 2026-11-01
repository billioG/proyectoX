-- Evaluación de proyectos hecha por un docente sin internet en un nodo escolar.
--
-- Contexto: las evaluaciones del navegador pasan por sync_save_evaluation() (SECURITY INVOKER, con la sesión del
-- docente y las políticas RLS de evaluations / is_assigned_teacher_for_project). Un nodo no tiene sesión de Supabase:
-- la función node-sync (service_role) llama a apply_node_evaluation() en nombre del docente que evaluó en el nodo.
--
-- Esta función REPITE las reglas que la nube ya exige:
--   - solo el docente ASIGNADO a la clase (escuela, grado y sección) del estudiante dueño del proyecto puede evaluar
--     (evaluations-restrict-to-assigned-teacher.sql), y el proyecto debe ser de la escuela del nodo que sincroniza;
--   - cada criterio es un entero de 0 a 20 y el total (0 a 100) lo RECALCULA la base: se ignora cualquier total_score
--     que mande el nodo;
--   - una sola evaluación por proyecto (UNIQUE project_id): reenviar la misma no duplica y cambiar las notas la
--     actualiza (gana la última), igual que sync_save_evaluation; la nota del proyecto se guarda en el mismo paso.
-- Un proyecto que el estudiante subió en el nodo y todavía no estaba publicado se identifica con el uuid del nodo
-- (projects.client_metadata->>'node_ref', lo pone node-sync al publicarlo); si aún no existe responde "aún no
-- publicado" y el nodo lo reintenta en el siguiente sync.
-- Las insignias por nota las otorga el navegador del docente con internet; desde el nodo no se otorgan.
-- Ejecutar ANTES de volver a publicar node-sync. Es idempotente (se puede correr dos veces).

create or replace function public.apply_node_evaluation(
  p_teacher uuid,
  p_school_code text,
  p_project_id integer,
  p_node_ref text,
  p_evaluation jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project integer;
  v_scores integer[] := array[]::integer[];
  v_key text;
  v_val jsonb;
  v_total integer := 0;
  v_feedback text;
begin
  -- Proyecto: por id, o por el uuid con el que el nodo lo publicó.
  if p_project_id is not null then
    select p.id into v_project from public.projects p where p.id = p_project_id;
    if v_project is null then
      raise exception 'Proyecto no encontrado';
    end if;
  elsif p_node_ref is not null then
    select p.id into v_project from public.projects p where p.client_metadata->>'node_ref' = p_node_ref order by p.id limit 1;
    if v_project is null then
      raise exception 'Proyecto aún no publicado';
    end if;
  else
    raise exception 'Falta el proyecto';
  end if;

  -- Docente asignado a la clase del estudiante dueño del proyecto, en la escuela del nodo.
  if not exists (
    select 1
      from public.projects p
      join public.students s on s.id = p.user_id
      join public.teacher_assignments ta
        on ta.school_code = s.school_code and ta.grade = s.grade and ta.section = s.section
     where p.id = v_project
       and s.school_code = p_school_code
       and ta.teacher_id = p_teacher
  ) then
    raise exception 'El docente no está asignado a la clase de este proyecto';
  end if;

  -- Cinco criterios enteros de 0 a 20; el total lo calcula la base.
  foreach v_key in array array['creativity_score', 'clarity_score', 'functionality_score', 'teamwork_score', 'social_impact_score'] loop
    v_val := p_evaluation -> v_key;
    if v_val is null or jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') !~ '^\d{1,2}$' or (v_val #>> '{}')::integer > 20 then
      raise exception 'Nota inválida en %', v_key;
    end if;
    v_scores := v_scores || (v_val #>> '{}')::integer;
    v_total := v_total + (v_val #>> '{}')::integer;
  end loop;

  v_feedback := nullif(left(p_evaluation ->> 'feedback', 1000), '');

  insert into public.evaluations (
    project_id, teacher_id, total_score, creativity_score, clarity_score,
    functionality_score, teamwork_score, social_impact_score, feedback
  ) values (
    v_project, p_teacher, v_total, v_scores[1], v_scores[2], v_scores[3], v_scores[4], v_scores[5], v_feedback
  )
  on conflict (project_id) do update set
    teacher_id = excluded.teacher_id,
    total_score = excluded.total_score,
    creativity_score = excluded.creativity_score,
    clarity_score = excluded.clarity_score,
    functionality_score = excluded.functionality_score,
    teamwork_score = excluded.teamwork_score,
    social_impact_score = excluded.social_impact_score,
    feedback = excluded.feedback;

  update public.projects set score = v_total where id = v_project;
  return v_project;
end;
$$;

revoke all on function public.apply_node_evaluation(uuid, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_node_evaluation(uuid, text, integer, text, jsonb) to service_role;

notify pgrst, 'reload schema';
