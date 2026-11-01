// API de proyectos del nodo, de extremo a extremo: arranca school-node/server.js de verdad.
// Se omite si better-sqlite3 no está compilado para esta versión de Node.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { startNode, sqliteAvailable, openSqlite, stopAllNodes, waitFor } from './helpers/start-node.mjs';

after(() => stopAllNodes());

const skip = !sqliteAvailable() && 'better-sqlite3 no está instalado para este Node';
const DESC = 'Un robot que sigue una línea negra con dos sensores.'.padEnd(40, '.');
const draft = (patch = {}) => ({ title: 'Robot seguidor', description: DESC, bimestre: 1, filename: 'robot.mp4', size: 3_000_000, ...patch });
const STUDENTS = [{ id: 's1', full_name: 'Ana' }, { id: 's2', full_name: 'Beto' }];
const GROUPS = [{ id: 7, name: 'Equipo Sol' }, { id: 9, name: 'Equipo Luna' }];
const MEMBERS = [{ id: 1, group_id: 7, student_id: 's1' }, { id: 2, group_id: 9, student_id: 's2' }];

async function boot(config = {}) {
  const node = await startNode({ students: STUDENTS, groups: GROUPS, members: MEMBERS, config });
  const t1 = await node.login('s1');
  const t2 = await node.login('s2');
  return { node, t1, t2 };
}

// PUT con control total de las cabeceras (fetch no deja mandar un Content-Length distinto del cuerpo).
function rawPut(node, id, token, { contentLength, chunks }) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: node.port, path: `/api/projects/${id}/file`, method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Length': String(contentLength), 'Content-Type': 'application/octet-stream' } }, (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', (e) => resolve({ error: e.code || e.message }));
    for (const c of chunks) req.write(c);
    req.end();
  });
}
const upload = (node, id, token, buf) => rawPut(node, id, token, { contentLength: buf.length, chunks: [buf] });
const projectsDir = (node) => path.join(node.dataDir, 'projects');
const files = (node) => (fs.existsSync(projectsDir(node)) ? fs.readdirSync(projectsDir(node)) : []);

test('sin sesión de estudiante, ninguna ruta responde', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ students: STUDENTS });
  try {
    const id = '00000000-0000-4000-8000-000000000000';
    assert.equal((await node.api('/api/projects/groups')).status, 401);
    assert.equal((await node.api('/api/projects', { method: 'POST', body: draft() })).status, 401);
    assert.equal((await node.api('/api/projects/mine')).status, 401);
    assert.equal((await node.api(`/api/projects/${id}`, { method: 'DELETE' })).status, 401);
    assert.equal((await rawPut(node, id, 'token-falso', { contentLength: 3, chunks: [Buffer.from('abc')] })).status, 401);
  } finally { await node.stop(); }
});

test('flujo feliz: borrador, archivo y Mis proyectos', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    const buf = Buffer.alloc(3_000_000, 7);
    const created = await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ group_id: 7 }) });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.max_bytes, 150 * 1024 * 1024);
    const { id } = created.data;

    assert.equal((await node.api('/api/projects/mine', { token: t1 })).data.projects[0].status, 'uploading');
    const put = await upload(node, id, t1, buf);
    assert.equal(put.status, 200, put.body);

    const mine = (await node.api('/api/projects/mine', { token: t1 })).data.projects;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].status, 'pending');
    assert.equal(mine[0].file_size, 3_000_000);
    assert.equal(fs.statSync(path.join(projectsDir(node), `${id}.mp4`)).size, 3_000_000);
    assert.deepEqual(files(node), [`${id}.mp4`]);

    const teacher = await node.teacherLogin();
    assert.equal((await node.api('/api/teacher/overview', { token: teacher })).data.projects.pending, 1);
  } finally { await node.stop(); }
});

test('el archivo que se pasa de lo anunciado se corta: sin .part, sin borrador, cupo intacto', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot({ projectMaxBytes: 1_000_000 });
  try {
    const { id } = (await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ size: 500_000 }) })).data;
    // Anuncia 500 KB pero manda 3 MB.
    const cut = await rawPut(node, id, t1, { contentLength: 500_000, chunks: [Buffer.alloc(1_000_000), Buffer.alloc(1_000_000), Buffer.alloc(1_000_000)] });
    assert.ok(cut.error || cut.status === 413, `debía cortarse: ${JSON.stringify(cut)}`);
    await waitFor(async () => files(node).length === 0 && (await node.api('/api/projects/mine', { token: t1 })).data.projects.length === 0);
    assert.deepEqual(files(node), [], 'no queda ningún archivo');
    assert.deepEqual((await node.api('/api/projects/mine', { token: t1 })).data.projects, [], 'no queda borrador');
    for (let i = 0; i < 5; i++) {
      const ok = await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ title: `Proyecto ${i}`, size: 1000 }) });
      assert.equal(ok.status, 200, `el cupo debía seguir libre (${i})`);
    }
  } finally { await node.stop(); }
});

