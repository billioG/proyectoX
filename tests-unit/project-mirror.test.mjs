// Videos y modelos 3D de los proyectos de la propia escuela guardados en el nodo (school-node/project-mirror.js): topes, firmas, mapeo de direcciones y servido con rangos.
// Red y disco falsos: corre con Node 20 y sin internet.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { createRestLayer } from '../school-node/rest/index.js';
import { createProjectMirror } from '../school-node/project-mirror.js';

const CLOUD = 'https://proyecto.supabase.co';
const pub = (p) => `${CLOUD}/storage/v1/object/public/project-videos/${p}`;
const sha = (u) => crypto.createHash('sha1').update(u).digest('hex');
const signedOf = (u) => u.replace('/object/public/', '/object/sign/') + '?token=t';

function boot(projects) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-'));
  const db = openDb(dir);
  const layer = createRestLayer(db);
  projects.forEach((p, i) => layer.store.put('projects', { id: 100 + i, user_id: 'u1', title: `P${i}`, description: 'd'.repeat(50), bimestre: 1, score: 0, votes: 0, ...p }));
  const mirror = createProjectMirror({ db, dir: path.join(dir, 'project-mirror') });
  test.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, db, layer, mirror };
}
const video = (bytes = 5000, type = 'video/mp4', declared = true) => () => new Response(Buffer.alloc(bytes, 7), { status: 200, headers: { 'content-type': type, ...(declared ? { 'content-length': String(bytes) } : {}) } });
const signer = { sign: async (urls) => Object.fromEntries(urls.map((u) => [u, signedOf(u)])) };
const row = (layer, id) => layer.store.all('projects').find((p) => p.id === id);

test('baja los videos de los proyectos con la dirección FIRMADA, los más nuevos primero, y la app los recibe con la dirección local', async () => {
  const a = pub('1730000000001_aaaaa'), b = pub('1730000000002_bbbbb'), c = pub('1730000000003_ccccc');
  const { dir, layer, mirror } = boot([
    { video_url: a, created_at: '2026-10-01T10:00:00Z' }, { video_url: b, created_at: '2026-10-03T10:00:00Z' }, { video_url: c, created_at: '2026-10-02T10:00:00Z' },
  ]);
  const fetched = [];
  const r = await mirror.sync(layer.store, { signer, cloudUrl: CLOUD, limits: { maxPerRun: 2 }, freeBytes: () => 1e12, fetchFn: async (u) => { fetched.push(u); return video()(); } });
  assert.deepEqual([r.downloaded, r.failed, r.skipped], [2, 0, 1], 'hizo 2 de 3 por el tope por sincronización');
  assert.deepEqual(fetched, [signedOf(b), signedOf(c)], 'los más nuevos primero, y firmados (nunca la pública cerrada)');
  assert.equal(row(layer, 101).video_url, `/project-mirror/${sha(b)}.mp4`);
  assert.equal(row(layer, 102).video_url, `/project-mirror/${sha(c)}.mp4`);
  assert.equal(row(layer, 100).video_url, a, 'el que falta queda con la dirección de la nube');
  assert.ok(fs.existsSync(path.join(dir, 'project-mirror', `${sha(b)}.mp4`)));
  // La siguiente sincronización baja solo lo que falta.
  fetched.length = 0;
  const r2 = await mirror.sync(layer.store, { signer, cloudUrl: CLOUD, limits: { maxPerRun: 2 }, freeBytes: () => 1e12, fetchFn: async (u) => { fetched.push(u); return video()(); } });
  assert.deepEqual([r2.downloaded, fetched], [1, [signedOf(a)]]);
});

test('solo videos y modelos de la carpeta de proyectos de ESTA nube: evidencias de docentes, otros buckets, otras nubes y archivos locales se ignoran', async () => {
  const { layer, mirror } = boot([
    { video_url: pub('evidence/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/1_a.jpg') }, { video_url: `${CLOUD}/storage/v1/object/public/course-content/lessons/a.mp4` },
    { video_url: 'https://otro.supabase.co/storage/v1/object/public/project-videos/1730000000001_aaaaa' }, { video_url: '/storage/v1/object/public/project-videos/1730000000009_zzzzz' }, { video_url: null },
  ]);
  const fetched = [];
  const r = await mirror.sync(layer.store, { signer, cloudUrl: CLOUD, freeBytes: () => 1e12, fetchFn: async (u) => { fetched.push(u); return video()(); } });
  assert.deepEqual([r.downloaded, r.failed, fetched.length], [0, 0, 0]);
});

