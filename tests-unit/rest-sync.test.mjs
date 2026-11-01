// Sincronización de la capa local: lo que baja de la nube llena la réplica (sin pisar lo pendiente de subir) y lo que
// la app escribió en el nodo sube por la bandeja y se confirma solo cuando la nube lo aplicó. Corre con Node 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { applyPull, buildPush } from '../school-node/sync.js';
import { restStoreFor } from '../school-node/rest/store.js';
import { SCHEMA } from '../school-node/rest/schema.js';

const dirs = [], dbs = [];
const boot = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-sync-'));
  dirs.push(dir);
  const db = openDb(dir);
  dbs.push(db);
  return { db, store: restStoreFor(db, SCHEMA) };
};
test.after(() => { for (const db of dbs) try { db.close(); } catch {} for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

const cloud = (over = {}) => ({
  server_time: '2026-11-01T10:00:00Z', node: { name: 'N', school_code: 'ESC1' }, storage_base: '',
  students: [], courses: [], completions: [], files: [], groups: [], group_members: [],
  tables: {
    students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' }],
    lesson_completions: [],
    lessons: [{ id: 'l1', title: 'Intro', audience: 'estudiante' }],
  },
  class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt: 'aa', hash: 'bb' }],
  ...over,
});

test('restStoreFor devuelve siempre el mismo almacén para la misma base (una sola caché)', () => {
  const { db, store } = boot();
  assert.equal(restStoreFor(db, SCHEMA), store);
});

test('la bajada llena la réplica y los verificadores; ignora tablas que el nodo no sirve', () => {
  const { db, store } = boot();
  applyPull(db, cloud({ tables: { ...cloud().tables, xp_events: [{ id: 1 }], class_passwords: [{ password: 'x' }] } }));
  assert.deepEqual(store.all('students').map((s) => s.id), ['s1']);
  assert.deepEqual(store.all('lessons').map((s) => s.id), ['l1']);
  assert.equal(store.classVerifier('ESC1|Primero|A').hash, 'bb');
  assert.deepEqual(store.all('xp_events' in SCHEMA ? 'xp_events' : 'badges'), []);
});

test('una nube vieja que no manda `tables` no borra la réplica', () => {
  const { db, store } = boot();
  applyPull(db, cloud());
  applyPull(db, { ...cloud(), tables: undefined, class_verifiers: undefined });
  assert.equal(store.all('students').length, 1);
  assert.ok(store.classVerifier('ESC1|Primero|A'));
});

test('lo que la app guardó sube como avance de lección y se confirma al aplicarse', () => {
  const { db, store } = boot();
  applyPull(db, cloud());
  store.transaction(() => {
    store.put('lesson_completions', { id: 'lc1', lesson_id: 'l1', student_id: 's1', score: 90, status: 'completed' });
    store.enqueue([{ op: 'insert', table: 'lesson_completions', row: { id: 'lc1', lesson_id: 'l1', student_id: 's1', score: 90, status: 'completed' } }]);
  });
  const push = buildPush(db);
  const sent = push.completions.find((c) => c.lesson_id === 'l1');
  assert.deepEqual([sent.student_id, sent.score, sent.status], ['s1', 90, 'completed']);
  assert.equal(push.rest_seqs.length, 1);

  // la nube lo aplicó: en la bajada trae el valor ya combinado (la mejor nota)
  applyPull(db, cloud({ tables: { ...cloud().tables, lesson_completions: [{ id: 'cloud-id', lesson_id: 'l1', student_id: 's1', score: 95, status: 'completed' }] } }), push);
  assert.equal(store.pendingCount(), 0);
  assert.deepEqual(store.all('lesson_completions').map((r) => [r.id, r.score]), [['cloud-id', 95]]);
});

test('si la subida no se confirmó (falló antes de aplicar), sigue pendiente y la bajada no pisa la fila local', () => {
  const { db, store } = boot();
  applyPull(db, cloud());
  store.transaction(() => {
    store.put('lesson_completions', { id: 'lc1', lesson_id: 'l1', student_id: 's1', score: 90, status: 'completed' });
    store.enqueue([{ op: 'insert', table: 'lesson_completions', row: { id: 'lc1', lesson_id: 'l1', student_id: 's1', score: 90, status: 'completed' } }]);
  });
  applyPull(db, cloud()); // bajada sin haber subido nada (pushed vacío)
  assert.equal(store.pendingCount(), 1);
  assert.equal(store.all('lesson_completions')[0].score, 90);
});

test('lo que se escribe mientras la sincronización está en curso no se pierde', () => {
  const { db, store } = boot();
  applyPull(db, cloud());
  const first = { id: 'a', lesson_id: 'l1', student_id: 's1', score: 50, status: 'completed' };
  store.transaction(() => { store.put('lesson_completions', first); store.enqueue([{ op: 'insert', table: 'lesson_completions', row: first }]); });
  const push = buildPush(db);
  const second = { id: 'b', lesson_id: 'l2', student_id: 's1', score: 70, status: 'completed' };
  store.transaction(() => { store.put('lesson_completions', second); store.enqueue([{ op: 'insert', table: 'lesson_completions', row: second }]); });
  applyPull(db, cloud({ tables: { ...cloud().tables, lesson_completions: [{ ...first, id: 'cloud-a' }] } }), push);
  assert.equal(store.pendingCount(), 1, 'solo el segundo sigue pendiente');
  assert.deepEqual(store.all('lesson_completions').map((r) => r.lesson_id).sort(), ['l1', 'l2']);
});

test('el borrado local de un avance no viaja a la nube y no deja la bandeja trabada', () => {
  const { db, store } = boot();
  applyPull(db, cloud());
  store.enqueue([{ op: 'delete', table: 'lesson_completions', row: { id: 'x', lesson_id: 'l1', student_id: 's1' } }]);
  const push = buildPush(db);
  assert.equal(push.completions.length, 0);
  applyPull(db, cloud(), push);
  assert.equal(store.pendingCount(), 0);
});
