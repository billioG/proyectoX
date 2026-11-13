// migrations/session-logs-idempotency.sql contra un PostgreSQL de verdad (desechable, ver helpers/temp-postgres.mjs): borra duplicados dejando el más
// antiguo, crea el índice único, se puede repetir y un reintento con ON CONFLICT DO NOTHING (el upsert de node-sync) ya no duplica ingresos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL = path.join(ROOT, 'tests-unit', 'sql');
let pg = null;
after(() => pg?.stop());

test('session-logs-idempotency.sql: deduplica conservando el más antiguo, índice único, repetible y reintento sin duplicar', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'sessionlogs.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  // \i resuelve las rutas relativas desde el directorio de trabajo: se corre desde la raíz del repositorio.
  const prev = process.cwd();
  process.chdir(ROOT);
  let result;
  try { result = pg.psql(path.join(SQL, 'sessionlogs.assert.sql')); } finally { process.chdir(prev); }
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /SESSIONLOGS_SQL_OK/);
});

test('node-sync sube los ingresos con upsert idempotente sobre el índice único', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'node-sync', 'index.ts'), 'utf8');
  assert.match(src, /from\('node_session_logs'\)\s*\.upsert\(sessions, \{ onConflict: 'node_id,student_id,entered_at', ignoreDuplicates: true \}\)/);
  assert.doesNotMatch(src, /from\('node_session_logs'\)\.insert/);
  assert.match(fs.readFileSync(path.join(ROOT, 'migrations', 'session-logs-idempotency.sql'), 'utf8'), /node_session_logs_dedup_uidx/);
});
