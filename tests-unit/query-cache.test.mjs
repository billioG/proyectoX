// Caché de consultas del cliente (js/query-cache.js): vigencia (TTL), consultas compartidas e invalidación. Lógica pura: sin navegador ni IndexedDB.
// Y la revisión de que las optimizaciones de rendimiento (docs/PERFORMANCE.md) siguen puestas en el código.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createQueryCache } from '../js/query-cache.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function setup() {
  const store = new Map();
  let t = 1_000_000;
  const warnings = [];
  const cache = createQueryCache({
    readEntry: async (k) => store.get(k) ?? null,
    writeEntry: async (k, data) => { store.set(k, { data, timestamp: t }); },
    now: () => t,
    warn: (...a) => warnings.push(a.join(' ')),
  });
  return { cache, store, warnings, tick: (ms) => { t += ms; } };
}
const counting = (value, delay = 0) => { const fn = async () => { fn.calls++; if (delay) await new Promise((r) => setTimeout(r, delay)); return value; }; fn.calls = 0; return fn; };

test('sin ttlMs se comporta como siempre: muestra lo guardado (isFromCache=true) y SIEMPRE pide lo nuevo (false)', async () => {
  const { cache, store } = setup();
  store.set('k', { data: ['viejo'], timestamp: 1_000_000 });
  const calls = [];
  const fetcher = counting({ data: ['nuevo'], error: null });
  const out = await cache.fetchWithCache('k', fetcher, (d, fromCache) => calls.push([d, fromCache]));
  assert.deepEqual(out, ['nuevo']);
  assert.deepEqual(calls, [[['viejo'], true], [['nuevo'], false]]);
  assert.equal(fetcher.calls, 1);
  assert.deepEqual(store.get('k').data, ['nuevo'], 'lo nuevo queda guardado');
});

test('con ttlMs y lo guardado vigente: NO consulta al servidor y avisa como dato fresco', async () => {
  const { cache, store, tick } = setup();
  const fetcher = counting({ data: ['servidor'] });
  await cache.fetchWithCache('rank', fetcher, null, { ttlMs: 45_000 });
  assert.equal(fetcher.calls, 1);
  tick(44_000);
  const seen = [];
  const out = await cache.fetchWithCache('rank', fetcher, (d, c) => seen.push([d, c]), { ttlMs: 45_000 });
  assert.equal(fetcher.calls, 1, 'dentro de la vigencia no hay segunda consulta');
  assert.deepEqual(out, ['servidor']);
  assert.deepEqual(seen, [[['servidor'], false]], 'una sola llamada a onUpdate, como dato vigente');
  tick(2_000); // 46 s: vencido
  await cache.fetchWithCache('rank', counting({ data: ['otro'] }), null, { ttlMs: 45_000 });
  assert.deepEqual(store.get('rank').data, ['otro']);
});

test('lo vencido se muestra y se refresca; lo guardado en una sesión anterior también respeta la vigencia', async () => {
  const { cache, store, tick } = setup();
  store.set('k', { data: 'de-ayer', timestamp: 1_000_000 - 3_600_000 });
  const seen = [];
  const out = await cache.fetchWithCache('k', counting({ data: 'de-hoy' }), (d, c) => seen.push([d, c]), { ttlMs: 60_000 });
  assert.equal(out, 'de-hoy');
  assert.deepEqual(seen, [['de-ayer', true], ['de-hoy', false]]);
  tick(1000);
  // Una marca de tiempo ausente o rara nunca cuenta como vigente.
  for (const ts of [undefined, null, NaN, 'ayer', 2_000_000_000_000]) {
    store.set('raro', { data: 'x', timestamp: ts });
    const f = counting({ data: 'y' });
    await cache.fetchWithCache('raro', f, null, { ttlMs: 60_000 });
    assert.equal(f.calls, 1, `timestamp ${String(ts)} no debe tratarse como vigente`);
  }
});

test('invalidate(clave) y invalidate(prefijo) obligan a consultar aunque el ttl no haya vencido; después vuelve a servir de la caché', async () => {
  const { cache } = setup();
  const f = counting({ data: 1 });
  await cache.fetchWithCache('ranking_class_ESC1_Primero_A', f, null, { ttlMs: 60_000 });
  await cache.fetchWithCache('global_ranking_top_20', f, null, { ttlMs: 60_000 });
  assert.equal(f.calls, 2);
  await cache.fetchWithCache('global_ranking_top_20', f, null, { ttlMs: 60_000 });
  assert.equal(f.calls, 2, 'vigente');
  cache.invalidate('global_ranking');       // prefijo
  cache.invalidate('ranking_class_');       // prefijo de la otra
  await cache.fetchWithCache('global_ranking_top_20', f, null, { ttlMs: 60_000 });
  await cache.fetchWithCache('ranking_class_ESC1_Primero_A', f, null, { ttlMs: 60_000 });
  assert.equal(f.calls, 4, 'invalidadas: las dos fueron al servidor');
  await cache.fetchWithCache('global_ranking_top_20', f, null, { ttlMs: 60_000 });
  assert.equal(f.calls, 4, 'tras refrescar, vuelve a estar vigente');
  assert.equal(cache.invalidate(''), 0);
  // Una clave que esta sesión aún no leyó (dato de una sesión anterior) también se puede invalidar.
  cache.invalidate('nunca_vista');
  const g = counting({ data: 'z' });
  await cache.fetchWithCache('nunca_vista', g, null, { ttlMs: 60_000 });
  assert.equal(g.calls, 1);
});

