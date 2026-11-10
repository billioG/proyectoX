// supabase/functions/_shared/rate-limit.ts (lógica pura + la llamada a la base simulada) y su uso en las funciones notify-*.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseLimit, parseTake, classifyRpcError, rateLimitedResponse, enforceRate } from '../supabase/functions/_shared/rate-limit.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('parseLimit: solo enteros positivos; lo demás cae al valor por defecto; nunca pasa del máximo', () => {
  assert.equal(parseLimit(undefined, 60), 60);
  assert.equal(parseLimit('', 60), 60);
  assert.equal(parseLimit('25', 60), 25);
  assert.equal(parseLimit(' 7 ', 60), 7);
  for (const bad of ['0', '-3', '2.5', 'abc', 'NaN']) assert.equal(parseLimit(bad, 60), 60, bad);
  assert.equal(parseLimit('999999999', 60), 100000);
  assert.equal(parseLimit('50', 60, 40), 40);
});

test('parseTake y classifyRpcError', () => {
  assert.deepEqual(parseTake([{ allowed: true, calls: 2, remaining: 8, retry_after: 0 }]), { allowed: true, calls: 2, remaining: 8, retryAfter: 0 });
  assert.deepEqual(parseTake({ allowed: false, calls: 10, remaining: 0, retry_after: 42 }), { allowed: false, calls: 10, remaining: 0, retryAfter: 42 });
  assert.equal(parseTake(null), null);
  assert.equal(parseTake([{ calls: 1 }]), null, 'sin «allowed» no es válido');
  assert.equal(classifyRpcError(null), 'ok');
  assert.equal(classifyRpcError({ code: 'PGRST202', message: 'Could not find the function public.rate_limit_take' }), 'missing');
  assert.equal(classifyRpcError({ code: '42883', message: 'function does not exist' }), 'missing');
  assert.equal(classifyRpcError({ code: '57014', message: 'timeout' }), 'fatal');
});

test('rateLimitedResponse: 429 con { error, code } en español y Retry-After', async () => {
  const res = rateLimitedResponse(30, { 'Access-Control-Allow-Origin': 'https://clases.yoaprendo.online' }, 'avisos de retos');
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Retry-After'), '30');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://clases.yoaprendo.online');
  const body = await res.json();
  assert.equal(body.code, 'rate_limited');
  assert.match(body.error, /Demasiados avisos de retos seguidos\. Espera 30 segundos/);
  assert.match(await rateLimitedResponse(600).json().then((b) => b.error), /10 minutos/);
});

const fakeAdmin = (reply) => ({ calls: [], rpc(fn, args) { this.calls.push([fn, args]); return Promise.resolve(typeof reply === 'function' ? reply(args) : reply); } });

test('enforceRate: deja pasar bajo el tope, devuelve 429 al pasarse, y manda los parámetros correctos', async () => {
  const ok = fakeAdmin({ data: [{ allowed: true, calls: 1, remaining: 59, retry_after: 0 }], error: null });
  assert.equal(await enforceRate(ok, 'u1', 'notify-duel', 60, 3600), null);
  assert.deepEqual(ok.calls[0], ['rate_limit_take', { p_user: 'u1', p_key: 'notify-duel', p_limit: 60, p_window_seconds: 3600 }]);
  const no = fakeAdmin({ data: [{ allowed: false, calls: 60, remaining: 0, retry_after: 90 }], error: null });
  const res = await enforceRate(no, 'u1', 'notify-duel', 60, 3600, { 'X-Test': '1' });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('X-Test'), '1');
});

test('enforceRate: si falta la migración deja pasar; si la base falla, avisos dejan pasar y los SMS (failOpen:false) devuelven 503', async () => {
  const warn = console.warn, err = console.error; console.warn = () => {}; console.error = () => {};
  try {
    const missing = fakeAdmin({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    assert.equal(await enforceRate(missing, 'u1', 'k', 5, 60), null, 'sin migración: no rompe nada');
    assert.equal(await enforceRate(missing, 'u1', 'k', 5, 60, {}, { failOpen: false }), null, 'ni siquiera en modo estricto');
    const down = fakeAdmin({ data: null, error: { code: '57014', message: 'canceling statement' } });
    assert.equal(await enforceRate(down, 'u1', 'k', 5, 60), null, 'push: se deja pasar');
    const strict = await enforceRate(down, 'u1', 'k', 5, 60, { 'X-Test': '1' }, { failOpen: false });
    assert.equal(strict.status, 503);
    assert.equal((await strict.json()).code, 'rate_unavailable');
    const garbage = fakeAdmin({ data: [{ nada: 1 }], error: null });
    assert.equal((await enforceRate(garbage, 'u1', 'k', 5, 60, {}, { failOpen: false })).status, 503, 'respuesta rara = no se pudo contar');
  } finally { console.warn = warn; console.error = err; }
});

test('las 5 funciones notify-* usan el límite justo después de validar la sesión (y antes de tocar datos)', () => {
  const funcs = { 'notify-duel': 'RATE_NOTIFY_DUEL_PER_HOUR', 'notify-announcement': 'RATE_NOTIFY_ANNOUNCEMENT_PER_HOUR', 'notify-rock-pending': 'RATE_NOTIFY_ROCK_PER_HOUR', 'notify-reaction': 'RATE_NOTIFY_REACTION_PER_HOUR', 'notify-guardians': 'RATE_NOTIFY_GUARDIANS_PER_HOUR' };
  for (const [name, env] of Object.entries(funcs)) {
    const src = read(`supabase/functions/${name}/index.ts`);
    assert.match(src, /from '\.\.\/_shared\/rate-limit\.ts'/, `${name} importa el módulo`);
    assert.ok(src.includes(`'${name}', parseLimit(Deno.env.get('${env}')`), `${name}: tope por persona con su variable ${env}`);
    const iAuth = src.indexOf("if (authErr || !caller) return json({ error: 'Invalid token' }, 401);");
    const iRate = src.indexOf('enforceRate(');
    const iData = Math.min(...['req.json()', ".from('"].map((t) => { const i = src.indexOf(t, iAuth); return i < 0 ? Infinity : i; }));
    assert.ok(iAuth > 0 && iRate > iAuth && iRate < iData, `${name}: el límite va entre la sesión y el primer acceso a datos`);
  }
  assert.match(read('supabase/functions/notify-guardians/index.ts'), /failOpen: false/, 'los SMS cuestan dinero: sin contador no se envía');
  assert.match(read('supabase/functions/notify-duel/index.ts'), /notify-duel:\$\{duel_id\}:\$\{type\}/, 'tope por reto y tipo');
  assert.match(read('supabase/functions/notify-announcement/index.ts'), /notify-announcement:\$\{announcement_id\}/, 'tope por aviso');
});
