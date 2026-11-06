-- Aserciones: migrations/random-event-settle-atomic.sql. Cada bloque lanza una excepción con su nombre si falla.
\set ON_ERROR_STOP on
\ir ../../migrations/random-event-settle-atomic.sql
\ir ../../migrations/random-event-settle-atomic.sql

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $f$
declare v_failed boolean := false; v_err text;
begin
  begin execute p_sql; exception when others then v_failed := true; v_err := sqlerrm; end;
  if not v_failed then raise exception 'DEBIO_FALLAR: % (esperaba %)', p_sql, p_msg; end if;
  if v_err not like '%' || p_msg || '%' then raise exception 'MENSAJE_DISTINTO: % (esperaba %)', v_err, p_msg; end if;
end $f$;
grant execute on function pg_temp.fails(text, text) to public;

-- Evento de estudiantes: 7 participantes que entregaron + 1 que no entregó. Premio 100: 35/25/20/12/8 y el 6.º y 7.º, nada.
insert into public.students (id, gems) select ('00000000-0000-0000-0000-00000000010' || g)::uuid, 10 from generate_series(1, 8) g;
insert into public.random_events (id, gem_pool, status) values ('00000000-0000-0000-0000-0000000000e1', 100, 'active');
insert into public.event_participants (event_id, user_id, submitted_at, score, time_taken_ms) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000101', now(), 8, 30000),   -- empata en 8 pero más lento
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000102', now(), 8, 20000),   -- 1.º (8 aciertos, más rápido)
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000103', now(), 7, 10000),   -- 3.º
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000104', now(), 5, 15000),   -- 4.º
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000105', now(), 5, 40000),   -- 5.º
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000106', now(), 2, 5000),    -- 6.º: sin premio
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000107', now(), null, null), -- sin puntaje: al final
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000108', null, 9, 1000);     -- NO entregó: no cuenta aunque tenga puntaje

-- Una ganancia de gemas por otro lado, ANTES de liquidar (la liquidación vieja la pisaba con el valor que había leído).
update public.students set gems = gems + 5 where id = '00000000-0000-0000-0000-000000000102';

do $$ declare n int; begin
  n := public.settle_random_event('00000000-0000-0000-0000-0000000000e1');
  if n <> 5 then raise exception 'PREMIADOS: %', n; end if;
  if (select status from public.random_events where id = '00000000-0000-0000-0000-0000000000e1') <> 'completed' then raise exception 'NO_COMPLETO'; end if;
  -- puestos
  if (select string_agg(user_id::text || ':' || rank, ',' order by rank) from public.event_participants where submitted_at is not null)
     <> '00000000-0000-0000-0000-000000000102:1,00000000-0000-0000-0000-000000000101:2,00000000-0000-0000-0000-000000000103:3,00000000-0000-0000-0000-000000000104:4,00000000-0000-0000-0000-000000000105:5,00000000-0000-0000-0000-000000000106:6,00000000-0000-0000-0000-000000000107:7'
  then raise exception 'PUESTOS: %', (select string_agg(user_id::text || ':' || rank, ',' order by rank) from public.event_participants where submitted_at is not null); end if;
  -- premios en las participaciones
  if (select array_agg(gems_awarded order by rank) from public.event_participants where submitted_at is not null) <> array[35,25,20,12,8,0,0] then raise exception 'PREMIOS: %', (select array_agg(gems_awarded order by rank) from public.event_participants where submitted_at is not null); end if;
  -- gemas: se SUMAN a lo que tenían (10 + 5 de otro lado + 35 = 50 para el primero), nunca se pisan
  if (select gems from public.students where id = '00000000-0000-0000-0000-000000000102') <> 50 then raise exception 'GEMAS_PRIMERO: %', (select gems from public.students where id = '00000000-0000-0000-0000-000000000102'); end if;
  if (select gems from public.students where id = '00000000-0000-0000-0000-000000000101') <> 35 then raise exception 'GEMAS_SEGUNDO'; end if;
  if (select gems from public.students where id = '00000000-0000-0000-0000-000000000105') <> 18 then raise exception 'GEMAS_QUINTO'; end if;
  if (select gems from public.students where id = '00000000-0000-0000-0000-000000000106') <> 10 then raise exception 'GEMAS_SEXTO'; end if;
  -- el que no entregó, sin puesto ni premio
  if (select rank from public.event_participants where user_id = '00000000-0000-0000-0000-000000000108') is not null then raise exception 'NO_ENTREGO_CON_PUESTO'; end if;
  if (select gems from public.students where id = '00000000-0000-0000-0000-000000000108') <> 10 then raise exception 'NO_ENTREGO_CON_GEMAS'; end if;