test('topes: archivo demasiado grande (anunciado o no), copia total llena y disco libre por debajo del mínimo; sin dejar restos', async () => {
  const big = pub('1730000000001_aaaaa'), sneaky = pub('1730000000002_bbbbb'), ok = pub('1730000000003_ccccc');
  const { dir, layer, mirror } = boot([
    { video_url: big, created_at: '2026-10-03T10:00:00Z' }, { video_url: sneaky, created_at: '2026-10-02T10:00:00Z' }, { video_url: ok, created_at: '2026-10-01T10:00:00Z' },
  ]);
  const handler = (u) => (u.includes('aaaaa') ? video(20_000)() : u.includes('bbbbb') ? video(20_000, 'video/mp4', false)() : video(1000)());
  const r = await mirror.sync(layer.store, { signer, cloudUrl: CLOUD, limits: { maxFileBytes: 10_000 }, freeBytes: () => 1e12, fetchFn: async (u) => handler(u) });
  assert.deepEqual([r.downloaded, r.failed], [1, 2], 'el anunciado y el que miente sobre su tamaño se rechazan');
  const left = fs.readdirSync(path.join(dir, 'project-mirror'));
  assert.deepEqual(left, [`${sha(ok)}.mp4`], 'ningún .part queda en el disco');

  const total = boot([{ video_url: pub('1730000000010_ddddd'), created_at: '2026-10-02T10:00:00Z' }, { video_url: pub('1730000000012_fffff'), created_at: '2026-10-01T10:00:00Z' }]);
  const t = await total.mirror.sync(total.layer.store, { signer, cloudUrl: CLOUD, limits: { maxTotalBytes: 1500 }, freeBytes: () => 1e12, fetchFn: async () => video(1000)() });
  assert.deepEqual([t.downloaded, t.skipped], [1, 1], 'el primero cabe; el segundo pasaría el tope total de la copia');
  assert.equal(total.mirror.totalBytes(), 1000);

  const low = boot([{ video_url: pub('1730000000011_eeeee') }]);
  const l = await low.mirror.sync(low.layer.store, { signer, cloudUrl: CLOUD, limits: { minFreeBytes: 2 * 1024 ** 3 }, freeBytes: () => 2 * 1024 ** 3 + 100, fetchFn: async () => video(5000)() });
  assert.deepEqual([l.downloaded, l.skipped], [0, 1], 'si copiarlo dejaría menos disco libre que el mínimo, no se copia');
});

test('un modelo 3D conserva su extensión; algo que no es video ni modelo se rechaza; sin firma se intenta la pública', async () => {
  const stl = pub('1730000000001_aaaaa.stl'), html = pub('1730000000002_bbbbb');
  const { layer, mirror } = boot([{ video_url: stl, created_at: '2026-10-02T10:00:00Z' }, { video_url: html, created_at: '2026-10-01T10:00:00Z' }]);
  const fetched = [];
  const r = await mirror.sync(layer.store, {
    signer: { sign: async () => { throw new Error('sin internet'); } }, cloudUrl: CLOUD, freeBytes: () => 1e12,
    fetchFn: async (u) => { fetched.push(u); return u === stl ? video(3000, 'application/octet-stream')() : new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }); },
  });
  assert.deepEqual(fetched, [stl, html], 'sin firma se intentó la dirección pública (bucket aún público)');
  assert.deepEqual([r.downloaded, r.failed], [1, 1]);
  assert.equal(row(layer, 100).video_url, `/project-mirror/${sha(stl)}.stl`);
});

test('un proyecto que ya no está en la réplica libera su archivo del disco', async () => {
  const u = pub('1730000000001_aaaaa');
  const { dir, layer, mirror } = boot([{ video_url: u }]);
  await mirror.sync(layer.store, { signer, cloudUrl: CLOUD, freeBytes: () => 1e12, fetchFn: async () => video()() });
  assert.equal(fs.readdirSync(path.join(dir, 'project-mirror')).length, 1);
  layer.store.remove('projects', 100);
  const r = await mirror.sync(layer.store, { signer, cloudUrl: CLOUD, freeBytes: () => 1e12, fetchFn: async () => video()() });
  assert.equal(r.removed, 1);
  assert.equal(fs.readdirSync(path.join(dir, 'project-mirror')).length, 0);
  assert.equal(mirror.totalBytes(), 0);
});

test('servir: archivo completo, rangos (para adelantar el video), HEAD y 404 para lo que no es suyo', async (t) => {
  const http = await import('node:http');
  const u = pub('1730000000001_aaaaa');
  const { layer, mirror } = boot([{ video_url: u }]);
  const content = Buffer.alloc(1000);
  for (let i = 0; i < content.length; i++) content[i] = i % 251;
  await mirror.sync(layer.store, { signer, cloudUrl: CLOUD, freeBytes: () => 1e12, fetchFn: async () => new Response(content, { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': '1000' } }) });
  const name = `${sha(u)}.mp4`;
  const server = http.createServer((req, res) => { const n = decodeURIComponent(req.url.replace('/project-mirror/', '')); mirror.serve(req, res, n); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/project-mirror/`;

  const full = await fetch(base + name);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'video/mp4');
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  assert.equal(full.headers.get('x-content-type-options'), 'nosniff');
  assert.match(full.headers.get('content-security-policy'), /sandbox/);
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), content);

  const part = await fetch(base + name, { headers: { range: 'bytes=10-19' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 10-19/1000');
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), content.subarray(10, 20));
  assert.equal((await fetch(base + name, { headers: { range: 'bytes=5000-' } })).status, 416);

  const head = await fetch(base + name, { method: 'HEAD' });
  assert.equal([head.status, head.headers.get('content-length')].join(' '), '200 1000');

  for (const bad of ['..%2f..%2fconfig.json', `${'a'.repeat(40)}.mp4`, `${sha(u)}.html`, `${sha(u)}.svg`]) assert.equal((await fetch(base + bad)).status, 404, `debe dar 404: ${bad}`);
  assert.equal(mirror.isServableName(name), true);
});
