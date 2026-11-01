// XP del nodo: eventos pendientes, base de la nube, cofre diario y sincronización (school-node/xp.js + sync.js).
// Usa SQLite de verdad; se omite si better-sqlite3 no está compilado para esta versión de Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sqliteAvailable } from './helpers/start-node.mjs';

const skip = !sqliteAvailable() && 'better-sqlite3 no está instalado para esta versión de Node';
const T = (iso) => Date.parse(iso);
const pull = (students, patch = {}) => ({
  students, courses: [], completions: [], files: [], node: { name: 'Nodo', school_code: 'ESC1' }, server_time: '2026-11-01T00:00:00Z', ...patch,
});
const cloudStudent = (patch = {}) => ({ id: 's1', username: 's1', full_name: 'Ana', grade: 'Primero', section: 'A', status: 'activo', ...patch });

async function setup(clock = { t: T('2026-11-01T15:00:00Z') }, random = () => 0.5) {
  const { openDb } = await import('../school-node/db.js');
  const sync = await import('../school-node/sync.js');
  const { createXpStore } = await import('../school-node/xp.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-xp-'));
  const db = openDb(dir);
  const store = createXpStore(db, { now: () => clock.t, random });
  const student = () => ({ ...db.prepare('SELECT * FROM students WHERE id = ?').get('s1') });
  const load = (patch) => sync.applyPull(db, pull([cloudStudent(patch)]));
  return { db, sync, store, student, load, clock, done: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('recordLesson crea el evento una sola vez por lección', { skip }, async () => {
  const s = await setup();
  try {
    s.load();
    assert.equal(s.store.recordLesson('s1', 'l1'), true);
    assert.equal(s.store.recordLesson('s1', 'l1'), false, 'la misma lección no paga dos veces');
    assert.equal(s.store.recordLesson('s1', 'l2'), true);
    assert.equal(s.store.summary(s.student()).xp_pending, 20);
  } finally { s.done(); }
});

test('summary suma la base de la nube y los pendientes; nivel y rango salen del total', { skip }, async () => {
  const s = await setup();
  try {
    s.load({ xp_total: 490, gems: 12 });
    s.store.recordLesson('s1', 'l1');
    const sum = s.store.summary(s.student());
    assert.deepEqual([sum.xp_total, sum.xp_pending, sum.xp, sum.level, sum.level_xp, sum.gems, sum.gems_pending, sum.gems_total], [490, 10, 500, 2, 0, 12, 0, 12]);
  } finally { s.done(); }
});

test('sin base de la nube (función vieja) el resumen parte de cero y marca has_base false', { skip }, async () => {
  const s = await setup();
  try {
    s.load();
    const sum = s.store.summary(s.student());
    assert.deepEqual([sum.xp_total, sum.gems, sum.xp, sum.level, sum.has_base], [0, 0, 0, 1, false]);
  } finally { s.done(); }
});

test('claimChest da uno de los tres premios, lo suma como pendiente y el segundo intento el mismo día es 409', { skip }, async () => {
  for (const [r, xp, gems] of [[0, 20, 5], [0.5, 50, 15], [0.99, 100, 50]]) {
    const s = await setup(undefined, () => r);
    try {
      s.load();
      assert.equal(s.store.summary(s.student()).chest_available, true);
      const prize = s.store.claimChest(s.student());
      assert.deepEqual([prize.xp, prize.gems], [xp, gems]);
      assert.ok(prize.msg);
      const sum = s.store.summary(s.student());
      assert.deepEqual([sum.xp_pending, sum.gems_pending, sum.chest_available], [xp, gems, false]);
      assert.throws(() => s.store.claimChest(s.student()), (e) => e.status === 409 && /Ya reclamaste/.test(e.message));
    } finally { s.done(); }
  }
});

test('el día cambia en hora de Guatemala (UTC-6): a las 03:00 UTC todavía es el día anterior', { skip }, async () => {
  const s = await setup({ t: T('2026-11-02T03:00:00Z') });
  try {
    s.load({ daily_chest_last_claimed: '2026-11-01' });
    assert.equal(s.store.summary(s.student()).today, '2026-11-01');
    assert.equal(s.store.summary(s.student()).chest_available, false);
    s.clock.t = T('2026-11-02T06:00:00Z'); // 00:00 en Guatemala
    assert.equal(s.store.summary(s.student()).today, '2026-11-02');
    assert.equal(s.store.summary(s.student()).chest_available, true);
  } finally { s.done(); }
});

test('no hay cofre si la nube dice que hoy ya se reclamó', { skip }, async () => {
  const s = await setup();
  try {
    s.load({ daily_chest_last_claimed: '2026-11-01' });
    assert.equal(s.store.summary(s.student()).chest_available, false);
    assert.throws(() => s.store.claimChest(s.student()), (e) => e.status === 409);
  } finally { s.done(); }
});

test('buildPush incluye solo los cofres pendientes', { skip }, async () => {
  const s = await setup();
  try {
    s.load();
    s.store.recordLesson('s1', 'l1');
    s.store.claimChest(s.student());
    const push = s.sync.buildPush(s.db);
    assert.deepEqual(push.xp_events.map(e => [e.kind, e.student_id, e.ref, e.xp, e.gems]), [['chest', 's1', '2026-11-01', 50, 15]]);
  } finally { s.done(); }
});

test('tras sincronizar, el XP pendiente enviado se borra y el nuevo total ya lo incluye: no se cuenta dos veces', { skip }, async () => {
  const s = await setup(undefined, () => 0.5);
  try {
    s.load({ xp_total: 100, gems: 10 });
    s.db.prepare("INSERT INTO completions (lesson_id, student_id, score, status, updated_at, dirty) VALUES ('l1', 's1', 90, 'completed', '2026-11-01T14:00:00Z', 1)").run();
    s.store.recordLesson('s1', 'l1');
    s.store.claimChest(s.student());
    assert.equal(s.store.summary(s.student()).xp, 100 + 10 + 50);

    const push = s.sync.buildPush(s.db);
    // La nube pagó la lección (+10) y el cofre (+50/15): su nuevo total es 160 / 25 y reclamó hoy.
    s.sync.applyPull(s.db, pull([cloudStudent({ xp_total: 160, gems: 25, daily_chest_last_claimed: '2026-11-01' })], { applied: { xp_events: ['s1|2026-11-01'] } }), push);
    const sum = s.store.summary(s.student());
    assert.deepEqual([sum.xp_total, sum.xp_pending, sum.xp, sum.gems_total, sum.chest_available], [160, 0, 160, 25, false]);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM xp_events_local').get().n, 0);
  } finally { s.done(); }
});

test('una lección completada durante la sincronización conserva su evento pendiente', { skip }, async () => {
  const s = await setup();
  try {
    s.load();
    s.db.prepare("INSERT INTO completions (lesson_id, student_id, score, status, updated_at, dirty) VALUES ('l1', 's1', 90, 'completed', '2026-11-01T14:00:00Z', 1)").run();
    s.store.recordLesson('s1', 'l1');
    const push = s.sync.buildPush(s.db);
    // Mientras sube, el estudiante vuelve a completar (cambia updated_at y queda sucio).
    s.db.prepare("UPDATE completions SET updated_at = '2026-11-01T14:00:05Z', dirty = 1 WHERE lesson_id = 'l1'").run();
    s.sync.applyPull(s.db, pull([cloudStudent()]), push);
    assert.equal(s.store.summary(s.student()).xp_pending, 10);
  } finally { s.done(); }
});

test('un pull sin xp_total conserva la base anterior (función vieja o USB antiguo)', { skip }, async () => {
  const s = await setup();
  try {
    s.load({ xp_total: 300, gems: 7, daily_chest_last_claimed: '2026-10-31' });
    s.load(); // sin esos campos
    const sum = s.store.summary(s.student());
    assert.deepEqual([sum.xp_total, sum.gems, sum.has_base], [300, 7, true]);
    assert.equal(sum.chest_available, true);
  } finally { s.done(); }
});

// ---- El nodo solo borra los cofres que la nube confirmó o rechazó de forma definitiva ----
async function withChestPushed(random = () => 0.5) {
  const s = await setup(undefined, random);
  s.load();
  s.store.claimChest(s.student());
  const push = s.sync.buildPush(s.db);
  assert.equal(push.xp_events.length, 1);
  return { s, push };
}
const chestsLeft = (s) => s.db.prepare("SELECT COUNT(*) n FROM xp_events_local WHERE kind = 'chest'").get().n;

test('con la función vieja (la respuesta no trae applied.xp_events) el cofre pendiente se conserva', { skip }, async () => {
  const { s, push } = await withChestPushed();
  try {
    s.sync.applyPull(s.db, pull([cloudStudent()], { applied: { completions: 0 } }), push);
    assert.equal(chestsLeft(s), 1);
    assert.equal(s.store.summary(s.student()).xp_pending, 50, 'el estudiante no ve bajar su XP');
    assert.equal(s.sync.buildPush(s.db).xp_events.length, 1, 'se reenvía en el próximo sync');
  } finally { s.done(); }
});

test('un cofre con error pasajero de la nube (xp_errors sin permanent) se conserva para reintentar', { skip }, async () => {
  const { s, push } = await withChestPushed();
  try {
    s.sync.applyPull(s.db, pull([cloudStudent()], { applied: { xp_events: [] }, xp_errors: [{ student_id: 's1', ref: '2026-11-01', error: 'timeout', permanent: false }] }), push);
    assert.equal(chestsLeft(s), 1);
  } finally { s.done(); }
});

test('un cofre que la nube rechazó de forma definitiva (permanent) se borra', { skip }, async () => {
  const { s, push } = await withChestPushed();
  try {
    s.sync.applyPull(s.db, pull([cloudStudent()], { applied: { xp_events: [] }, xp_errors: [{ student_id: 's1', ref: '2026-11-01', error: 'Premio del cofre inválido.', permanent: true }] }), push);
    assert.equal(chestsLeft(s), 0);
  } finally { s.done(); }
});

test('un cofre confirmado en applied.xp_events se borra', { skip }, async () => {
  const { s, push } = await withChestPushed();
  try {
    s.sync.applyPull(s.db, pull([cloudStudent()], { applied: { xp_events: ['s1|2026-11-01'] } }), push);
    assert.equal(chestsLeft(s), 0);
  } finally { s.done(); }
});
