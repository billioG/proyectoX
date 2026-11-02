// Estado de sincronización y botón «Sincronizar ahora» de la capa local, con el servidor del nodo de verdad.
// Se omite si better-sqlite3 no está compilado para este Node.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { sqliteAvailable, startNode, stopAllNodes, waitFor } from './helpers/start-node.mjs';
import { hashClassPassword } from '../school-node/rest/auth.js';

after(stopAllNodes);

const salt = 'ab'.repeat(8);
const rest = {
  class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
  tables: {
    students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 10 }],
    lessons: [{ id: 'l1', audience: 'estudiante' }],
  },
};

async function enter(node) {
  const login = await node.api('/functions/v1/student-login', { method: 'POST', body: { username: 'ana1', password: 'clase123' } });
  const session = await node.api('/auth/v1/verify', { method: 'POST', body: { type: 'magiclink', token_hash: login.data.token_hash } });
  return session.data.access_token;
}

test('el estado cuenta lo que falta subir y avisa si hay error', { skip: !sqliteAvailable() && 'better-sqlite3 no disponible' }, async () => {
  const node = await startNode({ rest });
  const status = async () => (await node.api('/api/node/status')).data;
  assert.equal((await status()).rest, true);
  assert.deepEqual([(await status()).pending_changes, (await status()).syncing, (await status()).sync_error], [0, false, null]);

  const token = await enter(node);
  const w = await node.api('/rest/v1/lesson_completions', { method: 'POST', token, body: { lesson_id: 'l1', student_id: 's1', score: 80, status: 'completed' } });
  assert.equal(w.status, 201);
  assert.equal((await status()).pending_changes, 1);
});

test('«Sincronizar ahora»: pide sesión, avisa si la escuela no está conectada, y con token intenta y reporta el error sin internet', { skip: !sqliteAvailable() && 'better-sqlite3 no disponible' }, async () => {
  const node = await startNode({ rest, config: { nodeToken: 'x'.repeat(40), cloudUrl: 'http://127.0.0.1:1' } });
  assert.equal((await node.api('/api/sync/now', { method: 'POST' })).status, 401);
  assert.equal((await node.api('/api/sync/now', { method: 'POST', token: 'inventado' })).status, 401);
  const token = await enter(node);
  const r = await node.api('/api/sync/now', { method: 'POST', token });
  assert.deepEqual([r.status, r.data.started], [200, true]);
  const err = await waitFor(async () => { const s = (await node.api('/api/node/status')).data; return s.sync_error && !s.syncing ? s : null; });
  assert.match(err.sync_error, /./);
  const again = await node.api('/api/sync/now', { method: 'POST', token });
  assert.equal(again.status, 200);
  assert.equal(again.data.started, false, 'pedirlo otra vez enseguida no martilla a la nube');
});

test('sin token de escuela el botón lo explica con palabras claras', { skip: !sqliteAvailable() && 'better-sqlite3 no disponible' }, async () => {
  const node = await startNode({ rest });
  const token = await enter(node);
  const r = await node.api('/api/sync/now', { method: 'POST', token });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /nube/);
});

test('el estado dice qué clases no tienen contraseña cuando la app real no se puede activar', { skip: !sqliteAvailable() && 'better-sqlite3 no disponible' }, async () => {
  const node = await startNode({ rest: { ...rest, tables: { ...rest.tables, students: [...rest.tables.students, { id: 's2', username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: 'Segundo', section: 'B', status: 'activo' }] } } });
  const s = (await node.api('/api/node/status')).data;
  assert.equal(s.rest, false);
  assert.deepEqual(s.rest_missing, ['Segundo B']);
  const ok = await startNode({ rest });
  assert.deepEqual([(await ok.api('/api/node/status')).data.rest, (await ok.api('/api/node/status')).data.rest_missing], [true, []]);
});
