// Retos «Contrarreloj» (matemática contra reloj, 1 contra 1) en la capa local. Mismas reglas que la nube (migrations: generate_math_problems,
// accept/start/submit_timed_math_*, finish_student_duel). Cada jugador recibe SUS problemas (distintos), el navegador nunca ve las respuestas, y el
// puntaje y el tiempo los calcula el nodo. La nube es quien liquida de verdad: el nodo sube UNA foto del duelo (bandeja `timed_math_duel`, la última
// gana) y la nube recalcula puntajes con las respuestas y reparte gemas y XP (apply_node_timed_math_duel). Mientras tanto aquí se ve el resultado
// al instante (gemas y XP en la vista de `students`). Los retos de quiz, ortografía y depuración usan IA para crear el contenido: solo con internet.
import crypto from 'node:crypto';
import { RestError } from './query.js';

export const DUEL_TABLE = 'student_timed_math_duels';
export const RESULT_TABLE = 'student_timed_math_results';
export const DUEL_FN = 'timed_math_duel';
export const PROBLEM_COUNT = 10;
export const XP_PARTICIPATION = 5;
export const XP_WIN = 15;
const MAX_PENDING_DUELS = 30;
const bad = (message, status = 400) => new RestError(status, message, 'P0001');

/** Nivel numérico por grado, igual que generate_math_problems de la nube. */
export function rankOf(grade) {
  const g = String(grade ?? '').toLowerCase();
  if (g.includes('primaria')) return /^(1ro|2do|3ro)/.test(g) ? 2 : 5;
  if (g.includes('básico') || g.includes('basico')) return 8;
  if (g.includes('diversificado')) return 11;
  return 5;
}

const PLUS = [
  'Un bus llevaba %s pasajeros y en la siguiente parada subieron %s más. ¿Cuántos pasajeros lleva ahora?',
  'En la tienda escolar vendieron %s panes en la mañana y %s en la tarde. ¿Cuántos panes vendieron en total?',
  'Una cooperativa empacó %s quintales de café el lunes y %s el martes. ¿Cuántos quintales empacó en total?',
  'Un agricultor cosechó %s costales de maíz el lunes y %s costales más el martes. ¿Cuántos costales tiene en total?',
];
const MINUS = [
  'Había %s huevos en la granja y se vendieron %s. ¿Cuántos huevos quedan?',
  'Un camión salía con %s cajas de tomate y entregó %s en el mercado. ¿Cuántas cajas le quedan?',
  'Una tienda tenía %s libras de azúcar y vendió %s. ¿Cuántas libras le quedan?',
  'En un vivero hay %s árboles y ya se trasplantaron %s. ¿Cuántos árboles faltan por trasplantar?',
];
const MULT = [
  'Un vivero siembra %s hileras con %s plantas cada una. ¿Cuántas plantas hay en total?',
  'Cada canasta tiene %s naranjas. Si hay %s canastas, ¿cuántas naranjas hay en total?',
  'Un salón tiene %s filas de %s pupitres cada una. ¿Cuántos pupitres hay en total?',
  'Una avícola guarda %s huevos en cada cartón. ¿Cuántos huevos hay en %s cartones?',
];
const fill = (tpl, a, b) => { let i = 0; return tpl.replace(/%s/g, () => [a, b][i++]); };

/** Problemas del nivel del grado, sin repetir preguntas dentro de un mismo juego. [{ question, answer }] */
export function generateMathProblems(grade, count = PROBLEM_COUNT, random = Math.random) {
  const rank = rankOf(grade);
  const int = (n) => Math.floor(random() * n);
  const pick = (list) => list[int(list.length)];
  const percents = [10, 20, 25, 50, 75];
  const bases = [40, 80, 100, 200, 50];
  const seen = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    let question, answer;
    for (let tries = 1; ; tries++) {
      let a, b, op;
      if (rank <= 3) {
        a = int(20) + 1; b = int(20) + 1;
        if (random() < 0.5) { op = '+'; answer = a + b; } else { if (a < b) [a, b] = [b, a]; op = '-'; answer = a - b; }
      } else if (rank <= 6) {
        const k = int(3);
        if (k === 0) { a = int(100) + 1; b = int(100) + 1; op = '+'; answer = a + b; }
        else if (k === 1) { a = int(100) + 1; b = int(100) + 1; if (a < b) [a, b] = [b, a]; op = '-'; answer = a - b; }
        else { a = int(10) + 1; b = int(10) + 1; op = '×'; answer = a * b; }
      } else if (rank <= 9) {
        const k = int(3);
        if (k === 0) { a = int(20) + 2; b = int(20) + 2; op = '×'; answer = a * b; }
        else if (k === 1) { b = int(10) + 2; answer = int(15) + 1; a = b * answer; op = '÷'; }
        else { a = int(10) + 2; b = int(3) + 2; op = '^'; answer = a ** b; }
      } else if (random() < 0.5) { a = int(15) + 1; answer = int(15) + 1; b = a + answer; op = 'x+'; }
      else { a = pick(percents); b = pick(bases); answer = Math.round((a * b) / 100); op = '%'; }

      // Con texto, las cantidades son de al menos 2 («1 huevos» sonaba mal) y la respuesta se recalcula.
      if (rank > 3 && (op === '+' || op === '-' || op === '×')) {
        a = Math.max(a, 2); b = Math.max(b, 2);
        if (op === '-' && a < b) [a, b] = [b, a];
        answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
      }
      if (rank > 3 && op === '+') question = fill(pick(PLUS), a, b);
      else if (rank > 3 && op === '-') question = fill(pick(MINUS), a, b);
      else if (rank > 3 && op === '×') question = fill(pick(MULT), a, b);
      else if (op === 'x+') question = `x + ${a} = ${b}  (¿cuánto vale x?)`;
      else if (op === '%') question = `¿Cuánto es el ${a}% de ${b}?`;
      else if (op === '^') question = `${a}^${b}`;
      else question = `${a} ${op} ${b}`;
      if (tries >= 25 || !seen.has(question)) break;
    }
    seen.add(question);
    out.push({ question, answer });
  }
  return out;
}

