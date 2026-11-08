// HTTPS del nodo (school-node/server.js): quien entra por el nombre quetzal.local pasa a https; por IP se queda en http; /node-ca.crt siempre por http.
// Arranca el servidor de verdad con un certificado de prueba (openssl). Se omite sin better-sqlite3 para este Node o sin openssl.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startNode, sqliteAvailable, stopAllNodes } from './helpers/start-node.mjs';

after(() => stopAllNodes());

function makeCerts() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-ca-'));
  const sh = (...a) => execFileSync('openssl', a, { cwd: dir, stdio: 'pipe', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  sh('genrsa', '-out', 'ca.key', '2048');
  sh('req', '-x509', '-new', '-nodes', '-key', 'ca.key', '-sha256', '-days', '30', '-subj', '/CN=Prueba CA', '-out', 'ca.crt');
  sh('genrsa', '-out', 's.key', '2048');
  sh('req', '-new', '-key', 's.key', '-subj', '/CN=quetzal.local', '-out', 's.csr');
  fs.writeFileSync(path.join(dir, 'e.cnf'), 'subjectAltName=DNS:quetzal.local,IP:127.0.0.1\n');
  sh('x509', '-req', '-in', 's.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '30', '-sha256', '-extfile', 'e.cnf', '-out', 's.crt');
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  return { ca: read('ca.crt'), crt: read('s.crt'), key: read('s.key') };
}
let certs = null;
try { certs = makeCerts(); } catch { /* sin openssl */ }

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const req = (port, { method = 'GET', pathName = '/', host }) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, method, path: pathName, headers: { host } }, (res) => { res.resume(); res.on('end', () => resolve(res)); });
  r.on('error', reject); r.end();
});
const skip = (!sqliteAvailable() && 'better-sqlite3 no está instalado para este Node') || (!certs && 'no hay openssl');

async function boot(config = {}) {
  const httpsPort = await freePort();
  const node = await startNode({ config: { httpsPort, ...config }, dataFiles: { 'ca/server.crt': certs.crt, 'ca/server.key': certs.key, 'ca/quetzal-ca.crt': certs.ca } });
  // Espera a que el HTTPS esté escuchando.
  for (let i = 0; i < 60 && !/HTTPS activo/.test(node.log()); i++) await new Promise((r) => setTimeout(r, 100));
  return { node, httpsPort };
}

test('por el nombre .local pasa a https; por IP se queda en http; el certificado se descarga por http; solo GET', { skip, timeout: 60000 }, async () => {
  const { node, httpsPort } = await boot();
  assert.match(node.log(), /HTTPS activo/);

  const named = await req(node.port, { pathName: '/cartel?x=1', host: `quetzal.local:${node.port}` });
  assert.equal(named.statusCode, 302);
  assert.equal(named.headers.location, `https://quetzal.local:${httpsPort}/cartel?x=1`);

  const byIp = await req(node.port, { pathName: '/cartel', host: `192.168.1.50:${node.port}` });
  assert.equal(byIp.statusCode, 200, 'por IP no se redirige (la IP puede cambiar; el certificado es del nombre)');

  const ca = await req(node.port, { pathName: '/node-ca.crt', host: 'quetzal.local' });
  assert.equal(ca.statusCode, 200, 'el certificado de la CA se descarga por http');
  assert.equal(ca.headers['content-type'], 'application/x-x509-ca-cert');

  const post = await req(node.port, { method: 'POST', pathName: '/api/logout', host: 'quetzal.local' });
  assert.notEqual(post.statusCode, 302, 'un POST no se redirige');

  // Por https responde la misma app, con el certificado de la CA de prueba.
  const body = await new Promise((resolve, reject) => {
    https.get({ host: '127.0.0.1', port: httpsPort, path: '/api/node/status', servername: 'quetzal.local', headers: { host: 'quetzal.local' }, ca: certs.ca }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, data: d }));
    }).on('error', reject);
  });
  assert.equal(body.status, 200);
  assert.equal(JSON.parse(body.data).node, true);
});

test('"httpsRedirect": false apaga la redirección y sin certificado el nodo sigue solo con http', { skip, timeout: 60000 }, async () => {
  const { node } = await boot({ httpsRedirect: false });
  const res = await req(node.port, { pathName: '/cartel', host: 'quetzal.local' });
  assert.equal(res.statusCode, 200);

  const plain = await startNode({});
  const r = await req(plain.port, { pathName: '/cartel', host: 'quetzal.local' });
  assert.equal(r.statusCode, 200, 'sin certificado no hay HTTPS ni redirección');
  assert.doesNotMatch(plain.log(), /HTTPS activo/);
});
