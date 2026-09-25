-- ============================================================
-- Mascotas elegibles: cada estudiante elige UNA especie inicial (quetzal,
-- jaguar o tortuga) una sola vez, estilo Pokémon. La etapa de evolución
-- sigue saliendo de gems_earned_total (companion-gems-total.sql), así que
-- nadie pierde el progreso que ya tenía.
--
-- La columna NO es escribible desde el cliente (el grant de UPDATE sobre
-- students es por lista de columnas, ver economy-server-side-fix2.sql, y
-- esta columna nueva no está en esa lista) -- solo vía choose_companion().
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

alter table public.students add column if not exists companion_species text
  check (companion_species in ('quetzal', 'jaguar', 'tortuga'));

create or replace function public.choose_companion(p_species text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if p_species not in ('quetzal', 'jaguar', 'tortuga') then
    raise exception 'Mascota inválida';
  end if;

  select companion_species into v_current from public.students where id = auth.uid();
  if not found then
    raise exception 'Solo los estudiantes tienen mascota';
  end if;
  if v_current is not null then
    raise exception 'Ya elegiste tu mascota';
  end if;

  update public.students set companion_species = p_species where id = auth.uid();
  return p_species;
end;
$$;

grant execute on function public.choose_companion(text) to authenticated;

notify pgrst, 'reload schema';
