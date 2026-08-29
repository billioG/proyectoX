/**
 * CONTRARRELOJ 1V1 -- operaciones matemáticas cronometradas (60s), gana
 * quien saca más correctas (empate se rompe por tiempo). Async como
 * Ahorcado. A diferencia de los otros 2 desafíos, los problemas se generan
 * sin IA (función determinística en SQL según el grado), así que aceptar
 * el reto NO llama a ninguna edge function -- solo un RPC.
 */

const MATH_TIME_LIMIT_SECONDS = 60;

window.loadTimedMathSection = async function loadTimedMathSection() {
  const { data, error } = await window._supabase.from('student_timed_math_duels')
    .select('id, challenger_id, opponent_id, wager_gems, problem_count, status, winner_id, created_at, resolved_at, challenger:students!challenger_id(full_name), opponent:students!opponent_id(full_name)')
    .or(`challenger_id.eq.${window.currentUser.id},opponent_id.eq.${window.currentUser.id}`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) { console.error(error); return; }
  window._timedMathDuelsCache = data || [];
  window.renderTimedMathSection();
};

window.renderTimedMathSection = function renderTimedMathSection() {
  const container = document.getElementById('timed-math-section');
  if (!container) return;
  const currentUser = window.currentUser;
  const duels = window._timedMathDuelsCache || [];
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const createBtnHtml = `
    <div class="glass-card p-6 text-center border-dashed border-2 border-white/10 bg-transparent hover:border-white/20 transition-all cursor-pointer group mb-4" onclick="window.openCreateTimedMathModal()">
        <div class="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <i class="fas fa-plus text-lg text-white/40 group-hover:text-white/70 transition-colors"></i>
        </div>
        <p class="text-xs font-black text-white uppercase tracking-widest">Crear Contrarreloj 1v1</p>
        <p class="text-[0.6rem] font-bold text-slate-500 mt-1">${MATH_TIME_LIMIT_SECONDS}s para resolver la mayor cantidad posible</p>
    </div>
  `;

  if (!duels.length) {
    container.innerHTML = createBtnHtml;
    return;
  }

  const renderCard = (d) => {
    const isChallenger = d.challenger_id === currentUser.id;
    const opponentName = isChallenger ? (d.opponent?.full_name || 'Rival') : (d.challenger?.full_name || 'Rival');
    let statusHtml = '';
    let actionHtml = '';

    if (d.status === 'pending' && !isChallenger) {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-amber-400">Te retó -- ${d.wager_gems} gemas</span>`;
      actionHtml = `
        <button class="h-8 px-3 rounded-lg bg-emerald-500 text-white text-[0.6rem] font-black uppercase mr-2" onclick="window.respondTimedMathDuel('${d.id}', true)">Aceptar</button>
        <button class="h-8 px-3 rounded-lg bg-rose-500 text-white text-[0.6rem] font-black uppercase" onclick="window.respondTimedMathDuel('${d.id}', false)">Rechazar</button>
      `;
    } else if (d.status === 'pending' && isChallenger) {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-400">Esperando respuesta...</span>`;
      actionHtml = `<button class="h-8 px-3 rounded-lg bg-slate-700 text-white text-[0.6rem] font-black uppercase" onclick="window.cancelTimedMathDuel('${d.id}')">Cancelar</button>`;
    } else if (d.status === 'rejected') {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-500">Rechazado</span>`;
    } else if (d.status === 'cancelled') {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-500">${isChallenger ? 'Cancelaste el desafío' : 'Cancelado'}</span>`;
    } else if (d.status === 'active') {
      const myPlayed = window._myTimedMathPlayed?.has(d.id);
      statusHtml = myPlayed
        ? `<span class="text-[0.6rem] font-black uppercase text-primary">Jugaste -- esperando al rival</span>`
        : `<span class="text-[0.6rem] font-black uppercase text-primary">En curso -- ${d.wager_gems} gemas</span>`;
      actionHtml = myPlayed ? '' : `<button class="h-8 px-4 rounded-lg bg-primary text-white text-[0.6rem] font-black uppercase" onclick="window.openTimedMathGame('${d.id}')">Jugar</button>`;
    } else if (d.status === 'completed') {
      const won = d.winner_id === currentUser.id;
      const tie = !d.winner_id;
      statusHtml = tie
        ? `<span class="text-[0.6rem] font-black uppercase text-slate-400">Empate</span>`
        : won
          ? `<span class="text-[0.6rem] font-black uppercase text-emerald-400"><i class="fas fa-trophy"></i> Ganaste +${d.wager_gems} gemas</span>`
          : `<span class="text-[0.6rem] font-black uppercase text-rose-400">Perdiste</span>`;
      actionHtml = `<button class="h-8 px-3 rounded-lg bg-white/10 text-white text-[0.6rem] font-black uppercase" onclick="window.showTimedMathReview('${d.id}')"><i class="fas fa-list-check"></i> Revisar</button>`;
    }

    return `
      <div class="glass-card p-4 flex items-center justify-between gap-3 bg-white/5 border-white/5">
        <div class="min-w-0">
          <div class="text-xs font-bold text-white truncate">vs ${sanitizeInput(opponentName)}</div>
          <div class="text-[0.6rem] text-slate-500 truncate">${d.problem_count} operaciones</div>
          ${statusHtml}
        </div>
        <div class="shrink-0 flex items-center">${actionHtml}</div>
      </div>
    `;
  };

  const activeDuels = duels.filter(d => d.status === 'pending' || d.status === 'active');
  const historyDuels = duels.filter(d => d.status === 'completed' || d.status === 'cancelled' || d.status === 'rejected');

  const activeHtml = activeDuels.length ? `<div class="space-y-2">${activeDuels.map(renderCard).join('')}</div>` : '';
  const historyHtml = historyDuels.length ? `
    <div class="mt-3">
      <button class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[0.65rem] font-black uppercase tracking-widest text-slate-400 transition-colors" onclick="window.toggleTimedMathHistory()">
        <span><i class="fas fa-clock-rotate-left"></i> Historial (${historyDuels.length})</span>
        <i id="timed-math-history-chevron" class="fas fa-chevron-down transition-transform"></i>
      </button>
      <div id="timed-math-history-list" class="hidden space-y-2 mt-2">${historyDuels.map(renderCard).join('')}</div>
    </div>
  ` : '';

  container.innerHTML = createBtnHtml + activeHtml + historyHtml;
};

