-- Aserciones sobre migrations/ai-usage-limit.sql. Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on
\ir ../../migrations/ai-usage-limit.sql
\ir ../../migrations/ai-usage-limit.sql

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $f$
declare v_failed boolean := false; v_err text;
begin
  begin execute p_sql; exception when others then v_failed := true; v_err := sqlerrm; end;
  if not v_failed then raise exception 'DEBIO_FALLAR: % (esperaba %)', p_sql, p_msg; end if;
  if v_err not like '%' || p_msg || '%' then raise exception 'MENSAJE_DISTINTO: % (esperaba %)', v_err, p_msg; end if;
end $f$;
grant execute on function pg_temp.fails(text, text) to public;

-- 1) Hasta el tope se permite y se cuenta; al llegar, se niega sin pasarse; lo restante baja de uno en uno.
do $$ declare r record; i int; begin
  for i in 1..3 loop
    select * into r from public.ai_usage_take('00000000-0000-0000-0000-0000000000a1', 'chat', 3);
    if not r.allowed or r.used <> i or r.remaining <> 3 - i then raise exception 'HASTA_EL_TOPE %: % % %', i, r.allowed, r.used, r.remaining; end if;
  end loop;
  select * into r from public.ai_usage_take('00000000-0000-0000-0000-0000000000a1', 'chat', 3);
  if r.allowed or r.used <> 3 or r.remaining <> 0 then raise exception 'PASO_EL_TOPE: % % %', r.allowed, r.used, r.remaining; end if;
  select * into r from public.ai_usage_take('00000000-0000-0000-0000-0000000000a1', 'chat', 3);
  if r.allowed or r.used <> 3 then raise exception 'SIGUE_NEGADO'; end if;
end $$;

-- 2) Cada usuario y cada tipo de uso cuentan aparte.
do $$ declare r record; begin
  select * into r from public.ai_usage_take('00000000-0000-0000-0000-0000000000a2', 'chat', 3);
  if not r.allowed or r.used <> 1 then raise exception 'OTRO_USUARIO'; end if;
  select * into r from public.ai_usage_take('00000000-0000-0000-0000-0000000000a1', 'short', 3);
  if not r.allowed or r.used <> 1 then raise exception 'OTRO_TIPO'; end if;
end $$;

-- 3) El costo se suma entero y no se pasa del tope: con 3 de tope y 2 usados, un costo de 2 se niega y no cambia nada.
do $$ declare r record; begin
  perform public.ai_usage_take('00000000-0000-0000-0000-0000000000a3', 'chat', 3, 2);
  select * into r from public.ai_usage_take('00000000-0000-0000-0000-0000000000a3', 'chat', 3, 2);
  if r.allowed or r.used <> 2 or r.remaining <> 1 then raise exception 'COSTO_PASADO: % % %', r.allowed, r.used, r.remaining; end if;
  select * into r from public.ai_usage_take('00000000-0000-0000-0000-0000000000a3', 'chat', 3, 1);
  if not r.allowed or r.used <> 3 then raise exception 'COSTO_UNO'; end if;
end $$;

-- 4) Tope 0 = sin acceso y no deja fila; un costo mayor que el tope tampoco.
do $$ declare r record; begin
  select * into r from public.ai_usage_take('00000000-0000-0000-0000-0000000000a4', 'chat', 0);
  if r.allowed or r.remaining <> 0 then raise exception 'TOPE_CERO'; end if;
  select * into r from public.ai_usage_take('00000000-0000-0000-0000-0000000000a4', 'chat', 2, 5);
  if r.allowed then raise exception 'COSTO_MAYOR'; end if;
  if exists (select 1 from public.ai_usage_daily where user_id = '00000000-0000-0000-0000-0000000000a4') then raise exception 'FILA_FANTASMA'; end if;
end $$;

-- 5) Atómico: 60 llamadas en UNA sola sentencia con tope 10 permiten exactamente 10.
do $$ declare n int; begin
  select count(*) filter (where t.allowed) into n from generate_series(1, 60) g, lateral public.ai_usage_take('00000000-0000-0000-0000-0000000000a5', 'chat', 10 + g * 0) t; -- el argumento depende de g: si no, Postgres llamaría a la función UNA sola vez
  if n <> 10 then raise exception 'ATOMICO: %', n; end if;
  if (select calls from public.ai_usage_daily where user_id = '00000000-0000-0000-0000-0000000000a5') <> 10 then raise exception 'ATOMICO_FILA'; end if;
end $$;

-- 6) Parámetros inválidos.
select pg_temp.fails($q$select * from public.ai_usage_take(null, 'chat', 3)$q$, 'parámetros inválidos');
select pg_temp.fails($q$select * from public.ai_usage_take('00000000-0000-0000-0000-0000000000a6', 'otro', 3)$q$, 'parámetros inválidos');
select pg_temp.fails($q$select * from public.ai_usage_take('00000000-0000-0000-0000-0000000000a6', 'chat', 3, 0)$q$, 'parámetros inválidos');
select pg_temp.fails($q$select * from public.ai_usage_take('00000000-0000-0000-0000-0000000000a6', 'chat', null)$q$, 'parámetros inválidos');

-- 7) El día es el de Guatemala (UTC-6), no el de UTC.
do $$ begin
  if (select day_gt from public.ai_usage_take('00000000-0000-0000-0000-0000000000a7', 'chat', 3)) <> (now() at time zone 'America/Guatemala')::date then raise exception 'DIA_GUATEMALA'; end if;
end $$;

-- 8) Permisos: solo service_role la ejecuta; ni anon ni la app (authenticated); nadie lee ni escribe la tabla.
set role anon;
select pg_temp.fails($q$select * from public.ai_usage_take('00000000-0000-0000-0000-0000000000a1', 'chat', 99)$q$, 'permission denied');
select pg_temp.fails($q$select * from public.ai_usage_daily$q$, 'permission denied');
reset role;
set role authenticated;
select pg_temp.fails($q$select * from public.ai_usage_take('00000000-0000-0000-0000-0000000000a1', 'chat', 99)$q$, 'permission denied');
select pg_temp.fails($q$select * from public.ai_usage_daily$q$, 'permission denied');
select pg_temp.fails($q$delete from public.ai_usage_daily$q$, 'permission denied');
reset role;
set role service_role;
do $$ declare r record; begin select * into r from public.ai_usage_take('00000000-0000-0000-0000-0000000000a8', 'chat', 5); if not r.allowed then raise exception 'SERVICE_ROLE'; end if; end $$;
reset role;

-- 9) El uso de hoy se cuenta bien aunque corra la limpieza (que es aleatoria, 1 %).
do $$ declare i int; begin for i in 1..400 loop perform public.ai_usage_take('00000000-0000-0000-0000-0000000000aa', 'chat', 100000); end loop; end $$;
do $$ begin
  if (select calls from public.ai_usage_daily where user_id = '00000000-0000-0000-0000-0000000000aa') <> 400 then raise exception 'LIMPIEZA_TOCO_HOY'; end if;
end $$;

select 'AIQUOTA_SQL_OK';
