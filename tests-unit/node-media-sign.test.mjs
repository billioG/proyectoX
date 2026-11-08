// Medios privados en el servidor escolar: el nodo pide direcciones firmadas a node-sync (school-node/media-sign.js), las usa al bajar fotos de perfil (rest/photos.js)
// y la ruta /node-media redirige al navegador. Red falsa: corre con Node 20 y sin internet.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { createRestLayer } from '../school-node/rest/index.js';
import { createPhotos } from '../school-node/rest/photos.js';
import { createMediaSigner, isPrivateCloudUrl } from '../school-node/media-sign.js';

const CLOUD = 'https://proyecto.supabase.co';
const pub = (bucket, p) => `${CLOUD}/storage/v1/object/public/${bucket}/${p}`;
const U1 = pub('profile-photos', '11111111-1111-4111-8111-111111111111_1730000000000.jpg');
const U2 = pub('profile-photos', '22222222-2222-4222-8222-222222222222_1730000000001.png');
const sha = (u) => crypto.createHash('sha1').update(u).digest('hex');
const signedOf = (u) => u.replace('/object/public/', '/object/sign/') + '?token=abc';

test('solo se firman direcciones públicas de los buckets de personas de ESTA nube', () => {
  assert.equal(isPrivateCloudUrl(U1, CLOUD), true);
  assert.equal(isPrivateCloudUrl(pub('project-videos', '1730_ab12c'), CLOUD), true);
  assert.equal(isPrivateCloudUrl(pub('comment-attachments', 'u/1_a.png'), CLOUD), true);
  assert.equal(isPrivateCloudUrl(pub('course-content', 'lessons/a.mp4'), CLOUD), false, 'los cursos siguen públicos');
  assert.equal(isPrivateCloudUrl(pub('teacher-evidence', 'rocks/u/1.png'), CLOUD), false, 'el nodo no usa las evidencias de docentes');
  assert.equal(isPrivateCloudUrl(U1.replace('proyecto', 'otro'), CLOUD), false, 'otra nube no');
  assert.equal(isPrivateCloudUrl('https://example.com/x.png', CLOUD), false);
  assert.equal(isPrivateCloudUrl(U1 + '?x=1', CLOUD), false);
  assert.equal(isPrivateCloudUrl(null, CLOUD), false);
});

function signerWith(handler) {
  const calls = [];
  let t = 0;
  const signer = createMediaSigner({
    cloudUrl: CLOUD, nodeToken: 'TOKEN', now: () => t,
    fetchImpl: async (url, opts) => { const body = JSON.parse(opts.body); calls.push({ url, token: opts.headers['x-node-token'], body }); return handler(body); },
  });
  return { signer, calls, advance: (ms) => { t += ms; } };
}
const okJson = (obj) => ({ ok: true, json: async () => obj });

test('pide las firmas a node-sync con el token del nodo y devuelve solo las que se firmaron', async () => {
  const h = signerWith((b) => okJson({ signed: Object.fromEntries(b.urls.filter((u) => u === U1).map((u) => [u, signedOf(u)])) }));
  const out = await h.signer.sign([U1, U2, 'https://example.com/x.png']);
  assert.deepEqual(out, { [U1]: signedOf(U1) }, 'U2 no la firmó la nube; la ajena ni se pidió');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, `${CLOUD}/functions/v1/node-sync`);
  assert.equal(h.calls[0].token, 'TOKEN');
  assert.equal(h.calls[0].body.action, 'sign_media');
  assert.deepEqual(h.calls[0].body.urls, [U1, U2]);
});

test('reparte en lotes de 40, reutiliza la firma 100 minutos y vuelve a pedirla después', async () => {
  const many = Array.from({ length: 95 }, (_, i) => pub('project-videos', `1730${String(i).padStart(4, '0')}_ab12c`));
  const h = signerWith((b) => okJson({ signed: Object.fromEntries(b.urls.map((u) => [u, signedOf(u)])) }));
  const out = await h.signer.sign(many);
  assert.equal(Object.keys(out).length, 95);
  assert.deepEqual(h.calls.map((c) => c.body.urls.length), [40, 40, 15]);
  await h.signer.sign(many);
  assert.equal(h.calls.length, 3, 'segunda vez sale de la memoria');
  h.advance(101 * 60 * 1000);
  await h.signer.sign(many.slice(0, 5));
  assert.equal(h.calls.length, 4);
});

test('sin internet, con la nube sin la acción, o con una respuesta rara: no lanza y no devuelve firmas falsas', async () => {
  for (const handler of [
    () => { throw new Error('sin internet'); },
    () => ({ ok: false, status: 400, json: async () => ({ error: 'Acción desconocida' }) }),
    () => okJson({ signed: { [U1]: 'javascript:alert(1)' } }),
    () => okJson({ signed: { [U1]: 'http://insegura.example/x' } }),
    () => okJson(null),
  ]) {
    const h = signerWith(handler);
    assert.deepEqual(await h.signer.sign([U1]), {});
    assert.equal(await h.signer.signOne(U1), null);
  }
});

