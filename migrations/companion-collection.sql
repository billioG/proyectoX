-- ============================================================
-- Quetzadex: más mascotas (fauna de Guatemala) y colección.
--
-- - 3 especies nuevas: tucán, saraguate, manatí (6 en total).
-- - La primera mascota sigue siendo gratis (choose_companion). Las demás
--   se consiguen comprando su huevo con gemas (buy_companion_egg, 150).
-- - El alumno elige cuál lo acompaña (set_active_companion). Todas
--   comparten la etapa de evolución (sale de gems_earned_total).
-- - student_companions: qué especies tiene cada alumno. Se rellena con la
--   mascota que ya tenía cada uno.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase. Requiere companion-species.sql y
-- duel-rewards-live-gems.sql (para el motivo del gasto en el historial).
-- ============================================================

alter table public.students drop constraint if exists students_companion_species_check;
alter table public.students add constraint students_companion_species_check
  check (companion_species in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati'));

create table if not exists public.student_companions (
  student_id uuid not null references public.students(id) on delete cascade,
  species text not null check (species in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati')),
  obtained_at timestamptz not null default now(),
  primary key (student_id, species)
);
alter table public.student_companions enable row level security;
drop policy if exists "student_companions_select_own" on public.student_companions;
create policy "student_companions_select_own" on public.student_companions
  for select to authenticated using (student_id = auth.uid());
revoke all on public.student_companions from anon, authenticated;
grant select on public.student_companions to authenticated;

insert into public.student_companions (student_id, species)
select id, companion_species from public.students where companion_species is not null
on conflict do nothing;

-- Primera mascota (gratis, una sola vez).
create or replace function public.choose_companion(p_species text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if p_species not in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati') then
    raise exception 'Mascota inválida';
  end if;
  select companion_species into v_current from public.students where id = auth.uid();
  if not found then raise exception 'Solo los estudiantes tienen mascota'; end if;
  if v_current is not null then raise exception 'Ya elegiste tu primera mascota: las demás se consiguen en la Quetzadex'; end if;

  update public.students set companion_species = p_species where id = auth.uid();
  insert into public.student_companions (student_id, species) values (auth.uid(), p_species) on conflict do nothing;
  return p_species;
end;
$$;
grant execute on function public.choose_companion(text) to authenticated;

-- Huevo de otra especie: 150 gemas, pasa a ser el compañero activo.
create or replace function public.buy_companion_egg(p_species text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price constant integer := 150;
  v_me record;
begin
  if p_species not in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati') then
    raise exception 'Mascota inválida';
  end if;
  select id, coalesce(gems, 0) as gems, companion_species into v_me
    from public.students where id = auth.uid() for update;
  if v_me.id is null then raise exception 'Solo los estudiantes tienen mascota'; end if;
  if v_me.companion_species is null then raise exception 'Primero elegí tu mascota inicial (es gratis)'; end if;
  if exists (select 1 from public.student_companions where student_id = auth.uid() and species = p_species) then
    raise exception 'Ya tenés esta mascota';
  end if;
  if v_me.gems < v_price then
    raise exception 'Te faltan % gemas para este huevo', v_price - v_me.gems;
  end if;

  perform set_config('quetzal.gem_reason', 'companion_egg', true);
  update public.students set gems = gems - v_price, companion_species = p_species where id = auth.uid();
  perform set_config('quetzal.gem_reason', '', true);
  insert into public.student_companions (student_id, species) values (auth.uid(), p_species);

  return jsonb_build_object('species', p_species, 'gems', v_me.gems - v_price);
end;
$$;
grant execute on function public.buy_companion_egg(text) to authenticated;

-- Cambiar de compañero (solo entre los que ya tiene).
create or replace function public.set_active_companion(p_species text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.student_companions where student_id = auth.uid() and species = p_species) then
    raise exception 'Todavía no tenés esa mascota';
  end if;
  update public.students set companion_species = p_species where id = auth.uid();
  return p_species;
end;
$$;
grant execute on function public.set_active_companion(text) to authenticated;

notify pgrst, 'reload schema';