const answerNumber = (v) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) && String(v).trim() !== '' ? n : null;
};
const scoreOf = (problems, answers) => problems.reduce((s, p, i) => {
  const n = answerNumber(answers?.[i]);
  return s + (n !== null && Math.abs(n - p.answer) < 0.01 ? 1 : 0);
}, 0);

export function createDuels({ store, xp, now = Date.now, random = Math.random }) {
  const iso = () => new Date(now()).toISOString();
  const rawDuel = (id) => store.raw(DUEL_TABLE).find((d) => d.id === id) ?? null;
  const resultsOf = (id) => store.raw(RESULT_TABLE).filter((r) => r.duel_id === id);
  const studentOf = (uid) => { const raw = store.raw('students').find((s) => s.id === uid); return raw ? xp.overlay()(raw) : null; };
  const sameSchool = (a, b) => !!a && !!b && a.school_code === b.school_code;

  /** La foto que viaja a la nube: el duelo, sus problemas, las respuestas jugadas y cómo se liquidó aquí. */
  function snapshot(d) {
    return {
      id: d.id, challenger_id: d.challenger_id, opponent_id: d.opponent_id, wager_gems: d.wager_gems, problem_count: d.problem_count,
      status: d.status, winner_id: d.winner_id ?? null, created_at: d.created_at, resolved_at: d.resolved_at ?? null,
      problems: d.problems ?? null, problems_b: d.problems_b ?? null,
      challenger_started_at: d.challenger_started_at ?? null, opponent_started_at: d.opponent_started_at ?? null,
      results: resultsOf(d.id).map((r) => ({ student_id: r.student_id, answers: r.answers, score: r.score, time_ms: r.time_ms, completed_at: r.completed_at })),
      settle: d.settle ?? null,
    };
  }
  const queue = (id) => {
    const d = rawDuel(id);
    if (!d) return;
    store.replacePendingRpc(DUEL_FN, id, { student_id: d.challenger_id, args: snapshot(d) });
  };

  const load = (id, uid) => {
    if (typeof id !== 'string') throw bad('Desafío no encontrado');
    const d = rawDuel(id);
    if (!d || (d.challenger_id !== uid && d.opponent_id !== uid)) throw bad('Desafío no encontrado');
    return d;
  };
  const asStudent = (ctx) => { if (ctx?.role !== 'student') throw bad('Solo los estudiantes juegan retos'); return ctx.uid; };

  /** Reparte el resultado cuando jugaron los dos: ganador por puntaje y luego por tiempo; empate sin ganador. */
  function settle(d) {
    const [r1, r2] = [resultsOf(d.id).find((r) => r.student_id === d.challenger_id), resultsOf(d.id).find((r) => r.student_id === d.opponent_id)];
    let winner = null;
    if (r1.score !== r2.score) winner = r1.score > r2.score ? d.challenger_id : d.opponent_id;
    else if (r1.time_ms !== r2.time_ms) winner = r1.time_ms < r2.time_ms ? d.challenger_id : d.opponent_id;
    const gemsDelta = {};
    if (winner && d.wager_gems > 0) {
      const loserId = winner === d.challenger_id ? d.opponent_id : d.challenger_id;
      const transfer = Math.min(d.wager_gems, Math.max(0, Number(studentOf(loserId)?.gems) || 0));
      gemsDelta[winner] = transfer; gemsDelta[loserId] = -transfer;
    }
    const xpDelta = { [d.challenger_id]: XP_PARTICIPATION, [d.opponent_id]: XP_PARTICIPATION };
    if (winner) xpDelta[winner] += XP_WIN;
    store.put(DUEL_TABLE, { ...d, status: 'completed', winner_id: winner, resolved_at: iso(), settle: { gems: gemsDelta, xp: xpDelta } });
  }

  return {
    queue,
    /** Después de insertar o cambiar el estado desde la app (REST): la foto se actualiza en la bandeja. */
    onDuelChange: (row) => { if (row?.id) queue(row.id); },

    accept(args, ctx) {
      const uid = asStudent(ctx);
      const d = load(args?.p_duel_id, uid);
      if (d.opponent_id !== uid) throw bad('Solo el rival puede aceptar este desafío');
      if (d.status === 'active') return { ok: true };
      if (d.status !== 'pending') throw bad('Este desafío ya no está disponible');
      const me = studentOf(d.opponent_id), them = studentOf(d.challenger_id);
      const first = generateMathProblems(them?.grade, d.problem_count, random);
      const seen = new Set(first.map((p) => p.question));
      let second = [];
      for (let t = 0; t < 5; t++) { second = generateMathProblems(me?.grade, d.problem_count, random); if (!second.some((p) => seen.has(p.question))) break; }
      store.put(DUEL_TABLE, { ...d, status: 'active', problems: first, problems_b: second });
      queue(d.id);
      return { ok: true };
    },

    start(args, ctx) {
      const uid = asStudent(ctx);
      const d = load(args?.p_duel_id, uid);
      if (d.status !== 'active' || !d.problems) throw bad('Este desafío todavía no está activo');
      if (resultsOf(d.id).some((r) => r.student_id === uid)) throw bad('Ya jugaste este desafío');
      const isChallenger = d.challenger_id === uid;
      const key = isChallenger ? 'challenger_started_at' : 'opponent_started_at';
      const problems = isChallenger ? d.problems : (d.problems_b || d.problems);
      // Reabrir la pantalla no reinicia el reloj: manda la primera vez que arrancó.
      if (!d[key]) { store.put(DUEL_TABLE, { ...d, [key]: iso() }); queue(d.id); }
      return { questions: problems.map((p) => p.question) };
    },

    submit(args, ctx) {
      const uid = asStudent(ctx);
      const d = load(args?.p_duel_id, uid);
      if (resultsOf(d.id).some((r) => r.student_id === uid)) throw bad('Ya jugaste este desafío');
      if (d.status !== 'active') throw bad('Este desafío no está activo');
      const isChallenger = d.challenger_id === uid;
      const startedAt = isChallenger ? d.challenger_started_at : d.opponent_started_at;
      if (!startedAt) throw bad('Todavía no arrancaste este desafío');
      const problems = isChallenger ? d.problems : (d.problems_b || d.problems);
      const answers = Array.isArray(args?.p_answers) ? args.p_answers.slice(0, problems.length).map((a) => String(a ?? '').slice(0, 30)) : [];
      const score = scoreOf(problems, answers);
      const time_ms = Math.max(0, Math.round(now() - Date.parse(startedAt)));
      store.put(RESULT_TABLE, { id: `${d.id}:${uid}`, duel_id: d.id, student_id: uid, score, time_ms, answers, completed_at: iso() });
      if (resultsOf(d.id).length >= 2) settle(rawDuel(d.id));
      queue(d.id);
      return { score, total: problems.length, time_ms };
    },

    /** ¿Cuántos duelos de este estudiante esperan subirse? (límite para no llenar la bandeja) */
    pendingCount: (uid) => store.pendingRpcCount(DUEL_FN, uid),
    MAX_PENDING_DUELS,

    /** Vista de `students`: lo que cambió por duelos ya jugados aquí y que la nube aún no confirma. */
    overlayStudents() {
      const deltas = new Map();
      for (const e of store.pending()) {
        if (e.table !== '_rpc' || e.op !== DUEL_FN || !e.row?.args?.settle) continue;
        const { gems = {}, xp: xps = {} } = e.row.args.settle;
        for (const [id, g] of Object.entries(gems)) deltas.set(id, { gems: (deltas.get(id)?.gems || 0) + g, xp: deltas.get(id)?.xp || 0 });
        for (const [id, x] of Object.entries(xps)) deltas.set(id, { gems: deltas.get(id)?.gems || 0, xp: (deltas.get(id)?.xp || 0) + x });
      }
      if (!deltas.size) return (row) => row;
      return (row) => { const d = deltas.get(row.id); return d ? { ...row, gems: (Number(row.gems) || 0) + d.gems, xp: (Number(row.xp) || 0) + d.xp } : row; };
    },
  };
}
