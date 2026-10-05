/**
 * MODO PRÁCTICA -- los 5 retos (Comprensión Lectora, Ahorcado, Contrarreloj,
 * Encontrá el Error, Ortografía) también se pueden jugar SOLO: sin rival, sin
 * apuesta de gemas y sin esperar a nadie. Es para repasar las veces que se
 * quiera; no cuenta para el ranking, las rachas ni las ligas.
 *
 * El contenido se genera igual que en un reto (misma IA / mismo generador SQL),
 * pero se pide con { practice: true } a las edge functions, que lo devuelven
 * directo en vez de guardarlo en un duelo. Como en práctica no hay nada en
 * juego, la respuesta correcta viaja al cliente y se corrige ahí mismo (cada
 * juego lo hace en su archivo: startPracticeQuiz / startPracticeHangman / ...).
 *
 * Para que no se repita lo mismo entre una práctica y otra, se recuerdan en el
 * dispositivo las últimas palabras/preguntas/errores que ya salieron y se le
 * piden a la IA que las evite.
 */

const SEEN_MAX = 40;
const seenKey = (game) => `px_practice_seen_${window.currentUser?.id || 'anon'}_${game}`;

function getSeen(game) {
  try { return JSON.parse(localStorage.getItem(seenKey(game)) || '[]'); } catch { return []; }
}
function addSeen(game, items) {
  try {
    const list = [...items.filter(Boolean).map(String), ...getSeen(game)];
    localStorage.setItem(seenKey(game), JSON.stringify([...new Set(list)].slice(0, SEEN_MAX)));
  } catch { /* sin almacenamiento: simplemente no se recuerda */ }
}

