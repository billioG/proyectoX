-- ============================================================
-- MASCOTA DE ESTUDIANTE -- gemas totales ganadas en la vida
--
-- La mascota (js/companion.js) evoluciona según cuánto ganó el
-- estudiante EN TOTAL, no su saldo actual -- si gasta gemas después no
-- "retrocede". El saldo actual (students.gems) sube y baja todo el
-- tiempo desde decenas de lugares del código (recompensas, duelos,
-- tienda, torneos, bonos...) -- en vez de tocar cada uno de esos sitios
-- para también sumar a un contador aparte, un trigger en la propia
-- tabla `students` detecta CUALQUIER aumento de `gems` (sin importar
-- desde dónde vino) y lo suma a `gems_earned_total` automáticamente.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

alter table public.students add column if not exists gems_earned_total integer not null default 0;

-- Backfill -- sin datos históricos de cuánto ganó cada quien, se arranca
-- con su saldo actual como piso razonable (nunca queda peor que hoy).
update public.students set gems_earned_total = coalesce(gems, 0) where gems_earned_total = 0;

create or replace function public.track_gems_earned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.gems > old.gems then
    new.gems_earned_total := old.gems_earned_total + (new.gems - old.gems);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_track_gems_earned on public.students;
create trigger trg_track_gems_earned
before update on public.students
for each row execute function public.track_gems_earned();
