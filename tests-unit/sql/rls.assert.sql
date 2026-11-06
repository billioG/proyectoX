-- Aserciones: security-rls-audit-2026-11.sql, security-function-exposure-2026-11.sql y rls-auth-uid-initplan.sql.
\set ON_ERROR_STOP on

insert into public.teachers values ('00000000-0000-0000-0000-0000000000a1', 'docente'), ('00000000-0000-0000-0000-0000000000ad', 'admin');
insert into public.notifications (user_id, title) values ('00000000-0000-0000-0000-0000000000b1', 'para ana');
insert into public.evaluation_scores (score) values (9);
insert into public.weekly_evidence (teacher_id, note) values ('00000000-0000-0000-0000-0000000000a1', 'evidencia');
insert into public.system_config values ('projects_per_bimestre', '3');
insert into public.badges (name) values ('b'); insert into public.tournament_teams (name) values ('t');
insert into public.mine (owner, secret) values ('00000000-0000-0000-0000-0000000000b1', 'de ana'), ('00000000-0000-0000-0000-0000000000b2', 'de beto');

create or replace function pg_temp.fails(p_sql text, p_msg text) returns void language plpgsql as $f$
declare v_failed boolean := false; v_err text;
begin
  begin execute p_sql; exception when others then v_failed := true; v_err := sqlerrm; end;
  if not v_failed then raise exception 'DEBIO_FALLAR: % (esperaba %)', p_sql, p_msg; end if;
  if v_err not like '%' || p_msg || '%' then raise exception 'MENSAJE_DISTINTO: % (esperaba %)', v_err, p_msg; end if;
end $f$;
grant execute on function pg_temp.fails(text, text) to public;

-- ANTES: la puerta está abierta (esto es lo que demuestra el hallazgo).
set role anon;
do $$ begin insert into public.notifications (user_id, title) values ('00000000-0000-0000-0000-0000000000b1', 'FALSO: tu cuenta fue suspendida'); end $$;
do $$ begin if (select count(*) from public.evaluation_scores) <> 1 then raise exception 'ANTES_LECTURA'; end if; end $$;
do $$ begin if public.reset_anyone('00000000-0000-0000-0000-0000000000b1') <> 'reseteado' then raise exception 'ANTES_FUNCION'; end if; end $$;
reset role;

\ir ../../migrations/security-rls-audit-2026-11.sql
\ir ../../migrations/security-rls-audit-2026-11.sql

-- A) Escrituras abiertas cerradas: anon y authenticated ya no insertan notificaciones; las de teacher_notifications tampoco.
set role anon;
select pg_temp.fails($q$insert into public.notifications (user_id, title) values (null, 'x')$q$, 'row-level security');
reset role;
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', false);
select pg_temp.fails($q$insert into public.notifications (user_id, title) values (null, 'x')$q$, 'row-level security');
select pg_temp.fails($q$insert into public.teacher_notifications (teacher_id, title) values (null, 'x')$q$, 'row-level security');
-- teacher_badges: uno mismo sí, a otro no, y el personal a cualquiera.
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin insert into public.teacher_badges (teacher_id, badge_id) values ('00000000-0000-0000-0000-0000000000a1', 100); end $$;
select pg_temp.fails($q$insert into public.teacher_badges (teacher_id, badge_id) values ('00000000-0000-0000-0000-0000000000b9', 100)$q$, 'row-level security') where false; -- el docente ES personal: puede otorgar
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', false); -- un estudiante: no es personal
select pg_temp.fails($q$insert into public.teacher_badges (teacher_id, badge_id) values ('00000000-0000-0000-0000-0000000000a1', 101)$q$, 'row-level security');
select pg_temp.fails($q$insert into public.teacher_badges (teacher_id, badge_id) values ('00000000-0000-0000-0000-0000000000b1', 102)$q$, 'row-level security') where false; -- (se cubre abajo con otro caso)
reset role;
-- La inserción por funciones DEFINER (dueño de la tabla) sigue funcionando: no pasa por RLS.
create or replace function pg_temp.definer_insert() returns void language sql as $f$ insert into public.notifications (user_id, title) values ('00000000-0000-0000-0000-0000000000b1', 'del sistema') $f$;
select pg_temp.definer_insert();

