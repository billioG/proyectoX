// Ahorcado 1v1 sin internet con la app real: el tema sale del banco fijo de la nube (los temas con IA siguen siendo solo con internet), cada jugador tiene SU
// palabra, el navegador nunca ve la palabra, y se liquida igual que la nube (gana quien la adivina más rápido). Node 20.
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

const cleanups = [];
test.after(async () => { for (const c of cleanups.reverse()) await c(); });
const salt = 'ab'.repeat(8);
const TOPIC = 'Vida silvestre de Guatemala';
const BANK = [['QUETZAL', 'Ave nacional.'], ['JAGUAR', 'Felino de Petén.'], ['MANATI', 'Mamífero acuático.'], ['CEIBA', 'Árbol nacional.'], ['TAPIR', 'Nariz larga.'], ['CORAL', 'Forma arrecifes.']]
  .map(([word, hint], i) => ({ id: i + 1, category: TOPIC, word, hint, fact: `Dato de ${word}` }));

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-hangman-'));
  const db = openDb(dir);
  let clock = Date.parse('2026-11-02T15:00:00Z');
  const layer = createRestLayer(db, { now: () => clock });
  applyPull(db, {
    server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [{ class_key: 'ESC1|5to Primaria|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
    tables: {
      students: [
        { id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: '5to Primaria', section: 'A', status: 'activo', gems: 100, xp: 50 },
        { id: 's2', username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: '5to Primaria', section: 'A', status: 'activo', gems: 30, xp: 10 },
      ],
      teachers: [], hangman_word_bank: BANK,
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
  const challenge = async (token, body) => { const r = await call('POST', '/rest/v1/student_hangman_duels?select=id,challenger_id,opponent_id,wager_gems,topic,status,created_at', { token, headers: { prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' }, body }); return { status: r.status, data: await r.json().catch(() => null) }; };
  // La palabra de cada jugador solo la conoce el nodo: la prueba la lee de la réplica (el navegador nunca la ve).
  const wordOf = (id, who) => { const d = layer.store.raw('student_hangman_duels').find((x) => x.id === id); return (who === 'challenger' ? d.word : d.word_b).toLowerCase(); };
  // Juega una palabra letra por letra con la misma pregunta de la app: check_hangman_letter con la lista acumulada.
  const play = async (token, id, who, { miss = [], skip = 0 } = {}) => {
    const word = wordOf(id, who);
    const letters = [...new Set(word)];
    const guessed = [];
    for (const l of [...miss, ...letters.slice(0, letters.length - skip)]) {
      guessed.push(l);
      const r = await rpc(token, 'check_hangman_letter', { p_duel_id: id, p_letter: l, p_guessed_letters: guessed });
      assert.equal(r.status, 200, JSON.stringify(r.data));
    }
    return guessed;
  };
  return { db, layer, call, student, rpc, me, challenge, play, wordOf, tick: (ms) => { clock += ms; } };
}

test('un duelo completo: solo temas del banco fijo; cada uno su palabra (distinta, de largo parecido); la palabra no llega al navegador; gana el más rápido', async () => {
  const h = await boot();
  const a = await h.student('ana1'), b = await h.student('beto1');
  assert.equal((await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 10, topic: 'Cultura general' })).status, 400, 'los temas con IA necesitan internet');
  const ch = await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 20, topic: TOPIC });
  assert.equal(ch.status, 201);
  const id = ch.data.id;
  assert.equal((await h.rpc(a, 'assign_hangman_bank_word', { p_duel_id: id })).status, 200, 'cualquiera de los dos puede pedir la palabra');
  assert.equal((await h.rpc(a, 'start_hangman_duel', { p_duel_id: id })).status, 200);
  const wa = h.wordOf(id, 'challenger'), wb = h.wordOf(id, 'opponent');
  assert.notEqual(wa, wb, 'palabras distintas');
  const sa = await h.rpc(a, 'start_hangman_duel', { p_duel_id: id });
  assert.deepEqual(Object.keys(sa.data).sort(), ['hint', 'wordLength']);
  assert.equal(sa.data.wordLength, wa.length);
  assert.equal((await h.rpc(b, 'start_hangman_duel', { p_duel_id: id })).data.wordLength, wb.length);
  const listed = JSON.stringify(await (await h.call('GET', `/rest/v1/student_hangman_duels?select=*&id=eq.${id}`, { token: a })).json());
  assert.doesNotMatch(listed, /word|hint|started_at|settle/i, 'la palabra no llega al navegador');
  assert.equal((await h.call('GET', '/rest/v1/hangman_word_bank?select=word', { token: a })).status, 404, 'el banco no se lee desde la app');

  const wrongLetter = 'x'; // no está en ninguna palabra del banco
  assert.deepEqual((await h.rpc(a, 'check_hangman_letter', { p_duel_id: id, p_letter: wrongLetter, p_guessed_letters: [wrongLetter] })).data, { correct: false, positions: [], solved: false });
  const first = wa[0];
  const hit = await h.rpc(a, 'check_hangman_letter', { p_duel_id: id, p_letter: first.toUpperCase(), p_guessed_letters: [first] });
  assert.equal(hit.data.correct, true);
  assert.deepEqual(hit.data.positions, [...wa].map((c, i) => (c === first ? i : -1)).filter((i) => i >= 0));

  h.tick(12_000);
  const ga = await h.play(a, id, 'challenger', { miss: ['x'] });
  const ra = await h.rpc(a, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: ga });
  assert.deepEqual([ra.data.solved, ra.data.wrong_guesses, ra.data.time_ms, ra.data.word], [true, 1, 12000, wa]);
  assert.equal((await h.rpc(a, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: ga })).status, 400, 'Ya jugaste este desafío');
  h.tick(3_000);
  const gb = await h.play(b, id, 'opponent');
  const rb = await h.rpc(b, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: gb });
  assert.deepEqual([rb.data.solved, rb.data.wrong_guesses, rb.data.time_ms], [true, 0, 15000]);

  const duel = (await (await h.call('GET', `/rest/v1/student_hangman_duels?select=status,winner_id&id=eq.${id}`, { token: a })).json())[0];
  assert.deepEqual(duel, { status: 'completed', winner_id: 's1' });
  assert.deepEqual(await h.me(a, 's1'), { gems: 120, xp: 70 });
  assert.deepEqual(await h.me(b, 's2'), { gems: 10, xp: 15 });
  const results = await (await h.call('GET', `/rest/v1/student_hangman_results?select=student_id,solved,wrong_guesses,time_ms&duel_id=eq.${id}&order=time_ms.asc`, { token: b })).json();
  assert.deepEqual(results, [{ student_id: 's1', solved: true, wrong_guesses: 1, time_ms: 12000 }, { student_id: 's2', solved: true, wrong_guesses: 0, time_ms: 15000 }]);
  // El dato curioso de TU palabra, solo después de jugar.
  assert.equal((await h.rpc(a, 'get_duel_fact', { p_game: 'hangman', p_duel_id: id })).data, `Dato de ${wa.toUpperCase()}`);
  assert.equal((await h.rpc(b, 'get_duel_fact', { p_game: 'hangman', p_duel_id: id })).data, `Dato de ${wb.toUpperCase()}`);
});

test('quién gana: si solo uno la adivina gana ese sin importar el tiempo; si ninguno, empate sin gemas; con otra letra mala no cuenta como adivinada', async () => {
  const h = await boot();
  const a = await h.student('ana1'), b = await h.student('beto1');
  const start = async (wager) => {
    const id = (await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: wager, topic: TOPIC })).data.id;
    await h.rpc(b, 'assign_hangman_bank_word', { p_duel_id: id });
    await h.rpc(a, 'start_hangman_duel', { p_duel_id: id }); await h.rpc(b, 'start_hangman_duel', { p_duel_id: id });
    return id;
  };
  // Solo el rival la adivina (el retador falla por mucho tiempo y por errores).
  let id = await start(10);
  h.tick(1_000);
  const bad = await h.rpc(a, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: ['x', 'w', 'k', 'y', 'h', 'v'] });
  assert.deepEqual([bad.data.solved, bad.data.wrong_guesses], [false, 6]);
  h.tick(60_000);
  await h.rpc(b, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: await h.play(b, id, 'opponent') });
  assert.equal((await (await h.call('GET', `/rest/v1/student_hangman_duels?select=winner_id&id=eq.${id}`, { token: a })).json())[0].winner_id, 's2');
  assert.deepEqual(await h.me(a, 's1'), { gems: 90, xp: 55 });
  assert.deepEqual(await h.me(b, 's2'), { gems: 40, xp: 30 });
  // Ninguno la adivina: empate, sin mover gemas.
  id = await start(10);
  await h.rpc(a, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: ['x'] });
  await h.rpc(b, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: ['x'] });
  const d = (await (await h.call('GET', `/rest/v1/student_hangman_duels?select=status,winner_id&id=eq.${id}`, { token: a })).json())[0];
  assert.deepEqual(d, { status: 'completed', winner_id: null });
  assert.deepEqual(await h.me(a, 's1'), { gems: 90, xp: 60 });
  // Faltar una letra de la palabra no la adivina.
  id = await start(0);
  const almost = await h.play(a, id, 'challenger', { skip: 1 });
  assert.equal((await h.rpc(a, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: almost })).data.solved, false);
});

