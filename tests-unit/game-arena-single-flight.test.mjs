// Retos duplicados (captura del 9/11): en celular lento, tocar «Retar» varias veces apilaba varios formularios y cada uno enviaba su reto.
// GameArena debe abrir UN solo formulario de reto y enviar UN solo reto aunque se toque varias veces mientras la red responde.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../js/game-arena.js', import.meta.url), 'utf8');
function load() {
  const removed = [];
  const stale = [{ closest: () => ({ remove: () => removed.push('modal viejo') }) }];
  const window = { currentUser: { id: 'yo' }, userData: { gems: 50 }, showToast() {}, sanitizeInput: (v) => v };
  const document = { querySelectorAll: (sel) => (sel === 'select[data-ga-opponents]' ? stale : []), getElementById: () => null, createElement: () => ({}) };
  vm.runInNewContext(src, { window, document, console, setTimeout, clearTimeout, Promise, Math, Date });
  return { window, removed };
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test('abrir el formulario de reto varias veces seguidas lo abre una sola vez y limpia los formularios viejos', async () => {
  const { window, removed } = load();
  let opened = 0;
  window.openCreateHangmanModal = async () => { opened++; await delay(30); };
  await Promise.all([window.GameArena.openCreator('hangman'), window.GameArena.openCreator('hangman'), window.GameArena.openCreator('hangman')]);
  assert.equal(opened, 1, 'el formulario se abre una sola vez');
  assert.ok(removed.length >= 1, 'quita los formularios que hubieran quedado apilados');
  await window.GameArena.openCreator('hangman');
  assert.equal(opened, 2, 'cuando termina, se puede abrir otra vez');
});

test('enviar el reto con varios toques envía un solo reto (y vuelve a permitir uno nuevo después)', async () => {
  const { window } = load();
  let sent = 0;
  window.openCreateHangmanModal = async () => {};
  window.sendHangmanChallenge = async () => { sent++; await delay(30); return 'ok'; };
  await window.GameArena.openCreator('hangman'); // engancha el envío
  await Promise.all([window.sendHangmanChallenge(), window.sendHangmanChallenge(), window.sendHangmanChallenge()]);
  assert.equal(sent, 1, 'un solo reto aunque se toque tres veces');
  await window.sendHangmanChallenge();
  assert.equal(sent, 2, 'un reto nuevo después sí se envía');
});

test('createChallenge (revancha y reto rápido) tampoco se duplica con toques repetidos', async () => {
  const { window } = load();
  let inserts = 0;
  window._supabase = { from: () => ({ insert: () => ({ select: () => ({ single: async () => { inserts++; await delay(30); return { data: { id: 'd1' }, error: null }; } }) }) }) };
  const ids = await Promise.all([1, 2, 3].map(() => window.GameArena.createChallenge('hangman', { opponentId: 'rival', wager: 10, topic: 'Tema' })));
  assert.equal(inserts, 1);
  assert.equal(ids.filter(Boolean).length, 1, 'solo uno recibe el id; los demás toques se ignoran');
});

// ---- Revancha: UNA sola vez por reto terminado (no basta con ignorar toques simultáneos) ----
function rematchEnv() {
  const env = load();
  const w = env.window;
  w.currentUser = { id: 'yo' };
  let inserts = 0, reloads = 0;
  w._supabase = { from: () => ({ insert: () => ({ select: () => ({ single: async () => { inserts++; return { data: { id: 'nuevo' + inserts }, error: null }; } }) }) }) };
  w.loadHangmanSection = () => { reloads++; };
  w._hangmanDuelsCache = [
    { id: 'd1', status: 'completed', challenger_id: 'yo', opponent_id: 'rival', opponent: { full_name: 'Ana Rival' }, wager_gems: 10, topic: 'Tema', resolved_at: new Date().toISOString() },
  ];
  return { w, counts: () => ({ inserts, reloads }) };
}

test('«Revancha» envía un solo reto aunque se toque otra vez DESPUÉS de que terminó el primero', async () => {
  const { w, counts } = rematchEnv();
  await w.GameArena.rematch('hangman', 'd1');
  await w.GameArena.rematch('hangman', 'd1');
  await w.GameArena.rematch('hangman', 'd1');
  assert.equal(counts().inserts, 1, 'solo una revancha por reto');
});

test('«Revancha» no se envía si ya hay un reto pendiente o activo contra ese mismo rival', async () => {
  const { w, counts } = rematchEnv();
  w._hangmanDuelsCache.push({ id: 'p1', status: 'pending', challenger_id: 'yo', opponent_id: 'rival', wager_gems: 10 });
  await w.GameArena.rematch('hangman', 'd1');
  assert.equal(counts().inserts, 0);
});

test('el botón de revancha pasa a «Revancha enviada» (sin onclick) cuando ya se envió', async () => {
  const { w } = rematchEnv();
  const duel = w._hangmanDuelsCache[0];
  assert.match(w.GameArena.rematchBtnHtml('hangman', duel), /onclick="window\.GameArena\.rematch\('hangman', 'd1'\)"/);
  await w.GameArena.rematch('hangman', 'd1');
  const html = w.GameArena.rematchBtnHtml('hangman', duel);
  assert.match(html, /Revancha enviada/);
  assert.doesNotMatch(html, /onclick/);
});

test('errorText: el candado de la base (23505) se explica en español; otros errores no se tocan', () => {
  const { window } = load();
  assert.match(window.GameArena.errorText({ code: '23505', message: 'duplicate key value violates unique constraint "student_hangman_duels_one_open_pair"' }), /Ya tienes un reto abierto con ese compañero/);
  assert.match(window.GameArena.errorText({ message: 'violates unique constraint "x_one_open_pair"' }), /Ya tienes un reto abierto/);
  assert.equal(window.GameArena.errorText({ code: '42501', message: 'permission denied' }), null, 'otros errores: se muestra el mensaje original');
  assert.equal(window.GameArena.errorText(null), null);
});
