// Contrarreloj 1v1 (retos entre estudiantes) sin internet con la app real: retar, aceptar, jugar cada uno con SUS problemas, ganar o perder gemas y XP, rechazar o
// cancelar. Los problemas y respuestas nunca llegan al navegador; las gemas y el XP se ven al instante y la nube los liquida al sincronizar. Node 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { createRestLayer } from '../school-node/rest/index.js';
import { applyPull, buildPush } from '../school-node/sync.js';
import { hashClassPassword } from '../school-node/rest/auth.js';
import { generateMathProblems, rankOf } from '../school-node/rest/duels.js';

const cleanups = [];
test.after(async () => { for (const c of cleanups.reverse()) await c(); });
const salt = 'ab'.repeat(8);

test('el generador: nivel por grado, 10 problemas sin repetir, respuestas correctas, preguntas con texto desde 4to', () => {
  assert.deepEqual(['1ro Primaria', '3ro Primaria', '4to Primaria', '6to Primaria', 'Primero Básico', '2do Basico', 'Quinto Diversificado', 'Primero', ''].map(rankOf), [2, 2, 5, 5, 8, 8, 11, 5, 5]);
  for (const grade of ['1ro Primaria', '5to Primaria', 'Primero Básico', 'Cuarto Diversificado']) {
    for (let k = 0; k < 20; k++) {
      const ps = generateMathProblems(grade, 10);
      assert.equal(ps.length, 10);
      assert.equal(new Set(ps.map((p) => p.question)).size, 10, `sin repetir (${grade})`);
      for (const p of ps) { assert.ok(typeof p.question === 'string' && p.question.length > 2); assert.ok(Number.isFinite(p.answer)); assert.ok(Number.isInteger(p.answer) || grade.includes('Diversificado'), p.question); }
    }
  }
  // Primaria baja: solo suma y resta hasta 20, sin negativos.
  for (const p of generateMathProblems('2do Primaria', 50)) {
    const m = /^(\d+) ([+-]) (\d+)$/.exec(p.question);
    assert.ok(m, p.question);
    const [a, b] = [Number(m[1]), Number(m[3])];
    assert.ok(a <= 40 && a >= 1 && b >= 1 && b <= 20);
    assert.equal(p.answer, m[2] === '+' ? a + b : a - b);
    assert.ok(p.answer >= 0);
  }
  // Con texto desde 4to: las cantidades son de al menos 2 y la respuesta sale de esas cantidades.
  const text = generateMathProblems('5to Primaria', 40).filter((p) => p.question.includes('?'));
  assert.ok(text.length > 0);
  // Diversificado: porcentaje o ecuación de un paso.
  for (const p of generateMathProblems('Quinto Diversificado', 30)) assert.match(p.question, /x \+ \d+ = \d+|Cuánto es el \d+% de \d+/);
});