test('reglas: no apostar de más, cancelar/rechazar solo pendiente, nadie ajeno juega, y no se juega sin aceptar ni sin arrancar', async () => {
  const h = await boot();
  const a = await h.student('ana1'), b = await h.student('beto1');
  assert.equal((await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 101, topic: TOPIC })).status, 403);
  assert.equal((await h.challenge(a, { challenger_id: 's1', opponent_id: 's1', wager_gems: 0, topic: TOPIC })).status, 403);
  assert.equal((await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 0, topic: TOPIC, status: 'completed' })).status, 403);
  assert.equal((await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 0, topic: TOPIC, winner_id: 's1' })).status, 403);
  const id = (await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 5, topic: TOPIC })).data.id;
  assert.equal((await h.rpc(a, 'start_hangman_duel', { p_duel_id: id })).status, 400, 'sin palabra todavía');
  assert.equal((await h.rpc(b, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: [] })).status, 400);
  const patch = (token, body, duel = id) => h.call('PATCH', `/rest/v1/student_hangman_duels?id=eq.${duel}&select=status`, { token, headers: { prefer: 'return=representation' }, body });
  assert.deepEqual(await (await patch(b, { status: 'cancelled' })).json(), []);
  assert.deepEqual(await (await patch(a, { status: 'rejected' })).json(), []);
  assert.deepEqual(await (await patch(b, { status: 'rejected' })).json(), [{ status: 'rejected' }]);
  const id2 = (await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 0, topic: TOPIC })).data.id;
  assert.deepEqual(await (await patch(a, { status: 'cancelled' }, id2)).json(), [{ status: 'cancelled' }]);
  const id3 = (await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 0, topic: TOPIC })).data.id;
  await h.rpc(b, 'assign_hangman_bank_word', { p_duel_id: id3 });
  assert.equal((await h.rpc(a, 'submit_hangman_result', { p_duel_id: id3, p_guessed_letters: [] })).status, 400, 'Todavía no arrancaste este desafío');
  assert.equal((await h.rpc(a, 'check_hangman_letter', { p_duel_id: 'no-existe', p_letter: 'a', p_guessed_letters: ['a'] })).status, 400);
});