async function callGenerator(fn, body) {
  const { data: { session } } = await window._supabase.auth.getSession();
  const res = await fetch(`${window.SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
    body: JSON.stringify({ practice: true, ...body }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'No se pudo preparar la práctica');
  return out;
}

// Con conexión, la práctica SIEMPRE se genera con la IA (contenido nuevo cada
// vez). Sin internet, o si la IA no responde, se usa el banco guardado en el
// dispositivo (js/practice-bank.js), para poder practicar igual en un salón sin
// señal. Se avisa con un mensaje cuando se usó el banco.
let lastSource = 'ai';
async function aiOrBank(game, ai, bank) {
  lastSource = 'ai';
  if (navigator.onLine !== false) {
    try { return await ai(); } catch (err) { console.warn(`Práctica (${game}): la IA no respondió, se usa el banco`, err); }
  }
  const out = bank();
  if (!out) throw new Error('No hay conexión y no hay ejercicios guardados para este juego');
  lastSource = 'bank';
  window.showToast('<i class="fas fa-cloud-slash"></i> Sin conexión con la IA: te toca un ejercicio guardado', 'info');
  return out;
}

// Qué pide y cómo arranca cada juego.
const LOADERS = {
  quiz: async (topic) => {
    const out = await aiOrBank('quiz',
      async () => {
        const r = await callGenerator('ai-generate-quiz', { topic, count: 5, avoid: getSeen('quiz') });
        if (!r.questions?.length) throw new Error('sin preguntas');
        return r;
      },
      () => {
        const t = window.practiceBankPick?.('reading', getSeen('quiz'));
        if (!t) return null;
        // Las opciones se mezclan para que la correcta no esté siempre en el mismo lugar.
        const questions = t.questions.map((q) => {
          const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
          return { question: q.question, options: order.map(k => q.options[k]), correctIndex: order.indexOf(q.correctIndex) };
        });
        return { title: t.title, passage: t.passage, questions, fact: t.fact };
      });
    addSeen('quiz', [out.title, out.passage?.slice(0, 80)]);
    const src = lastSource;
    return () => { window.PracticeLog.begin('quiz', topic, src); window.startPracticeQuiz({ topic, questions: out.questions, fact: out.fact, title: out.title, passage: out.passage }); };
  },
  hangman: async (topic) => {
    const out = await aiOrBank('hangman',
      () => callGenerator('ai-generate-hangman-word', { topic, avoid: getSeen('hangman') }),
      () => window.practiceBankPick?.('hangman', getSeen('hangman')));
    addSeen('hangman', [out.word]);
    const src = lastSource;
    return () => { window.PracticeLog.begin('hangman', topic, src); window.startPracticeHangman(out); };
  },
  spelling: async (topic) => {
    const out = await aiOrBank('spelling',
      () => callGenerator('ai-generate-spelling-word', { topic, avoid: getSeen('spelling') }),
      () => window.practiceBankPick?.('spelling', getSeen('spelling')));
    addSeen('spelling', [out.word]);
    const src = lastSource;
    return () => { window.PracticeLog.begin('spelling', topic, src); window.startPracticeSpelling(out); };
  },
  debug: async (topic) => {
    const out = await aiOrBank('debug',
      async () => {
        const r = await callGenerator('ai-generate-debug-steps', { topic, avoid: getSeen('debug') });
        if (!r.steps?.length) throw new Error('sin afirmaciones');
        return r;
      },
      () => window.practiceBankPick?.('debug', getSeen('debug')));
    addSeen('debug', [out.steps.find(s => s.isBug)?.label]);
    const src = lastSource;
    return () => { window.PracticeLog.begin('debug', topic, src); window.startPracticeDebug({ steps: out.steps, topic, fact: out.fact }); };
  },
  // Sin IA y sin servidor: los problemas se generan acá mismo, según el grado
  // (mismo criterio que la función SQL de los retos), así que funciona sin internet.
  timed_math: async () => {
    const data = window.practiceMathProblems(window.userData?.grade || '', 10);
    return () => { window.PracticeLog.begin('timed_math', null, 'bank'); window.startPracticeTimedMath(data); };
  },
};

// Intro corta de cada juego en la práctica (un solo toque para empezar).
const NEEDS_TOPIC = (game) => game !== 'timed_math';

async function run(game, topic) {
  if (!window.aiGenerationLock.tryAcquire()) return;
  window.showToast('<i class="fas fa-circle-notch fa-spin"></i> Preparando tu práctica...', 'info');
  try {
    const start = await LOADERS[game](topic);
    start();
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
  } finally {
    window.aiGenerationLock.release();
  }
}

// Registro de cada práctica terminada (para "Mi progreso" y los reportes del
// docente). Con conexión se sube al momento; sin conexión (o si falla la red)
// queda en la cola de sincronización y se sube sola al reconectar, igual que
// las notas de los exámenes. Solo cuenta si el estudiante terminó la actividad.
const newRef = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));

window.PracticeLog = {
  cur: null,
  begin(game, topic, source) { this.cur = { game, topic: topic || null, source: source || 'ai', t0: performance.now() }; },
  async finish(correct, total) {
    const c = this.cur; this.cur = null;
    if (!c || window.userRole !== 'estudiante' || !window.currentUser || !total) return;
    const row = {
      p_game: c.game, p_topic: c.topic, p_correct: Math.max(0, Math.min(correct, total)), p_total: total,
      p_duration_ms: Math.round(performance.now() - c.t0), p_source: c.source,
      p_client_ref: newRef(), p_played_at: new Date().toISOString(),
    };
    const queue = async () => { try { await window._syncManager?.enqueue('log_practice', row); } catch (_) { /* sin cola: se pierde este registro */ } };
    if (navigator.onLine === false) return queue();
    try {
      const { error } = await window._supabase.rpc('log_practice', row);
      if (!error) return;
      // Error de red -> se reintenta luego; error del servidor (ej. SQL sin correr) -> no se encola.
      if (/fetch|network|offline|timeout/i.test(error.message || '')) return queue();
      console.warn('No se pudo registrar la práctica:', error.message);
    } catch (_) {
      return queue();
    }
  },
};

window.PracticeMode = {
  async start(game) {
    const g = window.GameArena?.GAMES?.[game];
    if (!g || !LOADERS[game]) return;
    if (!NEEDS_TOPIC(game)) return run(game, null);

    // El tema se elige igual que al retar: tema de la semana, repaso de la
    // clase o un tema del banco general.
    await window.loadClassTopics?.();
    const pool = window.getDuelTopicPoolForCurrentUser ? window.getDuelTopicPoolForCurrentUser() : [];
    document.getElementById('practice-topic-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'practice-topic-modal';
    modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
      <div class="glass-card w-full max-w-md p-8 shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
        <h2 class="text-lg font-bold text-white uppercase tracking-tighter mb-1"><i class="fas ${g.icon} text-emerald-400 mr-2"></i> Práctica: ${g.label}</h2>
        <p class="text-xs text-slate-400 mb-5">Solo vos, sin rival y sin apostar gemas. Practicá las veces que quieras.</p>
        <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Tema</label>
        <select id="practice-topic" class="input-field-tw h-11 text-sm">${window.topicOptionsHtml(game === 'quiz' ? (window.getReadingTopicPool?.() || pool) : pool)}</select>
        <div class="flex gap-3 mt-8">
          <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" data-close>Cancelar</button>
          <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" data-go><i class="fas fa-play"></i> Empezar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick = () => modal.remove();
    modal.querySelector('[data-go]').onclick = () => {
      const topic = window.resolveDuelTopic(modal.querySelector('#practice-topic').value, game === 'quiz' ? window.getReadingTopicPool?.() : null);
      modal.remove();
      run(game, topic);
    };
  },
};
