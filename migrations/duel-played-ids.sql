-- ============================================================
-- ¿En cuáles de estos duelos ya jugué? (los 5 juegos 1v1)
-- La app lo usaba leyendo directo las tablas de resultados, pero los
-- permisos por columna pueden bloquear esa lectura sin error visible:
-- quedaba el botón "Jugar" aunque ya hubieras jugado, y al terminar
-- aparecía "Ya jugaste". Este RPC lo resuelve en el servidor.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create or replace function public.get_my_played_duel_ids(p_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
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

grant execute on function public.get_my_played_duel_ids(uuid[]) to authenticated;

notify pgrst, 'reload schema';
