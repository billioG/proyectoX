-- Reacciones en proyectos (además del "me gusta"): like, excelente, wow,
-- destacar, animo. Cada usuario sigue teniendo UNA sola reacción por proyecto
-- (project_likes ya es UNIQUE(project_id, user_id)); cambiar de reacción la
-- reemplaza y tocar la misma la quita. projects.votes sigue siendo el total
-- de reacciones, así que el Ranking no cambia.
--
-- ADITIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.

alter table public.project_likes add column if not exists reaction text not null default 'like';

alter table public.project_likes drop constraint if exists project_likes_reaction_check;
alter table public.project_likes add constraint project_likes_reaction_check
  check (reaction in ('like', 'excelente', 'wow', 'destacar', 'animo'));

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

  select count(*) into v_votes from public.project_likes where project_id = p_project_id and reaction in ('like', 'excelente');
  update public.projects set votes = v_votes where id = p_project_id;

  return jsonb_build_object('mine', v_mine, 'votes', v_votes);
end;
$$;

create or replace function public.get_project_reactions(p_project_id integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'counts', coalesce((
      select jsonb_object_agg(reaction, n)
      from (select reaction, count(*) as n from public.project_likes where project_id = p_project_id group by reaction) c
    ), '{}'::jsonb),
    'mine', (select reaction from public.project_likes where project_id = p_project_id and user_id = auth.uid())
  );
$$;

grant execute on function public.react_to_project(integer, text) to authenticated;
grant execute on function public.get_project_reactions(integer) to authenticated;

notify pgrst, 'reload schema';
