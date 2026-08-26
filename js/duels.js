/**
 * DUELOS 1V1 -- quiz de trivia generado por IA entre estudiantes, con
 * apuesta de gemas.
 */

window.loadDuelsSection = async function loadDuelsSection() {
  const container = document.getElementById('duels-section');
  if (!container) return;
  const _supabase = window._supabase;
  const currentUser = window.currentUser;

  const { data: duels } = await _supabase.from('student_duels')
    .select('id, challenger_id, opponent_id, wager_gems, topic, question_count, status, winner_id, created_at, resolved_at, challenger:students!challenger_id(full_name), opponent:students!opponent_id(full_name)')
    .or(`challenger_id.eq.${currentUser.id},opponent_id.eq.${currentUser.id}`)
    .order('created_at', { ascending: false })
    .limit(10);

  window._duelsCache = duels || [];
  window.renderDuelsSection();
  if (typeof window.updateDuelPendingBadge === 'function') window.updateDuelPendingBadge();
}

window.renderDuelsSection = function renderDuelsSection() {
  const container = document.getElementById('duels-section');
  if (!container) return;
  const currentUser = window.currentUser;
  const duels = window._duelsCache || [];
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const createBtnHtml = `
    <div class="glass-card p-6 text-center border-dashed border-2 border-white/10 bg-transparent hover:border-white/20 transition-all cursor-pointer group mb-4" onclick="window.openCreateDuelModal()">
        <div class="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <i class="fas fa-plus text-lg text-white/40 group-hover:text-white/70 transition-colors"></i>
        </div>
        <p class="text-xs font-black text-white uppercase tracking-widest">Crear Desafío 1v1</p>
        <p class="text-[0.6rem] font-bold text-slate-500 mt-1">Apuesta gemas y gana XP extra</p>
    </div>
  `;

  if (!duels.length) {
    container.innerHTML = createBtnHtml;
    return;
  }

  container.innerHTML = createBtnHtml + `
    <div class="space-y-2">
      ${duels.map(d => {
        const isChallenger = d.challenger_id === currentUser.id;
        const opponentName = isChallenger ? (d.opponent?.full_name || 'Rival') : (d.challenger?.full_name || 'Rival');
        let statusHtml = '';
        let actionHtml = '';

        if (d.status === 'pending' && !isChallenger) {
          statusHtml = `<span class="text-[0.6rem] font-black uppercase text-amber-400">Te retó -- ${d.wager_gems} gemas</span>`;
          actionHtml = `
            <button class="h-8 px-3 rounded-lg bg-emerald-500 text-white text-[0.6rem] font-black uppercase mr-2" onclick="window.respondDuel('${d.id}', true)">Aceptar</button>
            <button class="h-8 px-3 rounded-lg bg-rose-500 text-white text-[0.6rem] font-black uppercase" onclick="window.respondDuel('${d.id}', false)">Rechazar</button>
          `;
        } else if (d.status === 'pending' && isChallenger) {
          statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-400">Esperando respuesta...</span>`;
        } else if (d.status === 'rejected') {
          statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-500">Rechazado</span>`;
        } else if (d.status === 'active') {
          statusHtml = `<span class="text-[0.6rem] font-black uppercase text-primary">En curso -- ${d.wager_gems} gemas</span>`;
          actionHtml = `<button class="h-8 px-4 rounded-lg bg-primary text-white text-[0.6rem] font-black uppercase" onclick="window.openDuelQuiz('${d.id}')">Jugar</button>`;
        } else if (d.status === 'completed') {
          const won = d.winner_id === currentUser.id;
          const tie = !d.winner_id;
          statusHtml = tie
            ? `<span class="text-[0.6rem] font-black uppercase text-slate-400">Empate</span>`
            : won
              ? `<span class="text-[0.6rem] font-black uppercase text-emerald-400"><i class="fas fa-trophy"></i> Ganaste +${d.wager_gems} gemas</span>`
              : `<span class="text-[0.6rem] font-black uppercase text-rose-400">Perdiste</span>`;
        }

        return `
          <div class="glass-card p-4 flex items-center justify-between gap-3 bg-white/5 border-white/5">
            <div class="min-w-0">
              <div class="text-xs font-bold text-white truncate">vs ${sanitizeInput(opponentName)}</div>
              <div class="text-[0.6rem] text-slate-500 truncate">${sanitizeInput(d.topic)}</div>
              ${statusHtml}
            </div>
            <div class="shrink-0 flex items-center">${actionHtml}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

window.openCreateDuelModal = async function openCreateDuelModal() {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const userData = window.userData;

  const { data: classmates } = await _supabase.from('students')
    .select('id, full_name')
    .eq('school_code', userData.school_code).eq('grade', userData.grade).eq('section', userData.section)
    .neq('id', currentUser.id)
    .order('full_name');

  if (!classmates?.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No hay compañeros en tu clase para retar', 'error');

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-8 shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
      <h2 class="text-lg font-bold text-white uppercase tracking-tighter mb-6"><i class="fas fa-swords text-rose-500 mr-2"></i> Crear Desafío 1v1</h2>
      <div class="space-y-4">
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Rival</label>
          <select id="duel-opponent" class="input-field-tw h-11 text-sm">
            ${classmates.map(c => `<option value="${c.id}">${window.sanitizeInput(c.full_name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Tema del quiz</label>
          <input type="text" id="duel-topic" placeholder="Ej: robótica, cultura STEAM, matemática..." class="input-field-tw h-11 text-sm">
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Preguntas</label>
            <select id="duel-question-count" class="input-field-tw h-11 text-sm">
              <option value="5">5</option>
              <option value="10">10</option>
            </select>
          </div>
          <div>
            <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Gemas a apostar</label>
            <input type="number" id="duel-wager" min="0" value="10" class="input-field-tw h-11 text-sm">
            <p class="text-[0.6rem] text-slate-500 mt-1">Tenés ${userData?.gems ?? 0} gemas.</p>
          </div>
        </div>
      </div>
      <div class="flex gap-3 mt-8">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-send-duel" onclick="window.sendDuelChallenge()"><i class="fas fa-paper-plane"></i> Retar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.sendDuelChallenge = async function sendDuelChallenge() {
  const opponentId = document.getElementById('duel-opponent')?.value;
  const topic = document.getElementById('duel-topic')?.value.trim();
  const questionCount = parseInt(document.getElementById('duel-question-count')?.value) || 5;
  const wager = parseInt(document.getElementById('duel-wager')?.value) || 0;
  const btn = document.getElementById('btn-send-duel');
  const userData = window.userData;

  if (!topic) return window.showToast('<i class="fas fa-circle-xmark"></i> Ponele un tema', 'error');
  if (wager < 0) return window.showToast('<i class="fas fa-circle-xmark"></i> La apuesta no puede ser negativa', 'error');
  if (wager > (userData?.gems ?? 0)) return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés suficientes gemas', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const { error } = await window._supabase.from('student_duels').insert({
    challenger_id: window.currentUser.id,
    opponent_id: opponentId,
    wager_gems: wager,
    topic,
    question_count: questionCount,
  });

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Retar';
    return;
  }

  window.showToast('<i class="fas fa-circle-check"></i> ¡Reto enviado!', 'success');
  document.querySelector('.fixed.z-\\[210\\]')?.remove();
  window.loadDuelsSection();
}

