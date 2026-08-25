/**
 * LESSONS - Módulo de lecciones (Fase 1: video/PDF/imagen, sin nota automática)
 */

const LESSON_TYPE_ICON = { video: 'fa-video', pdf: 'fa-file-pdf', image: 'fa-image' };
const LESSON_TYPE_LABEL = { video: 'Video', pdf: 'PDF', image: 'Imagen' };

window.loadLessons = async function loadLessons() {
  const container = document.getElementById('lessons-container');
  if (!container) return;

  if (window.userRole === 'estudiante') {
    return window.loadStudentLessons(container);
  }
  return window.loadTeacherLessons(container);
}

// ================================================
// VISTA DOCENTE / ADMIN
// ================================================
window.loadTeacherLessons = async function loadTeacherLessons(container) {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;

  container.innerHTML = `
    <div class="flex flex-col md:flex-row gap-4 mb-6 items-center">
      <p class="text-xs text-slate-400 grow">Creá lecciones con video, PDF o imágenes para tus clases. Los alumnos las ven desde su propia sección de Lecciones.</p>
      <button class="btn-primary-tw h-11 px-6 text-xs uppercase font-bold shrink-0" onclick="window.openCreateLessonModal()"><i class="fas fa-plus"></i> Nueva Lección</button>
    </div>
    <div id="lessons-list" class="space-y-3">
      <div class="text-center text-slate-400 text-xs py-10"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>
    </div>
  `;

  let query = _supabase.from('lessons').select('*, teachers(full_name), schools(name)').order('created_at', { ascending: false });
  if (window.userRole === 'docente') query = query.eq('created_by', currentUser.id);

  const { data: lessons, error } = await query;
  const listEl = document.getElementById('lessons-list');
  if (!listEl) return;

  if (error) { listEl.innerHTML = `<p class="text-rose-500 text-xs">Error: ${error.message}</p>`; return; }
  if (!lessons?.length) { listEl.innerHTML = '<div class="glass-card p-10 text-center text-slate-400 text-sm">Todavía no creaste ninguna lección.</div>'; return; }

  listEl.innerHTML = lessons.map(l => `
    <div class="glass-card p-4 flex items-center gap-4">
      <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><i class="fas ${LESSON_TYPE_ICON[l.content_type]}"></i></div>
      <div class="min-w-0 flex-1">
        <h4 class="text-sm font-bold text-slate-800 dark:text-white truncate">${window.sanitizeInput(l.title)}</h4>
        <p class="text-[0.7rem] text-slate-400">${window.sanitizeInput(l.schools?.name || l.school_code)} · ${window.sanitizeInput(l.grade)} ${window.sanitizeInput(l.section)} · ${LESSON_TYPE_LABEL[l.content_type]}${window.userRole === 'admin' ? ` · ${window.sanitizeInput(l.teachers?.full_name || '')}` : ''}</p>
      </div>
      <button class="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center shrink-0" onclick="window.deleteLesson('${l.id}')"><i class="fas fa-trash-alt text-xs"></i></button>
    </div>
  `).join('');
}

