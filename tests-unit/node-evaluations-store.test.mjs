// Evaluaciones de proyectos que hace un docente en el nodo: lista por clases asignadas, guardar con el total
// recalculado, pendientes de sincronizar y docentes que baja el pull (school-node/evaluations.js + sync.js).
// Usa SQLite de verdad; se omite si better-sqlite3 no está compilado para esta versión de Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sqliteAvailable } from './helpers/start-node.mjs';

const skip = !sqliteAvailable() && 'better-sqlite3 no está instalado para esta versión de Node';
const REF = '3f2b8c1e-1d4a-4c52-9a3e-0b6d7c8e9f10';
const ficha = (patch = {}) => ({
  id: '27', user_id: 's1', group_id: null, title: 'Robot', description: 'Un robot.', bimestre: 1, score: 0, votes: 0,
  created_at: '2026-10-30T10:00:00Z', author_name: 'Ana', group_name: null, grade: 'Primero', section: 'A', kind: 'video', feedback: null, ...patch,
});
const scores = (patch = {}) => ({ creativity_score: 15, clarity_score: 10, functionality_score: 20, teamwork_score: 0, social_impact_score: 5, feedback: 'Bien', ...patch });
const pull = (patch = {}) => ({
  students: [
    { id: 's1', username: 's1', full_name: 'Ana', grade: 'Primero', section: 'A', status: 'activo' },
    { id: 's2', username: 's2', full_name: 'Beto', grade: 'Segundo', section: 'B', status: 'activo' },
  ],
  courses: [], completions: [], files: [], node: { name: 'Nodo', school_code: 'ESC1' }, server_time: '2026-11-01T00:00:00Z',
  projects: [ficha(), ficha({ id: '29', user_id: 's2', author_name: 'Beto', grade: 'Segundo', section: 'B', title: 'De Segundo' })],
  teachers: [
    { id: 't1', full_name: 'Marta', assignments: [{ grade: 'Primero', section: 'A' }] },
    { id: 't2', full_name: 'Raúl', assignments: [{ grade: 'Segundo', section: 'B' }] },
  ],
  evaluations: [], ...patch,
});