end $$;

-- Idempotente: una segunda liquidación no paga otra vez.
do $$ begin
  if public.settle_random_event('00000000-0000-0000-0000-0000000000e1') <> 0 then raise exception 'SEGUNDA_PAGA'; end if;
  if (select gems from public.students where id = '00000000-0000-0000-0000-000000000102') <> 50 then raise exception 'SEGUNDA_CAMBIO_GEMAS'; end if;
  if public.settle_random_event('00000000-0000-0000-0000-0000000000ff') <> 0 then raise exception 'NO_EXISTE'; end if;
end $$;

-- Un evento que sigue 'scheduled' no se liquida.
insert into public.random_events (id, gem_pool, status) values ('00000000-0000-0000-0000-0000000000e2', 100, 'scheduled');
do $$ begin if public.settle_random_event('00000000-0000-0000-0000-0000000000e2') <> 0 then raise exception 'SCHEDULED_PAGA'; end if; end $$;

-- Evento de docentes: las gemas van a teachers, no a students; con solo 2 participantes se pagan 2 premios y un reparto personalizado se respeta.
insert into public.teachers (id, gems) values ('00000000-0000-0000-0000-0000000002a1', 0), ('00000000-0000-0000-0000-0000000002a2', 3);
insert into public.random_events (id, gem_pool, status, target_role) values ('00000000-0000-0000-0000-0000000000e3', 50, 'active', 'docente');
insert into public.event_participants (event_id, user_id, submitted_at, score, time_taken_ms) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000002a1', now(), 3, 1000),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000002a2', now(), 6, 2000);
do $$ declare n int; begin
  n := public.settle_random_event('00000000-0000-0000-0000-0000000000e3', array[0.6, 0.4]);
  if n <> 2 then raise exception 'DOCENTES_PREMIADOS: %', n; end if;
  if (select gems from public.teachers where id = '00000000-0000-0000-0000-0000000002a2') <> 33 then raise exception 'DOCENTE_1: %', (select gems from public.teachers where id = '00000000-0000-0000-0000-0000000002a2'); end if; -- 3 + 30
  if (select gems from public.teachers where id = '00000000-0000-0000-0000-0000000002a1') <> 20 then raise exception 'DOCENTE_2'; end if;
end $$;

-- Evento sin participantes: se completa sin pagar nada.
insert into public.random_events (id, gem_pool, status) values ('00000000-0000-0000-0000-0000000000e4', 100, 'active');
do $$ begin
  if public.settle_random_event('00000000-0000-0000-0000-0000000000e4') <> 0 then raise exception 'VACIO_PAGA'; end if;
  if (select status from public.random_events where id = '00000000-0000-0000-0000-0000000000e4') <> 'completed' then raise exception 'VACIO_NO_COMPLETA'; end if;
end $$;

-- Parámetros inválidos y permisos: solo service_role.
select pg_temp.fails($q$select public.settle_random_event(null)$q$, 'parámetros inválidos');
select pg_temp.fails($q$select public.settle_random_event('00000000-0000-0000-0000-0000000000e1', array[]::numeric[])$q$, 'parámetros inválidos');
set role anon;
select pg_temp.fails($q$select public.settle_random_event('00000000-0000-0000-0000-0000000000e1')$q$, 'permission denied');
reset role;
set role authenticated;
select pg_temp.fails($q$select public.settle_random_event('00000000-0000-0000-0000-0000000000e1')$q$, 'permission denied');
reset role;
set role service_role;
do $$ begin perform public.settle_random_event('00000000-0000-0000-0000-0000000000e1'); end $$;
reset role;

select 'SETTLE_SQL_OK';
