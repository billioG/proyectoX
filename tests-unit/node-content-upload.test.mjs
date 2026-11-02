// Subir archivos de cursos al nodo con el mismo pedido que hace supabase-js, con el servidor de verdad.
// Solo docentes; el archivo queda disponible en la misma dirección pública que tendría en la nube. Corre con Node 20.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sqliteAvailable, startNode, stopAllNodes } from './helpers/start-node.mjs';
import { hashClassPassword, emailHash } from '../school-node/rest/auth.js';

after(stopAllNodes);
const skip = !sqliteAvailable() && 'better-sqlite3 no disponible';
const salt = 'ab'.repeat(8);
const L1 = '3f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const L2 = '4a2b8c1e-5d4a-4e7b-9a10-123456789abc';
const rest = {
  class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
  teacher_logins: [
    { teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt },
    { teacher_id: 't2', email_hash: emailHash('raul@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt },
    { teacher_id: 't3', email_hash: emailHash('admin@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt },
  ],
  tables: {
    students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' }],
    teachers: [{ id: 't1', full_name: 'Marta', role: 'docente' }, { id: 't2', full_name: 'Raúl', role: 'docente' }, { id: 't3', full_name: 'Admin', role: 'admin' }],
    teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
  },
};

async function sessions(node) {
  const teacher = async (email) => (await node.api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: '654321' } })).data.access_token;
  const l = await node.api('/functions/v1/student-login', { method: 'POST', body: { username: 'ana1', password: 'clase123' } });
  const student = (await node.api('/auth/v1/verify', { method: 'POST', body: { type: 'magiclink', token_hash: l.data.token_hash } })).data.access_token;
  return { marta: await teacher('marta@escuela.com'), raul: await teacher('raul@escuela.com'), admin: await teacher('admin@escuela.com'), student };
}

// Igual que supabase-js: FormData con cacheControl y el archivo, POST /storage/v1/object/<bucket>/<ruta>.
const upload = (node, token, rel, bytes, { method = 'POST', upsert = false, name = 'blob', raw = false } = {}) => fetch(`${node.base}/storage/v1/object/course-content/${rel}`, {
  method,
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(upsert ? { 'x-upsert': 'true' } : {}), ...(raw ? { 'Content-Type': 'application/pdf' } : {}) },
  body: raw ? bytes : (() => { const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', new File([bytes], name)); return fd; })(),
});
const pub = (node, rel) => fetch(`${node.base}/storage/v1/object/public/course-content/${rel}`);

test('el docente sube un archivo como lo hace la app y se sirve en la dirección pública de la nube', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest });
  const { marta } = await sessions(node);
  const bytes = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200_000, 9)]);
  const r = await upload(node, marta, `lessons/${L1}/guia.pdf`, bytes);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).Key, `course-content/lessons/${L1}/guia.pdf`);
  const got = await pub(node, `lessons/${L1}/guia.pdf`);
  assert.equal(got.status, 200);
  assert.equal(Buffer.from(await got.arrayBuffer()).equals(bytes), true);
  assert.equal(fs.readdirSync(path.join(node.dataDir, 'content', 'lessons', L1)).filter((f) => f.endsWith('.part')).length, 0, 'no queda basura');
  const raw = await upload(node, marta, `lessons/${L1}/crudo.pdf`, bytes, { raw: true, method: 'PUT' });
  assert.equal(raw.status, 200, 'también acepta el cuerpo sin multipart');
});

test('sin sesión, estudiante o ruta mala: no se sube nada', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest });
  const s = await sessions(node);
  const b = Buffer.from('hola');
  assert.equal((await upload(node, null, `lessons/${L1}/a.pdf`, b)).status, 401);
  assert.equal((await upload(node, 'inventado', `lessons/${L1}/a.pdf`, b)).status, 403);
  assert.equal((await upload(node, s.student, `lessons/${L1}/a.pdf`, b)).status, 403);
  for (const bad of [`lessons/${L1}/../../x.pdf`, `lessons/${L1}/x.exe`, 'lessons/otra/x.pdf', `proyectos/${L1}/x.pdf`, `lessons/${L1}/%2e%2e/x.pdf`]) {
    assert.equal((await upload(node, s.marta, bad, b)).status, 400, bad);
  }
  assert.equal(fs.existsSync(path.join(node.dataDir, 'content', 'lessons')), false, 'nada quedó en el disco');
});

