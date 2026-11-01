// GET /api/feed: el Inicio del estudiante en el nodo. Arranca school-node/server.js de verdad.
// Se omite si better-sqlite3 no está compilado para esta versión de Node.
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
const GROUPS = [{ id: 7, name: 'Equipo Sol', grade: 'Primero', section: 'A' }];
const MEMBERS = [{ id: 1, group_id: 7, student_id: 's1' }, { id: 2, group_id: 7, student_id: 's2' }];
const CLOUD = [
  { id: 'c1', user_id: 's2', title: 'Aprobado de Beto', score: 80, feedback: 'Muy bien', created_at: '2026-10-30T10:00:00Z' },
  { id: 'c2', user_id: 's2', title: 'Borrador de Beto', score: 0, feedback: 'Aún falta', created_at: '2026-10-29T10:00:00Z' },
  { id: 'c3', user_id: 's2', group_id: 7, group_name: 'Equipo Sol', title: 'Del equipo Sol', score: 0, feedback: 'Revisa tu video', created_at: '2026-10-28T10:00:00Z' },
  { id: 'c4', user_id: 's3', title: 'Aprobado de Segundo B', grade: 'Segundo', section: 'B', score: 90, created_at: '2026-10-27T10:00:00Z' },
];

async function boot() {
  const node = await startNode({ students: STUDENTS, groups: GROUPS, members: MEMBERS, cloudProjects: CLOUD });
  return { node, t1: await node.login('s1'), t2: await node.login('s2'), t3: await node.login('s3') };
}
const feed = async (node, token) => (await node.api('/api/feed', { token }));
const ids = (r) => r.data.projects.map(p => p.id);

test('sin sesión, /api/feed responde 401', { skip, timeout: 60000 }, async () => {
  const { node } = await boot();
  try { assert.equal((await feed(node, undefined)).status, 401); } finally { await node.stop(); }
});

test('un estudiante ve lo aprobado de su clase y lo de su equipo; nada de otra sección ni borradores ajenos', { skip, timeout: 60000 }, async () => {
  const { node, t1, t3 } = await boot();
  try {
    assert.deepEqual(ids(await feed(node, t1)), ['c1', 'c3']);
    assert.deepEqual(ids(await feed(node, t3)), ['c4'], 'otra sección ve solo lo suyo');
  } finally { await node.stop(); }
});

test('el dueño ve su proyecto aunque no esté aprobado', { skip, timeout: 60000 }, async () => {
  const { node, t2 } = await boot();
  try { assert.deepEqual(ids(await feed(node, t2)), ['c1', 'c2', 'c3']); } finally { await node.stop(); }
});

test('la retroalimentación solo llega al dueño y a su equipo', { skip, timeout: 60000 }, async () => {
  const { node, t1, t2 } = await boot();
  try {
    const mine = Object.fromEntries((await feed(node, t1)).data.projects.map(p => [p.id, p.feedback]));
    assert.equal(mine.c1, null, 'Ana no ve la retroalimentación de un proyecto ajeno');
    assert.equal(mine.c3, 'Revisa tu video', 'pero sí la del proyecto de su equipo');
    const owner = Object.fromEntries((await feed(node, t2)).data.projects.map(p => [p.id, p.feedback]));
    assert.equal(owner.c1, 'Muy bien');
  } finally { await node.stop(); }
});

test('un proyecto guardado en el nodo aparece primero con su estado; uno ya publicado no se duplica', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    const buf = Buffer.alloc(1000, 5);
    const made = (await node.api('/api/projects', { method: 'POST', token: t1, body: { title: 'Mi robot guardado', description: DESC, bimestre: 1, filename: 'v.mp4', size: buf.length } })).data;
    assert.equal((await fetch(`${node.base}/api/projects/${made.id}/file`, { method: 'PUT', headers: { Authorization: `Bearer ${t1}` }, body: buf })).status, 200);
    let list = (await feed(node, t1)).data.projects;
    assert.equal(list[0].title, 'Mi robot guardado');
    assert.deepEqual([list[0].state, list[0].mine, list[0].kind], ['pending', true, 'video']);
    assert.deepEqual(list.slice(1).map(p => p.id), ['c1', 'c3']);

    // Ya subido a la nube y presente en las fichas: se muestra la ficha de la nube, no dos veces.
    await node.stopServer();
    const { openSqlite } = await import('./helpers/start-node.mjs');
    const path = await import('node:path');
    const db = openSqlite(path.join(node.dataDir, 'node.db'));
    db.prepare("UPDATE projects SET status = 'synced', cloud_project_id = 'c3' WHERE id = ?").run(made.id);
    db.close();
    await node.startServer();
    list = (await feed(node, t1)).data.projects;
    assert.deepEqual(list.map(p => p.id), ['c1', 'c3']);
  } finally { await node.stop(); }
});

test('ningún campo de la respuesta trae video_url ni rutas', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    const res = await feed(node, t1);
    assert.ok(res.data.projects.length > 0, 'la respuesta no está vacía');
    const body = JSON.stringify(res.data);
    assert.doesNotMatch(body, /video_url|cloud_path|storage/i);
  } finally { await node.stop(); }
});
