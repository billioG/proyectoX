// Actualizar el servidor desde la plataforma (school-node/self-update.js) y la petición que llega por el aviso (school-node/remote-sync.js).
// Comandos y relojes falsos: corre con cualquier Node, sin git ni red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelfUpdate } from '../school-node/self-update.js';
import { createRemoteSync } from '../school-node/remote-sync.js';

// Un git falso: cada llamada a «rev-parse» devuelve el siguiente hash de la lista.
function fakeGit({ heads = ['aaa', 'bbb'], pullOk = true, npmOk = true, isRepo = true, dirty = '', stashOk = true } = {}) {
  const calls = [];
  const queue = [...heads];
  const run = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'git' && args.includes('rev-parse')) return isRepo ? { ok: true, stdout: queue.shift() ?? heads.at(-1) } : { ok: false, stdout: '', stderr: 'fatal: not a git repository' };
    if (cmd === 'git' && args.includes('status')) return { ok: true, stdout: dirty };
    if (cmd === 'git' && args.includes('stash')) return stashOk ? { ok: true, stdout: 'Saved' } : { ok: false, stderr: 'fatal: no se pudo' };
    if (cmd === 'git' && args.includes('pull')) return pullOk ? { ok: true, stdout: 'ok' } : { ok: false, stderr: 'fatal: Not possible to fast-forward' };
    if (/^npm/.test(cmd)) return npmOk ? { ok: true, stdout: '' } : { ok: false, stderr: 'npm ERR! build failed' };
    return { ok: true, stdout: '' };
  };
  return { run, calls };
}
const files = (before, after) => { let n = 0; return () => (n++ < 2 ? before : after); }; // package.json + package-lock.json se leen antes y después

test('hay versión nueva: descarga y avisa que cambió (para que el servicio se reinicie)', async () => {
  const g = fakeGit();
  const out = await createSelfUpdate({ appDir: '/app', run: g.run, readFile: () => 'igual' }).update();
  assert.deepEqual(out, { ok: true, changed: true, from: 'aaa', to: 'bbb' });
  assert.ok(g.calls.some((c) => c.includes('--ff-only')), 'solo avanza, nunca pisa');
  assert.ok(!g.calls.some((c) => /^npm/.test(c[0])), 'sin cambios de dependencias no corre npm');
});

test('ya está en la última versión: no hay nada que reiniciar', async () => {
  const g = fakeGit({ heads: ['aaa', 'aaa'] });
  const out = await createSelfUpdate({ appDir: '/app', run: g.run, readFile: () => 'igual' }).update();
  assert.deepEqual(out, { ok: true, changed: false, from: 'aaa', to: 'aaa' });
});

test('si cambiaron las dependencias corre npm ci; si npm falla vuelve a la versión anterior y lo dice', async () => {
  const good = fakeGit();
  const a = await createSelfUpdate({ appDir: '/app', run: good.run, readFile: files('v1', 'v2') }).update();
  assert.equal(a.ok, true);
  assert.ok(good.calls.some((c) => c[0].startsWith('npm') && c.includes('ci') && c.includes('--omit=dev')));

  const bad = fakeGit({ npmOk: false });
  const b = await createSelfUpdate({ appDir: '/app', run: bad.run, readFile: files('v1', 'v2') }).update();
  assert.equal(b.ok, false);
  assert.equal(b.changed, false);
  assert.match(b.error, /dependencias.*versión anterior/);
  assert.ok(bad.calls.some((c) => c.includes('reset') && c.includes('--hard') && c.includes('aaa')), 'regresa al commit que funcionaba');
});

test('fallos claros: git pull rechazado o servidor que no se instaló con git', async () => {
  const pull = await createSelfUpdate({ appDir: '/app', run: fakeGit({ pullOk: false }).run, readFile: () => '' }).update();
  assert.equal(pull.ok, false);
  assert.match(pull.error, /No se pudo descargar/);
  const nogit = await createSelfUpdate({ appDir: '/app', run: fakeGit({ isRepo: false }).run, readFile: () => '' }).update();
  assert.equal(nogit.ok, false);
  assert.match(nogit.error, /install\.sh --update/);
});

