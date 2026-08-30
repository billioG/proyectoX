-- Rate limit por IP para student-login -- endpoint público (necesario, es
-- el login en sí) que valida contra una contraseña de CLASE compartida
-- entre toda una sección, sin límite de intentos visible en el código
-- anterior. Solo la Edge Function (service role) toca esta tabla -- RLS
-- sin políticas para que ningún cliente pueda leerla/tocarla ni por error.

create table if not exists public.login_rate_limit (
  ip text primary key,
  attempts integer not null default 1,
  window_start timestamptz not null default now()
);

alter table public.login_rate_limit enable row level security;

notify pgrst, 'reload schema';
