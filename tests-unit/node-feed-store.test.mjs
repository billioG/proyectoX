// Las fichas de proyectos que baja el pull (cloud_projects) y cómo las guarda applyPull.
// Usa SQLite de verdad; se omite si better-sqlite3 no está compilado para esta versión de Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sqliteAvailable } from './helpers/start-node.mjs';

const skip = !sqliteAvailable() && 'better-sqlite3 no está instalado para esta versión de Node';
const ficha = (patch = {}) => ({
  id: 'p1', user_id: 's1', group_id: null, title: 'Robot seguidor', description: 'Un robot.', bimestre: 2, score: 80, votes: 3,
  created_at: '2026-10-30T10:00:00Z', author_name: 'Ana Pérez', group_name: null, grade: 'Primero', section: 'A', kind: 'video', feedback: 'Muy bien', ...patch,
});
const pull = (patch = {}) => ({ students: [], courses: [], completions: [], files: [], node: { name: 'Nodo', school_code: 'ESC1' }, server_time: '2026-11-01T00:00:00Z', ...patch });

async function setup() {
  const { openDb } = await import('../school-node/db.js');
  const { applyPull } = await import('../school-node/sync.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-feed-'));
  const db = openDb(dir);
  const all = () => db.prepare('SELECT * FROM cloud_projects ORDER BY id').all().map(r => ({ ...r }));
  return { db, applyPull, all, done: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('applyPull guarda las fichas y las reemplaza completas en el siguiente pull', { skip }, async () => {
  const s = await setup();
  try {
    s.applyPull(s.db, pull({ projects: [ficha(), ficha({ id: 'p2', title: 'Otro', kind: 'model' })] }));
    assert.deepEqual(s.all().map(r => [r.id, r.title, r.kind, r.score, r.feedback, r.author_name]), [['p1', 'Robot seguidor', 'video', 80, 'Muy bien', 'Ana Pérez'], ['p2', 'Otro', 'model', 80, 'Muy bien', 'Ana Pérez']]);
    s.applyPull(s.db, pull({ projects: [ficha({ id: 'p3' })] }));
    assert.deepEqual(s.all().map(r => r.id), ['p3'], 'las anteriores se reemplazaron');
  } finally { s.done(); }
});

test('un pull SIN projects (función vieja o USB antiguo) no borra las fichas guardadas', { skip }, async () => {
  const s = await setup();
  try {
    s.applyPull(s.db, pull({ projects: [ficha()] }));
    s.applyPull(s.db, pull());
    assert.deepEqual(s.all().map(r => r.id), ['p1']);
  } finally { s.done(); }
});

test('un pull con projects vacío vacía la lista', { skip }, async () => {
  const s = await setup();
  try {
    s.applyPull(s.db, pull({ projects: [ficha()] }));
    s.applyPull(s.db, pull({ projects: [] }));
    assert.deepEqual(s.all(), []);
  } finally { s.done(); }
});