test('un archivo que ya existe pide upsert y solo su dueño (o un administrador) lo reemplaza; un archivo bajado de la nube no se pisa', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest, contentFiles: { [`lessons/${L2}/de-la-nube.pdf`]: 'original' } });
  const s = await sessions(node);
  const rel = `lessons/${L1}/a.pdf`;
  assert.equal((await upload(node, s.marta, rel, Buffer.from('uno'))).status, 200);
  assert.equal((await upload(node, s.marta, rel, Buffer.from('dos'))).status, 409);
  assert.equal((await upload(node, s.marta, rel, Buffer.from('dos'), { upsert: true })).status, 200);
  assert.equal(await (await pub(node, rel)).text(), 'dos');
  assert.equal((await upload(node, s.raul, rel, Buffer.from('robo'), { upsert: true })).status, 403, 'otro docente no pisa lo ajeno');
  assert.equal((await upload(node, s.admin, rel, Buffer.from('admin'), { upsert: true })).status, 200);
  assert.equal((await upload(node, s.marta, `lessons/${L2}/de-la-nube.pdf`, Buffer.from('x'), { upsert: true })).status, 403, 'lo que bajó de la nube no se reemplaza');
  assert.equal(await (await pub(node, `lessons/${L2}/de-la-nube.pdf`)).text(), 'original');
});

test('listar una carpeta y borrar: solo lo propio', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest });
  const s = await sessions(node);
  await upload(node, s.marta, `lessons/${L1}/a.pdf`, Buffer.from('1234'));
  await upload(node, s.marta, `lessons/${L1}/web/index.html`, Buffer.from('<p>hola</p>'));
  const post = (p, token, body, method = 'POST') => fetch(node.base + p, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const listed = await (await post('/storage/v1/object/list/course-content', s.marta, { prefix: `lessons/${L1}`, limit: 100 })).json();
  assert.deepEqual(listed.map((e) => e.name).sort(), ['a.pdf', 'web']);
  assert.equal(listed.find((e) => e.name === 'a.pdf').metadata.size, 4);
  assert.equal((await post('/storage/v1/object/list/course-content', s.marta, { prefix: '../' })).status, 400);
  assert.equal((await post('/storage/v1/object/list/course-content', s.student, { prefix: `lessons/${L1}` })).status, 403);

  const rel = `lessons/${L1}/a.pdf`;
  const stolen = await (await post('/storage/v1/object/course-content', s.raul, { prefixes: [rel] }, 'DELETE')).json();
  assert.deepEqual(stolen, [], 'otro docente no borra lo ajeno');
  assert.equal((await pub(node, rel)).status, 200);
  const mine = await (await post('/storage/v1/object/course-content', s.marta, { prefixes: [rel, `lessons/${L1}/../../x.pdf`] }, 'DELETE')).json();
  assert.deepEqual(mine.map((x) => x.name), [rel]);
  assert.equal((await pub(node, rel)).status, 404);
});

test('un archivo más grande de lo anunciado o cortado a medias se rechaza y no deja rastro', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest });
  const { marta } = await sessions(node);
  const r = await fetch(`${node.base}/storage/v1/object/course-content/lessons/${L1}/vacio.pdf`, { method: 'POST', headers: { Authorization: `Bearer ${marta}`, 'Content-Type': 'application/pdf' }, body: new Uint8Array(0) });
  assert.equal(r.status, 400);
  assert.equal((await pub(node, `lessons/${L1}/vacio.pdf`)).status, 404);
  const dir = path.join(node.dataDir, 'content', 'lessons', L1);
  assert.equal(fs.existsSync(dir) ? fs.readdirSync(dir).length : 0, 0);
});
