// Fotos de perfil sin internet: el nodo las descarga al sincronizar (solo imágenes razonables de la nube del proyecto), las guarda
// y la app las recibe con la dirección local. Corre con Node 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { createRestLayer } from '../school-node/rest/index.js';
import { createPhotos } from '../school-node/rest/photos.js';

const cleanups = [];
test.after(() => { for (const c of cleanups.reverse()) c(); });

const HOST = 'https://proyecto.supabase.co';
const URL1 = `${HOST}/storage/v1/object/public/avatars/ana.jpg`;
const URL2 = `${HOST}/storage/v1/object/public/avatars/marta.png`;
const sha = (u) => crypto.createHash('sha1').update(u).digest('hex');

function boot(rows = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-photos-'));
  const db = openDb(dir);
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('storage_base', ?)").run(`${HOST}/storage/v1/object/public/course-content/`);
  const layer = createRestLayer(db);
  layer.store.put('students', { id: 's1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', profile_photo_url: URL1, ...rows.s1 });
  layer.store.put('teachers', { id: 't1', full_name: 'Marta', role: 'docente', profile_photo_url: URL2 });
  const photos = createPhotos({ db, dir: path.join(dir, 'photos') });
  cleanups.push(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, db, layer, photos };
}
const image = (type = 'image/jpeg', bytes = 2000) => async () => new Response(Buffer.alloc(bytes, 1), { status: 200, headers: { 'content-type': type, 'content-length': String(bytes) } });
const countingFetch = (impl) => { const calls = []; const f = async (u, o) => { calls.push(u); return impl(u, o); }; f.calls = calls; return f; };
const me = (layer) => layer.store.all('students').find((s) => s.id === 's1');

test('descarga las fotos de estudiantes y docentes, y la app las recibe con la dirección local; solo se baja lo que falta', async () => {
  const { dir, layer, photos } = boot();
  const f = countingFetch(image());
  const r = await photos.sync(layer.store, { fetchFn: f });
  assert.deepEqual([r.downloaded, r.failed], [2, 0]);
  assert.equal(me(layer).profile_photo_url, `/photos/${sha(URL1)}.jpg`);
  assert.equal(layer.store.all('teachers')[0].profile_photo_url, `/photos/${sha(URL2)}.jpg`);
  assert.ok(fs.existsSync(path.join(dir, 'photos', `${sha(URL1)}.jpg`)));
  await photos.sync(layer.store, { fetchFn: f });
  assert.equal(f.calls.length, 2, 'ya guardadas: no se vuelven a bajar');
  layer.store.put('students', { ...layer.store.all('students')[0], profile_photo_url: `${HOST}/storage/v1/object/public/avatars/nueva.webp` });
  await photos.sync(layer.store, { fetchFn: f });
  assert.equal(f.calls.length, 3, 'una foto nueva sí');
});

test('no baja lo que no debe: direcciones sin https, de otro sitio, que no son imagen o demasiado pesadas; un fallo no tumba nada', async () => {
  const { layer, photos } = boot();
  const put = (id, url) => layer.store.put('students', { id, full_name: id, school_code: 'ESC1', grade: 'Primero', section: 'A', profile_photo_url: url });
  put('a', `http://proyecto.supabase.co/x.jpg`); put('b', 'https://sitio-malo.example.com/x.jpg'); put('c', `${HOST}/x.html`); put('d', `${HOST}/grande.jpg`); put('e', `${HOST}/falla.jpg`); put('f', 'javascript:alert(1)');
  const fetchFn = async (u) => {
    if (u.endsWith('x.html')) return new Response('<html>', { headers: { 'content-type': 'text/html' } });
    if (u.endsWith('grande.jpg')) return new Response(Buffer.alloc(3_000_000), { headers: { 'content-type': 'image/jpeg' } });
    if (u.endsWith('falla.jpg')) throw new Error('sin red');
    return new Response(Buffer.alloc(100), { headers: { 'content-type': 'image/jpeg' } });
  };
  const r = await photos.sync(layer.store, { fetchFn });
  assert.equal(r.downloaded, 2, 'solo las dos del seed (Ana y Marta)');
  const url = (id) => layer.store.all('students').find((s) => s.id === id).profile_photo_url;
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) assert.ok(!String(url(id)).startsWith('/photos/'), `${id} no se cachea`);
});

test('la dirección local solo se usa si el archivo está guardado; si la foto falla se queda la de la nube', async () => {
  const { layer, photos } = boot();
  assert.equal(me(layer).profile_photo_url, URL1, 'antes de bajarla');
  await photos.sync(layer.store, { fetchFn: async () => { throw new Error('sin red'); } });
  assert.equal(me(layer).profile_photo_url, URL1);
});

test('los nombres que se sirven son solo los guardados por el nodo (huella y extensión de imagen)', () => {
  const { photos } = boot();
  assert.equal(photos.isServableName(`${sha(URL1)}.jpg`), true);
  for (const bad of ['../node.db', 'a.jpg', `${sha(URL1)}.html`, `${sha(URL1)}.jpg/../x`, '', `${sha(URL1)}.JPG`]) assert.equal(photos.isServableName(bad), false, bad);
});
