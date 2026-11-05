// El servidor del nodo comprime con gzip lo que es texto (la app y sus JavaScript) cuando el navegador lo acepta, y entrega
// el mismo contenido de siempre cuando no. Servidor real de school-node/server.js.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { startNode, sqliteAvailable, stopAllNodes, ROOT } from './helpers/start-node.mjs';

after(() => stopAllNodes());
const skip = !sqliteAvailable() && 'better-sqlite3 no está instalado para este Node';

// fetch() descomprime solo y esconde el encabezado: aquí se pide «a mano» para ver los bytes que viajan por la red.
function raw(base, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(base + urlPath, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

test('la app y el JavaScript viajan comprimidos y descomprimen a lo mismo que hay en disco', { skip, timeout: 60000 }, async () => {
  const node = await startNode();
  const js = await raw(node.base, '/js/main.js', { 'Accept-Encoding': 'gzip, deflate' });
  assert.equal(js.status, 200);
  assert.equal(js.headers['content-encoding'], 'gzip');
  assert.equal(js.headers.vary, 'Accept-Encoding');
  assert.match(js.headers['content-type'], /javascript/);
  const disk = fs.readFileSync(path.join(ROOT, 'js', 'main.js'));
  assert.equal(zlib.gunzipSync(js.body).equals(disk), true);
  assert.ok(js.body.length < disk.length * 0.5, `comprimido ${js.body.length} de ${disk.length}`);
  assert.equal(Number(js.headers['content-length']), js.body.length);

  const page = await raw(node.base, '/', { 'Accept-Encoding': 'gzip' });
  assert.equal(page.headers['content-encoding'], 'gzip');
  const html = zlib.gunzipSync(page.body).toString('utf8');
  assert.match(html, /<script src="\/node-config\.js"><\/script>/, 'sigue llevando la configuración del nodo');
  const again = await raw(node.base, '/', { 'Accept-Encoding': 'gzip' });
  assert.equal(again.body.equals(page.body), true, 'la segunda vez sale de la memoria');
});

test('sin gzip (o con gzip;q=0) se entrega sin comprimir; los rangos tampoco se comprimen', { skip, timeout: 60000 }, async () => {
  const node = await startNode();
  const disk = fs.readFileSync(path.join(ROOT, 'js', 'main.js'));
  for (const h of [{}, { 'Accept-Encoding': 'identity' }, { 'Accept-Encoding': 'gzip;q=0, br' }]) {
    const r = await raw(node.base, '/js/main.js', h);
    assert.equal(r.headers['content-encoding'], undefined, JSON.stringify(h));
    assert.equal(r.body.equals(disk), true);
  }
  const part = await raw(node.base, '/js/main.js', { 'Accept-Encoding': 'gzip', Range: 'bytes=0-99' });
  assert.equal(part.status, 206);
  assert.equal(part.headers['content-encoding'], undefined);
  assert.equal(part.body.length, 100);
  const plainPage = await raw(node.base, '/', {});
  assert.equal(plainPage.headers['content-encoding'], undefined);
  assert.match(plainPage.body.toString('utf8'), /node-config\.js/);
});

test('las imágenes no se comprimen (ya vienen comprimidas)', { skip, timeout: 60000 }, async () => {
  const node = await startNode();
  const r = await raw(node.base, '/icon-192.png', { 'Accept-Encoding': 'gzip' });
  if (r.status === 200) assert.equal(r.headers['content-encoding'], undefined);
});
