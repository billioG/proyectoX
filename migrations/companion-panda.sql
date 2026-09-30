-- ============================================================
-- Quetzadex: agrega panda (11ª mascota, Temporada 2 -- fauna global
-- alineada al ODS 15, no es fauna de Guatemala como las otras 10, pero
-- cuida el mismo objetivo). Se compra con huevo (buy_companion_egg, 150
-- gemas), no es una de las 3 iniciales gratis.
--
-- Solo hace falta tocar el allowlist central (is_companion_species) y los
-- 2 check constraints que lo reflejan -- buy_companion_egg y
-- set_active_companion ya llaman a is_companion_species() en vez de tener
-- su propia lista, así que no hace falta tocarlos.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL
-- Editor de Supabase. Requiere companion-more.sql ya corrida.
-- ============================================================

alter table public.students drop constraint if exists students_companion_species_check;
alter table public.students add constraint students_companion_species_check
  check (companion_species in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati', 'guacamaya', 'danta', 'pizote', 'armadillo', 'panda'));

alter table public.student_companions drop constraint if exists student_companions_species_check;
alter table public.student_companions add constraint student_companions_species_check
  check (species in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati', 'guacamaya', 'danta', 'pizote', 'armadillo', 'panda'));

create or replace function public.is_companion_species(p text)
returns boolean language sql immutable as $$
  select p in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati', 'guacamaya', 'danta', 'pizote', 'armadillo', 'panda');
$$;

notify pgrst, 'reload schema';
