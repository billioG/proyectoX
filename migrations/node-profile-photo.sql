-- ============================================================
-- Foto de perfil cambiada EN EL NODO escolar sin internet. La imagen sube a Storage (depósito profile-photos) con una URL firmada que da node-sync, y después node-sync (service_role)
-- llama a esta función con el usuario y la dirección pública de la imagen. Hace lo mismo que claim_first_profile_photo_reward (migrations/economy-server-side.sql) pero para un
-- usuario dado, porque el nodo no tiene sesión de Supabase (auth.uid() sería null): guarda la foto y, si es la PRIMERA, da +100 XP y +25 gemas (una sola vez, decidido aquí en el servidor).
-- La dirección tiene que ser de una imagen de ESE usuario en el depósito de fotos (<id>_<hora>.<ext>).
--
-- Requiere economy-server-side.sql. Solo service_role puede ejecutarla (ni la app ni anon).
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- ============================================================

create or replace function public.apply_node_profile_photo(p_user uuid, p_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_already text;
begin
  if p_user is null or p_url is null
     or p_url !~ ('/storage/v1/object/public/profile-photos/' || p_user::text || '_[0-9]{9,15}\.(png|jpe?g|webp|gif)$') then
    raise exception 'Foto no válida';
  end if;

  if exists (select 1 from public.students where id = p_user) then
    v_table := 'students';
  elsif exists (select 1 from public.teachers where id = p_user) then
    v_table := 'teachers';
  else
    raise exception 'Usuario no encontrado';
  end if;

  execute format('select profile_photo_url from public.%I where id = $1', v_table) into v_already using p_user;

  if v_already is not null then
    execute format('update public.%I set profile_photo_url = $1 where id = $2', v_table) using p_url, p_user;
    return jsonb_build_object('rewarded', false);
  end if;

  execute format('update public.%I set profile_photo_url = $1, xp = coalesce(xp, 0) + 100, gems = coalesce(gems, 0) + 25 where id = $2', v_table) using p_url, p_user;
  return jsonb_build_object('rewarded', true, 'xp', 100, 'gems', 25);
end;
$$;

revoke all on function public.apply_node_profile_photo(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_node_profile_photo(uuid, text) to service_role;

notify pgrst, 'reload schema';