test('Content-Length distinto de lo anunciado es 400 y libera el borrador', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    const { id } = (await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ size: 500_000 }) })).data;
    const r = await rawPut(node, id, t1, { contentLength: 600_000, chunks: [Buffer.alloc(1000)] });
    assert.ok(r.status === 400 || r.error, JSON.stringify(r));
    await waitFor(async () => files(node).length === 0 && (await node.api('/api/projects/mine', { token: t1 })).data.projects.length === 0);
    assert.deepEqual((await node.api('/api/projects/mine', { token: t1 })).data.projects, []);
    assert.deepEqual(files(node), []);
  } finally { await node.stop(); }
});

test('conexión cortada a mitad: no queda .part ni borrador', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    const { id } = (await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ size: 500_000 }) })).data;
    await new Promise((resolve) => {
      const req = http.request({ host: '127.0.0.1', port: node.port, path: `/api/projects/${id}/file`, method: 'PUT',
        headers: { Authorization: `Bearer ${t1}`, 'Content-Length': '500000' } });
      req.on('error', () => resolve());
      req.write(Buffer.alloc(100_000));
      setTimeout(() => { req.destroy(); resolve(); }, 300);
    });
    await waitFor(async () => files(node).length === 0 && (await node.api('/api/projects/mine', { token: t1 })).data.projects.length === 0);
    assert.deepEqual(files(node), []);
    assert.deepEqual((await node.api('/api/projects/mine', { token: t1 })).data.projects, []);
  } finally { await node.stop(); }
});

test('tras un reinicio se limpian borradores y .part huérfanos', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    const { id } = (await node.api('/api/projects', { method: 'POST', token: t1, body: draft() })).data;
    const keep = (await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ title: 'Este sí queda', size: 1000 }) })).data.id;
    assert.equal((await upload(node, keep, t1, Buffer.alloc(1000))).status, 200);
    await node.stopServer();
    fs.writeFileSync(path.join(projectsDir(node), `${id}.part`), 'a medias');
    const db = openSqlite(path.join(node.dataDir, 'node.db'));
    db.prepare("UPDATE projects SET created_at = ? WHERE id = ?").run(new Date(Date.now() - 2 * 3600_000).toISOString(), id);
    db.close();
    await node.startServer();
    assert.deepEqual(files(node), [`${keep}.mp4`]);
    assert.deepEqual((await node.api('/api/projects/mine', { token: t1 })).data.projects.map(p => p.id), [keep]);
  } finally { await node.stop(); }
});

test('un estudiante no ve ni cancela el proyecto de otro', { skip, timeout: 60000 }, async () => {
  const { node, t1, t2 } = await boot();
  try {
    const { id } = (await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ size: 1000 }) })).data;
    assert.equal((await upload(node, id, t1, Buffer.alloc(1000))).status, 200);

    assert.deepEqual((await node.api('/api/projects/mine', { token: t2 })).data.projects, []);
    assert.equal((await node.api(`/api/projects/${id}`, { method: 'DELETE', token: t2 })).status, 404);
    assert.equal((await upload(node, id, t2, Buffer.alloc(1000))).status, 404, 'tampoco puede escribir en un proyecto ajeno');
    assert.equal((await node.api('/api/projects/mine', { token: t1 })).data.projects[0].status, 'pending');
    assert.ok(fs.existsSync(path.join(projectsDir(node), `${id}.mp4`)));

    assert.equal((await node.api(`/api/projects/${id}`, { method: 'DELETE', token: t1 })).status, 200);
    assert.deepEqual(files(node), []);
    assert.equal((await node.api('/api/projects/no-es-un-uuid', { method: 'DELETE', token: t1 })).status, 404);
  } finally { await node.stop(); }
});

