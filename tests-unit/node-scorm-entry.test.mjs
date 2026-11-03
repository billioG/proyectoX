// Recursos SCORM/HTML5 sin internet con el servidor de verdad: la lección guarda la dirección de la función de la nube (serve-scorm-entry) y la app la pide con fetch()
// para meterla en el iframe. El nodo tiene que (1) dar esa dirección apuntando a sí mismo y (2) servir el HTML de entrada con un <base href> hacia la carpeta del paquete,
// igual que la función de la nube, porque el iframe usa srcdoc y sus css/js relativos se resolverían contra la raíz. Corre con Node 20.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sqliteAvailable, startNode, stopAllNodes } from './helpers/start-node.mjs';
import { hashClassPassword } from '../school-node/rest/auth.js';

after(stopAllNodes);
const skip = !sqliteAvailable() && 'better-sqlite3 no disponible';
const salt = 'ab'.repeat(8);
const L1 = '3f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const CLOUD = 'https://proyecto.supabase.co';
const rest = {
  class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
  storage_base: `${CLOUD}/storage/v1/object/public/course-content/`,
  tables: {
    students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' }],
    courses: [{ id: 'c1', title: 'Aula en paz', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
    lessons: [
      { id: L1, course_id: 'c1', title: 'Aula en paz', content_type: 'scorm', audience: 'estudiante', order_index: 1, school_code: 'ESC1', grade: 'Primero', section: 'A',
        content_url: `${CLOUD}/functions/v1/serve-scorm-entry?path=lessons/${L1}/res/index.html&lang=es`, content_path: `lessons/${L1}` },
      { id: '4a2b8c1e-5d4a-4e7b-9a10-123456789abc', course_id: 'c1', title: 'Guía', content_type: 'pdf', audience: 'estudiante', order_index: 2, school_code: 'ESC1', grade: 'Primero', section: 'A',
        content_url: `${CLOUD}/storage/v1/object/public/course-content/lessons/4a2b8c1e-5d4a-4e7b-9a10-123456789abc/guia.pdf` },
    ],
  },
};

test('la lección SCORM apunta al nodo y el HTML de entrada sale con su <base href>, con los archivos del paquete servidos desde el espejo local', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest });
  const dir = path.join(node.dataDir, 'content', 'lessons', L1, 'res');
  fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><title>Aula</title><script src="js/app.js"></script></head><body>Hola</body></html>');
  fs.writeFileSync(path.join(dir, 'js', 'app.js'), 'window.ok = true;');

  const l = await node.api('/functions/v1/student-login', { method: 'POST', body: { username: 'ana1', password: 'clase123' } });
  const token = (await node.api('/auth/v1/verify', { method: 'POST', body: { type: 'magiclink', token_hash: l.data.token_hash } })).data.access_token;
  const lessons = await (await fetch(`${node.base}/rest/v1/lessons?select=id,content_type,content_url&order=order_index.asc`, { headers: { Authorization: `Bearer ${token}` } })).json();

  // La app hace fetch() de lesson.content_url: nunca a la nube.
  const scorm = lessons.find((x) => x.content_type === 'scorm');
  assert.ok(!/supabase\.co/.test(scorm.content_url), scorm.content_url);
  assert.equal(scorm.content_url, `/functions/v1/serve-scorm-entry?path=lessons/${L1}/res/index.html&lang=es`);
  assert.equal(lessons.find((x) => x.content_type === 'pdf').content_url, `/content/lessons/4a2b8c1e-5d4a-4e7b-9a10-123456789abc/guia.pdf`, 'lo de siempre sigue igual');

  const entry = await fetch(new URL(scorm.content_url, node.base));
  assert.equal(entry.status, 200);
  assert.match(entry.headers.get('content-type'), /text\/html/);
  const html = await entry.text();
  const base = /<base href="([^"]+)">/.exec(html)?.[1];
  assert.equal(base, `${node.base}/storage/v1/object/public/course-content/lessons/${L1}/res/`);
  assert.ok(html.indexOf('<base') < html.indexOf('<script'), 'el <base> va antes que cualquier script');

  // El script relativo del paquete se resuelve contra ese <base> y sale del espejo local.
  const js = await fetch(new URL('js/app.js', base));
  assert.equal(js.status, 200);
  assert.equal(await js.text(), 'window.ok = true;');

  // Sin <head> también lleva el <base>; un archivo que no existe o una ruta fuera del espejo no se sirve.
  fs.writeFileSync(path.join(dir, 'solo.html'), '<p>sin head</p>');
  assert.match(await (await fetch(`${node.base}/functions/v1/serve-scorm-entry?path=lessons/${L1}/res/solo.html`)).text(), /^<base href="[^"]+"><p>sin head<\/p>$/);
  assert.equal((await fetch(`${node.base}/functions/v1/serve-scorm-entry?path=lessons/${L1}/res/no-existe.html`)).status, 404);
  assert.equal((await fetch(`${node.base}/functions/v1/serve-scorm-entry?path=../../config.json`)).status, 404);
  assert.equal((await fetch(`${node.base}/functions/v1/serve-scorm-entry`)).status, 404);
});

test('subir a un depósito que el nodo no tiene (foto de perfil) responde un aviso claro, no «Not Found»; los depósitos de siempre no cambian', { skip, timeout: 60000 }, async () => {
  const node = await startNode({ rest });
  const l = await node.api('/functions/v1/student-login', { method: 'POST', body: { username: 'ana1', password: 'clase123' } });
  const token = (await node.api('/auth/v1/verify', { method: 'POST', body: { type: 'magiclink', token_hash: l.data.token_hash } })).data.access_token;
  const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', new File([Buffer.alloc(100, 1)], 'foto.png'));
  const r = await fetch(`${node.base}/storage/v1/object/profile-photos/s1_123.png`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  assert.equal(r.status, 400);
  assert.match((await r.json()).message, /necesita internet/);
  // Course-content sigue por su manejador (un estudiante recibe su propio rechazo, no este aviso).
  const c = await fetch(`${node.base}/storage/v1/object/course-content/lessons/${L1}/x.pdf`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: Buffer.alloc(10, 1) });
  assert.notEqual((await c.json().catch(() => ({}))).error, 'sin_internet');
});
