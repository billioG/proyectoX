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

// ---------- repositorio dañado por un corte de luz ----------
// fs falso: un árbol { ruta: tamaño | 'link' } y un registro de lo que se borra / mueve.
function fakeFs(tree = {}) {
  const log = { unlinked: [], removed: [], renamed: [], copied: [], mkdtemp: [] };
  const norm = (p) => String(p).replace(/\\/g, '/');
  const dirent = (name, kind) => ({ name, isFile: () => kind === 'file', isDirectory: () => kind === 'dir', isSymbolicLink: () => kind === 'link' });
  const entries = {};
  for (const [file, size] of Object.entries(tree)) {
    const parts = norm(file).split('/').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const dir = `/${parts.slice(0, i).join('/')}`.replace(/\/$/, '') || '/';
      entries[dir] ??= new Map();
      entries[dir].set(parts[i], i === parts.length - 1 ? (size === 'link' ? 'link' : 'file') : 'dir');
    }
  }
  return {
    log,
    readdirSync: (dir) => { const m = entries[norm(dir)]; if (!m) throw new Error('ENOENT'); return [...m].map(([n, k]) => dirent(n, k)); },
    lstatSync: (f) => ({ size: tree[norm(f)] }),
    unlinkSync: (f) => { log.unlinked.push(norm(f)); },
    rmSync: (f) => { log.removed.push(norm(f)); },
    renameSync: (a, b) => { log.renamed.push([norm(a), norm(b)]); },
    cpSync: (a, b) => { log.copied.push([norm(a), norm(b)]); },
    mkdtempSync: (prefix) => { log.mkdtemp.push(norm(prefix)); return `${prefix}XYZ`; },
  };
}

// git falso con daño: cada paso del reparador se puede hacer fallar. El pull falla las veces indicadas y luego funciona.
function damagedGit({ pullErrors = ['error: object file .git/objects/24/212cc is empty'], fetchOk = true, headReadable = true, cloneOk = true, resetOk = true } = {}) {
  const calls = [];
  const pulls = [...pullErrors];
  const heads = ['aaa', 'bbb'];
  const run = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd !== 'git') return { ok: true, stdout: '' };
    if (args.includes('rev-parse')) return { ok: true, stdout: heads.shift() ?? 'bbb' };
    if (args.includes('status')) return { ok: true, stdout: '' };
    if (args.includes('pull')) { const e = pulls.shift(); return e ? { ok: false, stderr: e } : { ok: true, stdout: 'ok' }; }
    if (args.includes('fetch')) return fetchOk ? { ok: true, stdout: '' } : { ok: false, stderr: 'fatal: unable to access: Could not resolve host' };
    if (args.includes('cat-file')) return headReadable ? { ok: true, stdout: '' } : { ok: false, stderr: 'fatal: bad object HEAD' };
    if (args.includes('get-url')) return { ok: true, stdout: 'https://github.com/x/quetzal.git' };
    if (args.includes('clone')) return cloneOk ? { ok: true, stdout: '' } : { ok: false, stderr: 'fatal: unable to access' };
    if (args.includes('reset')) return resetOk ? { ok: true, stdout: '' } : { ok: false, stderr: 'fatal: reset' };
    return { ok: true, stdout: '' };
  };
  return { run, calls };
}
const has = (calls, ...words) => calls.some((c) => words.every((w) => c.includes(w)));
const idx = (calls, ...words) => calls.findIndex((c) => words.every((w) => c.includes(w)));

test('pull falla con «is empty»: se borran los archivos de 0 bytes de .git/objects, se hace fetch y el reintento funciona', async () => {
  const g = damagedGit();
  const f = fakeFs({
    '/app/.git/objects/24/212cc': 0, '/app/.git/objects/aa/ok1': 120, '/app/.git/objects/pack/p.pack': 0,
    '/app/.git/objects/bb/link': 'link', '/app/config.json': 0, '/app/data/db.json': 0,
  });
  const out = await createSelfUpdate({ appDir: '/app', run: g.run, readFile: () => 'igual', fsImpl: f }).update();
  assert.deepEqual(out, { ok: true, changed: true, from: 'aaa', to: 'bbb' });
  assert.deepEqual(f.log.unlinked.sort(), ['/app/.git/objects/24/212cc', '/app/.git/objects/pack/p.pack']);
  assert.equal(g.calls.filter((c) => c.includes('pull')).length, 2, 'un solo reintento');
  assert.ok(idx(g.calls, 'fetch', 'origin') > idx(g.calls, 'pull'), 'fetch después del primer pull');
  assert.ok(!has(g.calls, 'clone'), 'si el reintento funciona no reclona');
  assert.equal(f.log.removed.length, 0);
});

