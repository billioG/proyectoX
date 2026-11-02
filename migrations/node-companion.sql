-- ============================================================
-- Mascota (compañero) hecha EN EL NODO escolar sin internet: la función node-sync (service_role) la aplica con la MISMA lógica que las funciones
-- del estudiante (choose_companion, buy_companion_egg, set_active_companion, buy_cosmetic, equip_cosmetic), pero para un estudiante dado, porque
-- el nodo no tiene sesión de Supabase (auth.uid() sería null). Si la acción ya no es válida (gastó las gemas en otro lado, ya tenía la mascota...)
-- lanza el mismo error que la función original y node-sync lo descarta; el estado de la nube manda en la siguiente bajada.
--
-- Requiere companion-collection.sql y companion-cosmetics.sql. Solo service_role puede ejecutarla (ni la app ni anon).
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function public.apply_node_companion(
  p_student_id uuid, p_fn text, p_species text default null, p_item text default null, p_slot text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price constant integer := 150;
  v_me record;
  v_item record;
  v_equipped jsonb;
begin
  select id, coalesce(gems, 0) as gems, coalesce(gems_earned_total, 0) as earned, companion_species,
         coalesce(companion_equipped, '{}'::jsonb) as equipped
    into v_me from public.students where id = p_student_id for update;
  if v_me.id is null then raise exception 'Solo los estudiantes tienen mascota'; end if;

  if p_fn = 'choose_companion' then
    if p_species not in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati') then raise exception 'Mascota inválida'; end if;
    if v_me.companion_species is not null then raise exception 'Ya elegiste tu primera mascota: las demás se consiguen en la Quetzadex'; end if;
    update public.students set companion_species = p_species where id = p_student_id;
    insert into public.student_companions (student_id, species) values (p_student_id, p_species) on conflict do nothing;
    return jsonb_build_object('species', p_species);

  elsif p_fn = 'buy_companion_egg' then
    if p_species not in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati') then raise exception 'Mascota inválida'; end if;
    if v_me.companion_species is null then raise exception 'Primero elegí tu mascota inicial (es gratis)'; end if;
    if exists (select 1 from public.student_companions where student_id = p_student_id and species = p_species) then raise exception 'Ya tenés esta mascota'; end if;
    if v_me.gems < v_price then raise exception 'Te faltan % gemas para este huevo', v_price - v_me.gems; end if;
    perform set_config('quetzal.gem_reason', 'companion_egg', true);
    update public.students set gems = gems - v_price, companion_species = p_species where id = p_student_id;
    perform set_config('quetzal.gem_reason', '', true);
    insert into public.student_companions (student_id, species) values (p_student_id, p_species);
    return jsonb_build_object('species', p_species, 'gems', v_me.gems - v_price);

  elsif p_fn = 'set_active_companion' then
    if not exists (select 1 from public.student_companions where student_id = p_student_id and species = p_species) then raise exception 'Todavía no tenés esa mascota'; end if;
    update public.students set companion_species = p_species where id = p_student_id;
    return jsonb_build_object('species', p_species);

  elsif p_fn = 'buy_cosmetic' then
    select * into v_item from public.cosmetic_items where id = p_item;
    if v_item is null then raise exception 'Ese accesorio no existe'; end if;
    if v_item.price = 0 then raise exception 'Este se desbloquea gratis al evolucionar'; end if;
    if public.companion_stage(v_me.earned) < v_item.min_stage then raise exception 'Tu mascota todavía no evolucionó lo suficiente'; end if;
    if exists (select 1 from public.student_cosmetics where student_id = p_student_id and item_id = p_item) then raise exception 'Ya lo tenés'; end if;
    if v_me.gems < v_item.price then raise exception 'No tenés suficientes gemas'; end if;
    update public.students set gems = gems - v_item.price where id = p_student_id;
    insert into public.student_cosmetics (student_id, item_id) values (p_student_id, p_item);
    return jsonb_build_object('gems', v_me.gems - v_item.price);

  elsif p_fn = 'equip_cosmetic' then
    if p_slot not in ('head', 'face', 'back', 'skin') then raise exception 'Slot inválido'; end if;
    v_equipped := v_me.equipped;
    if p_item is null then
      v_equipped := v_equipped - p_slot;
    else
      select * into v_item from public.cosmetic_items where id = p_item;
      if v_item is null or v_item.slot <> p_slot then raise exception 'Accesorio inválido'; end if;
      if public.companion_stage(v_me.earned) < v_item.min_stage then raise exception 'Tu mascota todavía no evolucionó lo suficiente'; end if;
      if v_item.price > 0 and not exists (select 1 from public.student_cosmetics where student_id = p_student_id and item_id = p_item) then raise exception 'Todavía no lo compraste'; end if;
      v_equipped := jsonb_set(v_equipped, array[p_slot], to_jsonb(p_item));
    end if;
    update public.students set companion_equipped = v_equipped where id = p_student_id;
    return v_equipped;

  else
    raise exception 'Acción no soportada';
  end if;
end;
$$;

revoke all on function public.apply_node_companion(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_node_companion(uuid, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
