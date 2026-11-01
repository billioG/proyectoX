// El nodo sube sus proyectos pendientes a la nube (school-node/projects-sync.js), contra una nube simulada.
// Usa SQLite de verdad; se omite si better-sqlite3 no está compilado para esta versión de Node.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sqliteAvailable } from './helpers/start-node.mjs';
import { startFakeCloud, FAKE_TOKEN } from './helpers/fake-cloud.mjs';

const skip = !sqliteAvailable() && 'better-sqlite3 no está instalado para este Node';
const DESC = 'Un robot que sigue una línea negra con dos sensores.'.padEnd(40, '.');
const META = { ip: '192.168.3.20', userAgent: 'Mozilla/5.0' };
const clouds = [];
after(() => Promise.all(clouds.map(c => c.stop())));

async function setup(cloudOpts = {}, config = {}) {
  const { openDb } = await import('../school-node/db.js');
  const { createProjectStore } = await import('../school-node/projects.js');
  const { syncProjects } = await import('../school-node/projects-sync.js');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-psync-'));
  const db = openDb(dataDir);
  const cloud = await startFakeCloud(cloudOpts);
  clouds.push(cloud);
  const store = createProjectStore(db, { dataDir, freeDiskMB: () => 50_000 });
  const cfg = { cloudUrl: cloud.url, nodeToken: FAKE_TOKEN, dataDir, ...config };
  const add = (studentId, title, { bytes = 2000, ext = 'mp4' } = {}) => {
    const { id } = store.createDraft(studentId, { title, description: DESC, bimestre: 1, filename: `video.${ext}`, size: bytes }, META);
    fs.writeFileSync(store.tmpPath(id), Buffer.alloc(bytes, 9));
    store.finishUpload(id, bytes);
    return id;
  };
  const row = (id) => ({ ...db.prepare('SELECT * FROM projects WHERE id = ?').get(id) });
  return { db, store, cloud, cfg, add, row, sync: () => syncProjects(db, cfg, { log: () => {} }), dataDir, done: async () => { db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

test('camino feliz: el proyecto llega a la nube y queda synced', { skip, timeout: 30000 }, async () => {
  const s = await setup();
  try {
    const id = s.add('s1', 'Robot seguidor', { bytes: 5000 });
    assert.deepEqual(await s.sync(), { synced: 1, failed: 0 });
    const r = s.row(id);
    assert.equal(r.status, 'synced');
    assert.equal(r.cloud_project_id, 'cloud-1');
    assert.equal(r.last_error, null);
    assert.equal(s.cloud.stats.uploads, 1);
    assert.equal(s.cloud.projects.length, 1);
    assert.equal(s.cloud.projects[0].client_metadata.node_ref, id);
    assert.equal(s.cloud.projects[0].title, 'Robot seguidor');
    const stored = s.cloud.storage.get(r.cloud_path);
    assert.equal(stored.bytes.length, 5000, 'el archivo llegó completo');
    assert.equal(stored.contentType, 'video/mp4');
    assert.deepEqual(await s.sync(), { synced: 0, failed: 0 }, 'sin pendientes no hace nada');
  } finally { await s.done(); }
});

test('si el archivo ya subió pero la confirmación falla, el reintento NO lo sube de nuevo ni duplica', { skip, timeout: 30000 }, async () => {
  const s = await setup({ failConfirm: true });
  try {
    const id = s.add('s1', 'Robot seguidor');
    assert.deepEqual(await s.sync(), { synced: 0, failed: 1 });
    let r = s.row(id);
    assert.equal(r.status, 'pending');
    assert.ok(r.cloud_path, 'guardó la ruta de Storage para reutilizarla');
    assert.equal(r.attempts, 1);
    assert.match(r.last_error, /base de datos no respondió/);
    assert.equal(s.cloud.stats.uploads, 1);

    s.cloud.opts.failConfirm = false;
    assert.deepEqual(await s.sync(), { synced: 1, failed: 0 });
    r = s.row(id);
    assert.equal(r.status, 'synced');
    assert.equal(r.last_error, null);
    assert.equal(s.cloud.stats.uploads, 1, 'no volvió a subir el archivo');
    assert.equal(s.cloud.stats.urlRequests, 1, 'no volvió a pedir permiso de subida');
    assert.equal(s.cloud.projects.length, 1, 'no se duplicó el proyecto');
  } finally { await s.done(); }
});

test('Storage caído: queda pending con el motivo, sin ruta y con un intento más', { skip, timeout: 30000 }, async () => {
  const s = await setup({ failStorage: true });
  try {
    const id = s.add('s1', 'Robot seguidor');
    assert.deepEqual(await s.sync(), { synced: 0, failed: 1 });
    const r = s.row(id);
    assert.equal(r.status, 'pending');
    assert.equal(r.cloud_path, null);
    assert.equal(r.attempts, 1);
    assert.match(r.last_error, /No se pudo subir el archivo a la nube \(500\)/);
    await s.sync();
    assert.equal(s.row(id).attempts, 2);
    s.cloud.opts.failStorage = false;
    assert.deepEqual(await s.sync(), { synced: 1, failed: 0 }, 'cuando Storage vuelve, se sube solo');
  } finally { await s.done(); }
});

test('un proyecto que falla no impide que los demás se suban', { skip, timeout: 30000 }, async () => {
  const s = await setup();
  try {
    const broken = s.add('s1', 'Archivo borrado');
    const fine = s.add('s2', 'Este sí sube');
    fs.rmSync(s.store.finalPath(broken)); // alguien borró el archivo del disco
    assert.deepEqual(await s.sync(), { synced: 1, failed: 1 });
    assert.match(s.row(broken).last_error, /archivo ya no está/);
    assert.equal(s.row(fine).status, 'synced');
  } finally { await s.done(); }
});

test('función de la nube vieja (sin applied.projects): explica que hay que actualizarla', { skip, timeout: 30000 }, async () => {
  const s = await setup({ oldFunction: true });
  try {
    const id = s.add('s1', 'Robot seguidor');
    assert.deepEqual(await s.sync(), { synced: 0, failed: 1 });
    assert.equal(s.row(id).last_error, 'La nube todavía no acepta proyectos: pide al administrador actualizar la función node-sync.');
    assert.equal(s.row(id).status, 'pending');
  } finally { await s.done(); }
});

test('la nube rechaza un proyecto: se muestra su motivo', { skip, timeout: 30000 }, async () => {
  const s = await setup({ rejectProject: 'El estudiante no es miembro de ese equipo.' });
  try {
    const id = s.add('s1', 'Robot seguidor');
    assert.deepEqual(await s.sync(), { synced: 0, failed: 1 });
    assert.equal(s.row(id).last_error, 'El estudiante no es miembro de ese equipo.');
  } finally { await s.done(); }
});

test('sin internet y con token equivocado, el mensaje es claro', { skip, timeout: 30000 }, async () => {
  const offline = await setup({}, { cloudUrl: 'http://127.0.0.1:1' });
  try {
    const id = offline.add('s1', 'Robot seguidor');
    assert.deepEqual(await offline.sync(), { synced: 0, failed: 1 });
    assert.match(offline.row(id).last_error, /No hay internet en esta computadora/);
  } finally { await offline.done(); }
  const wrong = await setup({}, { nodeToken: 'b'.repeat(64) });
  try {
    const id = wrong.add('s1', 'Robot seguidor');
    await wrong.sync();
    assert.match(wrong.row(id).last_error, /no reconoció el token/);
  } finally { await wrong.done(); }
});

test('runSync sube los proyectos pendientes después del pull', { skip, timeout: 30000 }, async () => {
  const s = await setup();
  try {
    const { runSync } = await import('../school-node/sync.js');
    const id = s.add('s1', 'Robot seguidor');
    await runSync(s.db, s.cfg, () => {});
    assert.equal(s.row(id).status, 'synced');
    assert.equal(s.cloud.projects.length, 1);
  } finally { await s.done(); }
});

test('a los 8 días de subido, el archivo local se borra y el proyecto sigue en Mis proyectos', { skip, timeout: 30000 }, async () => {
  const s = await setup();
  try {
    const id = s.add('s1', 'Robot seguidor');
    await s.sync();
    assert.ok(fs.existsSync(s.store.finalPath(id)));
    s.db.prepare('UPDATE projects SET synced_at = ? WHERE id = ?').run(new Date(Date.now() - 8 * 86400_000).toISOString(), id);
    assert.equal(s.store.cleanup().removed, 1);
    assert.equal(fs.existsSync(s.store.finalPath(id)), false);
    assert.equal(s.store.listMine('s1')[0].status, 'synced');
  } finally { await s.done(); }
});