window.toggleTimedMathHistory = function toggleTimedMathHistory() {
  const list = document.getElementById('timed-math-history-list');
  const chevron = document.getElementById('timed-math-history-chevron');
  if (!list) return;
  list.classList.toggle('hidden');
  if (chevron) chevron.classList.toggle('rotate-180');
};

window.openCreateTimedMathModal = async function openCreateTimedMathModal() {
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
      <h2 class="text-lg font-bold text-white uppercase tracking-tighter mb-6"><i class="fas fa-stopwatch text-rose-500 mr-2"></i> Crear Contrarreloj 1v1</h2>
      <div class="space-y-4">
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Rival</label>
          <select id="timed-math-opponent" class="input-field-tw h-11 text-sm">
            ${classmates.map(c => `<option value="${c.id}">${window.sanitizeInput(c.full_name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Gemas a apostar</label>
          <input type="number" id="timed-math-wager" min="0" value="10" class="input-field-tw h-11 text-sm">
          <p class="text-[0.6rem] text-slate-500 mt-1">Tenés ${userData?.gems ?? 0} gemas.</p>
        </div>
        <p class="text-[0.65rem] text-slate-500"><i class="fas fa-info-circle text-primary"></i> 10 operaciones adaptadas a tu grado, ${MATH_TIME_LIMIT_SECONDS} segundos de reloj. Gana quien saca más correctas.</p>
      </div>
      <div class="flex gap-3 mt-8">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-send-timed-math" onclick="window.sendTimedMathChallenge()"><i class="fas fa-paper-plane"></i> Retar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.sendTimedMathChallenge = async function sendTimedMathChallenge() {
  const opponentId = document.getElementById('timed-math-opponent')?.value;
  const wager = parseInt(document.getElementById('timed-math-wager')?.value) || 0;
  const btn = document.getElementById('btn-send-timed-math');
  const userData = window.userData;

  if (wager < 0) return window.showToast('<i class="fas fa-circle-xmark"></i> La apuesta no puede ser negativa', 'error');
  if (wager > (userData?.gems ?? 0)) return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés suficientes gemas', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const { data: inserted, error } = await window._supabase.from('student_timed_math_duels').insert({
    challenger_id: window.currentUser.id,
    opponent_id: opponentId,
    wager_gems: wager,
  }).select('id').single();

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Retar';
    return;
  }

  window.showToast('<i class="fas fa-circle-check"></i> ¡Reto enviado!', 'success');
  document.querySelector('.fixed.z-\\[210\\]')?.remove();
  window.loadTimedMathSection();
  if (inserted?.id && typeof window.sendDuelPushNotification === 'function') window.sendDuelPushNotification(inserted.id, 'challenge', 'timed_math');
};

window.cancelTimedMathDuel = async function cancelTimedMathDuel(duelId) {
  await window._supabase.from('student_timed_math_duels').update({ status: 'cancelled' }).eq('id', duelId);
  window.loadTimedMathSection();
};

window.respondTimedMathDuel = async function respondTimedMathDuel(duelId, accept) {
  if (!accept) {
    await window._supabase.from('student_timed_math_duels').update({ status: 'rejected' }).eq('id', duelId);
    window.showToast('<i class="fas fa-circle-check"></i> Reto rechazado', 'success');
    return window.loadTimedMathSection();
  }

  const duel = (window._timedMathDuelsCache || []).find(d => d.id === duelId);
  const userData = window.userData;
  if (duel && duel.wager_gems > (userData?.gems ?? 0)) {
    return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés suficientes gemas para aceptar esta apuesta', 'error');
  }

  // Sin IA -- los problemas se generan con una función SQL determinística,
  // así que alcanza con un RPC, sin llamar a ninguna edge function.
  const { error } = await window._supabase.rpc('accept_timed_math_duel', { p_duel_id: duelId });
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  window.showToast('<i class="fas fa-circle-check"></i> ¡Reto aceptado! Ya podés jugar', 'success');
  window.loadTimedMathSection();
  if (typeof window.sendDuelPushNotification === 'function') window.sendDuelPushNotification(duelId, 'accepted', 'timed_math');
};

window.openTimedMathGame = async function openTimedMathGame(duelId) {
  const { data, error } = await window._supabase.rpc('start_timed_math_duel', { p_duel_id: duelId });
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  window._activeTimedMath = {
    duelId, questions: data.questions || [], index: 0, answers: [],
    secondsLeft: MATH_TIME_LIMIT_SECONDS, timerId: null,
  };
  window.renderTimedMathGame();
  window._activeTimedMath.timerId = setInterval(window.tickTimedMathClock, 1000);
};

window.tickTimedMathClock = function tickTimedMathClock() {
  const state = window._activeTimedMath;
  if (!state) return;
  state.secondsLeft--;
  const el = document.getElementById('timed-math-clock');
  if (el) el.textContent = `${state.secondsLeft}s`;
  if (state.secondsLeft <= 0) {
    window.finishTimedMathGame();
  }
};

window.renderTimedMathGame = function renderTimedMathGame() {
  const state = window._activeTimedMath;
  if (!state) return;
  const sanitizeInput = window.sanitizeInput || ((v) => v);
  const q = state.questions[state.index];

  document.getElementById('timed-math-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'timed-math-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-8 shadow-2xl animate-slideUp bg-slate-900 border border-white/10 text-center">
      <div class="flex justify-between items-center mb-4">
        <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest">Operación ${state.index + 1} / ${state.questions.length}</span>
        <span id="timed-math-clock" class="text-sm font-black text-rose-400"><i class="fas fa-stopwatch"></i> ${state.secondsLeft}s</span>
      </div>
      <h3 class="text-3xl font-black text-white mb-6">${sanitizeInput(String(q))}</h3>
      <input type="number" id="timed-math-answer-input" class="input-field-tw h-14 text-2xl text-center font-black mb-4" placeholder="?" autofocus
        onkeydown="if(event.key==='Enter') window.submitTimedMathAnswer()">
      <button class="btn-primary-tw w-full h-12 text-xs uppercase font-bold" onclick="window.submitTimedMathAnswer()">
        ${state.index + 1 < state.questions.length ? 'Siguiente' : 'Terminar'} <i class="fas fa-arrow-right"></i>
      </button>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('timed-math-answer-input')?.focus();
};

window.submitTimedMathAnswer = function submitTimedMathAnswer() {
  const state = window._activeTimedMath;
  if (!state) return;
  const input = document.getElementById('timed-math-answer-input');
  state.answers.push(input?.value ?? '');
  state.index++;

  if (state.index < state.questions.length) {
    window.renderTimedMathGame();
  } else {
    window.finishTimedMathGame();
  }
};

window.finishTimedMathGame = async function finishTimedMathGame() {
  const state = window._activeTimedMath;
  if (!state) return;
  clearInterval(state.timerId);
  document.getElementById('timed-math-modal')?.remove();
  window._activeTimedMath = null;

  // Si se acabó el tiempo antes de responder todas, las que faltan quedan
  // vacías -- el servidor las cuenta como mal, no rompe el submit.
  const { data: result, error } = await window._supabase.rpc('submit_timed_math_result', {
    p_duel_id: state.duelId,
    p_answers: state.answers,
  });
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  window._myTimedMathPlayed = window._myTimedMathPlayed || new Set();
  window._myTimedMathPlayed.add(state.duelId);

  window.showToast(`<i class="fas fa-circle-check"></i> ${result.score}/${result.total} correctas en ${(result.time_ms / 1000).toFixed(1)}s. Esperá a que tu rival termine.`, 'success');
  window.loadTimedMathSection();
};

window.showTimedMathReview = async function showTimedMathReview(duelId) {
  const { data: duel } = await window._supabase.from('student_timed_math_duels').select('winner_id, problem_count').eq('id', duelId).maybeSingle();
  const { data: results } = await window._supabase.from('student_timed_math_results').select('student_id, score, time_ms').eq('duel_id', duelId);
  if (!results?.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No se pudo cargar la retroalimentación', 'error');

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[235] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-sm p-6 shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-sm font-black text-white uppercase tracking-widest"><i class="fas fa-list-check text-primary mr-1"></i> Resultado</h3>
        <button class="w-9 h-9 rounded-xl bg-white/5 text-slate-400 hover:text-rose-500 flex items-center justify-center" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="space-y-2">
        ${results.map(r => {
          const isMe = r.student_id === window.currentUser.id;
          return `
          <div class="p-3 rounded-xl bg-white/5 border ${r.student_id === duel?.winner_id ? 'border-emerald-500/30' : 'border-white/5'} text-left text-xs text-slate-300">
            <span class="font-bold text-white">${isMe ? 'Vos' : 'Rival'}</span> --
            ${r.score}/${duel?.problem_count ?? '?'} correctas en ${(r.time_ms / 1000).toFixed(1)}s
            ${r.student_id === duel?.winner_id ? ' <i class="fas fa-trophy text-amber-400"></i>' : ''}
          </div>
        `;
        }).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};
