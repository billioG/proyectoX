-- ============================================================
-- FIX CRÍTICO: xp/gems/flags de economía se escribían directo desde el
-- cliente (cofre diario, tienda, reto del mes, primera foto de perfil) --
-- students_update_self_or_staff permite que el usuario actualice su PROPIA
-- fila, y protect_student_privileged_fields() nunca protegió estas
-- columnas. Cualquiera con la consola del navegador podía:
--   supabase.from('students').update({xp: 999999, gems: 999999}).eq('id', miId)
-- Este script bloquea la escritura directa de esas columnas (ni siquiera
-- un admin puede tocarlas por UPDATE normal -- para eso se agrega
-- admin_adjust_economy más abajo) y mueve cada acción de recompensa a una
-- función SECURITY DEFINER que valida todo server-side.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL
-- Editor de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Bloquear UPDATE directo de columnas de economía (ambas tablas).
--    Un GRANT column-level en Postgres es all-or-nothing por rol -- no
--    depende de RLS, así que ni el propio dueño de la fila ni un staff
--    logueado como "authenticated" puede tocarlas por UPDATE normal.
--    Las funciones de abajo SÍ pueden: corren SECURITY DEFINER (como
--    dueño de la función, no como "authenticated").
-- ------------------------------------------------------------
revoke update (xp, gems, daily_chest_last_claimed, streak_freeze, has_gold_frame, has_mascot_glasses)
  on public.students from authenticated;
revoke update (xp, gems, daily_chest_last_claimed, streak_freeze)
  on public.teachers from authenticated;

-- ------------------------------------------------------------
-- 1. Cofre diario -- antes el premio se elegía con Math.random() en el
--    navegador y la fecha de "ya reclamado hoy" solo se chequeaba en el
--    cliente antes de mostrar el modal, no al escribir.
-- ------------------------------------------------------------
create or replace function public.claim_daily_chest()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_last_claimed date;
  v_roll int;
  v_reward jsonb;
begin
  if exists (select 1 from public.students where id = auth.uid()) then
    v_table := 'students';
  elsif exists (select 1 from public.teachers where id = auth.uid()) then
    v_table := 'teachers';
  else
    raise exception 'Usuario no encontrado';
  end if;

  execute format('select daily_chest_last_claimed from public.%I where id = $1', v_table)
    into v_last_claimed using auth.uid();

  if v_last_claimed = current_date then
    raise exception 'Ya reclamaste el cofre de hoy';
  end if;

  v_roll := floor(random() * 3);
  if v_roll = 0 then
    v_reward := jsonb_build_object('xp', 20, 'gems', 5, 'msg', 'Poquito pero bendito');
  elsif v_roll = 1 then
    v_reward := jsonb_build_object('xp', 50, 'gems', 15, 'msg', '¡Nada mal!');
  else
    v_reward := jsonb_build_object('xp', 100, 'gems', 50, 'msg', '¡Premio Mayor!', 'card', 'Carta Algoritmo Dorado');
  end if;

  execute format(
    'update public.%I set daily_chest_last_claimed = current_date, xp = coalesce(xp,0) + $1, gems = coalesce(gems,0) + $2 where id = $3',
    v_table
  ) using (v_reward->>'xp')::int, (v_reward->>'gems')::int, auth.uid();

  return v_reward;
end;
$$;

grant execute on function public.claim_daily_chest() to authenticated;