test('archivos del programa modificados en el servidor: se guardan aparte (stash) ANTES de descargar, y la actualización sigue', async () => {
  const g = fakeGit({ dirty: ' M school-node/package-lock.json' });
  const out = await createSelfUpdate({ appDir: '/app', run: g.run, readFile: () => 'igual' }).update();
  assert.deepEqual(out, { ok: true, changed: true, from: 'aaa', to: 'bbb' });
  const stash = g.calls.findIndex((c) => c.includes('stash') && c.includes('push'));
  const pull = g.calls.findIndex((c) => c.includes('pull'));
  assert.ok(stash >= 0 && stash < pull, 'primero guarda, luego descarga');
  assert.ok(!g.calls.some((c) => c.includes('reset') && c.includes('--hard') && !c.includes('aaa')), 'nada se borra a la fuerza');
  const clean = fakeGit();
  await createSelfUpdate({ appDir: '/app', run: clean.run, readFile: () => 'igual' }).update();
  assert.ok(!clean.calls.some((c) => c.includes('stash')), 'sin cambios locales no toca nada');
  const noSave = await createSelfUpdate({ appDir: '/app', run: fakeGit({ dirty: ' M x', stashOk: false }).run, readFile: () => '' }).update();
  assert.equal(noSave.ok, false);
  assert.match(noSave.error, /cambios locales/);
});

// ---------- la petición que llega por el aviso ----------
const T0 = '2026-11-07T15:00:00.000Z';
const ok = (body) => ({ ok: true, json: async () => body });
function setup({ replies, busy = false, updaterStarts = true } = {}) {
  const queue = [...replies];
  const state = { updates: 0, syncs: 0, handledUpdate: null };
  const rs = createRemoteSync({
    cloudUrl: 'https://x.supabase.co', nodeToken: 't', getStatus: () => ({}), getHandled: () => null, setHandled: () => {},
    trySync: async () => { state.syncs++; return { started: true }; },
    updater: async () => { state.updates++; return { started: updaterStarts }; }, isBusy: () => busy,
    getHandledUpdate: () => state.handledUpdate, setHandledUpdate: (v) => { state.handledUpdate = v; },
    fetchImpl: async () => queue.shift(), now: () => Date.parse(T0),
  });
  return { rs, state };
}

test('el administrador pidió actualizar: el servidor se actualiza una vez; la misma petición no se repite al reiniciar', async () => {
  const req = '2026-11-07T14:59:50.000+00:00';
  const h = setup({ replies: [ok({ update_requested_at: req, server_time: T0 }), ok({ update_requested_at: req, server_time: T0 })] });
  assert.equal(await h.rs.tick(), 'actualizando');
  assert.equal(h.state.updates, 1);
  assert.equal(h.state.handledUpdate, req, 'se anota antes de actualizar');
  assert.equal(await h.rs.tick(), 'nada');
  assert.equal(h.state.updates, 1);
});

test('no se actualiza a mitad de una sincronización, ni por una petición vieja (servidor que estuvo apagado)', async () => {
  const busy = setup({ busy: true, replies: [ok({ update_requested_at: '2026-11-07T14:59:50.000Z', server_time: T0 })] });
  assert.equal(await busy.rs.tick(), 'espera');
  assert.equal(busy.state.updates, 0);
  assert.equal(busy.state.handledUpdate, null, 'queda pendiente para el siguiente aviso');

  const old = setup({ replies: [ok({ update_requested_at: '2026-11-07T14:00:00.000Z', server_time: T0 })] });
  assert.notEqual(await old.rs.tick(), 'actualizando');
  assert.equal(old.state.updates, 0);
});

test('un servidor sin esta función (sin updater) ignora la petición y sigue sincronizando como siempre', async () => {
  let syncs = 0;
  const rs = createRemoteSync({
    cloudUrl: 'https://x.supabase.co', nodeToken: 't', getStatus: () => ({}), getHandled: () => null, setHandled: () => {},
    trySync: async () => { syncs++; return { started: true }; },
    fetchImpl: async () => ok({ update_requested_at: '2026-11-07T14:59:50.000Z', sync_requested_at: '2026-11-07T14:59:55.000Z', server_time: T0 }), now: () => Date.parse(T0),
  });
  assert.equal(await rs.tick(), 'sincronizando');
  assert.equal(syncs, 1);
});
