-- ============================================================
-- Dos acciones de la cola de sincronización offline (sync-manager.js) no
-- eran seguras de reintentar:
--
-- 1. save_evaluation hacía un upsert a "evaluations" y LUEGO, en una
--    llamada aparte, un update a "projects.score". Si la conexión se
--    caía justo entre las dos (o el reintento repetía solo la primera
--    porque la segunda ya fue por otra vía), quedaban desincronizadas:
--    la evaluación guardada pero el score visible del proyecto atrasado,
--    o viceversa. Se junta todo en una sola función -- una sola
--    transacción implícita, si algo falla no queda nada a medias.
--
-- 2. tutor_checkin hacía un insert() plano sin ninguna clave para
--    detectar reintentos -- si la respuesta del primer intento se
--    perdía por la red pero el insert ya había llegado al servidor, el
--    reintento automático de la cola insertaba una segunda fila
--    idéntica (asistencia duplicada, día "trabajado" dos veces). La
--    tabla tutor_attendance no está en este repo (se creó fuera de las
--    migraciones trackeadas), así que en vez de asumir el tipo de su
--    "id" se agrega una columna nueva propia para esto: client_ref,
--    generada por el cliente (crypto.randomUUID()) ANTES de encolar.
--    sync-manager.js hace upsert por client_ref en vez de insert -- un
--    reintento con el mismo client_ref no crea una fila nueva.
--
-- Misma seguridad que antes: sync_save_evaluation es SECURITY INVOKER
-- (no definer), así que sigue sujeta a las mismas políticas RLS que ya
-- protegían evaluations/projects (is_assigned_teacher_for_project,
-- columnas permitidas en projects) -- no se le da al docente ningún
-- permiso nuevo, solo se atan los 2 pasos que ya hacía por separado.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create or replace function public.sync_save_evaluation(p_evaluation jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_project_id integer := (p_evaluation->>'project_id')::integer;
  v_total_score integer := (p_evaluation->>'total_score')::integer;
begin
  insert into public.evaluations (
    project_id, teacher_id, total_score, creativity_score, clarity_score,
    functionality_score, teamwork_score, social_impact_score, feedback
  ) values (
    v_project_id,
    (p_evaluation->>'teacher_id')::uuid,
    v_total_score,
    (p_evaluation->>'creativity_score')::integer,
    (p_evaluation->>'clarity_score')::integer,
    (p_evaluation->>'functionality_score')::integer,
    (p_evaluation->>'teamwork_score')::integer,
    (p_evaluation->>'social_impact_score')::integer,
    p_evaluation->>'feedback'
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

  update public.projects set score = v_total_score where id = v_project_id;
end;
$$;

grant execute on function public.sync_save_evaluation(jsonb) to authenticated;

alter table public.tutor_attendance add column if not exists client_ref uuid;
create unique index if not exists tutor_attendance_client_ref_idx
  on public.tutor_attendance (client_ref) where client_ref is not null;

notify pgrst, 'reload schema';
