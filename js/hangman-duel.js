/**
 * AHORCADO 1V1 -- mismo espíritu que Desafíos de Código (duels.js) pero en
 * vez de puntaje por preguntas, gana quien adivina la palabra más rápido.
 * Async: cada uno juega cuando puede, el servidor compara el tiempo que
 * tardó cada uno desde que arrancó su turno (start_hangman_duel).
 */

const MAX_WRONG_GUESSES = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// El ahorcado no tenía ninguna señal visual de los errores -- solo un
// contador de texto. Dibuja la horca de a partes (cabeza, cuerpo, 2 brazos,
// 2 piernas) según la cantidad de errores, estilo flat sin gradientes.
window.renderHangmanFigureSvg = function renderHangmanFigureSvg(wrong) {
  const parts = [
    '<circle cx="130" cy="45" r="15" fill="none" stroke="#F87171" stroke-width="4"/>', // cabeza
    '<line x1="130" y1="60" x2="130" y2="100" stroke="#F87171" stroke-width="4"/>', // cuerpo
    '<line x1="130" y1="70" x2="110" y2="90" stroke="#F87171" stroke-width="4"/>', // brazo izq
    '<line x1="130" y1="70" x2="150" y2="90" stroke="#F87171" stroke-width="4"/>', // brazo der
    '<line x1="130" y1="100" x2="112" y2="130" stroke="#F87171" stroke-width="4"/>', // pierna izq
    '<line x1="130" y1="100" x2="148" y2="130" stroke="#F87171" stroke-width="4"/>', // pierna der
  ];
  return `
    <svg viewBox="0 0 200 150" class="w-32 h-24 mx-auto">
      <line x1="20" y1="145" x2="100" y2="145" stroke="#64748B" stroke-width="4"/>
      <line x1="40" y1="145" x2="40" y2="10" stroke="#64748B" stroke-width="4"/>
      <line x1="40" y1="10" x2="130" y2="10" stroke="#64748B" stroke-width="4"/>
      <line x1="130" y1="10" x2="130" y2="30" stroke="#64748B" stroke-width="4"/>
      ${parts.slice(0, wrong).join('')}
    </svg>
  `;
};

window.loadHangmanSection = async function loadHangmanSection() {
  // "word"/"hint" no viajan al cliente hasta terminar el juego (columna
  // vedada por RLS, ver migrations/student-hangman-duels.sql) -- por eso
  // el select pide columnas puntuales en vez de "*".
  const { data, error } = await window._supabase.from('student_hangman_duels')
    .select(`id, challenger_id, opponent_id, wager_gems, topic, status, winner_id, created_at, resolved_at, challenger:students!challenger_id(${window.GameArena.STUDENT_JOIN}), opponent:students!opponent_id(${window.GameArena.STUDENT_JOIN})`)
    .or(`challenger_id.eq.${window.currentUser.id},opponent_id.eq.${window.currentUser.id}`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) { console.error(error); return; }
  window._hangmanDuelsCache = data || [];
  await window.hydratePlayedSet('student_hangman_results', window._hangmanDuelsCache, '_myHangmanPlayed');
  window.renderHangmanSection();
  window.subscribeHangmanRealtime();
};

