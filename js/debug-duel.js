/**
 * ENCONTRÁ EL ERROR 1V1 -- una secuencia corta de "bloques" de programación
 * (estilo Scratch, mostrados como tarjetas apiladas -- no un editor real)
 * generada por IA, uno tiene un error de lógica. Gana quien lo encuentra
 * primero (async, como Ahorcado y Contrarreloj).
 */

const BLOCK_COLORS = ['bg-indigo-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-cyan-600', 'bg-purple-600', 'bg-orange-600'];

window.loadDebugSection = async function loadDebugSection() {
  const { data, error } = await window._supabase.from('student_debug_duels')
    .select('id, challenger_id, opponent_id, wager_gems, topic, status, winner_id, created_at, resolved_at, challenger:students!challenger_id(full_name), opponent:students!opponent_id(full_name)')
    .or(`challenger_id.eq.${window.currentUser.id},opponent_id.eq.${window.currentUser.id}`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) { console.error(error); return; }
  window._debugDuelsCache = data || [];
  window.renderDebugSection();
};

window.renderDebugSection = function renderDebugSection() {
  const container = document.getElementById('debug-section');
  if (!container) return;
  const currentUser = window.currentUser;
  const duels = window._debugDuelsCache || [];
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const createBtnHtml = `
    <div class="glass-card p-6 text-center border-dashed border-2 border-white/10 bg-transparent hover:border-white/20 transition-all cursor-pointer group mb-4" onclick="window.openCreateDebugModal()">
        <div class="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <i class="fas fa-plus text-lg text-white/40 group-hover:text-white/70 transition-colors"></i>
        </div>
        <p class="text-xs font-black text-white uppercase tracking-widest">Crear "Encontrá el Error" 1v1</p>
        <p class="text-[0.6rem] font-bold text-slate-500 mt-1">Bloques de programación -- gana quien encuentra el error primero</p>
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
        <button class="h-8 px-3 rounded-lg bg-emerald-500 text-white text-[0.6rem] font-black uppercase mr-2" onclick="window.respondDebugDuel('${d.id}', true)">Aceptar</button>
        <button class="h-8 px-3 rounded-lg bg-rose-500 text-white text-[0.6rem] font-black uppercase" onclick="window.respondDebugDuel('${d.id}', false)">Rechazar</button>
      `;
    } else if (d.status === 'pending' && isChallenger) {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-400">Esperando respuesta...</span>`;
      actionHtml = `<button class="h-8 px-3 rounded-lg bg-slate-700 text-white text-[0.6rem] font-black uppercase" onclick="window.cancelDebugDuel('${d.id}')">Cancelar</button>`;
    } else if (d.status === 'rejected') {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-500">Rechazado</span>`;
    } else if (d.status === 'cancelled') {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-500">${isChallenger ? 'Cancelaste el desafío' : 'Cancelado'}</span>`;
    } else if (d.status === 'active') {
      const myPlayed = window._myDebugPlayed?.has(d.id);
      statusHtml = myPlayed
        ? `<span class="text-[0.6rem] font-black uppercase text-primary">Jugaste -- esperando al rival</span>`
        : `<span class="text-[0.6rem] font-black uppercase text-primary">En curso -- ${d.wager_gems} gemas</span>`;
      actionHtml = myPlayed ? '' : `<button class="h-8 px-4 rounded-lg bg-primary text-white text-[0.6rem] font-black uppercase" onclick="window.openDebugGame('${d.id}')">Jugar</button>`;
    } else if (d.status === 'completed') {
      const won = d.winner_id === currentUser.id;
      const tie = !d.winner_id;
      statusHtml = tie
        ? `<span class="text-[0.6rem] font-black uppercase text-slate-400">Empate -- ninguno lo encontró</span>`
        : won
          ? `<span class="text-[0.6rem] font-black uppercase text-emerald-400"><i class="fas fa-trophy"></i> Ganaste +${d.wager_gems} gemas</span>`
          : `<span class="text-[0.6rem] font-black uppercase text-rose-400">Perdiste</span>`;
      actionHtml = `<button class="h-8 px-3 rounded-lg bg-white/10 text-white text-[0.6rem] font-black uppercase" onclick="window.showDebugReview('${d.id}')"><i class="fas fa-list-check"></i> Revisar</button>`;
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
  };

  const activeDuels = duels.filter(d => d.status === 'pending' || d.status === 'active');
  const historyDuels = duels.filter(d => d.status === 'completed' || d.status === 'cancelled' || d.status === 'rejected');

  const activeHtml = activeDuels.length ? `<div class="space-y-2">${activeDuels.map(renderCard).join('')}</div>` : '';
  const historyHtml = historyDuels.length ? `
    <div class="mt-3">
      <button class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[0.65rem] font-black uppercase tracking-widest text-slate-400 transition-colors" onclick="window.toggleDebugHistory()">
        <span><i class="fas fa-clock-rotate-left"></i> Historial (${historyDuels.length})</span>
        <i id="debug-history-chevron" class="fas fa-chevron-down transition-transform"></i>
      </button>
      <div id="debug-history-list" class="hidden space-y-2 mt-2">${historyDuels.map(renderCard).join('')}</div>
    </div>
  ` : '';

  container.innerHTML = createBtnHtml + activeHtml + historyHtml;
};

