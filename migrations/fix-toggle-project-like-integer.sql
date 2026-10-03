-- toggle_project_like() se creó con p_project_id uuid, pero projects.id y
-- project_likes.project_id son integer: todo voto fallaba con
-- "invalid input syntax for type uuid: "27"". Se recrea con integer.
drop function if exists public.toggle_project_like(uuid);

create or replace function public.toggle_project_like(p_project_id integer)
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

grant execute on function public.toggle_project_like(integer) to authenticated;

notify pgrst, 'reload schema';
