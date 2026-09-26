-- ============================================================
-- Pase de Temporada (gratis, estilo Clash Royale). Una temporada por mes
-- calendario (hora de Guatemala). El XP ganado en el mes sube de nivel
-- (50 XP por nivel, 30 niveles); cada nivel tiene un premio que se
-- reclama a mano. Los premios los define SOLO el servidor
-- (season_reward_json) -- el cliente los lee de get_season_pass().
-- Sin compras con dinero ni premios al azar.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase. Requiere companion-cosmetics.sql.
-- ============================================================

-- 1. XP de la temporada, contado automáticamente cada vez que sube students.xp
alter table public.students add column if not exists season_id text;
alter table public.students add column if not exists season_xp integer not null default 0;

create or replace function public.current_season_id()
returns text
language sql
stable
as $$ select to_char(now() at time zone 'America/Guatemala', 'YYYY-MM'); $$;

create or replace function public.track_season_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season text := public.current_season_id();
begin
  if coalesce(new.xp, 0) > coalesce(old.xp, 0) then
    if coalesce(old.season_id, '') <> v_season then
      new.season_id := v_season;
      new.season_xp := 0;
    end if;
    new.season_xp := coalesce(new.season_xp, 0) + (new.xp - coalesce(old.xp, 0));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_track_season_xp on public.students;
create trigger trg_track_season_xp
before update on public.students
for each row execute function public.track_season_xp();

-- 2. Accesorios exclusivos del pase (no se compran con gemas)
alter table public.cosmetic_items add column if not exists pass_only boolean not null default false;

insert into public.cosmetic_items (id, slot, name, price, min_stage, sort, pass_only) values
  ('gorro_quetzal', 'head', 'Gorro quetzal',  0, 0, 50, true),
  ('alas_mariposa', 'back', 'Alas de mariposa', 0, 0, 30, true),
  ('skin_galaxia',  'skin', 'Traje galaxia',  0, 0, 40, true)
on conflict (id) do update
  set slot = excluded.slot, name = excluded.name, price = excluded.price,
      min_stage = excluded.min_stage, sort = excluded.sort, pass_only = excluded.pass_only;

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
  if v_item.pass_only then raise exception 'Este solo se consigue en el Pase de Temporada'; end if;
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
    if (v_item.price > 0 or v_item.pass_only) and not exists (
      select 1 from public.student_cosmetics where student_id = auth.uid() and item_id = p_item
    ) then
      raise exception 'Todavía no lo tenés';
    end if;
    v_equipped := jsonb_set(v_equipped, array[p_slot], to_jsonb(p_item));
  end if;

  update public.students set companion_equipped = v_equipped where id = auth.uid();
  return v_equipped;
end;
$$;

-- 3. Premios y reclamos
create table if not exists public.season_claims (
  student_id uuid not null references public.students(id) on delete cascade,
  season_id text not null,
  level integer not null check (level between 1 and 30),
  claimed_at timestamptz not null default timezone('utc', now()),
  primary key (student_id, season_id, level)
);
alter table public.season_claims enable row level security;
revoke all on public.season_claims from anon, authenticated;
grant select on public.season_claims to authenticated;
drop policy if exists "season_claims_select_own" on public.season_claims;
create policy "season_claims_select_own" on public.season_claims for select using (student_id = auth.uid());

create or replace function public.season_reward_json(p_level integer)
returns jsonb
language sql
immutable
as $$
  select case p_level
    when 10 then jsonb_build_object('type', 'cosmetic', 'item', 'gorro_quetzal')
    when 20 then jsonb_build_object('type', 'cosmetic', 'item', 'alas_mariposa')
    when 30 then jsonb_build_object('type', 'cosmetic', 'item', 'skin_galaxia')
    when 5 then jsonb_build_object('type', 'gems', 'amount', 50)
    when 15 then jsonb_build_object('type', 'gems', 'amount', 100)
    when 25 then jsonb_build_object('type', 'gems', 'amount', 150)
    else jsonb_build_object('type', 'gems', 'amount', 10 + (p_level / 5) * 5)
  end;
$$;

create or replace function public.get_season_pass()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season text := public.current_season_id();
  v_xp integer;
  v_sid text;
  v_claimed jsonb;
  v_ends timestamp;
begin
  select season_id, coalesce(season_xp, 0) into v_sid, v_xp from public.students where id = auth.uid();
  if not found then raise exception 'Solo los estudiantes tienen Pase de Temporada'; end if;
  if coalesce(v_sid, '') <> v_season then v_xp := 0; end if;

  select coalesce(jsonb_agg(level order by level), '[]'::jsonb) into v_claimed
    from public.season_claims where student_id = auth.uid() and season_id = v_season;

  v_ends := date_trunc('month', now() at time zone 'America/Guatemala') + interval '1 month';

  return jsonb_build_object(
    'season_id', v_season,
    'xp', v_xp,
    'xp_per_level', 50,
    'max_level', 30,
    'level', least(30, v_xp / 50),
    'claimed', v_claimed,
    'ends_at', to_char(v_ends, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'rewards', (select jsonb_agg(public.season_reward_json(l) || jsonb_build_object('level', l) order by l) from generate_series(1, 30) l)
  );
end;
$$;

create or replace function public.claim_season_reward(p_level integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season text := public.current_season_id();
  v_xp integer;
  v_sid text;
  v_reward jsonb;
  v_gems integer := 0;
begin
  select season_id, coalesce(season_xp, 0) into v_sid, v_xp from public.students where id = auth.uid() for update;
  if not found then raise exception 'Solo los estudiantes tienen Pase de Temporada'; end if;
  if coalesce(v_sid, '') <> v_season then v_xp := 0; end if;
  if p_level < 1 or p_level > least(30, v_xp / 50) then raise exception 'Todavía no llegaste a ese nivel'; end if;

  insert into public.season_claims (student_id, season_id, level) values (auth.uid(), v_season, p_level)
    on conflict do nothing;
  if not found then raise exception 'Ya reclamaste ese premio'; end if;

  v_reward := public.season_reward_json(p_level);
  if v_reward->>'type' = 'gems' then
    v_gems := (v_reward->>'amount')::int;
  else
    insert into public.student_cosmetics (student_id, item_id) values (auth.uid(), v_reward->>'item')
      on conflict do nothing;
    if not found then v_gems := 100; end if; -- ya lo tenía: compensación en gemas
  end if;

  if v_gems > 0 then
    update public.students set gems = coalesce(gems, 0) + v_gems where id = auth.uid();
  end if;

  return v_reward || jsonb_build_object('gems_granted', v_gems);
end;
$$;

grant execute on function public.get_season_pass() to authenticated;
grant execute on function public.claim_season_reward(integer) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICAR (consola, logueado como estudiante):
--   await window._supabase.rpc('get_season_pass')          -> debe devolver el pase
--   await window._supabase.rpc('claim_season_reward', { p_level: 30 })  -> "Todavía no llegaste a ese nivel"
-- ============================================================
