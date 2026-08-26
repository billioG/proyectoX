alter table public.push_subscriptions add column if not exists role text not null default 'estudiante'
  check (role in ('estudiante', 'docente'));
notify pgrst, 'reload schema';
