// migrations/node-remote-sync.sql contra un PostgreSQL de verdad: el servidor avisa, el docente de la escuela ve el estado y pide sincronizar, otra escuela no, sin token a la vista y con permisos correctos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');
let pg = null;
after(() => pg?.stop());

test('node-remote-sync.sql: aviso del servidor, estado por escuela, petición de sincronizar sin martillar, accesos y permisos', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'remotesync.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'remotesync.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /REMOTESYNC_SQL_OK/);
});
