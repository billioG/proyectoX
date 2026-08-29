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
  window.checkDuelResults();
  window.subscribeDuelRealtime();
}

// Antes el retador se quedaba viendo "Esperando respuesta..." hasta que
// recargaba la página a mano, aunque el rival ya hubiera aceptado -- con
// esto el botón cambia solo a "Jugar" apenas cambia el estado del duelo.
window.subscribeDuelRealtime = function subscribeDuelRealtime() {
  if (window._duelRealtimeChannel) return;
  const currentUser = window.currentUser;
  if (!currentUser) return;

  window._duelRealtimeChannel = window._supabase
    .channel(`duels-live-${currentUser.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'student_duels', filter: `challenger_id=eq.${currentUser.id}` }, () => window.loadDuelsSection())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'student_duels', filter: `opponent_id=eq.${currentUser.id}` }, () => window.loadDuelsSection())
    .subscribe();
}

// Muestra la animación de resultado (como la de insignias) una sola vez
// por CUENTA (no por dispositivo) cuando un duelo ya se completó.
window.checkDuelResults = async function checkDuelResults() {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const completed = (window._duelsCache || []).filter(d => d.status === 'completed');
  if (!completed.length) return;

  for (const duel of completed) {
    const { data: myAnswer } = await _supabase.from('student_duel_answers')
      .select('id, score, result_seen')
      .eq('duel_id', duel.id).eq('student_id', currentUser.id).maybeSingle();
    if (!myAnswer || myAnswer.result_seen) continue;

    window.showDuelResultModal(duel, myAnswer.score);
    await _supabase.from('student_duel_answers').update({ result_seen: true }).eq('id', myAnswer.id);
    break; // uno a la vez, evita apilar modales si hay varios sin ver
  }
}

window.showDuelResultModal = function showDuelResultModal(duel, myScore) {
  if (typeof window.ensureCompanionStyles === 'function') window.ensureCompanionStyles();
  const currentUser = window.currentUser;
  const isChallenger = duel.challenger_id === currentUser.id;
  const opponentName = isChallenger ? (duel.opponent?.full_name || 'Rival') : (duel.challenger?.full_name || 'Rival');
  const won = duel.winner_id === currentUser.id;
  const tie = !duel.winner_id;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const companionClass = tie ? 'companion-idle' : won ? 'companion-victory' : 'companion-defeat';
  const companionHtml = typeof window.renderCompanionSvg === 'function'
    ? window.renderCompanionSvg(window._myCompanionStageIndex || 0, companionClass)
    : (tie ? '<i class="fas fa-handshake"></i>' : won ? '<i class="fas fa-trophy"></i>' : '<i class="fas fa-shield-heart"></i>');
  const title = tie ? '¡Empate!' : won ? '¡Ganaste el Duelo!' : 'Duelo Perdido';
  const gemsLine = tie
    ? 'Nadie ganó ni perdió gemas.'
    : won ? `+${duel.wager_gems} gemas` : `-${duel.wager_gems} gemas`;
  const gemsColor = tie ? 'text-slate-300' : won ? 'text-emerald-400' : 'text-rose-400';

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[230] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="relative w-full max-w-sm p-8 text-center">
      <div class="mb-6 relative">
        <div class="absolute inset-0 ${won ? 'bg-emerald-500' : tie ? 'bg-slate-400' : 'bg-rose-500'} blur-[60px] opacity-40 animate-pulse"></div>
        <div class="relative w-32 h-32 mx-auto drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]">
          ${companionHtml}
        </div>
      </div>
      <div class="relative z-10 space-y-2 mb-6 animate-slideUp">
        <h2 class="text-3xl font-black text-white uppercase tracking-tighter italic drop-shadow-lg leading-none">${title}</h2>
        <p class="text-slate-300 font-medium text-sm mt-2">vs ${sanitizeInput(opponentName)} -- ${sanitizeInput(duel.topic)}</p>
      </div>
      <div class="flex flex-col gap-3 relative z-10 animate-slideUp" style="animation-delay: 0.1s">
        <div class="p-3 bg-white/10 rounded-xl border border-white/10 flex items-center justify-center gap-2">
          <span class="text-white font-black text-lg">${myScore}/${duel.question_count}</span>
          <span class="text-xs font-bold text-white uppercase tracking-widest">Correctas</span>
        </div>
        <div class="p-3 bg-white/10 rounded-xl border border-white/10 flex items-center justify-center gap-2">
          <span class="${gemsColor} font-black text-lg">${gemsLine}</span>
        </div>
        <button class="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black uppercase tracking-widest text-[0.65rem] transition-all" onclick="window.showDuelReview('${duel.id}')">
          <i class="fas fa-list-check"></i> Ver Retroalimentación
        </button>
        <button class="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/30 transition-all hover:scale-105 active:scale-95" onclick="this.closest('.fixed').remove()">
          ¡Genial! <i class="fas fa-rocket"></i>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  if (won && typeof window.startBirthdayConfetti === 'function') window.startBirthdayConfetti();
}

window.showDuelReview = async function showDuelReview(duelId) {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const [{ data: questions, error: qErr }, { data: myAnswer }] = await Promise.all([
    _supabase.rpc('get_duel_review', { p_duel_id: duelId }),
    _supabase.from('student_duel_answers').select('answers').eq('duel_id', duelId).eq('student_id', currentUser.id).maybeSingle(),
  ]);
  if (qErr || !questions?.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No se pudo cargar la retroalimentación', 'error');

  const myAnswers = myAnswer?.answers || [];

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[235] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-slideUp bg-slate-900 border border-white/10">
      <div class="p-5 border-b border-white/10 flex justify-between items-center shrink-0">
        <h3 class="text-sm font-black text-white uppercase tracking-widest"><i class="fas fa-list-check text-primary mr-1"></i> Retroalimentación</h3>
        <button class="w-9 h-9 rounded-xl bg-white/5 text-slate-400 hover:text-rose-500 flex items-center justify-center" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3">
        ${questions.map((q, i) => {
    const mine = myAnswers[i];
    const correct = mine === q.correctIndex;
    return `
          <div class="p-4 rounded-xl bg-white/5 border ${correct ? 'border-emerald-500/30' : 'border-rose-500/30'}">
            <p class="text-sm font-bold text-white mb-2">${i + 1}. ${sanitizeInput(q.question)} ${correct ? '<i class="fas fa-circle-check text-emerald-400"></i>' : '<i class="fas fa-circle-xmark text-rose-400"></i>'}</p>
            ${q.options.map((opt, oi) => `
              <p class="text-xs pl-3 py-0.5 ${oi === q.correctIndex ? 'text-emerald-400 font-bold' : oi === mine ? 'text-rose-400 font-bold' : 'text-slate-500'}">
                ${oi === q.correctIndex ? '✓' : oi === mine ? '✗' : '·'} ${sanitizeInput(opt)}
              </p>
            `).join('')}
          </div>
        `;
  }).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
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

  const renderDuelCard = (d) => {
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
      actionHtml = `<button class="h-8 px-3 rounded-lg bg-slate-700 text-white text-[0.6rem] font-black uppercase" onclick="window.cancelDuel('${d.id}')">Cancelar</button>`;
    } else if (d.status === 'rejected') {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-500">Rechazado</span>`;
    } else if (d.status === 'cancelled') {
      statusHtml = `<span class="text-[0.6rem] font-black uppercase text-slate-500">${isChallenger ? 'Cancelaste el desafío' : 'Cancelado'}</span>`;
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
      // Antes solo se veía la retroalimentación una vez, en el modal
      // que aparece justo al completarse -- si lo cerrabas sin fijarte,
      // no había forma de volver a ver qué respondiste mal.
      actionHtml = `<button class="h-8 px-3 rounded-lg bg-white/10 text-white text-[0.6rem] font-black uppercase" onclick="window.showDuelReview('${d.id}')"><i class="fas fa-list-check"></i> Revisar</button>`;
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

  // Lo que requiere atención (pendiente de responder/jugar) queda a la
  // vista; lo que ya terminó (completado/cancelado/rechazado) se amontonaba
  // sin fin en la misma lista -- ahora va colapsado en un acordeón aparte.
  const activeDuels = duels.filter(d => d.status === 'pending' || d.status === 'active');
  const historyDuels = duels.filter(d => d.status === 'completed' || d.status === 'cancelled' || d.status === 'rejected');

  const activeHtml = activeDuels.length
    ? `<div class="space-y-2">${activeDuels.map(renderDuelCard).join('')}</div>`
    : '';

  const historyHtml = historyDuels.length ? `
    <div class="mt-3">
      <button class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[0.65rem] font-black uppercase tracking-widest text-slate-400 transition-colors" onclick="window.toggleDuelHistory()">
        <span><i class="fas fa-clock-rotate-left"></i> Historial (${historyDuels.length})</span>
        <i id="duel-history-chevron" class="fas fa-chevron-down transition-transform"></i>
      </button>
      <div id="duel-history-list" class="hidden space-y-2 mt-2">${historyDuels.map(renderDuelCard).join('')}</div>
    </div>
  ` : '';

  container.innerHTML = createBtnHtml + activeHtml + historyHtml;
}

window.toggleDuelHistory = function toggleDuelHistory() {
  const list = document.getElementById('duel-history-list');
  const chevron = document.getElementById('duel-history-chevron');
  if (!list) return;
  list.classList.toggle('hidden');
  if (chevron) chevron.classList.toggle('rotate-180');
}

// Cada tema trae un "minRank" (ver getGradeRank() en utils.js: Primaria
// 1-6, Básico 7-9, Diversificado 10-12) -- un alumno de 4to primaria no
// debería toparse con "Electrónica básica" ni C++, pero sí con robótica/
// programación por bloques a nivel introductorio. Los de cultura general
// quedan en 0 (cualquier grado).
const DUEL_TOPIC_POOL_FULL = [
  { name: 'Historia de Guatemala', minRank: 0 },
  { name: 'Geografía de Guatemala', minRank: 0 },
  { name: 'Cultura maya', minRank: 0 },
  { name: 'Tradiciones y fiestas de Guatemala', minRank: 0 },
  { name: 'Biodiversidad de Guatemala', minRank: 0 },
  { name: 'Cultura general internacional', minRank: 0 },
  { name: 'Historia mundial', minRank: 0 },
  { name: 'Geografía mundial', minRank: 0 },
  { name: 'Ciencia y descubrimientos', minRank: 0 },
  { name: 'Arte y cultura general', minRank: 0 },
  { name: 'Robótica educativa', minRank: 4 },
  { name: 'Programación por bloques', minRank: 4 },
  { name: 'Ciencias de la computación', minRank: 4 },
  { name: 'Matemática aplicada', minRank: 4 },
  { name: 'Física básica', minRank: 4 },
  // Pedido puntual de un docente: temas técnicos concretos de los kits y del
  // curso de programación, para repasar vocabulario que no suelen repasar
  // solos -- reservados a Básico/Diversificado (ya vieron esto en clase).
  { name: 'Electrónica básica', minRank: 7 },
  { name: 'Inteligencia artificial', minRank: 7 },
  { name: 'Componentes de kits de robótica (sensores, actuadores, controladores)', minRank: 7 },
  { name: 'Sintaxis básica de C++ (variables, tipos de datos, operadores)', minRank: 7 },
  { name: 'Estructuras de control en C++ (condicionales, bucles)', minRank: 7 },
  { name: 'Funciones, métodos y objetos en programación', minRank: 7 },
];

// Filtra el pool completo al grado del alumno actual -- se usa tanto acá
// (Duelos) como en practice-quiz.js (Práctica Solo).
function getDuelTopicPoolForCurrentUser() {
  const rank = window.getGradeRank ? window.getGradeRank(window.userData?.grade) : 99;
  return DUEL_TOPIC_POOL_FULL.filter(t => t.minRank <= rank).map(t => t.name);
}
// Otros módulos (ej. practice-quiz.js) reusan este mismo pool de temas --
// duels.js se carga como módulo ES, así que un const de acá no es visible
// afuera sin exponerlo explícitamente.
window.getDuelTopicPoolForCurrentUser = getDuelTopicPoolForCurrentUser;

function computeDuelQuestionCount(wager) {
  return Math.max(5, Math.min(15, 5 + Math.floor((wager || 0) / 10)));
}

window.updateDuelWagerPreview = function updateDuelWagerPreview() {
  const wager = parseInt(document.getElementById('duel-wager')?.value) || 0;
  const el = document.getElementById('duel-wager-preview');
  if (el) el.textContent = computeDuelQuestionCount(wager);
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
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Gemas a apostar</label>
          <input type="number" id="duel-wager" min="0" value="10" class="input-field-tw h-11 text-sm" oninput="window.updateDuelWagerPreview()">
          <p class="text-[0.6rem] text-slate-500 mt-1">Tenés ${userData?.gems ?? 0} gemas.</p>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Categoría</label>
          <select id="duel-topic" class="input-field-tw h-11 text-sm">
            <option value="">🎲 Aleatorio</option>
            ${getDuelTopicPoolForCurrentUser().map(t => `<option value="${window.sanitizeAttr(t)}">${window.sanitizeInput(t)}</option>`).join('')}
          </select>
        </div>
        <div class="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
          <p class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mb-1">Preguntas de este duelo</p>
          <p id="duel-wager-preview" class="text-2xl font-black text-primary">${computeDuelQuestionCount(10)}</p>
          <p class="text-[0.6rem] text-slate-500 mt-1">Ajusta la cantidad de preguntas según lo que apuestes -- más gemas, más preguntas.</p>
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
  const wager = parseInt(document.getElementById('duel-wager')?.value) || 0;
  const chosenTopic = document.getElementById('duel-topic')?.value;
  const pool = getDuelTopicPoolForCurrentUser();
  const topic = chosenTopic || pool[Math.floor(Math.random() * pool.length)];
  const questionCount = computeDuelQuestionCount(wager);
  const btn = document.getElementById('btn-send-duel');
  const userData = window.userData;

  if (wager < 0) return window.showToast('<i class="fas fa-circle-xmark"></i> La apuesta no puede ser negativa', 'error');
  if (wager > (userData?.gems ?? 0)) return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés suficientes gemas', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const { data: inserted, error } = await window._supabase.from('student_duels').insert({
    challenger_id: window.currentUser.id,
    opponent_id: opponentId,
    wager_gems: wager,
    topic,
    question_count: questionCount,
  }).select().single();

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Retar';
    return;
  }

  window.showToast('<i class="fas fa-circle-check"></i> ¡Reto enviado!', 'success');
  document.querySelector('.fixed.z-\\[210\\]')?.remove();
  window.loadDuelsSection();
  if (inserted?.id) window.sendDuelPushNotification(inserted.id, 'challenge');
}