test('falla persistente y HEAD ilegible: clona en una carpeta temporal, reemplaza SOLO .git, restaura archivos y recalcula «to»', async () => {
  const g = damagedGit({ pullErrors: ['fatal: bad object HEAD', 'fatal: bad object HEAD'], headReadable: false });
  const f = fakeFs({ '/app/.git/objects/24/212cc': 0 });
  const out = await createSelfUpdate({ appDir: '/app', run: g.run, readFile: () => 'igual', fsImpl: f, tmpRoot: '/tmp' }).update();
  assert.deepEqual(out, { ok: true, changed: true, from: 'aaa', to: 'bbb' });
  const clone = g.calls.find((c) => c.includes('clone'));
  assert.ok(clone.includes('--quiet') && clone.includes('https://github.com/x/quetzal.git'));
  assert.ok(f.log.mkdtemp[0].startsWith('/tmp/'), 'temporal bajo os.tmpdir()');
  assert.ok(f.log.removed.includes('/app/.git'), 'se borra el .git dañado');
  assert.ok(f.log.renamed.some(([a, b]) => b === '/app/.git' && a.startsWith('/app/.git')), 'queda el .git nuevo');
  assert.ok(f.log.removed.some((p) => p.startsWith('/tmp/')), 'limpia el temporal');
  for (const p of [...f.log.removed, ...f.log.renamed.flat()]) assert.ok(!/config\.json|\/data/.test(p), `no toca ${p}`);
  assert.ok(idx(g.calls, 'reset', '--hard', 'HEAD') > idx(g.calls, 'clone'), 'reset tras reclonar');
  assert.equal(g.calls.filter((c) => c.includes('pull')).length, 2, 'tras reclonar no se hace otro pull');
});

test('reclonado en otro disco: si rename falla copia el .git y el reemplazo igual se completa', async () => {
  const g = damagedGit({ pullErrors: ['fatal: bad object HEAD', 'fatal: bad object HEAD'], headReadable: false });
  const f = fakeFs();
  const real = f.renameSync;
  f.renameSync = (a, b) => { if (String(a).replace(/\\/g, '/').startsWith('/tmp/')) { const e = new Error('EXDEV'); e.code = 'EXDEV'; throw e; } real(a, b); };
  const out = await createSelfUpdate({ appDir: '/app', run: g.run, readFile: () => 'igual', fsImpl: f, tmpRoot: '/tmp' }).update();
  assert.equal(out.ok, true);
  assert.equal(f.log.copied.length, 1);
  assert.ok(f.log.renamed.some(([, b]) => b === '/app/.git'));
});

test('falla persistente pero HEAD legible: no reclona; devuelve el error en español diciendo que se intentó reparar', async () => {
  const g = damagedGit({ pullErrors: ['fatal: fetch-pack: invalid index-pack output', 'fatal: fetch-pack: invalid index-pack output'], headReadable: true });
  const f = fakeFs();
  const out = await createSelfUpdate({ appDir: '/app', run: g.run, readFile: () => '', fsImpl: f }).update();
  assert.equal(out.ok, false);
  assert.equal(out.changed, false);
  assert.equal(out.from, 'aaa');
  assert.match(out.error, /dañado.*se intentó repararlo/);
  assert.match(out.error, /invalid index-pack/);
  assert.ok(!has(g.calls, 'clone'));
  assert.equal(f.log.removed.length, 0, 'no se borra nada');
});

test('reclonado que falla (sin red): error claro y .git intacto', async () => {
  const g = damagedGit({ pullErrors: ['fatal: bad object HEAD', 'fatal: bad object HEAD'], headReadable: false, cloneOk: false });
  const f = fakeFs();
  const out = await createSelfUpdate({ appDir: '/app', run: g.run, readFile: () => '', fsImpl: f, tmpRoot: '/tmp' }).update();
  assert.equal(out.ok, false);
  assert.match(out.error, /se intentó repararlo.*clonar/);
  assert.ok(!f.log.removed.includes('/app/.git'), 'no se borra el .git si no hay copia nueva');
  assert.ok(f.log.removed.some((p) => p.startsWith('/tmp/')), 'limpia el temporal aunque falle');
});

test('error no relacionado con daño (sin red): NO intenta reparar y devuelve el error de siempre', async () => {
  const g = damagedGit({ pullErrors: ['fatal: unable to access: Could not resolve host: github.com'] });
  const f = fakeFs({ '/app/.git/objects/24/212cc': 0 });
  const out = await createSelfUpdate({ appDir: '/app', run: g.run, readFile: () => '', fsImpl: f }).update();
  assert.equal(out.ok, false);
  assert.match(out.error, /^No se pudo descargar la versión nueva: .*Could not resolve host/);
  assert.ok(!has(g.calls, 'fetch') && !has(g.calls, 'clone') && !has(g.calls, 'cat-file'));
  assert.equal(f.log.unlinked.length, 0);
  assert.equal(g.calls.filter((c) => c.includes('pull')).length, 1);
});

test('cada patrón de daño dispara la reparación', async () => {
  for (const msg of ['error: object file .git/objects/24/x is empty', 'fatal: bad object HEAD', 'fatal: cannot read existing object info', 'fatal: fetch-pack: invalid index-pack output', 'error: loose object abc is corrupt']) {
    const g = damagedGit({ pullErrors: [msg] });
    const out = await createSelfUpdate({ appDir: '/app', run: g.run, readFile: () => 'igual', fsImpl: fakeFs() }).update();
    assert.equal(out.ok, true, msg);
    assert.ok(has(g.calls, 'fetch'), msg);
  }
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
