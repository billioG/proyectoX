-- ============================================================
-- Rivalidades + aviso de resultado de duelos.
--   - get_my_rivalries(): historial cara a cara contra cada rival,
--     sumando los 5 juegos 1v1 ({rival_id: {w, l, t}}).
--   - result_notified_at: marca para que notify-duel mande el push de
--     "ganaste/perdiste" UNA sola vez por duelo (lo escribe la edge
--     function con service_role; el cliente no puede).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

alter table public.student_duels add column if not exists result_notified_at timestamptz;
alter table public.student_hangman_duels add column if not exists result_notified_at timestamptz;
alter table public.student_timed_math_duels add column if not exists result_notified_at timestamptz;
alter table public.student_debug_duels add column if not exists result_notified_at timestamptz;
alter table public.student_spelling_duels add column if not exists result_notified_at timestamptz;

create or replace function public.get_my_rivalries()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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

grant execute on function public.get_my_rivalries() to authenticated;

notify pgrst, 'reload schema';