test('dos pedidas iguales a la vez comparten UNA consulta y las dos reciben el resultado', async () => {
  const { cache } = setup();
  const f = counting({ data: { n: 7 } }, 30);
  const a = [], b = [];
  const [ra, rb] = await Promise.all([
    cache.fetchWithCache('mismo', f, (d, c) => a.push([d, c])),
    cache.fetchWithCache('mismo', f, (d, c) => b.push([d, c])),
  ]);
  assert.equal(f.calls, 1);
  assert.deepEqual(ra, { n: 7 });
  assert.deepEqual(rb, { n: 7 });
  assert.deepEqual(a, [[{ n: 7 }, false]]);
  assert.deepEqual(b, [[{ n: 7 }, false]]);
  assert.equal(cache._inflight.size, 0, 'no queda nada en vuelo');
  // Claves distintas no se mezclan.
  const g = counting({ data: 'otra' });
  await Promise.all([cache.fetchWithCache('a', f), cache.fetchWithCache('b', g)]);
  assert.equal(g.calls, 1);
});

test('fallo de red: devuelve lo guardado (o null) sin lanzar; un {error} de Supabase cuenta como fallo; y se puede reintentar', async () => {
  const { cache, store, warnings } = setup();
  store.set('k', { data: ['guardado'], timestamp: 1_000_000 });
  const seen = [];
  const out = await cache.fetchWithCache('k', async () => { throw new Error('sin internet'); }, (d, c) => seen.push([d, c]));
  assert.deepEqual(out, ['guardado']);
  assert.deepEqual(seen, [[['guardado'], true]], 'solo se avisó el dato guardado');
  assert.ok(warnings.some((w) => /sin internet/.test(w)));
  assert.equal(await cache.fetchWithCache('nuevo', async () => ({ data: null, error: new Error('403') })), null);
  assert.equal(cache._inflight.size, 0, 'un fallo no deja la consulta «en vuelo» para siempre');
  const ok = await cache.fetchWithCache('k', counting({ data: ['recuperado'] }));
  assert.deepEqual(ok, ['recuperado']);
});

test('una caché que falla al leer o escribir no rompe la pantalla', async () => {
  const warnings = [];
  const cache = createQueryCache({ readEntry: async () => { throw new Error('IndexedDB cerrada'); }, writeEntry: async () => { throw new Error('cuota'); }, warn: (...a) => warnings.push(a.join(' ')) });
  assert.deepEqual(await cache.fetchWithCache('k', async () => ({ data: [1] }), null, { ttlMs: 1000 }), [1]);
  assert.equal(warnings.length, 2);
});

test('lo falsy (null, 0 filas vacías) no se guarda como si fuera un dato; una lista vacía [] sí es un dato válido', async () => {
  const { cache, store } = setup();
  await cache.fetchWithCache('nulo', async () => ({ data: null }));
  assert.equal(store.has('nulo'), false);
  await cache.fetchWithCache('vacia', async () => ({ data: [] }));
  assert.deepEqual(store.get('vacia').data, []);
  // Una lista vacía guardada cuenta como vigente (no se vuelve a consultar dentro del ttl).
  const f = counting({ data: ['x'] });
  await cache.fetchWithCache('vacia', f, null, { ttlMs: 60_000 });
  assert.equal(f.calls, 0);
});

// ---- Las optimizaciones siguen puestas (si alguien las quita sin querer, esto avisa) ----
test('el Ranking, el top por XP y el campanita usan caché vigente / consultas en paralelo', () => {
  assert.match(read('js/ranking.js'), /ttlMs: 45_000/);
  assert.match(read('js/reactions.js'), /invalidateCache\?\.\('global_ranking'\)[\s\S]*invalidateCache\?\.\('ranking_class_'\)/, 'votar invalida el Ranking guardado');
  assert.match(read('js/gamification.js'), /ttlMs: 60_000/);
  const ann = read('js/announcements.js');
  assert.match(ann, /await Promise\.all\(\[[\s\S]*announcement_reads[\s\S]*getPendingChallengeCards\(\)/, 'las consultas del punto rojo van en paralelo');
  assert.match(ann, /UNREAD_MIN_GAP_MS = 15_000/);
  assert.equal((ann.match(/loadAnnouncementsUnreadCount\(\{ force: true \}\)/g) || []).length, 4, 'las 4 acciones que cambian el conteo fuerzan la actualización');
});

test('N+1 corregidos: resultados de duelos en una consulta, insignias en lote, asistencia y desempeño acotados al mes', () => {
  const duels = read('js/duels.js');
  const checkFn = duels.slice(duels.indexOf('window.checkDuelResults = async'), duels.indexOf('window.showDuelResultModal = function'));
  assert.match(checkFn, /\.in\('duel_id', completed\.map/);
  assert.equal((checkFn.match(/\.from\('student_duel_answers'\)/g) || []).length, 2, 'una lectura y una escritura (no una lectura por duelo)');
  const badges = read('js/badges.js');
  assert.match(badges, /async function awardBadges\(userId, badgeIds\)/);
  assert.doesNotMatch(badges, /for \(const (bId|badgeId) of (badgesToAward|badgesToCheck|teacherBadgesToAward)\)/);
  assert.match(badges, /await Promise\.all\(studentsToReward\.map/);
  const att = read('js/attendance-summary-view.js');
  assert.match(att, /\.gte\('date', first\)\.lt\('date', next\)/);
  assert.match(att, /window\.fetchAllRows\(buildAttendance\)/);
  assert.match(att, /\.order\('id'\)/, 'orden estable para paginar');
  const tpw = read('js/team-performance-widget.js');
  assert.match(tpw, /\.gte\('created_at', qStart\.toISOString\(\)\)/);
  assert.doesNotMatch(tpw, /from\('attendance'\)\.select\('teacher_id, date, status'\)/, 'ya no trae toda la asistencia');
  assert.match(read('js/projects.js'), /schools\(name, code\)/);
});
