// migrations/node-companion.sql contra un PostgreSQL de verdad (desechable, ver helpers/temp-postgres.mjs): la misma lógica de la mascota para un estudiante
// dado, los mismos mensajes de error, gemas bien descontadas y permisos (solo node-sync).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');
let pg = null;
after(() => pg?.stop());

test('node-companion.sql: elegir, huevo, cambiar, accesorios, errores iguales a los de la nube y permisos', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'companion.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'companion.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /COMPANION_SQL_OK/);
});
