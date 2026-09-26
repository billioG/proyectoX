-- ============================================================
-- "¿Sabías que?" al terminar un duelo: un dato educativo del tema que
-- genera la IA junto con el contenido del duelo. Vive en una tabla
-- aparte, sin acceso directo del cliente: podría delatar la respuesta
-- (ej. un dato sobre la palabra del ahorcado), así que solo se entrega
-- vía get_duel_fact() a quien YA jugó ese duelo.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create table if not exists public.duel_facts (
  game text not null check (game in ('quiz', 'hangman', 'spelling', 'debug')),
  duel_id uuid not null,
  fact text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (game, duel_id)
);

alter table public.duel_facts enable row level security;
revoke all on public.duel_facts from anon, authenticated;

create or replace function public.get_duel_fact(p_game text, p_duel_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_played boolean;
begin
  v_played := case p_game
    when 'quiz' then exists (select 1 from public.student_duel_answers where duel_id = p_duel_id and student_id = auth.uid())
    when 'hangman' then exists (select 1 from public.student_hangman_results where duel_id = p_duel_id and student_id = auth.uid())
    when 'spelling' then exists (select 1 from public.student_spelling_results where duel_id = p_duel_id and student_id = auth.uid())
    when 'debug' then exists (select 1 from public.student_debug_results where duel_id = p_duel_id and student_id = auth.uid())
    else false
  end;
  if not v_played then return null; end if;
  return (select fact from public.duel_facts where game = p_game and duel_id = p_duel_id);
end;
$$;

grant execute on function public.get_duel_fact(text, uuid) to authenticated;

notify pgrst, 'reload schema';
