// migrations/node-feedback.sql contra un PostgreSQL de verdad con el esquema real de la nube: sugerencias idempotentes, evaluación solo al docente de la clase y una por docente, validaciones y permisos.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');
let pg = null;
after(() => pg?.stop());

test('node-feedback.sql: sugerencias sin duplicar, evaluación del docente de la clase (una por docente), validaciones y permisos', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'feedback.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'feedback.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /FEEDBACK_SQL_OK/);
});
