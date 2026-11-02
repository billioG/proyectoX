-- Aserciones sobre migrations/node-companion.sql (con las migraciones REALES de la mascota debajo). Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on
\ir ../../migrations/companion-species.sql
\ir ../../migrations/companion-collection.sql
\ir ../../migrations/companion-cosmetics.sql
\ir ../../migrations/node-companion.sql
\ir ../../migrations/node-companion.sql

insert into public.students (id, gems, gems_earned_total) values
  ('00000000-0000-0000-0000-00000000000a', 400, 650),
  ('00000000-0000-0000-0000-00000000000b', 10, 0);

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $f$
declare v_failed boolean := false; v_err text;
begin
  begin
    execute p_sql;
  exception when others then
    v_failed := true; v_err := sqlerrm;
  end;
  if not v_failed then raise exception 'DEBIO_FALLAR: % (esperaba %)', p_sql, p_msg; end if;
  if v_err not like '%' || p_msg || '%' then raise exception 'MENSAJE_DISTINTO: % (esperaba %)', v_err, p_msg; end if;
end $f$;

-- 1) Primera mascota: gratis, una sola vez.
do $$ begin
  perform apply_node_companion('00000000-0000-0000-0000-00000000000a', 'choose_companion', 'jaguar');
  if (select companion_species from public.students where id = '00000000-0000-0000-0000-00000000000a') <> 'jaguar' then raise exception 'ELIGE'; end if;
  if not exists (select 1 from public.student_companions where student_id = '00000000-0000-0000-0000-00000000000a' and species = 'jaguar') then raise exception 'COLECCION'; end if;
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000a', 'choose_companion', 'tucan')$q$, 'Ya elegiste tu primera mascota');
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000b', 'choose_companion', 'dragon')$q$, 'Mascota inválida');
end $$;

-- 2) Huevo: descuenta 150, pasa a ser la activa; no se repite; sin gemas falla con el faltante.
do $$ declare r jsonb; begin
  r := apply_node_companion('00000000-0000-0000-0000-00000000000a', 'buy_companion_egg', 'tucan');
  if (r->>'gems')::int <> 250 or (select gems from public.students where id = '00000000-0000-0000-0000-00000000000a') <> 250 then raise exception 'HUEVO_GEMAS: %', r; end if;
  if (select companion_species from public.students where id = '00000000-0000-0000-0000-00000000000a') <> 'tucan' then raise exception 'HUEVO_ACTIVA'; end if;
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000a', 'buy_companion_egg', 'tucan')$q$, 'Ya tenés esta mascota');
  perform apply_node_companion('00000000-0000-0000-0000-00000000000b', 'choose_companion', 'quetzal');
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000b', 'buy_companion_egg', 'manati')$q$, 'Te faltan 140 gemas');
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000c', 'choose_companion', 'quetzal')$q$, 'Solo los estudiantes');
end $$;

-- 3) Cambiar de compañero solo entre los que tiene.
do $$ begin
  perform apply_node_companion('00000000-0000-0000-0000-00000000000a', 'set_active_companion', 'jaguar');
  if (select companion_species from public.students where id = '00000000-0000-0000-0000-00000000000a') <> 'jaguar' then raise exception 'CAMBIA'; end if;
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000a', 'set_active_companion', 'manati')$q$, 'Todavía no tenés esa mascota');
end $$;

-- 4) Accesorios: comprar descuenta; gratis no se compra; etapa; ponerse y quitarse.
do $$ declare r jsonb; begin
  r := apply_node_companion('00000000-0000-0000-0000-00000000000a', 'buy_cosmetic', null, 'gorra');
  if (r->>'gems')::int <> 100 then raise exception 'COMPRA: %', r; end if;
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000a', 'buy_cosmetic', null, 'gorra')$q$, 'Ya lo tenés');
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000a', 'buy_cosmetic', null, 'lentes_nerd')$q$, 'gratis');
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000a', 'buy_cosmetic', null, 'skin_oro')$q$, 'no evolucionó');
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000a', 'buy_cosmetic', null, 'nada')$q$, 'no existe');
  r := apply_node_companion('00000000-0000-0000-0000-00000000000a', 'equip_cosmetic', null, 'gorra', 'head');
  if r->>'head' <> 'gorra' then raise exception 'EQUIPA: %', r; end if;
  r := apply_node_companion('00000000-0000-0000-0000-00000000000a', 'equip_cosmetic', null, 'lentes_nerd', 'face');
  if r->>'face' <> 'lentes_nerd' then raise exception 'GRATIS_EQUIPA: %', r; end if;
  r := apply_node_companion('00000000-0000-0000-0000-00000000000a', 'equip_cosmetic', null, null, 'head');
  if r ? 'head' then raise exception 'QUITA: %', r; end if;
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000a', 'equip_cosmetic', null, 'skin_neon', 'skin')$q$, 'Todavía no lo compraste');
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000a', 'equip_cosmetic', null, 'gorra', 'face')$q$, 'Accesorio inválido');
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000a', 'equip_cosmetic', null, null, 'oreja')$q$, 'Slot inválido');
  perform pg_temp.fails($q$select apply_node_companion('00000000-0000-0000-0000-00000000000a', 'dormir')$q$, 'Acción no soportada');
end $$;

-- 5) Permisos: solo service_role.
do $$ begin
  if has_function_privilege('anon', 'public.apply_node_companion(uuid,text,text,text,text)', 'execute') then raise exception 'ANON_EJECUTA'; end if;
  if has_function_privilege('authenticated', 'public.apply_node_companion(uuid,text,text,text,text)', 'execute') then raise exception 'AUTH_EJECUTA'; end if;
  if not has_function_privilege('service_role', 'public.apply_node_companion(uuid,text,text,text,text)', 'execute') then raise exception 'SERVICE_NO_EJECUTA'; end if;
end $$;

select 'COMPANION_SQL_OK' as resultado;
