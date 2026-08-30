-- Fix: projects.votes se escribía con un número calculado en el cliente
-- (newVotes = votes actual +/- 1) -- como RLS deja que el DUEÑO del
-- proyecto haga UPDATE, cualquiera podía inflar su propio contador de
-- votos directo por consola (update({votes: 999999})).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL
-- Editor de Supabase.

revoke update (votes) on public.projects from authenticated;

create or replace function public.toggle_project_like(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_liked boolean;
  v_votes int;
begin
  if exists (select 1 from public.project_likes where project_id = p_project_id and user_id = auth.uid()) then
    delete from public.project_likes where project_id = p_project_id and user_id = auth.uid();
    v_liked := false;
  else
    insert into public.project_likes (project_id, user_id) values (p_project_id, auth.uid());
    v_liked := true;
  end if;

  select count(*) into v_votes from public.project_likes where project_id = p_project_id;
  update public.projects set votes = v_votes where id = p_project_id;

  return jsonb_build_object('liked', v_liked, 'votes', v_votes);
end;
$$;

grant execute on function public.toggle_project_like(uuid) to authenticated;

notify pgrst, 'reload schema';
