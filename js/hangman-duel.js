/**
 * AHORCADO 1V1 -- mismo espíritu que Desafíos de Código (duels.js) pero en
 * vez de puntaje por preguntas, gana quien adivina la palabra más rápido.
 * Async: cada uno juega cuando puede, el servidor compara el tiempo que
 * tardó cada uno desde que arrancó su turno (start_hangman_duel).
 */

const MAX_WRONG_GUESSES = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

window.loadHangmanSection = async function loadHangmanSection() {
  // "word"/"hint" no viajan al cliente hasta terminar el juego (columna
  // vedada por RLS, ver migrations/student-hangman-duels.sql) -- por eso
  // el select pide columnas puntuales en vez de "*".
  const { data, error } = await window._supabase.from('student_hangman_duels')
    .select('id, challenger_id, opponent_id, wager_gems, topic, status, winner_id, created_at, resolved_at, challenger:students!challenger_id(full_name), opponent:students!opponent_id(full_name)')
    .or(`challenger_id.eq.${window.currentUser.id},opponent_id.eq.${window.currentUser.id}`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) { console.error(error); return; }
  window._hangmanDuelsCache = data || [];
  window.renderHangmanSection();
};

window.renderHangmanSection = function renderHangmanSection() {
  const container = document.getElementById('hangman-section');
  if (!container) return;
  const currentUser = window.currentUser;
  const duels = window._hangmanDuelsCache || [];
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const createBtnHtml = `
    <div class="glass-card p-6 text-center border-dashed border-2 border-white/10 bg-transparent hover:border-white/20 transition-all cursor-pointer group mb-4" onclick="window.openCreateHangmanModal()">
        <div class="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
            <i class="fas fa-plus text-lg text-white/40 group-hover:text-white/70 transition-colors"></i>
        </div>
        <p class="text-xs font-black text-white uppercase tracking-widest">Crear Ahorcado 1v1</p>
        <p class="text-[0.6rem] font-bold text-slate-500 mt-1">Apuesta gemas -- gana quien adivina más rápido</p>
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
        <button class="h-8 px-3 rounded-lg bg-emerald-500 text-white text-[0.6rem] font-black uppercase mr-2" onclick="window.respondHangmanDuel('${d.id}', true)">Aceptar</button>
        <button class="h-8 px-3 rounded-lg bg-rose-500 text-white text-[0.6rem] font-black uppercase" onclick="window.respondHangmanDuel('${d.id}', false)">Rechazar</button>
      `;
    } else if (d.status === 'pending' && isChallenger) {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-400">Esperando respuesta...</span>`;
      actionHtml = `<button class="h-8 px-3 rounded-lg bg-slate-700 text-white text-[0.6rem] font-black uppercase" onclick="window.cancelHangmanDuel('${d.id}')">Cancelar</button>`;
    } else if (d.status === 'rejected') {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-500">Rechazado</span>`;
    } else if (d.status === 'cancelled') {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-500">${isChallenger ? 'Cancelaste el desafío' : 'Cancelado'}</span>`;
    } else if (d.status === 'active') {
      const myPlayed = window._myHangmanPlayed?.has(d.id);
      statusHtml = myPlayed
        ? `<span class="text-[0.6rem] font-black uppercase text-primary">Jugaste -- esperando al rival</span>`
        : `<span class="text-[0.6rem] font-black uppercase text-primary">En curso -- ${d.wager_gems} gemas</span>`;
      actionHtml = myPlayed ? '' : `<button class="h-8 px-4 rounded-lg bg-primary text-white text-[0.6rem] font-black uppercase" onclick="window.openHangmanGame('${d.id}')">Jugar</button>`;
    } else if (d.status === 'completed') {
      const won = d.winner_id === currentUser.id;
      const tie = !d.winner_id;
      statusHtml = tie
        ? `<span class="text-[0.6rem] font-black uppercase text-slate-400">Empate -- ninguno la adivinó</span>`
        : won
          ? `<span class="text-[0.6rem] font-black uppercase text-emerald-400"><i class="fas fa-trophy"></i> Ganaste +${d.wager_gems} gemas</span>`
          : `<span class="text-[0.6rem] font-black uppercase text-rose-400">Perdiste</span>`;
      actionHtml = `<button class="h-8 px-3 rounded-lg bg-white/10 text-white text-[0.6rem] font-black uppercase" onclick="window.showHangmanReview('${d.id}')"><i class="fas fa-list-check"></i> Revisar</button>`;
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
      <button class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[0.65rem] font-black uppercase tracking-widest text-slate-400 transition-colors" onclick="window.toggleHangmanHistory()">
        <span><i class="fas fa-clock-rotate-left"></i> Historial (${historyDuels.length})</span>
        <i id="hangman-history-chevron" class="fas fa-chevron-down transition-transform"></i>
      </button>
      <div id="hangman-history-list" class="hidden space-y-2 mt-2">${historyDuels.map(renderCard).join('')}</div>
    </div>
  ` : '';

  container.innerHTML = createBtnHtml + activeHtml + historyHtml;
};

window.toggleHangmanHistory = function toggleHangmanHistory() {
  const list = document.getElementById('hangman-history-list');
  const chevron = document.getElementById('hangman-history-chevron');
  if (!list) return;
  list.classList.toggle('hidden');
  if (chevron) chevron.classList.toggle('rotate-180');
};

window.openCreateHangmanModal = async function openCreateHangmanModal() {
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
      <h2 class="text-lg font-bold text-white uppercase tracking-tighter mb-6"><i class="fas fa-spider text-rose-500 mr-2"></i> Crear Ahorcado 1v1</h2>
      <div class="space-y-4">
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Rival</label>
          <select id="hangman-opponent" class="input-field-tw h-11 text-sm">
            ${classmates.map(c => `<option value="${c.id}">${window.sanitizeInput(c.full_name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Gemas a apostar</label>
          <input type="number" id="hangman-wager" min="0" value="10" class="input-field-tw h-11 text-sm">
          <p class="text-[0.6rem] text-slate-500 mt-1">Tenés ${userData?.gems ?? 0} gemas.</p>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Categoría</label>
          <select id="hangman-topic" class="input-field-tw h-11 text-sm">
            <option value="">🎲 Aleatorio</option>
            ${pool.map(t => `<option value="${window.sanitizeAttr(t)}">${window.sanitizeInput(t)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="flex gap-3 mt-8">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-send-hangman" onclick="window.sendHangmanChallenge()"><i class="fas fa-paper-plane"></i> Retar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.sendHangmanChallenge = async function sendHangmanChallenge() {
  const opponentId = document.getElementById('hangman-opponent')?.value;
  const wager = parseInt(document.getElementById('hangman-wager')?.value) || 0;
  const chosenTopic = document.getElementById('hangman-topic')?.value;
  const pool = window.getDuelTopicPoolForCurrentUser ? window.getDuelTopicPoolForCurrentUser() : [];
  const topic = chosenTopic || pool[Math.floor(Math.random() * pool.length)];
  const btn = document.getElementById('btn-send-hangman');
  const userData = window.userData;

  if (wager < 0) return window.showToast('<i class="fas fa-circle-xmark"></i> La apuesta no puede ser negativa', 'error');
  if (wager > (userData?.gems ?? 0)) return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés suficientes gemas', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  // select() explícito (no "*") -- la columna "word" está vedada por RLS,
  // pedirla de vuelta acá chocaría con "permission denied for table".
  const { data: inserted, error } = await window._supabase.from('student_hangman_duels').insert({
    challenger_id: window.currentUser.id,
    opponent_id: opponentId,
    wager_gems: wager,
    topic,
  }).select('id, challenger_id, opponent_id, wager_gems, topic, status, created_at').single();

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Retar';
    return;
  }

  window.showToast('<i class="fas fa-circle-check"></i> ¡Reto enviado!', 'success');
  document.querySelector('.fixed.z-\\[210\\]')?.remove();
  window.loadHangmanSection();
  if (inserted?.id && typeof window.sendDuelPushNotification === 'function') window.sendDuelPushNotification(inserted.id, 'challenge', 'hangman');
};

window.cancelHangmanDuel = async function cancelHangmanDuel(duelId) {
  await window._supabase.from('student_hangman_duels').update({ status: 'cancelled' }).eq('id', duelId);
  window.loadHangmanSection();
};

window.respondHangmanDuel = async function respondHangmanDuel(duelId, accept) {
  if (!accept) {
    await window._supabase.from('student_hangman_duels').update({ status: 'rejected' }).eq('id', duelId);
    window.showToast('<i class="fas fa-circle-check"></i> Reto rechazado', 'success');
    return window.loadHangmanSection();
  }

  const duel = (window._hangmanDuelsCache || []).find(d => d.id === duelId);
  const userData = window.userData;
  if (duel && duel.wager_gems > (userData?.gems ?? 0)) {
    return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés suficientes gemas para aceptar esta apuesta', 'error');
  }

  window.showToast('<i class="fas fa-circle-notch fa-spin"></i> Generando palabra...', 'info');
  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/ai-generate-hangman-word`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ duel_id: duelId }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error generando la palabra');
    window.showToast('<i class="fas fa-circle-check"></i> ¡Reto aceptado! Ya podés jugar', 'success');
    window.loadHangmanSection();
    if (typeof window.sendDuelPushNotification === 'function') window.sendDuelPushNotification(duelId, 'accepted', 'hangman');
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
  }
};

window.openHangmanGame = async function openHangmanGame(duelId) {
  const { data, error } = await window._supabase.rpc('start_hangman_duel', { p_duel_id: duelId });
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  window._activeHangman = { duelId, hint: data.hint, wordLength: data.wordLength, guessed: [], wrong: 0 };
  window.renderHangmanGame();
};

window.renderHangmanGame = function renderHangmanGame() {
  const state = window._activeHangman;
  if (!state) return;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  document.getElementById('hangman-game-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'hangman-game-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-8 shadow-2xl animate-slideUp bg-slate-900 border border-white/10 text-center">
      <div class="flex justify-between items-center mb-4">
        <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest">Errores: ${state.wrong} / ${MAX_WRONG_GUESSES}</span>
        <span class="text-[0.6rem] font-black uppercase text-primary">Ahorcado</span>
      </div>
      <p class="text-sm text-slate-300 mb-5 italic">"${sanitizeInput(state.hint)}"</p>
      <div class="flex justify-center gap-2 flex-wrap mb-6">
        ${Array.from({ length: state.wordLength }).map((_, i) => `
          <div class="w-8 h-10 rounded-lg bg-white/5 border-b-4 border-primary flex items-center justify-center text-lg font-black text-white" id="hangman-slot-${i}"></div>
        `).join('')}
      </div>
      <div class="grid grid-cols-7 gap-1.5 max-w-md mx-auto">
        ${ALPHABET.map(letter => `
          <button class="h-9 rounded-lg text-xs font-black uppercase transition-all ${state.guessed.includes(letter) ? 'bg-white/5 text-slate-600 cursor-not-allowed' : 'bg-white/10 hover:bg-primary text-white'}"
            ${state.guessed.includes(letter) ? 'disabled' : ''} onclick="window.guessHangmanLetter('${letter}')">${letter}</button>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

// La palabra real nunca llegó al cliente -- no se puede saber acá si una
// letra es correcta. Se manda la lista completa de letras probadas al
// servidor recién al terminar (submitHangmanGame), que sí sabe la palabra.
// Mientras tanto, para pintar los espacios en blanco, cada letra probada
// se revela visualmente solo si el servidor la confirmó -- por eso cada
// intento va al servidor vía una versión liviana de verificación.
window.guessHangmanLetter = async function guessHangmanLetter(letter) {
  const state = window._activeHangman;
  if (!state || state.guessed.includes(letter)) return;

  const nextGuessed = [...state.guessed, letter];
  const { data, error } = await window._supabase.rpc('check_hangman_letter', {
    p_duel_id: state.duelId, p_letter: letter, p_guessed_letters: nextGuessed,
  });
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  state.guessed = nextGuessed;
  if (data.correct) {
    (data.positions || []).forEach(i => {
      const slot = document.getElementById(`hangman-slot-${i}`);
      if (slot) slot.textContent = letter;
    });
  } else {
    state.wrong++;
  }

  if (data.solved || state.wrong >= MAX_WRONG_GUESSES) {
    return window.finishHangmanGame();
  }
  window.renderHangmanGame();
};

window.finishHangmanGame = async function finishHangmanGame() {
  const state = window._activeHangman;
  if (!state) return;
  document.getElementById('hangman-game-modal')?.remove();

  const { data: result, error } = await window._supabase.rpc('submit_hangman_result', {
    p_duel_id: state.duelId,
    p_guessed_letters: state.guessed,
  });
  window._activeHangman = null;
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  window._myHangmanPlayed = window._myHangmanPlayed || new Set();
  window._myHangmanPlayed.add(state.duelId);

  window.showToast(result.solved
    ? `<i class="fas fa-circle-check"></i> ¡La adivinaste! Esperá a que tu rival termine.`
    : `<i class="fas fa-circle-xmark"></i> No la lograste (era "${result.word}"). Esperá a que tu rival termine.`, result.solved ? 'success' : 'info');
  window.loadHangmanSection();
};

window.showHangmanReview = async function showHangmanReview(duelId) {
  const { data: duel } = await window._supabase.from('student_hangman_duels').select('topic, winner_id').eq('id', duelId).maybeSingle();
  const { data: results } = await window._supabase.from('student_hangman_results').select('student_id, solved, wrong_guesses, time_ms').eq('duel_id', duelId);
  if (!results?.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No se pudo cargar la retroalimentación', 'error');

  const sanitizeInput = window.sanitizeInput || ((v) => v);
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
            ${r.solved ? `<span class="text-emerald-400">Adivinó</span>` : `<span class="text-rose-400">No adivinó</span>`}
            en ${(r.time_ms / 1000).toFixed(1)}s, ${r.wrong_guesses} error(es)
            ${r.student_id === duel?.winner_id ? ' <i class="fas fa-trophy text-amber-400"></i>' : ''}
          </div>
        `;
        }).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};
