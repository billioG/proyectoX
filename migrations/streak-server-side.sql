-- Fix: la racha (streak/last_login) todavía se escribía directo desde el
-- cliente -- el resto de la economía (xp/gems/cofre/tienda) ya pasa por RPC
-- desde economy-server-side.sql, pero esto quedó afuera. Un alumno podía
-- hacer:
--   supabase.from('students').update({streak: 999}).eq('id', miId)
--
-- De paso corrige una REGRESIÓN real que introdujo economy-server-side-fix2:
-- al revocar UPDATE de streak_freeze, el update de la racha que también
-- toca esa columna (cuando se consume un Hielo) empezó a fallar en
-- silencio -- el alumno con Hielo activo dejaba de poder actualizar su
-- racha del todo. touch_daily_login() la consume server-side sin ese
-- problema (corre como dueño de la función, no como "authenticated").
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL
-- Editor de Supabase.

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'students'
    and column_name not in ('xp', 'gems', 'daily_chest_last_claimed', 'streak_freeze', 'has_gold_frame', 'has_mascot_glasses', 'streak', 'last_login');

  execute 'revoke update on public.students from authenticated';
  execute format('grant update (%s) on public.students to authenticated', cols);
end $$;

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ') into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'teachers'
    and column_name not in ('xp', 'gems', 'daily_chest_last_claimed', 'streak_freeze', 'streak', 'last_login');

  execute 'revoke update on public.teachers from authenticated';
  execute format('grant update (%s) on public.teachers to authenticated', cols);
end $$;

create or replace function public.touch_daily_login()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_last_login date;
  v_streak int;
  v_streak_freeze boolean;
  v_new_streak int;
  v_freeze_used boolean := false;
  v_today date := current_date;
begin
  if exists (select 1 from public.students where id = auth.uid()) then
    v_table := 'students';
  elsif exists (select 1 from public.teachers where id = auth.uid()) then
    v_table := 'teachers';
  else
    raise exception 'Usuario no encontrado';
  end if;

  execute format('select last_login, streak, coalesce(streak_freeze, false) from public.%I where id = $1', v_table)
    into v_last_login, v_streak, v_streak_freeze using auth.uid();

  -- Ya se tocó hoy (server-side, no se puede mentir con el reloj del
  -- dispositivo) -- no hace nada, devuelve el estado actual.
  if v_last_login = v_today then
    return jsonb_build_object('streak', coalesce(v_streak, 0), 'changed', false, 'lastLogin', v_today);
  end if;

  if v_last_login = v_today - 1 then
    v_new_streak := coalesce(v_streak, 0) + 1;
  elsif v_last_login is null then
    v_new_streak := 1;
  elsif v_streak_freeze then
    v_new_streak := coalesce(v_streak, 0);
    v_freeze_used := true;
  else
    v_new_streak := 1;
  end if;

  if v_freeze_used then
    execute format('update public.%I set last_login = $1, streak = $2, streak_freeze = false where id = $3', v_table)
      using v_today, v_new_streak, auth.uid();
  else
    execute format('update public.%I set last_login = $1, streak = $2 where id = $3', v_table)
      using v_today, v_new_streak, auth.uid();
  end if;

  return jsonb_build_object('streak', v_new_streak, 'changed', true, 'freezeUsed', v_freeze_used, 'lastLogin', v_today);
end;
$$;

grant execute on function public.touch_daily_login() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICAR después de correr esto (debe fallar con "permission denied
-- for table students"):
--   await window._supabase.from('students').update({streak: 999}).eq('id', window.currentUser.id)
-- ============================================================
