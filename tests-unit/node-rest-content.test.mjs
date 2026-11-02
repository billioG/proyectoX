// Los recursos de los cursos sin internet con la app real: las direcciones de los archivos apuntan al nodo (no a la nube) y el
// nodo sirve su espejo local por las mismas rutas de Storage que usa la app. Se omite si better-sqlite3 no está compilado.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { sqliteAvailable, startNode, stopAllNodes } from './helpers/start-node.mjs';
import { hashClassPassword } from '../school-node/rest/auth.js';

after(stopAllNodes);

const BASE = 'https://proyecto.supabase.co/storage/v1/object/public/course-content/';
const salt = 'ab'.repeat(8);
const rest = {
  class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
  tables: {
    students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' }],
    courses: [{ id: 'c1', title: 'Robótica', school_code: 'ESC1', grade: 'Primero', section: 'A', created_at: '2026-10-01T00:00:00Z' }],
    lessons: [
      { id: 'l1', course_id: 'c1', title: 'Video', content_type: 'video', content_url: `${BASE}curso1/video.mp4`, audience: 'estudiante', order_index: 1 },
      { id: 'l2', course_id: 'c1', title: 'Enlace', content_type: 'video', content_url: 'https://www.youtube.com/watch?v=abc', audience: 'estudiante', order_index: 2 },
      { id: 'l3', course_id: 'c1', title: 'Otro bucket', content_type: 'image', content_url: 'https://proyecto.supabase.co/storage/v1/object/public/otro/foto.png', audience: 'estudiante', order_index: 3 },
    ],
  },
};
const skip = !sqliteAvailable() && 'better-sqlite3 no disponible';

async function boot() {
  const node = await startNode({
    rest, meta: { storage_base: BASE },
    contentFiles: { 'curso1/video.mp4': 'VIDEO-LOCAL', 'scorm/index.html': '<html>SCORM</html>', 'curso1/lista.pdf': 'PDF' },
  });
  const login = await node.api('/functions/v1/student-login', { method: 'POST', body: { username: 'ana1', password: 'clase123' } });
  const session = await node.api('/auth/v1/verify', { method: 'POST', body: { type: 'magiclink', token_hash: login.data.token_hash } });
  return { node, token: session.data.access_token };
}

test('las lecciones llegan a la app con la dirección del archivo apuntando al nodo; lo que no es de la nube se deja igual', { skip }, async () => {
  const { node, token } = await boot();
  const r = await node.api('/rest/v1/lessons?select=id,content_url&order=order_index.asc', { token });
  assert.deepEqual(r.data.map((l) => l.content_url), ['/content/curso1/video.mp4', 'https://www.youtube.com/watch?v=abc', 'https://proyecto.supabase.co/storage/v1/object/public/otro/foto.png']);
  const nested = await node.api('/rest/v1/courses?select=id,lessons(id,content_url)', { token });
  assert.equal(nested.data[0].lessons.find((l) => l.id === 'l1').content_url, '/content/curso1/video.mp4', 'también dentro de courses(lessons(...))');
});

test('el nodo sirve el espejo local por las rutas de Storage de la app, y solo del bucket de cursos, sin salirse de su carpeta', { skip }, async () => {
  const { node } = await boot();
  const get = (p) => fetch(node.base + p);
  const ok = await get('/storage/v1/object/public/course-content/curso1/video.mp4');
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), 'VIDEO-LOCAL');
  assert.equal((await get('/content/curso1/lista.pdf')).status, 200);
  assert.equal((await get('/storage/v1/object/public/otro/foto.png')).status, 404, 'otro bucket: no existe en el nodo');
  assert.equal((await get('/storage/v1/object/public/course-content/no-existe.mp4')).status, 404);
  for (const evil of ['/storage/v1/object/public/course-content/..%2F..%2Fconfig.json', '/storage/v1/object/public/course-content/../../config.json', '/storage/v1/object/public/course-content/%2e%2e/%2e%2e/node.db']) {
    const r = await get(evil);
    assert.ok([400, 404].includes(r.status), `${evil} -> ${r.status}`);
  }
});

test('el paquete SCORM/H5P: la función serve-scorm-entry de la nube también responde desde el espejo, como HTML', { skip }, async () => {
  const { node } = await boot();
  const r = await fetch(`${node.base}/functions/v1/serve-scorm-entry?path=${encodeURIComponent('scorm/index.html')}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal(await r.text(), '<html>SCORM</html>');
  assert.equal((await fetch(`${node.base}/functions/v1/serve-scorm-entry?path=${encodeURIComponent('../config.json')}`)).status, 404);
  assert.equal((await fetch(`${node.base}/functions/v1/serve-scorm-entry`)).status, 404);
});
