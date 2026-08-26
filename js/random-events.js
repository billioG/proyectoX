/**
 * EVENTOS SORPRESA -- quiz relámpago nocturno con notificación push real.
 * Un cron elige al azar unas noches por semana, genera preguntas con IA y
 * manda push a todos los estudiantes suscritos. Los primeros lugares
 * (por aciertos, después por velocidad) se reparten un pozo de gemas.
 */

const VAPID_PUBLIC_KEY = 'BJ54zvFlMHOEFJgGfloVcjQv_bJKNVxqGkjQ9q1h82QRRVWeWtK87pgAO_twu-FrPK08tYkAukdMwEYjHJX3a_E';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

window.isPushSupported = function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

window.enableEventNotifications = async function enableEventNotifications() {
  if (!window.isPushSupported()) {
    return window.showToast('<i class="fas fa-circle-xmark"></i> Tu navegador no soporta notificaciones push', 'error');
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return window.showToast('<i class="fas fa-circle-info"></i> No activaste las notificaciones', 'info');
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const raw = subscription.toJSON();
    const { error } = await window._supabase.from('push_subscriptions').upsert({
      student_id: window.currentUser.id,
      endpoint: raw.endpoint,
      p256dh: raw.keys.p256dh,
      auth: raw.keys.auth,
    }, { onConflict: 'endpoint' });

    if (error) throw error;
    localStorage.setItem('PX_EVENTS_SUBSCRIBED', 'true');
    window.showToast('<i class="fas fa-bell"></i> ¡Notificaciones de eventos sorpresa activadas!', 'success');
    if (typeof window.renderEventNotificationToggle === 'function') window.renderEventNotificationToggle();
  } catch (err) {
    console.error('Error activando notificaciones:', err);
    window.showToast('<i class="fas fa-circle-xmark"></i> No se pudo activar: ' + err.message, 'error');
  }
}

window.renderEventNotificationToggle = async function renderEventNotificationToggle() {
  const slot = document.getElementById('event-notif-toggle-slot');
  if (!slot) return;
  if (!window.isPushSupported()) { slot.innerHTML = ''; return; }

  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const subscription = registration ? await registration.pushManager.getSubscription() : null;

  slot.innerHTML = subscription
    ? `<div class="flex items-center gap-2 text-emerald-500 text-[0.65rem] font-black uppercase tracking-widest"><i class="fas fa-bell"></i> Notificaciones de eventos activas</div>`
    : `<button onclick="window.enableEventNotifications()" class="btn-secondary-tw h-10 px-4 text-[0.65rem] uppercase font-bold"><i class="fas fa-bell"></i> Activar notificaciones de eventos sorpresa</button>`;
}

// ================================================
// EVENTO ACTIVO -- banner, unirse, quiz, resultado
// ================================================
window.checkActiveRandomEvent = async function checkActiveRandomEvent() {
  if (window.userRole !== 'estudiante') return;
  const _supabase = window._supabase;
  const currentUser = window.currentUser;

  const { data: events } = await _supabase.from('random_events')
    .select('id, topic, question_count, gem_pool, duration_minutes, scheduled_for, status')
    .eq('status', 'active')
    .order('scheduled_for', { ascending: false })
    .limit(1);

  const event = events?.[0];
  const banner = document.getElementById('random-event-banner');
  if (!event) { if (banner) banner.remove(); return; }

  const { data: myEntry } = await _supabase.from('event_participants')
    .select('id, submitted_at').eq('event_id', event.id).eq('student_id', currentUser.id).maybeSingle();

  window._activeRandomEvent = event;

  if (myEntry?.submitted_at) { if (banner) banner.remove(); return; } // ya jugó

  window.renderRandomEventBanner(event, !!myEntry);
}

window.renderRandomEventBanner = function renderRandomEventBanner(event, alreadyJoined) {
  document.getElementById('random-event-banner')?.remove();
  const container = document.getElementById('view-feed') || document.body;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const banner = document.createElement('div');
  banner.id = 'random-event-banner';
  banner.className = 'glass-card p-6 mb-6 border-2 border-amber-400/40 bg-gradient-to-r from-amber-500/10 to-rose-500/10 animate-fadeIn';
  banner.innerHTML = `
    <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-2xl bg-amber-400 text-slate-900 flex items-center justify-center text-2xl animate-pulse">⚡</div>
        <div>
          <div class="text-sm font-black uppercase text-slate-800 dark:text-white">Evento Sorpresa: ${sanitizeInput(event.topic)}</div>
          <div class="text-[0.65rem] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">${event.gem_pool} gemas en juego -- top 5 se las reparten</div>
        </div>
      </div>
      <button class="btn-primary-tw h-11 px-6 text-xs uppercase font-black shrink-0" onclick="window.joinRandomEvent('${event.id}')">
        <i class="fas fa-bolt"></i> ${alreadyJoined ? 'Continuar' : 'Entrar Ahora'}
      </button>
    </div>
  `;
  if (container.firstChild) container.insertBefore(banner, container.firstChild);
  else container.appendChild(banner);
}

