-- ============================================================
-- Accesorios y trajes para las mascotas (estilo Free Fire).
--   - cosmetic_items: catálogo (precio y etapa mínima viven SOLO acá; el
--     cliente lo lee de esta tabla, no puede inventar precios).
--   - student_cosmetics: lo que cada alumno compró.
--   - students.companion_equipped: lo que tiene puesto, por slot.
--   Ítems con price = 0 se desbloquean gratis al llegar a min_stage.
--   Sin azar: siempre se sabe qué se compra (nada de cajas sorpresa).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create table if not exists public.cosmetic_items (
  id text primary key,
  slot text not null check (slot in ('head', 'face', 'back', 'skin')),
  name text not null,
  price integer not null default 0 check (price >= 0),
  min_stage integer not null default 0 check (min_stage between 0 and 5),
  sort integer not null default 0
);

insert into public.cosmetic_items (id, slot, name, price, min_stage, sort) values
  ('lentes_nerd',     'face', 'Lentes de estudio', 0,   1, 10),
  ('lentes_sol',      'face', 'Lentes de sol',     120, 1, 20),
  ('antifaz',         'face', 'Antifaz ninja',     220, 2, 30),
  ('corona_flores',   'head', 'Corona de flores',  0,   2, 10),
  ('gorra',           'head', 'Gorra',             150, 1, 20),
  ('audifonos',       'head', 'Audífonos gamer',   260, 2, 30),
  ('sombrero',        'head', 'Sombrero vaquero',  320, 3, 40),
  ('capa_heroe',      'back', 'Capa de héroe',     350, 3, 10),
  ('capa_legendaria', 'back', 'Capa legendaria',   0,   5, 20),
  ('skin_neon',       'skin', 'Traje neón',        500, 3, 10),
  ('skin_sombra',     'skin', 'Traje sombra',      650, 4, 20),
  ('skin_oro',        'skin', 'Traje dorado',      900, 4, 30)
on conflict (id) do update
  set slot = excluded.slot, name = excluded.name, price = excluded.price,
      min_stage = excluded.min_stage, sort = excluded.sort;

create table if not exists public.student_cosmetics (
  student_id uuid not null references public.students(id) on delete cascade,
  item_id text not null references public.cosmetic_items(id) on delete cascade,
  acquired_at timestamptz not null default timezone('utc', now()),
  primary key (student_id, item_id)
);

alter table public.students add column if not exists companion_equipped jsonb not null default '{}'::jsonb;

alter table public.cosmetic_items enable row level security;
alter table public.student_cosmetics enable row level security;

revoke all on public.cosmetic_items from anon, authenticated;
grant select on public.cosmetic_items to authenticated;
drop policy if exists "cosmetic_items_select_all" on public.cosmetic_items;
create policy "cosmetic_items_select_all" on public.cosmetic_items for select using (true);

revoke all on public.student_cosmetics from anon, authenticated;
grant select on public.student_cosmetics to authenticated;
drop policy if exists "student_cosmetics_select_own" on public.student_cosmetics;
create policy "student_cosmetics_select_own" on public.student_cosmetics for select using (student_id = auth.uid());

-- Mismos umbrales que STAGE_THRESHOLDS en js/companion.js.
create or replace function public.companion_stage(p_total integer)
returns integer
language sql
immutable
as $$
  select case
    when p_total >= 1600 then 5
    when p_total >= 1000 then 4
    when p_total >= 600 then 3
    when p_total >= 300 then 2
    when p_total >= 100 then 1
    else 0 end;
$$;

create or replace function public.buy_cosmetic(p_item text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_student record;
begin
  select * into v_item from public.cosmetic_items where id = p_item;
  if v_item is null then raise exception 'Ese accesorio no existe'; end if;
  if v_item.price = 0 then raise exception 'Este se desbloquea gratis al evolucionar'; end if;

  select id, coalesce(gems, 0) as gems, coalesce(gems_earned_total, 0) as earned
    into v_student from public.students where id = auth.uid() for update;
  if v_student is null then raise exception 'Solo los estudiantes pueden comprar'; end if;

  if public.companion_stage(v_student.earned) < v_item.min_stage then
    raise exception 'Tu mascota todavía no evolucionó lo suficiente';
  end if;
  if exists (select 1 from public.student_cosmetics where student_id = auth.uid() and item_id = p_item) then
    raise exception 'Ya lo tenés';
  end if;
  if v_student.gems < v_item.price then
    raise exception 'No tenés suficientes gemas';
  end if;

  update public.students set gems = gems - v_item.price where id = auth.uid();
  insert into public.student_cosmetics (student_id, item_id) values (auth.uid(), p_item);
  return jsonb_build_object('gems', v_student.gems - v_item.price);
end;
$$;

-- p_item null = quitar lo que haya en ese slot.
create or replace function public.equip_cosmetic(p_slot text, p_item text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_earned integer;
  v_equipped jsonb;
begin
  if p_slot not in ('head', 'face', 'back', 'skin') then raise exception 'Slot inválido'; end if;

  select coalesce(gems_earned_total, 0), coalesce(companion_equipped, '{}'::jsonb)
    into v_earned, v_equipped from public.students where id = auth.uid();
  if not found then raise exception 'Solo los estudiantes tienen mascota'; end if;

  if p_item is null then
    v_equipped := v_equipped - p_slot;
  else
    select * into v_item from public.cosmetic_items where id = p_item;
    if v_item is null or v_item.slot <> p_slot then raise exception 'Accesorio inválido'; end if;
    if public.companion_stage(v_earned) < v_item.min_stage then
      raise exception 'Tu mascota todavía no evolucionó lo suficiente';
    end if;
    if v_item.price > 0 and not exists (
      select 1 from public.student_cosmetics where student_id = auth.uid() and item_id = p_item
    ) then
      raise exception 'Todavía no lo compraste';
    end if;
    v_equipped := jsonb_set(v_equipped, array[p_slot], to_jsonb(p_item));
  end if;

  update public.students set companion_equipped = v_equipped where id = auth.uid();
  return v_equipped;
end;
$$;

grant execute on function public.buy_cosmetic(text) to authenticated;
grant execute on function public.equip_cosmetic(text, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICAR (consola, logueado como estudiante) -- debe fallar con
-- "permission denied":
--   await window._supabase.from('student_cosmetics').insert({ student_id: window.currentUser.id, item_id: 'skin_oro' })
-- ============================================================
