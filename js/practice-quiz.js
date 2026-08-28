/**
 * PRÁCTICA SOLO -- repaso individual sin rival, mismo motor de seguridad
 * que los Desafíos 1v1 (duels.js): la IA genera el quiz server-side, el
 * cliente nunca ve correctIndex, el score se calcula en el servidor.
 * Recompensa (XP/gemas) limitada a 1 vez por tema por día (ver RPC
 * submit_practice_answers en migrations/student-practice-quiz.sql).
 */

const PRACTICE_QUESTION_COUNT = 8;

window.renderPracticeQuizSection = function renderPracticeQuizSection() {
  const topics = window.DUEL_TOPIC_POOL || [];
  return `
    <p class="text-xs text-slate-400 mb-4">Elegí un tema y repasá solo, a tu ritmo. Ganás XP y gemas por acertar (una vez por tema al día).</p>
    <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
      ${topics.map(t => `
        <button class="glass-card bg-slate-800/50 border-white/10 hover:border-primary/40 p-4 text-left text-xs font-bold text-white transition-all" onclick="window.startPracticeQuiz('${window.sanitizeAttr ? window.sanitizeAttr(t) : t}')">
          <i class="fas fa-book-open text-primary mb-2 block"></i> ${window.sanitizeInput ? window.sanitizeInput(t) : t}
        </button>
      `).join('')}
    </div>
  `;
};

window.startPracticeQuiz = async function startPracticeQuiz(topic) {
  window.showToast('<i class="fas fa-circle-notch fa-spin"></i> Generando preguntas...', 'info');
  try {
    // El SELECT sobre esta tabla solo tiene permiso de columnas puntuales
    // (ver migrations/student-practice-quiz.sql -- "questions" está oculta),
    // así que después del insert hay que pedir explícitamente esas columnas
    // en vez de select() sin argumentos (que pide "*" y choca contra la
    // columna vedada, tirando "permission denied for table").
    const { data: inserted, error: insertErr } = await window._supabase.from('student_practice_sessions').insert({
      student_id: window.currentUser.id,
      topic,
      question_count: PRACTICE_QUESTION_COUNT,
    }).select('id, student_id, topic, question_count, status, created_at').single();
    if (insertErr) throw insertErr;

    const { data: { session } } = await window._supabase.auth.getSession();
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/ai-generate-practice-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ session_id: inserted.id }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error generando el quiz');

    const { data: questions, error: qErr } = await window._supabase.rpc('get_practice_questions', { p_session_id: inserted.id });
    if (qErr || !questions?.length) throw new Error('No se pudo cargar el quiz');

    window._activePractice = { sessionId: inserted.id, topic, questions, index: 0, selections: [] };
    window.renderPracticeQuizQuestion();
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
  }
};

window.renderPracticeQuizQuestion = function renderPracticeQuizQuestion() {
  const state = window._activePractice;
  if (!state) return;
  const { topic, questions, index } = state;
  const q = questions[index];
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  document.getElementById('practice-quiz-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'practice-quiz-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-8 shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
      <div class="flex justify-between items-center mb-4">
        <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest">Pregunta ${index + 1} / ${questions.length}</span>
        <span class="text-[0.6rem] font-black uppercase text-primary">${sanitizeInput(topic)}</span>
      </div>
      ${typeof window.renderCompanionSvg === 'function' ? `<div class="w-16 h-16 mx-auto mb-4">${window.renderCompanionSvg(window._myCompanionStageIndex || 0)}</div>` : ''}
      <h3 class="text-lg font-bold text-white mb-6">${sanitizeInput(q.question)}</h3>
      <div class="space-y-3">
        ${q.options.map((opt, i) => `
          <button class="w-full text-left p-4 rounded-xl bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/40 text-sm text-white transition-all" onclick="window.selectPracticeAnswer(${i})">
            ${sanitizeInput(opt)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.selectPracticeAnswer = function selectPracticeAnswer(optionIndex) {
  const state = window._activePractice;
  if (!state) return;
  state.selections.push(optionIndex);
  state.index++;

  if (state.index < state.questions.length) {
    window.renderPracticeQuizQuestion();
  } else {
    window.submitPracticeAnswers();
  }
};

window.submitPracticeAnswers = async function submitPracticeAnswers() {
  const state = window._activePractice;
  if (!state) return;
  const { sessionId, questions, selections } = state;

  document.getElementById('practice-quiz-modal')?.remove();

  // El score se calcula EN SERVIDOR (RPC) igual que en los duelos -- el
  // cliente nunca tuvo correctIndex, así que no puede falsificar el score.
  const { data: result, error } = await window._supabase.rpc('submit_practice_answers', {
    p_session_id: sessionId,
    p_answers: selections,
  });

  window._activePractice = null;
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  const rewardMsg = result.xp_awarded > 0
    ? `+${result.xp_awarded} XP y +${result.gems_awarded} gemas`
    : 'Ya usaste la recompensa de este tema hoy -- volvé mañana por más';
  window.showToast(`<i class="fas fa-circle-check"></i> ${result.score}/${questions.length} correctas. ${rewardMsg}`, 'success');

  if (result.xp_awarded > 0 && window.userData) {
    window.userData.xp = (window.userData.xp || 0) + result.xp_awarded;
    window.userData.gems = (window.userData.gems || 0) + result.gems_awarded;
  }
  if (typeof window.initGamification === 'function') window.initGamification();
};
