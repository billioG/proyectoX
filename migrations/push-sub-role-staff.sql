-- Notificaciones push de administradores y coordinadores.
-- register_push_subscription() ya guarda role 'admin' / 'coordinador' (y notify-rock-pending busca role = 'admin'), pero la restricción
-- push_subscriptions_role_check solo dejaba 'estudiante' y 'docente': al activar las notificaciones un administrador recibía
-- «new row for relation "push_subscriptions" violates check constraint "push_subscriptions_role_check"» (400) y no se suscribía.
-- Es seguro repetirla.
alter table public.push_subscriptions drop constraint if exists push_subscriptions_role_check;
alter table public.push_subscriptions add constraint push_subscriptions_role_check
  check (role in ('estudiante', 'docente', 'admin', 'coordinador'));
notify pgrst, 'reload schema';