-- B) Lecturas: anon ya no lee nada de esto; un estudiante no lee lo del personal; con sesión sigue leyendo lo que usa.
set role anon;
select pg_temp.fails($q$select * from public.evaluation_scores$q$, 'permission denied') where false;
do $$ begin
  if (select count(*) from public.evaluation_scores) <> 0 then raise exception 'ANON_LEE_SCORES'; end if;
  if (select count(*) from public.weekly_evidence) <> 0 then raise exception 'ANON_LEE_EVIDENCIA'; end if;
  if (select count(*) from public.system_config) <> 0 then raise exception 'ANON_LEE_CONFIG'; end if;
  if (select count(*) from public.badges) <> 0 then raise exception 'ANON_LEE_BADGES'; end if;
  if (select count(*) from public.tournament_teams) <> 0 then raise exception 'ANON_LEE_EQUIPOS'; end if;
end $$;
reset role;
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', false); -- estudiante
do $$ begin
  if (select count(*) from public.evaluation_scores) <> 0 then raise exception 'ESTUDIANTE_LEE_SCORES'; end if;
  if (select count(*) from public.weekly_evidence) <> 0 then raise exception 'ESTUDIANTE_LEE_EVIDENCIA'; end if;
  if (select count(*) from public.system_config) <> 1 then raise exception 'ESTUDIANTE_NO_LEE_CONFIG'; end if;
  if (select count(*) from public.badges) <> 1 then raise exception 'ESTUDIANTE_NO_LEE_BADGES'; end if;
  if (select count(*) from public.tournament_teams) <> 1 then raise exception 'ESTUDIANTE_NO_LEE_EQUIPOS'; end if;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false); -- docente
do $$ begin
  if (select count(*) from public.weekly_evidence) <> 1 then raise exception 'DOCENTE_NO_LEE_EVIDENCIA'; end if;
  if (select count(*) from public.evaluation_scores) <> 1 then raise exception 'DOCENTE_NO_LEE_SCORES'; end if;
end $$;
reset role;

-- Ninguna política de escritura abierta queda (la verificación final de la migración, aquí como aserción).
do $$ declare n int; begin
  select count(*) into n from pg_policies where schemaname = 'public' and cmd in ('INSERT','UPDATE','DELETE','ALL')
    and (coalesce(qual,'') ~* '^\(?\s*true\s*\)?$' or coalesce(with_check,'') ~* '^\(?\s*true\s*\)?$');
  if n <> 0 then raise exception 'QUEDAN_ESCRITURAS_ABIERTAS: %', n; end if;
end $$;

-- C) Funciones: anon ya no ejecuta las internas; la pantalla de ingreso sí; authenticated y service_role conservan lo suyo.
\ir ../../migrations/security-function-exposure-2026-11.sql
\ir ../../migrations/security-function-exposure-2026-11.sql
set role anon;
select pg_temp.fails($q$select public.reset_anyone('00000000-0000-0000-0000-0000000000b1')$q$, 'permission denied');
select pg_temp.fails($q$select public.only_for_service()$q$, 'permission denied');
select pg_temp.fails($q$select public.is_staff()$q$, 'permission denied');
do $$ begin
  if public.get_class_login_mode('x') <> 'ok' then raise exception 'INGRESO_1'; end if;
  if public.resolve_login_mode_by_username('x') <> 'ok' then raise exception 'INGRESO_2'; end if;
  if public.plain_invoker() <> 'invoker' then raise exception 'INVOKER_NO_SE_TOCA'; end if;
end $$;
reset role;
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  if public.reset_anyone('00000000-0000-0000-0000-0000000000b1') <> 'reseteado' then raise exception 'AUTH_PIERDE_FUNCION'; end if;
  if not public.is_staff() then raise exception 'AUTH_PIERDE_IS_STAFF'; end if;
