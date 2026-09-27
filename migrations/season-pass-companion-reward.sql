-- ============================================================
-- PREMIO DE MASCOTA EN EL PASE DE TEMPORADA
--
-- Nuevo tipo de premio 'companion': el nivel 18 del pase regala la
-- guacamaya gratis (antes ese nivel daba gemas). Si el estudiante ya la
-- tenía, recibe 100 gemas de compensación (mismo criterio que un
-- accesorio repetido).
--
-- Para cambiar la especie del premio (por ejemplo cuando lleguen las
-- mascotas globales de la Temporada 2), solo hay que editar el 'species'
-- de acá abajo -- no hace falta tocar el cliente.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Requiere
-- migrations/season-pass.sql y companion-more.sql (is_companion_species).
-- ============================================================

create or replace function public.season_reward_json(p_level integer)
returns jsonb
language sql
immutable
as $$
  select case p_level
    when 10 then jsonb_build_object('type', 'cosmetic', 'item', 'gorro_quetzal')
    when 18 then jsonb_build_object('type', 'companion', 'species', 'guacamaya')
    when 20 then jsonb_build_object('type', 'cosmetic', 'item', 'alas_mariposa')
    when 30 then jsonb_build_object('type', 'cosmetic', 'item', 'skin_galaxia')
    when 5 then jsonb_build_object('type', 'gems', 'amount', 50)
    when 15 then jsonb_build_object('type', 'gems', 'amount', 100)
    when 25 then jsonb_build_object('type', 'gems', 'amount', 150)
    else jsonb_build_object('type', 'gems', 'amount', 10 + (p_level / 5) * 5)
  end;
$$;

create or replace function public.claim_season_reward(p_level integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season text := public.current_season_id();
  v_xp integer;
  v_sid text;
  v_reward jsonb;
  v_gems integer := 0;
begin
  select season_id, coalesce(season_xp, 0) into v_sid, v_xp from public.students where id = auth.uid() for update;
  if not found then raise exception 'Solo los estudiantes tienen Pase de Temporada'; end if;
  if coalesce(v_sid, '') <> v_season then v_xp := 0; end if;
  if p_level < 1 or p_level > least(30, v_xp / 50) then raise exception 'Todavía no llegaste a ese nivel'; end if;

  insert into public.season_claims (student_id, season_id, level) values (auth.uid(), v_season, p_level)
    on conflict do nothing;
  if not found then raise exception 'Ya reclamaste ese premio'; end if;

  v_reward := public.season_reward_json(p_level);

  if v_reward->>'type' = 'gems' then
    v_gems := (v_reward->>'amount')::int;

  elsif v_reward->>'type' = 'companion' then
    insert into public.student_companions (student_id, species) values (auth.uid(), v_reward->>'species')
      on conflict do nothing;
    if not found then v_gems := 100; end if; -- ya la tenía: compensación en gemas

  else -- 'cosmetic'
    insert into public.student_cosmetics (student_id, item_id) values (auth.uid(), v_reward->>'item')
      on conflict do nothing;
    if not found then v_gems := 100; end if; -- ya lo tenía: compensación en gemas
  end if;

  if v_gems > 0 then
    update public.students set gems = coalesce(gems, 0) + v_gems where id = auth.uid();
  end if;

  return v_reward || jsonb_build_object('gems_granted', v_gems);
end;
$$;

grant execute on function public.season_reward_json(integer) to authenticated;
grant execute on function public.claim_season_reward(integer) to authenticated;

notify pgrst, 'reload schema';
