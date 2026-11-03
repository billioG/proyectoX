// Genera, con el nodo de verdad (Node 20 + sqlite), tres duelos jugados sin internet y devuelve en JSON lo que el nodo muestra (gemas y XP) y lo que subiría a la nube.
// La prueba node-duels-cloud-parity.test.mjs (Node 22) lo pasa por los validadores y las funciones SQL reales de la nube y compara los resultados.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../school-node/db.js';
import { createRestLayer } from '../../school-node/rest/index.js';
import { applyPull, buildPush } from '../../school-node/sync.js';
import { hashClassPassword } from '../../school-node/rest/auth.js';

const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
const TOPIC = 'Vida silvestre de Guatemala';
const BANK = ['QUETZAL', 'JAGUAR', 'MANATI', 'CEIBA', 'TAPIR', 'CORAL', 'DEFORESTACION'].map((word, i) => ({ id: i + 1, category: TOPIC, word, hint: `Pista de ${word}`, fact: `Dato de ${word}` }));
const salt = 'ab'.repeat(8);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duel-parity-'));
const db = openDb(dir);
let clock = Date.parse('2026-11-02T15:00:00Z');
const layer = createRestLayer(db, { now: () => clock });
const base = [{ id: A, gems: 100, xp: 50 }, { id: B, gems: 30, xp: 10 }];
applyPull(db, {
  server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
  class_verifiers: [{ class_key: 'ESC1|5to Primaria|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
  tables: {
    students: [
      { id: A, username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: '5to Primaria', section: 'A', status: 'activo', ...base[0] },
      { id: B, username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: '5to Primaria', section: 'A', status: 'activo', ...base[1] },
    ],
    teachers: [], hangman_word_bank: BANK,
  },
});
const server = http.createServer(async (req, res) => { if (!(await layer.routes.handle(req, res, new URL(req.url, 'http://node')))) { res.writeHead(404); res.end(); } });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const call = (method, p, { token, body, headers = {} } = {}) => fetch(url + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const login = async (user) => {
  const { token_hash } = await (await call('POST', '/functions/v1/student-login', { body: { username: user, password: 'clase123' } })).json();
  return (await (await call('POST', '/auth/v1/verify', { body: { type: 'magiclink', token_hash } })).json()).access_token;
};
const rpc = async (token, fn, args) => { const r = await call('POST', `/rest/v1/rpc/${fn}`, { token, body: args }); const data = await r.json().catch(() => null); if (r.status !== 200) throw new Error(`${fn}: ${r.status} ${JSON.stringify(data)}`); return data; };
const challenge = async (token, table, body) => {
  const r = await call('POST', `/rest/v1/${table}?select=id`, { token, headers: { prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' }, body });
  const data = await r.json(); if (r.status !== 201) throw new Error(`reto ${table}: ${r.status} ${JSON.stringify(data)}`); return data.id;
};
const raw = (tbl) => layer.store.raw(tbl);
const a = await login('ana1'), b = await login('beto1');

// 1) Contrarreloj: Ana (10/10) le gana a Beto (6/10); apuesta 20.
{
  const id = await challenge(a, 'student_timed_math_duels', { challenger_id: A, opponent_id: B, wager_gems: 20 });
  await rpc(b, 'accept_timed_math_duel', { p_duel_id: id });
  await rpc(a, 'start_timed_math_duel', { p_duel_id: id }); await rpc(b, 'start_timed_math_duel', { p_duel_id: id });
  const d = raw('student_timed_math_duels').find((x) => x.id === id);
  clock += 20_000;
  await rpc(a, 'submit_timed_math_result', { p_duel_id: id, p_answers: d.problems.map((p) => String(p.answer)) });
  clock += 5_000;
  await rpc(b, 'submit_timed_math_result', { p_duel_id: id, p_answers: d.problems_b.map((p, i) => String(i < 4 ? p.answer + 1 : p.answer)) });
}
// 2) Ahorcado: Beto la adivina antes que Ana (ella con un error); apuesta 50 y Ana tiene gemas de sobra.
{
  const id = await challenge(a, 'student_hangman_duels', { challenger_id: A, opponent_id: B, wager_gems: 50, topic: TOPIC });
  await rpc(b, 'assign_hangman_bank_word', { p_duel_id: id });
  await rpc(a, 'start_hangman_duel', { p_duel_id: id }); await rpc(b, 'start_hangman_duel', { p_duel_id: id });
  const d = raw('student_hangman_duels').find((x) => x.id === id);
  const letters = (w) => [...new Set(w.toLowerCase())];
  clock += 9_000;
  await rpc(b, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: letters(d.word_b) });
  clock += 11_000;
  await rpc(a, 'submit_hangman_result', { p_duel_id: id, p_guessed_letters: ['x', ...letters(d.word)] });
}
// 3) Contrarreloj con una apuesta que Beto no puede pagar completa (tiene menos gemas): el tope es lo que tenga. Gana Ana otra vez.
{
  const me = (await (await call('GET', `/rest/v1/students?select=gems&id=eq.${A}`, { token: a })).json())[0].gems;
  const id = await challenge(a, 'student_timed_math_duels', { challenger_id: A, opponent_id: B, wager_gems: me });
  await rpc(b, 'accept_timed_math_duel', { p_duel_id: id });
  await rpc(a, 'start_timed_math_duel', { p_duel_id: id }); await rpc(b, 'start_timed_math_duel', { p_duel_id: id });
  const d = raw('student_timed_math_duels').find((x) => x.id === id);
  clock += 15_000;
  await rpc(a, 'submit_timed_math_result', { p_duel_id: id, p_answers: d.problems.map((p) => String(p.answer)) });
  await rpc(b, 'submit_timed_math_result', { p_duel_id: id, p_answers: [] });
}

const final = [];
for (const s of base) final.push((await (await call('GET', `/rest/v1/students?select=id,gems,xp&id=eq.${s.id}`, { token: a })).json())[0]);
const duels = [...raw('student_timed_math_duels'), ...raw('student_hangman_duels')].map((d) => ({ id: d.id, status: d.status, winner_id: d.winner_id }));
process.stdout.write(`@@JSON@@${JSON.stringify({ base, final, duels, bank: BANK, snapshots: buildPush(db, { cloudUrl: 'x' }).rpc })}`);
server.close();
db.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
