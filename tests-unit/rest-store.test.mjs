// Almacén de la capa local: réplica de las tablas de la nube en SQLite + bandeja de salida de lo escrito en el nodo.
// Corre con Node 20 (better-sqlite3 compilado para esa versión).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { parseRequest } from '../school-node/rest/query.js';
import { createEngine } from '../school-node/rest/engine.js';
import { createPolicy } from '../school-node/rest/policies.js';
import { SCHEMA } from '../school-node/rest/schema.js';
import { createStore } from '../school-node/rest/store.js';

const dirs = [], dbs = [];
const newDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-store-')); dirs.push(d); return d; };
const newDb = () => { const db = openDb(newDir()); dbs.push(db); return db; };
test.after(() => { for (const db of dbs) db.close(); for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const open = () => createStore({ db: newDb(), schema: SCHEMA });
const ana = { uid: 's1', role: 'student', classKey: 'ESC1|Primero|A' };
const run = (store, method, url, ctx, extra = {}) => {
  const engine = createEngine({ schema: SCHEMA, store, policy: createPolicy({ store }) });
  return store.transaction(() => {
    const r = engine.execute(parseRequest({ method, url, headers: {}, ...extra }), ctx);
    store.enqueue(r.changes);
    return r;
  });
};

test('guarda, lee, reemplaza y borra filas por tabla, con llaves numéricas o de texto', () => {
  const s = open();
  s.put('groups', { id: 7, name: 'Sol' });
  s.put('students', { id: 's1', full_name: 'Ana' });
  s.put('groups', { id: 7, name: 'Sol 2' });
  assert.deepEqual(s.all('groups'), [{ id: 7, name: 'Sol 2' }]);
  assert.deepEqual(s.all('students'), [{ id: 's1', full_name: 'Ana' }]);
  s.remove('groups', 7);
  assert.deepEqual(s.all('groups'), []);
  assert.deepEqual(s.all('badges'), [], 'tabla sin filas');
});

test('lo guardado sobrevive a reabrir la base', () => {
  const db = newDb();
  createStore({ db, schema: SCHEMA }).put('students', { id: 's1', full_name: 'Ana' });
  assert.deepEqual(createStore({ db, schema: SCHEMA }).all('students'), [{ id: 's1', full_name: 'Ana' }]);
});

test('una escritura de la app deja su cambio en la bandeja, y si falla no queda nada (ni fila ni bandeja)', () => {
  const s = open();
  s.put('students', { id: 's1', school_code: 'ESC1', grade: 'Primero', section: 'A', full_name: 'Ana' });
  run(s, 'POST', '/rest/v1/lesson_completions', ana, { body: { lesson_id: 'l1', student_id: 's1', score: 80, status: 'completed' } });
  assert.equal(s.all('lesson_completions').length, 1);
  const [ev] = s.pending();
  assert.deepEqual([ev.table, ev.op, ev.row.lesson_id, ev.row.score], ['lesson_completions', 'insert', 'l1', 80]);

  assert.throws(() => run(s, 'POST', '/rest/v1/lesson_completions', ana, { body: { lesson_id: 'l2', student_id: 'otro' } }), (e) => e.status === 403);
  assert.equal(s.all('lesson_completions').length, 1);
  assert.equal(s.pending().length, 1);
});

test('si la transacción falla a medias, se deshace y la memoria no queda con filas fantasma', () => {
  const s = open();
  s.put('groups', { id: 1, name: 'A' });
  assert.throws(() => s.transaction(() => { s.put('groups', { id: 2, name: 'B' }); throw new Error('boom'); }), /boom/);
  assert.deepEqual(s.all('groups').map((r) => r.id), [1]);
});

test('confirmar saca de la bandeja solo lo que la nube aceptó; lo demás sigue y cuenta intentos', () => {
  const s = open();
  s.enqueue([{ op: 'insert', table: 'lesson_completions', row: { id: 'a', lesson_id: 'l1', student_id: 's1' } },
             { op: 'insert', table: 'lesson_completions', row: { id: 'b', lesson_id: 'l2', student_id: 's1' } }]);
  const [first, second] = s.pending();
  s.ack([first.seq]);
  assert.deepEqual(s.pending().map((e) => e.seq), [second.seq]);
  s.fail(second.seq, 'sin red');
  assert.deepEqual([s.pending()[0].attempts, s.pending()[0].last_error], [1, 'sin red']);
  assert.equal(s.pendingCount(), 1);
});

test('la bajada de la nube reemplaza la base, pero no pisa lo que aún está pendiente de subir', () => {
  const s = open();
  s.put('lesson_completions', { id: 'a', lesson_id: 'l1', student_id: 's1', score: 99 }); // edición local, ya en la bandeja
  s.put('lesson_completions', { id: 'viejo', lesson_id: 'l9', student_id: 's1', score: 5 });
  s.enqueue([{ op: 'update', table: 'lesson_completions', row: { id: 'a', lesson_id: 'l1', student_id: 's1', score: 99 } }]);
  s.replaceBase('lesson_completions', [{ id: 'a', lesson_id: 'l1', student_id: 's1', score: 10 }, { id: 'nuevo', lesson_id: 'l2', student_id: 's1', score: 7 }]);
  const byId = Object.fromEntries(s.all('lesson_completions').map((r) => [r.id, r.score]));
  assert.deepEqual(byId, { a: 99, nuevo: 7 }, 'a conserva lo local pendiente, nuevo entra, viejo (ya no existe en la nube) sale');
});

test('metadatos: guarda y lee valores (última bajada, etc.)', () => {
  const s = open();
  assert.equal(s.getMeta('last_pull'), null);
  s.setMeta('last_pull', '2026-11-01T10:00:00Z');
  assert.equal(s.getMeta('last_pull'), '2026-11-01T10:00:00Z');
});