-- ------------------------------------------------------------
-- 2. Tienda -- precios y flags fijos EN EL SERVIDOR (antes el precio
--    llegaba como parámetro desde el cliente, se podía mandar cualquiera).
-- ------------------------------------------------------------
create or replace function public.buy_shop_item(p_item text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_price int;
  v_flag text;
  v_gems int;
  v_already boolean;
begin
  if exists (select 1 from public.students where id = auth.uid()) then
    v_table := 'students';
  elsif exists (select 1 from public.teachers where id = auth.uid()) then
    v_table := 'teachers';
  else
    raise exception 'Usuario no encontrado';
  end if;

  if p_item = 'Racha Congelada' then
    v_price := 300; v_flag := 'streak_freeze';
  elsif p_item = 'Marco Dorado' then
    v_price := 1000; v_flag := 'has_gold_frame';
  elsif p_item = 'Gafas de la Mascota' then
    v_price := 400; v_flag := 'has_mascot_glasses';
  else
    raise exception 'Ítem no disponible';
  end if;

  execute format('select gems, %I from public.%I where id = $1', v_flag, v_table)
    into v_gems, v_already using auth.uid();

  if v_already then
    raise exception 'Ya tenés ese ítem';
  end if;
  if coalesce(v_gems, 0) < v_price then
    raise exception 'No tenés suficientes gemas';
  end if;

  execute format('update public.%I set gems = gems - $1, %I = true where id = $2', v_table, v_flag)
    using v_price, auth.uid();

  return jsonb_build_object('ok', true, 'newGems', v_gems - v_price);
end;
$$;

grant execute on function public.buy_shop_item(text) to authenticated;

-- ------------------------------------------------------------
-- 3. Reto del mes (estudiante) -- el unique(student_id, challenge_id) ya
--    existía y evitaba el doble INSERT, pero el premio de XP/gemas era un
--    UPDATE aparte sin ninguna protección: se podía repetir esa llamada
--    sola las veces que quisiera sin volver a insertar nada.
-- ------------------------------------------------------------
create or replace function public.claim_student_challenge_reward(p_challenge_id text, p_comment text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_comment is null or length(trim(p_comment)) = 0 then
    raise exception 'Falta el comentario';
  end if;

  insert into public.student_challenges (student_id, challenge_id, comment)
    values (auth.uid(), p_challenge_id, p_comment);
  -- Si ya existe (student_id, challenge_id), el unique constraint tira
  -- excepción acá y la función aborta ANTES de otorgar nada.

  update public.students set xp = coalesce(xp,0) + 30, gems = coalesce(gems,0) + 10 where id = auth.uid();

  return jsonb_build_object('xp', 30, 'gems', 10);
end;
$$;

grant execute on function public.claim_student_challenge_reward(text, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Primera foto de perfil -- "primera vez" se detectaba mirando
--    window.userData.profile_photo_url en memoria del cliente, así que
--    subir varias fotos (o solo repetir la llamada del premio) daba XP
--    y gemas cada vez.
-- ------------------------------------------------------------
create or replace function public.claim_first_profile_photo_reward(p_photo_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_already text;
begin
  if exists (select 1 from public.students where id = auth.uid()) then
    v_table := 'students';
  elsif exists (select 1 from public.teachers where id = auth.uid()) then
    v_table := 'teachers';
  else
    raise exception 'Usuario no encontrado';
  end if;

  execute format('select profile_photo_url from public.%I where id = $1', v_table)
    into v_already using auth.uid();

  if v_already is not null then
    execute format('update public.%I set profile_photo_url = $1 where id = $2', v_table)
      using p_photo_url, auth.uid();
    return jsonb_build_object('rewarded', false);
  end if;

  execute format(
    'update public.%I set profile_photo_url = $1, xp = coalesce(xp,0) + 100, gems = coalesce(gems,0) + 25 where id = $2',
    v_table
  ) using p_photo_url, auth.uid();

  return jsonb_build_object('rewarded', true, 'xp', 100, 'gems', 25);
end;
$$;

grant execute on function public.claim_first_profile_photo_reward(text) to authenticated;

-- ------------------------------------------------------------
-- 5. Ajuste manual de economía -- para cuando soporte/admin necesite
--    corregir a mano (ej. bug reportado, gemas perdidas). Reemplaza el
--    UPDATE directo que un admin ya no puede hacer por el REVOKE de arriba.
-- ------------------------------------------------------------
create or replace function public.admin_adjust_economy(p_user_id uuid, p_xp_delta int, p_gems_delta int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  if exists (select 1 from public.students where id = p_user_id) then
    v_table := 'students';
  elsif exists (select 1 from public.teachers where id = p_user_id) then
    v_table := 'teachers';
  else
    raise exception 'Usuario no encontrado';
  end if;

  execute format(
    'update public.%I set xp = greatest(0, coalesce(xp,0) + $1), gems = greatest(0, coalesce(gems,0) + $2) where id = $3',
    v_table
  ) using p_xp_delta, p_gems_delta, p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_adjust_economy(uuid, int, int) to authenticated;

notify pgrst, 'reload schema';
