// Verificador de la instalación (school-node/primera-sincronizacion.js): espera al servidor, hace la primera sincronización,
// espera a que baje todo y dice, en español, qué falta. Con un servidor y un reloj de mentira: corre con cualquier Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeStatus, runCheck } from '../school-node/primera-sincronizacion.js';

const OK = { node: true, rest: true, last_sync_at: '2026-11-02T10:00:00Z', pending_changes: 0, syncing: false, sync_error: null, pending: { files: 0, completions: 0 }, rest_missing: [] };
const status = (patch = {}) => ({ ...OK, ...patch, pending: { ...OK.pending, ...(patch.pending || {}) } });

test('estado listo: la app real activa, archivos bajados, nada por subir ni errores', () => {
  const r = describeStatus(status(), { hasToken: true });
  assert.equal(r.ready, true);
  assert.deepEqual(r.problems, []);
});

test('dice qué falta, con palabras claras', () => {
  const p = (patch, opts = { hasToken: true }) => describeStatus(status(patch), opts).problems.join(' | ');
  assert.match(p({ last_sync_at: null, rest: false }), /todavía no se sincronizó/i);
  assert.match(p({ rest: false, rest_missing: ['Primero A', 'Segundo B'] }), /Primero A, Segundo B.*contraseña de clase/i);
  assert.match(p({ pending: { files: 12 } }), /12 archivos/);
  assert.match(p({ pending: { files: 1 } }), /1 archivo\b/);
  assert.match(p({ sync_error: 'No hay internet en esta computadora todavía' }), /No hay internet/);
  assert.match(p({}, { hasToken: false }), /token/i);
  assert.equal(describeStatus(status({ syncing: true }), { hasToken: true }).busy, true);
  assert.equal(describeStatus(status({ rest: false, last_sync_at: '2026-11-02T10:00:00Z', rest_missing: [] }), { hasToken: true }).ready, false);
});

// ---- servidor de mentira ----
function fakeServer({ statuses, loginStatus = 200, syncStatus = 200 }) {
  const calls = [];
  let i = 0;
  const fetchFn = async (url, opts = {}) => {
    const path = new URL(url).pathname;
    calls.push(`${opts.method || 'GET'} ${path}`);
    const json = (code, body) => ({ ok: code >= 200 && code < 300, status: code, json: async () => body });
    if (path === '/api/node/status') {
      if (statuses === 'caido') throw new Error('ECONNREFUSED');
      const s = statuses[Math.min(i++, statuses.length - 1)];
      if (s instanceof Error) throw s;
      return json(200, s);
    }
    if (path === '/api/teacher/login') return json(loginStatus, loginStatus === 200 ? { token: 'T' } : { error: 'Código incorrecto' });
    if (path === '/api/teacher/sync-now') return json(syncStatus, { started: true });
    return json(404, {});
  };
  return { fetchFn, calls };
}
function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}
const run = (server, extra = {}) => {
  const c = clock();
  const lines = [];
  return runCheck({ fetchFn: server.fetchFn, config: { port: 80, teacherCode: '123456', nodeToken: 'x'.repeat(40) }, log: (l) => lines.push(l), now: c.now, sleep: c.sleep, ...extra }).then((r) => ({ ...r, lines, calls: server.calls }));
};

test('camino feliz: espera al servidor, sincroniza, espera a que termine y dice «todo listo»', async () => {
  const r = await run(fakeServer({ statuses: [status({ last_sync_at: null, rest: false }), status({ syncing: true, last_sync_at: null, rest: false }), status({ syncing: true, rest: false, pending: { files: 5 } }), status()] }));
  assert.equal(r.code, 0);
  assert.equal(r.ok, true);
  assert.ok(r.calls.includes('POST /api/teacher/login') && r.calls.includes('POST /api/teacher/sync-now'));
  assert.match(r.lines.join('\n'), /todo listo/i);
});

test('sin token de la escuela no intenta sincronizar y lo explica', async () => {
  const r = await run(fakeServer({ statuses: [status({ last_sync_at: null, rest: false })] }), { config: { port: 80, teacherCode: '123456', nodeToken: 'PEGAR_ACA_EL_TOKEN_QUE_DA_EL_PANEL_ADMIN' } });
  assert.equal(r.code, 2);
  assert.ok(!r.calls.includes('POST /api/teacher/sync-now'));
  assert.match(r.lines.join('\n'), /token/i);
});

test('si el servidor no arranca, termina con un mensaje claro y no se queda esperando para siempre', async () => {
  const r = await run(fakeServer({ statuses: 'caido' }), { startWaitMs: 30_000 });
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /no responde/i);
});

test('si una clase no tiene contraseña lo dice y NO espera hasta el tiempo máximo', async () => {
  const r = await run(fakeServer({ statuses: [status({ rest: false, last_sync_at: null }), status({ rest: false, rest_missing: ['Primero A'] })] }));
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /Primero A/);
  assert.match(r.lines.join('\n'), /contraseña de clase/i);
  assert.equal(r.waitedMs < 5 * 60_000, true);
});

test('si faltan archivos tras sincronizar, lo reintenta hasta 3 veces y luego dice cuántos faltan', async () => {
  const s = status({ pending: { files: 7 } });
  const server = fakeServer({ statuses: [s] });
  const r = await run(server);
  assert.equal(r.code, 1);
  assert.equal(server.calls.filter((c) => c === 'POST /api/teacher/sync-now').length, 3);
  assert.match(r.lines.join('\n'), /7 archivos/);
});

test('un error de sincronización (sin internet) se muestra con su explicación', async () => {
  const r = await run(fakeServer({ statuses: [status({ last_sync_at: null, rest: false, sync_error: 'No hay internet en esta computadora todavía' })] }));
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /No hay internet/);
});

test('el código de docente mal puesto se explica y no revienta', async () => {
  const r = await run(fakeServer({ statuses: [status({ last_sync_at: null, rest: false })], loginStatus: 401 }));
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /código de docente/i);
});

test('si sigue sincronizando al cumplirse el tiempo máximo, lo dice y no falla', async () => {
  const r = await run(fakeServer({ statuses: [status({ syncing: true, rest: false, last_sync_at: null })] }), { maxWaitMs: 60_000 });
  assert.equal(r.code, 1);
  assert.match(r.lines.join('\n'), /sigue sincronizando/i);
});
