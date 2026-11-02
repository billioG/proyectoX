// migrations/teacher-node-pin.sql contra un PostgreSQL de verdad (desechable, ver helpers/temp-postgres.mjs):
// PIN fijado solo por docentes, hash y sal válidos, y permisos (la app no lee la tabla; solo node-sync).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');
let pg = null;
after(() => pg?.stop());

test('teacher-node-pin.sql: solo docentes, hash y sal válidos, quitar el propio y permisos', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'teacher-node-pin.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'teacher-node-pin.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /TEACHER_PIN_SQL_OK/);
});