window.openCreateLessonModal = async function openCreateLessonModal() {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;

  let classOptions = [];
  if (window.userRole === 'admin') {
    const { data: students } = await _supabase.from('students').select('school_code, grade, section, schools(name)');
    const seen = new Set();
    (students || []).forEach(s => {
      if (!s.school_code || !s.grade || !s.section) return;
      const key = `${s.school_code}|${s.grade}|${s.section}`;
      if (seen.has(key)) return;
      seen.add(key);
      classOptions.push({ school_code: s.school_code, grade: s.grade, section: s.section, schoolName: s.schools?.name || s.school_code });
    });
  } else {
    const { data: assignments } = await _supabase.from('teacher_assignments').select('school_code, grade, section, schools(name)').eq('teacher_id', currentUser.id);
    classOptions = (assignments || []).map(a => ({ school_code: a.school_code, grade: a.grade, section: a.section, schoolName: a.schools?.name || a.school_code }));
  }

  if (!classOptions.length) {
    return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés clases asignadas todavía', 'error');
  }

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-8 shadow-2xl animate-slideUp">
      <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter mb-6"><i class="fas fa-book-open text-primary mr-2"></i> Nueva Lección</h2>

      <div class="space-y-4">
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Clase</label>
          <select id="lesson-class" class="input-field-tw h-11 text-sm">
            ${classOptions.map((c, i) => `<option value="${i}">${window.sanitizeInput(c.schoolName)} · ${window.sanitizeInput(c.grade)} ${window.sanitizeInput(c.section)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Título *</label>
          <input type="text" id="lesson-title" class="input-field-tw h-11 text-sm">
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Descripción</label>
          <textarea id="lesson-description" class="input-field-tw text-sm h-20 resize-none"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Tipo</label>
            <select id="lesson-type" class="input-field-tw h-11 text-sm">
              <option value="video">Video (YouTube o link directo)</option>
              <option value="pdf">PDF</option>
              <option value="image">Imagen</option>
            </select>
          </div>
          <div>
            <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">URL *</label>
            <input type="text" id="lesson-url" placeholder="https://..." class="input-field-tw h-11 text-sm">
          </div>
        </div>
      </div>

      <div class="flex gap-3 mt-8">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-save-lesson" onclick="window.saveLesson()">Publicar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window._lessonClassOptions = classOptions;
}

window.saveLesson = async function saveLesson() {
  const classIndex = document.getElementById('lesson-class')?.value;
  const title = document.getElementById('lesson-title')?.value.trim();
  const description = document.getElementById('lesson-description')?.value.trim();
  const content_type = document.getElementById('lesson-type')?.value;
  const content_url = document.getElementById('lesson-url')?.value.trim();
  const btn = document.getElementById('btn-save-lesson');

  if (!title || !content_url) return window.showToast('<i class="fas fa-circle-xmark"></i> Completa título y URL', 'error');
  const classOption = window._lessonClassOptions?.[classIndex];
  if (!classOption) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí una clase', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...';

  try {
    const { error } = await window._supabase.from('lessons').insert({
      title,
      description: description || null,
      content_type,
      content_url,
      school_code: classOption.school_code,
      grade: classOption.grade,
      section: classOption.section,
      created_by: window.currentUser.id,
    });
    if (error) throw error;

    window.showToast('<i class="fas fa-circle-check"></i> Lección publicada', 'success');
    document.querySelector('.fixed.z-\\[200\\]')?.remove();
    window.loadLessons();
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Publicar';
  }
}

window.deleteLesson = async function deleteLesson(id) {
  if (!confirm('¿Eliminar esta lección? Los alumnos ya no podrán verla.')) return;
  const { error } = await window._supabase.from('lessons').delete().eq('id', id);
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  window.showToast('<i class="fas fa-trash-alt"></i> Lección eliminada', 'success');
  window.loadLessons();
}

// ================================================
// VISTA ALUMNO
// ================================================
window.loadStudentLessons = async function loadStudentLessons(container) {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const userData = window.userData;

  container.innerHTML = `<div class="text-center text-slate-400 text-xs py-10"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>`;

  if (!userData?.school_code || !userData?.grade || !userData?.section) {
    container.innerHTML = '<div class="glass-card p-10 text-center text-slate-400 text-sm">Todavía no estás asignado a una clase.</div>';
    return;
  }

  const [{ data: lessons, error }, { data: completions }] = await Promise.all([
    _supabase.from('lessons').select('*')
      .eq('school_code', userData.school_code).eq('grade', userData.grade).eq('section', userData.section)
      .order('created_at', { ascending: false }),
    _supabase.from('lesson_completions').select('lesson_id').eq('student_id', currentUser.id),
  ]);

  if (error) { container.innerHTML = `<p class="text-rose-500 text-xs">Error: ${error.message}</p>`; return; }
  if (!lessons?.length) { container.innerHTML = '<div class="glass-card p-10 text-center text-slate-400 text-sm">Tu docente todavía no publicó lecciones.</div>'; return; }

  const completedIds = new Set((completions || []).map(c => c.lesson_id));
  window._lessonsCache = lessons;

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      ${lessons.map(l => {
        const done = completedIds.has(l.id);
        return `
        <div class="glass-card p-5 flex flex-col gap-3 cursor-pointer hover:border-primary/30 transition-all" onclick="window.openLessonViewer('${l.id}')">
          <div class="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-lg"><i class="fas ${LESSON_TYPE_ICON[l.content_type]}"></i></div>
          <div>
            <h4 class="text-sm font-bold text-slate-800 dark:text-white">${window.sanitizeInput(l.title)}</h4>
            ${l.description ? `<p class="text-xs text-slate-400 mt-1 line-clamp-2">${window.sanitizeInput(l.description)}</p>` : ''}
          </div>
          <span class="text-[0.6rem] font-black uppercase px-2 py-1 rounded-lg w-fit ${done ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}">
            ${done ? '<i class="fas fa-circle-check"></i> Visto' : 'Sin ver'}
          </span>
        </div>
      `;
      }).join('')}
    </div>
  `;
}

window.openLessonViewer = function openLessonViewer(lessonId) {
  const lesson = (window._lessonsCache || []).find(l => l.id === lessonId);
  if (!lesson) return;

  let mediaHtml = '';
  if (lesson.content_type === 'video') {
    const ytMatch = lesson.content_url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{6,})/);
    mediaHtml = ytMatch
      ? `<iframe class="w-full aspect-video rounded-xl" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen></iframe>`
      : `<video class="w-full rounded-xl" src="${lesson.content_url}" controls></video>`;
  } else if (lesson.content_type === 'pdf') {
    mediaHtml = `<iframe class="w-full h-[70vh] rounded-xl border border-slate-200 dark:border-slate-700" src="${lesson.content_url}"></iframe>`;
  } else if (lesson.content_type === 'image') {
    mediaHtml = `<img src="${lesson.content_url}" class="w-full rounded-xl">`;
  }

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-3xl p-0 overflow-hidden shadow-2xl animate-slideUp">
      <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
        <div>
          <h3 class="text-lg font-bold text-slate-800 dark:text-white">${window.sanitizeInput(lesson.title)}</h3>
          ${lesson.description ? `<p class="text-xs text-slate-400 mt-1">${window.sanitizeInput(lesson.description)}</p>` : ''}
        </div>
        <button class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center shrink-0" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="p-6 max-h-[75vh] overflow-y-auto custom-scrollbar">${mediaHtml}</div>
      <div class="p-6 border-t border-slate-100 dark:border-slate-800">
        <button class="btn-primary-tw w-full h-12 text-xs uppercase font-bold" id="btn-mark-lesson-seen" onclick="window.markLessonSeen('${lesson.id}')"><i class="fas fa-circle-check"></i> Marcar como visto</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.markLessonSeen = async function markLessonSeen(lessonId) {
  const btn = document.getElementById('btn-mark-lesson-seen');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  const { error } = await window._supabase.from('lesson_completions').upsert({
    lesson_id: lessonId,
    student_id: window.currentUser.id,
  }, { onConflict: 'lesson_id,student_id' });

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-circle-check"></i> Marcar como visto'; }
    return;
  }

  window.showToast('<i class="fas fa-circle-check"></i> ¡Lección marcada como vista!', 'success');
  document.querySelector('.fixed.z-\\[200\\]')?.remove();
  window.loadLessons();
}
