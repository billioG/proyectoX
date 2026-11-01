// XP del estudiante en el nodo, de extremo a extremo: GET /api/xp, POST /api/chest y +10 XP al completar una lección.
// Arranca school-node/server.js de verdad. Se omite si better-sqlite3 no está compilado para esta versión de Node.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { startNode, sqliteAvailable, stopAllNodes } from './helpers/start-node.mjs';

after(() => stopAllNodes());

const skip = !sqliteAvailable() && 'better-sqlite3 no está instalado para esta versión de Node';
const STUDENTS = [{ id: 's1', full_name: 'Ana' }, { id: 's2', full_name: 'Beto' }];
// Los alumnos son de Primero A; el curso de Segundo B no es de su clase.
const COURSES = [
  { id: 'c1', title: 'Robótica', grade: 'Primero', section: 'A', created_at: '2026-10-01', lessons: ['l1', 'l2', 'l3'].map((id, i) => ({ id, order_index: i })) },
  { id: 'c2', title: 'Otra clase', grade: 'Segundo', section: 'B', created_at: '2026-10-01', lessons: [{ id: 'otra-clase', order_index: 0 }] },
];

async function boot(xp) {
  const node = await startNode({ students: STUDENTS, xp, courses: COURSES });
  return { node, t1: await node.login('s1'), t2: await node.login('s2') };
}
const complete = (node, token, lesson_id, status = 'completed') =>
  node.api('/api/completions', { method: 'POST', token, body: { lesson_id, score: 90, status } });

test('sin sesión, /api/xp y /api/chest responden 401', { skip, timeout: 60000 }, async () => {
  const { node } = await boot();
  try {
    assert.equal((await node.api('/api/xp')).status, 401);
    assert.equal((await node.api('/api/chest', { method: 'POST' })).status, 401);
  } finally { await node.stop(); }
});

test('completar una lección da +10 XP una sola vez y /api/xp lo suma', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    const first = await complete(node, t1, 'l1');
    assert.deepEqual(first.data, { ok: true, xp: 10 });
    const again = await complete(node, t1, 'l1');
    assert.deepEqual(again.data, { ok: true }, 'la misma lección no vuelve a dar XP');
    const sum = (await node.api('/api/xp', { token: t1 })).data;
    assert.deepEqual([sum.xp_pending, sum.xp, sum.level], [10, 10, 1]);
  } finally { await node.stop(); }
});

test('una lección en progreso no da XP; al completarla sí', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    assert.deepEqual((await complete(node, t1, 'l1', 'in_progress')).data, { ok: true });
    assert.equal((await node.api('/api/xp', { token: t1 })).data.xp, 0);
    assert.deepEqual((await complete(node, t1, 'l1', 'completed')).data, { ok: true, xp: 10 });
    assert.equal((await node.api('/api/xp', { token: t1 })).data.xp, 10);
  } finally { await node.stop(); }
});

test('el cofre se abre una vez al día (409 el segundo) y suma al XP y a las gemas', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    assert.equal((await node.api('/api/xp', { token: t1 })).data.chest_available, true);
    const open = await node.api('/api/chest', { method: 'POST', token: t1 });
    assert.equal(open.status, 200);
    assert.ok([[20, 5], [50, 15], [100, 50]].some(([x, g]) => x === open.data.xp && g === open.data.gems), JSON.stringify(open.data));
    assert.ok(open.data.msg);
    const second = await node.api('/api/chest', { method: 'POST', token: t1 });
    assert.equal(second.status, 409);
    assert.match(second.data.error, /Ya reclamaste/);
    const sum = (await node.api('/api/xp', { token: t1 })).data;
    assert.deepEqual([sum.xp, sum.gems_total, sum.chest_available], [open.data.xp, open.data.gems, false]);
  } finally { await node.stop(); }
});

test('cada estudiante ve solo su XP; la base de la nube se suma a lo pendiente', { skip, timeout: 60000 }, async () => {
  const { node, t1, t2 } = await boot({ s1: { xp_total: 420, gems: 12 } });
  try {
    await complete(node, t1, 'l1');
    const a = (await node.api('/api/xp', { token: t1 })).data;
    assert.deepEqual([a.xp_total, a.xp_pending, a.xp, a.gems, a.has_base], [420, 10, 430, 12, true]);
    const b = (await node.api('/api/xp', { token: t2 })).data;
    assert.deepEqual([b.xp, b.has_base], [0, false]);
  } finally { await node.stop(); }
});

test('si la nube ya registró el cofre de hoy, el nodo no ofrece otro', { skip, timeout: 60000 }, async () => {
  const today = new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
  const { node, t1 } = await boot({ s1: { xp_total: 100, gems: 5, daily_chest_last_claimed: today } });
  try {
    assert.equal((await node.api('/api/xp', { token: t1 })).data.chest_available, false);
    assert.equal((await node.api('/api/chest', { method: 'POST', token: t1 })).status, 409);
  } finally { await node.stop(); }
});

test('una lección inventada o de otra clase no se acepta: sin XP y sin dejar progreso sucio', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    for (const id of ['inventada', 'otra-clase', 'x'.repeat(5000)]) {
      const r = await complete(node, t1, id);
      assert.equal(r.status, 404, id.slice(0, 20));
      assert.match(r.data.error, /no existe en tu clase/i);
    }
    const sum = (await node.api('/api/xp', { token: t1 })).data;
    assert.deepEqual([sum.xp_pending, sum.xp], [0, 0]);
    const { openSqlite } = await import('./helpers/start-node.mjs');
    const path = await import('node:path');
    await node.stopServer();
    const db = openSqlite(path.join(node.dataDir, 'node.db'));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM completions').get().n, 0, 'no se guardó ningún avance');
    db.close();
    await node.startServer();
  } finally { await node.stop(); }
});
