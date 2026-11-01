// migrations/xp-events.sql contra un PostgreSQL de verdad (desechable, ver helpers/temp-postgres.mjs):
// disparador de lecciones, tope diario, lecciones ajenas, cofre del nodo y permisos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');
let pg = null;
after(() => pg?.stop());

test('xp-events.sql: lecciones, tope diario, lecciones ajenas, cofre del nodo y permisos', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'xp-events.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'xp-events.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /XP_EVENTS_SQL_OK/);
});