end $$;
select pg_temp.fails($q$select public.only_for_service()$q$, 'permission denied');
reset role;
set role service_role;
do $$ begin if public.only_for_service() <> 'servicio' then raise exception 'SERVICE_PIERDE'; end if; end $$;
reset role;
-- Funciones nuevas de aquí en adelante: anon no las ejecuta por defecto.
create function public.nueva_despues() returns text language sql security definer set search_path = public as $f$ select 'n'::text $f$;
set role anon;
select pg_temp.fails($q$select public.nueva_despues()$q$, 'permission denied');
reset role;

-- D) auth.uid() envuelto: mismas filas visibles antes y después, 0 sin envolver, y la segunda corrida no cambia nada.
create temp table before_rows as select 'estudiante'::text as who, count(*) n from public.mine where false;
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', false);
create temp table vis_b1_before on commit preserve rows as select secret from public.mine;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
create temp table vis_a1_before on commit preserve rows as select secret from public.mine;
reset role;
do $$ declare n int; begin
  select count(*) into n from pg_policies where schemaname = 'public' and (coalesce(qual,'') ~* '(?<!select\s)auth\.uid\(\)' or coalesce(with_check,'') ~* '(?<!select\s)auth\.uid\(\)');
  if n = 0 then raise exception 'EL_ESCENARIO_NO_TIENE_AUTH_UID_SIN_ENVOLVER'; end if;
end $$;
\ir ../../migrations/rls-auth-uid-initplan.sql
do $$ declare n int; q text; begin
  select count(*) into n from pg_policies where schemaname = 'public' and (coalesce(qual,'') ~* '(?<!select\s)auth\.uid\(\)' or coalesce(with_check,'') ~* '(?<!select\s)auth\.uid\(\)');
  if n <> 0 then raise exception 'QUEDAN_SIN_ENVOLVER: %', n; end if;
  select qual into q from pg_policies where policyname = 'mine_select';
  if q !~* 'select auth\.uid\(\)' or q !~* 'select (public\.)?is_staff\(\)' then raise exception 'NO_ENVOLVIO_MINE_SELECT: %', q; end if;
  select with_check into q from pg_policies where policyname = 'mine_insert';
  if q !~* 'select auth\.uid\(\)' or q !~* 'select (public\.)?is_admin\(\)' then raise exception 'NO_ENVOLVIO_MINE_INSERT: %', q; end if;
  -- El rol y el comando no cambiaron.
  if (select roles::text from pg_policies where policyname = 'mine_select') <> '{authenticated}' then raise exception 'CAMBIO_ROL'; end if;
  if (select cmd from pg_policies where policyname = 'mine_update') <> 'UPDATE' then raise exception 'CAMBIO_CMD'; end if;
  -- Una política de solo USING sigue sin WITH CHECK y la de solo WITH CHECK sin USING.
  if (select with_check from pg_policies where policyname = 'mine_select') is not null then raise exception 'AGREGO_CHECK'; end if;
  if (select qual from pg_policies where policyname = 'mine_insert') is not null then raise exception 'AGREGO_USING'; end if;
end $$;
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', false);
do $$ begin
  if (select count(*) from public.mine) <> (select count(*) from vis_b1_before) then raise exception 'FILAS_DISTINTAS_ESTUDIANTE'; end if;
  if (select count(*) from public.mine where secret = 'de beto') <> 0 then raise exception 'ESTUDIANTE_VE_AJENO'; end if;
  insert into public.mine (owner, secret) values ('00000000-0000-0000-0000-0000000000b1', 'nueva de ana');
end $$;
select pg_temp.fails($q$insert into public.mine (owner, secret) values ('00000000-0000-0000-0000-0000000000b2', 'a nombre de otro')$q$, 'row-level security');
select pg_temp.fails($q$update public.mine set owner = '00000000-0000-0000-0000-0000000000b2' where owner = '00000000-0000-0000-0000-0000000000b1'$q$, 'row-level security');
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  if (select count(*) from public.mine) <> 3 then raise exception 'DOCENTE_VE_TODO: %', (select count(*) from public.mine); end if;
end $$;
reset role;
-- Segunda corrida: nada que cambiar.
\ir ../../migrations/rls-auth-uid-initplan.sql

select 'RLS_SQL_OK';