// Reusado por los 4 desafíos 1v1 (Duelos de trivia, Ahorcado, Contrarreloj,
// Encontrá el Error) -- "game" le dice a notify-duel en qué tabla buscar
// (antes esto estaba hardcodeado a student_duels, así que los 3 juegos
// nuevos nunca mandaban push).
window.sendDuelPushNotification = async function sendDuelPushNotification(duelId, type, game = 'quiz') {
  try {
    if (!duelId) return;
    const { data: { session } } = await window._supabase.auth.getSession();
    await fetch(`${window.SUPABASE_URL}/functions/v1/notify-duel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ duel_id: duelId, type, game }),
    });
  } catch (err) {
    console.error('Error enviando push de duelo:', err);
  }
}

window.cancelDuel = async function cancelDuel(duelId) {
  const { error } = await window._supabase.from('student_duels').update({ status: 'cancelled' }).eq('id', duelId).eq('status', 'pending');
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  window.showToast('<i class="fas fa-circle-check"></i> Desafío cancelado', 'success');
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
    window.sendDuelPushNotification(duelId, 'accepted');
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

  if (typeof window.getCompanionStage === 'function' && typeof window.ensureCompanionStyles === 'function') {
    window.ensureCompanionStyles();
    const { data: me } = await window._supabase.from('students').select('gems_earned_total').eq('id', window.currentUser.id).maybeSingle();
    window._myCompanionStageIndex = window.getCompanionStage(me?.gems_earned_total).stageIndex;
  }

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
      <div class="flex justify-between items-center mb-4">
        <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest">Pregunta ${index + 1} / ${duel.questions.length}</span>
        <span class="text-[0.6rem] font-black uppercase text-primary">${duel.topic}</span>
      </div>
      ${typeof window.renderCompanionSvg === 'function' ? `<div class="w-16 h-16 mx-auto mb-4">${window.renderCompanionSvg(window._myCompanionStageIndex || 0)}</div>` : ''}
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
