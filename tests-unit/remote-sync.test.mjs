// Aviso del servidor a la nube y sincronización pedida desde la plataforma (school-node/remote-sync.js). Lógica pura con red y relojes falsos: corre con cualquier Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteSync } from '../school-node/remote-sync.js';

function setup({ replies = [], online = true, syncStarts = true } = {}) {
  const sent = [];
  let handled = null;
  const syncs = [];
  const queue = [...replies];
  const rs = createRemoteSync({
    cloudUrl: 'https://x.supabase.co', nodeToken: 'tok', getStatus: () => ({ pending_changes: 2, syncing: false }),
    getHandled: () => handled, setHandled: (v) => { handled = v; },
    trySync: async (why) => { syncs.push(why); return { started: syncStarts }; },
    isOnline: () => online,
    fetchImpl: async (url, opts) => { sent.push([url, JSON.parse(opts.body), opts.headers['x-node-token']]); const r = queue.shift(); if (r instanceof Error) throw r; return r; },
    now: () => Date.parse('2026-11-05T15:00:00Z'),
  });
  return { rs, sent, syncs, get handled() { return handled; } };
}
const ok = (body) => ({ ok: true, json: async () => body });
const T0 = '2026-11-05T15:00:00.000Z';

test('avisa con el token y su estado, y si nadie pidió sincronizar no hace nada', async () => {
  const h = setup({ replies: [ok({ sync_requested_at: null, server_time: T0 })] });
  assert.equal(await h.rs.tick(), 'nada');
  assert.deepEqual(h.sent, [['https://x.supabase.co/functions/v1/node-sync', { action: 'node_ping', status: { pending_changes: 2, syncing: false } }, 'tok']]);
  assert.deepEqual(h.syncs, []);
});

test('el docente pidió sincronizar: el servidor sincroniza una vez; la misma petición no se repite, una nueva sí', async () => {
  const h = setup({ replies: [ok({ sync_requested_at: '2026-11-05T14:59:50.123456+00:00', server_time: T0 }), ok({ sync_requested_at: '2026-11-05T14:59:50.123456+00:00', server_time: T0 }), ok({ sync_requested_at: '2026-11-05T15:00:00+00:00', server_time: '2026-11-05T15:00:05Z' })] });
  assert.equal(await h.rs.tick(), 'sincronizando');
  assert.deepEqual(h.syncs, ['requested']);
  assert.equal(await h.rs.tick(), 'nada', 'ya atendida');
  assert.equal(await h.rs.tick(), 'sincronizando', 'otra petición posterior');
  assert.equal(h.syncs.length, 2);
});

test('si ya estaba sincronizando, la petición queda pendiente y se atiende en el siguiente aviso; una petición vieja no dispara nada', async () => {
  const req = { sync_requested_at: '2026-11-05T14:59:55Z', server_time: T0 };
  const busy = setup({ replies: [ok(req), ok(req)], syncStarts: false });
  assert.equal(await busy.rs.tick(), 'espera');
  assert.equal(busy.handled, null, 'sin atender: se reintenta');
  assert.equal(await busy.rs.tick(), 'espera');
  const stale = setup({ replies: [ok({ sync_requested_at: '2026-11-05T09:00:00Z', server_time: T0 })] });
  assert.equal(await stale.rs.tick(), 'vieja');
  assert.deepEqual(stale.syncs, []);
  assert.equal(stale.handled, '2026-11-05T09:00:00Z', 'se da por vista para no revisarla siempre');
});

test('sin internet no avisa; si la nube no responde o es una función vieja, sigue sin romperse', async () => {
  const off = setup({ online: false });
  assert.equal(await off.rs.tick(), 'sin-internet');
  assert.equal(off.sent.length, 0);
  for (const reply of [new Error('sin red'), { ok: false, status: 400, json: async () => ({}) }, ok({ error: 'x' })]) {
    const h = setup({ replies: [reply] });
    assert.ok(['sin-respuesta', 'nada'].includes(await h.rs.tick()));
    assert.deepEqual(h.syncs, []);
  }
  const none = createRemoteSync({ cloudUrl: '', nodeToken: 'x', getStatus: () => ({}), getHandled: () => null, setHandled() {}, trySync: async () => ({ started: true }) });
  assert.equal(await none.ping(), null, 'sin nube configurada no hay nada que avisar');
});
