-- Reacciones a proyectos hechas sin internet en un nodo escolar.
--
-- Contexto: react_to_project() (project-reactions-likes-only.sql) usa auth.uid() y alterna la reacción: no sirve
-- para aplicar lo que un estudiante hizo en el nodo, donde no hay sesión de Supabase. La función node-sync
-- (service_role) llama a apply_node_reaction() con la reacción FINAL del estudiante a un proyecto (o null si la
-- quitó): reenviar el mismo estado no suma dos veces, a diferencia de un "toggle".
--
-- Igual que con internet: una reacción por estudiante y proyecto (project_likes es UNIQUE(project_id, user_id)),
-- projects.votes = reacciones 'like' y 'excelente', y el disparador de avisos de project_likes avisa al dueño y a su
-- equipo sin decir quién reaccionó. Esta función exige además que el proyecto sea de la misma escuela del estudiante.
-- Ejecutar ANTES de volver a publicar node-sync. Es idempotente (se puede correr dos veces).

create or replace function public.apply_node_reaction(p_student uuid, p_project integer, p_reaction text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_school text;
  v_project_school text;
  v_votes integer;
begin
  if p_reaction is not null and p_reaction not in ('like', 'excelente', 'wow', 'destacar', 'animo') then
    raise exception 'Reacción no válida';
  end if;

  select school_code into v_student_school from public.students where id = p_student;
  if not found then
    raise exception 'Estudiante no encontrado';
  end if;

  select s.school_code into v_project_school
    from public.projects p
    join public.students s on s.id = p.user_id
   where p.id = p_project;
  if not found then
    raise exception 'Proyecto no encontrado';
  end if;
  if v_project_school is distinct from v_student_school then
    raise exception 'El proyecto no es de la escuela del estudiante';
  end if;

  if p_reaction is null then
    delete from public.project_likes where project_id = p_project and user_id = p_student;
  else
    insert into public.project_likes (project_id, user_id, reaction)
    values (p_project, p_student, p_reaction)
    -- Si la reacción ya es esa NO se hace UPDATE: el disparador de avisos se activa con cualquier UPDATE de
    -- reaction aunque el valor no cambie, y reenviar el mismo estado le volvería a avisar al dueño.
    on conflict (project_id, user_id) do update set reaction = excluded.reaction
      where public.project_likes.reaction is distinct from excluded.reaction;
  end if;

  select count(*) into v_votes from public.project_likes
   where project_id = p_project and reaction in ('like', 'excelente');
  update public.projects set votes = v_votes where id = p_project;

  return jsonb_build_object('mine', p_reaction, 'votes', v_votes);
end;
$$;

revoke all on function public.apply_node_reaction(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.apply_node_reaction(uuid, integer, text) to service_role;

notify pgrst, 'reload schema';
