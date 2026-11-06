-- ============================================================
-- LÍMITE DIARIO DE USO DE IA POR USUARIO (Edge Function ai-proxy)
--
-- Problema: ai-proxy solo exige una sesión válida; cualquier cuenta (hay miles de
-- estudiantes) podía llamarla sin tope y gastar la cuota de Groq. Esta migración
-- crea el contador y la función atómica que la Edge Function usa ANTES de llamar
-- al modelo. Los topes viven en la función (variables de entorno), no aquí.
--
--   * ai_usage_daily: una fila por usuario, día y tipo de uso ('chat' = preguntas
--     de la persona, 'short' = frases cortas automáticas de la mascota).
--   * ai_usage_take(usuario, tipo, tope, costo): suma el uso SOLO si no pasa el
--     tope, de forma atómica (dos llamadas a la vez no se cuelan). Devuelve si se
--     permitió, cuánto lleva y cuánto le queda.
--   * El día cambia a la medianoche de Guatemala (America/Guatemala), no en UTC.
--   * Solo la Edge Function (service_role) puede ejecutarla: ni la app ni anon.
--
-- ADITIVO / NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL Editor.
-- ORDEN: correrla ANTES de redesplegar ai-proxy (si la función no existe todavía,
-- ai-proxy sigue respondiendo sin tope y deja el aviso en sus registros).
-- ============================================================

create table if not exists public.ai_usage_daily (
  user_id uuid not null,
  day date not null,
  bucket text not null default 'chat' check (bucket in ('chat', 'short')),
  calls integer not null default 0 check (calls >= 0),
  primary key (user_id, day, bucket)
);

-- Solo el servidor toca esta tabla: RLS activada y SIN políticas (nadie desde la app).
alter table public.ai_usage_daily enable row level security;
revoke all on public.ai_usage_daily from public, anon, authenticated;

create index if not exists idx_ai_usage_daily_day on public.ai_usage_daily (day);

create or replace function public.ai_usage_take(
  p_user uuid,
  p_bucket text,
  p_limit integer,
  p_cost integer default 1
)
returns table (allowed boolean, used integer, remaining integer, day_gt date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'America/Guatemala')::date;
  v_used integer;
begin
  if p_user is null or p_bucket not in ('chat', 'short') or p_limit is null or p_cost is null or p_cost < 1 then
    raise exception 'ai_usage_take: parámetros inválidos';
  end if;

  -- Tope 0 (o un costo mayor que el tope) = sin acceso hoy; no se crea fila.
  if p_limit < 1 or p_cost > p_limit then
    return query select false, coalesce((select a.calls from public.ai_usage_daily a where a.user_id = p_user and a.day = v_day and a.bucket = p_bucket), 0), 0, v_day;
    return;
  end if;

  -- Suma solo si no se pasa del tope. Si la fila ya está en el tope, el DO UPDATE no aplica y no devuelve nada.
  insert into public.ai_usage_daily as a (user_id, day, bucket, calls)
  values (p_user, v_day, p_bucket, p_cost)
  on conflict (user_id, day, bucket) do update
    set calls = a.calls + p_cost
    where a.calls + p_cost <= p_limit
  returning a.calls into v_used;

  if v_used is null then
    select a.calls into v_used from public.ai_usage_daily a where a.user_id = p_user and a.day = v_day and a.bucket = p_bucket;
    return query select false, coalesce(v_used, 0), greatest(p_limit - coalesce(v_used, 0), 0), v_day;
    return;
  end if;

  -- Limpieza ocasional: lo de hace más de 35 días ya no sirve para nada.
  if random() < 0.01 then
    delete from public.ai_usage_daily d where d.day < v_day - 35;
  end if;

  return query select true, v_used, p_limit - v_used, v_day;
end;
$$;

revoke all on function public.ai_usage_take(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_usage_take(uuid, text, integer, integer) to service_role;

notify pgrst, 'reload schema';
