-- ============================================================
-- UN SOLO RETO ABIERTO por pareja de compañeros y por juego.
--
-- Problema (9/11/2026): con toques repetidos se enviaban varios retos idénticos al mismo compañero («ESPERANDO RESPUESTA» x3). La app ya lo evita
-- (v1.0.255 y v1.0.256), pero una versión vieja de la app, o un reintento de la cola sin conexión, todavía podía crearlos. Este candado lo
-- impide en la base: no puede haber dos retos «pending» o «active» entre las MISMAS dos personas (en cualquier dirección) en el mismo juego.
--
-- Qué hace, en este orden, para cada una de las 5 tablas de retos (student_duels, student_hangman_duels, student_timed_math_duels,
-- student_debug_duels, student_spelling_duels):
--   1. LIMPIA los repetidos que ya existen: de los retos «pending» repetidos entre la misma pareja conserva el MÁS ANTIGUO y marca los demás como
--      «cancelled» (es lo mismo que el botón «Cancelar»: no se borra nada, las apuestas no se cobran hasta que el reto termina).
--      Los retos «active» (ya aceptados) no se tocan.
--   2. Crea un índice ÚNICO PARCIAL sobre la pareja (sin importar quién retó a quién) para los estados pending/active.
--      Si después de la limpieza todavía quedan repetidos «active», NO crea el índice de esa tabla y lo avisa con un NOTICE (nada falla).
--
-- Una segunda inserción repetida falla con el código 23505 (violación de unicidad); la app lo muestra como «Ya tienes un reto abierto con ese compañero».
-- Seguro de re-ejecutar. No borra datos. Pegar completo en el SQL Editor de Supabase.
-- ============================================================

do $$
declare
  t text;
  v_cancelled integer;
  v_left integer;
begin
  foreach t in array array['student_duels', 'student_hangman_duels', 'student_timed_math_duels', 'student_debug_duels', 'student_spelling_duels'] loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'duel-one-open-pair: no existe la tabla %, se salta', t;
      continue;
    end if;

    -- 1. Cancelar los «pending» repetidos (conserva el más antiguo de cada pareja).
    execute format($f$
      update public.%1$I d set status = 'cancelled'
      where d.status = 'pending'
        and exists (
          select 1 from public.%1$I o
          where o.id <> d.id
            and o.status in ('pending', 'active')
            and least(o.challenger_id, o.opponent_id) = least(d.challenger_id, d.opponent_id)
            and greatest(o.challenger_id, o.opponent_id) = greatest(d.challenger_id, d.opponent_id)
            and (o.status = 'active' or o.created_at < d.created_at or (o.created_at = d.created_at and o.id < d.id))
        )
    $f$, t);
    get diagnostics v_cancelled = row_count;

    -- 2. ¿Quedan repetidos abiertos (solo pueden ser «active»)?
    execute format($f$
      select count(*) from (
        select 1 from public.%1$I where status in ('pending', 'active')
        group by least(challenger_id, opponent_id), greatest(challenger_id, opponent_id) having count(*) > 1
      ) x
    $f$, t) into v_left;

    if v_left > 0 then
      raise notice 'duel-one-open-pair: % tiene % pareja(s) con varios retos ACTIVOS; no se crea el índice. Revísalos a mano y vuelve a correr esta migración.', t, v_left;
      continue;
    end if;

    execute format($f$
      create unique index if not exists %I on public.%I (least(challenger_id, opponent_id), greatest(challenger_id, opponent_id))
      where status in ('pending', 'active')
    $f$, t || '_one_open_pair', t);
    raise notice 'duel-one-open-pair: % listo (% repetido(s) cancelado(s))', t, v_cancelled;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Verificación: debe devolver 5 filas (una por juego).
select indexname from pg_indexes where schemaname = 'public' and indexname like '%\_one\_open\_pair' order by indexname;
