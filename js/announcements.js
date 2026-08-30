/**
 * AVISOS -- docente a su clase asignada, admin a estudiantes/docentes/todos.
 * Además del punto rojo en la campana del header (in-app), manda push real
 * vía notify-announcement al enviarse.
 */

window.loadAnnouncementsUnreadCount = async function loadAnnouncementsUnreadCount() {
  const badge = document.getElementById('announcements-unread-badge');
  if (!badge || !window.currentUser) return;

  // El admin ve TODO (is_staff() en las RLS, para poder auditar/borrar
  // cualquier aviso), pero eso hacía que le llegaran como "no leídos"
  // avisos de cada docente a sus alumnos y cada encuesta -- ruido que no
  // le corresponde como destinatario. El admin gestiona avisos/encuestas
  // desde su propio panel en el dashboard, no desde la campana.
  if (window.userRole === 'admin') {
    document.getElementById('announcements-bell')?.remove();
    return;
  }

  const _supabase = window._supabase;

  const { data: announcements } = await _supabase.from('announcements')
    .select('id').order('created_at', { ascending: false }).limit(50);
  const { data: reads } = await _supabase.from('announcement_reads')
    .select('announcement_id').eq('user_id', window.currentUser.id);
  const readIds = new Set((reads || []).map(r => r.announcement_id));
  const unreadAnnouncements = (announcements || []).filter(a => !readIds.has(a.id)).length;

  const pendingSurveys = typeof window.getPendingSurveys === 'function' ? await window.getPendingSurveys() : [];
  const { data: unreadCommentNotifs } = await _supabase.from('comment_notifications').select('id').eq('read', false);
  // Retos 1v1 pendientes ahora también suman al total de la campana -- antes
  // "te retaron" solo prendía el punto rojo del botón Centro de Juego, que
  // el alumno no siempre asocia con "tengo una notificación nueva".
  const pendingChallenges = await getPendingChallengeCards();
  const unread = unreadAnnouncements + pendingSurveys.length + (unreadCommentNotifs?.length || 0) + pendingChallenges.length;

  if (unread > 0) {
    badge.textContent = unread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// Compartida entre el badge de la campana y el inbox -- junta los retos
// 1v1 pendientes de los 4 juegos (antes cada uno vivía SOLO como punto
// rojo en el botón Centro de Juego, sin entrada acá).
const CHALLENGE_TABLES = [
  { table: 'student_duels', game: 'quiz', label: 'Desafío de Código', hasTopic: true },
  { table: 'student_hangman_duels', game: 'hangman', label: 'Ahorcado', hasTopic: true },
  { table: 'student_timed_math_duels', game: 'timed_math', label: 'Contrarreloj', hasTopic: false },
  { table: 'student_debug_duels', game: 'debug', label: 'Encontrá el Error', hasTopic: true },
];

async function getPendingChallengeCards() {
  if (window.userRole !== 'estudiante' || !window.currentUser) return [];
  const _supabase = window._supabase;

  const results = await Promise.all(CHALLENGE_TABLES.map(t =>
    _supabase.from(t.table)
      .select(`id, wager_gems, created_at${t.hasTopic ? ', topic' : ''}, challenger:students!challenger_id(full_name)`)
      .eq('opponent_id', window.currentUser.id).eq('status', 'pending')
  ));

  const rows = [];
  results.forEach((res, i) => {
    (res.data || []).forEach(d => rows.push({ ...d, ...CHALLENGE_TABLES[i] }));
  });
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

window.openAnnouncementsInbox = async function openAnnouncementsInbox() {
  document.getElementById('announcements-inbox-modal')?.remove();
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const sanitizeInput = window.sanitizeInput || ((v) => v);
  const isStaffSender = window.userRole === 'docente' || window.userRole === 'admin';

  const modal = document.createElement('div');
  modal.id = 'announcements-inbox-modal';
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
      <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
        <h2 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
          <i class="fas fa-bell text-primary"></i> Avisos
        </h2>
        <div class="flex items-center gap-2">
          ${isStaffSender ? `<button onclick="window.openSendAnnouncementModal()" class="h-9 px-3 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-white text-[0.65rem] font-black uppercase transition-all"><i class="fas fa-paper-plane"></i> Aviso</button>` : ''}
          ${window.userRole === 'admin' ? `<button onclick="window.openCreateSurveyModal()" class="h-9 px-3 rounded-lg bg-fuchsia-500/10 text-fuchsia-500 hover:bg-fuchsia-500 hover:text-white text-[0.65rem] font-black uppercase transition-all"><i class="fas fa-clipboard-list"></i> Encuesta</button>` : ''}
          <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 flex items-center justify-center" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div id="announcements-list" class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
        <div class="text-center text-slate-400 text-xs py-6"><i class="fas fa-spinner fa-spin"></i></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const [{ data: announcements, error }, pendingSurveys, adminSurveys, { data: commentNotifs }, pendingChallenges] = await Promise.all([
    _supabase.from('announcements').select('id, title, message, sender_id, sender_role, created_at').order('created_at', { ascending: false }).limit(50),
    typeof window.getPendingSurveys === 'function' ? window.getPendingSurveys() : Promise.resolve([]),
    window.userRole === 'admin' ? _supabase.from('surveys').select('id, title, created_at').order('created_at', { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
    _supabase.from('comment_notifications').select('id, type, actor_name, content_preview, lesson_id, read, created_at').order('created_at', { ascending: false }).limit(30),
    getPendingChallengeCards(),
  ]);

  const challengeCards = (pendingChallenges || []).map(c => {
    const challengerName = (Array.isArray(c.challenger) ? c.challenger[0] : c.challenger)?.full_name || 'Alguien';
    const subject = c.hasTopic ? c.topic : c.label;
    return `
    <div class="p-4 rounded-xl border-2 border-rose-400/40 bg-rose-500/5 cursor-pointer hover:border-rose-500/60 transition-colors" onclick="this.closest('.fixed').remove(); window.routeNotificationTarget('game-center')">
      <div class="flex items-center gap-2 mb-1">
        <i class="fas fa-swords text-rose-500"></i>
        <h4 class="text-sm font-bold text-slate-800 dark:text-white">${sanitizeInput(challengerName)} te retó a ${sanitizeInput(c.label)}</h4>
        <span class="w-2 h-2 rounded-full bg-rose-500 ml-auto shrink-0"></span>
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400 pl-6">${sanitizeInput(subject)} · ${c.wager_gems} gemas en juego</p>
    </div>
  `;
  }).join('');

  const unreadCommentIds = (commentNotifs || []).filter(n => !n.read).map(n => n.id);
  if (unreadCommentIds.length) {
    await _supabase.from('comment_notifications').update({ read: true }).in('id', unreadCommentIds);
    window.loadAnnouncementsUnreadCount();
  }

  const commentNotifCards = (commentNotifs || []).map(n => `
    <div class="p-4 rounded-xl border cursor-pointer hover:border-primary/30 transition-colors ${n.read ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800' : 'bg-rose-500/5 border-rose-400/30'}" onclick="window.openCommentNotification('${n.lesson_id}')">
      <div class="flex items-center gap-2">
        <i class="fas ${n.type === 'like' ? 'fa-heart text-rose-500' : 'fa-reply text-primary'}"></i>
        <p class="text-xs text-slate-600 dark:text-slate-300 font-bold">${n.type === 'like' ? 'Le dieron like a tu comentario' : `${sanitizeInput(n.actor_name || 'Alguien')} respondió tu comentario`}</p>
        ${!n.read ? '<span class="w-2 h-2 rounded-full bg-rose-500 ml-auto shrink-0"></span>' : ''}
      </div>
      ${n.content_preview ? `<p class="text-[0.7rem] text-slate-400 mt-1 pl-6">"${sanitizeInput(n.content_preview)}"</p>` : ''}
    </div>
  `).join('');

  const listEl = document.getElementById('announcements-list');
  if (error) { listEl.innerHTML = `<p class="text-rose-500 text-xs">${error.message}</p>`; return; }

  const { data: reads } = await _supabase.from('announcement_reads')
    .select('announcement_id').eq('user_id', currentUser.id);
  const readIds = new Set((reads || []).map(r => r.announcement_id));

  const surveyCards = (pendingSurveys || []).map(s => `
    <div class="p-4 rounded-xl border-2 border-fuchsia-400/40 bg-fuchsia-500/5">
      <div class="flex items-center justify-between gap-2 mb-1">
        <h4 class="text-sm font-bold text-slate-800 dark:text-white"><i class="fas fa-clipboard-list text-fuchsia-500 mr-1"></i> ${sanitizeInput(s.title)}</h4>
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">${sanitizeInput(s.description || 'Nueva encuesta -- tu opinión ayuda a mejorar la plataforma.')}</p>
      <button class="mt-2 h-8 px-3 rounded-lg bg-fuchsia-500 text-white text-[0.6rem] font-black uppercase" onclick="window.openAnswerSurveyModal('${s.id}')">Responder</button>
    </div>
  `).join('');

  const adminSurveyCards = window.userRole === 'admin' ? (adminSurveys?.data || adminSurveys || []).map(s => `
    <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
      <span class="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">${sanitizeInput(s.title)}</span>
      <div class="flex items-center gap-3 shrink-0">
        <button class="text-primary hover:underline text-[0.6rem] font-bold uppercase" onclick="window.openSurveyResultsModal('${s.id}')">Ver Resultados</button>
        <button class="text-slate-300 hover:text-rose-500 transition-colors" onclick="window.deleteSurvey('${s.id}')" title="Eliminar encuesta"><i class="fas fa-trash-alt text-xs"></i></button>
      </div>
    </div>
  `).join('') : '';

  const canDeleteAny = window.userRole === 'admin';
  const announcementCards = (announcements || []).map(a => {
    const canDelete = canDeleteAny || a.sender_id === currentUser.id;
    return `
    <div class="p-4 rounded-xl border ${readIds.has(a.id) ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800' : 'bg-primary/5 border-primary/20'}">
      <div class="flex items-center justify-between gap-2 mb-1">
        <h4 class="text-sm font-bold text-slate-800 dark:text-white">${sanitizeInput(a.title)}</h4>
        <div class="flex items-center gap-2 shrink-0">
          ${!readIds.has(a.id) ? '<span class="w-2 h-2 rounded-full bg-primary"></span>' : ''}
          ${canDelete ? `<button class="text-slate-300 hover:text-primary transition-colors" onclick="window.openAnnouncementReadersModal('${a.id}')" title="Ver quién lo leyó"><i class="fas fa-eye text-xs"></i></button>` : ''}
          ${canDelete ? `<button class="text-slate-300 hover:text-rose-500 transition-colors" onclick="window.deleteAnnouncement('${a.id}')" title="Eliminar aviso"><i class="fas fa-trash-alt text-xs"></i></button>` : ''}
        </div>
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">${sanitizeInput(a.message)}</p>
      <p class="text-[0.6rem] text-slate-400 uppercase font-bold mt-2">${a.sender_role === 'admin' ? 'Administración' : 'Docente'} · ${new Date(a.created_at).toLocaleDateString('es-GT')}</p>
    </div>
  `;
  }).join('');

  const adminSurveysBlock = window.userRole === 'admin' && adminSurveyCards
    ? `<p class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mt-4 mb-1">Mis Encuestas</p>${adminSurveyCards}`
    : '';

  listEl.innerHTML = challengeCards + commentNotifCards + surveyCards + announcementCards + adminSurveysBlock
    || '<p class="text-slate-400 text-sm text-center py-10">Todavía no tenés avisos.</p>';

  // Marcar todos como leídos al abrir la bandeja.
  const unreadIds = announcements.filter(a => !readIds.has(a.id)).map(a => a.id);
  if (unreadIds.length) {
    await _supabase.from('announcement_reads').upsert(
      unreadIds.map(id => ({ announcement_id: id, user_id: currentUser.id })),
      { onConflict: 'announcement_id,user_id' }
    );
    window.loadAnnouncementsUnreadCount();
  }
}

window.openCommentNotification = async function openCommentNotification(lessonId) {
  document.getElementById('announcements-inbox-modal')?.remove();
  const { data: lesson } = await window._supabase.from('lessons').select('course_id').eq('id', lessonId).maybeSingle();
  if (!lesson) return;

  if (window.userRole === 'estudiante') {
    if (!window._coursesCache) await window.loadLessons();
    window.openCoursePlayer(lesson.course_id);
    const idx = window._activeCourse?.items?.findIndex(i => i.id === lessonId);
    if (idx > -1 && idx !== window._activeCourseIndex) window.selectCourseResource(idx);
  } else {
    await window.openCourseManager(lesson.course_id);
    window.previewCourseResource(lessonId);
  }
}

window.openAnnouncementReadersModal = async function openAnnouncementReadersModal(id) {
  const _supabase = window._supabase;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  document.getElementById('announcement-readers-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'announcement-readers-modal';
  modal.className = 'fixed inset-0 z-[230] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
      <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
        <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight"><i class="fas fa-eye text-primary mr-1"></i> Quién lo leyó</h3>
        <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 flex items-center justify-center" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div id="announcement-readers-list" class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
        <div class="text-center text-slate-400 text-xs py-6"><i class="fas fa-spinner fa-spin"></i></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const { data: ann } = await _supabase.from('announcements').select('*').eq('id', id).single();
  const listEl = document.getElementById('announcement-readers-list');
  if (!ann) { listEl.innerHTML = '<p class="text-rose-500 text-xs">No se pudo cargar el aviso.</p>'; return; }

  let recipients = [];
  if (ann.audience === 'students' && ann.school_code) {
    const { data } = await _supabase.from('students').select('id, full_name').eq('school_code', ann.school_code).eq('grade', ann.grade).eq('section', ann.section);
    recipients = data || [];
  } else if (ann.audience === 'students') {
    const { data } = await _supabase.from('students').select('id, full_name');
    recipients = data || [];
  } else if (ann.audience === 'teachers') {
    const { data } = await _supabase.from('teachers').select('id, full_name');
    recipients = data || [];
  } else {
    const [{ data: studs }, { data: techs }] = await Promise.all([
      _supabase.from('students').select('id, full_name'),
      _supabase.from('teachers').select('id, full_name'),
    ]);
    recipients = [...(studs || []), ...(techs || [])];
  }

  const { data: reads } = await _supabase.from('announcement_reads').select('user_id').eq('announcement_id', id);
  const readIds = new Set((reads || []).map(r => r.user_id));

  const readList = recipients.filter(r => readIds.has(r.id));
  const unreadList = recipients.filter(r => !readIds.has(r.id));

  const renderNames = (list) => list.length
    ? `<div class="flex flex-wrap gap-1.5">${list.map(r => `<span class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[0.7rem] font-semibold text-slate-600 dark:text-slate-300">${sanitizeInput(r.full_name)}</span>`).join('')}</div>`
    : '<p class="text-xs text-slate-400">Nadie por ahora.</p>';

  listEl.innerHTML = `
    <div>
      <p class="text-[0.65rem] font-black uppercase text-emerald-500 tracking-widest mb-2"><i class="fas fa-circle-check"></i> Leyeron (${readList.length}/${recipients.length})</p>
      ${renderNames(readList)}
    </div>
    <div>
      <p class="text-[0.65rem] font-black uppercase text-amber-500 tracking-widest mb-2"><i class="fas fa-clock"></i> Sin leer (${unreadList.length})</p>
      ${renderNames(unreadList)}
    </div>
  `;
};

window.deleteAnnouncement = async function deleteAnnouncement(id) {
  if (!confirm('¿Eliminar este aviso? Desaparece para todos los que lo recibieron.')) return;
  const { error } = await window._supabase.from('announcements').delete().eq('id', id);
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  window.showToast('<i class="fas fa-circle-check"></i> Aviso eliminado', 'success');
  window.openAnnouncementsInbox();
  window.loadAnnouncementsUnreadCount();
}

window.openSendAnnouncementModal = async function openSendAnnouncementModal() {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const isAdmin = window.userRole === 'admin';

  let classOptions = [];
  if (!isAdmin) {
    const { data: assignments } = await _supabase.from('teacher_assignments')
      .select('school_code, grade, section, schools(name)').eq('teacher_id', currentUser.id);
    classOptions = assignments || [];
    if (!classOptions.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés clases asignadas todavía', 'error');
  }

  const modal = document.createElement('div');
  modal.id = 'send-announcement-modal';
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-8 shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
      <h3 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter mb-6"><i class="fas fa-paper-plane text-primary mr-2"></i> Enviar Aviso</h3>
      <div class="space-y-4">
        ${isAdmin ? `
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Destinatarios</label>
          <select id="ann-audience" class="input-field-tw h-11 text-sm">
            <option value="all">Todos (estudiantes y docentes)</option>
            <option value="students">Todos los estudiantes</option>
            <option value="teachers">Todos los docentes</option>
          </select>
        </div>
        ` : `
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Clase</label>
          <select id="ann-class" class="input-field-tw h-11 text-sm">
            ${classOptions.map((c, i) => `<option value="${i}">${window.sanitizeInput(c.schools?.name || c.school_code)} -- ${window.sanitizeInput(c.grade)} ${window.sanitizeInput(c.section)}</option>`).join('')}
          </select>
        </div>
        `}
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Título</label>
          <input type="text" id="ann-title" class="input-field-tw h-11 text-sm" placeholder="Ej: Suspensión de clases">
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Mensaje</label>
          <textarea id="ann-message" class="input-field-tw text-sm" rows="4" placeholder="Escribí el aviso..."></textarea>
        </div>
      </div>
      <div class="flex gap-3 mt-8">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-send-announcement" onclick="window.sendAnnouncement(${JSON.stringify(classOptions).replace(/"/g, '&quot;')})"><i class="fas fa-paper-plane"></i> Enviar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.sendAnnouncement = async function sendAnnouncement(classOptions) {
  const isAdmin = window.userRole === 'admin';
  const title = document.getElementById('ann-title')?.value.trim();
  const message = document.getElementById('ann-message')?.value.trim();
  const btn = document.getElementById('btn-send-announcement');

  if (!title || !message) return window.showToast('<i class="fas fa-circle-xmark"></i> Completá título y mensaje', 'error');

  const payload = {
    sender_id: window.currentUser.id,
    sender_role: window.userRole,
    title, message,
  };

  if (isAdmin) {
    payload.audience = document.getElementById('ann-audience')?.value || 'all';
  } else {
    const classIndex = parseInt(document.getElementById('ann-class')?.value) || 0;
    const cls = classOptions[classIndex];
    if (!cls) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí una clase', 'error');
    payload.audience = 'students';
    payload.school_code = cls.school_code;
    payload.grade = cls.grade;
    payload.section = cls.section;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const { data: inserted, error } = await window._supabase.from('announcements').insert(payload).select().single();

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar';
    return;
  }

  // Antes los avisos eran explícitamente "solo dentro de la app, sin push"
  // -- el destinatario solo se enteraba si tenía la pestaña abierta en ese
  // momento y veía el punto rojo en la campana.
  if (inserted?.id) window.sendAnnouncementPush(inserted.id);

  window.showToast('<i class="fas fa-circle-check"></i> Aviso enviado', 'success');
  document.getElementById('send-announcement-modal')?.remove();
  document.getElementById('announcements-inbox-modal')?.remove();
  window.openAnnouncementsInbox();
}

window.sendAnnouncementPush = async function sendAnnouncementPush(announcementId) {
  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    await fetch(`${window.SUPABASE_URL}/functions/v1/notify-announcement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ announcement_id: announcementId }),
    });
  } catch (err) {
    console.error('Error enviando push de aviso:', err);
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (window.currentUser) window.loadAnnouncementsUnreadCount();
    }, 3000);
  });
}