window.toggleDebugHistory = function toggleDebugHistory() {
  const list = document.getElementById('debug-history-list');
  const chevron = document.getElementById('debug-history-chevron');
  if (!list) return;
  list.classList.toggle('hidden');
  if (chevron) chevron.classList.toggle('rotate-180');
};

window.openCreateDebugModal = async function openCreateDebugModal() {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const userData = window.userData;

  const { data: classmates } = await _supabase.from('students')
    .select('id, full_name')
    .eq('school_code', userData.school_code).eq('grade', userData.grade).eq('section', userData.section)
    .neq('id', currentUser.id)
    .order('full_name');

  if (!classmates?.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No hay compañeros en tu clase para retar', 'error');

  const pool = window.getDuelTopicPoolForCurrentUser ? window.getDuelTopicPoolForCurrentUser() : [];

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-8 shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
      <h2 class="text-lg font-bold text-white uppercase tracking-tighter mb-6"><i class="fas fa-bug text-rose-500 mr-2"></i> Crear "Encontrá el Error" 1v1</h2>
      <div class="space-y-4">
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Rival</label>
          <select id="debug-opponent" class="input-field-tw h-11 text-sm">
            ${classmates.map(c => `<option value="${c.id}">${window.sanitizeInput(c.full_name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Gemas a apostar</label>
          <input type="number" id="debug-wager" min="0" value="10" class="input-field-tw h-11 text-sm">
          <p class="text-[0.6rem] text-slate-500 mt-1">Tenés ${userData?.gems ?? 0} gemas.</p>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Categoría</label>
          <select id="debug-topic" class="input-field-tw h-11 text-sm">
            <option value="">🎲 Aleatorio</option>
            ${pool.map(t => `<option value="${window.sanitizeAttr(t)}">${window.sanitizeInput(t)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="flex gap-3 mt-8">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-send-debug" onclick="window.sendDebugChallenge()"><i class="fas fa-paper-plane"></i> Retar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.sendDebugChallenge = async function sendDebugChallenge() {
  const opponentId = document.getElementById('debug-opponent')?.value;
  const wager = parseInt(document.getElementById('debug-wager')?.value) || 0;
  const chosenTopic = document.getElementById('debug-topic')?.value;
  const pool = window.getDuelTopicPoolForCurrentUser ? window.getDuelTopicPoolForCurrentUser() : [];
  const topic = chosenTopic || pool[Math.floor(Math.random() * pool.length)];
  const btn = document.getElementById('btn-send-debug');
  const userData = window.userData;

  if (wager < 0) return window.showToast('<i class="fas fa-circle-xmark"></i> La apuesta no puede ser negativa', 'error');
  if (wager > (userData?.gems ?? 0)) return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés suficientes gemas', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const { error } = await window._supabase.from('student_debug_duels').insert({
    challenger_id: window.currentUser.id,
    opponent_id: opponentId,
    wager_gems: wager,
    topic,
  }).select('id').single();

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Retar';
    return;
  }

  window.showToast('<i class="fas fa-circle-check"></i> ¡Reto enviado!', 'success');
  document.querySelector('.fixed.z-\\[210\\]')?.remove();
  window.loadDebugSection();
};

window.cancelDebugDuel = async function cancelDebugDuel(duelId) {
  await window._supabase.from('student_debug_duels').update({ status: 'cancelled' }).eq('id', duelId);
  window.loadDebugSection();
};

window.respondDebugDuel = async function respondDebugDuel(duelId, accept) {
  if (!accept) {
    await window._supabase.from('student_debug_duels').update({ status: 'rejected' }).eq('id', duelId);
    window.showToast('<i class="fas fa-circle-check"></i> Reto rechazado', 'success');
    return window.loadDebugSection();
  }

  const duel = (window._debugDuelsCache || []).find(d => d.id === duelId);
  const userData = window.userData;
  if (duel && duel.wager_gems > (userData?.gems ?? 0)) {
    return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés suficientes gemas para aceptar esta apuesta', 'error');
  }

  window.showToast('<i class="fas fa-circle-notch fa-spin"></i> Generando bloques...', 'info');
  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/ai-generate-debug-steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ duel_id: duelId }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error generando los bloques');
    window.showToast('<i class="fas fa-circle-check"></i> ¡Reto aceptado! Ya podés jugar', 'success');
    window.loadDebugSection();
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
  }
};