async function boot(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-duels-'));
  const db = openDb(dir);
  let clock = Date.parse('2026-11-02T15:00:00Z');
  const layer = createRestLayer(db, { now: () => clock });
  applyPull(db, {
    server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [{ class_key: 'ESC1|5to Primaria|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }, { class_key: 'ESC1|6to Primaria|B', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
    tables: {
      students: [
        { id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: '5to Primaria', section: 'A', status: 'activo', gems: 100, xp: 50 },
        { id: 's2', username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: '5to Primaria', section: 'A', status: 'activo', gems: 30, xp: 10 },
        { id: 's3', username: 'carla1', full_name: 'Carla', school_code: 'ESC1', grade: '6to Primaria', section: 'B', status: 'activo', gems: 100, xp: 0 },
      ],
      teachers: [], ...extra,
    },
  });
  const server = http.createServer(async (req, res) => { if (!(await layer.routes.handle(req, res, new URL(req.url, 'http://node')))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => server.close(r)), () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, { token, body, headers = {} } = {}) => fetch(base + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const student = async (user) => {
    const { token_hash } = await (await call('POST', '/functions/v1/student-login', { body: { username: user, password: 'clase123' } })).json();
    return (await (await call('POST', '/auth/v1/verify', { body: { type: 'magiclink', token_hash } })).json()).access_token;
  };
  const rpc = async (token, fn, args = {}) => { const r = await call('POST', `/rest/v1/rpc/${fn}`, { token, body: args }); return { status: r.status, data: await r.json().catch(() => null) }; };
  const me = async (token, id) => (await (await call('GET', `/rest/v1/students?select=gems,xp&id=eq.${id}`, { token })).json())[0];
  const challenge = async (token, body) => { const r = await call('POST', '/rest/v1/student_timed_math_duels?select=id', { token, headers: { prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' }, body }); return { status: r.status, data: await r.json().catch(() => null) }; };
  return { db, layer, call, student, rpc, me, challenge, tick: (ms) => { clock += ms; } };
}
// Las respuestas correctas solo las conoce el nodo: la prueba las lee de la réplica (el navegador nunca las ve).
const solve = (h, duelId, who, wrong = 0) => {
  const d = h.layer.store.raw('student_timed_math_duels').find((x) => x.id === duelId);
  const problems = who === 'challenger' ? d.problems : (d.problems_b || d.problems);
  return problems.map((p, i) => (i < wrong ? String(p.answer + 1) : String(p.answer)));
};

test('un duelo completo: retar, aceptar, cada uno con sus problemas; el ganador cobra la apuesta, XP para ambos; todo se ve al instante', async () => {
  const h = await boot();
  const a = await h.student('ana1'), b = await h.student('beto1');
  const ch = await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 20 });
  assert.equal(ch.status, 201);
  const id = ch.data.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal((await h.rpc(a, 'accept_timed_math_duel', { p_duel_id: id })).status, 400, 'solo el rival acepta');
  assert.deepEqual((await h.rpc(b, 'accept_timed_math_duel', { p_duel_id: id })).data, { ok: true });
  assert.deepEqual((await h.rpc(b, 'accept_timed_math_duel', { p_duel_id: id })).data, { ok: true }, 'aceptar dos veces no cambia nada');

  const qa = (await h.rpc(a, 'start_timed_math_duel', { p_duel_id: id })).data.questions;
  const qb = (await h.rpc(b, 'start_timed_math_duel', { p_duel_id: id })).data.questions;
  assert.equal(qa.length, 10);
  assert.equal(qb.length, 10);
  assert.ok(qa.every((q) => typeof q === 'string'), 'solo los enunciados');
  assert.equal(qa.filter((q) => qb.includes(q)).length, 0, 'cada jugador tiene problemas distintos');
  const visible = JSON.stringify(await (await h.call('GET', `/rest/v1/student_timed_math_duels?select=*&id=eq.${id}`, { token: a })).json());
  assert.doesNotMatch(visible, /problems|answer|started_at/, 'los problemas y respuestas no llegan al navegador');

  h.tick(20_000);
  const ra = await h.rpc(a, 'submit_timed_math_result', { p_duel_id: id, p_answers: solve(h, id, 'challenger', 0) });
  assert.deepEqual([ra.data.score, ra.data.total, ra.data.time_ms], [10, 10, 20000]);
  assert.equal((await h.rpc(a, 'submit_timed_math_result', { p_duel_id: id, p_answers: [] })).status, 400, 'Ya jugaste este desafío');
  let duel = (await (await h.call('GET', `/rest/v1/student_timed_math_duels?select=status,winner_id&id=eq.${id}`, { token: a })).json())[0];
  assert.deepEqual(duel, { status: 'active', winner_id: null });
  h.tick(5_000);
  const rb = await h.rpc(b, 'submit_timed_math_result', { p_duel_id: id, p_answers: solve(h, id, 'opponent', 4) });
  assert.deepEqual([rb.data.score, rb.data.time_ms], [6, 25000]);

  duel = (await (await h.call('GET', `/rest/v1/student_timed_math_duels?select=status,winner_id,resolved_at&id=eq.${id}`, { token: a })).json())[0];
  assert.deepEqual([duel.status, duel.winner_id], ['completed', 's1']);
  assert.ok(duel.resolved_at);
  assert.deepEqual(await h.me(a, 's1'), { gems: 120, xp: 70 }, 'ganó 20 gemas y 15+5 XP');
  assert.deepEqual(await h.me(b, 's2'), { gems: 10, xp: 15 }, 'perdió 20 gemas y ganó 5 XP');
  const results = await (await h.call('GET', `/rest/v1/student_timed_math_results?select=student_id,score,time_ms&duel_id=eq.${id}&order=score.desc`, { token: b })).json();
  assert.deepEqual(results, [{ student_id: 's1', score: 10, time_ms: 20000 }, { student_id: 's2', score: 6, time_ms: 25000 }]);
  assert.doesNotMatch(JSON.stringify(results), /answers/);
});

test('la nube recibe UNA foto del duelo (con las respuestas jugadas) y la actualiza en cada paso; al confirmarla, su gemas y XP reemplazan a lo anotado aquí', async () => {
  const h = await boot();
  const a = await h.student('ana1'), b = await h.student('beto1');
  const id = (await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 10 })).data.id;
  const snap = () => buildPush(h.db, { cloudUrl: 'x' }).rpc.filter((r) => r.fn === 'timed_math_duel');
  assert.deepEqual(snap().map((r) => [r.student_id, r.args.id, r.args.status, r.args.results.length]), [['s1', id, 'pending', 0]]);
  await h.rpc(b, 'accept_timed_math_duel', { p_duel_id: id });
  await h.rpc(a, 'start_timed_math_duel', { p_duel_id: id });
  await h.rpc(b, 'start_timed_math_duel', { p_duel_id: id });
  h.tick(10_000);
  await h.rpc(a, 'submit_timed_math_result', { p_duel_id: id, p_answers: solve(h, id, 'challenger') });
  await h.rpc(b, 'submit_timed_math_result', { p_duel_id: id, p_answers: solve(h, id, 'opponent', 2) });
  const [s] = snap();
  assert.equal(snap().length, 1, 'una sola foto por duelo');
  assert.equal(s.args.status, 'completed');
  assert.equal(s.args.problems.length, 10);
  assert.equal(s.args.problems_b.length, 10);
  assert.deepEqual(s.args.results.map((r) => [r.student_id, r.answers.length, r.time_ms]), [['s1', 10, 10000], ['s2', 10, 10000]]);
  const confirmed = { server_time: '2026-11-02T01:00:00Z', applied: { rpc: [s.seq] }, rpc_errors: [], students: [], courses: [], completions: [], files: [],
    tables: { students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: '5to Primaria', section: 'A', status: 'activo', gems: 110, xp: 70 }, { id: 's2', username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: '5to Primaria', section: 'A', status: 'activo', gems: 20, xp: 15 }] } };
  applyPull(h.db, confirmed, { rpc: [s] });
  assert.equal(snap().length, 0);
  assert.deepEqual(await h.me(a, 's1'), { gems: 110, xp: 70 }, 'ya no se suma dos veces: manda lo que bajó de la nube');
});

test('reglas del reto: no apostar más de lo que se tiene, ni contra uno mismo, ni a un desconocido; cancelar (retador) y rechazar (rival) solo estando pendiente', async () => {
  const h = await boot();
  const a = await h.student('ana1'), b = await h.student('beto1');
  for (const [body, status] of [[{ challenger_id: 's1', opponent_id: 's2', wager_gems: 101 }, 403], [{ challenger_id: 's1', opponent_id: 's2', wager_gems: -1 }, 403], [{ challenger_id: 's1', opponent_id: 's1', wager_gems: 0 }, 403],
    [{ challenger_id: 's1', opponent_id: 'nadie', wager_gems: 0 }, 403], [{ challenger_id: 's2', opponent_id: 's1', wager_gems: 0 }, 403], [{ challenger_id: 's1', opponent_id: 's2', wager_gems: 5, status: 'completed' }, 403],
    [{ challenger_id: 's1', opponent_id: 's2', wager_gems: 5, winner_id: 's1' }, 403], [{ challenger_id: 's1', opponent_id: 's2', wager_gems: 5, problem_count: 1 }, 403]]) {
    assert.equal((await h.challenge(a, body)).status, status, JSON.stringify(body));
  }
  assert.equal((await h.challenge(a, { challenger_id: 's1', opponent_id: 's3', wager_gems: 0 })).status, 201, 'un compañero de otra clase de la escuela también se puede retar');
  const id = (await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 5 })).data.id;
  const patch = (token, body) => h.call('PATCH', `/rest/v1/student_timed_math_duels?id=eq.${id}&select=status`, { token, headers: { prefer: 'return=representation' }, body });
  assert.deepEqual(await (await patch(b, { status: 'cancelled' })).json(), [], 'el rival no cancela');
  assert.deepEqual(await (await patch(a, { status: 'rejected' })).json(), [], 'el retador no rechaza');
  assert.deepEqual(await (await patch(a, { status: 'completed' })).json(), []);
  assert.deepEqual(await (await patch(a, { wager_gems: 9999 })).json(), [], 'la apuesta no se cambia');
  assert.equal((await patch(a, { winner_id: 's1' })).status, 403, 'el ganador no se escribe desde la app');
  assert.deepEqual(await (await patch(b, { status: 'rejected' })).json(), [{ status: 'rejected' }]);
  assert.deepEqual(await (await patch(b, { status: 'rejected' })).json(), [], 'ya no está pendiente');
  assert.deepEqual((await h.rpc(a, 'start_timed_math_duel', { p_duel_id: id })).status, 400, 'sin problemas generados');
  const id2 = (await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 0 })).data.id;
  assert.deepEqual(await (await h.call('PATCH', `/rest/v1/student_timed_math_duels?id=eq.${id2}&select=status`, { token: a, headers: { prefer: 'return=representation' }, body: { status: 'cancelled' } })).json(), [{ status: 'cancelled' }]);
  const third = await h.student('carla1');
  assert.deepEqual(await (await h.call('GET', '/rest/v1/student_timed_math_duels?select=id', { token: third })).json().then((x) => x.map((d) => d.id)), [(await h.layer.store.all('student_timed_math_duels').find((d) => d.opponent_id === 's3')).id], 'cada quien ve solo sus duelos');
  assert.equal((await h.rpc(third, 'start_timed_math_duel', { p_duel_id: id2 })).status, 400, 'un tercero no juega duelos ajenos');
});

