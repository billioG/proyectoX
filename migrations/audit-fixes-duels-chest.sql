-- ============================================================
-- Fixes de auditoría (septiembre 2026):
--   1. Apuestas 1v1 creaban gemas de la nada: el ganador cobraba el wager
--      completo aunque el perdedor tuviera menos (greatest(0, ...)).
--      Ahora se transfiere least(wager, gemas del perdedor), y no se puede
--      crear un reto apostando más gemas de las que se tienen.
--   2. Las 5 tablas de duelos tenían INSERT/UPDATE completo: un
--      participante podía escribir "word" y ganar seguro, cambiar el
--      wager después de aceptado, o marcarse ganador. Ahora el cliente
--      solo puede insertar las columnas del reto y actualizar "status"
--      (y solo pending->cancelled por el retador / pending->rejected por
--      el rival). Edge functions (service_role) y RPCs no se ven afectados.
--   3. Cofre diario y racha usaban current_date (UTC): el "día" cambiaba a
--      las 18:00 de Guatemala. Ahora usan la fecha de America/Guatemala.
--      Además touch_daily_login leía streak_freeze en teachers (columna
--      inexistente) -- la racha de los docentes fallaba siempre.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cierre común de duelo con transferencia topeada
-- ------------------------------------------------------------
create or replace function public.finish_student_duel(
  p_table text, p_duel_id uuid, p_challenger uuid, p_opponent uuid, p_wager integer, p_winner uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loser uuid;
  v_loser_gems integer;
  v_amount integer;
begin
  if p_winner is not null and p_wager > 0 then
    v_loser := case when p_winner = p_challenger then p_opponent else p_challenger end;
    select coalesce(gems, 0) into v_loser_gems from public.students where id = v_loser for update;
    v_amount := least(p_wager, greatest(coalesce(v_loser_gems, 0), 0));
    if v_amount > 0 then
      update public.students set gems = gems - v_amount where id = v_loser;
      update public.students set gems = coalesce(gems, 0) + v_amount where id = p_winner;
    end if;
  end if;

  update public.students set xp = coalesce(xp, 0) + 5 where id in (p_challenger, p_opponent);
  if p_winner is not null then
    update public.students set xp = coalesce(xp, 0) + 15 where id = p_winner;
  end if;

  execute format(
    'update public.%I set status = ''completed'', winner_id = $1, resolved_at = timezone(''utc'', now()) where id = $2',
    p_table
  ) using p_winner, p_duel_id;
end;
$$;

revoke execute on function public.finish_student_duel(text, uuid, uuid, uuid, integer, uuid) from public, anon, authenticated;

-- Duelos de trivia
create or replace function public.settle_student_duel()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_duel record; v_a record; v_count integer; v_winner_id uuid;
begin
  select * into v_duel from public.student_duels where id = new.duel_id;
  if v_duel.status = 'completed' then return new; end if;
  select count(*) into v_count from public.student_duel_answers where duel_id = new.duel_id;
  if v_count < 2 then return new; end if;

  select
    max(case when student_id = v_duel.challenger_id then score end) as c_score,
    max(case when student_id = v_duel.opponent_id then score end) as o_score
  into v_a from public.student_duel_answers where duel_id = new.duel_id;

  v_winner_id := case
    when v_a.c_score > v_a.o_score then v_duel.challenger_id
    when v_a.o_score > v_a.c_score then v_duel.opponent_id
    else null end;

  perform public.finish_student_duel('student_duels', new.duel_id, v_duel.challenger_id, v_duel.opponent_id, v_duel.wager_gems, v_winner_id);
  return new;
end;
$$;

-- Ahorcado
create or replace function public.settle_student_hangman_duel()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_duel record; v_r record; v_count integer; v_winner_id uuid;
begin
  select * into v_duel from public.student_hangman_duels where id = new.duel_id;
  if v_duel.status = 'completed' then return new; end if;
  select count(*) into v_count from public.student_hangman_results where duel_id = new.duel_id;
  if v_count < 2 then return new; end if;

  select
    max(case when student_id = v_duel.challenger_id then solved::int end) as c_ok,
    max(case when student_id = v_duel.challenger_id then time_ms end) as c_time,
    max(case when student_id = v_duel.opponent_id then solved::int end) as o_ok,
    max(case when student_id = v_duel.opponent_id then time_ms end) as o_time
  into v_r from public.student_hangman_results where duel_id = new.duel_id;

  v_winner_id := case
    when v_r.c_ok = 1 and v_r.o_ok = 1 then case when v_r.c_time <= v_r.o_time then v_duel.challenger_id else v_duel.opponent_id end
    when v_r.c_ok = 1 then v_duel.challenger_id
    when v_r.o_ok = 1 then v_duel.opponent_id
    else null end;

  perform public.finish_student_duel('student_hangman_duels', new.duel_id, v_duel.challenger_id, v_duel.opponent_id, v_duel.wager_gems, v_winner_id);
  return new;
end;
$$;

-- Contrarreloj
create or replace function public.settle_student_timed_math_duel()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_duel record; v_r record; v_count integer; v_winner_id uuid;
begin
  select * into v_duel from public.student_timed_math_duels where id = new.duel_id;
  if v_duel.status = 'completed' then return new; end if;
  select count(*) into v_count from public.student_timed_math_results where duel_id = new.duel_id;
  if v_count < 2 then return new; end if;

  select
    max(case when student_id = v_duel.challenger_id then score end) as c_score,
    max(case when student_id = v_duel.challenger_id then time_ms end) as c_time,
    max(case when student_id = v_duel.opponent_id then score end) as o_score,
    max(case when student_id = v_duel.opponent_id then time_ms end) as o_time
  into v_r from public.student_timed_math_results where duel_id = new.duel_id;

  v_winner_id := case
    when v_r.c_score > v_r.o_score then v_duel.challenger_id
    when v_r.o_score > v_r.c_score then v_duel.opponent_id
    when v_r.c_time < v_r.o_time then v_duel.challenger_id
    when v_r.o_time < v_r.c_time then v_duel.opponent_id
    else null end;

  perform public.finish_student_duel('student_timed_math_duels', new.duel_id, v_duel.challenger_id, v_duel.opponent_id, v_duel.wager_gems, v_winner_id);
  return new;
end;
$$;

-- Encontrá el Error
create or replace function public.settle_student_debug_duel()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_duel record; v_r record; v_count integer; v_winner_id uuid;
begin
  select * into v_duel from public.student_debug_duels where id = new.duel_id;
  if v_duel.status = 'completed' then return new; end if;
  select count(*) into v_count from public.student_debug_results where duel_id = new.duel_id;
  if v_count < 2 then return new; end if;

  select
    max(case when student_id = v_duel.challenger_id then correct::int end) as c_ok,
    max(case when student_id = v_duel.challenger_id then time_ms end) as c_time,
    max(case when student_id = v_duel.opponent_id then correct::int end) as o_ok,
    max(case when student_id = v_duel.opponent_id then time_ms end) as o_time
  into v_r from public.student_debug_results where duel_id = new.duel_id;

  v_winner_id := case
    when v_r.c_ok = 1 and v_r.o_ok = 1 then case when v_r.c_time <= v_r.o_time then v_duel.challenger_id else v_duel.opponent_id end
    when v_r.c_ok = 1 then v_duel.challenger_id
    when v_r.o_ok = 1 then v_duel.opponent_id
    else null end;

  perform public.finish_student_duel('student_debug_duels', new.duel_id, v_duel.challenger_id, v_duel.opponent_id, v_duel.wager_gems, v_winner_id);
  return new;
end;
$$;

-- Ortografía
create or replace function public.settle_student_spelling_duel()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_duel record; v_r record; v_count integer; v_winner_id uuid;
begin
  select * into v_duel from public.student_spelling_duels where id = new.duel_id;
  if v_duel.status = 'completed' then return new; end if;
  select count(*) into v_count from public.student_spelling_results where duel_id = new.duel_id;
  if v_count < 2 then return new; end if;

  select
    max(case when student_id = v_duel.challenger_id then correct::int end) as c_ok,
    max(case when student_id = v_duel.challenger_id then time_ms end) as c_time,
    max(case when student_id = v_duel.opponent_id then correct::int end) as o_ok,
    max(case when student_id = v_duel.opponent_id then time_ms end) as o_time
  into v_r from public.student_spelling_results where duel_id = new.duel_id;

  v_winner_id := case
    when v_r.c_ok = 1 and v_r.o_ok = 1 then case when v_r.c_time <= v_r.o_time then v_duel.challenger_id else v_duel.opponent_id end
    when v_r.c_ok = 1 then v_duel.challenger_id
    when v_r.o_ok = 1 then v_duel.opponent_id
    else null end;

  perform public.finish_student_duel('student_spelling_duels', new.duel_id, v_duel.challenger_id, v_duel.opponent_id, v_duel.wager_gems, v_winner_id);
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. Guardas de escritura desde el cliente
-- ------------------------------------------------------------
-- current_user es 'authenticated' solo en requests directos del cliente;
-- dentro de RPCs security definer es el dueño, y en edge functions es
-- service_role -- esos caminos quedan libres.
create or replace function public.guard_student_duel_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_gems integer;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select coalesce(gems, 0) into v_gems from public.students where id = new.challenger_id;
    if new.wager_gems > coalesce(v_gems, 0) then
      raise exception 'No tenés suficientes gemas para esa apuesta';
    end if;
    return new;
  end if;

  -- UPDATE: solo cancelar (retador) o rechazar (rival) un reto pendiente.
  if old.status = 'pending' and new.status = 'cancelled' and auth.uid() = old.challenger_id then
    return new;
  end if;
  if old.status = 'pending' and new.status = 'rejected' and auth.uid() = old.opponent_id then
    return new;
  end if;
  raise exception 'Cambio de estado no permitido';
end;
$$;

do $$
declare
  t text;
  v_insert_cols text;
begin
  foreach t in array array['student_duels', 'student_hangman_duels', 'student_timed_math_duels', 'student_debug_duels', 'student_spelling_duels'] loop
    select string_agg(quote_ident(column_name), ', ') into v_insert_cols
    from information_schema.columns
    where table_schema = 'public' and table_name = t
      and column_name in ('challenger_id', 'opponent_id', 'wager_gems', 'topic', 'question_count');

    execute format('revoke insert, update on public.%I from authenticated, anon', t);
    execute format('grant insert (%s) on public.%I to authenticated', v_insert_cols, t);
    execute format('grant update (status) on public.%I to authenticated', t);

    execute format('drop trigger if exists trg_guard_%s on public.%I', t, t);
    execute format('create trigger trg_guard_%s before insert or update on public.%I for each row execute function public.guard_student_duel_write()', t, t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. Cofre diario y racha con fecha de Guatemala
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
  v_today date := (now() at time zone 'America/Guatemala')::date;
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

  if v_last_claimed >= v_today then
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
    'update public.%I set daily_chest_last_claimed = $4, xp = coalesce(xp,0) + $1, gems = coalesce(gems,0) + $2 where id = $3',
    v_table
  ) using (v_reward->>'xp')::int, (v_reward->>'gems')::int, auth.uid(), v_today;

  return v_reward;
end;
$$;

grant execute on function public.claim_daily_chest() to authenticated;

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
  v_streak_freeze boolean := false;
  v_new_streak int;
  v_freeze_used boolean := false;
  v_today date := (now() at time zone 'America/Guatemala')::date;
begin
  if exists (select 1 from public.students where id = auth.uid()) then
    v_table := 'students';
    select last_login, streak, coalesce(streak_freeze, false)
      into v_last_login, v_streak, v_streak_freeze
      from public.students where id = auth.uid();
  elsif exists (select 1 from public.teachers where id = auth.uid()) then
    v_table := 'teachers';
    -- teachers no tiene streak_freeze (la tienda es solo de estudiantes).
    select last_login, streak into v_last_login, v_streak
      from public.teachers where id = auth.uid();
  else
    raise exception 'Usuario no encontrado';
  end if;

  if v_last_login >= v_today then
    return jsonb_build_object('streak', coalesce(v_streak, 0), 'changed', false, 'lastLogin', v_last_login);
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
    update public.students set last_login = v_today, streak = v_new_streak, streak_freeze = false where id = auth.uid();
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
-- VERIFICAR (consola del navegador, logueado como estudiante):
--   1) Debe fallar con "permission denied":
--      await window._supabase.from('student_hangman_duels').update({ wager_gems: 1 }).eq('id', '<id de un duelo tuyo>')
--   2) Debe fallar con "No tenés suficientes gemas para esa apuesta":
--      await window._supabase.from('student_hangman_duels').insert({ challenger_id: window.currentUser.id, opponent_id: '<id compañero>', wager_gems: 999999, topic: 'x' })
-- ============================================================
