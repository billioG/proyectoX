-- ============================================================
-- LIQUIDAR UN EVENTO SORPRESA EN UNA SOLA TRANSACCIÓN (settle-random-event)
--
-- Problema (hallazgo de rendimiento y de correctitud, docs/PERFORMANCE.md): la Edge Function settle-random-event corre cada minuto y,
-- por cada premiado, hacía tres viajes a la base: leer sus gemas, escribir gemas + premio, y escribir su puesto. Eso es el patrón
-- «leer, sumar en el servidor de la función y escribir»: si el estudiante ganaba gemas por otro lado en ese instante (un duelo, el cofre diario),
-- esas gemas se PERDÍAN al pisarse el valor. Y dos ejecuciones a la vez (el cron se solapó) podían pagar dos veces.
--
-- Ahora settle_random_event(evento, reparto) hace todo en una sola sentencia atómica: ordena (más aciertos, luego más rápido), asigna puesto,
-- calcula el premio con el mismo reparto de siempre, SUMA las gemas con un UPDATE ... SET gems = gems + premio (sin pisar nada) y marca el
-- evento como completado. Bloquea el evento (FOR UPDATE) y solo actúa si está 'active': correrla dos veces, o dos a la vez, paga UNA vez.
--
-- Solo service_role (la Edge Function). ADITIVO. Seguro de re-ejecutar. Correrla ANTES de redesplegar settle-random-event (si no existe todavía, la
-- función sigue liquidando como antes).
-- ============================================================

create or replace function public.settle_random_event(
  p_event uuid,
  p_split numeric[] default array[0.35, 0.25, 0.20, 0.12, 0.08]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_paid integer := 0;
begin
  if p_event is null or p_split is null or coalesce(array_length(p_split, 1), 0) = 0 then
    raise exception 'settle_random_event: parámetros inválidos';
  end if;

  select * into v_event from public.random_events where id = p_event for update;
  if not found or v_event.status <> 'active' then
    return 0; -- ya liquidado (o no existe): no se paga dos veces
  end if;

  with ranked as (
    select p.id, p.user_id,
           row_number() over (order by p.score desc nulls last, p.time_taken_ms asc nulls last, p.id) as rk
    from public.event_participants p
    where p.event_id = p_event and p.submitted_at is not null
  ), prized as (
    select r.id, r.user_id, r.rk,
           case when r.rk <= array_length(p_split, 1) then round(v_event.gem_pool * p_split[r.rk::int])::integer else 0 end as gems
    from ranked r
  ), upd_part as (
    update public.event_participants p
       set rank = pz.rk, gems_awarded = pz.gems
      from prized pz
     where p.id = pz.id
    returning pz.user_id, pz.gems
  ), upd_students as (
    update public.students s set gems = coalesce(s.gems, 0) + u.gems
      from upd_part u
     where v_event.target_role = 'estudiante' and s.id = u.user_id and u.gems > 0
    returning 1
  ), upd_teachers as (
    update public.teachers t set gems = coalesce(t.gems, 0) + u.gems
      from upd_part u
     where v_event.target_role = 'docente' and t.id = u.user_id and u.gems > 0
    returning 1
  )
  select count(*) filter (where gems > 0) into v_paid from prized;

  update public.random_events set status = 'completed' where id = p_event;
  return v_paid;
end;
$$;

revoke all on function public.settle_random_event(uuid, numeric[]) from public, anon, authenticated;
grant execute on function public.settle_random_event(uuid, numeric[]) to service_role;

notify pgrst, 'reload schema';