async function setup() {
  const { openDb } = await import('../school-node/db.js');
  const sync = await import('../school-node/sync.js');
  const { createEvaluationStore } = await import('../school-node/evaluations.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-eval-'));
  const db = openDb(dir);
  const clock = { t: Date.parse('2026-11-01T15:00:00Z') };
  const store = createEvaluationStore(db, { now: () => clock.t });
  sync.applyPull(db, pull());
  const teacher = (id) => ({ ...db.prepare('SELECT * FROM teachers WHERE id = ?').get(id) });
  const addLocal = (patch = {}) => {
    const row = { id: REF, student_id: 's1', title: 'Mi robot guardado', description: 'x', bimestre: 1, kind: 'video', ext: 'mp4', mime: 'video/mp4', file_size: 10, status: 'pending', created_at: '2026-11-01T14:00:00Z', ...patch };
    db.prepare(`INSERT INTO projects (id, student_id, title, description, bimestre, kind, ext, mime, file_size, status, cloud_project_id, created_at)
      VALUES (@id, @student_id, @title, @description, @bimestre, @kind, @ext, @mime, @file_size, @status, @cloud_project_id, @created_at)`).run({ cloud_project_id: null, ...row });
    return row.id;
  };
  const left = () => db.prepare('SELECT COUNT(*) n FROM evaluations_local').get().n;
  return { db, sync, store, clock, teacher, addLocal, left, done: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('listForTeacher: solo proyectos de sus clases asignadas, la nube y los guardados en el nodo', { skip }, async () => {
  const s = await setup();
  try {
    s.addLocal();
    const list = s.store.listForTeacher(s.teacher('t1'));
    assert.deepEqual(list.map(i => i.key).sort(), ['c:27', `l:${REF}`].sort());
    const cloud = list.find(i => i.key === 'c:27');
    assert.deepEqual([cloud.title, cloud.author_name, cloud.grade, cloud.section, cloud.evaluated], ['Robot', 'Ana', 'Primero', 'A', false]);
    const local = list.find(i => i.key === `l:${REF}`);
    assert.deepEqual([local.title, local.author_name, local.state, local.local_id], ['Mi robot guardado', 'Ana', 'pending', REF]);
    assert.deepEqual(s.store.listForTeacher(s.teacher('t2')).map(i => i.key), ['c:29'], 'cada docente ve solo sus clases');
  } finally { s.done(); }
});

test('un proyecto guardado en el nodo y ya publicado no sale duplicado: se muestra el de la nube y recuerda su copia local', { skip }, async () => {
  const s = await setup();
  try {
    s.addLocal({ status: 'synced', cloud_project_id: '27' });
    const list = s.store.listForTeacher(s.teacher('t1'));
    assert.deepEqual(list.map(i => i.key), ['c:27']);
    assert.equal(list[0].local_id, REF, 'para poder ver el video guardado aquí');
  } finally { s.done(); }
});

test('save: recalcula el total, guarda quién evaluó y marca evaluado; el docente de otra clase recibe 403', { skip }, async () => {
  const s = await setup();
  try {
    const r = s.store.save(s.teacher('t1'), 'c:27', { ...scores(), total_score: 999 });
    assert.equal(r.total_score, 50);
    const item = s.store.listForTeacher(s.teacher('t1'))[0];
    assert.deepEqual([item.evaluated, item.score], [true, 50]);
    assert.throws(() => s.store.save(s.teacher('t2'), 'c:27', scores()), (e) => e.status === 403);
    assert.throws(() => s.store.save(s.teacher('t1'), 'c:29', scores()), (e) => e.status === 403, 'proyecto de otra clase');
    assert.throws(() => s.store.save(s.teacher('t1'), 'c:999', scores()), (e) => e.status === 404);
    assert.throws(() => s.store.save(s.teacher('t1'), 'x:1', scores()), (e) => e.status === 404);
  } finally { s.done(); }
});

test('save: notas fuera de rango, no enteras o faltantes son 400 y no dejan nada', { skip }, async () => {
  const s = await setup();
  try {
    for (const bad of [{ creativity_score: 21 }, { clarity_score: -1 }, { functionality_score: 1.5 }, { teamwork_score: '10' }, { social_impact_score: null }, { feedback: 12 }]) {
      assert.throws(() => s.store.save(s.teacher('t1'), 'c:27', scores(bad)), (e) => e.status === 400, JSON.stringify(bad));
    }
    assert.equal(s.left(), 0);
  } finally { s.done(); }
});

test('save: evaluar otra vez el mismo proyecto reemplaza (queda una sola fila) y la observación se limpia', { skip }, async () => {
  const s = await setup();
  try {
    s.store.save(s.teacher('t1'), 'c:27', scores());
    s.clock.t += 1000;
    s.store.save(s.teacher('t1'), 'c:27', scores({ creativity_score: 20, feedback: '  Excelente\u0000trabajo  ' }));
    assert.equal(s.left(), 1);
    const d = s.store.get(s.teacher('t1'), 'c:27');
    assert.deepEqual([d.evaluation.total_score, d.evaluation.feedback], [55, 'Excelente trabajo']);
  } finally { s.done(); }
});

test('get: devuelve el proyecto y la evaluación (la pendiente si hay, si no la de la nube)', { skip }, async () => {
  const s = await setup();
  try {
    s.sync.applyPull(s.db, pull({ evaluations: [{ project_id: 27, teacher_id: 't1', total_score: 40, creativity_score: 10, clarity_score: 10, functionality_score: 10, teamwork_score: 5, social_impact_score: 5, feedback: 'De la nube' }] }));
    assert.deepEqual([s.store.get(s.teacher('t1'), 'c:27').evaluation.feedback, s.store.listForTeacher(s.teacher('t1'))[0].score], ['De la nube', 40]);
    s.store.save(s.teacher('t1'), 'c:27', scores({ feedback: 'Del nodo' }));
    assert.equal(s.store.get(s.teacher('t1'), 'c:27').evaluation.feedback, 'Del nodo');
    assert.throws(() => s.store.get(s.teacher('t2'), 'c:27'), (e) => e.status === 403);
  } finally { s.done(); }
});

test('pending / buildPush: usa project_id si se conoce y node_ref si el proyecto aún no se publicó', { skip }, async () => {
  const s = await setup();
  try {
    s.addLocal();
    s.store.save(s.teacher('t1'), 'c:27', scores());
    s.store.save(s.teacher('t1'), `l:${REF}`, scores({ creativity_score: 1 }));
    const byKey = Object.fromEntries(s.sync.buildPush(s.db).evaluations.map(e => [e.key, e]));
    assert.deepEqual([byKey['c:27'].project_id, byKey['c:27'].node_ref, byKey['c:27'].teacher_id], [27, null, 't1']);
    assert.deepEqual([byKey[`l:${REF}`].project_id, byKey[`l:${REF}`].node_ref], [null, REF]);
    assert.ok(byKey['c:27'].updated_at);
    // Cuando el proyecto local se publica (se conoce su id en la nube), el envío usa project_id.
    s.db.prepare("UPDATE projects SET status = 'synced', cloud_project_id = '31' WHERE id = ?").run(REF);
    const again = s.sync.buildPush(s.db).evaluations.find(e => e.key === `l:${REF}`);
    assert.deepEqual([again.project_id, again.node_ref], [31, null]);
  } finally { s.done(); }
});

// ---- Solo se borra lo que la nube confirmó o rechazó de forma definitiva ----
async function pushed() {
  const s = await setup();
  s.store.save(s.teacher('t1'), 'c:27', scores());
  return { s, push: s.sync.buildPush(s.db) };
}

test('confirmada en applied.evaluations: se borra el pendiente y la base nueva ya la incluye', { skip }, async () => {
  const { s, push } = await pushed();
  try {
    s.sync.applyPull(s.db, pull({ applied: { evaluations: ['c:27'] }, evaluations: [{ project_id: 27, teacher_id: 't1', total_score: 50, creativity_score: 15, clarity_score: 10, functionality_score: 20, teamwork_score: 0, social_impact_score: 5, feedback: 'Bien' }] }), push);
    assert.equal(s.left(), 0);
    assert.equal(s.store.get(s.teacher('t1'), 'c:27').evaluation.total_score, 50);
  } finally { s.done(); }
});

test('con la función vieja (sin applied.evaluations) o con error pasajero, la evaluación se conserva', { skip }, async () => {
  const { s, push } = await pushed();
  try {
    s.sync.applyPull(s.db, pull({ applied: { completions: 0 } }), push);
    assert.equal(s.left(), 1);
    s.sync.applyPull(s.db, pull({ applied: { evaluations: [] }, evaluation_errors: [{ key: 'c:27', error: 'aún no publicado', permanent: false }] }), push);
    assert.equal(s.left(), 1);
    assert.equal(s.store.get(s.teacher('t1'), 'c:27').evaluation.total_score, 50, 'el docente sigue viendo su evaluación');
  } finally { s.done(); }
});

test('rechazo definitivo (permanent): se borra', { skip }, async () => {
  const { s, push } = await pushed();
  try {
    s.sync.applyPull(s.db, pull({ applied: { evaluations: [] }, evaluation_errors: [{ key: 'c:27', error: 'El docente no está asignado', permanent: true }] }), push);
    assert.equal(s.left(), 0);
  } finally { s.done(); }
});

test('una evaluación cambiada mientras se sincronizaba conserva la nueva', { skip }, async () => {
  const { s, push } = await pushed();
  try {
    s.clock.t += 5000;
    s.store.save(s.teacher('t1'), 'c:27', scores({ creativity_score: 20 }));
    s.sync.applyPull(s.db, pull({ applied: { evaluations: ['c:27'] } }), push);
    assert.equal(s.left(), 1);
    assert.equal(s.store.get(s.teacher('t1'), 'c:27').evaluation.total_score, 55);
  } finally { s.done(); }
});

test('docentes del pull: se conservan los PIN, se quitan los que ya no están y un pull sin teachers no borra nada', { skip }, async () => {
  const s = await setup();
  try {
    s.db.prepare("UPDATE teachers SET pin_hash = 'h', pin_salt = 's', pin_updated_at = 'x', failed_attempts = 2 WHERE id = 't1'").run();
    s.sync.applyPull(s.db, pull({ teachers: [{ id: 't1', full_name: 'Marta Gómez', assignments: [{ grade: 'Primero', section: 'A' }, { grade: 'Primero', section: 'B' }] }] }));
    const t1 = s.teacher('t1');
    assert.deepEqual([t1.full_name, t1.pin_hash, t1.failed_attempts, JSON.parse(t1.assignments).length], ['Marta Gómez', 'h', 2, 2]);
    assert.equal(s.teacher('t2').id, undefined, 'Raúl ya no está en la escuela');
    const { teachers, ...sinDocentes } = pull();
    s.sync.applyPull(s.db, sinDocentes);
    assert.equal(s.teacher('t1').id, 't1', 'función vieja o USB antiguo: no se borran');
  } finally { s.done(); }
});

test('overlay para el Inicio: effectiveForCloud devuelve la evaluación pendiente o la de la nube', { skip }, async () => {
  const s = await setup();
  try {
    assert.equal(s.store.effectiveForCloud(27), null);
    s.store.save(s.teacher('t1'), 'c:27', scores({ feedback: 'Del nodo' }));
    assert.deepEqual([s.store.effectiveForCloud(27).total_score, s.store.effectiveForCloud(27).feedback], [50, 'Del nodo']);
    // Una evaluación guardada para el proyecto local que luego se publicó como 27 también aplica.
    s.addLocal({ status: 'synced', cloud_project_id: '27' });
    s.clock.t += 1000;
    s.store.save(s.teacher('t1'), `l:${REF}`, scores({ creativity_score: 20, feedback: 'Por el local' }));
    assert.equal(s.store.effectiveForCloud(27).feedback, 'Por el local', 'gana la más reciente');
  } finally { s.done(); }
});
