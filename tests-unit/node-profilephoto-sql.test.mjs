// migrations/node-profile-photo.sql contra un PostgreSQL de verdad (desechable, ver helpers/temp-postgres.mjs): premio de la primera foto una sola vez, reintentos, docentes,
// dirección solo de ese usuario y permisos (solo node-sync).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');
let pg = null;
after(() => pg?.stop());

test('node-profile-photo.sql: primera foto con premio una sola vez, cambios sin premio, docentes, validación de la dirección y permisos', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'profilephoto.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'profilephoto.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /PROFILEPHOTO_SQL_OK/);
});
