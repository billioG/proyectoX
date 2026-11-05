// Sincronizar solo al detectar internet, con el servidor de verdad y una nube simulada que se «enciende» después (como conectar el cable a un router con internet):
// el estado dice primero «sin internet» con el motivo, y en cuanto la nube responde el nodo sincroniza sin que nadie pulse nada y lo muestra. Corre con Node 20.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { sqliteAvailable, startNode, stopAllNodes, waitFor } from './helpers/start-node.mjs';
import { startFakeCloud, FAKE_TOKEN } from './helpers/fake-cloud.mjs';

after(stopAllNodes);
const skip = !sqliteAvailable() && 'better-sqlite3 no disponible';
const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

test('el estado trae si hay internet (y por qué no) y las direcciones del servidor; al aparecer la nube sincroniza solo', { skip, timeout: 90000 }, async () => {
  const port = await freePort();
  const node = await startNode({ config: { cloudUrl: `http://127.0.0.1:${port}`, nodeToken: FAKE_TOKEN, connectivitySeconds: 1, connectivityMinGapSeconds: 1 } });
  const status = async () => (await fetch(`${node.base}/api/node/status`)).json();

  // Sin nube: lo dice y explica.
  const off = await waitFor(async () => { const s = await status(); return s.internet?.online === false ? s : null; }, { timeout: 30000, every: 300 });
  assert.match(off.internet.detail, /nube|red|internet/i);
  assert.ok(Array.isArray(off.urls));
  assert.equal(off.syncing, false);
  assert.equal(off.last_sync_at, null);

  // La nube «aparece» (se conectó el cable): el servidor lo detecta y sincroniza solo.
  const cloud = await startFakeCloud({ port });
  try {
    const sawStages = new Set();
    const on = await waitFor(async () => {
      const s = await status();
      if (s.syncing && s.sync_stage) sawStages.add(s.sync_stage);
      return s.internet?.online === true && s.last_sync_at ? s : null;
    }, { timeout: 40000, every: 100 });
    assert.equal(on.internet.detail, null);
    assert.equal(on.sync_error, null);
    assert.ok(on.last_sync_at, 'sincronizó sin pulsar el botón');
  } finally { await cloud.stop(); }
});

test('el docente toca «Sincronizar ahora» en la plataforma: el servidor, que avisa a la nube cada segundo, lo recibe y sincroniza; la nube ve su estado', { skip, timeout: 90000 }, async () => {
  const port = await freePort();
  const cloud = await startFakeCloud({ port });
  try {
    const node = await startNode({ config: { cloudUrl: cloud.url, nodeToken: FAKE_TOKEN, connectivitySeconds: 1, remotePingSeconds: 1 } });
    // Primero sincroniza solo (detecta internet); después el servidor sigue avisando con su estado.
    await waitFor(() => (cloud.stats.syncs || 0) >= 1 && (cloud.stats.pings || 0) >= 2, { timeout: 40000, every: 200 });
    assert.equal(typeof cloud.lastPing.pending_changes, 'number');
    assert.equal(cloud.lastPing.syncing, false);
    assert.equal(cloud.lastPing.internet, true);
    assert.ok(Array.isArray(cloud.lastPing.urls));
    assert.match(String(cloud.lastPing.version), /^v1\.0\.\d+$/);
    await new Promise((r) => setTimeout(r, 7000)); // pasa también la sincronización del arranque (a los 5 s)
    const before = cloud.stats.syncs;
    await new Promise((r) => setTimeout(r, 2500));
    assert.equal(cloud.stats.syncs, before, 'sin petición no sincroniza de más (solo avisa)');
    // El docente pide sincronizar en la plataforma.
    cloud.requestedAt = new Date().toISOString();
    await waitFor(() => cloud.stats.syncs > before, { timeout: 30000, every: 200 });
    // La misma petición no se repite.
    const after = cloud.stats.syncs;
    await new Promise((r) => setTimeout(r, 3500));
    assert.equal(cloud.stats.syncs, after, 'una petición, una sincronización');
  } finally { await cloud.stop(); }
});
