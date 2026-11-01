// Funciones (RPC) emuladas de la capa local y el XP pendiente: cofre diario, XP de lecciones, racha y latido.
// El XP que se gana en el nodo se suma a lo que bajó de la nube (se ve al instante) y se manda en la próxima sincronización.
// Corre con Node 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { createRestLayer } from '../school-node/rest/index.js';
import { buildPush, applyPull } from '../school-node/sync.js';
import { hashClassPassword } from '../school-node/rest/auth.js';

const cleanups = [];
test.after(async () => { for (const c of cleanups.reverse()) await c(); });

const UPSERT = { prefer: 'resolution=merge-duplicates' };
const DAY = Date.UTC(2026, 10, 2, 18, 0, 0); // 2 nov 2026, 12:00 en Guatemala (UTC-6)
const GT_TODAY = '2026-11-02';

function boot({ chestLast = null, xp = 100, gems = 10 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-rpcs-'));
  const db = openDb(dir);
  const clock = { now: DAY };
  const layer = createRestLayer(db, { now: () => clock.now, random: () => 0 }); // random 0 = primer premio
  const salt = 'ab'.repeat(8);
  const pull = {
    server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
    tables: { students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp, gems, streak: 6, last_login: '2026-11-01', daily_chest_last_claimed: chestLast }], lessons: [{ id: 'l1', audience: 'estudiante' }] },
  };
  applyPull(db, pull);
  cleanups.push(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const ctx = { uid: 's1', role: 'student', classKey: 'ESC1|Primero|A' };
  const me = () => layer.store.all('students').find((s) => s.id === 's1');
  return { db, layer, clock, ctx, me, pull };
}

test('cofre diario: da el premio, lo suma al instante, queda anotado para la nube y no se puede repetir el mismo día', () => {
  const { layer, ctx, me, db } = boot();
  const prize = layer.rpcs.claim_daily_chest({}, ctx);
  assert.deepEqual(prize, { xp: 20, gems: 5, msg: 'Poquito pero bendito' });
  assert.deepEqual([me().xp, me().gems, me().daily_chest_last_claimed], [120, 15, GT_TODAY]);
  assert.deepEqual(buildPush(db).xp_events.map((e) => [e.student_id, e.ref, e.xp, e.gems]), [['s1', GT_TODAY, 20, 5]]);
  assert.throws(() => layer.rpcs.claim_daily_chest({}, ctx), (e) => e.status === 400 && /Ya reclamaste el cofre de hoy/.test(e.message));
  assert.equal(me().xp, 120, 'el segundo intento no suma');
});

test('cofre: si la nube dice que ya se reclamó hoy, el nodo tampoco lo da; al día siguiente sí', () => {
  const { layer, ctx, clock } = boot({ chestLast: GT_TODAY });
  assert.throws(() => layer.rpcs.claim_daily_chest({}, ctx), /Ya reclamaste/);
  clock.now += 24 * 3600_000;
  assert.equal(layer.rpcs.claim_daily_chest({}, ctx).xp, 20);
});

test('la medianoche de Guatemala (no la de UTC) cambia el día del cofre', () => {
  const { layer, ctx, clock } = boot();
  layer.rpcs.claim_daily_chest({}, ctx);
  clock.now = Date.UTC(2026, 10, 3, 3, 0, 0); // 3 nov 03:00 UTC = 2 nov 21:00 en Guatemala: aún es el mismo día
  assert.throws(() => layer.rpcs.claim_daily_chest({}, ctx), /Ya reclamaste/);
  clock.now = Date.UTC(2026, 10, 3, 6, 0, 1); // 00:00:01 del 3 nov en Guatemala
  assert.doesNotThrow(() => layer.rpcs.claim_daily_chest({}, ctx));
});

test('un docente no tiene cofre en el nodo (todavía): error claro, sin tocar nada', () => {
  const { layer } = boot();
  assert.throws(() => layer.rpcs.claim_daily_chest({}, { uid: 't1', role: 'teacher', classKey: null }), (e) => e.status === 400);
});

test('racha y latido: no inventan cambios (la racha la calcula la nube)', () => {
  const { layer, ctx, me } = boot();
  assert.deepEqual(layer.rpcs.touch_daily_login({}, ctx), { streak: 6, changed: false, lastLogin: '2026-11-01' });
  assert.equal(layer.rpcs.record_active_heartbeat({}, ctx), null);
  assert.equal(me().streak, 6);
});

async function serve(layer) {
  const server = http.createServer(async (req, res) => { if (!(await layer.routes.handle(req, res, new URL(req.url, 'http://node')))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, { token, body, headers = {} } = {}) => fetch(base + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const { token_hash } = await (await call('POST', '/functions/v1/student-login', { body: { username: 'ana1', password: 'clase123' } })).json();
  const session = await (await call('POST', '/auth/v1/verify', { body: { type: 'magiclink', token_hash } })).json();
  return { call, token: session.access_token };
}

test('completar una lección suma 10 XP una sola vez y la nube lo confirma al sincronizar', async () => {
  const { layer, me, db, pull } = boot();
  const { call, token } = await serve(layer);
  const lesson = { lesson_id: 'l1', student_id: 's1', score: 90, status: 'completed' };
  assert.equal((await call('POST', '/rest/v1/lesson_completions?on_conflict=lesson_id,student_id', { token, body: lesson, headers: UPSERT })).status, 201);
  assert.equal(me().xp, 110);
  assert.equal((await call('POST', '/rest/v1/lesson_completions?on_conflict=lesson_id,student_id', { token, body: { ...lesson, score: 100 }, headers: UPSERT })).status, 201);
  assert.equal(me().xp, 110, 'repetir la lección no vuelve a pagar');

  // La nube recibió el avance y su XP ya viene en la base nueva: lo pendiente se borra y no se cuenta doble.
  const push = buildPush(db);
  applyPull(db, { ...pull, tables: { ...pull.tables, students: [{ ...pull.tables.students[0], xp: 110 }] } }, push);
  assert.equal(me().xp, 110);
});

test('el XP pendiente lo ve el propio estudiante y su salón igual que en línea; el de otra clase no se ve', async () => {
  const { layer } = boot();
  layer.store.put('students', { id: 's9', username: 'zoe9', full_name: 'Zoe', school_code: 'ESC1', grade: 'Segundo', section: 'B', status: 'activo', xp: 5 });
  const { call, token } = await serve(layer);
  const own = await (await call('GET', '/rest/v1/students?select=id,xp&id=eq.s1', { token })).json();
  assert.deepEqual(own, [{ id: 's1', xp: 100 }]);
  assert.deepEqual(await (await call('GET', '/rest/v1/students?select=id&id=eq.s9', { token })).json(), []);
});
