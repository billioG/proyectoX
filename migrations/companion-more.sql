-- ============================================================
-- Quetzadex ampliada: 4 mascotas más (guacamaya, danta, pizote,
-- armadillo -> 10 en total), 12 accesorios nuevos y videos por especie.
--
-- Videos: una fila por especie en companion_videos con una URL de YouTube
-- o de un .mp4 (por ejemplo subido a Supabase Storage). La ficha de la
-- mascota muestra "Ver video" solo si hay fila. Ejemplo:
--   insert into public.companion_videos (species, url, title, credit)
--   values ('quetzal', 'https://www.youtube.com/watch?v=XXXXXXXXXXX',
--           'El quetzal en el bosque nuboso', 'CONAP')
--   on conflict (species) do update set url = excluded.url, title = excluded.title, credit = excluded.credit;
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase. Requiere companion-collection.sql.
-- ============================================================

-- ---------- especies válidas (10) ----------
alter table public.students drop constraint if exists students_companion_species_check;
alter table public.students add constraint students_companion_species_check
  check (companion_species in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati', 'guacamaya', 'danta', 'pizote', 'armadillo'));

alter table public.student_companions drop constraint if exists student_companions_species_check;
alter table public.student_companions add constraint student_companions_species_check
  check (species in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati', 'guacamaya', 'danta', 'pizote', 'armadillo'));

create or replace function public.is_companion_species(p text)
returns boolean language sql immutable as $$
  select p in ('quetzal', 'jaguar', 'tortuga', 'tucan', 'saraguate', 'manati', 'guacamaya', 'danta', 'pizote', 'armadillo');
$$;

create or replace function public.choose_companion(p_species text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if not public.is_companion_species(p_species) then raise exception 'Mascota inválida'; end if;
  select companion_species into v_current from public.students where id = auth.uid();
  if not found then raise exception 'Solo los estudiantes tienen mascota'; end if;
  if v_current is not null then raise exception 'Ya elegiste tu primera mascota: las demás se consiguen en la Quetzadex'; end if;

  update public.students set companion_species = p_species where id = auth.uid();
  insert into public.student_companions (student_id, species) values (auth.uid(), p_species) on conflict do nothing;
  return p_species;
end;
$$;
grant execute on function public.choose_companion(text) to authenticated;

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
  if not public.is_companion_species(p_species) then raise exception 'Mascota inválida'; end if;
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

-- ---------- accesorios nuevos ----------
insert into public.cosmetic_items (id, slot, name, price, min_stage, sort) values
  ('gorro_lana',       'head', 'Gorro de lana',             100, 1, 60),
  ('casco_ingeniero',  'head', 'Casco de ingeniero',        180, 1, 70),
  ('gorro_graduacion', 'head', 'Birrete de graduación',     250, 2, 80),
  ('tocado_maya',      'head', 'Tocado maya',               450, 3, 90),
  ('bigote',           'face', 'Bigote elegante',            90, 1, 40),
  ('lentes_corazon',   'face', 'Lentes de corazón',         160, 1, 50),
  ('lentes_vr',        'face', 'Lentes de realidad virtual', 320, 2, 60),
  ('mochila',          'back', 'Mochila escolar',           140, 1, 40),
  ('alas_angel',       'back', 'Alas de ángel',             380, 2, 50),
  ('jetpack',          'back', 'Jetpack',                   480, 3, 60),
  ('skin_hielo',       'skin', 'Traje de hielo',            600, 3, 50),
  ('skin_arcoiris',    'skin', 'Traje arcoíris',            750, 4, 60)
on conflict (id) do update
  set slot = excluded.slot, name = excluded.name, price = excluded.price,
      min_stage = excluded.min_stage, sort = excluded.sort;

-- ---------- videos por especie ----------
create table if not exists public.companion_videos (
  species text primary key,
  url text not null,
  title text,
  credit text,
  updated_at timestamptz not null default now()
);
alter table public.companion_videos enable row level security;
drop policy if exists "companion_videos_select" on public.companion_videos;
create policy "companion_videos_select" on public.companion_videos
  for select to authenticated using (true);
drop policy if exists "companion_videos_admin" on public.companion_videos;
create policy "companion_videos_admin" on public.companion_videos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.companion_videos from anon;
grant select, insert, update, delete on public.companion_videos to authenticated;

notify pgrst, 'reload schema';
