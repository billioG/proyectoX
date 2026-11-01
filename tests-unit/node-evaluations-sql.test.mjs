// migrations/node-evaluations.sql contra un PostgreSQL de verdad (desechable, ver helpers/temp-postgres.mjs):
// total recalculado, idempotencia, docente asignado, misma escuela, rangos y permisos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');
let pg = null;
after(() => pg?.stop());

test('node-evaluations.sql: total recalculado, idempotencia, docente asignado, escuela, rangos y permisos', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'evaluations.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'evaluations.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /EVALUATIONS_SQL_OK/);
});
