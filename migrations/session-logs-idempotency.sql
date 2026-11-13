-- ============================================================
-- Subida de registros de ingreso del nodo escolar (node-sync) segura de
-- reintentar.
--
-- node-sync insertaba los ingresos (node_session_logs) con un insert()
-- plano. Si la respuesta de la nube se perdía por la red pero el insert ya
-- había llegado, el nodo conservaba esas filas como "dirty" (solo limpia lo
-- que la nube confirma) y las reenviaba en la siguiente sincronización: la
-- nube las guardaba otra vez y cada ingreso quedaba duplicado (asistencia
-- y tiempo de uso inflados). La tabla no tenía ninguna llave natural, solo
-- un id uuid generado en la nube.
--
-- Esta migración hace dos cosas:
--
-- 1. Borra los duplicados que ya existan, conservando la fila más antigua
--    (la primera recibida) por (node_id, student_id, entered_at). Sin esto
--    el índice único del paso 2 no se podría crear.
--
-- 2. Crea el índice único node_session_logs_dedup_uidx sobre esas tres
--    columnas. node-sync pasa a hacer upsert con
--    onConflict 'node_id,student_id,entered_at' + ignoreDuplicates (ON
--    CONFLICT DO NOTHING): un reintento ya no crea filas nuevas.
--
-- Sobre node_id NULL (la llave foránea es "on delete set null": al borrar un
-- nodo sus ingresos quedan con node_id nulo): en PostgreSQL los NULL son
-- siempre distintos en un índice único, así que esas filas no se
-- deduplicarían. En PostgreSQL 15 o posterior (todo proyecto actual de
-- Supabase) el índice se crea con "nulls not distinct", que las trata como
-- iguales y sigue siendo un índice sobre columnas simples: el onConflict de
-- PostgREST lo reconoce (con un índice sobre coalesce(node_id, ...) NO
-- funcionaría, porque ON CONFLICT solo infiere columnas, no expresiones
-- que el cliente no puede enviar). En una versión anterior se cae a un
-- índice único normal: es seguro porque node-sync siempre inserta con el
-- node_id del nodo autenticado (nunca nulo), así que el reintento que hay
-- que evitar nunca involucra NULL.
--
-- ADITIVO (solo quita duplicados exactos). Seguro de re-ejecutar. Pegar
-- completo en el SQL Editor de Supabase. Correrla ANTES de redesplegar la
-- función node-sync: el upsert nuevo exige este índice y sin él falla (el
-- nodo no perdería nada, dejaría los ingresos pendientes hasta que exista).
-- ============================================================

-- 1) Duplicados existentes: se conserva la más antigua (received_at, y el id
--    como desempate estable). row_number() agrupa los NULL de node_id como
--    iguales, igual que "nulls not distinct".
delete from public.node_session_logs d
using (
  select id,
         row_number() over (
           partition by node_id, student_id, entered_at
           order by received_at asc, id asc
         ) as rn
  from public.node_session_logs
) dup
where d.id = dup.id
  and dup.rn > 1;

-- 2) Índice único que hace idempotente la subida.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'node_session_logs_dedup_uidx'
  ) then
    if current_setting('server_version_num')::int >= 150000 then
      execute 'create unique index node_session_logs_dedup_uidx
               on public.node_session_logs (node_id, student_id, entered_at) nulls not distinct';
    else
      execute 'create unique index node_session_logs_dedup_uidx
               on public.node_session_logs (node_id, student_id, entered_at)';
    end if;
  end if;
end
$$;

notify pgrst, 'reload schema';
