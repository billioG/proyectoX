-- Duplicados previos: se conserva el más antiguo; luego el índice único hace idempotente el reintento (incluido node_id nulo en PostgreSQL 15+).
insert into public.school_nodes (id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.students (id) values ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2');
insert into public.node_session_logs (id, node_id, student_id, device, entered_at, received_at) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'viejo',  '2026-11-01 10:00+00', '2026-11-01 11:00+00'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'nuevo',  '2026-11-01 10:00+00', '2026-11-02 11:00+00'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'otra',   '2026-11-01 12:00+00', '2026-11-01 13:00+00'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 'otro',   '2026-11-01 10:00+00', '2026-11-01 11:00+00'),
  ('00000000-0000-0000-0000-000000000005', null, '00000000-0000-0000-0000-0000000000b1', 'sin-nodo-1', '2026-11-01 10:00+00', '2026-11-01 11:00+00'),
  ('00000000-0000-0000-0000-000000000006', null, '00000000-0000-0000-0000-0000000000b1', 'sin-nodo-2', '2026-11-01 10:00+00', '2026-11-02 11:00+00');

\i migrations/session-logs-idempotency.sql
\i migrations/session-logs-idempotency.sql

do $$
declare n int;
begin
  select count(*) into n from public.node_session_logs;
  if n <> 4 then raise exception 'se esperaban 4 filas tras deduplicar, hay %', n; end if;
  if not exists (select 1 from public.node_session_logs where device = 'viejo') or exists (select 1 from public.node_session_logs where device = 'nuevo') then
    raise exception 'no conservó la fila más antigua';
  end if;
  if current_setting('server_version_num')::int >= 150000 and (select count(*) from public.node_session_logs where node_id is null) <> 1 then
    raise exception 'los node_id nulos duplicados no se unificaron';
  end if;

  -- Reintento (lo que hace el upsert con ignoreDuplicates): ON CONFLICT DO NOTHING sobre las mismas tres columnas.
  insert into public.node_session_logs (node_id, student_id, device, entered_at) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'reintento', '2026-11-01 10:00+00'),
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'distinta',  '2026-11-03 10:00+00'),
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'distinta2', '2026-11-03 10:00+00')
  on conflict (node_id, student_id, entered_at) do nothing;
  select count(*) into n from public.node_session_logs;
  if n <> 5 then raise exception 'el reintento duplicó: se esperaban 5 filas, hay %', n; end if;
  if exists (select 1 from public.node_session_logs where device = 'reintento') then raise exception 'el reintento no debía insertarse'; end if;
end
$$;
select 'SESSIONLOGS_SQL_OK';
