// Detección de internet y sincronización al conectar (school-node/connectivity.js). Lógica pura con relojes y redes falsas: corre con cualquier Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkInternet, createConnectivity, reasonOf, REASONS } from '../school-node/connectivity.js';

const err = (code, name = 'TypeError') => Object.assign(new Error('fetch failed'), { name, cause: { code } });

test('motivos en español: sin DNS, sin respuesta, sin salida, rechazo, certificado y desconocido', () => {
  assert.equal(reasonOf(err('ENOTFOUND')), REASONS.dns);
  assert.equal(reasonOf(err('EAI_AGAIN')), REASONS.dns);
  assert.equal(reasonOf(Object.assign(new Error('x'), { name: 'TimeoutError' })), REASONS.timeout);
  assert.equal(reasonOf(err('UND_ERR_CONNECT_TIMEOUT')), REASONS.timeout);
  assert.equal(reasonOf(err('ENETUNREACH')), REASONS.unreachable);
  assert.equal(reasonOf(err('EHOSTUNREACH')), REASONS.unreachable);
  assert.equal(reasonOf(err('ECONNREFUSED')), REASONS.refused);
  assert.equal(reasonOf(err('CERT_HAS_EXPIRED')), REASONS.tls);
  assert.equal(reasonOf(new Error('otra cosa')), REASONS.other);
});

test('hay internet con cualquier respuesta de la nube (aunque sea 401 o 404), y reintenta antes de decir que no', async () => {
  const calls = [];
  const ok = await checkInternet('https://x.supabase.co', { fetchImpl: async (u, o) => { calls.push([u, o.method]); return { status: 404 }; } });
  assert.deepEqual(ok, { online: true, detail: null });
  assert.deepEqual(calls, [['https://x.supabase.co', 'GET']]);
  let n = 0;
  const flaky = await checkInternet('https://x.supabase.co', { tries: 3, fetchImpl: async () => { n++; if (n < 3) throw err('ETIMEDOUT'); return { status: 200 }; } });
  assert.equal(flaky.online, true);
  assert.equal(n, 3);
  const down = await checkInternet('https://x.supabase.co', { tries: 2, fetchImpl: async () => { throw err('ENOTFOUND'); } });
  assert.deepEqual(down, { online: false, detail: REASONS.dns });
  assert.equal(await checkInternet('', {}), null, 'sin dirección de la nube no hay nada que comprobar');
});

test('al pasar de sin internet a con internet arranca la sincronización una vez; con internet sostenido no repite; si se corta y vuelve, otra vez (con espera mínima)', async () => {
  let t = 1_000_000;
  const results = [{ online: false, detail: 'x' }, { online: false, detail: 'x' }, { online: true }, { online: true }, { online: false, detail: 'y' }, { online: true }, { online: false, detail: 'z' }, { online: true }];
  const triggers = [];
  const c = createConnectivity({ check: async () => results.shift(), onOnline: (why) => triggers.push([why, t]), now: () => t, minGapMs: 60_000 });
  const step = async (ms) => { t += ms; return c.tick(); };
  await step(0); await step(15_000);
  assert.deepEqual([c.state.online, triggers.length], [false, 0]);
  await step(15_000);
  assert.deepEqual(triggers.map((x) => x[0]), ['reconnect'], 'conectó el cable o la Wi-Fi: sincroniza');
  await step(15_000);
  assert.equal(triggers.length, 1, 'internet sostenido: no repite');
  await step(15_000); // se cortó
  assert.equal(c.state.online, false);
  assert.equal(c.state.detail, 'y');
  await step(15_000); // volvió pero hace menos de un minuto del último arranque: espera
  assert.equal(triggers.length, 1, 'no martilla a la nube');
  await step(15_000); await step(120_000);
  assert.deepEqual(triggers.map((x) => x[0]), ['reconnect', 'reconnect']);
});

test('la primera vez que se ve internet al arrancar también sincroniza; sin nube configurada no hace nada; una revisión lenta no se encima', async () => {
  const first = [];
  const c1 = createConnectivity({ check: async () => ({ online: true }), onOnline: (w) => first.push(w) });
  await c1.tick(); await c1.tick();
  assert.deepEqual(first, ['first']);
  const none = createConnectivity({ check: async () => null, onOnline: () => assert.fail('no debe sincronizar') });
  await none.tick();
  assert.equal(none.state.online, null);
  let release; let started = 0;
  const slow = createConnectivity({ check: () => new Promise((r) => { started++; release = () => r({ online: false, detail: 'lento' }); }) });
  const a = slow.tick(); const b = slow.tick();
  assert.equal(started, 1, 'la segunda revisión espera a la primera');
  release(); await a; await b;
  assert.equal(slow.state.online, false);
  // Si la sincronización falla, la revisión sigue viva.
  const boom = createConnectivity({ check: async () => ({ online: true }), onOnline: () => { throw new Error('falló'); } });
  assert.equal((await boom.tick()).online, true);
});
