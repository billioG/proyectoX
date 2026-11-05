// migrations/feedback-inbox.sql contra un PostgreSQL de verdad con RLS: el docente lee el buzón SIN saber quién escribió (y ya no puede leer las tablas directo), el administrador ve nombres, el coordinador
// las evaluaciones de sus docentes, el estudiante lo suyo.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');
let pg = null;
after(() => pg?.stop());

test('feedback-inbox.sql: buzón anónimo para el docente, con nombres para el administrador, RLS que cierra la lectura directa y permisos', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'inbox.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'inbox.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /INBOX_SQL_OK/);
});