window.respondDuel = async function respondDuel(duelId, accept) {
  if (!accept) {
    await window._supabase.from('student_duels').update({ status: 'rejected' }).eq('id', duelId);
    window.showToast('<i class="fas fa-circle-check"></i> Reto rechazado', 'success');
    return window.loadDuelsSection();
  }

  const duel = (window._duelsCache || []).find(d => d.id === duelId);
  const userData = window.userData;
  if (duel && duel.wager_gems > (userData?.gems ?? 0)) {
    return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés suficientes gemas para aceptar esta apuesta', 'error');
  }

  window.showToast('<i class="fas fa-circle-notch fa-spin"></i> Generando preguntas...', 'info');
  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/ai-generate-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ duel_id: duelId }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error generando el quiz');
    window.showToast('<i class="fas fa-circle-check"></i> ¡Reto aceptado! Ya podés jugar', 'success');
    window.loadDuelsSection();
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
  }
}

window.openDuelQuiz = async function openDuelQuiz(duelId) {
  const { data: duel, error: duelErr } = await window._supabase.from('student_duels')
    .select('id, topic, question_count, status').eq('id', duelId).single();
  if (duelErr || !duel) return window.showToast('<i class="fas fa-circle-xmark"></i> No se pudo cargar el duelo', 'error');

  const { data: myAnswer } = await window._supabase.from('student_duel_answers').select('id').eq('duel_id', duelId).eq('student_id', window.currentUser.id).maybeSingle();
  if (myAnswer) return window.showToast('<i class="fas fa-circle-info"></i> Ya respondiste este duelo -- esperá a tu rival', 'info');

  // Las preguntas se piden vía RPC porque el correctIndex nunca viaja al
  // cliente hasta después de responder (ver migración duel-harden.sql).
  const { data: questions, error: qErr } = await window._supabase.rpc('get_duel_questions', { p_duel_id: duelId });
  if (qErr || !questions?.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No se pudo cargar el quiz', 'error');

  duel.questions = questions;
  window._activeDuel = { duel, index: 0, selections: [] };
  window.renderDuelQuizQuestion();
}

window.renderDuelQuizQuestion = function renderDuelQuizQuestion() {
  const state = window._activeDuel;
  if (!state) return;
  const { duel, index } = state;
  const q = duel.questions[index];
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  document.getElementById('duel-quiz-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'duel-quiz-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-8 shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
      <div class="flex justify-between items-center mb-6">
        <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest">Pregunta ${index + 1} / ${duel.questions.length}</span>
        <span class="text-[0.6rem] font-black uppercase text-primary">${duel.topic}</span>
      </div>
      <h3 class="text-lg font-bold text-white mb-6">${sanitizeInput(q.question)}</h3>
      <div class="space-y-3">
        ${q.options.map((opt, i) => `
          <button class="w-full text-left p-4 rounded-xl bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/40 text-sm text-white transition-all" onclick="window.selectDuelAnswer(${i})">
            ${sanitizeInput(opt)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.selectDuelAnswer = function selectDuelAnswer(optionIndex) {
  const state = window._activeDuel;
  if (!state) return;
  state.selections.push(optionIndex);
  state.index++;

  if (state.index < state.duel.questions.length) {
    window.renderDuelQuizQuestion();
  } else {
    window.submitDuelAnswers();
  }
}

window.submitDuelAnswers = async function submitDuelAnswers() {
  const state = window._activeDuel;
  if (!state) return;
  const { duel, selections } = state;

  document.getElementById('duel-quiz-modal')?.remove();

  // El score se calcula EN SERVIDOR (RPC) comparando contra el correctIndex
  // real -- el cliente nunca lo tuvo, así que no puede falsificar el score.
  const { data: score, error } = await window._supabase.rpc('submit_duel_answers', {
    p_duel_id: duel.id,
    p_answers: selections,
  });

  window._activeDuel = null;

  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  window.showToast(`<i class="fas fa-circle-check"></i> ¡Respondiste! ${score}/${duel.questions.length} correctas. Esperá a que tu rival termine.`, 'success');
  window.loadDuelsSection();
}
