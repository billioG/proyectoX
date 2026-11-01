// Reacciones a proyectos en el nodo: reacción final por (estudiante, proyecto), votos mostrados y sincronización
// (school-node/reactions.js + sync.js). Usa SQLite de verdad; se omite si better-sqlite3 no está compilado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sqliteAvailable } from './helpers/start-node.mjs';

const skip = !sqliteAvailable() && 'better-sqlite3 no está instalado para esta versión de Node';
const student = (patch = {}) => ({ id: 's1', username: 's1', full_name: 'Ana', grade: 'Primero', section: 'A', status: 'activo', ...patch });
const ficha = (patch = {}) => ({
  id: '27', user_id: 's9', group_id: null, title: 'Robot', description: 'Un robot.', bimestre: 1, score: 80, votes: 3,
  created_at: '2026-10-30T10:00:00Z', author_name: 'Luis', group_name: null, grade: 'Primero', section: 'A', kind: 'video', feedback: null, ...patch,
});
const pull = (patch = {}) => ({
  students: [student()], courses: [], completions: [], files: [], node: { name: 'Nodo', school_code: 'ESC1' }, server_time: '2026-11-01T00:00:00Z',
  projects: [ficha()], reactions: [], ...patch,
});

async function setup() {
  const { openDb } = await import('../school-node/db.js');
  const sync = await import('../school-node/sync.js');
  const { createReactionStore } = await import('../school-node/reactions.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-react-'));
  const db = openDb(dir);
  const clock = { t: Date.parse('2026-11-01T15:00:00Z') };
  const store = createReactionStore(db, { now: () => clock.t });
  sync.applyPull(db, pull());
  const left = () => db.prepare('SELECT COUNT(*) n FROM reactions_local').get().n;
  return { db, sync, store, clock, left, done: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('react: reaccionar, cambiar y tocar la misma para quitar', { skip }, async () => {
  const s = await setup();
  try {
    assert.equal(s.store.effective('s1', 27), null);
    assert.deepEqual(s.store.react('s1', 27, 'like'), { mine: 'like' });
    assert.deepEqual(s.store.react('s1', 27, 'wow'), { mine: 'wow' });
    assert.equal(s.store.effective('s1', 27), 'wow');
    assert.deepEqual(s.store.react('s1', 27, 'wow'), { mine: null }, 'la misma reacción la quita');
    assert.equal(s.store.effective('s1', 27), null);
    assert.equal(s.left(), 1, 'queda un solo pendiente por estudiante y proyecto (el estado final)');
  } finally { s.done(); }
});

test('react: una reacción inventada lanza 400 y no deja nada', { skip }, async () => {
  const s = await setup();
  try {
    assert.throws(() => s.store.react('s1', 27, 'love'), (e) => e.status === 400);
    assert.throws(() => s.store.react('s1', 27, null), (e) => e.status === 400);
    assert.equal(s.left(), 0);
  } finally { s.done(); }
});

test('votes: solo like y excelente cuentan, sumados a los votos de la nube', { skip }, async () => {
  const s = await setup();
  try {
    const votes = () => s.store.adjustVotes('s1', 27, 3);
    assert.equal(votes(), 3);
    s.store.react('s1', 27, 'like'); assert.equal(votes(), 4);
    s.store.react('s1', 27, 'wow'); assert.equal(votes(), 3, 'wow no cuenta');
    s.store.react('s1', 27, 'excelente'); assert.equal(votes(), 4);
    s.store.react('s1', 27, 'excelente'); assert.equal(votes(), 3, 'quitarla resta');
  } finally { s.done(); }
});

test('votes: si la nube ya contaba mi like, quitarlo baja el conteo sin dejarlo en negativo', { skip }, async () => {
  const s = await setup();
  try {
    s.sync.applyPull(s.db, pull({ reactions: [{ student_id: 's1', project_id: 27, reaction: 'like' }] }));
    assert.equal(s.store.effective('s1', 27), 'like', 'la base de la nube se ve como mi reacción');
    assert.equal(s.store.adjustVotes('s1', 27, 3), 3);
    s.store.react('s1', 27, 'like'); // la quita
    assert.equal(s.store.adjustVotes('s1', 27, 3), 2);
    assert.equal(s.store.adjustVotes('s1', 27, 0), 0, 'nunca baja de 0');
  } finally { s.done(); }
});

test('buildPush manda solo el estado final de cada par, con updated_at', { skip }, async () => {
  const s = await setup();
  try {
    s.store.react('s1', 27, 'like');
    s.clock.t += 1000;
    s.store.react('s1', 27, 'animo');
    const push = s.sync.buildPush(s.db);
    assert.deepEqual(push.reactions.map(r => [r.student_id, r.project_id, r.reaction]), [['s1', 27, 'animo']]);
    assert.ok(push.reactions[0].updated_at);
    s.store.react('s1', 27, 'animo'); // la quita: se manda null
    assert.deepEqual(s.sync.buildPush(s.db).reactions.map(r => r.reaction), [null]);
  } finally { s.done(); }
});

// ---- Solo se borra lo que la nube confirmó o rechazó de forma definitiva ----
async function pushed() {
  const s = await setup();
  s.store.react('s1', 27, 'like');
  return { s, push: s.sync.buildPush(s.db) };
}

test('confirmado en applied.reactions: se borra el pendiente y la base nueva ya lo incluye', { skip }, async () => {
  const { s, push } = await pushed();
  try {
    s.sync.applyPull(s.db, pull({ applied: { reactions: ['s1|27'] }, reactions: [{ student_id: 's1', project_id: 27, reaction: 'like' }], projects: [ficha({ votes: 4 })] }), push);
    assert.equal(s.left(), 0);
    assert.equal(s.store.effective('s1', 27), 'like');
    assert.equal(s.store.adjustVotes('s1', 27, 4), 4, 'no se cuenta dos veces');
  } finally { s.done(); }
});

test('con la función vieja (sin applied.reactions) o con error pasajero, la reacción se conserva', { skip }, async () => {
  const { s, push } = await pushed();
  try {
    s.sync.applyPull(s.db, pull({ applied: { completions: 0 } }), push);
    assert.equal(s.left(), 1, 'sin applied.reactions no se borra nada');
    s.sync.applyPull(s.db, pull({ applied: { reactions: [] }, reaction_errors: [{ student_id: 's1', project_id: 27, error: 'timeout', permanent: false }] }), push);
    assert.equal(s.left(), 1, 'error pasajero: se reintenta');
    assert.equal(s.store.effective('s1', 27), 'like', 'el estudiante sigue viendo su reacción');
  } finally { s.done(); }
});

test('rechazo definitivo (permanent): se borra', { skip }, async () => {
  const { s, push } = await pushed();
  try {
    s.sync.applyPull(s.db, pull({ applied: { reactions: [] }, reaction_errors: [{ student_id: 's1', project_id: 27, error: 'Proyecto inválido.', permanent: true }] }), push);
    assert.equal(s.left(), 0);
  } finally { s.done(); }
});

test('una reacción cambiada mientras se sincronizaba conserva el pendiente nuevo', { skip }, async () => {
  const { s, push } = await pushed();
  try {
    s.clock.t += 5000;
    s.store.react('s1', 27, 'wow'); // cambió durante la subida
    s.sync.applyPull(s.db, pull({ applied: { reactions: ['s1|27'] } }), push);
    assert.equal(s.left(), 1);
    assert.equal(s.store.effective('s1', 27), 'wow');
  } finally { s.done(); }
});

test('un pull SIN reactions conserva la base; con reactions: [] la vacía', { skip }, async () => {
  const s = await setup();
  try {
    s.sync.applyPull(s.db, pull({ reactions: [{ student_id: 's1', project_id: 27, reaction: 'excelente' }] }));
    const { reactions, ...sinReacciones } = pull();
    s.sync.applyPull(s.db, sinReacciones);
    assert.equal(s.store.effective('s1', 27), 'excelente', 'función vieja o USB antiguo: no se borra');
    s.sync.applyPull(s.db, pull({ reactions: [] }));
    assert.equal(s.store.effective('s1', 27), null);
  } finally { s.done(); }
});