window.joinRandomEvent = async function joinRandomEvent(eventId) {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;

  const { data: existing } = await _supabase.from('event_participants')
    .select('id, submitted_at').eq('event_id', eventId).eq('student_id', currentUser.id).maybeSingle();

  if (existing?.submitted_at) return window.showToast('<i class="fas fa-circle-info"></i> Ya respondiste este evento', 'info');

  if (!existing) {
    const { error } = await _supabase.from('event_participants').insert({ event_id: eventId, student_id: currentUser.id });
    if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  }

  const { data: questions, error: qErr } = await _supabase.rpc('get_event_questions', { p_event_id: eventId });
  if (qErr || !questions?.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No se pudo cargar el quiz', 'error');

  window._activeEventQuiz = { eventId, questions, index: 0, selections: [] };
  window.renderRandomEventQuestion();
}

window.renderRandomEventQuestion = function renderRandomEventQuestion() {
  const state = window._activeEventQuiz;
  if (!state) return;
  const { questions, index } = state;
  const q = questions[index];
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  document.getElementById('random-event-quiz-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'random-event-quiz-modal';
  modal.className = 'fixed inset-0 z-[240] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-8 shadow-2xl animate-slideUp bg-slate-900 border border-amber-400/20">
      <div class="flex justify-between items-center mb-6">
        <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest">Pregunta ${index + 1} / ${questions.length}</span>
        <span class="text-[0.6rem] font-black uppercase text-amber-400">⚡ Evento Sorpresa</span>
      </div>
      <h3 class="text-lg font-bold text-white mb-6">${sanitizeInput(q.question)}</h3>
      <div class="space-y-3">
        ${q.options.map((opt, i) => `
          <button class="w-full text-left p-4 rounded-xl bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-400/40 text-sm text-white transition-all" onclick="window.selectRandomEventAnswer(${i})">
            ${sanitizeInput(opt)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.selectRandomEventAnswer = function selectRandomEventAnswer(optionIndex) {
  const state = window._activeEventQuiz;
  if (!state) return;
  state.selections.push(optionIndex);
  state.index++;

  if (state.index < state.questions.length) {
    window.renderRandomEventQuestion();
  } else {
    window.submitRandomEventAnswers();
  }
}

window.submitRandomEventAnswers = async function submitRandomEventAnswers() {
  const state = window._activeEventQuiz;
  if (!state) return;
  document.getElementById('random-event-quiz-modal')?.remove();
  document.getElementById('random-event-banner')?.remove();

  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/submit-event-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ event_id: state.eventId, answers: state.selections }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error enviando respuestas');

    window.showToast(`<i class="fas fa-circle-check"></i> ¡Respondiste! ${result.score}/${result.total} correctas. Se reparten las gemas cuando termine el evento.`, 'success');
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
  }
  window._activeEventQuiz = null;
}

// ================================================
// PANEL ADMIN -- lanzar/cancelar eventos manualmente
// ================================================
const RANDOM_EVENT_TOPICS = [
  'Robótica educativa', 'Programación por bloques', 'Ciencias de la computación',
  'Electrónica básica', 'Inteligencia artificial', 'Matemática aplicada',
  'Historia de Guatemala', 'Geografía de Guatemala', 'Cultura maya',
  'Tradiciones de Guatemala', 'Biodiversidad de Guatemala',
  'Cultura general internacional', 'Historia mundial', 'Ciencia y descubrimientos',
];

window.openRandomEventsAdminModal = function openRandomEventsAdminModal() {
  document.getElementById('random-events-admin-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'random-events-admin-modal';
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900 border border-fuchsia-500/30">
      <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
        <h2 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
          <i class="fas fa-bolt text-fuchsia-500"></i> Eventos Sorpresa
        </h2>
        <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-all flex items-center justify-center font-bold" onclick="this.closest('.fixed').remove()">
          <i class="fas fa-times text-lg"></i>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        <div class="p-5 rounded-2xl bg-fuchsia-50 dark:bg-fuchsia-950/20 border border-fuchsia-100 dark:border-fuchsia-900/30">
          <p class="text-[0.65rem] font-black uppercase text-fuchsia-600 dark:text-fuchsia-400 tracking-widest mb-3">Lanzar un evento ahora</p>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div class="col-span-2">
              <label class="text-[0.6rem] font-bold uppercase text-slate-400 mb-1 block">Tema (vacío = al azar)</label>
              <input type="text" id="re-admin-topic" class="input-field-tw h-10 text-sm" placeholder="Ej: robótica, cultura maya...">
            </div>
            <div>
              <label class="text-[0.6rem] font-bold uppercase text-slate-400 mb-1 block">Gemas en el pozo</label>
              <input type="number" id="re-admin-gems" class="input-field-tw h-10 text-sm" value="100" min="10">
            </div>
            <div>
              <label class="text-[0.6rem] font-bold uppercase text-slate-400 mb-1 block">Preguntas</label>
              <input type="number" id="re-admin-questions" class="input-field-tw h-10 text-sm" value="8" min="3" max="15">
            </div>
            <div class="col-span-2">
              <label class="text-[0.6rem] font-bold uppercase text-slate-400 mb-1 block">Duración (minutos)</label>
              <input type="number" id="re-admin-duration" class="input-field-tw h-10 text-sm" value="15" min="5" max="60">
            </div>
          </div>
          <button id="btn-launch-random-event" class="btn-primary-tw w-full h-11 text-xs uppercase font-black" onclick="window.launchRandomEventNow()">
            <i class="fas fa-rocket"></i> Lanzar Evento Ahora
          </button>
          <p class="text-[0.6rem] text-slate-400 mt-2"><i class="fas fa-circle-info"></i> Tarda hasta 1 minuto en dispararse (lo recoge el cron que corre cada minuto) y manda push real a todos los estudiantes suscritos.</p>
        </div>

        <div>
          <p class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest mb-3">Últimos eventos</p>
          <div id="random-events-admin-list" class="space-y-2">
            <div class="text-center text-slate-400 text-xs py-6"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window.loadRandomEventsAdminList();
}

window.launchRandomEventNow = async function launchRandomEventNow() {
  const topicInput = document.getElementById('re-admin-topic')?.value.trim();
  const gemPool = parseInt(document.getElementById('re-admin-gems')?.value) || 100;
  const questionCount = Math.max(3, Math.min(15, parseInt(document.getElementById('re-admin-questions')?.value) || 8));
  const duration = parseInt(document.getElementById('re-admin-duration')?.value) || 15;
  const topic = topicInput || RANDOM_EVENT_TOPICS[Math.floor(Math.random() * RANDOM_EVENT_TOPICS.length)];
  const btn = document.getElementById('btn-launch-random-event');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lanzando...';

  const { error } = await window._supabase.from('random_events').insert({
    scheduled_for: new Date().toISOString(),
    duration_minutes: duration,
    topic,
    question_count: questionCount,
    gem_pool: gemPool,
    status: 'scheduled',
  });

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-rocket"></i> Lanzar Evento Ahora';

  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  window.showToast('<i class="fas fa-circle-check"></i> Evento programado -- se dispara en menos de 1 minuto', 'success');
  window.loadRandomEventsAdminList();
}

window.cancelScheduledEvent = async function cancelScheduledEvent(eventId) {
  const { error } = await window._supabase.from('random_events').update({ status: 'completed' }).eq('id', eventId).eq('status', 'scheduled');
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  window.showToast('<i class="fas fa-circle-check"></i> Evento cancelado', 'success');
  window.loadRandomEventsAdminList();
}

window.loadRandomEventsAdminList = async function loadRandomEventsAdminList() {
  const listEl = document.getElementById('random-events-admin-list');
  if (!listEl) return;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const { data: events, error } = await window._supabase.from('random_events')
    .select('id, topic, gem_pool, question_count, duration_minutes, scheduled_for, status')
    .order('scheduled_for', { ascending: false })
    .limit(10);

  if (error) { listEl.innerHTML = `<p class="text-rose-500 text-xs">${error.message}</p>`; return; }
  if (!events?.length) { listEl.innerHTML = '<p class="text-slate-400 text-xs text-center py-4">Todavía no hubo eventos.</p>'; return; }

  const eventIds = events.map(e => e.id);
  const { data: participants } = await window._supabase.from('event_participants')
    .select('event_id, student_id, score, rank, students(full_name)')
    .in('event_id', eventIds);

  const statusLabel = { scheduled: 'Programado', active: 'Activo ahora', completed: 'Completado' };
  const statusColor = { scheduled: 'bg-amber-500/10 text-amber-500', active: 'bg-emerald-500/10 text-emerald-500 animate-pulse', completed: 'bg-slate-200 dark:bg-slate-700 text-slate-500' };

  listEl.innerHTML = events.map(e => {
    const winner = (participants || []).find(p => p.event_id === e.id && p.rank === 1);
    const count = (participants || []).filter(p => p.event_id === e.id).length;
    return `
      <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-xs font-bold text-slate-800 dark:text-white truncate">${sanitizeInput(e.topic)} -- ${e.gem_pool} gemas</div>
          <div class="text-[0.6rem] text-slate-400">${new Date(e.scheduled_for).toLocaleString('es-GT')} · ${count} participante(s)${winner ? ` · 🏆 ${sanitizeInput(winner.students?.full_name || '')}` : ''}</div>
        </div>
        <div class="shrink-0 flex items-center gap-2">
          <span class="px-2.5 py-1 rounded-lg text-[0.6rem] font-black uppercase ${statusColor[e.status]}">${statusLabel[e.status]}</span>
          ${e.status === 'scheduled' ? `<button class="text-rose-500 hover:underline text-[0.6rem] font-bold uppercase" onclick="window.cancelScheduledEvent('${e.id}')">Cancelar</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (window.currentUser && window.userRole === 'estudiante') {
        window.checkActiveRandomEvent();
        setInterval(window.checkActiveRandomEvent, 60_000);
      }
    }, 3000);
  });
}
