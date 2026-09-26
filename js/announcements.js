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
// 1v1 pendientes de los 5 juegos (antes cada uno vivía SOLO como punto
// rojo en el botón Centro de Juego, sin entrada acá).
const CHALLENGE_TABLES = [
  { table: 'student_duels', game: 'quiz', label: 'Desafío de Código', hasTopic: true },
  { table: 'student_hangman_duels', game: 'hangman', label: 'Ahorcado', hasTopic: true },
  { table: 'student_timed_math_duels', game: 'timed_math', label: 'Contrarreloj', hasTopic: false },
  { table: 'student_debug_duels', game: 'debug', label: 'Encontrá el Error', hasTopic: true },
  { table: 'student_spelling_duels', game: 'spelling', label: 'Ortografía', hasTopic: true },
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
  const groups = Array.isArray(ann.target_groups) ? ann.target_groups : [];
  const schools = Array.isArray(ann.target_schools) ? ann.target_schools : [];
  if (ann.audience === 'students' && ann.school_code) {
    const { data } = await _supabase.from('students').select('id, full_name').eq('school_code', ann.school_code).eq('grade', ann.grade).eq('section', ann.section);
    recipients = data || [];
  } else if (groups.length || schools.length) {
    // Alcance por grupos o establecimientos (announcements-targeting.sql).
    const codes = groups.length ? [...new Set(groups.map(g => g.school_code))] : schools;
    const inGroup = (r) => !groups.length || groups.some(g => g.school_code === r.school_code && g.grade === r.grade && g.section === r.section);
    if (ann.audience !== 'teachers') {
      const studs = await window.fetchAllRows(() => _supabase.from('students').select('id, full_name, school_code, grade, section').in('school_code', codes));
      recipients.push(...(studs || []).filter(inGroup));
    }
    if (ann.audience !== 'students') {
      const { data: ta } = await _supabase.from('teacher_assignments').select('teacher_id, school_code, grade, section, teachers(full_name)').in('school_code', codes);
      const seen = new Set();
      (ta || []).filter(inGroup).forEach(r => {
        if (!seen.has(r.teacher_id)) { seen.add(r.teacher_id); recipients.push({ id: r.teacher_id, full_name: r.teachers?.full_name || 'Docente' }); }
      });
    }
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

// Destinatarios (ver migrations/announcements-targeting.sql):
//   admin   -> todos / solo estudiantes / solo docentes, en todos los
//              establecimientos, en algunos, o en grupos puntuales.
//   docente -> estudiantes de uno o varios de SUS grupos.
// En ambos casos se puede avisar también a los padres (SMS/notificación).
window.openSendAnnouncementModal = async function openSendAnnouncementModal() {
  const _supabase = window._supabase;
  const isAdmin = window.userRole === 'admin';
  const s = window.sanitizeInput || ((v) => v);

  let groups = [];      // [{school_code, grade, section, schoolName}]
  let schools = [];     // [{code, name}]
  if (isAdmin) {
    const [{ data: sch }, rows] = await Promise.all([
      _supabase.from('schools').select('code, name').order('name'),
      window.fetchAllRows(() => _supabase.from('students').select('school_code, grade, section')),
    ]);
    schools = sch || [];
    const names = new Map(schools.map(x => [x.code, x.name]));
    const seen = new Set();
    (rows || []).forEach(r => {
      const k = `${r.school_code}|${r.grade}|${r.section}`;
      if (r.school_code && r.grade && r.section && !seen.has(k)) {
        seen.add(k);
        groups.push({ school_code: r.school_code, grade: r.grade, section: r.section, schoolName: names.get(r.school_code) || r.school_code });
      }
    });
  } else {
    const { data } = await _supabase.from('teacher_assignments')
      .select('school_code, grade, section, schools(name)').eq('teacher_id', window.currentUser.id);
    groups = (data || []).map(a => ({ school_code: a.school_code, grade: a.grade, section: a.section, schoolName: a.schools?.name || a.school_code }));
    if (!groups.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés clases asignadas todavía', 'error');
  }
  groups.sort((a, b) => `${a.schoolName}${a.grade}${a.section}`.localeCompare(`${b.schoolName}${b.grade}${b.section}`));
  window._annTargets = { groups, schools };

  // Grupos agrupados por establecimiento, con "marcar todo el colegio".
  const bySchool = new Map();
  groups.forEach((g, i) => {
    if (!bySchool.has(g.school_code)) bySchool.set(g.school_code, { name: g.schoolName, items: [] });
    bySchool.get(g.school_code).items.push(i);
  });
  const groupsHtml = [...bySchool.entries()].map(([code, sc]) => `
    <div class="rounded-xl border border-slate-100 dark:border-slate-800 p-2.5">
      <label class="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-200">
        <input type="checkbox" class="w-4 h-4" onchange="document.querySelectorAll('[data-ann-school=&quot;${window.sanitizeAttr(code)}&quot;]').forEach(c => c.checked = this.checked); window.updateAnnSummary()">
        ${s(sc.name)}
      </label>
      <div class="flex flex-wrap gap-1.5 mt-2 pl-6">
        ${sc.items.map(i => `<label class="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 text-[0.7rem] font-bold text-slate-600 dark:text-slate-300">
          <input type="checkbox" class="ann-group w-3.5 h-3.5" value="${i}" data-ann-school="${window.sanitizeAttr(code)}" onchange="window.updateAnnSummary()"> ${s(groups[i].grade)} ${s(groups[i].section)}</label>`).join('')}
      </div>
    </div>`).join('');

  const modal = document.createElement('div');
  modal.id = 'send-announcement-modal';
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg max-h-[92vh] overflow-y-auto custom-scrollbar p-6 shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
      <h3 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter mb-5"><i class="fas fa-paper-plane text-primary mr-2"></i> Enviar Aviso</h3>
      <div class="space-y-4">
        ${isAdmin ? `
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">¿A quién?</label>
          <div class="grid grid-cols-3 gap-2">
            ${[['all', 'Todos', 'fa-users'], ['students', 'Estudiantes', 'fa-user-graduate'], ['teachers', 'Docentes', 'fa-chalkboard-teacher']].map(([v, l, ic], i) => `
              <label class="flex flex-col items-center gap-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="ann-audience" value="${v}" ${i === 0 ? 'checked' : ''} class="sr-only" onchange="window.updateAnnSummary()"><i class="fas ${ic} text-primary"></i>${l}</label>`).join('')}
          </div>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">¿Dónde?</label>
          <select id="ann-scope" class="input-field-tw h-11 text-sm" onchange="window.updateAnnSummary()">
            <option value="everywhere">Todos los establecimientos</option>
            <option value="schools">Elegir establecimientos</option>
            <option value="groups">Elegir grupos</option>
          </select>
        </div>
        <div id="ann-schools-box" class="hidden space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
          ${schools.map(sc => `<label class="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300">
            <input type="checkbox" class="ann-school w-4 h-4" value="${window.sanitizeAttr(sc.code)}" onchange="window.updateAnnSummary()"> ${s(sc.name)}</label>`).join('')}
        </div>` : ''}
        <div id="ann-groups-box" class="${isAdmin ? 'hidden' : ''} space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
          ${isAdmin ? '' : '<label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest block">Tus grupos</label>'}
          ${groupsHtml}
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Título</label>
          <input type="text" id="ann-title" maxlength="120" class="input-field-tw h-11 text-sm" placeholder="Ej: Suspensión de clases">
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Mensaje</label>
          <textarea id="ann-message" class="input-field-tw text-sm" rows="4" placeholder="Escribí el aviso..."></textarea>
        </div>
        <label id="ann-guardians-box" class="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 cursor-pointer">
          <input type="checkbox" id="ann-guardians" class="w-5 h-5 mt-0.5" onchange="window.updateAnnSummary()">
          <span class="text-xs text-slate-600 dark:text-slate-300"><b>También avisar a los padres</b> de esos estudiantes<br>Por notificación si la activaron en su portal, o por SMS. Mantenelo corto (menos de 160 letras).</span>
        </label>
        <p id="ann-summary" class="text-xs font-bold text-primary"></p>
      </div>
      <div class="flex gap-3 mt-6">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-send-announcement" onclick="window.sendAnnouncement()"><i class="fas fa-paper-plane"></i> Enviar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window.updateAnnSummary();
};

// Lee la selección actual del modal.
function readAnnTargets() {
  const isAdmin = window.userRole === 'admin';
  const { groups } = window._annTargets || { groups: [] };
  const audience = isAdmin ? (document.querySelector('input[name="ann-audience"]:checked')?.value || 'all') : 'students';
  const scope = isAdmin ? (document.getElementById('ann-scope')?.value || 'everywhere') : 'groups';
  const pickedGroups = [...document.querySelectorAll('.ann-group:checked')].map(c => groups[Number(c.value)]);
  const pickedSchools = [...document.querySelectorAll('.ann-school:checked')].map(c => c.value);
  return { isAdmin, audience, scope, pickedGroups, pickedSchools };
}

window.updateAnnSummary = function updateAnnSummary() {
  const t = readAnnTargets();
  document.getElementById('ann-schools-box')?.classList.toggle('hidden', t.scope !== 'schools');
  document.getElementById('ann-groups-box')?.classList.toggle('hidden', t.scope !== 'groups');
  document.getElementById('ann-guardians-box')?.classList.toggle('hidden', t.audience === 'teachers');
  const who = { all: 'estudiantes y docentes', students: 'estudiantes', teachers: 'docentes' }[t.audience];
  const where = t.scope === 'everywhere' ? 'de todos los establecimientos'
    : t.scope === 'schools' ? `de ${t.pickedSchools.length} establecimiento(s)`
    : `de ${t.pickedGroups.length} grupo(s)`;
  const parents = document.getElementById('ann-guardians')?.checked && t.audience !== 'teachers' ? ' + sus padres' : '';
  const el = document.getElementById('ann-summary');
  if (el) el.innerHTML = `<i class="fas fa-bullseye"></i> Le llega a: ${who} ${where}${parents}`;
};

// Grupos a los que corresponde avisar a los padres según la selección.
function guardianGroupsFor(t) {
  const { groups } = window._annTargets || { groups: [] };
  if (t.scope === 'groups') return t.pickedGroups;
  if (t.scope === 'schools') return groups.filter(g => t.pickedSchools.includes(g.school_code));
  return groups;
}

window.sendAnnouncement = async function sendAnnouncement() {
  const title = document.getElementById('ann-title')?.value.trim();
  const message = document.getElementById('ann-message')?.value.trim();
  const btn = document.getElementById('btn-send-announcement');
  const t = readAnnTargets();

  if (!title || !message) return window.showToast('<i class="fas fa-circle-xmark"></i> Completá título y mensaje', 'error');
  if (t.scope === 'groups' && !t.pickedGroups.length) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí al menos un grupo', 'error');
  if (t.scope === 'schools' && !t.pickedSchools.length) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí al menos un establecimiento', 'error');

  const payload = {
    sender_id: window.currentUser.id,
    sender_role: window.userRole,
    title, message,
    audience: t.audience,
  };
  if (t.scope === 'groups') payload.target_groups = t.pickedGroups.map(g => ({ school_code: g.school_code, grade: g.grade, section: g.section }));
  if (t.scope === 'schools') payload.target_schools = t.pickedSchools;

  const wantsParents = document.getElementById('ann-guardians')?.checked && t.audience !== 'teachers';
  const parentGroups = wantsParents ? guardianGroupsFor(t) : [];
  if (wantsParents && parentGroups.length > 15 && !confirm(`Vas a avisar a los padres de ${parentGroups.length} grupos. Los que no activaron el portal lo recibirán por SMS. ¿Continuar?`)) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const { data: inserted, error } = await window._supabase.from('announcements').insert(payload).select().single();

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + (/target_groups|target_schools/.test(error.message) ? 'Falta correr migrations/announcements-targeting.sql' : error.message), 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar';
    return;
  }

  // Antes los avisos eran explícitamente "solo dentro de la app, sin push"
  // -- el destinatario solo se enteraba si tenía la pestaña abierta en ese
  // momento y veía el punto rojo en la campana.
  if (inserted?.id) window.sendAnnouncementPush(inserted.id);

  // Padres (migrations/guardians.sql + notify-guardians): se encola por grupo.
  if (parentGroups.length) {
    const text = `${title}: ${message}`.slice(0, 300);
    let push = 0, sms = 0, none = 0, failedGroups = 0;
    for (const g of parentGroups) {
      const { data: counts, error: gErr } = await window._supabase.rpc('enqueue_class_guardian_message', {
        p_school_code: g.school_code, p_grade: g.grade, p_section: g.section, p_text: text,
      });
      if (gErr) { failedGroups++; continue; }
      push += counts?.push || 0; sms += counts?.sms || 0; none += counts?.none || 0;
    }
    if (push + sms) {
      const { data: { session } } = await window._supabase.auth.getSession();
      fetch(`${window.SUPABASE_URL}/functions/v1/notify-guardians`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: '{}',
      }).catch(err => console.error('Error enviando avisos a padres:', err));
    }
    window.showToast(`<i class="fas fa-people-roof"></i> Padres: ${push} por notificación, ${sms} por SMS${none ? `, ${none} sin contacto` : ''}${failedGroups ? ` (${failedGroups} grupo(s) con error)` : ''}`, failedGroups ? 'warning' : 'info');
  }

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
