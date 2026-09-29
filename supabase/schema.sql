--
-- PostgreSQL database dump
--

\restrict 0PeXLA9fFE91VyswdJGl6kR5qz2ArDaDCaZQxcOLzGFg60H71LL22WZDfXjjGcf

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: accept_timed_math_duel(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_timed_math_duel(p_duel_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_grade text;
  v_problems jsonb;
begin
  select * into v_duel from public.student_timed_math_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.status != 'pending' then
    return jsonb_build_object('ok', true);
  end if;

  select grade into v_grade from public.students where id = v_duel.challenger_id;
  v_problems := public.generate_math_problems(v_grade, v_duel.problem_count);

  update public.student_timed_math_duels set problems = v_problems, status = 'active' where id = p_duel_id;

  return jsonb_build_object('ok', true);
end;
$$;


--
-- Name: admin_adjust_economy(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_adjust_economy(p_user_id uuid, p_xp_delta integer, p_gems_delta integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


--
-- Name: admin_reset_user_password(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reset_user_password(user_id uuid, new_password text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = user_id;
END;
$$;


--
-- Name: assign_hangman_bank_word(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_hangman_bank_word(p_duel_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_row record;
begin
  select id, topic, word, challenger_id, opponent_id into v_duel
  from public.student_hangman_duels where id = p_duel_id;

  if v_duel.id is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() not in (v_duel.challenger_id, v_duel.opponent_id) then
    raise exception 'No autorizado';
  end if;
  if v_duel.word is not null then
    return; -- ya generado, no regenerar (mismo criterio que la función de IA)
  end if;

  select id, word, hint, fact into v_row
  from public.hangman_word_bank
  where category = v_duel.topic
    and word not in (
      select word from public.student_hangman_duels
      where topic = v_duel.topic and word is not null
      order by created_at desc limit 30
    )
  order by random() limit 1;

  if v_row.id is null then
    select id, word, hint, fact into v_row
    from public.hangman_word_bank where category = v_duel.topic
    order by random() limit 1;
  end if;

  if v_row.id is null then
    raise exception 'No hay palabras en el banco para esta categoría';
  end if;

  update public.student_hangman_duels
  set word = v_row.word, hint = v_row.hint, status = 'active'
  where id = p_duel_id and word is null;

  if v_row.fact is not null then
    insert into public.duel_facts (game, duel_id, fact)
    values ('hangman', p_duel_id, v_row.fact)
    on conflict (game, duel_id) do update set fact = excluded.fact;
  end if;
end;
$$;


--
-- Name: buy_companion_egg(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buy_companion_egg(p_species text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_price constant integer := 150;
  v_me record;
begin
  if not public.is_companion_species(p_species) then raise exception 'Mascota inválida'; end if;
  select id, coalesce(gems, 0) as gems, companion_species into v_me
    from public.students where id = auth.uid() for update;
  if v_me.id is null then raise exception 'Solo los estudiantes tienen mascota'; end if;
  if v_me.companion_species is null then raise exception 'Primero elegí tu mascota inicial (es gratis)'; end if;
  if exists (select 1 from public.student_companions where student_id = auth.uid() and species = p_species) then
    raise exception 'Ya tenés esta mascota';
  end if;
  if v_me.gems < v_price then
    raise exception 'Te faltan % gemas para este huevo', v_price - v_me.gems;
  end if;

  perform set_config('quetzal.gem_reason', 'companion_egg', true);
  update public.students set gems = gems - v_price, companion_species = p_species where id = auth.uid();
  perform set_config('quetzal.gem_reason', '', true);
  insert into public.student_companions (student_id, species) values (auth.uid(), p_species);

  return jsonb_build_object('species', p_species, 'gems', v_me.gems - v_price);
end;
$$;


--
-- Name: buy_cosmetic(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buy_cosmetic(p_item text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_item record;
  v_student record;
begin
  select * into v_item from public.cosmetic_items where id = p_item;
  if v_item is null then raise exception 'Ese accesorio no existe'; end if;
  if v_item.pass_only then raise exception 'Este solo se consigue en el Pase de Temporada'; end if;
  if v_item.price = 0 then raise exception 'Este se desbloquea gratis al evolucionar'; end if;

  select id, coalesce(gems, 0) as gems, coalesce(gems_earned_total, 0) as earned
    into v_student from public.students where id = auth.uid() for update;
  if v_student is null then raise exception 'Solo los estudiantes pueden comprar'; end if;

  if public.companion_stage(v_student.earned) < v_item.min_stage then
    raise exception 'Tu mascota todavía no evolucionó lo suficiente';
  end if;
  if exists (select 1 from public.student_cosmetics where student_id = auth.uid() and item_id = p_item) then
    raise exception 'Ya lo tenés';
  end if;
  if v_student.gems < v_item.price then
    raise exception 'No tenés suficientes gemas';
  end if;

  update public.students set gems = gems - v_item.price where id = auth.uid();
  insert into public.student_cosmetics (student_id, item_id) values (auth.uid(), p_item);
  return jsonb_build_object('gems', v_student.gems - v_item.price);
end;
$$;


--
-- Name: buy_shop_item(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buy_shop_item(p_item text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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

  -- Los 3 ítems son cosméticos de alumno (streak_freeze/has_gold_frame/
  -- has_mascot_glasses no existen en teachers) -- ya era así antes de este
  -- cambio, se deja explícito para no tirar un error crudo de columna.
  if v_table <> 'students' then
    raise exception 'La tienda todavía es solo para estudiantes';
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
$_$;


--
-- Name: calculate_rocks_xp(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_rocks_xp(p_teacher_id uuid, p_month integer, p_year integer) RETURNS TABLE(total_rocks integer, completed_rocks integer, total_xp integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(r.id)::INTEGER as total_rocks,
    COUNT(c.id) FILTER (WHERE c.id IS NOT NULL)::INTEGER as completed_rocks,
    COALESCE(SUM(
      CASE 
        -- Se otorga XP si está aprobado o si no requiere evidencia y ya se marcó como completado
        WHEN c.approval_status = 'approved' THEN r.xp_value
        WHEN (c.id IS NOT NULL AND r.requires_evidence = false) THEN r.xp_value
        ELSE 0 
      END
    ), 0)::INTEGER as total_xp
  FROM public.teacher_rocks r
  LEFT JOIN public.teacher_rock_completions c 
    ON r.id = c.rock_id AND c.teacher_id = p_teacher_id
  WHERE 
    r.is_active = true
    AND r.month = p_month
    AND (r.year IS NULL OR r.year = p_year)
    AND (
      r.school_code IS NULL 
      OR r.school_code IN (
          SELECT ta.school_code FROM public.teacher_assignments ta WHERE ta.teacher_id = p_teacher_id
      )
    );
END;
$$;


--
-- Name: can_manage_student(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_manage_student(p_student uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.is_admin() or exists (
    select 1 from public.students s
    join public.teacher_assignments ta
      on ta.school_code = s.school_code and ta.grade = s.grade and ta.section = s.section
    where s.id = p_student and ta.teacher_id = auth.uid()
  );
$$;


--
-- Name: can_see_announcement(text, text, text, text, text[], jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_see_announcement(p_audience text, p_school text, p_grade text, p_section text, p_schools text[], p_groups jsonb, p_sender uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  me record;
  my_schools text[];
begin
  if auth.uid() is null then return false; end if;
  if p_sender = auth.uid() or public.is_admin() then return true; end if;

  -- Coordinador: ve lo que mandan sus docentes asignados (sin importar
  -- a quién iba dirigido) y lo del admin, pero solo si el aviso del
  -- admin es general o toca alguno de SUS establecimientos.
  if exists (select 1 from public.teachers where id = auth.uid() and role = 'coordinador') then
    if public.is_coordinator_of(p_sender) then return true; end if;

    if exists (select 1 from public.teachers where id = p_sender and role = 'admin') then
      if p_school is null and p_schools is null and p_groups is null then return true; end if; -- aviso general

      select array_agg(distinct ta.school_code) into my_schools
        from public.coordinator_assignments ca
        join public.teacher_assignments ta on ta.teacher_id = ca.teacher_id
        where ca.coordinator_id = auth.uid();

      if p_school is not null then return p_school = any(coalesce(my_schools, '{}')); end if;
      if p_schools is not null then return p_schools && coalesce(my_schools, '{}'); end if;
      if p_groups is not null then
        return exists (select 1 from jsonb_array_elements(p_groups) e
          where e->>'school_code' = any(coalesce(my_schools, '{}')));
      end if;
      return false;
    end if;
  end if;

  select school_code, grade, section into me from public.students where id = auth.uid();
  if found then
    if coalesce(p_audience, 'all') not in ('all', 'students') then return false; end if;
    if p_school is not null then
      return me.school_code = p_school and me.grade = p_grade and me.section = p_section;
    end if;
    if p_groups is not null then
      return exists (select 1 from jsonb_array_elements(p_groups) e
        where e->>'school_code' = me.school_code and e->>'grade' = me.grade and e->>'section' = me.section);
    end if;
    if p_schools is not null then return me.school_code = any(p_schools); end if;
    return true;
  end if;

  if exists (select 1 from public.teachers where id = auth.uid()) then
    if coalesce(p_audience, 'all') not in ('all', 'teachers') then return false; end if;
    if p_school is not null then return false; end if; -- avisos de clase: son para los alumnos
    if p_groups is not null then
      return exists (select 1 from jsonb_array_elements(p_groups) e
        join public.teacher_assignments ta on ta.teacher_id = auth.uid()
          and ta.school_code = e->>'school_code' and ta.grade = e->>'grade' and ta.section = e->>'section');
    end if;
    if p_schools is not null then
      return exists (select 1 from public.teacher_assignments ta where ta.teacher_id = auth.uid() and ta.school_code = any(p_schools));
    end if;
    return true;
  end if;

  return false;
end;
$$;


--
-- Name: can_send_announcement(text, text, text, text, text[], jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_send_announcement(p_audience text, p_school text, p_grade text, p_section text, p_schools text[], p_groups jsonb, p_sender uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_sender is distinct from auth.uid() then return false; end if;
  if public.is_admin() then return true; end if;
  if not exists (select 1 from public.teachers where id = auth.uid()) then return false; end if;

  -- Docente: solo estudiantes de sus grupos.
  if p_audience <> 'students' or p_schools is not null then return false; end if;
  if p_school is not null then
    return p_groups is null and exists (select 1 from public.teacher_assignments
      where teacher_id = auth.uid() and school_code = p_school and grade = p_grade and section = p_section);
  end if;
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then return false; end if;
  return not exists (
    select 1 from jsonb_array_elements(p_groups) e
    where not exists (select 1 from public.teacher_assignments ta
      where ta.teacher_id = auth.uid() and ta.school_code = e->>'school_code' and ta.grade = e->>'grade' and ta.section = e->>'section')
  );
end;
$$;


--
-- Name: check_auto_badges(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_auto_badges(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_project_count INTEGER;
  v_max_score NUMERIC;
  v_min_score NUMERIC;
  v_total_votes INTEGER;
  v_badge_id BIGINT;
BEGIN
  -- Contar proyectos
  SELECT COUNT(*) INTO v_project_count
  FROM projects WHERE user_id = p_user_id;

  -- Primera proyecto
  IF v_project_count = 1 THEN
    SELECT id INTO v_badge_id FROM badges WHERE code = 'first_project';
    INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, v_badge_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Triple estrella
  IF v_project_count >= 3 THEN
    SELECT id INTO v_badge_id FROM badges WHERE code = 'triple_star';
    INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, v_badge_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Maratón
  IF v_project_count >= 5 THEN
    SELECT id INTO v_badge_id FROM badges WHERE code = 'marathon';
    INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, v_badge_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Puntuación máxima
  SELECT MAX(e.total_score) INTO v_max_score
  FROM evaluations e
  JOIN projects p ON p.id = e.project_id
  WHERE p.user_id = p_user_id AND e.status = 'final';

  IF v_max_score >= 85 THEN
    SELECT id INTO v_badge_id FROM badges WHERE code = 'excellent_score';
    INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, v_badge_id)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_max_score >= 100 THEN
    SELECT id INTO v_badge_id FROM badges WHERE code = 'perfect_score';
    INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, v_badge_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Popular
  SELECT COALESCE(SUM(votes), 0) INTO v_total_votes
  FROM projects WHERE user_id = p_user_id;

  IF v_total_votes >= 20 THEN
    SELECT id INTO v_badge_id FROM badges WHERE code = 'popular';
    INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, v_badge_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Consistente (todos > 70)
  SELECT MIN(e.total_score) INTO v_min_score
  FROM evaluations e
  JOIN projects p ON p.id = e.project_id
  WHERE p.user_id = p_user_id AND e.status = 'final';

  IF v_min_score >= 70 AND v_project_count >= 3 THEN
    SELECT id INTO v_badge_id FROM badges WHERE code = 'consistent';
    INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, v_badge_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;


--
-- Name: check_hangman_letter(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_hangman_letter(p_duel_id uuid, p_letter text, p_guessed_letters jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_word text;
  v_letter text;
  v_positions integer[];
  v_guessed text[];
  v_letters text[];
  i integer;
  v_solved boolean;
begin
  select * into v_duel from public.student_hangman_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.word is null then
    raise exception 'Este desafío aún no tiene palabra generada';
  end if;

  v_word := lower(v_duel.word);
  v_letter := lower(left(p_letter, 1));
  v_positions := array[]::integer[];

  for i in 1..length(v_word) loop
    if substr(v_word, i, 1) = v_letter then
      v_positions := array_append(v_positions, i - 1);
    end if;
  end loop;

  -- p_guessed_letters ya incluye la letra actual (la manda el cliente en
  -- su lista acumulada) -- se usa para saber si con esta jugada se
  -- completó la palabra.
  select array_agg(distinct c) into v_letters from regexp_split_to_table(v_word, '') c where c != '';
  select array_agg(lower(x)) into v_guessed from jsonb_array_elements_text(p_guessed_letters) x;
  v_guessed := coalesce(v_guessed, array[]::text[]);
  v_solved := (select bool_and(l = any(v_guessed)) from unnest(v_letters) l);

  return jsonb_build_object(
    'correct', array_length(v_positions, 1) > 0,
    'positions', to_jsonb(v_positions),
    'solved', coalesce(v_solved, false)
  );
end;
$$;


--
-- Name: check_lesson_content_url(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_lesson_content_url() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_host text;
  v_allowed text[] := array[
    'vyptkxudkmlpyfosppzh.supabase.co',
    'youtube.com', 'youtu.be',
    'drive.google.com',
    'tinkercad.com'
  ];
  v_ok boolean := false;
  v_h text;
begin
  if new.content_url is null then
    return new;
  end if;

  v_host := lower(substring(new.content_url from '^https?://([^/:]+)'));
  if v_host is null then
    raise exception 'content_url inválido: %', new.content_url;
  end if;

  foreach v_h in array v_allowed loop
    if v_host = v_h or v_host like ('%.' || v_h) then
      v_ok := true;
      exit;
    end if;
  end loop;

  if not v_ok then
    raise exception 'content_url no está en un host permitido (%): %', v_host, new.content_url;
  end if;

  return new;
end;
$$;


--
-- Name: choose_companion(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.choose_companion(p_species text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_current text;
begin
  if not public.is_companion_species(p_species) then raise exception 'Mascota inválida'; end if;
  select companion_species into v_current from public.students where id = auth.uid();
  if not found then raise exception 'Solo los estudiantes tienen mascota'; end if;
  if v_current is not null then raise exception 'Ya elegiste tu primera mascota: las demás se consiguen en la Quetzadex'; end if;

  update public.students set companion_species = p_species where id = auth.uid();
  insert into public.student_companions (student_id, species) values (auth.uid(), p_species) on conflict do nothing;
  return p_species;
end;
$$;


--
-- Name: claim_daily_chest(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_daily_chest() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


--
-- Name: claim_first_profile_photo_reward(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_first_profile_photo_reward(p_photo_url text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


--
-- Name: claim_season_reward(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_season_reward(p_level integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: claim_student_challenge_reward(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_student_challenge_reward(p_challenge_id text, p_comment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: companion_stage(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.companion_stage(p_total integer) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when p_total >= 1600 then 5
    when p_total >= 1000 then 4
    when p_total >= 600 then 3
    when p_total >= 300 then 2
    when p_total >= 100 then 1
    else 0 end;
$$;


--
-- Name: contains_profanity(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.contains_profanity(txt text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select txt ~* '\y(mierda|pendej[oa]|idiota|est[uú]pid[oa]|imb[eé]cil|put[oa]|maric[oó]n|cabr[oó]n|verga|culer[oa]|gilipollas|joder|hijueputa|hijo de puta|malparid[oa]|carajo|zorra|perra|weon|hue[oó]n)\y'
$$;


--
-- Name: current_season_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_season_id() RETURNS text
    LANGUAGE sql STABLE
    AS $$ select to_char(now() at time zone 'America/Guatemala', 'YYYY-MM'); $$;


--
-- Name: current_week_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_week_id() RETURNS text
    LANGUAGE sql STABLE
    AS $$ select to_char(now() at time zone 'America/Guatemala', 'IYYY-"W"IW'); $$;


--
-- Name: decrement_project_votes(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_project_votes(project_id_param bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE projects SET votes = GREATEST(votes - 1, 0) WHERE id = project_id_param;
END;
$$;


--
-- Name: decrement_votes(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_votes(project_id integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE projects SET votes = GREATEST(COALESCE(votes, 0) - 1, 0) WHERE id = project_id;
END;
$$;


--
-- Name: duel_house_reward(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.duel_house_reward(p_student uuid, p_gems integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_day date := (now() at time zone 'America/Guatemala')::date;
  v_n integer;
begin
  insert into public.duel_daily_rewards (student_id, day, rewarded) values (p_student, v_day, 1)
  on conflict (student_id, day) do update set rewarded = public.duel_daily_rewards.rewarded + 1
  returning rewarded into v_n;
  return case when v_n <= 8 then p_gems else 0 end;
end;
$$;


--
-- Name: enforce_no_profanity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_no_profanity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if public.contains_profanity(new.content) then
    raise exception 'CONTENIDO_INAPROPIADO: el texto contiene lenguaje no permitido';
  end if;
  return new;
end;
$$;


--
-- Name: enqueue_class_guardian_message(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_class_guardian_message(p_school_code text, p_grade text, p_section text, p_text text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  g record;
  v_ch text;
  v_push integer := 0;
  v_sms integer := 0;
  v_none integer := 0;
begin
  if not (public.is_admin() or exists (
    select 1 from public.teacher_assignments
    where teacher_id = auth.uid() and school_code = p_school_code and grade = p_grade and section = p_section)) then
    raise exception 'Solo podés avisar a los padres de tus clases';
  end if;

  for g in
    select sg.id from public.student_guardians sg
    join public.students s on s.id = sg.student_id
    where s.school_code = p_school_code and s.grade = p_grade and s.section = p_section
      and coalesce(s.status, 'activo') not in ('baja', 'egresado')
  loop
    v_ch := public.enqueue_guardian_notification(g.id, p_text, null);
    if v_ch = 'push' then v_push := v_push + 1;
    elsif v_ch = 'sms' then v_sms := v_sms + 1;
    else v_none := v_none + 1; end if;
  end loop;

  return jsonb_build_object('push', v_push, 'sms', v_sms, 'none', v_none);
end;
$$;


--
-- Name: enqueue_guardian_notification(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_guardian_notification(p_guardian uuid, p_text text, p_channel text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  g record;
  v_channel text;
  v_today integer;
begin
  select * into g from public.student_guardians where id = p_guardian;
  if g.id is null or not public.can_manage_student(g.student_id) then raise exception 'No autorizado'; end if;
  if char_length(coalesce(btrim(p_text), '')) = 0 or char_length(p_text) > 300 then
    raise exception 'El mensaje tiene que tener entre 1 y 300 caracteres';
  end if;
  if g.consent_status = 'declined' and p_channel is distinct from 'sms' then return null; end if;

  select count(*) into v_today from public.guardian_notifications
    where created_by = auth.uid() and created_at > now() - interval '1 day';
  if v_today >= 600 then raise exception 'Llegaste al tope de 600 avisos por día'; end if;

  v_channel := case
    when p_channel = 'sms' then case when g.phone is not null then 'sms' end
    when p_channel = 'push' then case when exists (select 1 from public.guardian_push_subscriptions where guardian_id = g.id) then 'push' end
    when exists (select 1 from public.guardian_push_subscriptions where guardian_id = g.id) then 'push'
    when g.phone is not null and g.sms_enabled then 'sms'
  end;
  if v_channel is null then return null; end if;

  insert into public.guardian_notifications (guardian_id, student_id, channel, message, created_by)
  values (g.id, g.student_id, v_channel, btrim(p_text), auth.uid());
  return v_channel;
end;
$$;


--
-- Name: equip_cosmetic(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.equip_cosmetic(p_slot text, p_item text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_item record;
  v_earned integer;
  v_equipped jsonb;
begin
  if p_slot not in ('head', 'face', 'back', 'skin') then raise exception 'Slot inválido'; end if;

  select coalesce(gems_earned_total, 0), coalesce(companion_equipped, '{}'::jsonb)
    into v_earned, v_equipped from public.students where id = auth.uid();
  if not found then raise exception 'Solo los estudiantes tienen mascota'; end if;

  if p_item is null then
    v_equipped := v_equipped - p_slot;
  else
    select * into v_item from public.cosmetic_items where id = p_item;
    if v_item is null or v_item.slot <> p_slot then raise exception 'Accesorio inválido'; end if;
    if public.companion_stage(v_earned) < v_item.min_stage then
      raise exception 'Tu mascota todavía no evolucionó lo suficiente';
    end if;
    if (v_item.price > 0 or v_item.pass_only) and not exists (
      select 1 from public.student_cosmetics where student_id = auth.uid() and item_id = p_item
    ) then
      raise exception 'Todavía no lo tenés';
    end if;
    v_equipped := jsonb_set(v_equipped, array[p_slot], to_jsonb(p_item));
  end if;

  update public.students set companion_equipped = v_equipped where id = auth.uid();
  return v_equipped;
end;
$$;


--
-- Name: finish_student_duel(text, uuid, uuid, uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finish_student_duel(p_table text, p_duel_id uuid, p_challenger uuid, p_opponent uuid, p_wager integer, p_winner uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_loser uuid;
  v_loser_gems integer;
  v_amount integer := 0;
  v_streak integer;
begin
  if p_winner is not null then
    v_loser := case when p_winner = p_challenger then p_opponent else p_challenger end;

    if p_wager > 0 then
      select coalesce(gems, 0) into v_loser_gems from public.students where id = v_loser for update;
      v_amount := least(p_wager, greatest(coalesce(v_loser_gems, 0), 0));
    end if;

    update public.students
      set duel_win_streak = duel_win_streak + 1,
          best_duel_win_streak = greatest(best_duel_win_streak, duel_win_streak + 1)
      where id = p_winner
      returning duel_win_streak into v_streak;
    update public.students set duel_win_streak = 0 where id = v_loser;

    -- Ganador: la apuesta del rival + premio de la arena.
    perform set_config('quetzal.gem_reason', 'duel_win', true);
    update public.students
      set gems = coalesce(gems, 0) + v_amount
               + public.duel_house_reward(p_winner, 5 + (case when v_streak >= 3 then 2 else 0 end))
      where id = p_winner;

    -- Perdedor: pierde la apuesta pero suma +1 por jugar.
    perform set_config('quetzal.gem_reason', 'duel_loss', true);
    update public.students
      set gems = greatest(coalesce(gems, 0) - v_amount, 0) + public.duel_house_reward(v_loser, 1)
      where id = v_loser;
  else
    -- Empate: +2 a cada uno.
    perform set_config('quetzal.gem_reason', 'duel_tie', true);
    update public.students set gems = coalesce(gems, 0) + public.duel_house_reward(p_challenger, 2) where id = p_challenger;
    update public.students set gems = coalesce(gems, 0) + public.duel_house_reward(p_opponent, 2) where id = p_opponent;
  end if;
  perform set_config('quetzal.gem_reason', '', true);

  update public.students set xp = coalesce(xp, 0) + 5 where id in (p_challenger, p_opponent);
  if p_winner is not null then
    -- 15 por ganar + 10 extra si viene en racha de 3 o más.
    update public.students set xp = coalesce(xp, 0) + 15 + (case when v_streak >= 3 then 10 else 0 end) where id = p_winner;
  end if;

  execute format(
    'update public.%I set status = ''completed'', winner_id = $1, resolved_at = timezone(''utc'', now()) where id = $2',
    p_table
  ) using p_winner, p_duel_id;
end;
$_$;


--
-- Name: generate_ai_feedback(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_ai_feedback(project_title text, project_description text, scores_json jsonb) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  feedback TEXT;
BEGIN
  -- Aquí integrarías con Edge Function que llame a OpenAI API
  -- Por ahora retorna un placeholder
  feedback := 'Feedback generado por IA basado en criterios de evaluación.';
  RETURN feedback;
END;
$$;


--
-- Name: generate_math_problems(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_math_problems(p_grade text, p_count integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
declare
  v_rank integer;
  v_level text := lower(coalesce(p_grade, ''));
  v_problems jsonb := '[]'::jsonb;
  i integer;
  a integer;
  b integer;
  op text;
  answer numeric;
  question text;
  v_percents integer[] := array[10, 20, 25, 50, 75];
  v_bases integer[] := array[40, 80, 100, 200, 50];
  v_plus text[] := array[
    'Un bus llevaba %s pasajeros y en la siguiente parada subieron %s más. ¿Cuántos pasajeros lleva ahora?',
    'En la tienda escolar vendieron %s panes en la mañana y %s en la tarde. ¿Cuántos panes vendieron en total?',
    'Una cooperativa empacó %s quintales de café el lunes y %s el martes. ¿Cuántos quintales empacó en total?',
    'Un agricultor cosechó %s costales de maíz el lunes y %s costales más el martes. ¿Cuántos costales tiene en total?'
  ];
  v_minus text[] := array[
    'Había %s huevos en la granja y se vendieron %s. ¿Cuántos huevos quedan?',
    'Un camión salía con %s cajas de tomate y entregó %s en el mercado. ¿Cuántas cajas le quedan?',
    'Una tienda tenía %s libras de azúcar y vendió %s. ¿Cuántas libras le quedan?',
    'En un vivero hay %s árboles y ya se trasplantaron %s. ¿Cuántos árboles faltan por trasplantar?'
  ];
  v_mult text[] := array[
    'Un vivero siembra %s hileras con %s plantas cada una. ¿Cuántas plantas hay en total?',
    'Cada canasta tiene %s naranjas. Si hay %s canastas, ¿cuántas naranjas hay en total?',
    'Un salón tiene %s filas de %s pupitres cada una. ¿Cuántos pupitres hay en total?',
    'Una avícola guarda %s huevos en cada cartón. ¿Cuántos huevos hay en %s cartones?'
  ];
  v_div text[] := array[
    'Se repartieron %s libras de frijol en partes iguales entre %s familias. ¿Cuántas libras le tocan a cada una?',
    'Un docente reparte %s lápices en partes iguales entre %s estudiantes. ¿Cuántos lápices le tocan a cada uno?',
    'Una cooperativa envasó %s litros de miel en botellas iguales y llenó %s botellas. ¿Cuántos litros tiene cada botella?',
    'Se juntaron %s quetzales para el paseo escolar entre %s estudiantes en partes iguales. ¿Cuánto puso cada uno?'
  ];
begin
  if v_level like '%primaria%' then
    if v_level like '1ro%' or v_level like '2do%' or v_level like '3ro%' then v_rank := 2; else v_rank := 5; end if;
  elsif v_level like '%básico%' or v_level like '%basico%' then
    v_rank := 8;
  elsif v_level like '%diversificado%' then
    v_rank := 11;
  else
    v_rank := 5;
  end if;

  for i in 1..p_count loop
    if v_rank <= 3 then
      -- 1ro-3ro primaria: suma/resta hasta 20, sin negativos.
      a := floor(random() * 20)::integer + 1;
      b := floor(random() * 20)::integer + 1;
      if random() < 0.5 then
        op := '+'; answer := a + b;
      else
        if a < b then a := a + b; b := a - b; a := a - b; end if;
        op := '-'; answer := a - b;
      end if;

    elsif v_rank <= 6 then
      -- 4to-6to primaria: suma/resta hasta 100, multiplicación tabla 1-10.
      case floor(random() * 3)::integer
        when 0 then
          a := floor(random() * 100)::integer + 1; b := floor(random() * 100)::integer + 1;
          op := '+'; answer := a + b;
        when 1 then
          a := floor(random() * 100)::integer + 1; b := floor(random() * 100)::integer + 1;
          if a < b then a := a + b; b := a - b; a := a - b; end if;
          op := '-'; answer := a - b;
        else
          a := floor(random() * 10)::integer + 1; b := floor(random() * 10)::integer + 1;
          op := '×'; answer := a * b;
      end case;

    elsif v_rank <= 9 then
      -- Básico: multiplicación/división exacta/potencias simples.
      case floor(random() * 3)::integer
        when 0 then
          a := floor(random() * 20)::integer + 2; b := floor(random() * 20)::integer + 2;
          op := '×'; answer := a * b;
        when 1 then
          b := floor(random() * 10)::integer + 2; answer := floor(random() * 15)::integer + 1; a := b * answer::integer;
          op := '÷';
        else
          a := floor(random() * 10)::integer + 2; b := floor(random() * 3)::integer + 2;
          op := '^'; answer := a ^ b;
      end case;

    else
      -- Diversificado: ecuación de un paso o porcentaje.
      if random() < 0.5 then
        a := floor(random() * 15)::integer + 1; answer := floor(random() * 15)::integer + 1; b := a + answer::integer;
        op := 'x+';
      else
        a := v_percents[floor(random() * array_length(v_percents, 1))::integer + 1];
        b := v_bases[floor(random() * array_length(v_bases, 1))::integer + 1];
        answer := round(a * b / 100.0);
        op := '%';
      end if;
    end if;

    question := case
      when v_rank > 3 and op = '+' then format(v_plus[floor(random() * array_length(v_plus, 1))::integer + 1], a, b)
      when v_rank > 3 and op = '-' then format(v_minus[floor(random() * array_length(v_minus, 1))::integer + 1], a, b)
      when v_rank > 3 and op = '×' then format(v_mult[floor(random() * array_length(v_mult, 1))::integer + 1], a, b)
      when v_rank > 3 and op = '÷' then format(v_div[floor(random() * array_length(v_div, 1))::integer + 1], a, b)
      when op = '+' then a || ' + ' || b
      when op = '-' then a || ' - ' || b
      when op = '×' then a || ' × ' || b
      when op = '÷' then a || ' ÷ ' || b
      when op = '^' then a || '^' || b
      when op = 'x+' then 'x + ' || a || ' = ' || b || '  (¿cuánto vale x?)'
      when op = '%' then '¿Cuánto es el ' || a || '% de ' || b || '?'
    end;

    v_problems := v_problems || jsonb_build_object('question', question, 'answer', answer);
  end loop;

  return v_problems;
end;
$$;


--
-- Name: get_class_duel_report(text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_class_duel_report(p_school text, p_grade text, p_section text, p_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v_result jsonb;
begin
  if not exists (
    select 1 from public.teacher_assignments
    where teacher_id = auth.uid() and school_code = p_school and grade = p_grade and section = p_section
  ) and not exists (select 1 from public.teachers where id = auth.uid() and role = 'admin') then
    raise exception 'No sos docente de esa clase';
  end if;

  with class_students as (
    select id, full_name from public.students
    where school_code = p_school and grade = p_grade and section = p_section
  ),
  plays as (
    select 'quiz'::text as game, d.topic, a.student_id,
           least(1, a.score::numeric / nullif(d.question_count, 0)) as ok
      from public.student_duel_answers a join public.student_duels d on d.id = a.duel_id
      where a.student_id in (select id from class_students) and d.created_at > v_since
    union all
    select 'hangman', d.topic, r.student_id, case when r.solved then 1 else 0 end
      from public.student_hangman_results r join public.student_hangman_duels d on d.id = r.duel_id
      where r.student_id in (select id from class_students) and d.created_at > v_since
    union all
    select 'spelling', d.topic, r.student_id, case when r.correct then 1 else 0 end
      from public.student_spelling_results r join public.student_spelling_duels d on d.id = r.duel_id
      where r.student_id in (select id from class_students) and d.created_at > v_since
    union all
    select 'debug', d.topic, r.student_id, case when r.correct then 1 else 0 end
      from public.student_debug_results r join public.student_debug_duels d on d.id = r.duel_id
      where r.student_id in (select id from class_students) and d.created_at > v_since
    union all
    select 'timed_math', 'Cálculo mental', r.student_id, least(1, r.score::numeric / nullif(d.problem_count, 0))
      from public.student_timed_math_results r join public.student_timed_math_duels d on d.id = r.duel_id
      where r.student_id in (select id from class_students) and d.created_at > v_since
  ),
  by_topic as (
    select game, topic, count(*) as plays, count(distinct student_id) as students,
           round(avg(coalesce(ok, 0)) * 100) as pct
    from plays group by game, topic
  ),
  by_student as (
    select p.student_id, s.full_name, count(*) as plays, round(avg(coalesce(p.ok, 0)) * 100) as pct
    from plays p join class_students s on s.id = p.student_id
    group by p.student_id, s.full_name
  )
  select jsonb_build_object(
    'total_plays', (select count(*) from plays),
    'active_students', (select count(distinct student_id) from plays),
    'class_size', (select count(*) from class_students),
    'topics', coalesce((select jsonb_agg(t order by t.pct asc, t.plays desc) from by_topic t), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(st order by st.pct asc, st.plays desc) from by_student st), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;


--
-- Name: get_class_login_mode(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_class_login_mode(p_school_code text, p_grade text, p_section text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select requires_password from public.class_passwords
     where school_code = p_school_code and grade = p_grade and section = p_section),
    true
  );
$$;


--
-- Name: get_duel_fact(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_duel_fact(p_game text, p_duel_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_played boolean;
begin
  v_played := case p_game
    when 'quiz' then exists (select 1 from public.student_duel_answers where duel_id = p_duel_id and student_id = auth.uid())
    when 'hangman' then exists (select 1 from public.student_hangman_results where duel_id = p_duel_id and student_id = auth.uid())
    when 'spelling' then exists (select 1 from public.student_spelling_results where duel_id = p_duel_id and student_id = auth.uid())
    when 'debug' then exists (select 1 from public.student_debug_results where duel_id = p_duel_id and student_id = auth.uid())
    else false
  end;
  if not v_played then return null; end if;
  return (select fact from public.duel_facts where game = p_game and duel_id = p_duel_id);
end;
$$;


--
-- Name: get_duel_questions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_duel_questions(p_duel_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_result jsonb;
begin
  select * into v_duel from public.student_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Duelo no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.questions is null then
    return '[]'::jsonb;
  end if;

  select jsonb_agg(jsonb_build_object('question', q->>'question', 'options', q->'options'))
    into v_result
    from jsonb_array_elements(v_duel.questions) q;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;


--
-- Name: get_duel_review(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_duel_review(p_duel_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
begin
  select * into v_duel from public.student_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Duelo no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.status != 'completed' then
    raise exception 'Este duelo todavía no terminó';
  end if;

  return coalesce(v_duel.questions, '[]'::jsonb);
end;
$$;


--
-- Name: get_event_questions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_event_questions(p_event_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_event record;
  v_result jsonb;
begin
  select * into v_event from public.random_events where id = p_event_id;
  if v_event is null then
    raise exception 'Evento no encontrado';
  end if;
  if v_event.status != 'active' then
    raise exception 'Este evento no está activo';
  end if;
  if not exists (select 1 from public.event_participants where event_id = p_event_id and user_id = auth.uid()) then
    raise exception 'No te uniste a este evento';
  end if;
  if v_event.questions is null then
    return '[]'::jsonb;
  end if;

  select jsonb_agg(jsonb_build_object('question', q->>'question', 'options', q->'options'))
    into v_result
    from jsonb_array_elements(v_event.questions) q;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;


--
-- Name: get_impact_metrics(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_impact_metrics(p_from date, p_to date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Solo administración'; end if;

  with st as (
    select id, school_code from public.students
    where coalesce(status, 'active') <> 'baja' and school_code is not null
      and not public.is_test_school_code(school_code)
  ),
  enrolled as (select school_code, count(*) as n from st group by school_code),
  active as (
    select st.school_code, count(distinct a.user_id) as n, coalesce(sum(a.total_seconds), 0) as secs
    from public.active_time_tracking a join st on st.id = a.user_id
    where a.activity_date between p_from and p_to
    group by st.school_code
  ),
  lessons as (
    select st.school_code, count(*) as n, count(distinct lc.student_id) as students
    from public.lesson_completions lc join st on st.id = lc.student_id
    where lc.completed_at::date between p_from and p_to
    group by st.school_code
  ),
  duels as (
    select st.school_code, count(*) as n from (
      select challenger_id, resolved_at from public.student_duels where status = 'completed'
      union all select challenger_id, resolved_at from public.student_hangman_duels where status = 'completed'
      union all select challenger_id, resolved_at from public.student_timed_math_duels where status = 'completed'
      union all select challenger_id, resolved_at from public.student_debug_duels where status = 'completed'
      union all select challenger_id, resolved_at from public.student_spelling_duels where status = 'completed'
    ) d join st on st.id = d.challenger_id
    where d.resolved_at::date between p_from and p_to
    group by st.school_code
  ),
  att as (
    select st.school_code,
           count(*) as records,
           count(*) filter (where at.status in ('present', 'late')) as present
    from public.attendance at join st on st.id = at.student_id
    where at.date between p_from and p_to
    group by st.school_code
  ),
  fam as (
    select st.school_code, count(distinct g.student_id) as n
    from public.student_guardians g join st on st.id = g.student_id
    group by st.school_code
  )
  select coalesce(jsonb_agg(row_to_json(r) order by r.school_name), '[]'::jsonb) into v_result
  from (
    select e.school_code,
           coalesce(sc.name, e.school_code) as school_name,
           e.n as enrolled,
           coalesce(a.n, 0) as active_students,
           round(coalesce(a.secs, 0) / 60.0 / nullif(a.n, 0), 1) as minutes_per_active,
           coalesce(l.n, 0) as lessons_completed,
           coalesce(l.students, 0) as students_completing,
           coalesce(d.n, 0) as duels_played,
           case when coalesce(att.records, 0) > 0 then round(100.0 * att.present / att.records, 1) end as attendance_pct,
           coalesce(f.n, 0) as students_with_family
    from enrolled e
    left join public.schools sc on sc.code = e.school_code
    left join active a on a.school_code = e.school_code
    left join lessons l on l.school_code = e.school_code
    left join duels d on d.school_code = e.school_code
    left join att on att.school_code = e.school_code
    left join fam f on f.school_code = e.school_code
  ) r;

  return v_result;
end;
$$;


--
-- Name: get_impact_trend(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_impact_trend(p_months integer DEFAULT 6) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Solo administración'; end if;

  select coalesce(jsonb_agg(row_to_json(r) order by r.month), '[]'::jsonb) into v_result
  from (
    select to_char(m.month, 'YYYY-MM') as month,
           (select count(distinct a.user_id) from public.active_time_tracking a
             join public.students s on s.id = a.user_id
             where date_trunc('month', a.activity_date) = m.month
               and not public.is_test_school_code(s.school_code)) as active_students,
           (select count(*) from public.lesson_completions lc
             join public.students s on s.id = lc.student_id
             where date_trunc('month', lc.completed_at) = m.month
               and not public.is_test_school_code(s.school_code)) as lessons_completed
    from generate_series(
      date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1),
      date_trunc('month', now()),
      interval '1 month'
    ) as m(month)
  ) r;

  return v_result;
end;
$$;


--
-- Name: get_my_duel_rewards_left(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_duel_rewards_left() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select greatest(8 - coalesce((
    select rewarded from public.duel_daily_rewards
    where student_id = auth.uid() and day = (now() at time zone 'America/Guatemala')::date
  ), 0), 0);
$$;


--
-- Name: get_my_league(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_league() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_week text := public.current_week_id();
  v_me record;
  v_res record;
  v_result text;
  v_ends timestamp;
  v_board jsonb;
  v_size integer;
  v_my_xp integer;
begin
  select id, school_code, league_tier, league_week, league_last_result into v_me
    from public.students where id = auth.uid();
  if v_me is null then raise exception 'Solo los estudiantes tienen liga'; end if;

  if v_me.league_week is distinct from v_week then
    select * into v_res from public.league_resolution(v_me.id, v_me.league_week, v_me.league_tier);
    update public.students
      set league_tier = v_res.new_tier,
          league_last_result = case when v_me.league_week is null then null else v_res.result end,
          league_week = v_week
      where id = v_me.id;
    select id, school_code, league_tier, league_week, league_last_result into v_me
      from public.students where id = auth.uid();
  end if;

  v_result := v_me.league_last_result;
  if v_result is not null then
    update public.students set league_last_result = null where id = v_me.id;
  end if;

  select coalesce(xp, 0) into v_my_xp from public.league_weekly_points where student_id = v_me.id and week_id = v_week;

  select count(*) into v_size from public.league_weekly_points
    where week_id = v_week and school_code is not distinct from v_me.school_code and tier = v_me.league_tier;

  select coalesce(jsonb_agg(row_to_json(b) order by b.xp desc, b.full_name), '[]'::jsonb) into v_board from (
    select s.id, s.full_name, s.profile_photo_url, s.companion_species, s.gems_earned_total, s.companion_equipped,
           s.duel_win_streak, p.xp
    from public.league_weekly_points p
    join public.students s on s.id = p.student_id
    where p.week_id = v_week and p.school_code is not distinct from v_me.school_code and p.tier = v_me.league_tier
    order by p.xp desc
    limit 50
  ) b;

  v_ends := date_trunc('week', now() at time zone 'America/Guatemala') + interval '7 days';

  return jsonb_build_object(
    'tier', v_me.league_tier,
    'week_id', v_week,
    'ends_at', to_char(v_ends, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'result', v_result,
    'my_xp', coalesce(v_my_xp, 0),
    'group_size', v_size,
    'board', v_board
  );
end;
$$;


--
-- Name: get_my_played_duel_ids(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_played_duel_ids(p_ids uuid[]) RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(array_agg(distinct duel_id), '{}'::uuid[]) from (
    select duel_id from public.student_duel_answers where student_id = auth.uid() and duel_id = any(p_ids)
    union all
    select duel_id from public.student_hangman_results where student_id = auth.uid() and duel_id = any(p_ids)
    union all
    select duel_id from public.student_timed_math_results where student_id = auth.uid() and duel_id = any(p_ids)
    union all
    select duel_id from public.student_debug_results where student_id = auth.uid() and duel_id = any(p_ids)
    union all
    select duel_id from public.student_spelling_results where student_id = auth.uid() and duel_id = any(p_ids)
  ) played;
$$;


--
-- Name: get_my_rivalries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_rivalries() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with all_duels as (
    select challenger_id, opponent_id, winner_id from public.student_duels
      where status = 'completed' and auth.uid() in (challenger_id, opponent_id)
    union all
    select challenger_id, opponent_id, winner_id from public.student_hangman_duels
      where status = 'completed' and auth.uid() in (challenger_id, opponent_id)
    union all
    select challenger_id, opponent_id, winner_id from public.student_timed_math_duels
      where status = 'completed' and auth.uid() in (challenger_id, opponent_id)
    union all
    select challenger_id, opponent_id, winner_id from public.student_debug_duels
      where status = 'completed' and auth.uid() in (challenger_id, opponent_id)
    union all
    select challenger_id, opponent_id, winner_id from public.student_spelling_duels
      where status = 'completed' and auth.uid() in (challenger_id, opponent_id)
  )
  select coalesce(jsonb_object_agg(rival, jsonb_build_object('w', w, 'l', l, 't', t)), '{}'::jsonb)
  from (
    select case when challenger_id = auth.uid() then opponent_id else challenger_id end as rival,
      count(*) filter (where winner_id = auth.uid()) as w,
      count(*) filter (where winner_id is not null and winner_id <> auth.uid()) as l,
      count(*) filter (where winner_id is null) as t
    from all_duels
    group by 1
  ) x;
$$;


--
-- Name: get_practice_questions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_practice_questions(p_session_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_session record;
  v_result jsonb;
begin
  select * into v_session from public.student_practice_sessions where id = p_session_id;
  if v_session is null then
    raise exception 'Sesión no encontrada';
  end if;
  if auth.uid() != v_session.student_id then
    raise exception 'No autorizado';
  end if;
  if v_session.questions is null then
    return '[]'::jsonb;
  end if;

  select jsonb_agg(jsonb_build_object('question', q->>'question', 'options', q->'options'))
    into v_result
    from jsonb_array_elements(v_session.questions) q;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;


--
-- Name: get_projects_with_visibility(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_projects_with_visibility(user_id_param uuid, user_role_param text) RETURNS TABLE(project_id integer, title text, description text, video_url text, score integer, votes integer, created_at timestamp without time zone, student_name text, school_name text, grade text, section text, group_name text, can_view boolean, can_edit boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.title,
    p.description,
    p.video_url,
    p.score,
    p.votes,
    p.created_at,
    s.full_name,
    sc.name,
    s.grade,
    s.section,
    g.name,
    -- Puede ver: todos pueden ver proyectos públicos
    TRUE as can_view,
    -- Puede editar: solo el creador o miembros del grupo
    CASE 
      WHEN p.user_id = user_id_param THEN TRUE
      WHEN EXISTS (
        SELECT 1 FROM group_members gm 
        WHERE gm.group_id = p.group_id 
        AND gm.student_id = user_id_param
      ) THEN TRUE
      ELSE FALSE
    END as can_edit
  FROM projects p
  LEFT JOIN students s ON p.user_id = s.id
  LEFT JOIN schools sc ON s.school_code = sc.code
  LEFT JOIN groups g ON p.group_id = g.id
  ORDER BY p.created_at DESC;
END;
$$;


--
-- Name: get_season_pass(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_season_pass() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_season text := public.current_season_id();
  v_xp integer;
  v_sid text;
  v_claimed jsonb;
  v_ends timestamp;
begin
  select season_id, coalesce(season_xp, 0) into v_sid, v_xp from public.students where id = auth.uid();
  if not found then raise exception 'Solo los estudiantes tienen Pase de Temporada'; end if;
  if coalesce(v_sid, '') <> v_season then v_xp := 0; end if;

  select coalesce(jsonb_agg(level order by level), '[]'::jsonb) into v_claimed
    from public.season_claims where student_id = auth.uid() and season_id = v_season;

  v_ends := date_trunc('month', now() at time zone 'America/Guatemala') + interval '1 month';

  return jsonb_build_object(
    'season_id', v_season,
    'xp', v_xp,
    'xp_per_level', 50,
    'max_level', 30,
    'level', least(30, v_xp / 50),
    'claimed', v_claimed,
    'ends_at', to_char(v_ends, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'rewards', (select jsonb_agg(public.season_reward_json(l) || jsonb_build_object('level', l) order by l) from generate_series(1, 30) l)
  );
end;
$$;


--
-- Name: get_teacher_rocks(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_teacher_rocks(p_teacher_id uuid, p_month integer, p_year integer) RETURNS TABLE(rock_id uuid, rock_name text, rock_description text, xp_value integer, deadline_day integer, is_completed boolean, completed_at timestamp without time zone, approval_status text, requires_evidence boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id as rock_id,
    r.name as rock_name,
    r.description as rock_description,
    r.xp_value,
    r.deadline_day,
    (c.id IS NOT NULL) as is_completed,
    c.completed_at::TIMESTAMP,
    COALESCE(c.approval_status, 'none') as approval_status,
    r.requires_evidence
  FROM public.teacher_rocks r
  LEFT JOIN public.teacher_rock_completions c 
    ON r.id = c.rock_id AND c.teacher_id = p_teacher_id
  WHERE 
    r.is_active = true
    AND r.month = p_month
    AND (r.year IS NULL OR r.year = p_year)
    AND (
      r.school_code IS NULL 
      OR r.school_code IN (
          SELECT ta.school_code FROM public.teacher_assignments ta WHERE ta.teacher_id = p_teacher_id
      )
    )
  ORDER BY r.deadline_day ASC NULLS LAST;
END;
$$;


--
-- Name: get_tournament_match_questions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tournament_match_questions(p_match_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_match record;
  v_result jsonb;
  v_is_captain boolean;
begin
  select * into v_match from public.tournament_matches where id = p_match_id;
  if v_match is null then raise exception 'Partido no encontrado'; end if;
  if v_match.status != 'active' then raise exception 'Este partido no está activo'; end if;

  select exists (
    select 1 from public.tournament_teams t
    where t.id in (v_match.team_a_id, v_match.team_b_id) and t.captain_id = auth.uid()
  ) into v_is_captain;
  if not v_is_captain then raise exception 'No autorizado'; end if;
  if v_match.questions is null then return '[]'::jsonb; end if;

  select jsonb_agg(jsonb_build_object('question', q->>'question', 'options', q->'options'))
    into v_result from jsonb_array_elements(v_match.questions) q;
  return coalesce(v_result, '[]'::jsonb);
end;
$$;


--
-- Name: get_tournament_match_review(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tournament_match_review(p_match_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_match record;
  v_is_captain boolean;
begin
  select * into v_match from public.tournament_matches where id = p_match_id;
  if v_match is null then raise exception 'Partido no encontrado'; end if;
  if v_match.status != 'completed' then raise exception 'Este partido todavía no terminó'; end if;

  select exists (
    select 1 from public.tournament_teams t
    where t.id in (v_match.team_a_id, v_match.team_b_id) and t.captain_id = auth.uid()
  ) into v_is_captain;
  if not v_is_captain then raise exception 'No autorizado'; end if;

  return coalesce(v_match.questions, '[]'::jsonb);
end;
$$;


--
-- Name: get_week_start(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_week_start(input_date date) RETURNS date
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  RETURN input_date - (EXTRACT(DOW FROM input_date)::INTEGER);
END;
$$;


--
-- Name: get_weekly_topic(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_weekly_topic() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select t.topic from public.class_weekly_topics t
  join public.students s on s.school_code = t.school_code and s.grade = t.grade and s.section = t.section
  where s.id = auth.uid() and t.week_id = public.current_week_id();
$$;


--
-- Name: guard_guardian_consent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_guardian_consent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.consent_status := null; new.consent_version := null; new.consent_at := null;
    elsif new.consent_status is distinct from old.consent_status
       or new.consent_version is distinct from old.consent_version
       or new.consent_at is distinct from old.consent_at then
      raise exception 'El consentimiento solo lo registra el padre desde su portal';
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: guard_student_duel_write(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_student_duel_write() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, created_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'estudiante'),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN new;
END;
$$;


--
-- Name: increment_project_votes(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_project_votes(project_id_param bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE projects SET votes = votes + 1 WHERE id = project_id_param;
END;
$$;


--
-- Name: increment_votes(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_votes(project_id integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE projects SET votes = COALESCE(votes, 0) + 1 WHERE id = project_id;
END;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.teachers
    where teachers.id = auth.uid() and teachers.role = 'admin'
  );
$$;


--
-- Name: is_assigned_teacher_for_project(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_assigned_teacher_for_project(p_project_id integer) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.projects p
    join public.students s on s.id = p.user_id
    join public.teacher_assignments ta
      on ta.school_code = s.school_code
     and ta.grade = s.grade
     and ta.section = s.section
    where p.id = p_project_id
      and ta.teacher_id = auth.uid()
  );
$$;


--
-- Name: is_companion_species(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_companion_species(p text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select p in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati', 'guacamaya', 'danta', 'pizote', 'armadillo');
$$;


--
-- Name: is_coordinator_of(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_coordinator_of(p_teacher_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.coordinator_assignments ca
    join public.teachers c on c.id = ca.coordinator_id and c.role = 'coordinador'
    where ca.coordinator_id = auth.uid() and ca.teacher_id = p_teacher_id
  );
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.teachers
    where teachers.id = auth.uid() and teachers.role in ('admin','docente')
  );
$$;


--
-- Name: is_test_school_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_test_school_code(p_code text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(p_code ilike 'DEMO-%', false)
      or exists (select 1 from public.schools s
                  where s.code = p_code and s.name ~* '(1bot|demostraci[oó]n)');
$$;


--
-- Name: league_resolution(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.league_resolution(p_student uuid, p_week text, p_tier integer, OUT new_tier integer, OUT result text) RETURNS record
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_row record;
  v_rank integer;
  v_size integer;
begin
  new_tier := p_tier;
  result := 'stay';
  if p_week is null then return; end if;

  select * into v_row from public.league_weekly_points where student_id = p_student and week_id = p_week;
  if v_row is null then return; end if;

  select count(*) into v_size from public.league_weekly_points
    where week_id = p_week and school_code is not distinct from v_row.school_code and tier = v_row.tier;
  select count(*) + 1 into v_rank from public.league_weekly_points
    where week_id = p_week and school_code is not distinct from v_row.school_code and tier = v_row.tier and xp > v_row.xp;

  if v_rank <= 3 and v_size >= 3 and v_row.tier < 4 then
    new_tier := v_row.tier + 1; result := 'up';
  elsif v_row.tier > 0 and v_size >= 6 and v_rank > v_size - 3 then
    new_tier := v_row.tier - 1; result := 'down';
  else
    new_tier := v_row.tier;
  end if;
end;
$$;


--
-- Name: log_gem_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_gem_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.student_gem_events (student_id, amount, reason, balance)
  values (new.id, coalesce(new.gems, 0) - coalesce(old.gems, 0),
          nullif(current_setting('quetzal.gem_reason', true), ''), new.gems);
  return null;
end;
$$;


--
-- Name: notify_comment_like(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_comment_like() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  c_author uuid;
  c_lesson uuid;
begin
  select author_id, lesson_id into c_author, c_lesson from public.resource_comments where id = new.comment_id;
  if c_author is not null and c_author <> new.user_id then
    insert into public.comment_notifications (user_id, actor_id, comment_id, lesson_id, type)
    values (c_author, new.user_id, new.comment_id, c_lesson, 'like');
  end if;
  return new;
end;
$$;


--
-- Name: notify_comment_reply(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_comment_reply() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  parent_author uuid;
begin
  if new.parent_id is not null then
    select author_id into parent_author from public.resource_comments where id = new.parent_id;
    if parent_author is not null and parent_author <> new.author_id then
      insert into public.comment_notifications (user_id, actor_id, actor_name, comment_id, lesson_id, type, content_preview)
      values (parent_author, new.author_id, new.author_name, new.parent_id, new.lesson_id, 'reply', left(new.content, 80));
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: protect_student_privileged_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_student_privileged_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if public.is_staff() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.role := old.role;
    new.school_code := old.school_code;
    new.grade := old.grade;
    new.section := old.section;
    new.username := old.username;
    new.cui := old.cui;
  end if;

  return new;
end;
$$;


--
-- Name: protect_teacher_privileged_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_teacher_privileged_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'docente';
    new.base_salary := 0;
    new.bonus_admin_max := 0;
    new.bonus_prod_max := 0;
    new.bonus_coordinator_max := 0;
    new.is_coordinator := false;
    new.is_1bot_team := false;
    new.certification_points := 0;
    new.rank_title := coalesce(new.rank_title, 'Tutor Junior');
  else
    new.role := old.role;
    new.base_salary := old.base_salary;
    new.bonus_admin_max := old.bonus_admin_max;
    new.bonus_prod_max := old.bonus_prod_max;
    new.bonus_coordinator_max := old.bonus_coordinator_max;
    new.is_coordinator := old.is_coordinator;
    new.is_1bot_team := old.is_1bot_team;
    new.certification_points := old.certification_points;
    new.rank_title := old.rank_title;
  end if;

  return new;
end;
$$;


--
-- Name: record_active_heartbeat(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_active_heartbeat() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_school text;
  v_today date := (now() at time zone 'America/Guatemala')::date;
  v_last timestamptz;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if exists (select 1 from public.students where id = v_uid) then
    v_role := 'estudiante';
    select school_code into v_school from public.students where id = v_uid;
  elsif exists (select 1 from public.teachers where id = v_uid) then
    select case when role in ('admin', 'coordinador') then role else 'docente' end into v_role
      from public.teachers where id = v_uid;
    if v_role = 'docente' then
      select school_code into v_school from public.teacher_assignments where teacher_id = v_uid limit 1;
    end if;
  else
    return;
  end if;

  v_school := coalesce(v_school, 'GENERAL');

  select last_heartbeat into v_last from public.active_time_tracking
    where user_id = v_uid and school_code = v_school and activity_date = v_today;

  if v_last is not null and v_last > now() - interval '25 seconds' then
    return;
  end if;

  insert into public.active_time_tracking (user_id, school_code, role, activity_date, total_seconds, last_heartbeat)
    values (v_uid, v_school, v_role, v_today, 30, now())
  on conflict (user_id, school_code, activity_date)
    do update set total_seconds = public.active_time_tracking.total_seconds + 30, last_heartbeat = now();
end;
$$;


--
-- Name: record_guardian_paper_consent(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_guardian_paper_consent(p_guardian uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_student uuid;
begin
  select student_id into v_student from public.student_guardians where id = p_guardian;
  if v_student is null then raise exception 'Ese padre/encargado no existe'; end if;
  if not public.can_manage_student(v_student) then raise exception 'No autorizado'; end if;

  update public.student_guardians set
    consent_status = 'accepted',
    consent_version = 1,
    consent_at = now(),
    consent_method = 'paper',
    consent_recorded_by = auth.uid()
  where id = p_guardian;
end;
$$;


--
-- Name: register_push_subscription(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Suscripción inválida';
  end if;

  if exists (select 1 from public.students where id = v_uid) then
    v_role := 'estudiante';
  else
    select case when role in ('admin', 'coordinador') then role else 'docente' end into v_role
      from public.teachers where id = v_uid;
  end if;
  if v_role is null then
    raise exception 'Usuario no encontrado';
  end if;

  insert into public.push_subscriptions (user_id, role, endpoint, p256dh, auth)
    values (v_uid, v_role, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint)
    do update set user_id = excluded.user_id, role = excluded.role, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;


--
-- Name: register_school_node(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_school_node(p_school text, p_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_token text;
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo un admin puede registrar nodos'; end if;
  if not exists (select 1 from public.schools where code = p_school) then raise exception 'Establecimiento no encontrado'; end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.school_nodes (school_code, name, token_hash, created_by)
    values (p_school, left(coalesce(nullif(trim(p_name), ''), 'Nodo'), 80), encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid())
    returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;


--
-- Name: reset_password_via_admin(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_password_via_admin(target_email text, new_password text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  requester_role text;
BEGIN
  SELECT role INTO requester_role FROM public.profiles WHERE id = auth.uid();
  
  IF requester_role NOT IN ('admin', 'docente') THEN
    RAISE EXCEPTION 'Solo docentes pueden cambiar claves.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE email = target_email;

  RETURN 'OK';
END;
$$;


--
-- Name: resolve_login_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_login_email(p_username text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Los docentes/admin siempre inician sesión con su email real; solo
  -- los alumnos tienen `username` (los emails que se les genera son
  -- ficticios, @estudiante.edu.gt, no reciben correo real).
  select email from public.students where username = p_username limit 1;
$$;


--
-- Name: resolve_login_mode_by_username(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_login_mode_by_username(p_username text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (
      select cp.requires_password
      from public.students s
      join public.class_passwords cp
        on cp.school_code = s.school_code and cp.grade = s.grade and cp.section = s.section
      where lower(s.username) = lower(p_username)
    ),
    true
  );
$$;


--
-- Name: revoke_school_node(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_school_node(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_admin() then raise exception 'Solo un admin puede revocar nodos'; end if;
  update public.school_nodes set revoked_at = timezone('utc', now()) where id = p_id and revoked_at is null;
end;
$$;


--
-- Name: schedule_tonight_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.schedule_tonight_event() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_topics text[] := array[
    'Robótica educativa', 'Programación por bloques', 'Ciencias de la computación',
    'Electrónica básica', 'Inteligencia artificial', 'Matemática aplicada',
    'Historia de Guatemala', 'Geografía de Guatemala', 'Cultura maya',
    'Tradiciones de Guatemala', 'Biodiversidad de Guatemala',
    'Cultura general internacional', 'Historia mundial', 'Ciencia y descubrimientos'
  ];
  v_scheduled timestamptz;
begin
  -- ~45% de probabilidad de que haya evento esta noche.
  if random() > 0.45 then
    return;
  end if;

  -- Hora al azar entre 19:00 y 21:00 hora Guatemala.
  v_scheduled := (current_date::timestamp + time '19:00' + (floor(random() * 120) || ' minutes')::interval)
                 at time zone 'America/Guatemala';

  insert into public.random_events (scheduled_for, duration_minutes, topic, question_count, gem_pool, status)
  values (
    v_scheduled,
    15,
    v_topics[1 + floor(random() * array_length(v_topics, 1))::int],
    8,
    60 + floor(random() * 91)::int, -- 60-150 gemas
    'scheduled'
  );
end;
$$;


--
-- Name: season_reward_json(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.season_reward_json(p_level integer) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    AS $$
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


--
-- Name: set_active_companion(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_active_companion(p_species text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from public.student_companions where student_id = auth.uid() and species = p_species) then
    raise exception 'Todavía no tenés esa mascota';
  end if;
  update public.students set companion_species = p_species where id = auth.uid();
  return p_species;
end;
$$;


--
-- Name: set_school_public_projects(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_school_public_projects(p_school_code text, p_public boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not (
    public.is_admin()
    or exists (
      select 1 from public.coordinator_assignments ca
      join public.teacher_assignments ta on ta.teacher_id = ca.teacher_id
      where ca.coordinator_id = auth.uid() and ta.school_code = p_school_code
    )
  ) then
    raise exception 'No tenés permiso sobre ese establecimiento';
  end if;

  update public.schools set public_projects = p_public where code = p_school_code;
end;
$$;


--
-- Name: set_weekly_topic(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_weekly_topic(p_school text, p_grade text, p_section text, p_topic text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_topic text := nullif(trim(coalesce(p_topic, '')), '');
begin
  if not exists (
    select 1 from public.teacher_assignments
    where teacher_id = auth.uid() and school_code = p_school and grade = p_grade and section = p_section
  ) and not exists (select 1 from public.teachers where id = auth.uid() and role = 'admin') then
    raise exception 'No sos docente de esa clase';
  end if;

  if v_topic is null then
    delete from public.class_weekly_topics
      where school_code = p_school and grade = p_grade and section = p_section and week_id = public.current_week_id();
    return;
  end if;

  insert into public.class_weekly_topics (school_code, grade, section, week_id, topic, set_by)
    values (p_school, p_grade, p_section, public.current_week_id(), left(v_topic, 180), auth.uid())
  on conflict (school_code, grade, section, week_id)
    do update set topic = excluded.topic, set_by = excluded.set_by, updated_at = timezone('utc', now());
end;
$$;


--
-- Name: settle_student_debug_duel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.settle_student_debug_duel() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: settle_student_duel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.settle_student_duel() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: settle_student_hangman_duel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.settle_student_hangman_duel() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: settle_student_spelling_duel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.settle_student_spelling_duel() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: settle_student_timed_math_duel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.settle_student_timed_math_duel() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: settle_tournament_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.settle_tournament_match() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_match record;
  v_count integer;
  v_a_score integer;
  v_b_score integer;
  v_winner uuid;
begin
  select * into v_match from public.tournament_matches where id = new.match_id;
  if v_match.status = 'completed' then return new; end if;

  select count(*) into v_count from public.tournament_match_answers where match_id = new.match_id;
  if v_count < 2 then return new; end if;

  select score into v_a_score from public.tournament_match_answers where match_id = new.match_id and team_id = v_match.team_a_id;
  select score into v_b_score from public.tournament_match_answers where match_id = new.match_id and team_id = v_match.team_b_id;

  if v_a_score > v_b_score then v_winner := v_match.team_a_id;
  elsif v_b_score > v_a_score then v_winner := v_match.team_b_id;
  else v_winner := null; end if;

  update public.tournament_matches
    set status = 'completed', team_a_score = v_a_score, team_b_score = v_b_score,
        winner_team_id = v_winner, resolved_at = timezone('utc', now())
    where id = new.match_id;

  return new;
end;
$$;


--
-- Name: start_debug_duel(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_debug_duel(p_duel_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_labels jsonb;
begin
  select * into v_duel from public.student_debug_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.steps is null then
    raise exception 'Este desafío aún no tiene pasos generados';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;

  if v_is_challenger and v_duel.challenger_started_at is null then
    update public.student_debug_duels set challenger_started_at = now() where id = p_duel_id;
  elsif not v_is_challenger and v_duel.opponent_started_at is null then
    update public.student_debug_duels set opponent_started_at = now() where id = p_duel_id;
  end if;

  select jsonb_agg(s -> 'label') into v_labels from jsonb_array_elements(v_duel.steps) s;
  return jsonb_build_object('labels', v_labels);
end;
$$;


--
-- Name: start_hangman_duel(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_hangman_duel(p_duel_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_is_challenger boolean;
begin
  select * into v_duel from public.student_hangman_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.word is null then
    raise exception 'Este desafío aún no tiene palabra generada';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;

  if v_is_challenger and v_duel.challenger_started_at is null then
    update public.student_hangman_duels set challenger_started_at = now() where id = p_duel_id;
  elsif not v_is_challenger and v_duel.opponent_started_at is null then
    update public.student_hangman_duels set opponent_started_at = now() where id = p_duel_id;
  end if;

  return jsonb_build_object('hint', v_duel.hint, 'wordLength', length(v_duel.word));
end;
$$;


--
-- Name: start_spelling_duel(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_spelling_duel(p_duel_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_is_challenger boolean;
begin
  select * into v_duel from public.student_spelling_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.word is null then
    raise exception 'Este desafío aún no tiene palabra generada';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;

  if v_is_challenger and v_duel.challenger_started_at is null then
    update public.student_spelling_duels set challenger_started_at = now() where id = p_duel_id;
  elsif not v_is_challenger and v_duel.opponent_started_at is null then
    update public.student_spelling_duels set opponent_started_at = now() where id = p_duel_id;
  end if;

  return jsonb_build_object('hint', v_duel.hint);
end;
$$;


--
-- Name: start_timed_math_duel(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_timed_math_duel(p_duel_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_questions jsonb;
begin
  select * into v_duel from public.student_timed_math_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if v_duel.problems is null then
    raise exception 'Este desafío aún no tiene problemas generados';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;

  if v_is_challenger and v_duel.challenger_started_at is null then
    update public.student_timed_math_duels set challenger_started_at = now() where id = p_duel_id;
  elsif not v_is_challenger and v_duel.opponent_started_at is null then
    update public.student_timed_math_duels set opponent_started_at = now() where id = p_duel_id;
  end if;

  select jsonb_agg(q -> 'question') into v_questions from jsonb_array_elements(v_duel.problems) q;
  return jsonb_build_object('questions', v_questions);
end;
$$;


--
-- Name: submit_debug_result(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_debug_result(p_duel_id uuid, p_selected_index integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_bug_index integer;
  v_correct boolean;
  v_time_ms integer;
begin
  select * into v_duel from public.student_debug_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_debug_results where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya jugaste este desafío';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;
  v_started_at := case when v_is_challenger then v_duel.challenger_started_at else v_duel.opponent_started_at end;
  if v_started_at is null then
    raise exception 'Todavía no arrancaste este desafío';
  end if;

  select i into v_bug_index
    from jsonb_array_elements(v_duel.steps) with ordinality as t(step, i)
    where (step ->> 'isBug')::boolean is true
    limit 1;
  if v_bug_index is null then
    raise exception 'Este desafío no tiene un error marcado -- avisale a un admin';
  end if;
  v_bug_index := v_bug_index - 1; -- ordinality empieza en 1, el cliente cuenta desde 0

  v_correct := (p_selected_index = v_bug_index);
  v_time_ms := greatest(0, extract(epoch from (now() - v_started_at)) * 1000)::integer;

  insert into public.student_debug_results (duel_id, student_id, correct, time_ms)
    values (p_duel_id, auth.uid(), v_correct, v_time_ms);

  return jsonb_build_object(
    'correct', v_correct, 'time_ms', v_time_ms, 'bug_index', v_bug_index,
    'explanation', (v_duel.steps -> v_bug_index ->> 'explanation')
  );
end;
$$;


--
-- Name: submit_duel_answers(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_duel_answers(p_duel_id uuid, p_answers jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_score integer := 0;
  v_correct integer;
  v_selected integer;
  i integer;
  v_len integer;
begin
  select * into v_duel from public.student_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Duelo no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_duel_answers where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya respondiste este duelo';
  end if;
  if v_duel.questions is null then
    raise exception 'Este duelo aún no tiene preguntas';
  end if;

  v_len := jsonb_array_length(v_duel.questions);
  for i in 0..v_len - 1 loop
    v_correct := (v_duel.questions->i->>'correctIndex')::integer;
    v_selected := (p_answers->i)::integer;
    if v_selected = v_correct then
      v_score := v_score + 1;
    end if;
  end loop;

  insert into public.student_duel_answers (duel_id, student_id, answers, score)
    values (p_duel_id, auth.uid(), p_answers, v_score);

  return v_score;
end;
$$;


--
-- Name: submit_hangman_result(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_hangman_result(p_duel_id uuid, p_guessed_letters jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_word text;
  v_letters text[];
  v_guessed text[];
  v_wrong integer := 0;
  v_solved boolean;
  v_time_ms integer;
  v_letter text;
begin
  select * into v_duel from public.student_hangman_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_hangman_results where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya jugaste este desafío';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;
  v_started_at := case when v_is_challenger then v_duel.challenger_started_at else v_duel.opponent_started_at end;
  if v_started_at is null then
    raise exception 'Todavía no arrancaste este desafío';
  end if;

  v_word := lower(v_duel.word);
  select array_agg(distinct c) into v_letters from regexp_split_to_table(v_word, '') c where c != '';
  select array_agg(lower(x)) into v_guessed from jsonb_array_elements_text(p_guessed_letters) x;
  v_guessed := coalesce(v_guessed, array[]::text[]);

  foreach v_letter in array v_guessed loop
    if position(v_letter in v_word) = 0 then
      v_wrong := v_wrong + 1;
    end if;
  end loop;

  v_solved := (select bool_and(l = any(v_guessed)) from unnest(v_letters) l);
  v_time_ms := greatest(0, extract(epoch from (now() - v_started_at)) * 1000)::integer;

  insert into public.student_hangman_results (duel_id, student_id, solved, wrong_guesses, time_ms)
    values (p_duel_id, auth.uid(), coalesce(v_solved, false), v_wrong, v_time_ms);

  return jsonb_build_object('solved', coalesce(v_solved, false), 'wrong_guesses', v_wrong, 'time_ms', v_time_ms, 'word', v_duel.word);
end;
$$;


--
-- Name: submit_practice_answers(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_practice_answers(p_session_id uuid, p_answers jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_session record;
  v_score integer := 0;
  v_correct integer;
  v_selected integer;
  i integer;
  v_len integer;
  v_already_rewarded_today boolean;
  v_xp_awarded integer := 0;
  v_gems_awarded integer := 0;
  v_review jsonb := '[]'::jsonb;
begin
  select * into v_session from public.student_practice_sessions where id = p_session_id;
  if v_session is null then
    raise exception 'Sesión no encontrada';
  end if;
  if auth.uid() != v_session.student_id then
    raise exception 'No autorizado';
  end if;
  if v_session.status = 'resolved' then
    raise exception 'Esta sesión ya fue resuelta';
  end if;
  if v_session.questions is null then
    raise exception 'Esta sesión aún no tiene preguntas';
  end if;

  v_len := jsonb_array_length(v_session.questions);
  for i in 0..v_len - 1 loop
    v_correct := (v_session.questions->i->>'correctIndex')::integer;
    v_selected := (p_answers->i)::integer;
    if v_selected = v_correct then
      v_score := v_score + 1;
    end if;
    v_review := v_review || jsonb_build_object(
      'question', v_session.questions->i->>'question',
      'options', v_session.questions->i->'options',
      'correctIndex', v_correct,
      'selected', v_selected
    );
  end loop;

  select exists (
    select 1 from public.student_practice_sessions
    where student_id = auth.uid() and topic = v_session.topic and status = 'resolved'
      and created_at::date = current_date and id != p_session_id
  ) into v_already_rewarded_today;

  if not v_already_rewarded_today then
    v_xp_awarded := v_score * 5;
    v_gems_awarded := v_score * 2;
    update public.students set xp = coalesce(xp, 0) + v_xp_awarded, gems = coalesce(gems, 0) + v_gems_awarded
      where id = auth.uid();
  end if;

  update public.student_practice_sessions
    set status = 'resolved', score = v_score, resolved_at = now()
    where id = p_session_id;

  return jsonb_build_object(
    'score', v_score, 'total', v_len,
    'xp_awarded', v_xp_awarded, 'gems_awarded', v_gems_awarded,
    'review', v_review
  );
end;
$$;


--
-- Name: submit_spelling_answer(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_spelling_answer(p_duel_id uuid, p_answer text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_correct boolean;
  v_time_ms integer;
begin
  select * into v_duel from public.student_spelling_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_spelling_results where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya jugaste este desafío';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;
  v_started_at := case when v_is_challenger then v_duel.challenger_started_at else v_duel.opponent_started_at end;
  if v_started_at is null then
    raise exception 'Todavía no arrancaste este desafío';
  end if;

  v_correct := lower(trim(p_answer)) = lower(trim(v_duel.word));
  v_time_ms := greatest(0, extract(epoch from (now() - v_started_at)) * 1000)::integer;

  insert into public.student_spelling_results (duel_id, student_id, correct, time_ms)
    values (p_duel_id, auth.uid(), v_correct, v_time_ms);

  return jsonb_build_object('correct', v_correct, 'time_ms', v_time_ms, 'word', v_duel.word);
end;
$$;


--
-- Name: submit_timed_math_result(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_timed_math_result(p_duel_id uuid, p_answers jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_duel record;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_len integer;
  i integer;
  v_correct numeric;
  v_given text;
  v_score integer := 0;
  v_time_ms integer;
begin
  select * into v_duel from public.student_timed_math_duels where id = p_duel_id;
  if v_duel is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() != v_duel.challenger_id and auth.uid() != v_duel.opponent_id then
    raise exception 'No autorizado';
  end if;
  if exists (select 1 from public.student_timed_math_results where duel_id = p_duel_id and student_id = auth.uid()) then
    raise exception 'Ya jugaste este desafío';
  end if;

  v_is_challenger := auth.uid() = v_duel.challenger_id;
  v_started_at := case when v_is_challenger then v_duel.challenger_started_at else v_duel.opponent_started_at end;
  if v_started_at is null then
    raise exception 'Todavía no arrancaste este desafío';
  end if;

  v_len := jsonb_array_length(v_duel.problems);
  for i in 0..v_len - 1 loop
    v_correct := (v_duel.problems -> i ->> 'answer')::numeric;
    v_given := p_answers ->> i;
    begin
      if v_given is not null and v_given::numeric = v_correct then
        v_score := v_score + 1;
      end if;
    exception when others then
      -- respuesta no numérica (dejó el campo vacío o escribió texto) -- cuenta como mal, no rompe el submit.
      null;
    end;
  end loop;

  v_time_ms := greatest(0, extract(epoch from (now() - v_started_at)) * 1000)::integer;

  insert into public.student_timed_math_results (duel_id, student_id, score, time_ms)
    values (p_duel_id, auth.uid(), v_score, v_time_ms);

  return jsonb_build_object('score', v_score, 'total', v_len, 'time_ms', v_time_ms);
end;
$$;


--
-- Name: sync_save_evaluation(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_save_evaluation(p_evaluation jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_project_id integer := (p_evaluation->>'project_id')::integer;
  v_total_score integer := (p_evaluation->>'total_score')::integer;
begin
  insert into public.evaluations (
    project_id, teacher_id, total_score, creativity_score, clarity_score,
    functionality_score, teamwork_score, social_impact_score, feedback
  ) values (
    v_project_id,
    (p_evaluation->>'teacher_id')::uuid,
    v_total_score,
    (p_evaluation->>'creativity_score')::integer,
    (p_evaluation->>'clarity_score')::integer,
    (p_evaluation->>'functionality_score')::integer,
    (p_evaluation->>'teamwork_score')::integer,
    (p_evaluation->>'social_impact_score')::integer,
    p_evaluation->>'feedback'
  )
  on conflict (project_id) do update set
    teacher_id = excluded.teacher_id,
    total_score = excluded.total_score,
    creativity_score = excluded.creativity_score,
    clarity_score = excluded.clarity_score,
    functionality_score = excluded.functionality_score,
    teamwork_score = excluded.teamwork_score,
    social_impact_score = excluded.social_impact_score,
    feedback = excluded.feedback;

  update public.projects set score = v_total_score where id = v_project_id;
end;
$$;


--
-- Name: teacher_create_class(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.teacher_create_class(p_school_code text, p_grade text, p_section text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_grade text := btrim(regexp_replace(coalesce(p_grade, ''), '\s+', ' ', 'g'));
  v_section text := upper(btrim(coalesce(p_section, '')));
begin
  if not exists (select 1 from public.teachers where id = auth.uid()) then
    raise exception 'Solo docentes pueden crear clases';
  end if;
  if v_grade = '' or v_section = '' or length(v_grade) > 60 or length(v_section) > 10 then
    raise exception 'Escribí un nombre de grado/club y una sección válidos';
  end if;
  if not exists (select 1 from public.teacher_assignments where teacher_id = auth.uid() and school_code = p_school_code) then
    raise exception 'Solo podés crear clases en un establecimiento donde ya das clases';
  end if;
  if exists (select 1 from public.teacher_assignments
             where teacher_id = auth.uid() and school_code = p_school_code and grade = v_grade and section = v_section) then
    return; -- ya es tuya
  end if;
  if exists (select 1 from public.teacher_assignments where school_code = p_school_code and grade = v_grade and section = v_section)
     or exists (select 1 from public.students where school_code = p_school_code and grade = v_grade and section = v_section) then
    raise exception 'Esa clase ya existe en el establecimiento: pedile al administrador que te la asigne';
  end if;

  insert into public.teacher_assignments (teacher_id, school_code, grade, section)
  values (auth.uid(), p_school_code, v_grade, v_section);
end;
$$;


--
-- Name: toggle_project_like(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_project_like(p_project_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: touch_daily_login(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_daily_login() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


--
-- Name: track_gems_earned(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_gems_earned() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.gems > old.gems then
    new.gems_earned_total := old.gems_earned_total + (new.gems - old.gems);
  end if;
  return new;
end;
$$;


--
-- Name: track_league_xp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_league_xp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_week text := public.current_week_id();
  v_res record;
begin
  if coalesce(new.xp, 0) <= coalesce(old.xp, 0) then
    return new;
  end if;

  if new.league_week is distinct from v_week then
    select * into v_res from public.league_resolution(new.id, new.league_week, new.league_tier);
    new.league_tier := v_res.new_tier;
    new.league_last_result := case when new.league_week is null then null else v_res.result end;
    new.league_week := v_week;
  end if;

  insert into public.league_weekly_points (student_id, week_id, school_code, tier, xp)
    values (new.id, v_week, new.school_code, new.league_tier, new.xp - coalesce(old.xp, 0))
  on conflict (student_id, week_id)
    do update set xp = public.league_weekly_points.xp + excluded.xp;
  return new;
end;
$$;


--
-- Name: track_season_xp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_season_xp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_season text := public.current_season_id();
begin
  if coalesce(new.xp, 0) > coalesce(old.xp, 0) then
    if coalesce(old.season_id, '') <> v_season then
      new.season_id := v_season;
      new.season_xp := 0;
    end if;
    new.season_xp := coalesce(new.season_xp, 0) + (new.xp - coalesce(old.xp, 0));
  end if;
  return new;
end;
$$;


--
-- Name: unregister_push_subscription(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unregister_push_subscription(p_endpoint text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;


--
-- Name: update_review_eligibility(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_review_eligibility() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE projects
  SET can_request_review = true
  WHERE is_reviewed = false
    AND can_request_review = false
    AND created_at < NOW() - INTERVAL '15 days';
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: active_time_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_time_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_code text,
    role text NOT NULL,
    activity_date date DEFAULT CURRENT_DATE,
    total_seconds integer DEFAULT 0,
    last_heartbeat timestamp with time zone DEFAULT timezone('utc'::text, now()),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: TABLE active_time_tracking; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.active_time_tracking IS 'Métricas de tiempo de uso de la plataforma por usuario y establecimiento.';


--
-- Name: ai_code_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_code_evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id integer NOT NULL,
    teacher_id uuid NOT NULL,
    input_type text NOT NULL,
    rubric jsonb DEFAULT '[]'::jsonb NOT NULL,
    score integer,
    feedback text,
    criteria_feedback jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT ai_code_evaluations_input_type_check CHECK ((input_type = ANY (ARRAY['screenshot'::text, 'mblock_file'::text])))
);


--
-- Name: ai_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_evaluations (
    project_id integer NOT NULL,
    creativity_score integer,
    clarity_score integer,
    functionality_score integer,
    teamwork_score integer,
    social_impact_score integer,
    total_score integer,
    feedback text,
    model text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: announcement_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcement_reads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    sender_role text NOT NULL,
    audience text NOT NULL,
    school_code text,
    grade text,
    section text,
    title text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    target_schools text[],
    target_groups jsonb,
    CONSTRAINT announcements_audience_check CHECK ((audience = ANY (ARRAY['students'::text, 'teachers'::text, 'all'::text]))),
    CONSTRAINT announcements_sender_role_check CHECK ((sender_role = ANY (ARRAY['docente'::text, 'admin'::text])))
);


--
-- Name: asset_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_audits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tutor_id uuid NOT NULL,
    school_id integer NOT NULL,
    photo_url text NOT NULL,
    metadata jsonb,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id integer NOT NULL,
    student_id uuid,
    teacher_id uuid,
    school_code character varying(20),
    grade character varying(50),
    section character varying(10),
    date date NOT NULL,
    "time" time without time zone NOT NULL,
    status character varying(20) DEFAULT 'present'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: attendance_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_reports (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    report_key text,
    teacher_id uuid,
    total_students integer,
    attendance_percentage numeric,
    total_records integer,
    week_number integer,
    year integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: attendance_waivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_waivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid NOT NULL,
    date date NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text,
    admin_comment text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    school_code text,
    grade text,
    section text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.badges (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    category text,
    criteria_type text,
    criteria_value jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: badges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.badges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: badges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.badges_id_seq OWNED BY public.badges.id;


--
-- Name: certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    year integer NOT NULL,
    metadata jsonb,
    issued_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: class_passwords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_passwords (
    school_code text NOT NULL,
    grade text NOT NULL,
    section text NOT NULL,
    password text NOT NULL,
    requires_password boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by uuid
);


--
-- Name: class_weekly_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_weekly_topics (
    school_code text NOT NULL,
    grade text NOT NULL,
    section text NOT NULL,
    week_id text NOT NULL,
    topic text NOT NULL,
    set_by uuid,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT class_weekly_topics_topic_check CHECK (((char_length(topic) >= 2) AND (char_length(topic) <= 180)))
);


--
-- Name: comment_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    actor_name text,
    comment_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    type text NOT NULL,
    content_preview text,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comment_notifications_type_check CHECK ((type = ANY (ARRAY['reply'::text, 'like'::text])))
);


--
-- Name: companion_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companion_videos (
    species text NOT NULL,
    url text NOT NULL,
    title text,
    credit text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coordinator_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coordinator_assignments (
    id bigint NOT NULL,
    coordinator_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coordinator_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.coordinator_assignments ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.coordinator_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cosmetic_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cosmetic_items (
    id text NOT NULL,
    slot text NOT NULL,
    name text NOT NULL,
    price integer DEFAULT 0 NOT NULL,
    min_stage integer DEFAULT 0 NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    pass_only boolean DEFAULT false NOT NULL,
    CONSTRAINT cosmetic_items_min_stage_check CHECK (((min_stage >= 0) AND (min_stage <= 5))),
    CONSTRAINT cosmetic_items_price_check CHECK ((price >= 0)),
    CONSTRAINT cosmetic_items_slot_check CHECK ((slot = ANY (ARRAY['head'::text, 'face'::text, 'back'::text, 'skin'::text])))
);


--
-- Name: course_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    liked boolean,
    feedback text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    school_code text NOT NULL,
    grade text NOT NULL,
    section text NOT NULL,
    created_by uuid NOT NULL,
    is_shared boolean DEFAULT false NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    weight integer DEFAULT 100 NOT NULL,
    bimestre integer DEFAULT 1 NOT NULL,
    tinkercad_class_url text,
    cnb_area text,
    CONSTRAINT courses_bimestre_check CHECK (((bimestre >= 1) AND (bimestre <= 4))),
    CONSTRAINT courses_weight_check CHECK (((weight >= 0) AND (weight <= 100)))
);


--
-- Name: duel_daily_rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.duel_daily_rewards (
    student_id uuid NOT NULL,
    day date NOT NULL,
    rewarded integer DEFAULT 0 NOT NULL
);


--
-- Name: duel_facts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.duel_facts (
    game text NOT NULL,
    duel_id uuid NOT NULL,
    fact text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT duel_facts_game_check CHECK ((game = ANY (ARRAY['quiz'::text, 'hangman'::text, 'spelling'::text, 'debug'::text])))
);


--
-- Name: dynamic_kpis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dynamic_kpis (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    category character varying(20),
    weight_percentage integer NOT NULL,
    metric_source character varying(50),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT dynamic_kpis_category_check CHECK (((category)::text = ANY ((ARRAY['administrative'::character varying, 'productivity'::character varying])::text[])))
);


--
-- Name: email_notifications_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_notifications_log (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    notification_type text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_notifications_log_notification_type_check CHECK ((notification_type = ANY (ARRAY['24h'::text, '3d'::text])))
);


--
-- Name: email_notifications_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.email_notifications_log ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.email_notifications_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: evaluation_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_scores (
    id bigint NOT NULL,
    evaluation_id bigint,
    criteria_id bigint,
    score numeric(5,2),
    notes text
);


--
-- Name: evaluation_scores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluation_scores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluation_scores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluation_scores_id_seq OWNED BY public.evaluation_scores.id;


--
-- Name: evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluations (
    id integer NOT NULL,
    project_id integer,
    teacher_id uuid,
    creativity_score integer,
    clarity_score integer,
    functionality_score integer,
    teamwork_score integer,
    social_impact_score integer,
    total_score integer,
    comments text,
    created_at timestamp without time zone DEFAULT now(),
    feedback text,
    CONSTRAINT evaluations_clarity_score_check CHECK (((clarity_score >= 0) AND (clarity_score <= 20))),
    CONSTRAINT evaluations_creativity_score_check CHECK (((creativity_score >= 0) AND (creativity_score <= 20))),
    CONSTRAINT evaluations_functionality_score_check CHECK (((functionality_score >= 0) AND (functionality_score <= 20))),
    CONSTRAINT evaluations_social_impact_score_check CHECK (((social_impact_score >= 0) AND (social_impact_score <= 20))),
    CONSTRAINT evaluations_teamwork_score_check CHECK (((teamwork_score >= 0) AND (teamwork_score <= 20)))
);


--
-- Name: COLUMN evaluations.comments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.evaluations.comments IS 'Comentarios privados solo para admin';


--
-- Name: COLUMN evaluations.feedback; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.evaluations.feedback IS 'Retroalimentación visible para estudiantes del equipo';


--
-- Name: evaluations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evaluations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evaluations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evaluations_id_seq OWNED BY public.evaluations.id;


--
-- Name: event_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    submitted_at timestamp with time zone,
    score integer,
    time_taken_ms integer,
    gems_awarded integer DEFAULT 0 NOT NULL,
    rank integer
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    id integer NOT NULL,
    group_id integer,
    student_id uuid,
    role character varying(20),
    is_leader boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT group_members_role_check CHECK (((role)::text = ANY ((ARRAY['planner'::character varying, 'maker'::character varying, 'speaker'::character varying, 'helper'::character varying])::text[])))
);


--
-- Name: group_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.group_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: group_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.group_members_id_seq OWNED BY public.group_members.id;


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    school_code character varying(20),
    grade character varying(50),
    section character varying(10),
    created_by uuid,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.groups_id_seq OWNED BY public.groups.id;


--
-- Name: guardian_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guardian_notifications (
    id bigint NOT NULL,
    guardian_id uuid NOT NULL,
    student_id uuid NOT NULL,
    channel text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT guardian_notifications_channel_check CHECK ((channel = ANY (ARRAY['push'::text, 'sms'::text]))),
    CONSTRAINT guardian_notifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])))
);


--
-- Name: guardian_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.guardian_notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: guardian_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.guardian_notifications_id_seq OWNED BY public.guardian_notifications.id;


--
-- Name: guardian_push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guardian_push_subscriptions (
    id bigint NOT NULL,
    guardian_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: guardian_push_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.guardian_push_subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: guardian_push_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.guardian_push_subscriptions_id_seq OWNED BY public.guardian_push_subscriptions.id;


--
-- Name: hangman_word_bank; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hangman_word_bank (
    id bigint NOT NULL,
    category text NOT NULL,
    word text NOT NULL,
    hint text NOT NULL,
    fact text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: hangman_word_bank_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.hangman_word_bank ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.hangman_word_bank_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: kpi_task_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_task_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    period_month character varying(7) NOT NULL,
    is_completed boolean DEFAULT false,
    is_verified boolean DEFAULT false,
    completed_at timestamp with time zone,
    verified_at timestamp with time zone
);


--
-- Name: kpi_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kpi_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kpi_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    teacher_id uuid
);


--
-- Name: league_weekly_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.league_weekly_points (
    student_id uuid NOT NULL,
    week_id text NOT NULL,
    school_code text,
    tier integer NOT NULL,
    xp integer DEFAULT 0 NOT NULL
);


--
-- Name: lesson_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    student_id uuid NOT NULL,
    completed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    score numeric,
    status text,
    raw_data jsonb
);


--
-- Name: lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    content_type text NOT NULL,
    content_url text,
    school_code text NOT NULL,
    grade text NOT NULL,
    section text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    content_path text,
    is_shared boolean DEFAULT false NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    course_id uuid,
    order_index integer DEFAULT 0 NOT NULL,
    quiz_data jsonb,
    audience text DEFAULT 'estudiante'::text NOT NULL,
    CONSTRAINT lessons_audience_check CHECK ((audience = ANY (ARRAY['estudiante'::text, 'docente'::text]))),
    CONSTRAINT lessons_content_type_check CHECK ((content_type = ANY (ARRAY['video'::text, 'pdf'::text, 'image'::text, 'scorm'::text, 'h5p'::text, 'html5'::text, 'quiz'::text, 'tinkercad'::text])))
);


--
-- Name: likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.likes (
    id bigint NOT NULL,
    project_id bigint NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: likes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.likes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: likes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.likes_id_seq OWNED BY public.likes.id;


--
-- Name: login_rate_limit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_rate_limit (
    ip text NOT NULL,
    attempts integer DEFAULT 1 NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: manual_kpi_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manual_kpi_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kpi_id uuid,
    teacher_id uuid,
    period_month character varying(7) NOT NULL,
    progress_value double precision DEFAULT 0,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: mascot_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mascot_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT mascot_chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: node_session_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_session_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    node_id uuid,
    student_id uuid,
    device text,
    entered_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    user_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    project_id bigint,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid,
    period_month character varying(7) NOT NULL,
    base_salary numeric(10,2),
    bonus_admin numeric(10,2),
    bonus_prod numeric(10,2),
    total_paid numeric(10,2),
    status character varying(20) DEFAULT 'processed'::character varying,
    processed_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    role character varying(20) NOT NULL,
    user_metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT profiles_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'docente'::character varying, 'estudiante'::character varying])::text[])))
);


--
-- Name: programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programs (
    id bigint NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: programs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.programs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.programs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: project_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_likes (
    id integer NOT NULL,
    project_id integer,
    user_id uuid,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: project_likes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_likes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_likes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_likes_id_seq OWNED BY public.project_likes.id;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    user_id uuid,
    group_id integer,
    title text NOT NULL,
    description text,
    video_url text,
    score integer DEFAULT 0,
    votes integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    upload_ip text,
    client_metadata jsonb,
    bimestre integer
);


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    role text DEFAULT 'estudiante'::text NOT NULL,
    CONSTRAINT push_subscriptions_role_check CHECK ((role = ANY (ARRAY['estudiante'::text, 'docente'::text])))
);


--
-- Name: random_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.random_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    duration_minutes integer DEFAULT 15 NOT NULL,
    topic text NOT NULL,
    question_count integer DEFAULT 8 NOT NULL,
    gem_pool integer DEFAULT 100 NOT NULL,
    questions jsonb,
    status text DEFAULT 'scheduled'::text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    target_role text DEFAULT 'estudiante'::text NOT NULL,
    CONSTRAINT random_events_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'active'::text, 'completed'::text]))),
    CONSTRAINT random_events_target_role_check CHECK ((target_role = ANY (ARRAY['estudiante'::text, 'docente'::text])))
);


--
-- Name: resource_comment_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_comment_likes (
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resource_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    group_id integer NOT NULL,
    author_id uuid NOT NULL,
    author_name text NOT NULL,
    author_role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_id uuid,
    attachment_url text
);


--
-- Name: resource_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    student_id uuid NOT NULL,
    content text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: school_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_code text NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_sync_at timestamp with time zone,
    last_sync_info jsonb,
    revoked_at timestamp with time zone
);


--
-- Name: school_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_programs (
    school_id bigint NOT NULL,
    program_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schools (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    name text NOT NULL,
    address text,
    phone character varying(20),
    email character varying(100),
    department character varying(100),
    municipality character varying(100),
    sector character varying(50),
    level character varying(50),
    schedule character varying(50),
    area character varying(20),
    created_at timestamp without time zone DEFAULT now(),
    latitude double precision,
    longitude double precision,
    geofence_radius integer DEFAULT 100,
    projects_per_bimestre integer,
    programa text,
    public_projects boolean DEFAULT true NOT NULL
);


--
-- Name: schools_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schools_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schools_id_seq OWNED BY public.schools.id;


--
-- Name: season_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.season_claims (
    student_id uuid NOT NULL,
    season_id text NOT NULL,
    level integer NOT NULL,
    claimed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT season_claims_level_check CHECK (((level >= 1) AND (level <= 30)))
);


--
-- Name: seasonal_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seasonal_milestones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id integer NOT NULL,
    period_month character varying(7) NOT NULL,
    milestone_type character varying(50) NOT NULL,
    is_completed boolean DEFAULT false,
    verified_by uuid,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: student_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_badges (
    id integer NOT NULL,
    student_id uuid,
    badge_id integer NOT NULL,
    earned_at timestamp without time zone DEFAULT now(),
    celebrated boolean DEFAULT false NOT NULL
);


--
-- Name: student_badges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_badges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_badges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_badges_id_seq OWNED BY public.student_badges.id;


--
-- Name: student_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    challenge_id text NOT NULL,
    comment text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: student_companions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_companions (
    student_id uuid NOT NULL,
    species text NOT NULL,
    obtained_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT student_companions_species_check CHECK ((species = ANY (ARRAY['quetzal'::text, 'jaguar'::text, 'tortuga'::text, 'tucan'::text, 'saraguate'::text, 'manati'::text, 'guacamaya'::text, 'danta'::text, 'pizote'::text, 'armadillo'::text])))
);


--
-- Name: student_cosmetics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_cosmetics (
    student_id uuid NOT NULL,
    item_id text NOT NULL,
    acquired_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: student_debug_duels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_debug_duels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenger_id uuid NOT NULL,
    opponent_id uuid NOT NULL,
    wager_gems integer NOT NULL,
    topic text NOT NULL,
    steps jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    winner_id uuid,
    challenger_started_at timestamp with time zone,
    opponent_started_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at timestamp with time zone,
    result_notified_at timestamp with time zone,
    CONSTRAINT student_debug_duels_check CHECK ((challenger_id <> opponent_id)),
    CONSTRAINT student_debug_duels_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'rejected'::text, 'cancelled'::text, 'active'::text, 'completed'::text]))),
    CONSTRAINT student_debug_duels_wager_gems_check CHECK ((wager_gems >= 0))
);


--
-- Name: student_debug_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_debug_results (
    duel_id uuid NOT NULL,
    student_id uuid NOT NULL,
    correct boolean NOT NULL,
    time_ms integer NOT NULL,
    completed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: student_duel_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_duel_answers (
    duel_id uuid NOT NULL,
    student_id uuid NOT NULL,
    answers jsonb NOT NULL,
    score integer NOT NULL,
    completed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    result_seen boolean DEFAULT false NOT NULL
);


--
-- Name: student_duels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_duels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenger_id uuid NOT NULL,
    opponent_id uuid NOT NULL,
    wager_gems integer NOT NULL,
    topic text NOT NULL,
    question_count integer DEFAULT 5 NOT NULL,
    questions jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    winner_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at timestamp with time zone,
    result_notified_at timestamp with time zone,
    CONSTRAINT student_duels_check CHECK ((challenger_id <> opponent_id)),
    CONSTRAINT student_duels_question_count_check CHECK (((question_count >= 1) AND (question_count <= 15))),
    CONSTRAINT student_duels_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'rejected'::text, 'cancelled'::text, 'active'::text, 'completed'::text]))),
    CONSTRAINT student_duels_wager_gems_check CHECK ((wager_gems >= 0))
);


--
-- Name: student_gem_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_gem_events (
    id bigint NOT NULL,
    student_id uuid NOT NULL,
    amount integer NOT NULL,
    reason text,
    balance integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: student_gem_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_gem_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_gem_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_gem_events_id_seq OWNED BY public.student_gem_events.id;


--
-- Name: student_guardians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_guardians (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    name text NOT NULL,
    relation text,
    phone text,
    sms_enabled boolean DEFAULT true NOT NULL,
    portal_token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    consent_status text,
    consent_version integer,
    consent_at timestamp with time zone,
    consent_method text,
    consent_recorded_by uuid,
    CONSTRAINT student_guardians_consent_method_check CHECK (((consent_method IS NULL) OR (consent_method = ANY (ARRAY['portal'::text, 'paper'::text])))),
    CONSTRAINT student_guardians_consent_status_check CHECK (((consent_status IS NULL) OR (consent_status = ANY (ARRAY['accepted'::text, 'declined'::text])))),
    CONSTRAINT student_guardians_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 80))),
    CONSTRAINT student_guardians_phone_check CHECK (((phone IS NULL) OR (phone ~ '^\+[0-9]{8,15}$'::text))),
    CONSTRAINT student_guardians_relation_check CHECK (((relation IS NULL) OR (char_length(relation) <= 30)))
);


--
-- Name: student_hangman_duels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_hangman_duels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenger_id uuid NOT NULL,
    opponent_id uuid NOT NULL,
    wager_gems integer NOT NULL,
    topic text NOT NULL,
    word text,
    hint text,
    status text DEFAULT 'pending'::text NOT NULL,
    winner_id uuid,
    challenger_started_at timestamp with time zone,
    opponent_started_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at timestamp with time zone,
    result_notified_at timestamp with time zone,
    CONSTRAINT student_hangman_duels_check CHECK ((challenger_id <> opponent_id)),
    CONSTRAINT student_hangman_duels_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'rejected'::text, 'cancelled'::text, 'active'::text, 'completed'::text]))),
    CONSTRAINT student_hangman_duels_wager_gems_check CHECK ((wager_gems >= 0))
);


--
-- Name: student_hangman_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_hangman_results (
    duel_id uuid NOT NULL,
    student_id uuid NOT NULL,
    solved boolean NOT NULL,
    wrong_guesses integer NOT NULL,
    time_ms integer NOT NULL,
    completed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: student_practice_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_practice_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    topic text NOT NULL,
    question_count integer DEFAULT 5 NOT NULL,
    questions jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    score integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT student_practice_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'ready'::text, 'resolved'::text])))
);


--
-- Name: student_spelling_duels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_spelling_duels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenger_id uuid NOT NULL,
    opponent_id uuid NOT NULL,
    wager_gems integer NOT NULL,
    topic text NOT NULL,
    word text,
    hint text,
    status text DEFAULT 'pending'::text NOT NULL,
    winner_id uuid,
    challenger_started_at timestamp with time zone,
    opponent_started_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at timestamp with time zone,
    result_notified_at timestamp with time zone,
    CONSTRAINT student_spelling_duels_check CHECK ((challenger_id <> opponent_id)),
    CONSTRAINT student_spelling_duels_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'rejected'::text, 'cancelled'::text, 'active'::text, 'completed'::text]))),
    CONSTRAINT student_spelling_duels_wager_gems_check CHECK ((wager_gems >= 0))
);


--
-- Name: student_spelling_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_spelling_results (
    duel_id uuid NOT NULL,
    student_id uuid NOT NULL,
    correct boolean NOT NULL,
    time_ms integer NOT NULL,
    completed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: student_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_suggestions (
    id integer NOT NULL,
    student_id uuid,
    type character varying(50) NOT NULL,
    message text,
    rating integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: student_suggestions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_suggestions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_suggestions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_suggestions_id_seq OWNED BY public.student_suggestions.id;


--
-- Name: student_timed_math_duels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_timed_math_duels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenger_id uuid NOT NULL,
    opponent_id uuid NOT NULL,
    wager_gems integer NOT NULL,
    problem_count integer DEFAULT 10 NOT NULL,
    problems jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    winner_id uuid,
    challenger_started_at timestamp with time zone,
    opponent_started_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at timestamp with time zone,
    result_notified_at timestamp with time zone,
    CONSTRAINT student_timed_math_duels_check CHECK ((challenger_id <> opponent_id)),
    CONSTRAINT student_timed_math_duels_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'rejected'::text, 'cancelled'::text, 'active'::text, 'completed'::text]))),
    CONSTRAINT student_timed_math_duels_wager_gems_check CHECK ((wager_gems >= 0))
);


--
-- Name: student_timed_math_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_timed_math_results (
    duel_id uuid NOT NULL,
    student_id uuid NOT NULL,
    score integer NOT NULL,
    time_ms integer NOT NULL,
    completed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id uuid NOT NULL,
    full_name text NOT NULL,
    username character varying(50) NOT NULL,
    email text NOT NULL,
    cui character varying(13),
    school_code character varying(20),
    grade character varying(50),
    section character varying(10),
    password_generated character varying(50),
    profile_photo_url text,
    role character varying(20) DEFAULT 'estudiante'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    qr_code text,
    qr_data text,
    birth_date date,
    gender character varying(20),
    xp integer DEFAULT 0,
    gems integer DEFAULT 0,
    streak integer DEFAULT 0,
    last_login date,
    streak_freeze boolean DEFAULT false,
    daily_chest_last_claimed date,
    codigo_personal text,
    gems_earned_total integer DEFAULT 0 NOT NULL,
    has_gold_frame boolean DEFAULT false NOT NULL,
    has_mascot_glasses boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    companion_equipped jsonb DEFAULT '{}'::jsonb NOT NULL,
    companion_species text,
    season_id text,
    season_xp integer DEFAULT 0 NOT NULL,
    league_tier integer DEFAULT 0 NOT NULL,
    league_week text,
    league_last_result text,
    duel_win_streak integer DEFAULT 0 NOT NULL,
    best_duel_win_streak integer DEFAULT 0 NOT NULL,
    created_by uuid,
    pin_hash text,
    pin_salt text,
    pin_updated_at timestamp with time zone,
    CONSTRAINT students_companion_species_check CHECK ((companion_species = ANY (ARRAY['quetzal'::text, 'jaguar'::text, 'tortuga'::text, 'tucan'::text, 'saraguate'::text, 'manati'::text, 'guacamaya'::text, 'danta'::text, 'pizote'::text, 'armadillo'::text]))),
    CONSTRAINT students_league_tier_check CHECK (((league_tier >= 0) AND (league_tier <= 4))),
    CONSTRAINT students_status_check CHECK ((status = ANY (ARRAY['active'::text, 'egresado'::text, 'baja'::text])))
);


--
-- Name: COLUMN students.birth_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.students.birth_date IS 'Fecha de nacimiento para felicitaciones automáticas';


--
-- Name: survey_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    response_id uuid NOT NULL,
    question_id uuid NOT NULL,
    answer_text text,
    answer_choice integer,
    answer_scale integer
);


--
-- Name: survey_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    survey_id uuid NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    type text NOT NULL,
    question text NOT NULL,
    options jsonb,
    scale_min integer DEFAULT 1,
    scale_max integer DEFAULT 5,
    CONSTRAINT survey_questions_type_check CHECK ((type = ANY (ARRAY['multiple_choice'::text, 'text'::text, 'scale'::text])))
);


--
-- Name: survey_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    survey_id uuid NOT NULL,
    user_id uuid NOT NULL,
    submitted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: surveys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.surveys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid NOT NULL,
    title text NOT NULL,
    description text,
    audience text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT surveys_audience_check CHECK ((audience = ANY (ARRAY['students'::text, 'teachers'::text, 'all'::text]))),
    CONSTRAINT surveys_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])))
);


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    description text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: teacher_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_assignments (
    id integer NOT NULL,
    teacher_id uuid,
    school_code character varying(20),
    grade character varying(50),
    section character varying(10),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: teacher_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.teacher_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: teacher_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.teacher_assignments_id_seq OWNED BY public.teacher_assignments.id;


--
-- Name: teacher_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_badges (
    id bigint NOT NULL,
    teacher_id uuid,
    badge_id integer NOT NULL,
    awarded_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    celebrated boolean DEFAULT false NOT NULL
);


--
-- Name: teacher_badges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.teacher_badges ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.teacher_badges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: teacher_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid NOT NULL,
    challenge_id text NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: teacher_monthly_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_monthly_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    results_intro text,
    results jsonb DEFAULT '[]'::jsonb,
    inconveniences text,
    actions text,
    conclusion text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: teacher_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_notifications (
    id integer NOT NULL,
    teacher_id uuid,
    project_id integer,
    type character varying(50) NOT NULL,
    message text,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: teacher_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.teacher_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: teacher_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.teacher_notifications_id_seq OWNED BY public.teacher_notifications.id;


--
-- Name: teacher_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_ratings (
    id integer NOT NULL,
    student_id uuid,
    teacher_id uuid,
    rating numeric(3,1),
    message text,
    created_at timestamp without time zone DEFAULT now(),
    q_interest integer DEFAULT 0,
    q_practice integer DEFAULT 0,
    q_resources integer DEFAULT 0,
    q_respect integer DEFAULT 0,
    q_clarity integer DEFAULT 0,
    best_moment text,
    CONSTRAINT teacher_ratings_rating_check CHECK (((rating >= (1)::numeric) AND (rating <= (5)::numeric)))
);


--
-- Name: COLUMN teacher_ratings.rating; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.teacher_ratings.rating IS 'Calificación promedio con un decimal (ej: 4.2)';


--
-- Name: COLUMN teacher_ratings.q_interest; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.teacher_ratings.q_interest IS 'La clase fue interesante';


--
-- Name: COLUMN teacher_ratings.q_practice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.teacher_ratings.q_practice IS 'Aprendí haciendo';


--
-- Name: COLUMN teacher_ratings.q_resources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.teacher_ratings.q_resources IS 'Uso útil de tecnología/materiales';


--
-- Name: COLUMN teacher_ratings.q_respect; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.teacher_ratings.q_respect IS 'Me sentí escuchado y respetado';


--
-- Name: COLUMN teacher_ratings.q_clarity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.teacher_ratings.q_clarity IS 'Explicación clara';


--
-- Name: COLUMN teacher_ratings.best_moment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.teacher_ratings.best_moment IS '¿Qué fue lo mejor de la clase esta semana?';


--
-- Name: teacher_ratings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.teacher_ratings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: teacher_ratings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.teacher_ratings_id_seq OWNED BY public.teacher_ratings.id;


--
-- Name: teacher_rock_completions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_rock_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid NOT NULL,
    rock_id uuid NOT NULL,
    completed_at timestamp without time zone DEFAULT now(),
    evidence_url text,
    notes text,
    requires_approval boolean DEFAULT false,
    approved_by uuid,
    approved_at timestamp without time zone,
    approval_status text DEFAULT 'pending'::text,
    rejection_reason text,
    xp_awarded integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT teacher_rock_completions_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: teacher_rocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_rocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    month integer NOT NULL,
    year integer,
    school_code text,
    grade text,
    xp_value integer DEFAULT 10,
    is_mandatory boolean DEFAULT true,
    requires_evidence boolean DEFAULT true,
    deadline_day integer,
    auto_complete boolean DEFAULT false,
    auto_complete_condition text,
    icon text DEFAULT 'fa-flag-checkered'::text,
    color text DEFAULT 'primary'::text,
    created_at timestamp without time zone DEFAULT now(),
    created_by uuid,
    is_active boolean DEFAULT true,
    CONSTRAINT teacher_rocks_deadline_day_check CHECK (((deadline_day >= 1) AND (deadline_day <= 31))),
    CONSTRAINT teacher_rocks_month_check CHECK (((month >= 1) AND (month <= 12)))
);


--
-- Name: teachers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teachers (
    id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    phone character varying(20),
    profile_photo_url text,
    role character varying(20) DEFAULT 'docente'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    xp integer DEFAULT 0,
    gems integer DEFAULT 0,
    streak integer DEFAULT 0,
    last_login date,
    daily_chest_last_claimed date,
    base_salary numeric(10,2) DEFAULT 0,
    bonus_admin_max numeric(10,2) DEFAULT 0,
    bonus_prod_max numeric(10,2) DEFAULT 0,
    rank_title character varying(50) DEFAULT 'Tutor Junior'::character varying,
    certification_points integer DEFAULT 0,
    is_coordinator boolean DEFAULT false,
    bonus_coordinator_max numeric(10,2) DEFAULT 0,
    birth_date date,
    is_1bot_team boolean DEFAULT false
);


--
-- Name: COLUMN teachers.birth_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.teachers.birth_date IS 'Fecha de nacimiento para felicitaciones automáticas';


--
-- Name: tournament_match_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_match_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    team_id uuid NOT NULL,
    submitted_by uuid NOT NULL,
    answers jsonb NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    time_taken_ms integer,
    submitted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: tournament_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    season_id uuid NOT NULL,
    team_a_id uuid NOT NULL,
    team_b_id uuid NOT NULL,
    challenger_team_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    topic text NOT NULL,
    question_count integer DEFAULT 8 NOT NULL,
    questions jsonb,
    team_a_score integer,
    team_b_score integer,
    winner_team_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT tournament_matches_check CHECK ((team_a_id <> team_b_id)),
    CONSTRAINT tournament_matches_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'rejected'::text, 'cancelled'::text, 'active'::text, 'completed'::text])))
);


--
-- Name: tournament_seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_seasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    status text DEFAULT 'upcoming'::text NOT NULL,
    points_win integer DEFAULT 3 NOT NULL,
    points_tie integer DEFAULT 1 NOT NULL,
    points_loss integer DEFAULT 0 NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT tournament_seasons_status_check CHECK ((status = ANY (ARRAY['upcoming'::text, 'active'::text, 'closed'::text])))
);


--
-- Name: tournament_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    season_id uuid NOT NULL,
    team_id uuid NOT NULL,
    student_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: tournament_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournament_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    season_id uuid NOT NULL,
    name text NOT NULL,
    school_code text NOT NULL,
    captain_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: tutor_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tutor_attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tutor_id uuid NOT NULL,
    school_id integer NOT NULL,
    check_in timestamp with time zone DEFAULT timezone('utc'::text, now()),
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    distance_meters double precision,
    is_valid_entry boolean DEFAULT false,
    device_info jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    client_ref uuid
);


--
-- Name: user_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_badges (
    id bigint NOT NULL,
    user_id uuid,
    badge_id bigint,
    earned_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_badges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_badges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_badges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_badges_id_seq OWNED BY public.user_badges.id;


--
-- Name: votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.votes (
    id bigint NOT NULL,
    user_id uuid,
    project_id bigint,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: votes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.votes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: votes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.votes_id_seq OWNED BY public.votes.id;


--
-- Name: weekly_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    photo_url text,
    location text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    iso_week text GENERATED ALWAYS AS ((((EXTRACT(isoyear FROM (created_at AT TIME ZONE 'UTC'::text)))::text || '-'::text) || lpad((EXTRACT(week FROM (created_at AT TIME ZONE 'UTC'::text)))::text, 2, '0'::text))) STORED
);


--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: badges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges ALTER COLUMN id SET DEFAULT nextval('public.badges_id_seq'::regclass);


--
-- Name: evaluation_scores id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_scores ALTER COLUMN id SET DEFAULT nextval('public.evaluation_scores_id_seq'::regclass);


--
-- Name: evaluations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations ALTER COLUMN id SET DEFAULT nextval('public.evaluations_id_seq'::regclass);


--
-- Name: group_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members ALTER COLUMN id SET DEFAULT nextval('public.group_members_id_seq'::regclass);


--
-- Name: groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups ALTER COLUMN id SET DEFAULT nextval('public.groups_id_seq'::regclass);


--
-- Name: guardian_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_notifications ALTER COLUMN id SET DEFAULT nextval('public.guardian_notifications_id_seq'::regclass);


--
-- Name: guardian_push_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_push_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.guardian_push_subscriptions_id_seq'::regclass);


--
-- Name: likes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes ALTER COLUMN id SET DEFAULT nextval('public.likes_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: project_likes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_likes ALTER COLUMN id SET DEFAULT nextval('public.project_likes_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: schools id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools ALTER COLUMN id SET DEFAULT nextval('public.schools_id_seq'::regclass);


--
-- Name: student_badges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_badges ALTER COLUMN id SET DEFAULT nextval('public.student_badges_id_seq'::regclass);


--
-- Name: student_gem_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_gem_events ALTER COLUMN id SET DEFAULT nextval('public.student_gem_events_id_seq'::regclass);


--
-- Name: student_suggestions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_suggestions ALTER COLUMN id SET DEFAULT nextval('public.student_suggestions_id_seq'::regclass);


--
-- Name: teacher_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignments ALTER COLUMN id SET DEFAULT nextval('public.teacher_assignments_id_seq'::regclass);


--
-- Name: teacher_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_notifications ALTER COLUMN id SET DEFAULT nextval('public.teacher_notifications_id_seq'::regclass);


--
-- Name: teacher_ratings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_ratings ALTER COLUMN id SET DEFAULT nextval('public.teacher_ratings_id_seq'::regclass);


--
-- Name: user_badges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges ALTER COLUMN id SET DEFAULT nextval('public.user_badges_id_seq'::regclass);


--
-- Name: votes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes ALTER COLUMN id SET DEFAULT nextval('public.votes_id_seq'::regclass);


--
-- Name: active_time_tracking active_time_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_time_tracking
    ADD CONSTRAINT active_time_tracking_pkey PRIMARY KEY (id);


--
-- Name: active_time_tracking active_time_tracking_user_id_school_code_activity_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_time_tracking
    ADD CONSTRAINT active_time_tracking_user_id_school_code_activity_date_key UNIQUE (user_id, school_code, activity_date);


--
-- Name: ai_code_evaluations ai_code_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_code_evaluations
    ADD CONSTRAINT ai_code_evaluations_pkey PRIMARY KEY (id);


--
-- Name: ai_evaluations ai_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_evaluations
    ADD CONSTRAINT ai_evaluations_pkey PRIMARY KEY (project_id);


--
-- Name: announcement_reads announcement_reads_announcement_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_announcement_id_user_id_key UNIQUE (announcement_id, user_id);


--
-- Name: announcement_reads announcement_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: asset_audits asset_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_audits
    ADD CONSTRAINT asset_audits_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: attendance_reports attendance_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_reports
    ADD CONSTRAINT attendance_reports_pkey PRIMARY KEY (id);


--
-- Name: attendance_reports attendance_reports_report_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_reports
    ADD CONSTRAINT attendance_reports_report_key_key UNIQUE (report_key);


--
-- Name: attendance attendance_student_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_date_key UNIQUE (student_id, date);


--
-- Name: attendance_waivers attendance_waivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_waivers
    ADD CONSTRAINT attendance_waivers_pkey PRIMARY KEY (id);


--
-- Name: badges badges_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_code_key UNIQUE (code);


--
-- Name: badges badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_pkey PRIMARY KEY (id);


--
-- Name: certificates certificates_owner_id_type_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_owner_id_type_year_key UNIQUE (owner_id, type, year);


--
-- Name: certificates certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_pkey PRIMARY KEY (id);


--
-- Name: class_passwords class_passwords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_passwords
    ADD CONSTRAINT class_passwords_pkey PRIMARY KEY (school_code, grade, section);


--
-- Name: class_weekly_topics class_weekly_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_weekly_topics
    ADD CONSTRAINT class_weekly_topics_pkey PRIMARY KEY (school_code, grade, section, week_id);


--
-- Name: comment_notifications comment_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_notifications
    ADD CONSTRAINT comment_notifications_pkey PRIMARY KEY (id);


--
-- Name: companion_videos companion_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companion_videos
    ADD CONSTRAINT companion_videos_pkey PRIMARY KEY (species);


--
-- Name: coordinator_assignments coordinator_assignments_coordinator_id_teacher_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coordinator_assignments
    ADD CONSTRAINT coordinator_assignments_coordinator_id_teacher_id_key UNIQUE (coordinator_id, teacher_id);


--
-- Name: coordinator_assignments coordinator_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coordinator_assignments
    ADD CONSTRAINT coordinator_assignments_pkey PRIMARY KEY (id);


--
-- Name: cosmetic_items cosmetic_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cosmetic_items
    ADD CONSTRAINT cosmetic_items_pkey PRIMARY KEY (id);


--
-- Name: course_feedback course_feedback_course_id_teacher_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_feedback
    ADD CONSTRAINT course_feedback_course_id_teacher_id_key UNIQUE (course_id, teacher_id);


--
-- Name: course_feedback course_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_feedback
    ADD CONSTRAINT course_feedback_pkey PRIMARY KEY (id);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: duel_daily_rewards duel_daily_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duel_daily_rewards
    ADD CONSTRAINT duel_daily_rewards_pkey PRIMARY KEY (student_id, day);


--
-- Name: duel_facts duel_facts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duel_facts
    ADD CONSTRAINT duel_facts_pkey PRIMARY KEY (game, duel_id);


--
-- Name: dynamic_kpis dynamic_kpis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dynamic_kpis
    ADD CONSTRAINT dynamic_kpis_pkey PRIMARY KEY (id);


--
-- Name: email_notifications_log email_notifications_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_notifications_log
    ADD CONSTRAINT email_notifications_log_pkey PRIMARY KEY (id);


--
-- Name: evaluation_scores evaluation_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_scores
    ADD CONSTRAINT evaluation_scores_pkey PRIMARY KEY (id);


--
-- Name: evaluations evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_pkey PRIMARY KEY (id);


--
-- Name: evaluations evaluations_project_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_project_id_unique UNIQUE (project_id);


--
-- Name: event_participants event_participants_event_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_event_id_user_id_key UNIQUE (event_id, user_id);


--
-- Name: event_participants event_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_pkey PRIMARY KEY (id);


--
-- Name: group_members group_members_group_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_student_id_key UNIQUE (group_id, student_id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: guardian_notifications guardian_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_notifications
    ADD CONSTRAINT guardian_notifications_pkey PRIMARY KEY (id);


--
-- Name: guardian_push_subscriptions guardian_push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_push_subscriptions
    ADD CONSTRAINT guardian_push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: guardian_push_subscriptions guardian_push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_push_subscriptions
    ADD CONSTRAINT guardian_push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: hangman_word_bank hangman_word_bank_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hangman_word_bank
    ADD CONSTRAINT hangman_word_bank_pkey PRIMARY KEY (id);


--
-- Name: kpi_task_completions kpi_task_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_task_completions
    ADD CONSTRAINT kpi_task_completions_pkey PRIMARY KEY (id);


--
-- Name: kpi_task_completions kpi_task_completions_task_id_teacher_id_period_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_task_completions
    ADD CONSTRAINT kpi_task_completions_task_id_teacher_id_period_month_key UNIQUE (task_id, teacher_id, period_month);


--
-- Name: kpi_tasks kpi_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_tasks
    ADD CONSTRAINT kpi_tasks_pkey PRIMARY KEY (id);


--
-- Name: league_weekly_points league_weekly_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.league_weekly_points
    ADD CONSTRAINT league_weekly_points_pkey PRIMARY KEY (student_id, week_id);


--
-- Name: lesson_completions lesson_completions_lesson_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_completions
    ADD CONSTRAINT lesson_completions_lesson_id_student_id_key UNIQUE (lesson_id, student_id);


--
-- Name: lesson_completions lesson_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_completions
    ADD CONSTRAINT lesson_completions_pkey PRIMARY KEY (id);


--
-- Name: lessons lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);


--
-- Name: likes likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_pkey PRIMARY KEY (id);


--
-- Name: likes likes_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_project_id_user_id_key UNIQUE (project_id, user_id);


--
-- Name: login_rate_limit login_rate_limit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_rate_limit
    ADD CONSTRAINT login_rate_limit_pkey PRIMARY KEY (ip);


--
-- Name: manual_kpi_entries manual_kpi_entries_kpi_id_teacher_id_period_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_kpi_entries
    ADD CONSTRAINT manual_kpi_entries_kpi_id_teacher_id_period_month_key UNIQUE (kpi_id, teacher_id, period_month);


--
-- Name: manual_kpi_entries manual_kpi_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_kpi_entries
    ADD CONSTRAINT manual_kpi_entries_pkey PRIMARY KEY (id);


--
-- Name: mascot_chat_messages mascot_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mascot_chat_messages
    ADD CONSTRAINT mascot_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: node_session_logs node_session_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_session_logs
    ADD CONSTRAINT node_session_logs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: payouts payouts_teacher_id_period_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_teacher_id_period_month_key UNIQUE (teacher_id, period_month);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: programs programs_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_name_key UNIQUE (name);


--
-- Name: programs programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programs
    ADD CONSTRAINT programs_pkey PRIMARY KEY (id);


--
-- Name: project_likes project_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_likes
    ADD CONSTRAINT project_likes_pkey PRIMARY KEY (id);


--
-- Name: project_likes project_likes_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_likes
    ADD CONSTRAINT project_likes_project_id_user_id_key UNIQUE (project_id, user_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: random_events random_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.random_events
    ADD CONSTRAINT random_events_pkey PRIMARY KEY (id);


--
-- Name: resource_comment_likes resource_comment_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_comment_likes
    ADD CONSTRAINT resource_comment_likes_pkey PRIMARY KEY (comment_id, user_id);


--
-- Name: resource_comments resource_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_comments
    ADD CONSTRAINT resource_comments_pkey PRIMARY KEY (id);


--
-- Name: resource_notes resource_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_notes
    ADD CONSTRAINT resource_notes_pkey PRIMARY KEY (id);


--
-- Name: school_nodes school_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_nodes
    ADD CONSTRAINT school_nodes_pkey PRIMARY KEY (id);


--
-- Name: school_nodes school_nodes_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_nodes
    ADD CONSTRAINT school_nodes_token_hash_key UNIQUE (token_hash);


--
-- Name: school_programs school_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_programs
    ADD CONSTRAINT school_programs_pkey PRIMARY KEY (school_id, program_id);


--
-- Name: schools schools_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_code_key UNIQUE (code);


--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (id);


--
-- Name: season_claims season_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_claims
    ADD CONSTRAINT season_claims_pkey PRIMARY KEY (student_id, season_id, level);


--
-- Name: seasonal_milestones seasonal_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasonal_milestones
    ADD CONSTRAINT seasonal_milestones_pkey PRIMARY KEY (id);


--
-- Name: seasonal_milestones seasonal_milestones_school_id_period_month_milestone_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasonal_milestones
    ADD CONSTRAINT seasonal_milestones_school_id_period_month_milestone_type_key UNIQUE (school_id, period_month, milestone_type);


--
-- Name: student_badges student_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_badges
    ADD CONSTRAINT student_badges_pkey PRIMARY KEY (id);


--
-- Name: student_badges student_badges_student_id_badge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_badges
    ADD CONSTRAINT student_badges_student_id_badge_id_key UNIQUE (student_id, badge_id);


--
-- Name: student_challenges student_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_challenges
    ADD CONSTRAINT student_challenges_pkey PRIMARY KEY (id);


--
-- Name: student_challenges student_challenges_student_id_challenge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_challenges
    ADD CONSTRAINT student_challenges_student_id_challenge_id_key UNIQUE (student_id, challenge_id);


--
-- Name: student_companions student_companions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_companions
    ADD CONSTRAINT student_companions_pkey PRIMARY KEY (student_id, species);


--
-- Name: student_cosmetics student_cosmetics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_cosmetics
    ADD CONSTRAINT student_cosmetics_pkey PRIMARY KEY (student_id, item_id);


--
-- Name: student_debug_duels student_debug_duels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_debug_duels
    ADD CONSTRAINT student_debug_duels_pkey PRIMARY KEY (id);


--
-- Name: student_debug_results student_debug_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_debug_results
    ADD CONSTRAINT student_debug_results_pkey PRIMARY KEY (duel_id, student_id);


--
-- Name: student_duel_answers student_duel_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_duel_answers
    ADD CONSTRAINT student_duel_answers_pkey PRIMARY KEY (duel_id, student_id);


--
-- Name: student_duels student_duels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_duels
    ADD CONSTRAINT student_duels_pkey PRIMARY KEY (id);


--
-- Name: student_gem_events student_gem_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_gem_events
    ADD CONSTRAINT student_gem_events_pkey PRIMARY KEY (id);


--
-- Name: student_guardians student_guardians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_guardians
    ADD CONSTRAINT student_guardians_pkey PRIMARY KEY (id);


--
-- Name: student_guardians student_guardians_portal_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_guardians
    ADD CONSTRAINT student_guardians_portal_token_key UNIQUE (portal_token);


--
-- Name: student_hangman_duels student_hangman_duels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hangman_duels
    ADD CONSTRAINT student_hangman_duels_pkey PRIMARY KEY (id);


--
-- Name: student_hangman_results student_hangman_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hangman_results
    ADD CONSTRAINT student_hangman_results_pkey PRIMARY KEY (duel_id, student_id);


--
-- Name: student_practice_sessions student_practice_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_practice_sessions
    ADD CONSTRAINT student_practice_sessions_pkey PRIMARY KEY (id);


--
-- Name: student_spelling_duels student_spelling_duels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_spelling_duels
    ADD CONSTRAINT student_spelling_duels_pkey PRIMARY KEY (id);


--
-- Name: student_spelling_results student_spelling_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_spelling_results
    ADD CONSTRAINT student_spelling_results_pkey PRIMARY KEY (duel_id, student_id);


--
-- Name: student_suggestions student_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_suggestions
    ADD CONSTRAINT student_suggestions_pkey PRIMARY KEY (id);


--
-- Name: student_timed_math_duels student_timed_math_duels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_timed_math_duels
    ADD CONSTRAINT student_timed_math_duels_pkey PRIMARY KEY (id);


--
-- Name: student_timed_math_results student_timed_math_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_timed_math_results
    ADD CONSTRAINT student_timed_math_results_pkey PRIMARY KEY (duel_id, student_id);


--
-- Name: students students_cui_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_cui_key UNIQUE (cui);


--
-- Name: students students_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_email_key UNIQUE (email);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: students students_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_username_key UNIQUE (username);


--
-- Name: survey_answers survey_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_answers
    ADD CONSTRAINT survey_answers_pkey PRIMARY KEY (id);


--
-- Name: survey_questions survey_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_questions
    ADD CONSTRAINT survey_questions_pkey PRIMARY KEY (id);


--
-- Name: survey_responses survey_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_pkey PRIMARY KEY (id);


--
-- Name: survey_responses survey_responses_survey_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_survey_id_user_id_key UNIQUE (survey_id, user_id);


--
-- Name: surveys surveys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.surveys
    ADD CONSTRAINT surveys_pkey PRIMARY KEY (id);


--
-- Name: system_config system_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_key_key UNIQUE (key);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (id);


--
-- Name: teacher_assignments teacher_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_pkey PRIMARY KEY (id);


--
-- Name: teacher_assignments teacher_assignments_teacher_id_school_code_grade_section_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_teacher_id_school_code_grade_section_key UNIQUE (teacher_id, school_code, grade, section);


--
-- Name: teacher_badges teacher_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_badges
    ADD CONSTRAINT teacher_badges_pkey PRIMARY KEY (id);


--
-- Name: teacher_badges teacher_badges_teacher_id_badge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_badges
    ADD CONSTRAINT teacher_badges_teacher_id_badge_id_key UNIQUE (teacher_id, badge_id);


--
-- Name: teacher_challenges teacher_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_challenges
    ADD CONSTRAINT teacher_challenges_pkey PRIMARY KEY (id);


--
-- Name: teacher_monthly_reports teacher_monthly_reports_unique_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_monthly_reports
    ADD CONSTRAINT teacher_monthly_reports_unique_period UNIQUE (teacher_id, month, year);


--
-- Name: teacher_notifications teacher_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_notifications
    ADD CONSTRAINT teacher_notifications_pkey PRIMARY KEY (id);


--
-- Name: teacher_ratings teacher_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_ratings
    ADD CONSTRAINT teacher_ratings_pkey PRIMARY KEY (id);


--
-- Name: teacher_ratings teacher_ratings_student_id_teacher_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_ratings
    ADD CONSTRAINT teacher_ratings_student_id_teacher_id_key UNIQUE (student_id, teacher_id);


--
-- Name: teacher_monthly_reports teacher_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_monthly_reports
    ADD CONSTRAINT teacher_reports_pkey PRIMARY KEY (id);


--
-- Name: teacher_rock_completions teacher_rock_completions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_rock_completions
    ADD CONSTRAINT teacher_rock_completions_pkey PRIMARY KEY (id);


--
-- Name: teacher_rock_completions teacher_rock_completions_teacher_id_rock_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_rock_completions
    ADD CONSTRAINT teacher_rock_completions_teacher_id_rock_id_key UNIQUE (teacher_id, rock_id);


--
-- Name: teacher_rocks teacher_rocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_rocks
    ADD CONSTRAINT teacher_rocks_pkey PRIMARY KEY (id);


--
-- Name: teachers teachers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_email_key UNIQUE (email);


--
-- Name: teachers teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_pkey PRIMARY KEY (id);


--
-- Name: tournament_match_answers tournament_match_answers_match_id_team_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_match_answers
    ADD CONSTRAINT tournament_match_answers_match_id_team_id_key UNIQUE (match_id, team_id);


--
-- Name: tournament_match_answers tournament_match_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_match_answers
    ADD CONSTRAINT tournament_match_answers_pkey PRIMARY KEY (id);


--
-- Name: tournament_matches tournament_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_pkey PRIMARY KEY (id);


--
-- Name: tournament_seasons tournament_seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_seasons
    ADD CONSTRAINT tournament_seasons_pkey PRIMARY KEY (id);


--
-- Name: tournament_team_members tournament_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_pkey PRIMARY KEY (id);


--
-- Name: tournament_team_members tournament_team_members_season_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_season_id_student_id_key UNIQUE (season_id, student_id);


--
-- Name: tournament_teams tournament_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_pkey PRIMARY KEY (id);


--
-- Name: tournament_teams tournament_teams_season_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_season_id_name_key UNIQUE (season_id, name);


--
-- Name: tutor_attendance tutor_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_attendance
    ADD CONSTRAINT tutor_attendance_pkey PRIMARY KEY (id);


--
-- Name: evaluations unique_project_evaluation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT unique_project_evaluation UNIQUE (project_id);


--
-- Name: attendance unique_student_attendance_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT unique_student_attendance_date UNIQUE (student_id, date);


--
-- Name: user_badges user_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);


--
-- Name: user_badges user_badges_user_id_badge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_badge_id_key UNIQUE (user_id, badge_id);


--
-- Name: votes votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_pkey PRIMARY KEY (id);


--
-- Name: votes votes_user_id_project_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_user_id_project_id_key UNIQUE (user_id, project_id);


--
-- Name: weekly_evidence weekly_evidence_one_per_week; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_evidence
    ADD CONSTRAINT weekly_evidence_one_per_week UNIQUE (teacher_id, iso_week);


--
-- Name: weekly_evidence weekly_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_evidence
    ADD CONSTRAINT weekly_evidence_pkey PRIMARY KEY (id);


--
-- Name: comment_notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comment_notifications_user_idx ON public.comment_notifications USING btree (user_id, read);


--
-- Name: guardian_notifications_guardian_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guardian_notifications_guardian_idx ON public.guardian_notifications USING btree (guardian_id, created_at DESC);


--
-- Name: guardian_notifications_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guardian_notifications_pending_idx ON public.guardian_notifications USING btree (created_by, status);


--
-- Name: hangman_word_bank_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hangman_word_bank_category_idx ON public.hangman_word_bank USING btree (category);


--
-- Name: idx_announcements_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_created ON public.announcements USING btree (created_at DESC);


--
-- Name: idx_assignments_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_school ON public.teacher_assignments USING btree (school_code);


--
-- Name: idx_assignments_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignments_teacher ON public.teacher_assignments USING btree (teacher_id);


--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_date ON public.attendance USING btree (date);


--
-- Name: idx_attendance_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_school ON public.attendance USING btree (school_code, grade, section);


--
-- Name: idx_attendance_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_student ON public.attendance USING btree (student_id);


--
-- Name: idx_attendance_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_teacher ON public.attendance USING btree (teacher_id);


--
-- Name: idx_completions_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_completions_teacher ON public.teacher_rock_completions USING btree (teacher_id);


--
-- Name: idx_email_notif_log_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_notif_log_user_type ON public.email_notifications_log USING btree (user_id, notification_type, sent_at DESC);


--
-- Name: idx_evaluations_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evaluations_project ON public.evaluations USING btree (project_id);


--
-- Name: idx_evaluations_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_evaluations_teacher ON public.evaluations USING btree (teacher_id);


--
-- Name: idx_league_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_league_group ON public.league_weekly_points USING btree (week_id, school_code, tier, xp DESC);


--
-- Name: idx_likes_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_likes_project ON public.likes USING btree (project_id);


--
-- Name: idx_likes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_likes_user ON public.likes USING btree (user_id);


--
-- Name: idx_mascot_chat_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mascot_chat_user ON public.mascot_chat_messages USING btree (user_id, created_at);


--
-- Name: idx_members_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_members_group ON public.group_members USING btree (group_id);


--
-- Name: idx_members_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_members_role ON public.group_members USING btree (role);


--
-- Name: idx_members_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_members_student ON public.group_members USING btree (student_id);


--
-- Name: idx_notifications_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_read ON public.teacher_notifications USING btree (is_read);


--
-- Name: idx_notifications_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_teacher ON public.teacher_notifications USING btree (teacher_id);


--
-- Name: idx_projects_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_group ON public.projects USING btree (group_id);


--
-- Name: idx_projects_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_user ON public.projects USING btree (user_id);


--
-- Name: idx_ratings_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ratings_student ON public.teacher_ratings USING btree (student_id);


--
-- Name: idx_ratings_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ratings_teacher ON public.teacher_ratings USING btree (teacher_id);


--
-- Name: idx_rocks_month_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rocks_month_year ON public.teacher_rocks USING btree (month, year);


--
-- Name: idx_rocks_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rocks_school ON public.teacher_rocks USING btree (school_code);


--
-- Name: idx_schools_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schools_code ON public.schools USING btree (code);


--
-- Name: idx_schools_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schools_department ON public.schools USING btree (department);


--
-- Name: idx_students_birthdate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_birthdate ON public.students USING btree (birth_date);


--
-- Name: idx_students_cui; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_cui ON public.students USING btree (cui);


--
-- Name: idx_students_gender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_gender ON public.students USING btree (gender);


--
-- Name: idx_students_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_school ON public.students USING btree (school_code);


--
-- Name: idx_students_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_username ON public.students USING btree (username);


--
-- Name: idx_suggestions_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suggestions_student ON public.student_suggestions USING btree (student_id);


--
-- Name: idx_suggestions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suggestions_type ON public.student_suggestions USING btree (type);


--
-- Name: idx_teacher_ratings_unique_weekly; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_teacher_ratings_unique_weekly ON public.teacher_ratings USING btree (student_id, teacher_id, public.get_week_start((created_at)::date));


--
-- Name: resource_comments_lesson_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resource_comments_lesson_group_idx ON public.resource_comments USING btree (lesson_id, group_id);


--
-- Name: student_gem_events_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_gem_events_student_idx ON public.student_gem_events USING btree (student_id, created_at DESC);


--
-- Name: student_guardians_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_guardians_student_idx ON public.student_guardians USING btree (student_id);


--
-- Name: student_practice_sessions_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX student_practice_sessions_student_idx ON public.student_practice_sessions USING btree (student_id, topic, created_at);


--
-- Name: students_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_status_idx ON public.students USING btree (status);


--
-- Name: tutor_attendance_client_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tutor_attendance_client_ref_idx ON public.tutor_attendance USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: resource_comment_likes resource_comment_likes_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER resource_comment_likes_notify AFTER INSERT ON public.resource_comment_likes FOR EACH ROW EXECUTE FUNCTION public.notify_comment_like();


--
-- Name: resource_comments resource_comments_notify_reply; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER resource_comments_notify_reply AFTER INSERT ON public.resource_comments FOR EACH ROW EXECUTE FUNCTION public.notify_comment_reply();


--
-- Name: resource_comments resource_comments_profanity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER resource_comments_profanity BEFORE INSERT OR UPDATE ON public.resource_comments FOR EACH ROW EXECUTE FUNCTION public.enforce_no_profanity();


--
-- Name: resource_notes resource_notes_profanity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER resource_notes_profanity BEFORE INSERT OR UPDATE ON public.resource_notes FOR EACH ROW EXECUTE FUNCTION public.enforce_no_profanity();


--
-- Name: lessons trg_check_lesson_content_url; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_lesson_content_url BEFORE INSERT OR UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.check_lesson_content_url();


--
-- Name: student_guardians trg_guard_guardian_consent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_guardian_consent BEFORE INSERT OR UPDATE ON public.student_guardians FOR EACH ROW EXECUTE FUNCTION public.guard_guardian_consent();


--
-- Name: student_debug_duels trg_guard_student_debug_duels; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_student_debug_duels BEFORE INSERT OR UPDATE ON public.student_debug_duels FOR EACH ROW EXECUTE FUNCTION public.guard_student_duel_write();


--
-- Name: student_duels trg_guard_student_duels; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_student_duels BEFORE INSERT OR UPDATE ON public.student_duels FOR EACH ROW EXECUTE FUNCTION public.guard_student_duel_write();


--
-- Name: student_hangman_duels trg_guard_student_hangman_duels; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_student_hangman_duels BEFORE INSERT OR UPDATE ON public.student_hangman_duels FOR EACH ROW EXECUTE FUNCTION public.guard_student_duel_write();


--
-- Name: student_spelling_duels trg_guard_student_spelling_duels; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_student_spelling_duels BEFORE INSERT OR UPDATE ON public.student_spelling_duels FOR EACH ROW EXECUTE FUNCTION public.guard_student_duel_write();


--
-- Name: student_timed_math_duels trg_guard_student_timed_math_duels; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_student_timed_math_duels BEFORE INSERT OR UPDATE ON public.student_timed_math_duels FOR EACH ROW EXECUTE FUNCTION public.guard_student_duel_write();


--
-- Name: students trg_log_gem_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_gem_change AFTER UPDATE OF gems ON public.students FOR EACH ROW WHEN ((new.gems IS DISTINCT FROM old.gems)) EXECUTE FUNCTION public.log_gem_change();


--
-- Name: students trg_protect_student_privileged; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_student_privileged BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.protect_student_privileged_fields();


--
-- Name: teachers trg_protect_teacher_privileged; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_teacher_privileged BEFORE INSERT OR UPDATE ON public.teachers FOR EACH ROW EXECUTE FUNCTION public.protect_teacher_privileged_fields();


--
-- Name: student_debug_results trg_settle_student_debug_duel; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_settle_student_debug_duel AFTER INSERT ON public.student_debug_results FOR EACH ROW EXECUTE FUNCTION public.settle_student_debug_duel();


--
-- Name: student_duel_answers trg_settle_student_duel; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_settle_student_duel AFTER INSERT ON public.student_duel_answers FOR EACH ROW EXECUTE FUNCTION public.settle_student_duel();


--
-- Name: student_hangman_results trg_settle_student_hangman_duel; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_settle_student_hangman_duel AFTER INSERT ON public.student_hangman_results FOR EACH ROW EXECUTE FUNCTION public.settle_student_hangman_duel();


--
-- Name: student_spelling_results trg_settle_student_spelling_duel; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_settle_student_spelling_duel AFTER INSERT ON public.student_spelling_results FOR EACH ROW EXECUTE FUNCTION public.settle_student_spelling_duel();


--
-- Name: student_timed_math_results trg_settle_student_timed_math_duel; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_settle_student_timed_math_duel AFTER INSERT ON public.student_timed_math_results FOR EACH ROW EXECUTE FUNCTION public.settle_student_timed_math_duel();


--
-- Name: tournament_match_answers trg_settle_tournament_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_settle_tournament_match AFTER INSERT ON public.tournament_match_answers FOR EACH ROW EXECUTE FUNCTION public.settle_tournament_match();


--
-- Name: students trg_track_gems_earned; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_track_gems_earned BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.track_gems_earned();


--
-- Name: students trg_track_league_xp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_track_league_xp BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.track_league_xp();


--
-- Name: students trg_track_season_xp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_track_season_xp BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.track_season_xp();


--
-- Name: attendance_waivers update_attendance_waivers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_attendance_waivers_updated_at BEFORE UPDATE ON public.attendance_waivers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_code_evaluations ai_code_evaluations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_code_evaluations
    ADD CONSTRAINT ai_code_evaluations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: ai_code_evaluations ai_code_evaluations_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_code_evaluations
    ADD CONSTRAINT ai_code_evaluations_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: ai_evaluations ai_evaluations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_evaluations
    ADD CONSTRAINT ai_evaluations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: announcement_reads announcement_reads_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--
-- Name: asset_audits asset_audits_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_audits
    ADD CONSTRAINT asset_audits_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: asset_audits asset_audits_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_audits
    ADD CONSTRAINT asset_audits_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.teachers(id);


--
-- Name: attendance_reports attendance_reports_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_reports
    ADD CONSTRAINT attendance_reports_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id);


--
-- Name: attendance attendance_school_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_school_code_fkey FOREIGN KEY (school_code) REFERENCES public.schools(code);


--
-- Name: attendance attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: class_weekly_topics class_weekly_topics_set_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_weekly_topics
    ADD CONSTRAINT class_weekly_topics_set_by_fkey FOREIGN KEY (set_by) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: comment_notifications comment_notifications_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_notifications
    ADD CONSTRAINT comment_notifications_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.resource_comments(id) ON DELETE CASCADE;


--
-- Name: comment_notifications comment_notifications_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_notifications
    ADD CONSTRAINT comment_notifications_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: coordinator_assignments coordinator_assignments_coordinator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coordinator_assignments
    ADD CONSTRAINT coordinator_assignments_coordinator_id_fkey FOREIGN KEY (coordinator_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: coordinator_assignments coordinator_assignments_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coordinator_assignments
    ADD CONSTRAINT coordinator_assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: course_feedback course_feedback_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_feedback
    ADD CONSTRAINT course_feedback_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: course_feedback course_feedback_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_feedback
    ADD CONSTRAINT course_feedback_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: courses courses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.teachers(id);


--
-- Name: courses courses_school_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_school_code_fkey FOREIGN KEY (school_code) REFERENCES public.schools(code);


--
-- Name: evaluations evaluations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: evaluations evaluations_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluations
    ADD CONSTRAINT evaluations_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_participants event_participants_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.random_events(id) ON DELETE CASCADE;


--
-- Name: attendance fk_attendance_student; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: attendance fk_attendance_teacher; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT fk_attendance_teacher FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: attendance_waivers fk_waivers_school; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_waivers
    ADD CONSTRAINT fk_waivers_school FOREIGN KEY (school_code) REFERENCES public.schools(code);


--
-- Name: attendance_waivers fk_waivers_teacher; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_waivers
    ADD CONSTRAINT fk_waivers_teacher FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: groups groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.teachers(id);


--
-- Name: groups groups_school_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_school_code_fkey FOREIGN KEY (school_code) REFERENCES public.schools(code);


--
-- Name: guardian_notifications guardian_notifications_guardian_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_notifications
    ADD CONSTRAINT guardian_notifications_guardian_id_fkey FOREIGN KEY (guardian_id) REFERENCES public.student_guardians(id) ON DELETE CASCADE;


--
-- Name: guardian_push_subscriptions guardian_push_subscriptions_guardian_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardian_push_subscriptions
    ADD CONSTRAINT guardian_push_subscriptions_guardian_id_fkey FOREIGN KEY (guardian_id) REFERENCES public.student_guardians(id) ON DELETE CASCADE;


--
-- Name: kpi_task_completions kpi_task_completions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_task_completions
    ADD CONSTRAINT kpi_task_completions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.kpi_tasks(id) ON DELETE CASCADE;


--
-- Name: kpi_task_completions kpi_task_completions_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_task_completions
    ADD CONSTRAINT kpi_task_completions_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: kpi_tasks kpi_tasks_kpi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_tasks
    ADD CONSTRAINT kpi_tasks_kpi_id_fkey FOREIGN KEY (kpi_id) REFERENCES public.dynamic_kpis(id) ON DELETE CASCADE;


--
-- Name: kpi_tasks kpi_tasks_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kpi_tasks
    ADD CONSTRAINT kpi_tasks_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: league_weekly_points league_weekly_points_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.league_weekly_points
    ADD CONSTRAINT league_weekly_points_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: lesson_completions lesson_completions_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_completions
    ADD CONSTRAINT lesson_completions_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: lesson_completions lesson_completions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_completions
    ADD CONSTRAINT lesson_completions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: lessons lessons_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: lessons lessons_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.teachers(id);


--
-- Name: lessons lessons_school_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_school_code_fkey FOREIGN KEY (school_code) REFERENCES public.schools(code);


--
-- Name: likes likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: manual_kpi_entries manual_kpi_entries_kpi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_kpi_entries
    ADD CONSTRAINT manual_kpi_entries_kpi_id_fkey FOREIGN KEY (kpi_id) REFERENCES public.dynamic_kpis(id);


--
-- Name: manual_kpi_entries manual_kpi_entries_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_kpi_entries
    ADD CONSTRAINT manual_kpi_entries_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: node_session_logs node_session_logs_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_session_logs
    ADD CONSTRAINT node_session_logs_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.school_nodes(id) ON DELETE SET NULL;


--
-- Name: node_session_logs node_session_logs_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_session_logs
    ADD CONSTRAINT node_session_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payouts payouts_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: project_likes project_likes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_likes
    ADD CONSTRAINT project_likes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_likes project_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_likes
    ADD CONSTRAINT project_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: projects projects_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- Name: projects projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.students(id);


--
-- Name: resource_comment_likes resource_comment_likes_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_comment_likes
    ADD CONSTRAINT resource_comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.resource_comments(id) ON DELETE CASCADE;


--
-- Name: resource_comments resource_comments_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_comments
    ADD CONSTRAINT resource_comments_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: resource_comments resource_comments_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_comments
    ADD CONSTRAINT resource_comments_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: resource_comments resource_comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_comments
    ADD CONSTRAINT resource_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.resource_comments(id) ON DELETE CASCADE;


--
-- Name: resource_notes resource_notes_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_notes
    ADD CONSTRAINT resource_notes_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;


--
-- Name: resource_notes resource_notes_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_notes
    ADD CONSTRAINT resource_notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: school_nodes school_nodes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_nodes
    ADD CONSTRAINT school_nodes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.teachers(id) ON DELETE SET NULL;


--
-- Name: school_programs school_programs_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_programs
    ADD CONSTRAINT school_programs_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;


--
-- Name: school_programs school_programs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_programs
    ADD CONSTRAINT school_programs_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: season_claims season_claims_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_claims
    ADD CONSTRAINT season_claims_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: seasonal_milestones seasonal_milestones_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasonal_milestones
    ADD CONSTRAINT seasonal_milestones_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: seasonal_milestones seasonal_milestones_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasonal_milestones
    ADD CONSTRAINT seasonal_milestones_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.teachers(id);


--
-- Name: student_badges student_badges_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_badges
    ADD CONSTRAINT student_badges_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_challenges student_challenges_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_challenges
    ADD CONSTRAINT student_challenges_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_companions student_companions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_companions
    ADD CONSTRAINT student_companions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_cosmetics student_cosmetics_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_cosmetics
    ADD CONSTRAINT student_cosmetics_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.cosmetic_items(id) ON DELETE CASCADE;


--
-- Name: student_cosmetics student_cosmetics_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_cosmetics
    ADD CONSTRAINT student_cosmetics_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_debug_duels student_debug_duels_challenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_debug_duels
    ADD CONSTRAINT student_debug_duels_challenger_id_fkey FOREIGN KEY (challenger_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_debug_duels student_debug_duels_opponent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_debug_duels
    ADD CONSTRAINT student_debug_duels_opponent_id_fkey FOREIGN KEY (opponent_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_debug_duels student_debug_duels_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_debug_duels
    ADD CONSTRAINT student_debug_duels_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.students(id);


--
-- Name: student_debug_results student_debug_results_duel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_debug_results
    ADD CONSTRAINT student_debug_results_duel_id_fkey FOREIGN KEY (duel_id) REFERENCES public.student_debug_duels(id) ON DELETE CASCADE;


--
-- Name: student_debug_results student_debug_results_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_debug_results
    ADD CONSTRAINT student_debug_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_duel_answers student_duel_answers_duel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_duel_answers
    ADD CONSTRAINT student_duel_answers_duel_id_fkey FOREIGN KEY (duel_id) REFERENCES public.student_duels(id) ON DELETE CASCADE;


--
-- Name: student_duel_answers student_duel_answers_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_duel_answers
    ADD CONSTRAINT student_duel_answers_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_duels student_duels_challenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_duels
    ADD CONSTRAINT student_duels_challenger_id_fkey FOREIGN KEY (challenger_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_duels student_duels_opponent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_duels
    ADD CONSTRAINT student_duels_opponent_id_fkey FOREIGN KEY (opponent_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_duels student_duels_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_duels
    ADD CONSTRAINT student_duels_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.students(id);


--
-- Name: student_guardians student_guardians_consent_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_guardians
    ADD CONSTRAINT student_guardians_consent_recorded_by_fkey FOREIGN KEY (consent_recorded_by) REFERENCES public.teachers(id);


--
-- Name: student_guardians student_guardians_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_guardians
    ADD CONSTRAINT student_guardians_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_hangman_duels student_hangman_duels_challenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hangman_duels
    ADD CONSTRAINT student_hangman_duels_challenger_id_fkey FOREIGN KEY (challenger_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_hangman_duels student_hangman_duels_opponent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hangman_duels
    ADD CONSTRAINT student_hangman_duels_opponent_id_fkey FOREIGN KEY (opponent_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_hangman_duels student_hangman_duels_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hangman_duels
    ADD CONSTRAINT student_hangman_duels_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.students(id);


--
-- Name: student_hangman_results student_hangman_results_duel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hangman_results
    ADD CONSTRAINT student_hangman_results_duel_id_fkey FOREIGN KEY (duel_id) REFERENCES public.student_hangman_duels(id) ON DELETE CASCADE;


--
-- Name: student_hangman_results student_hangman_results_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_hangman_results
    ADD CONSTRAINT student_hangman_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_practice_sessions student_practice_sessions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_practice_sessions
    ADD CONSTRAINT student_practice_sessions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_spelling_duels student_spelling_duels_challenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_spelling_duels
    ADD CONSTRAINT student_spelling_duels_challenger_id_fkey FOREIGN KEY (challenger_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_spelling_duels student_spelling_duels_opponent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_spelling_duels
    ADD CONSTRAINT student_spelling_duels_opponent_id_fkey FOREIGN KEY (opponent_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_spelling_duels student_spelling_duels_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_spelling_duels
    ADD CONSTRAINT student_spelling_duels_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.students(id);


--
-- Name: student_spelling_results student_spelling_results_duel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_spelling_results
    ADD CONSTRAINT student_spelling_results_duel_id_fkey FOREIGN KEY (duel_id) REFERENCES public.student_spelling_duels(id) ON DELETE CASCADE;


--
-- Name: student_spelling_results student_spelling_results_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_spelling_results
    ADD CONSTRAINT student_spelling_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_suggestions student_suggestions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_suggestions
    ADD CONSTRAINT student_suggestions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_timed_math_duels student_timed_math_duels_challenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_timed_math_duels
    ADD CONSTRAINT student_timed_math_duels_challenger_id_fkey FOREIGN KEY (challenger_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_timed_math_duels student_timed_math_duels_opponent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_timed_math_duels
    ADD CONSTRAINT student_timed_math_duels_opponent_id_fkey FOREIGN KEY (opponent_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_timed_math_duels student_timed_math_duels_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_timed_math_duels
    ADD CONSTRAINT student_timed_math_duels_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.students(id);


--
-- Name: student_timed_math_results student_timed_math_results_duel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_timed_math_results
    ADD CONSTRAINT student_timed_math_results_duel_id_fkey FOREIGN KEY (duel_id) REFERENCES public.student_timed_math_duels(id) ON DELETE CASCADE;


--
-- Name: student_timed_math_results student_timed_math_results_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_timed_math_results
    ADD CONSTRAINT student_timed_math_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: students students_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: students students_school_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_school_code_fkey FOREIGN KEY (school_code) REFERENCES public.schools(code);


--
-- Name: survey_answers survey_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_answers
    ADD CONSTRAINT survey_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.survey_questions(id) ON DELETE CASCADE;


--
-- Name: survey_answers survey_answers_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_answers
    ADD CONSTRAINT survey_answers_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.survey_responses(id) ON DELETE CASCADE;


--
-- Name: survey_questions survey_questions_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_questions
    ADD CONSTRAINT survey_questions_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE CASCADE;


--
-- Name: survey_responses survey_responses_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_responses
    ADD CONSTRAINT survey_responses_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.surveys(id) ON DELETE CASCADE;


--
-- Name: teacher_assignments teacher_assignments_school_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_school_code_fkey FOREIGN KEY (school_code) REFERENCES public.schools(code);


--
-- Name: teacher_assignments teacher_assignments_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: teacher_badges teacher_badges_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_badges
    ADD CONSTRAINT teacher_badges_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: teacher_monthly_reports teacher_monthly_reports_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_monthly_reports
    ADD CONSTRAINT teacher_monthly_reports_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: teacher_notifications teacher_notifications_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_notifications
    ADD CONSTRAINT teacher_notifications_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: teacher_notifications teacher_notifications_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_notifications
    ADD CONSTRAINT teacher_notifications_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: teacher_ratings teacher_ratings_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_ratings
    ADD CONSTRAINT teacher_ratings_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- Name: teacher_ratings teacher_ratings_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_ratings
    ADD CONSTRAINT teacher_ratings_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- Name: teacher_rock_completions teacher_rock_completions_rock_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_rock_completions
    ADD CONSTRAINT teacher_rock_completions_rock_id_fkey FOREIGN KEY (rock_id) REFERENCES public.teacher_rocks(id) ON DELETE CASCADE;


--
-- Name: teacher_rock_completions teacher_rock_completions_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_rock_completions
    ADD CONSTRAINT teacher_rock_completions_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;


--
-- Name: teachers teachers_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tournament_match_answers tournament_match_answers_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_match_answers
    ADD CONSTRAINT tournament_match_answers_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.tournament_matches(id) ON DELETE CASCADE;


--
-- Name: tournament_match_answers tournament_match_answers_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_match_answers
    ADD CONSTRAINT tournament_match_answers_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.students(id);


--
-- Name: tournament_match_answers tournament_match_answers_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_match_answers
    ADD CONSTRAINT tournament_match_answers_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.tournament_teams(id) ON DELETE CASCADE;


--
-- Name: tournament_matches tournament_matches_challenger_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_challenger_team_id_fkey FOREIGN KEY (challenger_team_id) REFERENCES public.tournament_teams(id);


--
-- Name: tournament_matches tournament_matches_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.tournament_seasons(id) ON DELETE CASCADE;


--
-- Name: tournament_matches tournament_matches_team_a_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_team_a_id_fkey FOREIGN KEY (team_a_id) REFERENCES public.tournament_teams(id) ON DELETE CASCADE;


--
-- Name: tournament_matches tournament_matches_team_b_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_team_b_id_fkey FOREIGN KEY (team_b_id) REFERENCES public.tournament_teams(id) ON DELETE CASCADE;


--
-- Name: tournament_matches tournament_matches_winner_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_matches
    ADD CONSTRAINT tournament_matches_winner_team_id_fkey FOREIGN KEY (winner_team_id) REFERENCES public.tournament_teams(id);


--
-- Name: tournament_team_members tournament_team_members_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.tournament_seasons(id) ON DELETE CASCADE;


--
-- Name: tournament_team_members tournament_team_members_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: tournament_team_members tournament_team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_team_members
    ADD CONSTRAINT tournament_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.tournament_teams(id) ON DELETE CASCADE;


--
-- Name: tournament_teams tournament_teams_captain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_captain_id_fkey FOREIGN KEY (captain_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: tournament_teams tournament_teams_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournament_teams
    ADD CONSTRAINT tournament_teams_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.tournament_seasons(id) ON DELETE CASCADE;


--
-- Name: tutor_attendance tutor_attendance_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_attendance
    ADD CONSTRAINT tutor_attendance_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: tutor_attendance tutor_attendance_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_attendance
    ADD CONSTRAINT tutor_attendance_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.teachers(id);


--
-- Name: user_badges user_badges_badge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badges(id) ON DELETE CASCADE;


--
-- Name: user_badges user_badges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: votes votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: attendance_reports Admin view all reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin view all reports" ON public.attendance_reports FOR SELECT TO authenticated USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));


--
-- Name: attendance Admins can delete attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete attendance" ON public.attendance FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text)))));


--
-- Name: attendance Admins can manage attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage attendance" ON public.attendance USING ((EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text)))));


--
-- Name: system_config Admins can manage config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage config" ON public.system_config USING ((EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text)))));


--
-- Name: attendance Admins can update attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update attendance" ON public.attendance FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text)))));


--
-- Name: attendance Admins can view all attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all attendance" ON public.attendance FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text)))));


--
-- Name: dynamic_kpis Admins gestionan KPIs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gestionan KPIs" ON public.dynamic_kpis USING ((EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text)))));


--
-- Name: asset_audits Admins gestionan auditorías; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gestionan auditorías" ON public.asset_audits USING ((EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text)))));


--
-- Name: teacher_rock_completions Admins gestionan completitudes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gestionan completitudes" ON public.teacher_rock_completions USING ((auth.uid() IN ( SELECT teachers.id
   FROM public.teachers
  WHERE ((teachers.role)::text = 'admin'::text))));


--
-- Name: manual_kpi_entries Admins gestionan entradas manuales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gestionan entradas manuales" ON public.manual_kpi_entries USING ((EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text)))));


--
-- Name: seasonal_milestones Admins gestionan hitos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gestionan hitos" ON public.seasonal_milestones USING ((EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text)))));


--
-- Name: payouts Admins gestionan pagos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gestionan pagos" ON public.payouts USING ((EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text)))));


--
-- Name: teacher_rocks Admins gestionan rocas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gestionan rocas" ON public.teacher_rocks USING ((auth.uid() IN ( SELECT teachers.id
   FROM public.teachers
  WHERE ((teachers.role)::text = 'admin'::text))));


--
-- Name: kpi_tasks Admins gestionan tareas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gestionan tareas" ON public.kpi_tasks USING ((EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text)))));


--
-- Name: notifications Anyone can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: badges Anyone can view badges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view badges" ON public.badges FOR SELECT USING (true);


--
-- Name: evaluation_scores Anyone can view scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view scores" ON public.evaluation_scores FOR SELECT USING (true);


--
-- Name: user_badges Anyone can view user badges; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view user badges" ON public.user_badges FOR SELECT USING (true);


--
-- Name: votes Anyone can view votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view votes" ON public.votes FOR SELECT USING (true);


--
-- Name: teacher_rock_completions Docentes actualizan completitudes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Docentes actualizan completitudes" ON public.teacher_rock_completions FOR UPDATE USING ((teacher_id = auth.uid()));


--
-- Name: teacher_rock_completions Docentes insertan completitudes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Docentes insertan completitudes" ON public.teacher_rock_completions FOR INSERT WITH CHECK ((teacher_id = auth.uid()));


--
-- Name: attendance_waivers Docentes pueden crear solicitudes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Docentes pueden crear solicitudes" ON public.attendance_waivers FOR INSERT WITH CHECK ((auth.uid() = teacher_id));


--
-- Name: teacher_badges Docentes pueden ver sus propias insignias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Docentes pueden ver sus propias insignias" ON public.teacher_badges FOR SELECT USING ((auth.uid() = teacher_id));


--
-- Name: teacher_rocks Docentes ven rocas aplicables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Docentes ven rocas aplicables" ON public.teacher_rocks FOR SELECT USING ((is_active = true));


--
-- Name: teacher_rock_completions Docentes ven sus completitudes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Docentes ven sus completitudes" ON public.teacher_rock_completions FOR SELECT USING ((teacher_id = auth.uid()));


--
-- Name: manual_kpi_entries Docentes ven sus entradas manuales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Docentes ven sus entradas manuales" ON public.manual_kpi_entries FOR SELECT USING (((auth.uid() = teacher_id) OR (EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text))))));


--
-- Name: teacher_badges Docentes ven sus insignias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Docentes ven sus insignias" ON public.teacher_badges FOR SELECT USING ((auth.uid() = teacher_id));


--
-- Name: evaluations Estudiantes pueden ver detalles de sus evaluaciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Estudiantes pueden ver detalles de sus evaluaciones" ON public.evaluations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.projects p
  WHERE ((p.id = evaluations.project_id) AND ((p.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.group_members gm
          WHERE ((gm.group_id = p.group_id) AND (gm.student_id = auth.uid())))))))));


--
-- Name: system_config Everyone can view config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Everyone can view config" ON public.system_config FOR SELECT USING (true);


--
-- Name: teacher_badges Inserción de insignias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Inserción de insignias" ON public.teacher_badges FOR INSERT WITH CHECK (true);


--
-- Name: certificates Lectura propia de certificados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura propia de certificados" ON public.certificates FOR SELECT USING (((auth.uid() = owner_id) OR (EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text))))));


--
-- Name: dynamic_kpis Lectura pública de KPIs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura pública de KPIs" ON public.dynamic_kpis FOR SELECT USING (true);


--
-- Name: seasonal_milestones Lectura pública de hitos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura pública de hitos" ON public.seasonal_milestones FOR SELECT USING (true);


--
-- Name: kpi_tasks Lectura pública de tareas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura pública de tareas" ON public.kpi_tasks FOR SELECT USING (true);


--
-- Name: project_likes Likes públicos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Likes públicos" ON public.project_likes FOR SELECT USING (true);


--
-- Name: active_time_tracking Permitir gestión a dueños; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir gestión a dueños" ON public.active_time_tracking USING ((auth.uid() = user_id));


--
-- Name: teacher_challenges Permitir inserción a docentes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir inserción a docentes" ON public.teacher_challenges FOR INSERT WITH CHECK ((auth.uid() = teacher_id));


--
-- Name: teacher_monthly_reports Permitir inserción a docentes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir inserción a docentes" ON public.teacher_monthly_reports FOR INSERT WITH CHECK ((auth.uid() = teacher_id));


--
-- Name: weekly_evidence Permitir inserción a docentes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir inserción a docentes" ON public.weekly_evidence FOR INSERT WITH CHECK ((auth.uid() = teacher_id));


--
-- Name: active_time_tracking Permitir lectura a admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir lectura a admins" ON public.active_time_tracking FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text)))));


--
-- Name: teacher_challenges Permitir lectura a dueños y admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir lectura a dueños y admins" ON public.teacher_challenges FOR SELECT USING (((auth.uid() = teacher_id) OR (EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text))))));


--
-- Name: teacher_monthly_reports Permitir lectura a dueños y admins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir lectura a dueños y admins" ON public.teacher_monthly_reports FOR SELECT USING (((auth.uid() = teacher_id) OR (EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text))))));


--
-- Name: weekly_evidence Permitir lectura a todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir lectura a todos" ON public.weekly_evidence FOR SELECT USING (true);


--
-- Name: teacher_badges Sistema puede otorgar insignias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sistema puede otorgar insignias" ON public.teacher_badges FOR INSERT WITH CHECK (true);


--
-- Name: attendance Teachers can insert attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can insert attendance" ON public.attendance FOR INSERT WITH CHECK ((auth.uid() = teacher_id));


--
-- Name: attendance_reports Teachers can insert reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can insert reports" ON public.attendance_reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = teacher_id));


--
-- Name: attendance Teachers can view their attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view their attendance" ON public.attendance FOR SELECT USING ((auth.uid() = teacher_id));


--
-- Name: likes Todos pueden ver likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Todos pueden ver likes" ON public.likes FOR SELECT USING (true);


--
-- Name: kpi_task_completions Tutores gestionan sus completaciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tutores gestionan sus completaciones" ON public.kpi_task_completions USING (((auth.uid() = teacher_id) OR (EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text))))));


--
-- Name: tutor_attendance Tutores insertan su asistencia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tutores insertan su asistencia" ON public.tutor_attendance FOR INSERT WITH CHECK ((auth.uid() = tutor_id));


--
-- Name: asset_audits Tutores suben auditorías; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tutores suben auditorías" ON public.asset_audits FOR INSERT WITH CHECK ((auth.uid() = tutor_id));


--
-- Name: tutor_attendance Tutores ven su propia asistencia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tutores ven su propia asistencia" ON public.tutor_attendance FOR SELECT USING (((auth.uid() = tutor_id) OR (EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text))))));


--
-- Name: payouts Tutores ven sus pagos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tutores ven sus pagos" ON public.payouts FOR SELECT USING (((auth.uid() = teacher_id) OR (EXISTS ( SELECT 1
   FROM public.teachers
  WHERE ((teachers.id = auth.uid()) AND ((teachers.role)::text = 'admin'::text))))));


--
-- Name: votes Users can insert own votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own votes" ON public.votes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: project_likes Usuarios autenticados dan like; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios autenticados dan like" ON public.project_likes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: likes Usuarios pueden dar like; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden dar like" ON public.likes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: likes Usuarios pueden quitar su like; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden quitar su like" ON public.likes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: project_likes Usuarios remueven su like; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios remueven su like" ON public.project_likes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: active_time_tracking; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.active_time_tracking ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_code_evaluations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_code_evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_code_evaluations ai_code_evaluations_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_code_evaluations_insert_staff ON public.ai_code_evaluations FOR INSERT WITH CHECK ((public.is_staff() AND (auth.uid() = teacher_id)));


--
-- Name: ai_code_evaluations ai_code_evaluations_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_code_evaluations_select_staff ON public.ai_code_evaluations FOR SELECT USING (public.is_staff());


--
-- Name: ai_evaluations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_evaluations ai_evaluations_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_evaluations_select_staff ON public.ai_evaluations FOR SELECT TO authenticated USING (public.is_staff());


--
-- Name: ai_evaluations ai_evaluations_write_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_evaluations_write_service_role ON public.ai_evaluations TO service_role USING (true) WITH CHECK (true);


--
-- Name: announcement_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: announcement_reads announcement_reads_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcement_reads_own ON public.announcement_reads USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements announcements_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_delete ON public.announcements FOR DELETE TO authenticated USING ((public.is_admin() OR (sender_id = auth.uid())));


--
-- Name: announcements announcements_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_insert ON public.announcements FOR INSERT TO authenticated WITH CHECK (public.can_send_announcement(audience, school_code, grade, section, target_schools, target_groups, sender_id));


--
-- Name: announcements announcements_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcements_select ON public.announcements FOR SELECT TO authenticated USING (public.can_see_announcement(audience, school_code, grade, section, target_schools, target_groups, sender_id));


--
-- Name: asset_audits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset_audits ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance attendance_select_coordinator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_select_coordinator ON public.attendance FOR SELECT USING (public.is_coordinator_of(teacher_id));


--
-- Name: attendance_waivers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_waivers ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_waivers attendance_waivers_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_waivers_admin_all ON public.attendance_waivers USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: attendance_waivers attendance_waivers_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_waivers_select_own_or_admin ON public.attendance_waivers FOR SELECT USING (((auth.uid() = teacher_id) OR public.is_admin()));


--
-- Name: badges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

--
-- Name: certificates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

--
-- Name: class_passwords; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_passwords ENABLE ROW LEVEL SECURITY;

--
-- Name: class_passwords class_passwords_staff_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_passwords_staff_only ON public.class_passwords USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: class_weekly_topics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.class_weekly_topics ENABLE ROW LEVEL SECURITY;

--
-- Name: class_weekly_topics class_weekly_topics_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY class_weekly_topics_select_all ON public.class_weekly_topics FOR SELECT USING (true);


--
-- Name: comment_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comment_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: comment_notifications comment_notifications_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comment_notifications_delete_own ON public.comment_notifications FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: comment_notifications comment_notifications_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comment_notifications_select_own ON public.comment_notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: comment_notifications comment_notifications_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comment_notifications_update_own ON public.comment_notifications FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: companion_videos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companion_videos ENABLE ROW LEVEL SECURITY;

--
-- Name: companion_videos companion_videos_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companion_videos_admin ON public.companion_videos TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: companion_videos companion_videos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companion_videos_select ON public.companion_videos FOR SELECT TO authenticated USING (true);


--
-- Name: coordinator_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coordinator_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: coordinator_assignments coordinator_assignments_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coordinator_assignments_select_own_or_admin ON public.coordinator_assignments FOR SELECT USING (((auth.uid() = coordinator_id) OR public.is_admin()));


--
-- Name: coordinator_assignments coordinator_assignments_write_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coordinator_assignments_write_admin_only ON public.coordinator_assignments USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: cosmetic_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cosmetic_items ENABLE ROW LEVEL SECURITY;

--
-- Name: cosmetic_items cosmetic_items_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cosmetic_items_select_all ON public.cosmetic_items FOR SELECT USING (true);


--
-- Name: course_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.course_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: course_feedback course_feedback_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY course_feedback_delete ON public.course_feedback FOR DELETE USING (((auth.uid() = teacher_id) OR public.is_staff()));


--
-- Name: course_feedback course_feedback_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY course_feedback_insert ON public.course_feedback FOR INSERT WITH CHECK (((auth.uid() = teacher_id) AND (EXISTS ( SELECT 1
   FROM public.courses c
  WHERE ((c.id = course_feedback.course_id) AND (c.is_shared = true) AND (c.created_by <> auth.uid()))))));


--
-- Name: course_feedback course_feedback_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY course_feedback_select ON public.course_feedback FOR SELECT USING (((auth.uid() = teacher_id) OR public.is_staff() OR (auth.uid() = ( SELECT courses.created_by
   FROM public.courses
  WHERE (courses.id = course_feedback.course_id)))));


--
-- Name: course_feedback course_feedback_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY course_feedback_update ON public.course_feedback FOR UPDATE USING ((auth.uid() = teacher_id)) WITH CHECK ((auth.uid() = teacher_id));


--
-- Name: courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

--
-- Name: courses courses_delete_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courses_delete_own_or_admin ON public.courses FOR DELETE USING (((created_by = auth.uid()) OR public.is_admin()));


--
-- Name: courses courses_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courses_insert_staff ON public.courses FOR INSERT WITH CHECK ((public.is_staff() AND (created_by = auth.uid())));


--
-- Name: courses courses_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courses_select_authenticated ON public.courses FOR SELECT TO authenticated USING (true);


--
-- Name: courses courses_update_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courses_update_own_or_admin ON public.courses FOR UPDATE USING (((created_by = auth.uid()) OR public.is_admin()));


--
-- Name: duel_daily_rewards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.duel_daily_rewards ENABLE ROW LEVEL SECURITY;

--
-- Name: duel_facts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.duel_facts ENABLE ROW LEVEL SECURITY;

--
-- Name: dynamic_kpis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dynamic_kpis ENABLE ROW LEVEL SECURITY;

--
-- Name: email_notifications_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_notifications_log ENABLE ROW LEVEL SECURITY;

--
-- Name: evaluation_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evaluation_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: evaluations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: evaluations evaluations_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY evaluations_select_authenticated ON public.evaluations FOR SELECT TO authenticated USING (true);


--
-- Name: evaluations evaluations_write_assigned_teacher_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY evaluations_write_assigned_teacher_or_admin ON public.evaluations USING ((public.is_admin() OR ((auth.uid() = teacher_id) AND public.is_assigned_teacher_for_project(project_id)))) WITH CHECK ((public.is_admin() OR ((auth.uid() = teacher_id) AND public.is_assigned_teacher_for_project(project_id))));


--
-- Name: event_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: event_participants event_participants_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_participants_insert_own ON public.event_participants FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: event_participants event_participants_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_participants_select_participant ON public.event_participants FOR SELECT USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: student_gem_events gem_events_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gem_events_select_own ON public.student_gem_events FOR SELECT TO authenticated USING ((student_id = auth.uid()));


--
-- Name: group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members group_members_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_select_authenticated ON public.group_members FOR SELECT TO authenticated USING (true);


--
-- Name: group_members group_members_write_staff_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_members_write_staff_only ON public.group_members USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: groups groups_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_select_authenticated ON public.groups FOR SELECT TO authenticated USING (true);


--
-- Name: groups groups_write_staff_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_write_staff_only ON public.groups USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: guardian_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guardian_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: guardian_notifications guardian_notifications_view; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardian_notifications_view ON public.guardian_notifications FOR SELECT TO authenticated USING (public.can_manage_student(student_id));


--
-- Name: guardian_push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guardian_push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: guardian_push_subscriptions guardian_push_view; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardian_push_view ON public.guardian_push_subscriptions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.student_guardians g
  WHERE ((g.id = guardian_push_subscriptions.guardian_id) AND public.can_manage_student(g.student_id)))));


--
-- Name: student_guardians guardians_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardians_manage ON public.student_guardians TO authenticated USING (public.can_manage_student(student_id)) WITH CHECK (public.can_manage_student(student_id));


--
-- Name: hangman_word_bank; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hangman_word_bank ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_task_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kpi_task_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: kpi_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kpi_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: league_weekly_points; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.league_weekly_points ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: lesson_completions lesson_completions_delete_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_completions_delete_own_or_admin ON public.lesson_completions FOR DELETE USING (((student_id = auth.uid()) OR public.is_admin()));


--
-- Name: lesson_completions lesson_completions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_completions_insert_own ON public.lesson_completions FOR INSERT WITH CHECK ((student_id = auth.uid()));


--
-- Name: lesson_completions lesson_completions_select_own_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_completions_select_own_or_staff ON public.lesson_completions FOR SELECT USING (((student_id = auth.uid()) OR public.is_staff()));


--
-- Name: lesson_completions lesson_completions_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lesson_completions_update_own ON public.lesson_completions FOR UPDATE USING ((student_id = auth.uid())) WITH CHECK ((student_id = auth.uid()));


--
-- Name: lessons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

--
-- Name: lessons lessons_delete_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lessons_delete_own_or_admin ON public.lessons FOR DELETE USING (((created_by = auth.uid()) OR public.is_admin()));


--
-- Name: lessons lessons_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lessons_insert_staff ON public.lessons FOR INSERT WITH CHECK ((public.is_staff() AND (created_by = auth.uid())));


--
-- Name: lessons lessons_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lessons_select_authenticated ON public.lessons FOR SELECT TO authenticated USING (true);


--
-- Name: lessons lessons_select_restrict_teacher_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lessons_select_restrict_teacher_only ON public.lessons AS RESTRICTIVE FOR SELECT USING (((audience = 'estudiante'::text) OR (EXISTS ( SELECT 1
   FROM public.teachers
  WHERE (teachers.id = auth.uid())))));


--
-- Name: lessons lessons_update_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lessons_update_own_or_admin ON public.lessons FOR UPDATE USING (((created_by = auth.uid()) OR public.is_admin()));


--
-- Name: likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

--
-- Name: login_rate_limit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_rate_limit ENABLE ROW LEVEL SECURITY;

--
-- Name: manual_kpi_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.manual_kpi_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: mascot_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mascot_chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: mascot_chat_messages mascot_chat_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mascot_chat_own ON public.mascot_chat_messages USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: node_session_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.node_session_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: node_session_logs node_session_logs_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY node_session_logs_select_staff ON public.node_session_logs FOR SELECT USING (public.is_staff());


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

--
-- Name: student_practice_sessions practice_sessions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY practice_sessions_insert_own ON public.student_practice_sessions FOR INSERT WITH CHECK ((auth.uid() = student_id));


--
-- Name: student_practice_sessions practice_sessions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY practice_sessions_select_own ON public.student_practice_sessions FOR SELECT USING ((auth.uid() = student_id));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_self_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_self_or_admin ON public.profiles FOR SELECT USING (((auth.uid() = id) OR public.is_admin()));


--
-- Name: profiles profiles_write_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_write_admin_only ON public.profiles USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: programs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

--
-- Name: programs programs_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY programs_select_authenticated ON public.programs FOR SELECT TO authenticated USING (true);


--
-- Name: programs programs_write_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY programs_write_admin_only ON public.programs USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: project_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_own_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_delete_own_or_staff ON public.projects FOR DELETE USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: projects projects_insert_own_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_insert_own_or_staff ON public.projects FOR INSERT WITH CHECK (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: projects projects_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select_authenticated ON public.projects FOR SELECT TO authenticated USING (true);


--
-- Name: projects projects_select_restrict_private_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_select_restrict_private_school ON public.projects AS RESTRICTIVE FOR SELECT USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM (public.students s
     JOIN public.schools sc ON (((sc.code)::text = (s.school_code)::text)))
  WHERE ((s.id = projects.user_id) AND ((COALESCE(sc.public_projects, true) = true) OR ((s.school_code)::text = (( SELECT students.school_code
           FROM public.students
          WHERE (students.id = auth.uid())))::text) OR (EXISTS ( SELECT 1
           FROM public.teacher_assignments ta
          WHERE ((ta.teacher_id = auth.uid()) AND ((ta.school_code)::text = (s.school_code)::text)))) OR (EXISTS ( SELECT 1
           FROM (public.coordinator_assignments ca
             JOIN public.teacher_assignments ta2 ON ((ta2.teacher_id = ca.teacher_id)))
          WHERE ((ca.coordinator_id = auth.uid()) AND ((ta2.school_code)::text = (s.school_code)::text))))))))));


--
-- Name: projects projects_update_own_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_update_own_or_staff ON public.projects FOR UPDATE USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions push_subscriptions_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_own ON public.push_subscriptions USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: push_subscriptions push_subscriptions_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_select_staff ON public.push_subscriptions FOR SELECT USING (public.is_staff());


--
-- Name: random_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.random_events ENABLE ROW LEVEL SECURITY;

--
-- Name: random_events random_events_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY random_events_insert_staff ON public.random_events FOR INSERT WITH CHECK (public.is_staff());


--
-- Name: random_events random_events_select_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY random_events_select_staff ON public.random_events FOR SELECT USING (public.is_staff());


--
-- Name: random_events random_events_update_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY random_events_update_staff ON public.random_events FOR UPDATE USING (public.is_staff());


--
-- Name: resource_comment_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_comment_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_comment_likes resource_comment_likes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_comment_likes_delete ON public.resource_comment_likes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: resource_comment_likes resource_comment_likes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_comment_likes_insert ON public.resource_comment_likes FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.resource_comments rc
  WHERE ((rc.id = resource_comment_likes.comment_id) AND (public.is_staff() OR (EXISTS ( SELECT 1
           FROM public.group_members gm
          WHERE ((gm.group_id = rc.group_id) AND (gm.student_id = auth.uid()))))))))));


--
-- Name: resource_comment_likes resource_comment_likes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_comment_likes_select ON public.resource_comment_likes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.resource_comments rc
  WHERE ((rc.id = resource_comment_likes.comment_id) AND (public.is_staff() OR (EXISTS ( SELECT 1
           FROM public.group_members gm
          WHERE ((gm.group_id = rc.group_id) AND (gm.student_id = auth.uid())))))))));


--
-- Name: resource_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_comments resource_comments_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_comments_delete ON public.resource_comments FOR DELETE USING (((auth.uid() = author_id) OR public.is_staff()));


--
-- Name: resource_comments resource_comments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_comments_insert ON public.resource_comments FOR INSERT WITH CHECK (((auth.uid() = author_id) AND (public.is_staff() OR (EXISTS ( SELECT 1
   FROM public.group_members gm
  WHERE ((gm.group_id = resource_comments.group_id) AND (gm.student_id = auth.uid())))))));


--
-- Name: resource_comments resource_comments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_comments_select ON public.resource_comments FOR SELECT USING ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM public.group_members gm
  WHERE ((gm.group_id = resource_comments.group_id) AND (gm.student_id = auth.uid()))))));


--
-- Name: resource_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_notes resource_notes_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_notes_delete_own ON public.resource_notes FOR DELETE USING ((auth.uid() = student_id));


--
-- Name: resource_notes resource_notes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_notes_insert_own ON public.resource_notes FOR INSERT WITH CHECK ((auth.uid() = student_id));


--
-- Name: resource_notes resource_notes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_notes_select_own ON public.resource_notes FOR SELECT USING ((auth.uid() = student_id));


--
-- Name: resource_notes resource_notes_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_notes_update_own ON public.resource_notes FOR UPDATE USING ((auth.uid() = student_id)) WITH CHECK ((auth.uid() = student_id));


--
-- Name: school_nodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_nodes ENABLE ROW LEVEL SECURITY;

--
-- Name: school_nodes school_nodes_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY school_nodes_select_admin ON public.school_nodes FOR SELECT USING (public.is_admin());


--
-- Name: school_programs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_programs ENABLE ROW LEVEL SECURITY;

--
-- Name: school_programs school_programs_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY school_programs_select_authenticated ON public.school_programs FOR SELECT TO authenticated USING (true);


--
-- Name: school_programs school_programs_write_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY school_programs_write_admin_only ON public.school_programs USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: schools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

--
-- Name: schools schools_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schools_select_authenticated ON public.schools FOR SELECT TO authenticated USING (true);


--
-- Name: schools schools_write_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schools_write_admin_only ON public.schools USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: season_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.season_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: season_claims season_claims_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY season_claims_select_own ON public.season_claims FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: seasonal_milestones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seasonal_milestones ENABLE ROW LEVEL SECURITY;

--
-- Name: student_badges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;

--
-- Name: student_badges student_badges_delete_staff_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_badges_delete_staff_only ON public.student_badges FOR DELETE USING (public.is_staff());


--
-- Name: student_badges student_badges_insert_own_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_badges_insert_own_or_staff ON public.student_badges FOR INSERT WITH CHECK (((auth.uid() = student_id) OR public.is_staff()));


--
-- Name: student_badges student_badges_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_badges_select_authenticated ON public.student_badges FOR SELECT TO authenticated USING (true);


--
-- Name: student_badges student_badges_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_badges_update_own ON public.student_badges FOR UPDATE USING ((auth.uid() = student_id)) WITH CHECK ((auth.uid() = student_id));


--
-- Name: student_badges student_badges_update_staff_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_badges_update_staff_only ON public.student_badges FOR UPDATE USING (public.is_staff());


--
-- Name: student_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: student_challenges student_challenges_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_challenges_insert_own ON public.student_challenges FOR INSERT WITH CHECK ((auth.uid() = student_id));


--
-- Name: student_challenges student_challenges_select_own_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_challenges_select_own_or_staff ON public.student_challenges FOR SELECT USING (((auth.uid() = student_id) OR public.is_staff()));


--
-- Name: student_companions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_companions ENABLE ROW LEVEL SECURITY;

--
-- Name: student_companions student_companions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_companions_select_own ON public.student_companions FOR SELECT TO authenticated USING ((student_id = auth.uid()));


--
-- Name: student_cosmetics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_cosmetics ENABLE ROW LEVEL SECURITY;

--
-- Name: student_cosmetics student_cosmetics_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_cosmetics_select_own ON public.student_cosmetics FOR SELECT USING ((student_id = auth.uid()));


--
-- Name: student_debug_duels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_debug_duels ENABLE ROW LEVEL SECURITY;

--
-- Name: student_debug_duels student_debug_duels_insert_challenger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_debug_duels_insert_challenger ON public.student_debug_duels FOR INSERT WITH CHECK ((auth.uid() = challenger_id));


--
-- Name: student_debug_duels student_debug_duels_select_participant_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_debug_duels_select_participant_or_staff ON public.student_debug_duels FOR SELECT USING (((auth.uid() = challenger_id) OR (auth.uid() = opponent_id) OR public.is_staff()));


--
-- Name: student_debug_duels student_debug_duels_update_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_debug_duels_update_participant ON public.student_debug_duels FOR UPDATE USING (((auth.uid() = challenger_id) OR (auth.uid() = opponent_id) OR public.is_staff()));


--
-- Name: student_debug_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_debug_results ENABLE ROW LEVEL SECURITY;

--
-- Name: student_debug_results student_debug_results_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_debug_results_insert_own ON public.student_debug_results FOR INSERT WITH CHECK ((auth.uid() = student_id));


--
-- Name: student_debug_results student_debug_results_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_debug_results_select_participant ON public.student_debug_results FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.student_debug_duels d
  WHERE ((d.id = student_debug_results.duel_id) AND ((auth.uid() = d.challenger_id) OR (auth.uid() = d.opponent_id))))) OR public.is_staff()));


--
-- Name: student_duel_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_duel_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: student_duel_answers student_duel_answers_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_duel_answers_select_participant ON public.student_duel_answers FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.student_duels d
  WHERE ((d.id = student_duel_answers.duel_id) AND ((auth.uid() = d.challenger_id) OR (auth.uid() = d.opponent_id))))) OR public.is_staff()));


--
-- Name: student_duel_answers student_duel_answers_update_own_result_seen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_duel_answers_update_own_result_seen ON public.student_duel_answers FOR UPDATE USING ((auth.uid() = student_id)) WITH CHECK ((auth.uid() = student_id));


--
-- Name: student_duels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_duels ENABLE ROW LEVEL SECURITY;

--
-- Name: student_duels student_duels_insert_challenger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_duels_insert_challenger ON public.student_duels FOR INSERT WITH CHECK ((auth.uid() = challenger_id));


--
-- Name: student_duels student_duels_select_participant_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_duels_select_participant_or_staff ON public.student_duels FOR SELECT USING (((auth.uid() = challenger_id) OR (auth.uid() = opponent_id) OR public.is_staff()));


--
-- Name: student_duels student_duels_update_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_duels_update_participant ON public.student_duels FOR UPDATE USING (((auth.uid() = challenger_id) OR (auth.uid() = opponent_id) OR public.is_staff()));


--
-- Name: student_gem_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_gem_events ENABLE ROW LEVEL SECURITY;

--
-- Name: student_guardians; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_guardians ENABLE ROW LEVEL SECURITY;

--
-- Name: student_hangman_duels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_hangman_duels ENABLE ROW LEVEL SECURITY;

--
-- Name: student_hangman_duels student_hangman_duels_insert_challenger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_hangman_duels_insert_challenger ON public.student_hangman_duels FOR INSERT WITH CHECK ((auth.uid() = challenger_id));


--
-- Name: student_hangman_duels student_hangman_duels_select_participant_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_hangman_duels_select_participant_or_staff ON public.student_hangman_duels FOR SELECT USING (((auth.uid() = challenger_id) OR (auth.uid() = opponent_id) OR public.is_staff()));


--
-- Name: student_hangman_duels student_hangman_duels_update_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_hangman_duels_update_participant ON public.student_hangman_duels FOR UPDATE USING (((auth.uid() = challenger_id) OR (auth.uid() = opponent_id) OR public.is_staff()));


--
-- Name: student_hangman_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_hangman_results ENABLE ROW LEVEL SECURITY;

--
-- Name: student_hangman_results student_hangman_results_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_hangman_results_insert_own ON public.student_hangman_results FOR INSERT WITH CHECK ((auth.uid() = student_id));


--
-- Name: student_hangman_results student_hangman_results_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_hangman_results_select_participant ON public.student_hangman_results FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.student_hangman_duels d
  WHERE ((d.id = student_hangman_results.duel_id) AND ((auth.uid() = d.challenger_id) OR (auth.uid() = d.opponent_id))))) OR public.is_staff()));


--
-- Name: student_practice_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_practice_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: student_spelling_duels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_spelling_duels ENABLE ROW LEVEL SECURITY;

--
-- Name: student_spelling_duels student_spelling_duels_insert_challenger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_spelling_duels_insert_challenger ON public.student_spelling_duels FOR INSERT WITH CHECK ((auth.uid() = challenger_id));


--
-- Name: student_spelling_duels student_spelling_duels_select_participant_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_spelling_duels_select_participant_or_staff ON public.student_spelling_duels FOR SELECT USING (((auth.uid() = challenger_id) OR (auth.uid() = opponent_id) OR public.is_staff()));


--
-- Name: student_spelling_duels student_spelling_duels_update_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_spelling_duels_update_participant ON public.student_spelling_duels FOR UPDATE USING (((auth.uid() = challenger_id) OR (auth.uid() = opponent_id) OR public.is_staff()));


--
-- Name: student_spelling_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_spelling_results ENABLE ROW LEVEL SECURITY;

--
-- Name: student_spelling_results student_spelling_results_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_spelling_results_insert_own ON public.student_spelling_results FOR INSERT WITH CHECK ((auth.uid() = student_id));


--
-- Name: student_spelling_results student_spelling_results_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_spelling_results_select_participant ON public.student_spelling_results FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.student_spelling_duels d
  WHERE ((d.id = student_spelling_results.duel_id) AND ((auth.uid() = d.challenger_id) OR (auth.uid() = d.opponent_id))))) OR public.is_staff()));


--
-- Name: student_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: student_suggestions student_suggestions_delete_staff_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_suggestions_delete_staff_only ON public.student_suggestions FOR DELETE USING (public.is_staff());


--
-- Name: student_suggestions student_suggestions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_suggestions_insert_own ON public.student_suggestions FOR INSERT WITH CHECK ((auth.uid() = student_id));


--
-- Name: student_suggestions student_suggestions_select_own_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_suggestions_select_own_or_staff ON public.student_suggestions FOR SELECT USING (((auth.uid() = student_id) OR public.is_staff()));


--
-- Name: student_suggestions student_suggestions_update_staff_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_suggestions_update_staff_only ON public.student_suggestions FOR UPDATE USING (public.is_staff());


--
-- Name: student_timed_math_duels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_timed_math_duels ENABLE ROW LEVEL SECURITY;

--
-- Name: student_timed_math_duels student_timed_math_duels_insert_challenger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_timed_math_duels_insert_challenger ON public.student_timed_math_duels FOR INSERT WITH CHECK ((auth.uid() = challenger_id));


--
-- Name: student_timed_math_duels student_timed_math_duels_select_participant_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_timed_math_duels_select_participant_or_staff ON public.student_timed_math_duels FOR SELECT USING (((auth.uid() = challenger_id) OR (auth.uid() = opponent_id) OR public.is_staff()));


--
-- Name: student_timed_math_duels student_timed_math_duels_update_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_timed_math_duels_update_participant ON public.student_timed_math_duels FOR UPDATE USING (((auth.uid() = challenger_id) OR (auth.uid() = opponent_id) OR public.is_staff()));


--
-- Name: student_timed_math_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_timed_math_results ENABLE ROW LEVEL SECURITY;

--
-- Name: student_timed_math_results student_timed_math_results_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_timed_math_results_insert_own ON public.student_timed_math_results FOR INSERT WITH CHECK ((auth.uid() = student_id));


--
-- Name: student_timed_math_results student_timed_math_results_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY student_timed_math_results_select_participant ON public.student_timed_math_results FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.student_timed_math_duels d
  WHERE ((d.id = student_timed_math_results.duel_id) AND ((auth.uid() = d.challenger_id) OR (auth.uid() = d.opponent_id))))) OR public.is_staff()));


--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: students students_delete_staff_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_delete_staff_only ON public.students FOR DELETE USING (public.is_staff());


--
-- Name: students students_insert_staff_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_insert_staff_only ON public.students FOR INSERT WITH CHECK (public.is_staff());


--
-- Name: students students_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_select_authenticated ON public.students FOR SELECT TO authenticated USING (true);


--
-- Name: students students_update_self_or_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_update_self_or_staff ON public.students FOR UPDATE USING (((auth.uid() = id) OR public.is_staff()));


--
-- Name: survey_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.survey_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: survey_answers survey_answers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY survey_answers_delete ON public.survey_answers FOR DELETE USING (public.is_admin());


--
-- Name: survey_answers survey_answers_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY survey_answers_insert_own ON public.survey_answers FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.survey_responses r
  WHERE ((r.id = survey_answers.response_id) AND (r.user_id = auth.uid())))));


--
-- Name: survey_answers survey_answers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY survey_answers_select ON public.survey_answers FOR SELECT USING ((public.is_staff() OR (EXISTS ( SELECT 1
   FROM public.survey_responses r
  WHERE ((r.id = survey_answers.response_id) AND (r.user_id = auth.uid()))))));


--
-- Name: survey_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: survey_questions survey_questions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY survey_questions_delete ON public.survey_questions FOR DELETE USING (public.is_admin());


--
-- Name: survey_questions survey_questions_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY survey_questions_insert_staff ON public.survey_questions FOR INSERT WITH CHECK (public.is_staff());


--
-- Name: survey_questions survey_questions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY survey_questions_select ON public.survey_questions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.surveys s
  WHERE ((s.id = survey_questions.survey_id) AND (public.is_staff() OR ((s.status = 'active'::text) AND ((s.audience = 'all'::text) OR ((s.audience = 'students'::text) AND (EXISTS ( SELECT 1
           FROM public.students
          WHERE (students.id = auth.uid())))) OR ((s.audience = 'teachers'::text) AND (EXISTS ( SELECT 1
           FROM public.teachers
          WHERE (teachers.id = auth.uid())))))))))));


--
-- Name: survey_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: survey_responses survey_responses_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY survey_responses_delete ON public.survey_responses FOR DELETE USING (public.is_admin());


--
-- Name: survey_responses survey_responses_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY survey_responses_insert_own ON public.survey_responses FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: survey_responses survey_responses_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY survey_responses_select ON public.survey_responses FOR SELECT USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: surveys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

--
-- Name: surveys surveys_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY surveys_delete ON public.surveys FOR DELETE USING (public.is_admin());


--
-- Name: surveys surveys_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY surveys_insert_staff ON public.surveys FOR INSERT WITH CHECK ((public.is_staff() AND (created_by = auth.uid())));


--
-- Name: surveys surveys_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY surveys_select ON public.surveys FOR SELECT USING ((public.is_staff() OR ((status = 'active'::text) AND ((audience = 'all'::text) OR ((audience = 'students'::text) AND (EXISTS ( SELECT 1
   FROM public.students
  WHERE (students.id = auth.uid())))) OR ((audience = 'teachers'::text) AND (EXISTS ( SELECT 1
   FROM public.teachers
  WHERE (teachers.id = auth.uid()))))))));


--
-- Name: surveys surveys_update_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY surveys_update_staff ON public.surveys FOR UPDATE USING (public.is_staff());


--
-- Name: system_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_assignments teacher_assignments_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_assignments_select_authenticated ON public.teacher_assignments FOR SELECT TO authenticated USING (true);


--
-- Name: teacher_assignments teacher_assignments_write_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_assignments_write_admin_only ON public.teacher_assignments USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: teacher_badges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_badges ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_badges teacher_badges_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_badges_update_own ON public.teacher_badges FOR UPDATE USING ((auth.uid() = teacher_id)) WITH CHECK ((auth.uid() = teacher_id));


--
-- Name: teacher_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_monthly_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_monthly_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_notifications teacher_notifications_delete_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_notifications_delete_own_or_admin ON public.teacher_notifications FOR DELETE USING (((auth.uid() = teacher_id) OR public.is_admin()));


--
-- Name: teacher_notifications teacher_notifications_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_notifications_insert_authenticated ON public.teacher_notifications FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: teacher_notifications teacher_notifications_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_notifications_select_own_or_admin ON public.teacher_notifications FOR SELECT USING (((auth.uid() = teacher_id) OR public.is_admin()));


--
-- Name: teacher_notifications teacher_notifications_update_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_notifications_update_own_or_admin ON public.teacher_notifications FOR UPDATE USING (((auth.uid() = teacher_id) OR public.is_admin()));


--
-- Name: teacher_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_ratings teacher_ratings_delete_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_ratings_delete_admin_only ON public.teacher_ratings FOR DELETE USING (public.is_admin());


--
-- Name: teacher_ratings teacher_ratings_insert_own_student; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_ratings_insert_own_student ON public.teacher_ratings FOR INSERT WITH CHECK ((auth.uid() = student_id));


--
-- Name: teacher_ratings teacher_ratings_select_participant_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_ratings_select_participant_or_admin ON public.teacher_ratings FOR SELECT USING (((auth.uid() = student_id) OR (auth.uid() = teacher_id) OR public.is_admin() OR public.is_coordinator_of(teacher_id)));


--
-- Name: teacher_ratings teacher_ratings_update_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teacher_ratings_update_admin_only ON public.teacher_ratings FOR UPDATE USING (public.is_admin());


--
-- Name: teacher_rock_completions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_rock_completions ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_rocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_rocks ENABLE ROW LEVEL SECURITY;

--
-- Name: teachers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

--
-- Name: teachers teachers_delete_admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teachers_delete_admin_only ON public.teachers FOR DELETE USING (public.is_admin());


--
-- Name: teachers teachers_insert_self_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teachers_insert_self_or_admin ON public.teachers FOR INSERT WITH CHECK (((auth.uid() = id) OR public.is_admin()));


--
-- Name: teachers teachers_select_self_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teachers_select_self_or_admin ON public.teachers FOR SELECT USING (((auth.uid() = id) OR public.is_admin() OR public.is_coordinator_of(id)));


--
-- Name: teachers teachers_update_self_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teachers_update_self_or_admin ON public.teachers FOR UPDATE USING (((auth.uid() = id) OR public.is_admin()));


--
-- Name: tournament_match_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_match_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_match_answers tournament_match_answers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_match_answers_select ON public.tournament_match_answers FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (public.tournament_matches m
     JOIN public.tournament_teams t ON (((t.id = m.team_a_id) OR (t.id = m.team_b_id))))
  WHERE ((m.id = tournament_match_answers.match_id) AND (t.captain_id = auth.uid())))) OR public.is_staff()));


--
-- Name: tournament_matches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_matches tournament_matches_insert_captain; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_matches_insert_captain ON public.tournament_matches FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tournament_teams t
  WHERE ((t.id = tournament_matches.challenger_team_id) AND (t.captain_id = auth.uid())))));


--
-- Name: tournament_matches tournament_matches_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_matches_select ON public.tournament_matches FOR SELECT USING (true);


--
-- Name: tournament_matches tournament_matches_update_captain; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_matches_update_captain ON public.tournament_matches FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.tournament_teams t
  WHERE ((t.id = tournament_matches.team_a_id) AND (t.captain_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.tournament_teams t
  WHERE ((t.id = tournament_matches.team_b_id) AND (t.captain_id = auth.uid()))))));


--
-- Name: tournament_seasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_seasons ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_seasons tournament_seasons_insert_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_seasons_insert_staff ON public.tournament_seasons FOR INSERT WITH CHECK (public.is_staff());


--
-- Name: tournament_seasons tournament_seasons_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_seasons_select ON public.tournament_seasons FOR SELECT USING (true);


--
-- Name: tournament_seasons tournament_seasons_update_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_seasons_update_staff ON public.tournament_seasons FOR UPDATE USING (public.is_staff());


--
-- Name: tournament_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_team_members tournament_team_members_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_team_members_delete ON public.tournament_team_members FOR DELETE USING (((EXISTS ( SELECT 1
   FROM public.tournament_teams t
  WHERE ((t.id = tournament_team_members.team_id) AND (t.captain_id = auth.uid())))) OR (auth.uid() = student_id)));


--
-- Name: tournament_team_members tournament_team_members_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_team_members_insert ON public.tournament_team_members FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.tournament_teams t
  WHERE ((t.id = tournament_team_members.team_id) AND (t.captain_id = auth.uid())))) OR (auth.uid() = student_id)));


--
-- Name: tournament_team_members tournament_team_members_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_team_members_select ON public.tournament_team_members FOR SELECT USING (true);


--
-- Name: tournament_teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_teams tournament_teams_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_teams_insert_own ON public.tournament_teams FOR INSERT WITH CHECK ((auth.uid() = captain_id));


--
-- Name: tournament_teams tournament_teams_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_teams_select ON public.tournament_teams FOR SELECT USING (true);


--
-- Name: tournament_teams tournament_teams_update_captain; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tournament_teams_update_captain ON public.tournament_teams FOR UPDATE USING (((auth.uid() = captain_id) OR public.is_staff()));


--
-- Name: tutor_attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tutor_attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: user_badges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

--
-- Name: votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

--
-- Name: weekly_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weekly_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION accept_timed_math_duel(p_duel_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.accept_timed_math_duel(p_duel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.accept_timed_math_duel(p_duel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.accept_timed_math_duel(p_duel_id uuid) TO service_role;


--
-- Name: FUNCTION admin_adjust_economy(p_user_id uuid, p_xp_delta integer, p_gems_delta integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_adjust_economy(p_user_id uuid, p_xp_delta integer, p_gems_delta integer) TO anon;
GRANT ALL ON FUNCTION public.admin_adjust_economy(p_user_id uuid, p_xp_delta integer, p_gems_delta integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_adjust_economy(p_user_id uuid, p_xp_delta integer, p_gems_delta integer) TO service_role;


--
-- Name: FUNCTION admin_reset_user_password(user_id uuid, new_password text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_reset_user_password(user_id uuid, new_password text) TO anon;
GRANT ALL ON FUNCTION public.admin_reset_user_password(user_id uuid, new_password text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_reset_user_password(user_id uuid, new_password text) TO service_role;


--
-- Name: FUNCTION assign_hangman_bank_word(p_duel_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assign_hangman_bank_word(p_duel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.assign_hangman_bank_word(p_duel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.assign_hangman_bank_word(p_duel_id uuid) TO service_role;


--
-- Name: FUNCTION buy_companion_egg(p_species text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.buy_companion_egg(p_species text) TO anon;
GRANT ALL ON FUNCTION public.buy_companion_egg(p_species text) TO authenticated;
GRANT ALL ON FUNCTION public.buy_companion_egg(p_species text) TO service_role;


--
-- Name: FUNCTION buy_cosmetic(p_item text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.buy_cosmetic(p_item text) TO anon;
GRANT ALL ON FUNCTION public.buy_cosmetic(p_item text) TO authenticated;
GRANT ALL ON FUNCTION public.buy_cosmetic(p_item text) TO service_role;


--
-- Name: FUNCTION buy_shop_item(p_item text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.buy_shop_item(p_item text) TO anon;
GRANT ALL ON FUNCTION public.buy_shop_item(p_item text) TO authenticated;
GRANT ALL ON FUNCTION public.buy_shop_item(p_item text) TO service_role;


--
-- Name: FUNCTION calculate_rocks_xp(p_teacher_id uuid, p_month integer, p_year integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_rocks_xp(p_teacher_id uuid, p_month integer, p_year integer) TO anon;
GRANT ALL ON FUNCTION public.calculate_rocks_xp(p_teacher_id uuid, p_month integer, p_year integer) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_rocks_xp(p_teacher_id uuid, p_month integer, p_year integer) TO service_role;


--
-- Name: FUNCTION can_manage_student(p_student uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_manage_student(p_student uuid) TO anon;
GRANT ALL ON FUNCTION public.can_manage_student(p_student uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_student(p_student uuid) TO service_role;


--
-- Name: FUNCTION can_see_announcement(p_audience text, p_school text, p_grade text, p_section text, p_schools text[], p_groups jsonb, p_sender uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_see_announcement(p_audience text, p_school text, p_grade text, p_section text, p_schools text[], p_groups jsonb, p_sender uuid) TO anon;
GRANT ALL ON FUNCTION public.can_see_announcement(p_audience text, p_school text, p_grade text, p_section text, p_schools text[], p_groups jsonb, p_sender uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_see_announcement(p_audience text, p_school text, p_grade text, p_section text, p_schools text[], p_groups jsonb, p_sender uuid) TO service_role;


--
-- Name: FUNCTION can_send_announcement(p_audience text, p_school text, p_grade text, p_section text, p_schools text[], p_groups jsonb, p_sender uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_send_announcement(p_audience text, p_school text, p_grade text, p_section text, p_schools text[], p_groups jsonb, p_sender uuid) TO anon;
GRANT ALL ON FUNCTION public.can_send_announcement(p_audience text, p_school text, p_grade text, p_section text, p_schools text[], p_groups jsonb, p_sender uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_send_announcement(p_audience text, p_school text, p_grade text, p_section text, p_schools text[], p_groups jsonb, p_sender uuid) TO service_role;


--
-- Name: FUNCTION check_auto_badges(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_auto_badges(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.check_auto_badges(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.check_auto_badges(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION check_hangman_letter(p_duel_id uuid, p_letter text, p_guessed_letters jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_hangman_letter(p_duel_id uuid, p_letter text, p_guessed_letters jsonb) TO anon;
GRANT ALL ON FUNCTION public.check_hangman_letter(p_duel_id uuid, p_letter text, p_guessed_letters jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.check_hangman_letter(p_duel_id uuid, p_letter text, p_guessed_letters jsonb) TO service_role;


--
-- Name: FUNCTION check_lesson_content_url(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_lesson_content_url() TO anon;
GRANT ALL ON FUNCTION public.check_lesson_content_url() TO authenticated;
GRANT ALL ON FUNCTION public.check_lesson_content_url() TO service_role;


--
-- Name: FUNCTION choose_companion(p_species text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.choose_companion(p_species text) TO anon;
GRANT ALL ON FUNCTION public.choose_companion(p_species text) TO authenticated;
GRANT ALL ON FUNCTION public.choose_companion(p_species text) TO service_role;


--
-- Name: FUNCTION claim_daily_chest(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_daily_chest() TO anon;
GRANT ALL ON FUNCTION public.claim_daily_chest() TO authenticated;
GRANT ALL ON FUNCTION public.claim_daily_chest() TO service_role;


--
-- Name: FUNCTION claim_first_profile_photo_reward(p_photo_url text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_first_profile_photo_reward(p_photo_url text) TO anon;
GRANT ALL ON FUNCTION public.claim_first_profile_photo_reward(p_photo_url text) TO authenticated;
GRANT ALL ON FUNCTION public.claim_first_profile_photo_reward(p_photo_url text) TO service_role;


--
-- Name: FUNCTION claim_season_reward(p_level integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_season_reward(p_level integer) TO anon;
GRANT ALL ON FUNCTION public.claim_season_reward(p_level integer) TO authenticated;
GRANT ALL ON FUNCTION public.claim_season_reward(p_level integer) TO service_role;


--
-- Name: FUNCTION claim_student_challenge_reward(p_challenge_id text, p_comment text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_student_challenge_reward(p_challenge_id text, p_comment text) TO anon;
GRANT ALL ON FUNCTION public.claim_student_challenge_reward(p_challenge_id text, p_comment text) TO authenticated;
GRANT ALL ON FUNCTION public.claim_student_challenge_reward(p_challenge_id text, p_comment text) TO service_role;


--
-- Name: FUNCTION companion_stage(p_total integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.companion_stage(p_total integer) TO anon;
GRANT ALL ON FUNCTION public.companion_stage(p_total integer) TO authenticated;
GRANT ALL ON FUNCTION public.companion_stage(p_total integer) TO service_role;


--
-- Name: FUNCTION contains_profanity(txt text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.contains_profanity(txt text) TO anon;
GRANT ALL ON FUNCTION public.contains_profanity(txt text) TO authenticated;
GRANT ALL ON FUNCTION public.contains_profanity(txt text) TO service_role;


--
-- Name: FUNCTION current_season_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_season_id() TO anon;
GRANT ALL ON FUNCTION public.current_season_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_season_id() TO service_role;


--
-- Name: FUNCTION current_week_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_week_id() TO anon;
GRANT ALL ON FUNCTION public.current_week_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_week_id() TO service_role;


--
-- Name: FUNCTION decrement_project_votes(project_id_param bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.decrement_project_votes(project_id_param bigint) TO anon;
GRANT ALL ON FUNCTION public.decrement_project_votes(project_id_param bigint) TO authenticated;
GRANT ALL ON FUNCTION public.decrement_project_votes(project_id_param bigint) TO service_role;


--
-- Name: FUNCTION decrement_votes(project_id integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.decrement_votes(project_id integer) TO anon;
GRANT ALL ON FUNCTION public.decrement_votes(project_id integer) TO authenticated;
GRANT ALL ON FUNCTION public.decrement_votes(project_id integer) TO service_role;


--
-- Name: FUNCTION duel_house_reward(p_student uuid, p_gems integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.duel_house_reward(p_student uuid, p_gems integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.duel_house_reward(p_student uuid, p_gems integer) TO service_role;


--
-- Name: FUNCTION enforce_no_profanity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_no_profanity() TO anon;
GRANT ALL ON FUNCTION public.enforce_no_profanity() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_no_profanity() TO service_role;


--
-- Name: FUNCTION enqueue_class_guardian_message(p_school_code text, p_grade text, p_section text, p_text text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enqueue_class_guardian_message(p_school_code text, p_grade text, p_section text, p_text text) TO anon;
GRANT ALL ON FUNCTION public.enqueue_class_guardian_message(p_school_code text, p_grade text, p_section text, p_text text) TO authenticated;
GRANT ALL ON FUNCTION public.enqueue_class_guardian_message(p_school_code text, p_grade text, p_section text, p_text text) TO service_role;


--
-- Name: FUNCTION enqueue_guardian_notification(p_guardian uuid, p_text text, p_channel text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enqueue_guardian_notification(p_guardian uuid, p_text text, p_channel text) TO anon;
GRANT ALL ON FUNCTION public.enqueue_guardian_notification(p_guardian uuid, p_text text, p_channel text) TO authenticated;
GRANT ALL ON FUNCTION public.enqueue_guardian_notification(p_guardian uuid, p_text text, p_channel text) TO service_role;


--
-- Name: FUNCTION equip_cosmetic(p_slot text, p_item text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.equip_cosmetic(p_slot text, p_item text) TO anon;
GRANT ALL ON FUNCTION public.equip_cosmetic(p_slot text, p_item text) TO authenticated;
GRANT ALL ON FUNCTION public.equip_cosmetic(p_slot text, p_item text) TO service_role;


--
-- Name: FUNCTION finish_student_duel(p_table text, p_duel_id uuid, p_challenger uuid, p_opponent uuid, p_wager integer, p_winner uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finish_student_duel(p_table text, p_duel_id uuid, p_challenger uuid, p_opponent uuid, p_wager integer, p_winner uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_student_duel(p_table text, p_duel_id uuid, p_challenger uuid, p_opponent uuid, p_wager integer, p_winner uuid) TO service_role;


--
-- Name: FUNCTION generate_ai_feedback(project_title text, project_description text, scores_json jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_ai_feedback(project_title text, project_description text, scores_json jsonb) TO anon;
GRANT ALL ON FUNCTION public.generate_ai_feedback(project_title text, project_description text, scores_json jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.generate_ai_feedback(project_title text, project_description text, scores_json jsonb) TO service_role;


--
-- Name: FUNCTION generate_math_problems(p_grade text, p_count integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_math_problems(p_grade text, p_count integer) TO anon;
GRANT ALL ON FUNCTION public.generate_math_problems(p_grade text, p_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.generate_math_problems(p_grade text, p_count integer) TO service_role;


--
-- Name: FUNCTION get_class_duel_report(p_school text, p_grade text, p_section text, p_days integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_class_duel_report(p_school text, p_grade text, p_section text, p_days integer) TO anon;
GRANT ALL ON FUNCTION public.get_class_duel_report(p_school text, p_grade text, p_section text, p_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_class_duel_report(p_school text, p_grade text, p_section text, p_days integer) TO service_role;


--
-- Name: FUNCTION get_class_login_mode(p_school_code text, p_grade text, p_section text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_class_login_mode(p_school_code text, p_grade text, p_section text) TO anon;
GRANT ALL ON FUNCTION public.get_class_login_mode(p_school_code text, p_grade text, p_section text) TO authenticated;
GRANT ALL ON FUNCTION public.get_class_login_mode(p_school_code text, p_grade text, p_section text) TO service_role;


--
-- Name: FUNCTION get_duel_fact(p_game text, p_duel_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_duel_fact(p_game text, p_duel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_duel_fact(p_game text, p_duel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_duel_fact(p_game text, p_duel_id uuid) TO service_role;


--
-- Name: FUNCTION get_duel_questions(p_duel_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_duel_questions(p_duel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_duel_questions(p_duel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_duel_questions(p_duel_id uuid) TO service_role;


--
-- Name: FUNCTION get_duel_review(p_duel_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_duel_review(p_duel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_duel_review(p_duel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_duel_review(p_duel_id uuid) TO service_role;


--
-- Name: FUNCTION get_event_questions(p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_event_questions(p_event_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_event_questions(p_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_event_questions(p_event_id uuid) TO service_role;


--
-- Name: FUNCTION get_impact_metrics(p_from date, p_to date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_impact_metrics(p_from date, p_to date) TO anon;
GRANT ALL ON FUNCTION public.get_impact_metrics(p_from date, p_to date) TO authenticated;
GRANT ALL ON FUNCTION public.get_impact_metrics(p_from date, p_to date) TO service_role;


--
-- Name: FUNCTION get_impact_trend(p_months integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_impact_trend(p_months integer) TO anon;
GRANT ALL ON FUNCTION public.get_impact_trend(p_months integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_impact_trend(p_months integer) TO service_role;


--
-- Name: FUNCTION get_my_duel_rewards_left(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_duel_rewards_left() TO anon;
GRANT ALL ON FUNCTION public.get_my_duel_rewards_left() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_duel_rewards_left() TO service_role;


--
-- Name: FUNCTION get_my_league(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_league() TO anon;
GRANT ALL ON FUNCTION public.get_my_league() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_league() TO service_role;


--
-- Name: FUNCTION get_my_played_duel_ids(p_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_played_duel_ids(p_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_my_played_duel_ids(p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_played_duel_ids(p_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_my_rivalries(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_rivalries() TO anon;
GRANT ALL ON FUNCTION public.get_my_rivalries() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_rivalries() TO service_role;


--
-- Name: FUNCTION get_practice_questions(p_session_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_practice_questions(p_session_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_practice_questions(p_session_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_practice_questions(p_session_id uuid) TO service_role;


--
-- Name: FUNCTION get_projects_with_visibility(user_id_param uuid, user_role_param text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_projects_with_visibility(user_id_param uuid, user_role_param text) TO anon;
GRANT ALL ON FUNCTION public.get_projects_with_visibility(user_id_param uuid, user_role_param text) TO authenticated;
GRANT ALL ON FUNCTION public.get_projects_with_visibility(user_id_param uuid, user_role_param text) TO service_role;


--
-- Name: FUNCTION get_season_pass(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_season_pass() TO anon;
GRANT ALL ON FUNCTION public.get_season_pass() TO authenticated;
GRANT ALL ON FUNCTION public.get_season_pass() TO service_role;


--
-- Name: FUNCTION get_teacher_rocks(p_teacher_id uuid, p_month integer, p_year integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_teacher_rocks(p_teacher_id uuid, p_month integer, p_year integer) TO anon;
GRANT ALL ON FUNCTION public.get_teacher_rocks(p_teacher_id uuid, p_month integer, p_year integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_teacher_rocks(p_teacher_id uuid, p_month integer, p_year integer) TO service_role;


--
-- Name: FUNCTION get_tournament_match_questions(p_match_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_tournament_match_questions(p_match_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_tournament_match_questions(p_match_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_tournament_match_questions(p_match_id uuid) TO service_role;


--
-- Name: FUNCTION get_tournament_match_review(p_match_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_tournament_match_review(p_match_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_tournament_match_review(p_match_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_tournament_match_review(p_match_id uuid) TO service_role;


--
-- Name: FUNCTION get_week_start(input_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_week_start(input_date date) TO anon;
GRANT ALL ON FUNCTION public.get_week_start(input_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_week_start(input_date date) TO service_role;


--
-- Name: FUNCTION get_weekly_topic(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_weekly_topic() TO anon;
GRANT ALL ON FUNCTION public.get_weekly_topic() TO authenticated;
GRANT ALL ON FUNCTION public.get_weekly_topic() TO service_role;


--
-- Name: FUNCTION guard_guardian_consent(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_guardian_consent() TO anon;
GRANT ALL ON FUNCTION public.guard_guardian_consent() TO authenticated;
GRANT ALL ON FUNCTION public.guard_guardian_consent() TO service_role;


--
-- Name: FUNCTION guard_student_duel_write(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_student_duel_write() TO anon;
GRANT ALL ON FUNCTION public.guard_student_duel_write() TO authenticated;
GRANT ALL ON FUNCTION public.guard_student_duel_write() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION increment_project_votes(project_id_param bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_project_votes(project_id_param bigint) TO anon;
GRANT ALL ON FUNCTION public.increment_project_votes(project_id_param bigint) TO authenticated;
GRANT ALL ON FUNCTION public.increment_project_votes(project_id_param bigint) TO service_role;


--
-- Name: FUNCTION increment_votes(project_id integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_votes(project_id integer) TO anon;
GRANT ALL ON FUNCTION public.increment_votes(project_id integer) TO authenticated;
GRANT ALL ON FUNCTION public.increment_votes(project_id integer) TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION is_assigned_teacher_for_project(p_project_id integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_assigned_teacher_for_project(p_project_id integer) TO anon;
GRANT ALL ON FUNCTION public.is_assigned_teacher_for_project(p_project_id integer) TO authenticated;
GRANT ALL ON FUNCTION public.is_assigned_teacher_for_project(p_project_id integer) TO service_role;


--
-- Name: FUNCTION is_companion_species(p text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_companion_species(p text) TO anon;
GRANT ALL ON FUNCTION public.is_companion_species(p text) TO authenticated;
GRANT ALL ON FUNCTION public.is_companion_species(p text) TO service_role;


--
-- Name: FUNCTION is_coordinator_of(p_teacher_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_coordinator_of(p_teacher_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_coordinator_of(p_teacher_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_coordinator_of(p_teacher_id uuid) TO service_role;


--
-- Name: FUNCTION is_staff(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_staff() TO anon;
GRANT ALL ON FUNCTION public.is_staff() TO authenticated;
GRANT ALL ON FUNCTION public.is_staff() TO service_role;


--
-- Name: FUNCTION is_test_school_code(p_code text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_test_school_code(p_code text) TO anon;
GRANT ALL ON FUNCTION public.is_test_school_code(p_code text) TO authenticated;
GRANT ALL ON FUNCTION public.is_test_school_code(p_code text) TO service_role;


--
-- Name: FUNCTION league_resolution(p_student uuid, p_week text, p_tier integer, OUT new_tier integer, OUT result text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.league_resolution(p_student uuid, p_week text, p_tier integer, OUT new_tier integer, OUT result text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.league_resolution(p_student uuid, p_week text, p_tier integer, OUT new_tier integer, OUT result text) TO service_role;


--
-- Name: FUNCTION log_gem_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.log_gem_change() TO anon;
GRANT ALL ON FUNCTION public.log_gem_change() TO authenticated;
GRANT ALL ON FUNCTION public.log_gem_change() TO service_role;


--
-- Name: FUNCTION notify_comment_like(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_comment_like() TO anon;
GRANT ALL ON FUNCTION public.notify_comment_like() TO authenticated;
GRANT ALL ON FUNCTION public.notify_comment_like() TO service_role;


--
-- Name: FUNCTION notify_comment_reply(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_comment_reply() TO anon;
GRANT ALL ON FUNCTION public.notify_comment_reply() TO authenticated;
GRANT ALL ON FUNCTION public.notify_comment_reply() TO service_role;


--
-- Name: FUNCTION protect_student_privileged_fields(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_student_privileged_fields() TO anon;
GRANT ALL ON FUNCTION public.protect_student_privileged_fields() TO authenticated;
GRANT ALL ON FUNCTION public.protect_student_privileged_fields() TO service_role;


--
-- Name: FUNCTION protect_teacher_privileged_fields(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_teacher_privileged_fields() TO anon;
GRANT ALL ON FUNCTION public.protect_teacher_privileged_fields() TO authenticated;
GRANT ALL ON FUNCTION public.protect_teacher_privileged_fields() TO service_role;


--
-- Name: FUNCTION record_active_heartbeat(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.record_active_heartbeat() TO anon;
GRANT ALL ON FUNCTION public.record_active_heartbeat() TO authenticated;
GRANT ALL ON FUNCTION public.record_active_heartbeat() TO service_role;


--
-- Name: FUNCTION record_guardian_paper_consent(p_guardian uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.record_guardian_paper_consent(p_guardian uuid) TO anon;
GRANT ALL ON FUNCTION public.record_guardian_paper_consent(p_guardian uuid) TO authenticated;
GRANT ALL ON FUNCTION public.record_guardian_paper_consent(p_guardian uuid) TO service_role;


--
-- Name: FUNCTION register_push_subscription(p_endpoint text, p_p256dh text, p_auth text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text) TO anon;
GRANT ALL ON FUNCTION public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text) TO authenticated;
GRANT ALL ON FUNCTION public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text) TO service_role;


--
-- Name: FUNCTION register_school_node(p_school text, p_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.register_school_node(p_school text, p_name text) TO anon;
GRANT ALL ON FUNCTION public.register_school_node(p_school text, p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.register_school_node(p_school text, p_name text) TO service_role;


--
-- Name: FUNCTION reset_password_via_admin(target_email text, new_password text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reset_password_via_admin(target_email text, new_password text) TO anon;
GRANT ALL ON FUNCTION public.reset_password_via_admin(target_email text, new_password text) TO authenticated;
GRANT ALL ON FUNCTION public.reset_password_via_admin(target_email text, new_password text) TO service_role;


--
-- Name: FUNCTION resolve_login_email(p_username text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.resolve_login_email(p_username text) TO anon;
GRANT ALL ON FUNCTION public.resolve_login_email(p_username text) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_login_email(p_username text) TO service_role;


--
-- Name: FUNCTION resolve_login_mode_by_username(p_username text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.resolve_login_mode_by_username(p_username text) TO anon;
GRANT ALL ON FUNCTION public.resolve_login_mode_by_username(p_username text) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_login_mode_by_username(p_username text) TO service_role;


--
-- Name: FUNCTION revoke_school_node(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.revoke_school_node(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.revoke_school_node(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_school_node(p_id uuid) TO service_role;


--
-- Name: FUNCTION schedule_tonight_event(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.schedule_tonight_event() TO anon;
GRANT ALL ON FUNCTION public.schedule_tonight_event() TO authenticated;
GRANT ALL ON FUNCTION public.schedule_tonight_event() TO service_role;


--
-- Name: FUNCTION season_reward_json(p_level integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.season_reward_json(p_level integer) TO anon;
GRANT ALL ON FUNCTION public.season_reward_json(p_level integer) TO authenticated;
GRANT ALL ON FUNCTION public.season_reward_json(p_level integer) TO service_role;


--
-- Name: FUNCTION set_active_companion(p_species text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_active_companion(p_species text) TO anon;
GRANT ALL ON FUNCTION public.set_active_companion(p_species text) TO authenticated;
GRANT ALL ON FUNCTION public.set_active_companion(p_species text) TO service_role;


--
-- Name: FUNCTION set_school_public_projects(p_school_code text, p_public boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_school_public_projects(p_school_code text, p_public boolean) TO anon;
GRANT ALL ON FUNCTION public.set_school_public_projects(p_school_code text, p_public boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_school_public_projects(p_school_code text, p_public boolean) TO service_role;


--
-- Name: FUNCTION set_weekly_topic(p_school text, p_grade text, p_section text, p_topic text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_weekly_topic(p_school text, p_grade text, p_section text, p_topic text) TO anon;
GRANT ALL ON FUNCTION public.set_weekly_topic(p_school text, p_grade text, p_section text, p_topic text) TO authenticated;
GRANT ALL ON FUNCTION public.set_weekly_topic(p_school text, p_grade text, p_section text, p_topic text) TO service_role;


--
-- Name: FUNCTION settle_student_debug_duel(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.settle_student_debug_duel() TO anon;
GRANT ALL ON FUNCTION public.settle_student_debug_duel() TO authenticated;
GRANT ALL ON FUNCTION public.settle_student_debug_duel() TO service_role;


--
-- Name: FUNCTION settle_student_duel(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.settle_student_duel() TO anon;
GRANT ALL ON FUNCTION public.settle_student_duel() TO authenticated;
GRANT ALL ON FUNCTION public.settle_student_duel() TO service_role;


--
-- Name: FUNCTION settle_student_hangman_duel(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.settle_student_hangman_duel() TO anon;
GRANT ALL ON FUNCTION public.settle_student_hangman_duel() TO authenticated;
GRANT ALL ON FUNCTION public.settle_student_hangman_duel() TO service_role;


--
-- Name: FUNCTION settle_student_spelling_duel(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.settle_student_spelling_duel() TO anon;
GRANT ALL ON FUNCTION public.settle_student_spelling_duel() TO authenticated;
GRANT ALL ON FUNCTION public.settle_student_spelling_duel() TO service_role;


--
-- Name: FUNCTION settle_student_timed_math_duel(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.settle_student_timed_math_duel() TO anon;
GRANT ALL ON FUNCTION public.settle_student_timed_math_duel() TO authenticated;
GRANT ALL ON FUNCTION public.settle_student_timed_math_duel() TO service_role;


--
-- Name: FUNCTION settle_tournament_match(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.settle_tournament_match() TO anon;
GRANT ALL ON FUNCTION public.settle_tournament_match() TO authenticated;
GRANT ALL ON FUNCTION public.settle_tournament_match() TO service_role;


--
-- Name: FUNCTION start_debug_duel(p_duel_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.start_debug_duel(p_duel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.start_debug_duel(p_duel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.start_debug_duel(p_duel_id uuid) TO service_role;


--
-- Name: FUNCTION start_hangman_duel(p_duel_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.start_hangman_duel(p_duel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.start_hangman_duel(p_duel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.start_hangman_duel(p_duel_id uuid) TO service_role;


--
-- Name: FUNCTION start_spelling_duel(p_duel_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.start_spelling_duel(p_duel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.start_spelling_duel(p_duel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.start_spelling_duel(p_duel_id uuid) TO service_role;


--
-- Name: FUNCTION start_timed_math_duel(p_duel_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.start_timed_math_duel(p_duel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.start_timed_math_duel(p_duel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.start_timed_math_duel(p_duel_id uuid) TO service_role;


--
-- Name: FUNCTION submit_debug_result(p_duel_id uuid, p_selected_index integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.submit_debug_result(p_duel_id uuid, p_selected_index integer) TO anon;
GRANT ALL ON FUNCTION public.submit_debug_result(p_duel_id uuid, p_selected_index integer) TO authenticated;
GRANT ALL ON FUNCTION public.submit_debug_result(p_duel_id uuid, p_selected_index integer) TO service_role;


--
-- Name: FUNCTION submit_duel_answers(p_duel_id uuid, p_answers jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.submit_duel_answers(p_duel_id uuid, p_answers jsonb) TO anon;
GRANT ALL ON FUNCTION public.submit_duel_answers(p_duel_id uuid, p_answers jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.submit_duel_answers(p_duel_id uuid, p_answers jsonb) TO service_role;


--
-- Name: FUNCTION submit_hangman_result(p_duel_id uuid, p_guessed_letters jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.submit_hangman_result(p_duel_id uuid, p_guessed_letters jsonb) TO anon;
GRANT ALL ON FUNCTION public.submit_hangman_result(p_duel_id uuid, p_guessed_letters jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.submit_hangman_result(p_duel_id uuid, p_guessed_letters jsonb) TO service_role;


--
-- Name: FUNCTION submit_practice_answers(p_session_id uuid, p_answers jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.submit_practice_answers(p_session_id uuid, p_answers jsonb) TO anon;
GRANT ALL ON FUNCTION public.submit_practice_answers(p_session_id uuid, p_answers jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.submit_practice_answers(p_session_id uuid, p_answers jsonb) TO service_role;


--
-- Name: FUNCTION submit_spelling_answer(p_duel_id uuid, p_answer text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.submit_spelling_answer(p_duel_id uuid, p_answer text) TO anon;
GRANT ALL ON FUNCTION public.submit_spelling_answer(p_duel_id uuid, p_answer text) TO authenticated;
GRANT ALL ON FUNCTION public.submit_spelling_answer(p_duel_id uuid, p_answer text) TO service_role;


--
-- Name: FUNCTION submit_timed_math_result(p_duel_id uuid, p_answers jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.submit_timed_math_result(p_duel_id uuid, p_answers jsonb) TO anon;
GRANT ALL ON FUNCTION public.submit_timed_math_result(p_duel_id uuid, p_answers jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.submit_timed_math_result(p_duel_id uuid, p_answers jsonb) TO service_role;


--
-- Name: FUNCTION sync_save_evaluation(p_evaluation jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_save_evaluation(p_evaluation jsonb) TO anon;
GRANT ALL ON FUNCTION public.sync_save_evaluation(p_evaluation jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.sync_save_evaluation(p_evaluation jsonb) TO service_role;


--
-- Name: FUNCTION teacher_create_class(p_school_code text, p_grade text, p_section text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.teacher_create_class(p_school_code text, p_grade text, p_section text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.teacher_create_class(p_school_code text, p_grade text, p_section text) TO authenticated;
GRANT ALL ON FUNCTION public.teacher_create_class(p_school_code text, p_grade text, p_section text) TO service_role;


--
-- Name: FUNCTION toggle_project_like(p_project_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.toggle_project_like(p_project_id uuid) TO anon;
GRANT ALL ON FUNCTION public.toggle_project_like(p_project_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.toggle_project_like(p_project_id uuid) TO service_role;


--
-- Name: FUNCTION touch_daily_login(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.touch_daily_login() TO anon;
GRANT ALL ON FUNCTION public.touch_daily_login() TO authenticated;
GRANT ALL ON FUNCTION public.touch_daily_login() TO service_role;


--
-- Name: FUNCTION track_gems_earned(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.track_gems_earned() TO anon;
GRANT ALL ON FUNCTION public.track_gems_earned() TO authenticated;
GRANT ALL ON FUNCTION public.track_gems_earned() TO service_role;


--
-- Name: FUNCTION track_league_xp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.track_league_xp() TO anon;
GRANT ALL ON FUNCTION public.track_league_xp() TO authenticated;
GRANT ALL ON FUNCTION public.track_league_xp() TO service_role;


--
-- Name: FUNCTION track_season_xp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.track_season_xp() TO anon;
GRANT ALL ON FUNCTION public.track_season_xp() TO authenticated;
GRANT ALL ON FUNCTION public.track_season_xp() TO service_role;


--
-- Name: FUNCTION unregister_push_subscription(p_endpoint text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unregister_push_subscription(p_endpoint text) TO anon;
GRANT ALL ON FUNCTION public.unregister_push_subscription(p_endpoint text) TO authenticated;
GRANT ALL ON FUNCTION public.unregister_push_subscription(p_endpoint text) TO service_role;


--
-- Name: FUNCTION update_review_eligibility(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_review_eligibility() TO anon;
GRANT ALL ON FUNCTION public.update_review_eligibility() TO authenticated;
GRANT ALL ON FUNCTION public.update_review_eligibility() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: TABLE active_time_tracking; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.active_time_tracking TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.active_time_tracking TO authenticated;
GRANT ALL ON TABLE public.active_time_tracking TO service_role;


--
-- Name: TABLE ai_code_evaluations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_code_evaluations TO anon;
GRANT ALL ON TABLE public.ai_code_evaluations TO authenticated;
GRANT ALL ON TABLE public.ai_code_evaluations TO service_role;


--
-- Name: TABLE ai_evaluations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_evaluations TO anon;
GRANT ALL ON TABLE public.ai_evaluations TO authenticated;
GRANT ALL ON TABLE public.ai_evaluations TO service_role;


--
-- Name: TABLE announcement_reads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.announcement_reads TO anon;
GRANT ALL ON TABLE public.announcement_reads TO authenticated;
GRANT ALL ON TABLE public.announcement_reads TO service_role;


--
-- Name: TABLE announcements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.announcements TO anon;
GRANT ALL ON TABLE public.announcements TO authenticated;
GRANT ALL ON TABLE public.announcements TO service_role;


--
-- Name: TABLE asset_audits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.asset_audits TO anon;
GRANT ALL ON TABLE public.asset_audits TO authenticated;
GRANT ALL ON TABLE public.asset_audits TO service_role;


--
-- Name: TABLE attendance; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.attendance TO anon;
GRANT ALL ON TABLE public.attendance TO authenticated;
GRANT ALL ON TABLE public.attendance TO service_role;


--
-- Name: SEQUENCE attendance_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.attendance_id_seq TO anon;
GRANT ALL ON SEQUENCE public.attendance_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.attendance_id_seq TO service_role;


--
-- Name: TABLE attendance_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.attendance_reports TO anon;
GRANT ALL ON TABLE public.attendance_reports TO authenticated;
GRANT ALL ON TABLE public.attendance_reports TO service_role;


--
-- Name: TABLE attendance_waivers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.attendance_waivers TO anon;
GRANT ALL ON TABLE public.attendance_waivers TO authenticated;
GRANT ALL ON TABLE public.attendance_waivers TO service_role;


--
-- Name: TABLE badges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.badges TO anon;
GRANT ALL ON TABLE public.badges TO authenticated;
GRANT ALL ON TABLE public.badges TO service_role;


--
-- Name: SEQUENCE badges_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.badges_id_seq TO anon;
GRANT ALL ON SEQUENCE public.badges_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.badges_id_seq TO service_role;


--
-- Name: TABLE certificates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.certificates TO anon;
GRANT ALL ON TABLE public.certificates TO authenticated;
GRANT ALL ON TABLE public.certificates TO service_role;


--
-- Name: TABLE class_passwords; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.class_passwords TO anon;
GRANT ALL ON TABLE public.class_passwords TO authenticated;
GRANT ALL ON TABLE public.class_passwords TO service_role;


--
-- Name: TABLE class_weekly_topics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.class_weekly_topics TO service_role;
GRANT SELECT ON TABLE public.class_weekly_topics TO authenticated;


--
-- Name: TABLE comment_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comment_notifications TO anon;
GRANT ALL ON TABLE public.comment_notifications TO authenticated;
GRANT ALL ON TABLE public.comment_notifications TO service_role;


--
-- Name: TABLE companion_videos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.companion_videos TO authenticated;
GRANT ALL ON TABLE public.companion_videos TO service_role;


--
-- Name: TABLE coordinator_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.coordinator_assignments TO anon;
GRANT ALL ON TABLE public.coordinator_assignments TO authenticated;
GRANT ALL ON TABLE public.coordinator_assignments TO service_role;


--
-- Name: SEQUENCE coordinator_assignments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.coordinator_assignments_id_seq TO anon;
GRANT ALL ON SEQUENCE public.coordinator_assignments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.coordinator_assignments_id_seq TO service_role;


--
-- Name: TABLE cosmetic_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cosmetic_items TO service_role;
GRANT SELECT ON TABLE public.cosmetic_items TO authenticated;


--
-- Name: TABLE course_feedback; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.course_feedback TO anon;
GRANT ALL ON TABLE public.course_feedback TO authenticated;
GRANT ALL ON TABLE public.course_feedback TO service_role;


--
-- Name: TABLE courses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.courses TO anon;
GRANT ALL ON TABLE public.courses TO authenticated;
GRANT ALL ON TABLE public.courses TO service_role;


--
-- Name: TABLE duel_daily_rewards; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.duel_daily_rewards TO service_role;


--
-- Name: TABLE duel_facts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.duel_facts TO service_role;


--
-- Name: TABLE dynamic_kpis; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dynamic_kpis TO anon;
GRANT ALL ON TABLE public.dynamic_kpis TO authenticated;
GRANT ALL ON TABLE public.dynamic_kpis TO service_role;


--
-- Name: TABLE email_notifications_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_notifications_log TO anon;
GRANT ALL ON TABLE public.email_notifications_log TO authenticated;
GRANT ALL ON TABLE public.email_notifications_log TO service_role;


--
-- Name: SEQUENCE email_notifications_log_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.email_notifications_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.email_notifications_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.email_notifications_log_id_seq TO service_role;


--
-- Name: TABLE evaluation_scores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.evaluation_scores TO anon;
GRANT ALL ON TABLE public.evaluation_scores TO authenticated;
GRANT ALL ON TABLE public.evaluation_scores TO service_role;


--
-- Name: SEQUENCE evaluation_scores_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.evaluation_scores_id_seq TO anon;
GRANT ALL ON SEQUENCE public.evaluation_scores_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.evaluation_scores_id_seq TO service_role;


--
-- Name: TABLE evaluations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.evaluations TO anon;
GRANT ALL ON TABLE public.evaluations TO authenticated;
GRANT ALL ON TABLE public.evaluations TO service_role;


--
-- Name: SEQUENCE evaluations_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.evaluations_id_seq TO anon;
GRANT ALL ON SEQUENCE public.evaluations_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.evaluations_id_seq TO service_role;


--
-- Name: TABLE event_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_participants TO anon;
GRANT ALL ON TABLE public.event_participants TO authenticated;
GRANT ALL ON TABLE public.event_participants TO service_role;


--
-- Name: TABLE group_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_members TO anon;
GRANT ALL ON TABLE public.group_members TO authenticated;
GRANT ALL ON TABLE public.group_members TO service_role;


--
-- Name: SEQUENCE group_members_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.group_members_id_seq TO anon;
GRANT ALL ON SEQUENCE public.group_members_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.group_members_id_seq TO service_role;


--
-- Name: TABLE groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.groups TO anon;
GRANT ALL ON TABLE public.groups TO authenticated;
GRANT ALL ON TABLE public.groups TO service_role;


--
-- Name: SEQUENCE groups_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.groups_id_seq TO anon;
GRANT ALL ON SEQUENCE public.groups_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.groups_id_seq TO service_role;


--
-- Name: TABLE guardian_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.guardian_notifications TO service_role;
GRANT SELECT ON TABLE public.guardian_notifications TO authenticated;


--
-- Name: SEQUENCE guardian_notifications_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.guardian_notifications_id_seq TO anon;
GRANT ALL ON SEQUENCE public.guardian_notifications_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.guardian_notifications_id_seq TO service_role;


--
-- Name: TABLE guardian_push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.guardian_push_subscriptions TO service_role;


--
-- Name: COLUMN guardian_push_subscriptions.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.guardian_push_subscriptions TO authenticated;


--
-- Name: COLUMN guardian_push_subscriptions.guardian_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(guardian_id) ON TABLE public.guardian_push_subscriptions TO authenticated;


--
-- Name: COLUMN guardian_push_subscriptions.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.guardian_push_subscriptions TO authenticated;


--
-- Name: SEQUENCE guardian_push_subscriptions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.guardian_push_subscriptions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.guardian_push_subscriptions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.guardian_push_subscriptions_id_seq TO service_role;


--
-- Name: TABLE hangman_word_bank; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hangman_word_bank TO service_role;


--
-- Name: SEQUENCE hangman_word_bank_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.hangman_word_bank_id_seq TO anon;
GRANT ALL ON SEQUENCE public.hangman_word_bank_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.hangman_word_bank_id_seq TO service_role;


--
-- Name: TABLE kpi_task_completions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kpi_task_completions TO anon;
GRANT ALL ON TABLE public.kpi_task_completions TO authenticated;
GRANT ALL ON TABLE public.kpi_task_completions TO service_role;


--
-- Name: TABLE kpi_tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kpi_tasks TO anon;
GRANT ALL ON TABLE public.kpi_tasks TO authenticated;
GRANT ALL ON TABLE public.kpi_tasks TO service_role;


--
-- Name: TABLE league_weekly_points; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.league_weekly_points TO service_role;


--
-- Name: TABLE lesson_completions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lesson_completions TO anon;
GRANT ALL ON TABLE public.lesson_completions TO authenticated;
GRANT ALL ON TABLE public.lesson_completions TO service_role;


--
-- Name: TABLE lessons; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lessons TO anon;
GRANT ALL ON TABLE public.lessons TO authenticated;
GRANT ALL ON TABLE public.lessons TO service_role;


--
-- Name: TABLE likes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.likes TO anon;
GRANT ALL ON TABLE public.likes TO authenticated;
GRANT ALL ON TABLE public.likes TO service_role;


--
-- Name: SEQUENCE likes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.likes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.likes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.likes_id_seq TO service_role;


--
-- Name: TABLE login_rate_limit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.login_rate_limit TO anon;
GRANT ALL ON TABLE public.login_rate_limit TO authenticated;
GRANT ALL ON TABLE public.login_rate_limit TO service_role;


--
-- Name: TABLE manual_kpi_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.manual_kpi_entries TO anon;
GRANT ALL ON TABLE public.manual_kpi_entries TO authenticated;
GRANT ALL ON TABLE public.manual_kpi_entries TO service_role;


--
-- Name: TABLE mascot_chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.mascot_chat_messages TO anon;
GRANT ALL ON TABLE public.mascot_chat_messages TO authenticated;
GRANT ALL ON TABLE public.mascot_chat_messages TO service_role;


--
-- Name: TABLE node_session_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.node_session_logs TO service_role;
GRANT SELECT ON TABLE public.node_session_logs TO authenticated;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: SEQUENCE notifications_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.notifications_id_seq TO anon;
GRANT ALL ON SEQUENCE public.notifications_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.notifications_id_seq TO service_role;


--
-- Name: TABLE payouts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payouts TO anon;
GRANT ALL ON TABLE public.payouts TO authenticated;
GRANT ALL ON TABLE public.payouts TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE programs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.programs TO anon;
GRANT ALL ON TABLE public.programs TO authenticated;
GRANT ALL ON TABLE public.programs TO service_role;


--
-- Name: SEQUENCE programs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.programs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.programs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.programs_id_seq TO service_role;


--
-- Name: TABLE project_likes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_likes TO anon;
GRANT ALL ON TABLE public.project_likes TO authenticated;
GRANT ALL ON TABLE public.project_likes TO service_role;


--
-- Name: SEQUENCE project_likes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.project_likes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.project_likes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.project_likes_id_seq TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.projects TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: COLUMN projects.id; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(id) ON TABLE public.projects TO authenticated;


--
-- Name: COLUMN projects.user_id; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(user_id) ON TABLE public.projects TO authenticated;


--
-- Name: COLUMN projects.group_id; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(group_id) ON TABLE public.projects TO authenticated;


--
-- Name: COLUMN projects.title; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(title) ON TABLE public.projects TO authenticated;


--
-- Name: COLUMN projects.description; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(description) ON TABLE public.projects TO authenticated;


--
-- Name: COLUMN projects.video_url; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(video_url) ON TABLE public.projects TO authenticated;


--
-- Name: COLUMN projects.score; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(score) ON TABLE public.projects TO authenticated;


--
-- Name: COLUMN projects.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(created_at) ON TABLE public.projects TO authenticated;


--
-- Name: COLUMN projects.upload_ip; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(upload_ip) ON TABLE public.projects TO authenticated;


--
-- Name: COLUMN projects.client_metadata; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(client_metadata) ON TABLE public.projects TO authenticated;


--
-- Name: COLUMN projects.bimestre; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(bimestre) ON TABLE public.projects TO authenticated;


--
-- Name: SEQUENCE projects_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.projects_id_seq TO anon;
GRANT ALL ON SEQUENCE public.projects_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.projects_id_seq TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.push_subscriptions TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE random_events; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.random_events TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.random_events TO authenticated;
GRANT ALL ON TABLE public.random_events TO service_role;


--
-- Name: COLUMN random_events.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.random_events TO authenticated;


--
-- Name: COLUMN random_events.scheduled_for; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(scheduled_for) ON TABLE public.random_events TO authenticated;


--
-- Name: COLUMN random_events.duration_minutes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(duration_minutes) ON TABLE public.random_events TO authenticated;


--
-- Name: COLUMN random_events.topic; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(topic) ON TABLE public.random_events TO authenticated;


--
-- Name: COLUMN random_events.question_count; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(question_count) ON TABLE public.random_events TO authenticated;


--
-- Name: COLUMN random_events.gem_pool; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(gem_pool) ON TABLE public.random_events TO authenticated;


--
-- Name: COLUMN random_events.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status) ON TABLE public.random_events TO authenticated;


--
-- Name: COLUMN random_events.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.random_events TO authenticated;


--
-- Name: COLUMN random_events.target_role; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(target_role) ON TABLE public.random_events TO authenticated;


--
-- Name: TABLE resource_comment_likes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.resource_comment_likes TO anon;
GRANT ALL ON TABLE public.resource_comment_likes TO authenticated;
GRANT ALL ON TABLE public.resource_comment_likes TO service_role;


--
-- Name: TABLE resource_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.resource_comments TO anon;
GRANT ALL ON TABLE public.resource_comments TO authenticated;
GRANT ALL ON TABLE public.resource_comments TO service_role;


--
-- Name: TABLE resource_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.resource_notes TO anon;
GRANT ALL ON TABLE public.resource_notes TO authenticated;
GRANT ALL ON TABLE public.resource_notes TO service_role;


--
-- Name: TABLE school_nodes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.school_nodes TO service_role;


--
-- Name: COLUMN school_nodes.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.school_nodes TO authenticated;


--
-- Name: COLUMN school_nodes.school_code; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(school_code) ON TABLE public.school_nodes TO authenticated;


--
-- Name: COLUMN school_nodes.name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(name) ON TABLE public.school_nodes TO authenticated;


--
-- Name: COLUMN school_nodes.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.school_nodes TO authenticated;


--
-- Name: COLUMN school_nodes.last_sync_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_sync_at) ON TABLE public.school_nodes TO authenticated;


--
-- Name: COLUMN school_nodes.last_sync_info; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_sync_info) ON TABLE public.school_nodes TO authenticated;


--
-- Name: COLUMN school_nodes.revoked_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(revoked_at) ON TABLE public.school_nodes TO authenticated;


--
-- Name: TABLE school_programs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.school_programs TO anon;
GRANT ALL ON TABLE public.school_programs TO authenticated;
GRANT ALL ON TABLE public.school_programs TO service_role;


--
-- Name: TABLE schools; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.schools TO anon;
GRANT ALL ON TABLE public.schools TO authenticated;
GRANT ALL ON TABLE public.schools TO service_role;


--
-- Name: SEQUENCE schools_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.schools_id_seq TO anon;
GRANT ALL ON SEQUENCE public.schools_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.schools_id_seq TO service_role;


--
-- Name: TABLE season_claims; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.season_claims TO service_role;
GRANT SELECT ON TABLE public.season_claims TO authenticated;


--
-- Name: TABLE seasonal_milestones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.seasonal_milestones TO anon;
GRANT ALL ON TABLE public.seasonal_milestones TO authenticated;
GRANT ALL ON TABLE public.seasonal_milestones TO service_role;


--
-- Name: TABLE student_badges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_badges TO anon;
GRANT ALL ON TABLE public.student_badges TO authenticated;
GRANT ALL ON TABLE public.student_badges TO service_role;


--
-- Name: SEQUENCE student_badges_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.student_badges_id_seq TO anon;
GRANT ALL ON SEQUENCE public.student_badges_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.student_badges_id_seq TO service_role;


--
-- Name: TABLE student_challenges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_challenges TO anon;
GRANT ALL ON TABLE public.student_challenges TO authenticated;
GRANT ALL ON TABLE public.student_challenges TO service_role;


--
-- Name: TABLE student_companions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_companions TO service_role;
GRANT SELECT ON TABLE public.student_companions TO authenticated;


--
-- Name: TABLE student_cosmetics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_cosmetics TO service_role;
GRANT SELECT ON TABLE public.student_cosmetics TO authenticated;


--
-- Name: TABLE student_debug_duels; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.student_debug_duels TO anon;
GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.student_debug_duels TO authenticated;
GRANT ALL ON TABLE public.student_debug_duels TO service_role;


--
-- Name: COLUMN student_debug_duels.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.student_debug_duels TO authenticated;


--
-- Name: COLUMN student_debug_duels.challenger_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(challenger_id),INSERT(challenger_id) ON TABLE public.student_debug_duels TO authenticated;


--
-- Name: COLUMN student_debug_duels.opponent_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(opponent_id),INSERT(opponent_id) ON TABLE public.student_debug_duels TO authenticated;


--
-- Name: COLUMN student_debug_duels.wager_gems; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(wager_gems),INSERT(wager_gems) ON TABLE public.student_debug_duels TO authenticated;


--
-- Name: COLUMN student_debug_duels.topic; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(topic),INSERT(topic) ON TABLE public.student_debug_duels TO authenticated;


--
-- Name: COLUMN student_debug_duels.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status),UPDATE(status) ON TABLE public.student_debug_duels TO authenticated;


--
-- Name: COLUMN student_debug_duels.winner_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(winner_id) ON TABLE public.student_debug_duels TO authenticated;


--
-- Name: COLUMN student_debug_duels.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.student_debug_duels TO authenticated;


--
-- Name: COLUMN student_debug_duels.resolved_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(resolved_at) ON TABLE public.student_debug_duels TO authenticated;


--
-- Name: TABLE student_debug_results; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_debug_results TO anon;
GRANT ALL ON TABLE public.student_debug_results TO authenticated;
GRANT ALL ON TABLE public.student_debug_results TO service_role;


--
-- Name: TABLE student_duel_answers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_duel_answers TO anon;
GRANT ALL ON TABLE public.student_duel_answers TO authenticated;
GRANT ALL ON TABLE public.student_duel_answers TO service_role;


--
-- Name: TABLE student_duels; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.student_duels TO anon;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.student_duels TO authenticated;
GRANT ALL ON TABLE public.student_duels TO service_role;


--
-- Name: COLUMN student_duels.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.student_duels TO authenticated;


--
-- Name: COLUMN student_duels.challenger_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(challenger_id),INSERT(challenger_id) ON TABLE public.student_duels TO authenticated;


--
-- Name: COLUMN student_duels.opponent_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(opponent_id),INSERT(opponent_id) ON TABLE public.student_duels TO authenticated;


--
-- Name: COLUMN student_duels.wager_gems; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(wager_gems),INSERT(wager_gems) ON TABLE public.student_duels TO authenticated;


--
-- Name: COLUMN student_duels.topic; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(topic),INSERT(topic) ON TABLE public.student_duels TO authenticated;


--
-- Name: COLUMN student_duels.question_count; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(question_count),INSERT(question_count) ON TABLE public.student_duels TO authenticated;


--
-- Name: COLUMN student_duels.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status),UPDATE(status) ON TABLE public.student_duels TO authenticated;


--
-- Name: COLUMN student_duels.winner_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(winner_id) ON TABLE public.student_duels TO authenticated;


--
-- Name: COLUMN student_duels.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.student_duels TO authenticated;


--
-- Name: COLUMN student_duels.resolved_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(resolved_at) ON TABLE public.student_duels TO authenticated;


--
-- Name: TABLE student_gem_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_gem_events TO service_role;
GRANT SELECT ON TABLE public.student_gem_events TO authenticated;


--
-- Name: SEQUENCE student_gem_events_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.student_gem_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.student_gem_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.student_gem_events_id_seq TO service_role;


--
-- Name: TABLE student_guardians; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_guardians TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.student_guardians TO authenticated;


--
-- Name: TABLE student_hangman_duels; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.student_hangman_duels TO anon;
GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.student_hangman_duels TO authenticated;
GRANT ALL ON TABLE public.student_hangman_duels TO service_role;


--
-- Name: COLUMN student_hangman_duels.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.student_hangman_duels TO authenticated;


--
-- Name: COLUMN student_hangman_duels.challenger_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(challenger_id),INSERT(challenger_id) ON TABLE public.student_hangman_duels TO authenticated;


--
-- Name: COLUMN student_hangman_duels.opponent_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(opponent_id),INSERT(opponent_id) ON TABLE public.student_hangman_duels TO authenticated;


--
-- Name: COLUMN student_hangman_duels.wager_gems; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(wager_gems),INSERT(wager_gems) ON TABLE public.student_hangman_duels TO authenticated;


--
-- Name: COLUMN student_hangman_duels.topic; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(topic),INSERT(topic) ON TABLE public.student_hangman_duels TO authenticated;


--
-- Name: COLUMN student_hangman_duels.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status),UPDATE(status) ON TABLE public.student_hangman_duels TO authenticated;


--
-- Name: COLUMN student_hangman_duels.winner_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(winner_id) ON TABLE public.student_hangman_duels TO authenticated;


--
-- Name: COLUMN student_hangman_duels.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.student_hangman_duels TO authenticated;


--
-- Name: COLUMN student_hangman_duels.resolved_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(resolved_at) ON TABLE public.student_hangman_duels TO authenticated;


--
-- Name: TABLE student_hangman_results; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_hangman_results TO anon;
GRANT ALL ON TABLE public.student_hangman_results TO authenticated;
GRANT ALL ON TABLE public.student_hangman_results TO service_role;


--
-- Name: TABLE student_practice_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.student_practice_sessions TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.student_practice_sessions TO authenticated;
GRANT ALL ON TABLE public.student_practice_sessions TO service_role;


--
-- Name: COLUMN student_practice_sessions.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.student_practice_sessions TO authenticated;


--
-- Name: COLUMN student_practice_sessions.student_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(student_id),INSERT(student_id) ON TABLE public.student_practice_sessions TO authenticated;


--
-- Name: COLUMN student_practice_sessions.topic; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(topic),INSERT(topic) ON TABLE public.student_practice_sessions TO authenticated;


--
-- Name: COLUMN student_practice_sessions.question_count; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(question_count),INSERT(question_count) ON TABLE public.student_practice_sessions TO authenticated;


--
-- Name: COLUMN student_practice_sessions.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status) ON TABLE public.student_practice_sessions TO authenticated;


--
-- Name: COLUMN student_practice_sessions.score; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(score) ON TABLE public.student_practice_sessions TO authenticated;


--
-- Name: COLUMN student_practice_sessions.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.student_practice_sessions TO authenticated;


--
-- Name: COLUMN student_practice_sessions.resolved_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(resolved_at) ON TABLE public.student_practice_sessions TO authenticated;


--
-- Name: TABLE student_spelling_duels; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.student_spelling_duels TO anon;
GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.student_spelling_duels TO authenticated;
GRANT ALL ON TABLE public.student_spelling_duels TO service_role;


--
-- Name: COLUMN student_spelling_duels.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.student_spelling_duels TO authenticated;


--
-- Name: COLUMN student_spelling_duels.challenger_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(challenger_id),INSERT(challenger_id) ON TABLE public.student_spelling_duels TO authenticated;


--
-- Name: COLUMN student_spelling_duels.opponent_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(opponent_id),INSERT(opponent_id) ON TABLE public.student_spelling_duels TO authenticated;


--
-- Name: COLUMN student_spelling_duels.wager_gems; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(wager_gems),INSERT(wager_gems) ON TABLE public.student_spelling_duels TO authenticated;


--
-- Name: COLUMN student_spelling_duels.topic; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(topic),INSERT(topic) ON TABLE public.student_spelling_duels TO authenticated;


--
-- Name: COLUMN student_spelling_duels.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status),UPDATE(status) ON TABLE public.student_spelling_duels TO authenticated;


--
-- Name: COLUMN student_spelling_duels.winner_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(winner_id) ON TABLE public.student_spelling_duels TO authenticated;


--
-- Name: COLUMN student_spelling_duels.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.student_spelling_duels TO authenticated;


--
-- Name: COLUMN student_spelling_duels.resolved_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(resolved_at) ON TABLE public.student_spelling_duels TO authenticated;


--
-- Name: TABLE student_spelling_results; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_spelling_results TO anon;
GRANT ALL ON TABLE public.student_spelling_results TO authenticated;
GRANT ALL ON TABLE public.student_spelling_results TO service_role;


--
-- Name: TABLE student_suggestions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_suggestions TO anon;
GRANT ALL ON TABLE public.student_suggestions TO authenticated;
GRANT ALL ON TABLE public.student_suggestions TO service_role;


--
-- Name: SEQUENCE student_suggestions_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.student_suggestions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.student_suggestions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.student_suggestions_id_seq TO service_role;


--
-- Name: TABLE student_timed_math_duels; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.student_timed_math_duels TO anon;
GRANT REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.student_timed_math_duels TO authenticated;
GRANT ALL ON TABLE public.student_timed_math_duels TO service_role;


--
-- Name: COLUMN student_timed_math_duels.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.student_timed_math_duels TO authenticated;


--
-- Name: COLUMN student_timed_math_duels.challenger_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(challenger_id),INSERT(challenger_id) ON TABLE public.student_timed_math_duels TO authenticated;


--
-- Name: COLUMN student_timed_math_duels.opponent_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(opponent_id),INSERT(opponent_id) ON TABLE public.student_timed_math_duels TO authenticated;


--
-- Name: COLUMN student_timed_math_duels.wager_gems; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(wager_gems),INSERT(wager_gems) ON TABLE public.student_timed_math_duels TO authenticated;


--
-- Name: COLUMN student_timed_math_duels.problem_count; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(problem_count) ON TABLE public.student_timed_math_duels TO authenticated;


--
-- Name: COLUMN student_timed_math_duels.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status),UPDATE(status) ON TABLE public.student_timed_math_duels TO authenticated;


--
-- Name: COLUMN student_timed_math_duels.winner_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(winner_id) ON TABLE public.student_timed_math_duels TO authenticated;


--
-- Name: COLUMN student_timed_math_duels.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.student_timed_math_duels TO authenticated;


--
-- Name: COLUMN student_timed_math_duels.resolved_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(resolved_at) ON TABLE public.student_timed_math_duels TO authenticated;


--
-- Name: TABLE student_timed_math_results; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.student_timed_math_results TO anon;
GRANT ALL ON TABLE public.student_timed_math_results TO authenticated;
GRANT ALL ON TABLE public.student_timed_math_results TO service_role;


--
-- Name: TABLE students; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.students TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.students TO authenticated;
GRANT ALL ON TABLE public.students TO service_role;


--
-- Name: COLUMN students.id; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(id) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.full_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(full_name) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.username; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(username) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.email; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(email) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.cui; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(cui) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.school_code; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(school_code) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.grade; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(grade) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.section; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(section) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.password_generated; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(password_generated) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.profile_photo_url; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(profile_photo_url) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.role; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(role) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(created_at) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.qr_code; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(qr_code) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.qr_data; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(qr_data) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.birth_date; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(birth_date) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.gender; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(gender) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.codigo_personal; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(codigo_personal) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.gems_earned_total; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(gems_earned_total) ON TABLE public.students TO authenticated;


--
-- Name: COLUMN students.status; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(status) ON TABLE public.students TO authenticated;


--
-- Name: TABLE survey_answers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.survey_answers TO anon;
GRANT ALL ON TABLE public.survey_answers TO authenticated;
GRANT ALL ON TABLE public.survey_answers TO service_role;


--
-- Name: TABLE survey_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.survey_questions TO anon;
GRANT ALL ON TABLE public.survey_questions TO authenticated;
GRANT ALL ON TABLE public.survey_questions TO service_role;


--
-- Name: TABLE survey_responses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.survey_responses TO anon;
GRANT ALL ON TABLE public.survey_responses TO authenticated;
GRANT ALL ON TABLE public.survey_responses TO service_role;


--
-- Name: TABLE surveys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.surveys TO anon;
GRANT ALL ON TABLE public.surveys TO authenticated;
GRANT ALL ON TABLE public.surveys TO service_role;


--
-- Name: TABLE system_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.system_config TO anon;
GRANT ALL ON TABLE public.system_config TO authenticated;
GRANT ALL ON TABLE public.system_config TO service_role;


--
-- Name: TABLE teacher_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teacher_assignments TO anon;
GRANT ALL ON TABLE public.teacher_assignments TO authenticated;
GRANT ALL ON TABLE public.teacher_assignments TO service_role;


--
-- Name: SEQUENCE teacher_assignments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.teacher_assignments_id_seq TO anon;
GRANT ALL ON SEQUENCE public.teacher_assignments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.teacher_assignments_id_seq TO service_role;


--
-- Name: TABLE teacher_badges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teacher_badges TO anon;
GRANT ALL ON TABLE public.teacher_badges TO authenticated;
GRANT ALL ON TABLE public.teacher_badges TO service_role;


--
-- Name: SEQUENCE teacher_badges_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.teacher_badges_id_seq TO anon;
GRANT ALL ON SEQUENCE public.teacher_badges_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.teacher_badges_id_seq TO service_role;


--
-- Name: TABLE teacher_challenges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teacher_challenges TO anon;
GRANT ALL ON TABLE public.teacher_challenges TO authenticated;
GRANT ALL ON TABLE public.teacher_challenges TO service_role;


--
-- Name: TABLE teacher_monthly_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teacher_monthly_reports TO anon;
GRANT ALL ON TABLE public.teacher_monthly_reports TO authenticated;
GRANT ALL ON TABLE public.teacher_monthly_reports TO service_role;


--
-- Name: TABLE teacher_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teacher_notifications TO anon;
GRANT ALL ON TABLE public.teacher_notifications TO authenticated;
GRANT ALL ON TABLE public.teacher_notifications TO service_role;


--
-- Name: SEQUENCE teacher_notifications_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.teacher_notifications_id_seq TO anon;
GRANT ALL ON SEQUENCE public.teacher_notifications_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.teacher_notifications_id_seq TO service_role;


--
-- Name: TABLE teacher_ratings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teacher_ratings TO anon;
GRANT ALL ON TABLE public.teacher_ratings TO authenticated;
GRANT ALL ON TABLE public.teacher_ratings TO service_role;


--
-- Name: SEQUENCE teacher_ratings_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.teacher_ratings_id_seq TO anon;
GRANT ALL ON SEQUENCE public.teacher_ratings_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.teacher_ratings_id_seq TO service_role;


--
-- Name: TABLE teacher_rock_completions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teacher_rock_completions TO anon;
GRANT ALL ON TABLE public.teacher_rock_completions TO authenticated;
GRANT ALL ON TABLE public.teacher_rock_completions TO service_role;


--
-- Name: TABLE teacher_rocks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teacher_rocks TO anon;
GRANT ALL ON TABLE public.teacher_rocks TO authenticated;
GRANT ALL ON TABLE public.teacher_rocks TO service_role;


--
-- Name: TABLE teachers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teachers TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.teachers TO authenticated;
GRANT ALL ON TABLE public.teachers TO service_role;


--
-- Name: COLUMN teachers.id; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(id) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.full_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(full_name) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.email; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(email) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.phone; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(phone) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.profile_photo_url; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(profile_photo_url) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.role; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(role) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(created_at) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.base_salary; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(base_salary) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.bonus_admin_max; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(bonus_admin_max) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.bonus_prod_max; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(bonus_prod_max) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.rank_title; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(rank_title) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.certification_points; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(certification_points) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.is_coordinator; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(is_coordinator) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.bonus_coordinator_max; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(bonus_coordinator_max) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.birth_date; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(birth_date) ON TABLE public.teachers TO authenticated;


--
-- Name: COLUMN teachers.is_1bot_team; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(is_1bot_team) ON TABLE public.teachers TO authenticated;


--
-- Name: TABLE tournament_match_answers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournament_match_answers TO anon;
GRANT ALL ON TABLE public.tournament_match_answers TO authenticated;
GRANT ALL ON TABLE public.tournament_match_answers TO service_role;


--
-- Name: TABLE tournament_matches; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.tournament_matches TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.tournament_matches TO authenticated;
GRANT ALL ON TABLE public.tournament_matches TO service_role;


--
-- Name: COLUMN tournament_matches.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: COLUMN tournament_matches.season_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(season_id) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: COLUMN tournament_matches.team_a_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(team_a_id) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: COLUMN tournament_matches.team_b_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(team_b_id) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: COLUMN tournament_matches.challenger_team_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(challenger_team_id) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: COLUMN tournament_matches.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: COLUMN tournament_matches.topic; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(topic) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: COLUMN tournament_matches.question_count; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(question_count) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: COLUMN tournament_matches.team_a_score; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(team_a_score) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: COLUMN tournament_matches.team_b_score; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(team_b_score) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: COLUMN tournament_matches.winner_team_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(winner_team_id) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: COLUMN tournament_matches.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: COLUMN tournament_matches.resolved_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(resolved_at) ON TABLE public.tournament_matches TO authenticated;


--
-- Name: TABLE tournament_seasons; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournament_seasons TO anon;
GRANT ALL ON TABLE public.tournament_seasons TO authenticated;
GRANT ALL ON TABLE public.tournament_seasons TO service_role;


--
-- Name: TABLE tournament_team_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournament_team_members TO anon;
GRANT ALL ON TABLE public.tournament_team_members TO authenticated;
GRANT ALL ON TABLE public.tournament_team_members TO service_role;


--
-- Name: TABLE tournament_teams; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournament_teams TO anon;
GRANT ALL ON TABLE public.tournament_teams TO authenticated;
GRANT ALL ON TABLE public.tournament_teams TO service_role;


--
-- Name: TABLE tutor_attendance; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tutor_attendance TO anon;
GRANT ALL ON TABLE public.tutor_attendance TO authenticated;
GRANT ALL ON TABLE public.tutor_attendance TO service_role;


--
-- Name: TABLE user_badges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_badges TO anon;
GRANT ALL ON TABLE public.user_badges TO authenticated;
GRANT ALL ON TABLE public.user_badges TO service_role;


--
-- Name: SEQUENCE user_badges_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.user_badges_id_seq TO anon;
GRANT ALL ON SEQUENCE public.user_badges_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.user_badges_id_seq TO service_role;


--
-- Name: TABLE votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.votes TO anon;
GRANT ALL ON TABLE public.votes TO authenticated;
GRANT ALL ON TABLE public.votes TO service_role;


--
-- Name: SEQUENCE votes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.votes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.votes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.votes_id_seq TO service_role;


--
-- Name: TABLE weekly_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.weekly_evidence TO anon;
GRANT ALL ON TABLE public.weekly_evidence TO authenticated;
GRANT ALL ON TABLE public.weekly_evidence TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict 0PeXLA9fFE91VyswdJGl6kR5qz2ArDaDCaZQxcOLzGFg60H71LL22WZDfXjjGcf

