/**
 * MODO PRÁCTICA -- los 5 retos (Desafío de Código, Ahorcado, Contrarreloj,
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

// Qué pide y cómo arranca cada juego.
const LOADERS = {
  quiz: async (topic) => {
    const out = await callGenerator('ai-generate-quiz', { topic, count: 5, avoid: getSeen('quiz') });
    if (!out.questions?.length) throw new Error('No se pudieron preparar las preguntas');
    addSeen('quiz', out.questions.map(q => q.question));
    return () => window.startPracticeQuiz({ topic, questions: out.questions, fact: out.fact });
  },
  hangman: async (topic) => {
    const out = await callGenerator('ai-generate-hangman-word', { topic, avoid: getSeen('hangman') });
    addSeen('hangman', [out.word]);
    return () => window.startPracticeHangman(out);
  },
  spelling: async (topic) => {
    const out = await callGenerator('ai-generate-spelling-word', { topic, avoid: getSeen('spelling') });
    addSeen('spelling', [out.word]);
    return () => window.startPracticeSpelling(out);
  },
  debug: async (topic) => {
    const out = await callGenerator('ai-generate-debug-steps', {
      topic, avoid: getSeen('debug'),
    });
    if (!out.steps?.length) throw new Error('No se pudo preparar la práctica');
    addSeen('debug', [out.steps.find(s => s.isBug)?.label]);
    return () => window.startPracticeDebug({ steps: out.steps, topic, fact: out.fact });
  },
  // Sin IA: el generador SQL arma los problemas según el grado.
  timed_math: async () => {
    const { data, error } = await window._supabase.rpc('generate_math_problems', {
      p_grade: window.userData?.grade || '', p_count: 10,
    });
    if (error || !data?.length) throw new Error(error?.message || 'No se pudieron preparar los problemas');
    return () => window.startPracticeTimedMath(data);
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
        <select id="practice-topic" class="input-field-tw h-11 text-sm">${window.topicOptionsHtml(pool)}</select>
        <div class="flex gap-3 mt-8">
          <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" data-close>Cancelar</button>
          <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" data-go><i class="fas fa-play"></i> Empezar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick = () => modal.remove();
    modal.querySelector('[data-go]').onclick = () => {
      const topic = window.resolveDuelTopic(modal.querySelector('#practice-topic').value);
      modal.remove();
      run(game, topic);
    };
  },
};