// Mismo problema que en duels.js: sin esto el retador se queda viendo
// "Esperando..." hasta recargar a mano aunque el rival ya haya aceptado.
window.subscribeHangmanRealtime = function subscribeHangmanRealtime() {
  if (window._hangmanRealtimeChannel) return;
  const currentUser = window.currentUser;
  if (!currentUser) return;

  window._hangmanRealtimeChannel = window._supabase
    .channel(`hangman-live-${currentUser.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'student_hangman_duels', filter: `challenger_id=eq.${currentUser.id}` }, () => window.loadHangmanSection())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'student_hangman_duels', filter: `opponent_id=eq.${currentUser.id}` }, () => window.loadHangmanSection())
    .subscribe();
};

window.renderHangmanSection = function renderHangmanSection() {
  const container = document.getElementById('hangman-section');
  if (!container) return;
  const currentUser = window.currentUser;
  const duels = window._hangmanDuelsCache || [];
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const createBtnHtml = window.GameArena.heroHtml({
    title: 'Ahorcado 1v1',
    subtitle: 'Adiviná la palabra letra por letra antes de quedarte sin vidas. Gana el más rápido.',
    icon: 'fa-spider',
    c1: '#e11d48',
    c2: '#7c3aed',
    onclick: 'window.openCreateHangmanModal()',
  });

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
      actionHtml = window.GameArena.rematchBtnHtml('hangman', d) + `<button class="h-8 px-3 rounded-lg bg-white/10 text-white text-[0.6rem] font-black uppercase" onclick="window.showHangmanReview('${d.id}')"><i class="fas fa-list-check"></i></button>`;
    }

    return `
      <div class="glass-card p-4 flex items-center justify-between gap-3 bg-white/5 border-white/5">
        ${window.GameArena.rivalMiniHtml(d)}
        <div class="min-w-0 flex-1">
          <div class="text-xs font-bold text-white truncate">vs ${sanitizeInput(opponentName)}</div>
          <div class="text-[0.6rem] text-slate-500 truncate">${sanitizeInput(d.topic)}</div>
          <div>${statusHtml}${window.GameArena.recordChipHtml(d)}</div>
        </div>
        <div class="shrink-0 flex items-center">${actionHtml}</div>
      </div>
    `;
  };

  const activeDuels = duels.filter(d => window.GameArena.isOnTop(d));
  const historyDuels = duels.filter(d => !window.GameArena.isOnTop(d));

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

  if (!window.aiGenerationLock.tryAcquire()) return;
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
  } finally {
    window.aiGenerationLock.release();
  }
};

window.openHangmanGame = async function openHangmanGame(duelId) {
  const duel = (window._hangmanDuelsCache || []).find(d => d.id === duelId);
  // VS antes de start_hangman_duel -- el reloj del servidor arranca después.
  await window.GameArena.versus({ title: 'Ahorcado 1v1', ...(await window.GameArena.fightersFor(duel)) });

  const { data, error } = await window._supabase.rpc('start_hangman_duel', { p_duel_id: duelId });
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  window._activeHangman = { duelId, hint: data.hint, wordLength: data.wordLength, guessed: [], hits: new Set(), wrong: 0, revealed: {}, busy: false };
  window.renderHangmanGame();
};

// Se arma una sola vez; cada jugada solo actualiza las partes (antes se
// reconstruía el modal entero y se reiniciaban animaciones y reloj).
window.renderHangmanGame = function renderHangmanGame() {
  const state = window._activeHangman;
  if (!state) return;
  const sanitizeInput = window.sanitizeInput || ((v) => v);
  window.GameArena.ensureStyles();

  document.getElementById('hangman-game-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'hangman-game-modal';
  modal.className = 'ga-overlay';
  modal.innerHTML = `
    <div class="ga-panel"><div class="ga-card" id="hangman-card">
      <div class="ga-topbar">
        <span class="ga-chip"><i class="fas fa-spider"></i> Ahorcado</span>
        <span class="ga-clock" id="hangman-clock">0.0s</span>
      </div>
      <div id="hangman-lives" style="font-size:1.1rem;letter-spacing:.15em;margin-bottom:.25rem"></div>
      <div id="hangman-figure" style="margin-bottom:.5rem"></div>
      <p style="font-size:1rem;font-weight:700;line-height:1.4;margin-bottom:1rem">"${sanitizeInput(state.hint)}"</p>
      <div id="hangman-slots" style="display:flex;justify-content:center;gap:.35rem;flex-wrap:wrap;margin-bottom:1rem"></div>
      <div class="ga-keys" id="hangman-keys">
        ${ALPHABET.map(l => `<button type="button" class="ga-key" style="min-width:2.25rem;height:2.4rem;font-size:.9rem" data-letter="${l}" onclick="window.guessHangmanLetter('${l}')">${l}</button>`).join('')}
      </div>
    </div></div>
  `;
  document.body.appendChild(modal);
  state.stopClock = window.GameArena.startStopwatch(document.getElementById('hangman-clock'));
  window.updateHangmanGame();
};

window.updateHangmanGame = function updateHangmanGame() {
  const state = window._activeHangman;
  if (!state) return;
  const s = window.sanitizeInput || ((v) => v);
  document.getElementById('hangman-figure').innerHTML = window.renderHangmanFigureSvg(state.wrong);
  document.getElementById('hangman-lives').textContent = '❤️'.repeat(MAX_WRONG_GUESSES - state.wrong) + '🖤'.repeat(state.wrong);
  document.getElementById('hangman-slots').innerHTML = Array.from({ length: state.wordLength }).map((_, i) => `
    <div style="width:2.1rem;height:2.6rem;border-radius:.6rem;background:rgba(255,255,255,.06);border-bottom:4px solid ${state.revealed[i] ? '#4ade80' : '#818cf8'};
      display:flex;align-items:center;justify-content:center;font-size:1.25rem;font-weight:900">${s(state.revealed[i] || '')}</div>`).join('');
  document.querySelectorAll('#hangman-keys .ga-key').forEach(btn => {
    const l = btn.dataset.letter;
    if (!state.guessed.includes(l)) return;
    btn.disabled = true;
    btn.style.cursor = 'default';
    btn.style.background = state.hits.has(l) ? 'rgba(74,222,128,.3)' : 'rgba(244,63,94,.25)';
    btn.style.color = state.hits.has(l) ? '#bbf7d0' : '#fda4af';
  });
};

// La palabra real nunca llegó al cliente -- no se puede saber acá si una
// letra es correcta. Se manda la lista completa de letras probadas al
// servidor recién al terminar (submitHangmanGame), que sí sabe la palabra.
// Mientras tanto, para pintar los espacios en blanco, cada letra probada
// se revela visualmente solo si el servidor la confirmó -- por eso cada
// intento va al servidor vía una versión liviana de verificación.
window.guessHangmanLetter = async function guessHangmanLetter(letter) {
  const state = window._activeHangman;
  if (!state || state.busy || state.guessed.includes(letter)) return;
  state.busy = true;

  const nextGuessed = [...state.guessed, letter];
  const { data, error } = await window._supabase.rpc('check_hangman_letter', {
    p_duel_id: state.duelId, p_letter: letter, p_guessed_letters: nextGuessed,
  });
  state.busy = false;
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  state.guessed = nextGuessed;
  if (data.correct) {
    state.hits.add(letter);
    (data.positions || []).forEach(i => { state.revealed[i] = letter; });
  } else {
    state.wrong++;
  }
  window.GameArena.feedback(document.getElementById('hangman-card'), data.correct);
  window.updateHangmanGame();

  if (data.solved || state.wrong >= MAX_WRONG_GUESSES) {
    return window.finishHangmanGame();
  }
};

window.finishHangmanGame = async function finishHangmanGame() {
  const state = window._activeHangman;
  if (!state) return;
  if (state.stopClock) state.stopClock();

  const { data: result, error } = await window._supabase.rpc('submit_hangman_result', {
    p_duel_id: state.duelId,
    p_guessed_letters: state.guessed,
  });
  window._activeHangman = null;
  await new Promise(r => setTimeout(r, 600));
  document.getElementById('hangman-game-modal')?.remove();
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  window._myHangmanPlayed = window._myHangmanPlayed || new Set();
  window._myHangmanPlayed.add(state.duelId);
  window.GameArena.notifyResult('hangman', state.duelId);

  const s = window.sanitizeInput || ((v) => v);
  await window.GameArena.result({
    ok: result.solved,
    title: result.solved ? '¡Adivinada!' : '¡Te ahorcaron!',
    subtitle: result.solved
      ? 'Cuando tu rival juegue, se define quién ganó.'
      : 'La palabra era:',
    detailHtml: `<div style="font-size:1.7rem;font-weight:900;letter-spacing:.12em;margin:.5rem 0">${s(result.word)}</div>
      <div style="font-size:.8rem;color:#facc15;font-weight:800"><i class="fas fa-stopwatch"></i> ${(result.time_ms / 1000).toFixed(1)}s · ${result.wrong_guesses} error(es)</div>`,
  });
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
