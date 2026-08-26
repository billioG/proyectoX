-- Historial de la conversación con la mascota (antes se perdía al
-- cerrar el modal o cambiar de dispositivo).
create table if not exists public.mascot_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists idx_mascot_chat_user on public.mascot_chat_messages (user_id, created_at);

alter table public.mascot_chat_messages enable row level security;
create policy mascot_chat_own on public.mascot_chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
