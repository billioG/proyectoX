// Almacén de proyectos del nodo (school-node/projects.js) y equipos que baja el pull.
// Usa SQLite de verdad; se omite si better-sqlite3 no está compilado para esta versión de Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const NODE_DIR = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'school-node');
let sqliteOk = true;
try { const D = createRequire(path.join(NODE_DIR, 'x.js'))('better-sqlite3'); new D(':memory:').close(); } catch { sqliteOk = false; }
const skip = !sqliteOk && 'better-sqlite3 no está instalado para este Node';

const MAX = 150 * 1024 * 1024;
const DESC = 'Un robot que sigue una línea negra con dos sensores.'.padEnd(40, '.');
const input = (patch = {}) => ({ title: 'Robot seguidor', description: DESC, bimestre: 1, filename: 'robot.mp4', size: 3_000_000, ...patch });
const META = { ip: '192.168.3.20', userAgent: 'Mozilla/5.0 (Android)' };

async function setup(opts = {}) {
  const { openDb } = await import('../school-node/db.js');
  const { createProjectStore, ProjectError } = await import('../school-node/projects.js');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-store-'));
  const db = openDb(dataDir);
  db.prepare("INSERT INTO groups (id, name, grade, section) VALUES (7, 'Equipo Sol', 'Primero', 'A'), (9, 'Equipo Luna', 'Primero', 'A')").run();
  db.prepare("INSERT INTO group_members (id, group_id, student_id, role) VALUES (1, 7, 's1', 'planner'), (2, 9, 's2', 'planner')").run();
  const clock = { t: Date.parse('2026-10-31T12:00:00Z') };
  const store = createProjectStore(db, { dataDir, freeDiskMB: () => 50_000, now: () => clock.t, ...opts });
  return { db, store, ProjectError, dataDir, clock, done: () => { db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}
const rejects = async (fn, status, re) => {
  try { await fn(); } catch (e) { assert.equal(e.name, 'ProjectError'); assert.equal(e.status, status); if (re) assert.match(e.message, re); return; }
  assert.fail('debía lanzar ProjectError');
};
const receive = (s, id, bytes = 1000) => { fs.writeFileSync(s.store.tmpPath(id), Buffer.alloc(bytes, 1)); s.store.finishUpload(id, bytes); };

test('createDraft: deja el borrador uploading con los datos validados', { skip }, async () => {
  const s = await setup();
  try {
    const d = s.store.createDraft('s1', input({ group_id: 7 }), META);
    assert.equal(d.max_bytes, MAX);
    const row = s.db.prepare('SELECT * FROM projects WHERE id = ?').get(d.id);
    assert.equal(row.status, 'uploading');
    assert.equal(row.student_id, 's1');
    assert.equal(row.group_id, 7);
    assert.equal(row.kind, 'video');
    assert.equal(row.file_size, 3_000_000, 'guarda el tamaño anunciado para validar la subida');
    assert.equal(row.upload_ip, '192.168.3.20');
    assert.equal(row.user_agent, 'Mozilla/5.0 (Android)');
    assert.equal(row.created_at, '2026-10-31T12:00:00.000Z');
  } finally { s.done(); }
});

test('createDraft: errores de validación y equipo ajeno son 400', { skip }, async () => {
  const s = await setup();
  try {
    await rejects(() => s.store.createDraft('s1', input({ title: 'ab' }), META), 400, /título/);
    await rejects(() => s.store.createDraft('s1', input({ group_id: 9 }), META), 400, /Ese equipo no es tuyo/);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM projects').get().n, 0);
  } finally { s.done(); }
});

test('cupo: el 6.º pendiente es 409 y se libera al cancelar un borrador', { skip }, async () => {
  const s = await setup();
  try {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(s.store.createDraft('s1', input({ title: `Proyecto ${i}` }), META).id);
    await rejects(() => s.store.createDraft('s1', input({ title: 'Proyecto 6' }), META), 409, /5 proyectos/);
    s.store.createDraft('s2', input(), META); // el cupo es por estudiante
    s.store.abortUpload(ids[0]);
    s.store.createDraft('s1', input({ title: 'Proyecto nuevo' }), META);
  } finally { s.done(); }
});

test('disco: se rechaza si quedarían menos de 2048 MB libres', { skip }, async () => {
  const s = await setup({ freeDiskMB: () => 2049 });
  try {
    await rejects(() => s.store.createDraft('s1', input({ size: 3 * 1024 * 1024 }), META), 507, /espacio/);
  } finally { s.done(); }
  const ok = await setup({ freeDiskMB: () => 3000 });
  try { ok.store.createDraft('s1', input({ size: 3 * 1024 * 1024 }), META); } finally { ok.done(); }
});

test('rutas: el nombre original nunca forma parte de la ruta', { skip }, async () => {
  const s = await setup();
  try {
    const { id } = s.store.createDraft('s1', input({ filename: '../../x.mp4' }), META);
    const dir = path.join(s.dataDir, 'projects');
    assert.equal(s.store.finalPath(id), path.join(dir, `${id}.mp4`));
    assert.equal(s.store.tmpPath(id), path.join(dir, `${id}.part`));
    assert.ok(s.store.finalPath(id).startsWith(dir + path.sep));
  } finally { s.done(); }
});

test('finishUpload mueve el archivo y pasa a pending; abortUpload lo borra todo', { skip }, async () => {
  const s = await setup();
  try {
    const a = s.store.createDraft('s1', input(), META);
    receive(s, a.id, 2500);
    assert.equal(fs.existsSync(s.store.tmpPath(a.id)), false);
    assert.equal(fs.statSync(s.store.finalPath(a.id)).size, 2500);
    const row = s.db.prepare('SELECT status, file_size FROM projects WHERE id = ?').get(a.id);
    assert.deepEqual({ ...row }, { status: 'pending', file_size: 2500 });

    const b = s.store.createDraft('s1', input({ title: 'Otro proyecto' }), META);
    fs.writeFileSync(s.store.tmpPath(b.id), 'a medias');
    s.store.abortUpload(b.id);
    assert.equal(fs.existsSync(s.store.tmpPath(b.id)), false);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM projects WHERE id = ?').get(b.id).n, 0);
  } finally { s.done(); }
});

test('getDraft: solo el dueño y solo mientras está subiendo', { skip }, async () => {
  const s = await setup();
  try {
    const d = s.store.createDraft('s1', input(), META);
    assert.equal(s.store.getDraft(d.id, 's1').id, d.id);
    assert.equal(s.store.getDraft(d.id, 's2'), null);
    receive(s, d.id);
    assert.equal(s.store.getDraft(d.id, 's1'), null);
  } finally { s.done(); }
});

test('listMine y cancel: cada estudiante ve y cancela solo lo suyo', { skip }, async () => {
  const s = await setup();
  try {
    const mine = s.store.createDraft('s1', input(), META); receive(s, mine.id);
    s.clock.t += 1000;
    const newer = s.store.createDraft('s1', input({ title: 'Más nuevo' }), META); receive(s, newer.id);
    const theirs = s.store.createDraft('s2', input(), META); receive(s, theirs.id);

    const list = s.store.listMine('s1');
    assert.deepEqual(list.map(p => p.title), ['Más nuevo', 'Robot seguidor']);
    assert.deepEqual(Object.keys(list[0]).sort(), ['created_at', 'file_size', 'id', 'kind', 'last_error', 'status', 'title']);

    assert.equal(s.store.cancel(theirs.id, 's1'), false);
    assert.ok(fs.existsSync(s.store.finalPath(theirs.id)), 'el archivo ajeno sigue ahí');
    assert.equal(s.store.cancel('no-existe', 's1'), false);
    assert.equal(s.store.cancel(mine.id, 's1'), true);
    assert.equal(fs.existsSync(s.store.finalPath(mine.id)), false);
    assert.deepEqual(s.store.listMine('s1').map(p => p.title), ['Más nuevo']);

    s.db.prepare("UPDATE projects SET status = 'synced' WHERE id = ?").run(newer.id);
    assert.equal(s.store.cancel(newer.id, 's1'), false, 'uno ya subido a la nube no se cancela');
  } finally { s.done(); }
});

test('groupsFor: solo los equipos del estudiante', { skip }, async () => {
  const s = await setup();
  try {
    assert.deepEqual(s.store.groupsFor('s1'), [{ id: 7, name: 'Equipo Sol' }]);
    assert.deepEqual(s.store.groupsFor('nadie'), []);
  } finally { s.done(); }
});

test('cleanup: borra borradores de más de 1 hora y archivos subidos de más de 7 días', { skip }, async () => {
  const s = await setup();
  try {
    const stuck = s.store.createDraft('s1', input({ title: 'Borrador trabado' }), META);
    fs.writeFileSync(s.store.tmpPath(stuck.id), 'x');
    const waiting = s.store.createDraft('s1', input({ title: 'Esperando internet' }), META); receive(s, waiting.id);
    const sent = s.store.createDraft('s2', input({ title: 'Ya subido' }), META); receive(s, sent.id);
    s.db.prepare("UPDATE projects SET status = 'synced', synced_at = ? WHERE id = ?").run(new Date(s.clock.t).toISOString(), sent.id);

    s.clock.t += 2 * 3600_000; // 2 horas
    assert.equal(s.store.cleanup().removed, 1);
    assert.equal(fs.existsSync(s.store.tmpPath(stuck.id)), false);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM projects WHERE id = ?').get(stuck.id).n, 0);
    assert.ok(fs.existsSync(s.store.finalPath(waiting.id)), 'el pendiente no se toca');
    assert.ok(fs.existsSync(s.store.finalPath(sent.id)), 'el subido hace 2 h todavía se conserva');

    s.clock.t += 8 * 86400_000; // 8 días
    assert.equal(s.store.cleanup().removed, 1);
    assert.equal(fs.existsSync(s.store.finalPath(sent.id)), false, 'se libera el disco del ya subido');
    assert.equal(s.db.prepare("SELECT status FROM projects WHERE id = ?").get(sent.id).status, 'synced', 'sigue en Mis proyectos');
    assert.ok(fs.existsSync(s.store.finalPath(waiting.id)), 'el pendiente nunca se borra solo');
  } finally { s.done(); }
});

test('counts: pendientes, subidos, con error y bytes', { skip }, async () => {
  const s = await setup();
  try {
    assert.deepEqual(s.store.counts(), { pending: 0, synced: 0, failed: 0, bytes: 0 });
    const a = s.store.createDraft('s1', input({ title: 'Primero A' }), META); receive(s, a.id, 1000);
    const b = s.store.createDraft('s1', input({ title: 'Segundo B' }), META); receive(s, b.id, 500);
    const c = s.store.createDraft('s2', input({ title: 'Tercero C' }), META); receive(s, c.id, 200);
    s.db.prepare("UPDATE projects SET last_error = 'sin internet' WHERE id = ?").run(b.id);
    s.db.prepare("UPDATE projects SET status = 'synced' WHERE id = ?").run(c.id);
    assert.deepEqual(s.store.counts(), { pending: 2, synced: 1, failed: 1, bytes: 1500 });
  } finally { s.done(); }
});

test('applyPull: reemplaza equipos y miembros solo si el pull los trae', { skip }, async () => {
  const s = await setup();
  try {
    const { applyPull } = await import('../school-node/sync.js');
    const base = { students: [], courses: [], completions: [], files: [], node: { name: 'N', school_code: 'ESC1' } };
    applyPull(s.db, { ...base, groups: [{ id: 11, name: 'Equipo Nuevo', grade: 'Segundo', section: 'B' }], group_members: [{ id: 5, group_id: 11, student_id: 's9', role: 'maker' }] });
    assert.deepEqual(s.db.prepare('SELECT id, name FROM groups').all().map(g => ({ ...g })), [{ id: 11, name: 'Equipo Nuevo' }]);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM group_members').get().n, 1);

    applyPull(s.db, base); // pull de una función vieja: sin equipos, no se borran
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM groups').get().n, 1);

    applyPull(s.db, { ...base, groups: [], group_members: [] }); // disolvieron todos los equipos
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM groups').get().n, 0);
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM group_members').get().n, 0);
  } finally { s.done(); }
});

test('sincronización: listPending, setCloudPath, markFailed y markSynced', { skip }, async () => {
  const s = await setup();
  try {
    const a = s.store.createDraft('s1', input({ title: 'Primero A' }), META); receive(s, a.id);
    s.clock.t += 1000;
    const b = s.store.createDraft('s2', input({ title: 'Segundo B' }), META); receive(s, b.id);
    const draft = s.store.createDraft('s1', input({ title: 'Todavía subiendo' }), META); // uploading: no se sincroniza
    assert.deepEqual(s.store.listPending().map(p => p.title), ['Primero A', 'Segundo B'], 'solo pendientes, del más viejo al más nuevo');

    s.store.setCloudPath(a.id, '1730000000000_ab12cd34ef.mp4');
    s.store.markFailed(a.id, 'No hay internet');
    s.store.markFailed(a.id, 'No hay internet otra vez');
    const row = s.db.prepare('SELECT cloud_path, last_error, attempts, status FROM projects WHERE id = ?').get(a.id);
    assert.deepEqual({ ...row }, { cloud_path: '1730000000000_ab12cd34ef.mp4', last_error: 'No hay internet otra vez', attempts: 2, status: 'pending' });
    assert.equal(s.store.counts().failed, 1);

    s.store.markSynced(a.id, 'cloud-123');
    const done = s.db.prepare('SELECT status, cloud_project_id, last_error, synced_at FROM projects WHERE id = ?').get(a.id);
    assert.deepEqual({ ...done }, { status: 'synced', cloud_project_id: 'cloud-123', last_error: null, synced_at: '2026-10-31T12:00:01.000Z' }); // el reloj simulado avanzó 1 s
    assert.deepEqual(s.store.listPending().map(p => p.title), ['Segundo B']);
    assert.equal(draft.id.length > 0, true);
  } finally { s.done(); }
});

test('disco: los borradores que aún suben también cuentan como espacio ocupado', { skip }, async () => {
  // 2300 MB libres: un video de 150 MB cabe (2150 > 2048), pero un segundo mientras el primero sube ya no.
  const s = await setup({ freeDiskMB: () => 2300 });
  try {
    s.store.createDraft('s1', input({ size: 150 * 1024 * 1024 }), META);
    await rejects(() => s.store.createDraft('s2', input({ size: 150 * 1024 * 1024 }), META), 507, /espacio/);
  } finally { s.done(); }
});

test('cancel: un proyecto que ya está en Storage no se puede quitar (409)', { skip }, async () => {
  const s = await setup();
  try {
    const { id } = s.store.createDraft('s1', input(), META);
    receive(s, id);
    s.store.setCloudPath(id, '1700000000_ab12cd34ef.mp4');
    await rejects(() => s.store.cancel(id, 's1'), 409, /publicando|docente/);
    assert.equal(s.store.listMine('s1').length, 1, 'el proyecto sigue ahí');
    assert.ok(fs.existsSync(s.store.finalPath(id)), 'y su archivo también');
  } finally { s.done(); }
});