test('el nombre del archivo y el HTML del título no hacen daño', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    const title = '<img src=x onerror=1>';
    const { id } = (await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ title, filename: '../../evil.mp4', size: 1000 }) })).data;
    assert.equal((await upload(node, id, t1, Buffer.alloc(1000))).status, 200);
    assert.deepEqual(files(node), [`${id}.mp4`]);
    assert.equal(fs.existsSync(path.join(node.dir, 'evil.mp4')), false);
    assert.equal(fs.existsSync(path.join(node.dir, '..', 'evil.mp4')), false);
    assert.equal((await node.api('/api/projects/mine', { token: t1 })).data.projects[0].title, title, 'el HTML vuelve idéntico (se escapa al mostrarlo)');
  } finally { await node.stop(); }
});

test('equipos: solo los propios; cupo de 5 pendientes; validaciones', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    assert.deepEqual((await node.api('/api/projects/groups', { token: t1 })).data.groups, [{ id: 7, name: 'Equipo Sol' }]);
    const foreign = await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ group_id: 9 }) });
    assert.equal(foreign.status, 400);
    assert.equal(foreign.data.error, 'Ese equipo no es tuyo.');
    assert.equal((await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ title: 'ab' }) })).status, 400);
    assert.equal((await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ filename: 'virus.exe' }) })).status, 400);

    for (let i = 0; i < 5; i++) assert.equal((await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ title: `Proyecto ${i}`, size: 1000 }) })).status, 200);
    const sixth = await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ title: 'Proyecto 6', size: 1000 }) });
    assert.equal(sixth.status, 409);
    assert.match(sixth.data.error, /5 proyectos/);
  } finally { await node.stop(); }
});

test('poco espacio en disco: 507', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot({ minFreeDiskMB: 1_000_000_000 });
  try {
    const r = await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ size: 1000 }) });
    assert.equal(r.status, 507);
    assert.match(r.data.error, /espacio/);
  } finally { await node.stop(); }
});

// Abre un PUT que queda a medias para poder actuar mientras el archivo "está llegando".
function partialPut(node, id, token, size, firstChunk) {
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const req = http.request({ host: '127.0.0.1', port: node.port, path: `/api/projects/${id}/file`, method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Length': String(size) } }, (res) => {
    let body = '';
    res.on('data', d => { body += d; });
    res.on('end', () => finish({ status: res.statusCode, body }));
  });
  req.on('error', (e) => finish({ error: e.code || e.message }));
  req.write(firstChunk);
  return { req, done };
}

test('quitar el proyecto mientras sube desde otra pestaña no tumba el nodo', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    const { id } = (await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ size: 2_000_000 }) })).data;
    const up = partialPut(node, id, t1, 2_000_000, Buffer.alloc(1_000_000));
    await waitFor(() => files(node).includes(`${id}.part`));
    const del = await node.api(`/api/projects/${id}`, { method: 'DELETE', token: t1 });
    assert.equal(del.status, 200);
    try { up.req.end(Buffer.alloc(1_000_000)); } catch { /* la conexión ya se cortó */ }
    await up.done;
    await new Promise(r => setTimeout(r, 300));
    const mine = await node.api('/api/projects/mine', { token: t1 });
    assert.equal(mine.status, 200, 'el nodo sigue vivo');
    assert.deepEqual(mine.data.projects, []);
    assert.deepEqual(files(node), []);
  } finally { await node.stop(); }
});

test('un segundo PUT al mismo borrador mientras el primero sube es 409 y no daña el archivo', { skip, timeout: 60000 }, async () => {
  const { node, t1 } = await boot();
  try {
    const { id } = (await node.api('/api/projects', { method: 'POST', token: t1, body: draft({ size: 2_000_000 }) })).data;
    const first = partialPut(node, id, t1, 2_000_000, Buffer.alloc(1_000_000, 7));
    await waitFor(() => files(node).includes(`${id}.part`));
    const second = await rawPut(node, id, t1, { contentLength: 2_000_000, chunks: [Buffer.alloc(2_000_000, 1)] });
    assert.equal(second.status, 409, JSON.stringify(second));
    first.req.end(Buffer.alloc(1_000_000, 7));
    assert.equal((await first.done).status, 200);
    const stored = fs.readFileSync(path.join(projectsDir(node), `${id}.mp4`));
    assert.equal(stored.length, 2_000_000);
    assert.ok(stored.every(b => b === 7), 'el archivo es el del primer PUT, sin mezcla');
  } finally { await node.stop(); }
});