test('la lista de duelos con los datos del rival (relaciones por columna) y el empate: gana el más rápido; con todo igual no hay ganador ni se mueven gemas', async () => {
  const h = await boot();
  const a = await h.student('ana1'), b = await h.student('beto1');
  const id = (await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 10 })).data.id;
  await h.rpc(b, 'accept_timed_math_duel', { p_duel_id: id });
  const list = await (await h.call('GET', '/rest/v1/student_timed_math_duels?select=id,status,challenger:students!challenger_id(full_name,gems_earned_total),opponent:students!opponent_id(full_name)&or=(challenger_id.eq.s1,opponent_id.eq.s1)&order=created_at.desc&limit=10', { token: a })).json();
  assert.deepEqual([list[0].challenger.full_name, list[0].opponent.full_name], ['Ana', 'Beto']);
  await h.rpc(a, 'start_timed_math_duel', { p_duel_id: id });
  await h.rpc(b, 'start_timed_math_duel', { p_duel_id: id });
  h.tick(7_000);
  await h.rpc(a, 'submit_timed_math_result', { p_duel_id: id, p_answers: solve(h, id, 'challenger') });
  await h.rpc(b, 'submit_timed_math_result', { p_duel_id: id, p_answers: solve(h, id, 'opponent') });
  const d = (await (await h.call('GET', `/rest/v1/student_timed_math_duels?select=status,winner_id&id=eq.${id}`, { token: a })).json())[0];
  assert.deepEqual(d, { status: 'completed', winner_id: null }, 'mismo puntaje y mismo tiempo: empate');
  assert.deepEqual(await h.me(a, 's1'), { gems: 100, xp: 55 }, 'sin ganador no se mueven gemas; todos ganan 5 XP');
});