test('la nube recibe UNA foto del duelo con las letras jugadas; al confirmarla manda lo que baja de la nube', async () => {
  const h = await boot();
  const a = await h.student('ana1'), b = await h.student('beto1');
  const id = (await h.challenge(a, { challenger_id: 's1', opponent_id: 's2', wager_gems: 10, topic: TOPIC })).data.id;
  const snap = () => buildPush(h.db, { cloudUrl: 'x' }).rpc.filter((r) => r.fn === 'hangman_duel');
  assert.deepEqual(snap().map((r) => [r.student_id, r.args.id, r.args.status, r.args.results.length]), [['s1', id, 'pending', 0]]);
  await h.rpc(b, 'assign_hangman_bank_word', { p_duel_id: id });
  await h.rpc(a, 'start_hangman_duel', { p_duel_id: id }); await h.rpc(b, 'start_hangman_duel', { p_duel_id: id });
  h.tick(5_000);
  await h.rpc(a, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: await h.play(a, id, 'challenger') });
  await h.rpc(b, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: await h.play(b, id, 'opponent', { miss: ['x'] }) });
  const [s] = snap();
  assert.equal(snap().length, 1);
  assert.deepEqual([s.args.status, s.args.topic, s.args.word.toLowerCase() === h.wordOf(id, 'challenger'), s.args.word_b.toLowerCase() === h.wordOf(id, 'opponent')], ['completed', TOPIC, true, true]);
  assert.deepEqual(s.args.results.map((r) => [r.student_id, r.guessed.length > 0, r.time_ms]), [['s1', true, 5000], ['s2', true, 5000]]);
  applyPull(h.db, { server_time: '2026-11-02T01:00:00Z', applied: { rpc: [s.seq] }, rpc_errors: [], students: [], courses: [], completions: [], files: [],
    tables: { students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: '5to Primaria', section: 'A', status: 'activo', gems: 110, xp: 70 }, { id: 's2', username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: '5to Primaria', section: 'A', status: 'activo', gems: 20, xp: 15 }] } }, { rpc: [s] });
  assert.equal(snap().length, 0);
  assert.deepEqual(await h.me(a, 's1'), { gems: 110, xp: 70 });
});
