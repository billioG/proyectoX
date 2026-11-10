-- ============================================================
-- LÍMITE DE FRECUENCIA POR USUARIO PARA LAS FUNCIONES notify-* (y las que se sumen)
--
-- Problema: notify-duel, notify-announcement, notify-rock-pending, notify-reaction y notify-guardians solo exigen una sesión válida. Una
-- cuenta cualquiera (hay miles de estudiantes) podía llamarlas en bucle y llenar de notificaciones el teléfono de un compañero, de la
-- administración o de las familias (y en notify-guardians, gastar SMS). Esta migración crea el contador; las funciones lo consultan ANTES
-- de enviar.
--
--   * rate_limits: una fila por (usuario, clave) con el inicio de la ventana y cuántas llamadas lleva.
--   * rate_limit_take(usuario, clave, tope, segundos): ventana fija que empieza en la primera llamada. Suma SOLO si no pasa el tope, de forma
--     atómica (dos llamadas a la vez no se cuelan). Devuelve si se permitió, cuántas lleva, cuántas le quedan y en cuántos segundos se libera.
--   * La clave la arma la función ('notify-duel', 'notify-duel:<id del reto>:challenge', ...): permite un tope por persona Y otro por recurso.
--   * Solo la Edge Function (service_role) puede ejecutarla: ni la app ni anon. La tabla no tiene políticas (nadie la toca desde la app).
--
-- ADITIVO / NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- ORDEN: correrla ANTES de redesplegar las funciones (si la función no existe todavía, las Edge Functions dejan pasar y avisan en sus registros).
-- ============================================================

create table if not exists public.rate_limits (
  user_id uuid not null,
  key text not null check (char_length(key) between 1 and 160),
  window_start timestamptz not null default now(),
  calls integer not null default 0 check (calls >= 0),
  primary key (user_id, key)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;

create index if not exists idx_rate_limits_window on public.rate_limits (window_start);

create or replace function public.rate_limit_take(
  p_user uuid,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, calls integer, remaining integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window interval;
  v_calls integer;
  v_start timestamptz;
begin
  if p_user is null or p_key is null or char_length(p_key) not between 1 and 160
     or p_limit is null or p_limit < 1 or p_limit > 100000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'rate_limit_take: parámetros inválidos';
  end if;
  v_window := make_interval(secs => p_window_seconds);

  -- Una sola sentencia atómica: si la ventana venció, empieza otra con 1 llamada; si no, suma solo si no se pasa del tope.
  insert into public.rate_limits as r (user_id, key, window_start, calls)
  values (p_user, p_key, v_now, 1)
  on conflict (user_id, key) do update
    set window_start = case when r.window_start <= v_now - v_window then v_now else r.window_start end,
        calls = case when r.window_start <= v_now - v_window then 1 else r.calls + 1 end
    where r.window_start <= v_now - v_window or r.calls < p_limit
  returning r.calls, r.window_start into v_calls, v_start;

  if v_calls is null then
    -- Tope alcanzado en esta ventana: no se suma; se informa cuánto falta para que se libere.
    select r.calls, r.window_start into v_calls, v_start from public.rate_limits r where r.user_id = p_user and r.key = p_key;
    return query select false, coalesce(v_calls, 0), 0,
      greatest(1, ceil(extract(epoch from (v_start + v_window - v_now)))::integer);
    return;
  end if;

  -- Limpieza ocasional: lo de hace más de 2 días ya no limita nada.
  if random() < 0.01 then
    delete from public.rate_limits d where d.window_start < v_now - interval '2 days';
  end if;

  return query select true, v_calls, p_limit - v_calls, 0;
end;
$$;

revoke all on function public.rate_limit_take(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_take(uuid, text, integer, integer) to service_role;

notify pgrst, 'reload schema';

-- Verificación: debe devolver 1 fila (la función).
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rate_limit_take';
