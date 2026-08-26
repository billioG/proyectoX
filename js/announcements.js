/**
 * AVISOS -- docente a su clase asignada, admin a estudiantes/docentes/todos.
 * Solo dentro de la app (no usa push) -- reusa el mismo icono de campana
 * del header para todos los roles.
 */

window.loadAnnouncementsUnreadCount = async function loadAnnouncementsUnreadCount() {
  const badge = document.getElementById('announcements-unread-badge');
  if (!badge || !window.currentUser) return;
  const _supabase = window._supabase;

  const { data: announcements } = await _supabase.from('announcements')
    .select('id').order('created_at', { ascending: false }).limit(50);
  const { data: reads } = await _supabase.from('announcement_reads')
    .select('announcement_id').eq('user_id', window.currentUser.id);
  const readIds = new Set((reads || []).map(r => r.announcement_id));
  const unreadAnnouncements = (announcements || []).filter(a => !readIds.has(a.id)).length;

  const pendingSurveys = typeof window.getPendingSurveys === 'function' ? await window.getPendingSurveys() : [];
  const unread = unreadAnnouncements + pendingSurveys.length;

  if (unread > 0) {
    badge.textContent = unread;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
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

  const [{ data: announcements, error }, pendingSurveys, adminSurveys] = await Promise.all([
    _supabase.from('announcements').select('id, title, message, sender_role, created_at').order('created_at', { ascending: false }).limit(50),
    typeof window.getPendingSurveys === 'function' ? window.getPendingSurveys() : Promise.resolve([]),
    window.userRole === 'admin' ? _supabase.from('surveys').select('id, title, created_at').order('created_at', { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
  ]);

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
      <button class="text-primary hover:underline text-[0.6rem] font-bold uppercase shrink-0" onclick="window.openSurveyResultsModal('${s.id}')">Ver Resultados</button>
    </div>
  `).join('') : '';

  const announcementCards = (announcements || []).map(a => `
    <div class="p-4 rounded-xl border ${readIds.has(a.id) ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800' : 'bg-primary/5 border-primary/20'}">
      <div class="flex items-center justify-between gap-2 mb-1">
        <h4 class="text-sm font-bold text-slate-800 dark:text-white">${sanitizeInput(a.title)}</h4>
        ${!readIds.has(a.id) ? '<span class="w-2 h-2 rounded-full bg-primary shrink-0"></span>' : ''}
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">${sanitizeInput(a.message)}</p>
      <p class="text-[0.6rem] text-slate-400 uppercase font-bold mt-2">${a.sender_role === 'admin' ? 'Administración' : 'Docente'} · ${new Date(a.created_at).toLocaleDateString('es-GT')}</p>
    </div>
  `).join('');

  const adminSurveysBlock = window.userRole === 'admin' && adminSurveyCards
    ? `<p class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mt-4 mb-1">Mis Encuestas</p>${adminSurveyCards}`
    : '';

  listEl.innerHTML = surveyCards + announcementCards + adminSurveysBlock
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

  const { error } = await window._supabase.from('announcements').insert(payload);

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar';
    return;
  }

  window.showToast('<i class="fas fa-circle-check"></i> Aviso enviado', 'success');
  document.getElementById('send-announcement-modal')?.remove();
  document.getElementById('announcements-inbox-modal')?.remove();
  window.openAnnouncementsInbox();
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (window.currentUser) window.loadAnnouncementsUnreadCount();
    }, 3000);
  });
}
