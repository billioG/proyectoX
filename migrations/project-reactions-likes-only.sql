-- El Ranking solo debe contar los "Me gusta": projects.votes pasa a ser el
-- número de reacciones 'like' (las demás reacciones se ven en el selector pero
-- no mueven el puesto). Reemplaza react_to_project de project-reactions.sql y
-- recalcula votes con los datos actuales.
--
-- Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.

create or replace function public.react_to_project(p_project_id integer, p_reaction text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_mine text;
  v_votes int;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_reaction not in ('like', 'excelente', 'wow', 'destacar', 'animo') then
    raise exception 'Reacción no válida';
  end if;

  select reaction into v_current from public.project_likes
    where project_id = p_project_id and user_id = auth.uid();

  if v_current is null then
    insert into public.project_likes (project_id, user_id, reaction) values (p_project_id, auth.uid(), p_reaction);
    v_mine := p_reaction;
  elsif v_current = p_reaction then
    delete from public.project_likes where project_id = p_project_id and user_id = auth.uid();
    v_mine := null;
  else
    update public.project_likes set reaction = p_reaction where project_id = p_project_id and user_id = auth.uid();
    v_mine := p_reaction;
  end if;

  select count(*) into v_votes from public.project_likes
    where project_id = p_project_id and reaction = 'like';
  update public.projects set votes = v_votes where id = p_project_id;

  return jsonb_build_object('mine', v_mine, 'votes', v_votes);
end;
$$;

grant execute on function public.react_to_project(integer, text) to authenticated;

update public.projects p
set votes = (select count(*) from public.project_likes l where l.project_id = p.id and l.reaction = 'like');

notify pgrst, 'reload schema';
