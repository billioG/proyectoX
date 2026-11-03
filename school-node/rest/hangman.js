// Ahorcado 1 contra 1 en la capa local. Mismas reglas que la nube (migrations: student-hangman-duels, hangman-word-bank, duel-per-player-content):
// la palabra sale del banco fijo (hangman_word_bank, que baja con la sincronización), cada jugador tiene SU palabra, el navegador nunca la ve, y gana
// quien la adivina más rápido. Los temas que generan la palabra con IA necesitan internet. Se sube como una «foto» del duelo (_rpc hangman_duel) y la
// nube recalcula con las letras jugadas (apply_node_hangman_duel). Comparte la liquidación de gemas y XP con Contrarreloj (duels.js).
import { RestError } from './query.js';
import { HANGMAN_FN } from './duels.js';

export const HANGMAN_TABLE = 'student_hangman_duels';
export const HANGMAN_RESULTS = 'student_hangman_results';
const bad = (message) => new RestError(400, message, 'P0001');

export function createHangman({ store, duels, now = Date.now, random = Math.random }) {
  const rawDuel = (id) => store.raw(HANGMAN_TABLE).find((d) => d.id === id) ?? null;
  const resultsOf = (id) => store.raw(HANGMAN_RESULTS).filter((r) => r.duel_id === id);
  const lettersOf = (word) => [...new Set(String(word).toLowerCase())].filter((c) => c.trim() !== '');
  const norm = (l) => String(l ?? '').toLowerCase().slice(0, 1);
  const asStudent = (ctx) => { if (ctx?.role !== 'student') throw bad('Solo los estudiantes juegan retos'); return ctx.uid; };
  const load = (id, uid) => {
    const d = typeof id === 'string' ? rawDuel(id) : null;
    if (!d || (d.challenger_id !== uid && d.opponent_id !== uid)) throw bad('Desafío no encontrado');
    return d;
  };
  const mine = (d, uid) => (uid === d.opponent_id && d.word_b ? { word: d.word_b, hint: d.hint_b } : { word: d.word, hint: d.hint });
  const bankTopics = () => new Set(store.raw('hangman_word_bank').map((w) => w.category));

  function snapshot(d) {
    return {
      id: d.id, challenger_id: d.challenger_id, opponent_id: d.opponent_id, wager_gems: d.wager_gems, topic: d.topic, status: d.status, winner_id: d.winner_id ?? null,
      created_at: d.created_at, resolved_at: d.resolved_at ?? null, word: d.word ?? null, hint: d.hint ?? null, word_b: d.word_b ?? null, hint_b: d.hint_b ?? null,
      challenger_started_at: d.challenger_started_at ?? null, opponent_started_at: d.opponent_started_at ?? null,
      results: resultsOf(d.id).map((r) => ({ student_id: r.student_id, guessed: r.guessed, time_ms: r.time_ms, completed_at: r.completed_at })),
      settle: d.settle ?? null,
    };
  }
  const queue = (id) => {
    const d = rawDuel(id);
    if (d) store.replacePendingRpc(HANGMAN_FN, id, { student_id: d.challenger_id, args: snapshot(d) });
  };

  function settle(d) {
    const r1 = resultsOf(d.id).find((r) => r.student_id === d.challenger_id), r2 = resultsOf(d.id).find((r) => r.student_id === d.opponent_id);
    let winner = null;
    if (r1.solved && r2.solved) winner = r1.time_ms <= r2.time_ms ? d.challenger_id : d.opponent_id;
    else if (r1.solved) winner = d.challenger_id;
    else if (r2.solved) winner = d.opponent_id;
    duels.finish(HANGMAN_TABLE, d, winner);
  }

  return {
    queue,
    onDuelChange: (row) => { if (row?.id) queue(row.id); },
    /** ¿El tema tiene banco fijo? (los demás los genera la IA: solo con internet) */
    isBankTopic: (topic) => bankTopics().has(topic),

    assign(args, ctx) {
      const uid = asStudent(ctx);
      const d = load(args?.p_duel_id, uid);
      if (d.word) return null;
      const bank = store.raw('hangman_word_bank').filter((w) => w.category === d.topic);
      if (!bank.length) throw bad('No hay palabras en el banco para esta categoría');
      const players = new Set([d.challenger_id, d.opponent_id]);
      const seen = new Set();
      for (const x of store.raw(HANGMAN_TABLE)) if (players.has(x.challenger_id) || players.has(x.opponent_id)) { if (x.word) seen.add(x.word.toUpperCase()); if (x.word_b) seen.add(x.word_b.toUpperCase()); }
      const shuffle = (list) => list.map((w) => [random(), w]).sort((p, q) => p[0] - q[0]).map(([, w]) => w);
      // Palabra del retador: al azar, prefiriendo las que nadie jugó todavía.
      const a = shuffle(bank).sort((p, q) => Number(seen.has(p.word.toUpperCase())) - Number(seen.has(q.word.toUpperCase())))[0];
      // Palabra del rival: distinta, de largo parecido (±2) si hay, sin repetir.
      const rest = shuffle(bank.filter((w) => w.id !== a.id && w.word.toUpperCase() !== a.word.toUpperCase()));
      const b = rest.sort((p, q) => (Number(seen.has(p.word.toUpperCase())) - Number(seen.has(q.word.toUpperCase())))
        || (Number(Math.abs(p.word.length - a.word.length) > 2) - Number(Math.abs(q.word.length - a.word.length) > 2)))[0] ?? null;
      store.put(HANGMAN_TABLE, { ...d, word: a.word, hint: a.hint, fact: a.fact ?? null, word_b: b?.word ?? null, hint_b: b?.hint ?? null, fact_b: b?.fact ?? null, status: d.status === 'pending' ? 'active' : d.status });
      queue(d.id);
      return null;
    },

    start(args, ctx) {
      const uid = asStudent(ctx);
      const d = load(args?.p_duel_id, uid);
      if (!d.word) throw bad('Este desafío aún no tiene palabra generada');
      const key = uid === d.challenger_id ? 'challenger_started_at' : 'opponent_started_at';
      if (!d[key]) { store.put(HANGMAN_TABLE, { ...d, [key]: new Date(now()).toISOString() }); queue(d.id); }
      const m = mine(d, uid);
      return { hint: m.hint, wordLength: m.word.length };
    },

    check(args, ctx) {
      const uid = asStudent(ctx);
      const d = load(args?.p_duel_id, uid);
      if (!d.word) throw bad('Este desafío aún no tiene palabra generada');
      const word = mine(d, uid).word.toLowerCase();
      const letter = norm(args?.p_letter);
      const positions = [...word].map((c, i) => (c === letter ? i : -1)).filter((i) => i >= 0);
      const guessed = new Set((Array.isArray(args?.p_guessed_letters) ? args.p_guessed_letters : []).map(norm));
      return { correct: positions.length > 0, positions, solved: lettersOf(word).every((l) => guessed.has(l)) };
    },

    submit(args, ctx) {
      const uid = asStudent(ctx);
      const d = load(args?.p_duel_id, uid);
      if (resultsOf(d.id).some((r) => r.student_id === uid)) throw bad('Ya jugaste este desafío');
      const startedAt = uid === d.challenger_id ? d.challenger_started_at : d.opponent_started_at;
      if (!startedAt) throw bad('Todavía no arrancaste este desafío');
      const word = mine(d, uid).word.toLowerCase();
      const guessed = (Array.isArray(args?.p_guessed_letters) ? args.p_guessed_letters : []).slice(0, 60).map(norm).filter(Boolean);
      const wrong = guessed.filter((l) => !word.includes(l)).length;
      const solved = lettersOf(word).every((l) => guessed.includes(l));
      const time_ms = Math.max(0, Math.round(now() - Date.parse(startedAt)));
      store.put(HANGMAN_RESULTS, { id: `${d.id}:${uid}`, duel_id: d.id, student_id: uid, solved, wrong_guesses: wrong, time_ms, completed_at: new Date(now()).toISOString(), guessed });
      if (resultsOf(d.id).length >= 2) settle(rawDuel(d.id));
      queue(d.id);
      return { solved, wrong_guesses: wrong, time_ms, word };
    },

    /** «¿Sabías que?» de TU palabra, solo después de jugar (get_duel_fact). */
    fact(args, ctx) {
      if (ctx?.role !== 'student' || args?.p_game !== 'hangman') return null;
      const d = typeof args.p_duel_id === 'string' ? rawDuel(args.p_duel_id) : null;
      if (!d || !resultsOf(d.id).some((r) => r.student_id === ctx.uid)) return null;
      return (ctx.uid === d.opponent_id && d.word_b ? d.fact_b : d.fact) ?? d.fact ?? null;
    },
  };
}