window.openDebugGame = async function openDebugGame(duelId) {
  const { data, error } = await window._supabase.rpc('start_debug_duel', { p_duel_id: duelId });
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  window._activeDebug = { duelId, labels: data.labels || [] };
  window.renderDebugGame();
};

window.renderDebugGame = function renderDebugGame() {
  const state = window._activeDebug;
  if (!state) return;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  document.getElementById('debug-game-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'debug-game-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-6 shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
      <h3 class="text-sm font-black text-white uppercase tracking-widest mb-1 text-center"><i class="fas fa-bug text-rose-500"></i> Encontrá el bloque con el error</h3>
      <p class="text-[0.65rem] text-slate-400 text-center mb-5">Tocá el bloque que está mal</p>
      <div class="space-y-2">
        ${state.labels.map((label, i) => `
          <button class="w-full text-left p-4 rounded-xl ${BLOCK_COLORS[i % BLOCK_COLORS.length]} text-white text-sm font-bold shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3" onclick="window.selectDebugBlock(${i})">
            <span class="w-6 h-6 rounded-full bg-black/20 flex items-center justify-center text-[0.65rem] shrink-0">${i + 1}</span>
            ${sanitizeInput(label)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.selectDebugBlock = async function selectDebugBlock(index) {
  const state = window._activeDebug;
  if (!state) return;
  document.getElementById('debug-game-modal')?.remove();
  window._activeDebug = null;

  const { data: result, error } = await window._supabase.rpc('submit_debug_result', {
    p_duel_id: state.duelId,
    p_selected_index: index,
  });
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  window._myDebugPlayed = window._myDebugPlayed || new Set();
  window._myDebugPlayed.add(state.duelId);

  window.showToast(result.correct
    ? `<i class="fas fa-circle-check"></i> ¡Encontraste el error! Esperá a que tu rival termine.`
    : `<i class="fas fa-circle-xmark"></i> No era ese (era el bloque ${result.bug_index + 1}: ${result.explanation}). Esperá a que tu rival termine.`,
    result.correct ? 'success' : 'info');
  window.loadDebugSection();
};

window.showDebugReview = async function showDebugReview(duelId) {
  const { data: duel } = await window._supabase.from('student_debug_duels').select('winner_id').eq('id', duelId).maybeSingle();
  const { data: results } = await window._supabase.from('student_debug_results').select('student_id, correct, time_ms').eq('duel_id', duelId);
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
            ${r.correct ? `<span class="text-emerald-400">Encontró el error</span>` : `<span class="text-rose-400">No lo encontró</span>`}
            en ${(r.time_ms / 1000).toFixed(1)}s
            ${r.student_id === duel?.winner_id ? ' <i class="fas fa-trophy text-amber-400"></i>' : ''}
          </div>
        `;
        }).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};