function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-sign-'));
  const db = openDb(dir);
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('storage_base', ?)").run(`${CLOUD}/storage/v1/object/public/course-content/`);
  const layer = createRestLayer(db);
  layer.store.put('students', { id: 's1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', profile_photo_url: U1 });
  layer.store.put('teachers', { id: 't1', full_name: 'Marta', role: 'docente', profile_photo_url: U2 });
  const photos = createPhotos({ db, dir: path.join(dir, 'photos') });
  test.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, layer, photos };
}
const image = () => new Response(Buffer.alloc(2000, 1), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '2000' } });

test('con el bucket privado: las fotos se bajan con la dirección FIRMADA y la app las recibe con la dirección local', async () => {
  const { dir, layer, photos } = boot();
  const fetched = [];
  const signer = { sign: async (urls) => Object.fromEntries(urls.map((u) => [u, signedOf(u)])) };
  const r = await photos.sync(layer.store, { signer, fetchFn: async (u) => { fetched.push(u); return u.includes('/object/sign/') ? image() : new Response('no', { status: 400 }); } });
  assert.deepEqual([r.downloaded, r.failed], [2, 0]);
  assert.deepEqual(fetched.sort(), [signedOf(U1), signedOf(U2)].sort(), 'nunca se pidió la dirección pública cerrada');
  assert.equal(layer.store.all('students')[0].profile_photo_url, `/photos/${sha(U1)}.jpg`, 'se identifica por la dirección pública guardada en la base');
  assert.ok(fs.existsSync(path.join(dir, 'photos', `${sha(U1)}.jpg`)));
});

test('si no se pudo firmar (sin internet o bucket aún público) se intenta la dirección pública; un fallo no detiene a las demás', async () => {
  const { layer, photos } = boot();
  const fetched = [];
  const signer = { sign: async () => { throw new Error('sin internet'); } };
  const r = await photos.sync(layer.store, { signer, fetchFn: async (u) => { fetched.push(u); return u === U1 ? image() : new Response('no', { status: 400 }); } });
  assert.deepEqual(fetched.sort(), [U1, U2].sort());
  assert.deepEqual([r.downloaded, r.failed], [1, 1]);
});

// ---------- la ruta /node-media del servidor, con una «nube» falsa en la computadora ----------
test('GET /node-media redirige a la dirección firmada; rechaza lo que no es un medio privado de la nube de este nodo', async (t) => {
  const helper = await import('./helpers/start-node.mjs');
  const { startNode } = helper;
  if (!helper.sqliteAvailable()) return t.skip('better-sqlite3 no está instalado para este Node');
  const asked = [];
  const cloud = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const b = JSON.parse(body || '{}');
      asked.push({ token: req.headers['x-node-token'], action: b.action, urls: b.urls });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ signed: Object.fromEntries((b.urls || []).map((u) => [u, `https://firmada.example/sign?u=${encodeURIComponent(u)}`])) }));
    });
  });
  await new Promise((r) => cloud.listen(0, '127.0.0.1', r));
  const cloudUrl = `http://127.0.0.1:${cloud.address().port}`;
  const node = await startNode({ config: { cloudUrl, nodeToken: 'TOKEN-123' } });
  t.after(async () => { await node.stop(); cloud.close(); });
  const photo = `${cloudUrl}/storage/v1/object/public/profile-photos/11111111-1111-4111-8111-111111111111_1730000000000.jpg`;

  const ok = await fetch(`${node.base}/node-media?u=${encodeURIComponent(photo)}`, { redirect: 'manual' });
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.get('location'), `https://firmada.example/sign?u=${encodeURIComponent(photo)}`);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const signAsks = () => asked.filter((a) => a.action === 'sign_media'); // el nodo también avisa a la nube cada 30 s: aquí solo importan las firmas
  assert.deepEqual(signAsks().map((a) => [a.token, a.urls]), [['TOKEN-123', [photo]]]);

  for (const bad of [
    'https://example.com/x.png', photo.replace('profile-photos', 'course-content'), photo.replace('127.0.0.1', 'localhost'),
    'javascript:alert(1)', '',
  ]) {
    const r = await fetch(`${node.base}/node-media?u=${encodeURIComponent(bad)}`, { redirect: 'manual' });
    assert.equal(r.status, 404, `debe rechazar ${bad}`);
  }
  assert.equal(signAsks().length, 1, 'lo rechazado nunca llega a la nube');
});
