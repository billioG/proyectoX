-- ============================================================
-- Modo Práctica Solo (repaso individual, sin rival) -- mismo motor de
-- seguridad que los Desafíos 1v1 (ver duel-harden.sql): la IA genera el
-- quiz server-side, el cliente nunca ve correctIndex, el score se calcula
-- en el servidor. Recompensa (XP/gemas) limitada a 1 vez por tema por día
-- para evitar farmeo repitiendo el mismo tema en loop.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create table if not exists public.student_practice_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  topic text not null,
  question_count integer not null default 5,
  questions jsonb,
  status text not null default 'pending' check (status in ('pending', 'ready', 'resolved')),
  score integer,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists student_practice_sessions_student_idx
  on public.student_practice_sessions (student_id, topic, created_at);

alter table public.student_practice_sessions enable row level security;

-- La columna "questions" trae correctIndex -- se oculta igual que en
-- student_duels (duel-harden.sql), el cliente solo lee el resto de columnas.
revoke select on public.student_practice_sessions from authenticated, anon;
grant select (id, student_id, topic, question_count, status, score, created_at, resolved_at)
  on public.student_practice_sessions to authenticated;
grant insert (student_id, topic, question_count) on public.student_practice_sessions to authenticated;

drop policy if exists "practice_sessions_select_own" on public.student_practice_sessions;
create policy "practice_sessions_select_own" on public.student_practice_sessions
  for select using (auth.uid() = student_id);

drop policy if exists "practice_sessions_insert_own" on public.student_practice_sessions;
create policy "practice_sessions_insert_own" on public.student_practice_sessions
  for insert with check (auth.uid() = student_id);

-- RPC: devuelve las preguntas SIN correctIndex al alumno dueño de la sesión.
create or replace function public.get_practice_questions(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

grant execute on function public.get_practice_questions(uuid) to authenticated;

-- RPC: calcula el score EN SERVIDOR, acredita XP/gemas (solo la primera vez
-- que se resuelve ese tema en el día, para no premiar repetir en loop).
create or replace function public.submit_practice_answers(p_session_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  return jsonb_build_object('score', v_score, 'total', v_len, 'xp_awarded', v_xp_awarded, 'gems_awarded', v_gems_awarded);
end;
$$;

grant execute on function public.submit_practice_answers(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
