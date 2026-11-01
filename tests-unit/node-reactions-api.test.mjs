// Reacciones a proyectos en el nodo, de extremo a extremo: POST /api/projects/:id/react y GET /api/feed.
// Arranca school-node/server.js de verdad. Se omite si better-sqlite3 no está compilado para esta versión de Node.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { startNode, sqliteAvailable, stopAllNodes } from './helpers/start-node.mjs';

after(() => stopAllNodes());

const skip = !sqliteAvailable() && 'better-sqlite3 no está instalado para esta versión de Node';
const DESC = 'Un robot que sigue una línea negra con dos sensores.'.padEnd(40, '.');
const STUDENTS = [
  { id: 's1', full_name: 'Ana', grade: 'Primero', section: 'A' },
  { id: 's2', full_name: 'Beto', grade: 'Primero', section: 'A' },
  { id: 's3', full_name: 'Carla', grade: 'Segundo', section: 'B' },
];
const CLOUD = [
  { id: '27', user_id: 's9', title: 'Aprobado de la clase', score: 80, votes: 3, created_at: '2026-10-30T10:00:00Z' },
  { id: '28', user_id: 's9', title: 'Borrador ajeno', score: 0, votes: 0, created_at: '2026-10-29T10:00:00Z' },
  { id: '29', user_id: 's8', title: 'De Segundo B', grade: 'Segundo', section: 'B', score: 90, votes: 1, created_at: '2026-10-28T10:00:00Z' },
];

async function boot(cloudReactions) {
  const node = await startNode({ students: STUDENTS, cloudProjects: CLOUD, cloudReactions });
  return { node, t1: await node.login('s1'), t2: await node.login('s2'), t3: await node.login('s3') };
}
const react = (node, token, id, reaction) => node.api(`/api/projects/${id}/react`, { method: 'POST', token, body: { reaction } });
const item = async (node, token, id) => (await node.api('/api/feed', { token })).data.projects.find(p => p.id === id);

test('sin sesión, reaccionar responde 401', { skip, timeout: 60000 }, async () => {
  const { node } = await boot();
  try { assert.equal((await react(node, undefined, '27', 'like')).status, 401); } finally { await node.stop(); }
});

test('reaccionar, cambiar y quitar: devuelve la reacción propia y los votos', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    assert.deepEqual((await react(node, t1, '27', 'like')).data, { mine: 'like', votes: 4 });
    assert.deepEqual((await react(node, t1, '27', 'wow')).data, { mine: 'wow', votes: 3 }, 'wow no cuenta como voto');
    assert.deepEqual((await react(node, t1, '27', 'excelente')).data, { mine: 'excelente', votes: 4 });
    assert.deepEqual((await react(node, t1, '27', 'excelente')).data, { mine: null, votes: 3 }, 'la misma la quita');
  } finally { await node.stop(); }
});

test('el Inicio refleja mi reacción y los votos; otro estudiante ve los votos pero no mi reacción', { skip, timeout: 60000 }, async () => {
  const { node, t1, t2 } = await boot();
  try {
    await react(node, t1, '27', 'like');
    const mine = await item(node, t1, '27');
    assert.deepEqual([mine.my_reaction, mine.votes], ['like', 4]);
    const other = await item(node, t2, '27');
    assert.deepEqual([other.my_reaction, other.votes], [null, 4]);
  } finally { await node.stop(); }
});

test('solo se puede reaccionar a lo que se ve en el Inicio: no aprobado ajeno, otra sección o inexistente son 404', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    for (const id of ['28', '29', '999', 'abc', '27; DROP TABLE x']) {
      assert.equal((await react(node, t1, id, 'like')).status, 404, id);
    }
    const sum = await node.api('/api/feed', { token: t1 });
    assert.deepEqual(sum.data.projects.map(p => [p.id, p.my_reaction]), [['27', null]], 'ningún rastro de los intentos');
  } finally { await node.stop(); }
});

test('una reacción inventada o ausente es 400', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    for (const reaction of ['love', '', null, 5]) assert.equal((await react(node, t1, '27', reaction)).status, 400, String(reaction));
    assert.equal((await item(node, t1, '27')).votes, 3);
  } finally { await node.stop(); }
});

test('con una reacción de la nube como base, cambiarla corrige los votos sin contarla dos veces', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot([{ student_id: 's1', project_id: 27, reaction: 'wow' }]);
  try {
    assert.equal((await item(node, t1, '27')).my_reaction, 'wow');
    assert.deepEqual((await react(node, t1, '27', 'like')).data, { mine: 'like', votes: 4 });
    assert.deepEqual((await react(node, t1, '27', 'like')).data, { mine: null, votes: 3 }, 'quitarla: la base era wow, que no cuenta');
  } finally { await node.stop(); }
});

test('cada estudiante reacciona por su cuenta', { skip, timeout: 60000 }, async () => {
  const { node, t1, t2 } = await boot();
  try {
    await react(node, t1, '27', 'like');
    assert.deepEqual((await react(node, t2, '27', 'like')).data, { mine: 'like', votes: 5 });
    assert.equal((await item(node, t1, '27')).my_reaction, 'like');
  } finally { await node.stop(); }
});
