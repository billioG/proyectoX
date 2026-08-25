/**
 * LESSONS - Cursos con recursos ordenados (video/PDF/imagen + SCORM/H5P con
 * nota), estilo Platzi: bloqueo secuencial y barra de progreso.
 */

const LESSON_TYPE_ICON = { video: 'fa-video', pdf: 'fa-file-pdf', image: 'fa-image', scorm: 'fa-cube', h5p: 'fa-puzzle-piece' };
const LESSON_TYPE_LABEL = { video: 'Video', pdf: 'PDF', image: 'Imagen', scorm: 'SCORM', h5p: 'H5P' };
const LESSON_TYPES_WITH_GRADE = new Set(['scorm', 'h5p']);
const LESSON_STORAGE_BUCKET = 'course-content';

// El navegador puede descargar la pestaña en segundo plano (Chrome Memory
// Saver) y al volver hace una recarga real -- no hay forma de evitarlo
// desde la app, pero sí de no perder lo ya escrito: autoguardamos estos
// formularios en sessionStorage y los restauramos si el modal se reabre.
function attachFormDraftAutosave(modalEl, storageKey, fieldIds) {
  const save = () => {
    const draft = {};
    fieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.type !== 'file') draft[id] = el.value;
    });
    sessionStorage.setItem(storageKey, JSON.stringify(draft));
  };
  modalEl.addEventListener('input', save);
  modalEl.addEventListener('change', save);

  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (saved) {
      fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.type !== 'file' && saved[id] !== undefined && !el.value) el.value = saved[id];
      });
    }
  } catch (e) { /* borrador corrupto, se ignora */ }
}

function clearFormDraft(storageKey) {
  sessionStorage.removeItem(storageKey);
}

window.loadLessons = async function loadLessons() {
  const container = document.getElementById('lessons-container');
  if (!container) return;

  if (window.userRole === 'estudiante') {
    return window.loadStudentCourses(container);
  }
  return window.loadTeacherCourses(container);
}

// ================================================
// VISTA DOCENTE / ADMIN -- lista de cursos
// ================================================
window.loadTeacherCourses = async function loadTeacherCourses(container) {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;

  container.innerHTML = `
    <div class="flex flex-col md:flex-row gap-4 mb-6 items-center">
      <p class="text-xs text-slate-400 grow">Creá cursos con lecciones en orden (video, PDF, imágenes, SCORM/H5P). Los alumnos avanzan paso a paso.</p>
      <button class="btn-secondary-tw h-11 px-6 text-xs uppercase font-bold shrink-0" onclick="window.openSharedCoursesLibrary()"><i class="fas fa-book-bookmark"></i> Biblioteca Compartida</button>
      <button class="btn-primary-tw h-11 px-6 text-xs uppercase font-bold shrink-0" onclick="window.openCreateCourseModal()"><i class="fas fa-plus"></i> Nuevo Curso</button>
    </div>
    <div id="courses-list" class="space-y-3">
      <div class="text-center text-slate-400 text-xs py-10"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>
    </div>
  `;

  let query = _supabase.from('courses').select('*, teachers(full_name), schools(name), lessons(id)').order('created_at', { ascending: false });
  if (window.userRole === 'docente') query = query.eq('created_by', currentUser.id);

  const { data: courses, error } = await query;
  const listEl = document.getElementById('courses-list');
  if (!listEl) return;

  if (error) { listEl.innerHTML = `<p class="text-rose-500 text-xs">Error: ${error.message}</p>`; return; }
  if (!courses?.length) { listEl.innerHTML = '<div class="glass-card p-10 text-center text-slate-400 text-sm">Todavía no creaste ningún curso.</div>'; return; }

  window._myCoursesCache = courses;

  listEl.innerHTML = courses.map(c => `
    <div class="glass-card p-4 flex items-center gap-4">
      <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><i class="fas fa-book-open"></i></div>
      <div class="min-w-0 flex-1 cursor-pointer" onclick="window.openCourseManager('${c.id}')">
        <h4 class="text-sm font-bold text-slate-800 dark:text-white truncate">${window.sanitizeInput(c.title)}</h4>
        <p class="text-[0.7rem] text-slate-400">${window.sanitizeInput(c.schools?.name || c.school_code)} · ${window.sanitizeInput(c.grade)} ${window.sanitizeInput(c.section)} · ${c.lessons?.length || 0} recurso(s)${window.userRole === 'admin' ? ` · ${window.sanitizeInput(c.teachers?.full_name || '')}` : ''}</p>
      </div>
      ${c.is_shared ? '<span class="text-[0.6rem] font-black uppercase px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 shrink-0"><i class="fas fa-share-nodes"></i> Compartido</span>' : ''}
      <button class="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shrink-0" title="${c.is_shared ? 'Dejar de compartir' : 'Compartir en biblioteca'}" onclick="window.toggleCourseShare('${c.id}', ${!c.is_shared})"><i class="fas fa-share-nodes text-xs"></i></button>
      <button class="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shrink-0" onclick="window.openCreateCourseModal('${c.id}')"><i class="fas fa-pen text-xs"></i></button>
      <button class="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center shrink-0" onclick="window.deleteCourse('${c.id}')"><i class="fas fa-trash-alt text-xs"></i></button>
    </div>
  `).join('');
}

window.toggleCourseShare = async function toggleCourseShare(courseId, share) {
  const { error } = await window._supabase.from('courses').update({ is_shared: share }).eq('id', courseId);
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  window.showToast(share ? '<i class="fas fa-circle-check"></i> Curso compartido en la biblioteca' : '<i class="fas fa-circle-check"></i> Curso ya no es público', 'success');
  window.loadLessons();
}

window.deleteCourse = async function deleteCourse(courseId) {
  if (!confirm('¿Eliminar este curso y todos sus recursos? Los alumnos ya no podrán verlo.')) return;

  const { data: courseLessons } = await window._supabase.from('lessons').select('id, content_path').eq('course_id', courseId);
  const { error } = await window._supabase.from('courses').delete().eq('id', courseId);
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  for (const l of (courseLessons || [])) {
    await cleanupLessonStorageIfOrphaned(l.content_path);
  }

  window.showToast('<i class="fas fa-trash-alt"></i> Curso eliminado', 'success');
  window.loadLessons();
}

async function cleanupLessonStorageIfOrphaned(contentPath) {
  if (!contentPath) return;
  // Una lección copiada desde la biblioteca comparte content_path con el
  // original -- solo borramos los archivos de Storage si ninguna otra
  // lección (copia u original) sigue apuntando a esa misma carpeta.
  const { count } = await window._supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('content_path', contentPath);
  if (!count) {
    const { data: files } = await window._supabase.storage.from(LESSON_STORAGE_BUCKET).list(contentPath, { limit: 1000 });
    if (files?.length) {
      await window._supabase.storage.from(LESSON_STORAGE_BUCKET).remove(files.map(f => `${contentPath}/${f.name}`));
    }
  }
}

// ================================================
// CREAR / EDITAR CURSO (metadata)
// ================================================
async function getClassOptionsForCurrentUser() {
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
  return classOptions;
}

window.openCreateCourseModal = async function openCreateCourseModal(editCourseId) {
  const editing = (window._myCoursesCache || []).find(c => c.id === editCourseId) || null;
  const classOptions = await getClassOptionsForCurrentUser();

  if (!classOptions.length) {
    return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés clases asignadas todavía', 'error');
  }

  const selectedIndex = editing ? classOptions.findIndex(c => c.school_code === editing.school_code && c.grade === editing.grade && c.section === editing.section) : -1;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-8 shadow-2xl animate-slideUp">
      <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter mb-6"><i class="fas fa-book-open text-primary mr-2"></i> ${editing ? 'Editar Curso' : 'Nuevo Curso'}</h2>
      <div class="space-y-4">
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Clase</label>
          <select id="course-class" class="input-field-tw h-11 text-sm">
            ${classOptions.map((c, i) => `<option value="${i}" ${i === selectedIndex ? 'selected' : ''}>${window.sanitizeInput(c.schoolName)} · ${window.sanitizeInput(c.grade)} ${window.sanitizeInput(c.section)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Título *</label>
          <input type="text" id="course-title" class="input-field-tw h-11 text-sm" value="${editing ? window.sanitizeAttr(editing.title) : ''}">
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Descripción</label>
          <textarea id="course-description" class="input-field-tw text-sm h-20 resize-none">${editing ? window.sanitizeInput(editing.description || '') : ''}</textarea>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Etiquetas</label>
          <input type="text" id="course-tags" placeholder="matemática, tercero básico, repaso..." class="input-field-tw h-11 text-sm" value="${editing ? window.sanitizeAttr((editing.tags || []).join(', ')) : ''}">
          <p class="text-[0.65rem] text-slate-400 mt-1">Separadas por coma. Sirven para filtrar en la Biblioteca Compartida.</p>
        </div>
      </div>
      <div class="flex gap-3 mt-8">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-save-course" onclick="window.saveCourse('${editing ? editing.id : ''}')">${editing ? 'Guardar Cambios' : 'Crear y Agregar Recursos'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window._courseClassOptions = classOptions;
  if (!editing) attachFormDraftAutosave(modal, 'px_draft_course', ['course-title', 'course-description', 'course-tags']);
}

window.saveCourse = async function saveCourse(editingId) {
  const classIndex = document.getElementById('course-class')?.value;
  const title = document.getElementById('course-title')?.value.trim();
  const description = document.getElementById('course-description')?.value.trim();
  const tags = (document.getElementById('course-tags')?.value || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const classOption = window._courseClassOptions?.[classIndex];
  const btn = document.getElementById('btn-save-course');

  if (!title) return window.showToast('<i class="fas fa-circle-xmark"></i> Ponele un título', 'error');
  if (!classOption) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí una clase', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  if (editingId) {
    const { error } = await window._supabase.from('courses').update({
      title, description: description || null, tags,
      school_code: classOption.school_code, grade: classOption.grade, section: classOption.section,
    }).eq('id', editingId);
    if (error) {
      window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Guardar Cambios';
      return;
    }
    window.showToast('<i class="fas fa-circle-check"></i> Curso actualizado', 'success');
    document.querySelector('.fixed.z-\\[200\\]')?.remove();
    window.loadLessons();
    return;
  }

  const { data, error } = await window._supabase.from('courses').insert({
    title, description: description || null, tags,
    school_code: classOption.school_code, grade: classOption.grade, section: classOption.section,
    created_by: window.currentUser.id,
  }).select().single();

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Crear y Agregar Recursos';
    return;
  }

  clearFormDraft('px_draft_course');
  window.showToast('<i class="fas fa-circle-check"></i> Curso creado -- agregale recursos', 'success');
  document.querySelector('.fixed.z-\\[200\\]')?.remove();
  window._myCoursesCache = [...(window._myCoursesCache || []), data];
  window.openCourseManager(data.id);
}

// ================================================
// GESTIONAR RECURSOS DE UN CURSO (docente)
// ================================================
window.openCourseManager = async function openCourseManager(courseId) {
  const { data: course, error: courseErr } = await window._supabase.from('courses').select('*, schools(name)').eq('id', courseId).single();
  if (courseErr || !course) return window.showToast('<i class="fas fa-circle-xmark"></i> No se pudo cargar el curso', 'error');

  const { data: lessons } = await window._supabase.from('lessons').select('*').eq('course_id', courseId).order('order_index', { ascending: true });

  window._managingCourse = course;
  window._managingCourseLessons = lessons || [];

  const modal = document.createElement('div');
  modal.id = 'course-manager-modal';
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col p-8 shadow-2xl animate-slideUp">
      <div class="flex justify-between items-start mb-6">
        <div>
          <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter">${window.sanitizeInput(course.title)}</h2>
          <p class="text-xs text-slate-400 mt-1">${window.sanitizeInput(course.schools?.name || course.school_code)} · ${window.sanitizeInput(course.grade)} ${window.sanitizeInput(course.section)}</p>
        </div>
        <button class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center shrink-0" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div id="course-resources-list" class="space-y-3 overflow-y-auto custom-scrollbar mb-6"></div>
      <button class="btn-primary-tw h-11 text-xs uppercase font-bold shrink-0" onclick="window.openAddResourceModal('${courseId}')"><i class="fas fa-plus"></i> Agregar Recurso</button>
    </div>
  `;
  document.body.appendChild(modal);
  window.renderCourseResourcesList();
}

window.renderCourseResourcesList = function renderCourseResourcesList() {
  const listEl = document.getElementById('course-resources-list');
  if (!listEl) return;
  const lessons = window._managingCourseLessons || [];

  if (!lessons.length) {
    listEl.innerHTML = '<div class="glass-card p-8 text-center text-slate-400 text-sm">Todavía no agregaste recursos. Los alumnos verán este curso vacío.</div>';
    return;
  }

  listEl.innerHTML = lessons.map((l, i) => `
    <div class="glass-card p-3 flex items-center gap-3">
      <span class="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-xs font-black shrink-0">${i + 1}</span>
      <div class="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><i class="fas ${LESSON_TYPE_ICON[l.content_type]}"></i></div>
      <div class="min-w-0 flex-1">
        <h4 class="text-sm font-bold text-slate-800 dark:text-white truncate">${window.sanitizeInput(l.title)}</h4>
        <p class="text-[0.65rem] text-slate-400">${LESSON_TYPE_LABEL[l.content_type]}</p>
      </div>
      <button class="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shrink-0 ${i === 0 ? 'opacity-30 pointer-events-none' : ''}" onclick="window.moveCourseResource('${l.id}', -1)"><i class="fas fa-arrow-up text-[0.65rem]"></i></button>
      <button class="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shrink-0 ${i === lessons.length - 1 ? 'opacity-30 pointer-events-none' : ''}" onclick="window.moveCourseResource('${l.id}', 1)"><i class="fas fa-arrow-down text-[0.65rem]"></i></button>
      <button class="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shrink-0" onclick="window.openAddResourceModal('${window._managingCourse.id}', '${l.id}')"><i class="fas fa-pen text-[0.6rem]"></i></button>
      <button class="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center shrink-0" onclick="window.deleteCourseResource('${l.id}')"><i class="fas fa-trash-alt text-[0.6rem]"></i></button>
    </div>
  `).join('');
}

window.moveCourseResource = async function moveCourseResource(lessonId, direction) {
  const lessons = window._managingCourseLessons || [];
  const idx = lessons.findIndex(l => l.id === lessonId);
  const swapIdx = idx + direction;
  if (idx < 0 || swapIdx < 0 || swapIdx >= lessons.length) return;

  const a = lessons[idx], b = lessons[swapIdx];
  const aOrder = a.order_index, bOrder = b.order_index;
  await Promise.all([
    window._supabase.from('lessons').update({ order_index: bOrder }).eq('id', a.id),
    window._supabase.from('lessons').update({ order_index: aOrder }).eq('id', b.id),
  ]);
  [lessons[idx], lessons[swapIdx]] = [lessons[swapIdx], lessons[idx]];
  window.renderCourseResourcesList();
}

window.deleteCourseResource = async function deleteCourseResource(lessonId) {
  if (!confirm('¿Eliminar este recurso del curso?')) return;
  const { data: lesson } = await window._supabase.from('lessons').select('content_path').eq('id', lessonId).maybeSingle();
  const { error } = await window._supabase.from('lessons').delete().eq('id', lessonId);
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  await cleanupLessonStorageIfOrphaned(lesson?.content_path);
  window._managingCourseLessons = (window._managingCourseLessons || []).filter(l => l.id !== lessonId);
  window.renderCourseResourcesList();
  window.showToast('<i class="fas fa-trash-alt"></i> Recurso eliminado', 'success');
}

// ================================================
// AGREGAR / EDITAR RECURSO (lección individual dentro de un curso)
// ================================================
const SINGLEFILE_ACCEPT_BY_TYPE = { video: 'video/*', pdf: 'application/pdf', image: 'image/*' };

window.openAddResourceModal = function openAddResourceModal(courseId, editLessonId) {
  const editing = editLessonId ? (window._managingCourseLessons || []).find(l => l.id === editLessonId) : null;
  const isFileType = editing ? LESSON_TYPES_WITH_GRADE.has(editing.content_type) : false;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-8 shadow-2xl animate-slideUp">
      <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter mb-6"><i class="fas fa-file-circle-plus text-primary mr-2"></i> ${editing ? 'Editar Recurso' : 'Nuevo Recurso'}</h2>
      <div class="space-y-4">
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Título *</label>
          <input type="text" id="resource-title" class="input-field-tw h-11 text-sm" value="${editing ? window.sanitizeAttr(editing.title) : ''}">
        </div>
        ${editing ? `<input type="hidden" id="resource-type" value="${editing.content_type}">` : `
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Tipo</label>
          <select id="resource-type" class="input-field-tw h-11 text-sm" onchange="window.toggleResourceSourceField()">
            <option value="video">Video</option>
            <option value="pdf">PDF</option>
            <option value="image">Imagen</option>
            <option value="scorm">SCORM (.zip -- con nota automática)</option>
            <option value="h5p">H5P (.zip -- con nota automática)</option>
          </select>
        </div>
        <div id="resource-source-mode-wrap">
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Origen</label>
          <select id="resource-source-mode" class="input-field-tw h-11 text-sm" onchange="window.toggleResourceSourceField()">
            <option value="url">Link (YouTube, Drive con acceso público, etc.)</option>
            <option value="file">Subir archivo (funciona offline, no depende de un link externo)</option>
          </select>
        </div>`}
        <div id="resource-source-url-wrap" class="${isFileType ? 'hidden' : ''}">
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">URL *</label>
          <input type="text" id="resource-url" placeholder="https://..." class="input-field-tw h-11 text-sm" value="${editing && !isFileType ? window.sanitizeAttr(editing.content_url) : ''}">
        </div>
        ${editing && isFileType ? '<p class="text-[0.65rem] text-slate-400"><i class="fas fa-circle-info"></i> El archivo del paquete no se puede reemplazar acá -- borrá el recurso y creá uno nuevo si necesitás subir otro paquete.</p>' : `
        <div id="resource-source-singlefile-wrap" class="hidden">
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Archivo *</label>
          <input type="file" id="resource-single-file" class="input-field-tw text-sm py-2.5">
          <p id="resource-single-upload-progress" class="text-[0.65rem] text-slate-400 mt-2 hidden"></p>
        </div>
        <div id="resource-source-file-wrap" class="hidden">
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Archivo .zip *</label>
          <input type="file" id="resource-file" class="input-field-tw text-sm py-2.5">
          <p class="text-[0.65rem] text-slate-400 mt-1">Aceptamos .zip y .h5p (es el mismo formato).</p>
          <p id="resource-upload-progress" class="text-[0.65rem] text-slate-400 mt-2 hidden"></p>
        </div>`}
      </div>
      <div class="flex gap-3 mt-8">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-save-resource" onclick="window.saveResource('${courseId}', '${editing ? editing.id : ''}')">${editing ? 'Guardar Cambios' : 'Agregar'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  if (!editing) {
    attachFormDraftAutosave(modal, `px_draft_resource_${courseId}`, ['resource-title', 'resource-url', 'resource-type', 'resource-source-mode']);
    window.toggleResourceSourceField();
  }
}

window.toggleResourceSourceField = function toggleResourceSourceField() {
  const type = document.getElementById('resource-type')?.value;
  const isZipType = LESSON_TYPES_WITH_GRADE.has(type);
  const sourceMode = document.getElementById('resource-source-mode')?.value || 'url';

  document.getElementById('resource-source-mode-wrap')?.classList.toggle('hidden', isZipType);
  document.getElementById('resource-source-file-wrap')?.classList.toggle('hidden', !isZipType);

  const showUrl = !isZipType && sourceMode === 'url';
  const showSingleFile = !isZipType && sourceMode === 'file';
  document.getElementById('resource-source-url-wrap')?.classList.toggle('hidden', !showUrl);
  document.getElementById('resource-source-singlefile-wrap')?.classList.toggle('hidden', !showSingleFile);

  const singleFileInput = document.getElementById('resource-single-file');
  if (singleFileInput) singleFileInput.accept = SINGLEFILE_ACCEPT_BY_TYPE[type] || '';
}

// Supabase Storage rechaza ciertos caracteres en la key (dos puntos,
// espacios raros, etc.) -- nombres de archivo generados por el sistema
// (ej. "Escaneado el 27-07-2026, 6:12:19 p. m..pdf") los tienen.
function sanitizeStorageFilename(filename) {
  const lastDot = filename.lastIndexOf('.');
  const name = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  const ext = lastDot > 0 ? filename.slice(lastDot) : '';
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + ext;
}

async function uploadSingleLessonFile(file, lessonId) {
  const contentType = window.getFileMimeType(file.name);
  const blob = new Blob([file], { type: contentType });
  const path = `lessons/${lessonId}/${sanitizeStorageFilename(file.name)}`;
  const { error } = await window._supabase.storage.from(LESSON_STORAGE_BUCKET).upload(path, blob, { upsert: true, contentType });
  if (error) throw new Error(`Error subiendo ${file.name}: ${error.message}`);
  const { data: { publicUrl } } = window._supabase.storage.from(LESSON_STORAGE_BUCKET).getPublicUrl(path);
  return { publicUrl, contentPath: `lessons/${lessonId}` };
}

window.saveResource = async function saveResource(courseId, editingId) {
  const title = document.getElementById('resource-title')?.value.trim();
  let content_type = document.getElementById('resource-type')?.value;
  const isFileType = LESSON_TYPES_WITH_GRADE.has(content_type);
  const sourceMode = document.getElementById('resource-source-mode')?.value || 'url';
  const isSingleFileUpload = !isFileType && sourceMode === 'file';
  const content_url = document.getElementById('resource-url')?.value.trim();
  const file = document.getElementById('resource-file')?.files?.[0];
  const singleFile = document.getElementById('resource-single-file')?.files?.[0];
  const btn = document.getElementById('btn-save-resource');
  const progressEl = document.getElementById('resource-upload-progress');

  if (!title) return window.showToast('<i class="fas fa-circle-xmark"></i> Ponele un título', 'error');
  if (!isFileType && !isSingleFileUpload && !content_url) return window.showToast('<i class="fas fa-circle-xmark"></i> Completa la URL', 'error');
  if (isSingleFileUpload && !singleFile) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí un archivo', 'error');

  btn.disabled = true;

  const course = window._managingCourse;

  if (editingId) {
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    const update = { title };
    if (!isFileType) update.content_url = content_url;
    const { error } = await window._supabase.from('lessons').update(update).eq('id', editingId);
    if (error) {
      window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Guardar Cambios';
      return;
    }
    const idx = window._managingCourseLessons.findIndex(l => l.id === editingId);
    if (idx >= 0) Object.assign(window._managingCourseLessons[idx], update);
    window.showToast('<i class="fas fa-circle-check"></i> Recurso actualizado', 'success');
    document.querySelector('.fixed.z-\\[210\\]')?.remove();
    window.renderCourseResourcesList();
    return;
  }

  if (isFileType && !file) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí un archivo .zip', 'error');

  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...';

  try {
    const lessonId = crypto.randomUUID();
    let finalUrl = content_url;
    let contentPath = null;

    if (isSingleFileUpload) {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo archivo...';
      const uploaded = await uploadSingleLessonFile(singleFile, lessonId);
      finalUrl = uploaded.publicUrl;
      contentPath = uploaded.contentPath;
    } else if (isFileType) {
      if (progressEl) progressEl.classList.remove('hidden');
      contentPath = `lessons/${lessonId}`;
      const uploaded = await window.extractAndUploadPackage(file, contentPath, (msg) => {
        if (progressEl) progressEl.textContent = msg;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${msg}`;
      });

      // Muchos exportadores (Genially, Lumi, etc.) empaquetan H5P DENTRO
      // de un SCORM real (traen imsmanifest.xml + SCORM_API_wrapper.js).
      // Si el .zip trae manifiesto, es SCORM sin importar qué eligió el
      // docente en el dropdown -- evita que quede mal etiquetado y sin
      // reproducirse.
      if (uploaded.entryUrl) {
        content_type = 'scorm';
        finalUrl = uploaded.entryUrl;
      } else if (content_type === 'scorm') {
        throw new Error('No se encontró el archivo de entrada del paquete SCORM (imsmanifest.xml)');
      } else {
        finalUrl = uploaded.baseUrl; // H5P nativo necesita la carpeta base, no un archivo puntual
      }
    }

    const nextOrder = (window._managingCourseLessons || []).reduce((max, l) => Math.max(max, l.order_index), -1) + 1;

    const { data: newLesson, error } = await window._supabase.from('lessons').insert({
      id: lessonId,
      title,
      content_type,
      content_url: finalUrl,
      content_path: contentPath,
      course_id: courseId,
      order_index: nextOrder,
      school_code: course.school_code,
      grade: course.grade,
      section: course.section,
      created_by: window.currentUser.id,
    }).select().single();
    if (error) throw error;

    clearFormDraft(`px_draft_resource_${courseId}`);
    window.showToast('<i class="fas fa-circle-check"></i> Recurso agregado', 'success');
    document.querySelector('.fixed.z-\\[210\\]')?.remove();
    window._managingCourseLessons = [...(window._managingCourseLessons || []), newLesson];
    window.renderCourseResourcesList();
  } catch (err) {
    console.error('Error publicando recurso:', err);
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Agregar';
  }
}

const MIME_BY_EXT = {
  html: 'text/html', htm: 'text/html', js: 'application/javascript', mjs: 'application/javascript',
  css: 'text/css', json: 'application/json', xml: 'application/xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
  mp4: 'video/mp4', webm: 'video/webm',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  pdf: 'application/pdf', txt: 'text/plain',
};

window.getFileMimeType = function getFileMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

// Descomprime un .zip en el navegador (JSZip) y sube cada archivo al
// bucket de Storage bajo basePath. Devuelve la URL pública de la carpeta
// base y, si existe un imsmanifest.xml (SCORM), la URL del archivo de
// entrada que ese manifiesto declara.
window.extractAndUploadPackage = async function extractAndUploadPackage(file, basePath, onProgress) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter(f => !f.dir);
  const _supabase = window._supabase;

  let manifestXml = null;
  let uploaded = 0;

  for (const entry of entries) {
    const rawBlob = await entry.async('blob');
    const path = `${basePath}/${entry.name}`;
    // JSZip entrega el blob con type "application/octet-stream" fijo, y el
    // SDK de Supabase Storage usa blob.type para el header Content-Type
    // ignorando la opción `contentType` -- por eso hay que reconstruir el
    // Blob con el tipo correcto antes de subirlo (si no, el navegador nunca
    // aplica el CSS/ejecuta el JS, solo lo muestra/ignora como texto crudo).
    const contentType = window.getFileMimeType(entry.name);
    const blob = new Blob([rawBlob], { type: contentType });
    const { error } = await _supabase.storage.from(LESSON_STORAGE_BUCKET).upload(path, blob, { upsert: true, contentType });
    if (error) throw new Error(`Error subiendo ${entry.name}: ${error.message}`);
    uploaded++;
    if (onProgress) onProgress(`Subiendo archivos... (${uploaded}/${entries.length})`);

    if (/(^|\/)imsmanifest\.xml$/i.test(entry.name)) {
      manifestXml = await entry.async('text');
    }
  }

  const { data: { publicUrl: baseUrl } } = _supabase.storage.from(LESSON_STORAGE_BUCKET).getPublicUrl(basePath);

  let entryUrl = null;
  if (manifestXml) {
    try {
      const doc = new DOMParser().parseFromString(manifestXml, 'text/xml');
      const resource = doc.querySelector('resources > resource[href]') || doc.querySelector('resource[href]');
      const href = resource?.getAttribute('href');
      if (href) {
        const { data: { publicUrl } } = _supabase.storage.from(LESSON_STORAGE_BUCKET).getPublicUrl(`${basePath}/${href}`);
        entryUrl = publicUrl;
      }
    } catch (e) {
      console.warn('No se pudo leer imsmanifest.xml:', e);
    }
  }

  return { baseUrl: baseUrl.endsWith('/') ? baseUrl : baseUrl + '/', entryUrl };
}

// ================================================
// BIBLIOTECA COMPARTIDA -- cursos de otros docentes, copiables
// ================================================
window.openSharedCoursesLibrary = async function openSharedCoursesLibrary() {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-2xl p-8 shadow-2xl animate-slideUp max-h-[85vh] flex flex-col">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter"><i class="fas fa-book-bookmark text-primary mr-2"></i> Biblioteca Compartida</h2>
        <button class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center shrink-0" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div id="shared-library-tags" class="flex flex-wrap gap-2 mb-4"></div>
      <div id="shared-library-list" class="space-y-3 overflow-y-auto custom-scrollbar">
        <div class="text-center text-slate-400 text-xs py-10"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const { data: courses, error } = await _supabase.from('courses')
    .select('*, teachers(full_name), schools(name), lessons(id)')
    .eq('is_shared', true)
    .neq('created_by', currentUser.id)
    .order('created_at', { ascending: false });

  const listEl = document.getElementById('shared-library-list');
  if (!listEl) return;

  if (error) { listEl.innerHTML = `<p class="text-rose-500 text-xs">Error: ${error.message}</p>`; return; }
  if (!courses?.length) { listEl.innerHTML = '<div class="glass-card p-10 text-center text-slate-400 text-sm">Todavía no hay cursos compartidos por otros docentes.</div>'; return; }

  window._sharedLibraryCache = courses;
  window._sharedLibraryTagFilter = null;

  const allTags = [...new Set(courses.flatMap(c => c.tags || []))].sort();
  const tagsEl = document.getElementById('shared-library-tags');
  if (tagsEl && allTags.length) {
    tagsEl.innerHTML = [`<button class="shared-tag-chip px-3 py-1.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider bg-primary text-white" data-tag="" onclick="window.filterSharedLibraryByTag(null)">Todas</button>`]
      .concat(allTags.map(t => `<button class="shared-tag-chip px-3 py-1.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500" data-tag="${window.sanitizeAttr(t)}" onclick="window.filterSharedLibraryByTag('${window.sanitizeAttr(t)}')">${window.sanitizeInput(t)}</button>`))
      .join('');
  }

  window.renderSharedLibraryList();
}

function renderSharedLibraryCourseCard(c) {
  return `
    <div class="glass-card p-4 flex items-center gap-4">
      <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><i class="fas fa-book-open"></i></div>
      <div class="min-w-0 flex-1">
        <h4 class="text-sm font-bold text-slate-800 dark:text-white truncate">${window.sanitizeInput(c.title)}</h4>
        <p class="text-[0.7rem] text-slate-400">${c.lessons?.length || 0} recurso(s) · por ${window.sanitizeInput(c.teachers?.full_name || 'Docente')} · ${window.sanitizeInput(c.schools?.name || c.school_code)}</p>
        ${c.tags?.length ? `<div class="flex flex-wrap gap-1 mt-1.5">${c.tags.map(t => `<span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[0.55rem] font-bold text-slate-500 uppercase">${window.sanitizeInput(t)}</span>`).join('')}</div>` : ''}
      </div>
      <button class="btn-primary-tw h-9 px-4 text-[0.65rem] uppercase font-bold shrink-0" onclick="window.openCopyCourseModal('${c.id}')"><i class="fas fa-copy"></i> Copiar a mi clase</button>
    </div>
  `;
}

window.filterSharedLibraryByTag = function filterSharedLibraryByTag(tag) {
  window._sharedLibraryTagFilter = tag;
  document.querySelectorAll('.shared-tag-chip').forEach(chip => {
    const active = chip.dataset.tag === (tag || '');
    chip.classList.toggle('bg-primary', active);
    chip.classList.toggle('text-white', active);
    chip.classList.toggle('bg-slate-100', !active);
    chip.classList.toggle('dark:bg-slate-800', !active);
    chip.classList.toggle('text-slate-500', !active);
  });
  window.renderSharedLibraryList();
}

window.renderSharedLibraryList = function renderSharedLibraryList() {
  const listEl = document.getElementById('shared-library-list');
  if (!listEl) return;
  const courses = window._sharedLibraryCache || [];
  const tagFilter = window._sharedLibraryTagFilter;

  if (tagFilter) {
    const filtered = courses.filter(c => (c.tags || []).includes(tagFilter));
    listEl.innerHTML = filtered.length ? filtered.map(renderSharedLibraryCourseCard).join('') : '<div class="glass-card p-10 text-center text-slate-400 text-sm">Nada con esa etiqueta.</div>';
    return;
  }

  const byTag = new Map();
  const untagged = [];
  courses.forEach(c => {
    if (!c.tags?.length) { untagged.push(c); return; }
    c.tags.forEach(t => {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t).push(c);
    });
  });

  let html = '';
  for (const [tag, group] of [...byTag.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    html += `<details open><summary class="list-none cursor-pointer text-[0.65rem] font-black uppercase tracking-widest text-slate-400 mb-2">${window.sanitizeInput(tag)} (${group.length})</summary><div class="space-y-3 mb-4">${group.map(renderSharedLibraryCourseCard).join('')}</div></details>`;
  }
  if (untagged.length) {
    html += `<details open><summary class="list-none cursor-pointer text-[0.65rem] font-black uppercase tracking-widest text-slate-400 mb-2">Sin etiqueta (${untagged.length})</summary><div class="space-y-3 mb-4">${untagged.map(renderSharedLibraryCourseCard).join('')}</div></details>`;
  }
  listEl.innerHTML = html;
}

window.openCopyCourseModal = async function openCopyCourseModal(courseId) {
  const source = (window._sharedLibraryCache || []).find(c => c.id === courseId);
  if (!source) return;

  const classOptions = await getClassOptionsForCurrentUser();
  if (!classOptions.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés clases asignadas todavía', 'error');

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-8 shadow-2xl animate-slideUp">
      <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter mb-2"><i class="fas fa-copy text-primary mr-2"></i> Copiar Curso</h2>
      <p class="text-xs text-slate-400 mb-6">"${window.sanitizeInput(source.title)}" (${source.lessons?.length || 0} recursos) se copiará a la clase que elijas. Podés editarlo después sin afectar el original.</p>
      <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Clase destino</label>
      <select id="copy-course-class" class="input-field-tw h-11 text-sm mb-6">
        ${classOptions.map((c, i) => `<option value="${i}">${window.sanitizeInput(c.schoolName)} · ${window.sanitizeInput(c.grade)} ${window.sanitizeInput(c.section)}</option>`).join('')}
      </select>
      <div class="flex gap-3">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-confirm-copy-course" onclick="window.confirmCopyCourse('${courseId}')">Copiar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window._copyCourseClassOptions = classOptions;
}

window.confirmCopyCourse = async function confirmCopyCourse(courseId) {
  const source = (window._sharedLibraryCache || []).find(c => c.id === courseId);
  const classIndex = document.getElementById('copy-course-class')?.value;
  const classOption = window._copyCourseClassOptions?.[classIndex];
  if (!source || !classOption) return;

  const btn = document.getElementById('btn-confirm-copy-course');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const { data: newCourse, error } = await window._supabase.from('courses').insert({
    title: source.title,
    description: source.description,
    tags: source.tags || [],
    school_code: classOption.school_code,
    grade: classOption.grade,
    section: classOption.section,
    created_by: window.currentUser.id,
    is_shared: false,
  }).select().single();

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Copiar';
    return;
  }

  const { data: sourceLessons } = await window._supabase.from('lessons').select('*').eq('course_id', courseId).order('order_index', { ascending: true });
  for (const l of (sourceLessons || [])) {
    await window._supabase.from('lessons').insert({
      title: l.title,
      content_type: l.content_type,
      content_url: l.content_url,
      content_path: l.content_path,
      course_id: newCourse.id,
      order_index: l.order_index,
      school_code: classOption.school_code,
      grade: classOption.grade,
      section: classOption.section,
      created_by: window.currentUser.id,
    });
  }

  window.showToast('<i class="fas fa-circle-check"></i> Curso copiado a tu clase', 'success');
  // Solo cerramos los modales de esta pantalla (copiar + biblioteca), NUNCA
  // un ".fixed" genérico -- el sidebar también usa esa clase y un borrado
  // amplio lo elimina del DOM entero, no solo lo oculta.
  document.querySelector('.fixed.z-\\[210\\]')?.remove();
  document.querySelector('.fixed.z-\\[200\\]')?.remove();
  window.loadLessons();
}

// ================================================
// VISTA ALUMNO -- lista de cursos + reproductor secuencial
// ================================================
window.loadStudentCourses = async function loadStudentCourses(container) {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const userData = window.userData;

  container.innerHTML = `<div class="text-center text-slate-400 text-xs py-10"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>`;

  if (!userData?.school_code || !userData?.grade || !userData?.section) {
    container.innerHTML = '<div class="glass-card p-10 text-center text-slate-400 text-sm">Todavía no estás asignado a una clase.</div>';
    return;
  }

  const [{ data: courses, error }, { data: completions }] = await Promise.all([
    _supabase.from('courses').select('*, lessons(*)')
      .eq('school_code', userData.school_code).eq('grade', userData.grade).eq('section', userData.section)
      .order('created_at', { ascending: false }),
    _supabase.from('lesson_completions').select('lesson_id, score, status').eq('student_id', currentUser.id),
  ]);

  if (error) { container.innerHTML = `<p class="text-rose-500 text-xs">Error: ${error.message}</p>`; return; }
  if (!courses?.length) { container.innerHTML = '<div class="glass-card p-10 text-center text-slate-400 text-sm">Tu docente todavía no publicó cursos.</div>'; return; }

  const completionsByLesson = new Map((completions || []).map(c => [c.lesson_id, c]));
  window._coursesCache = courses;
  window._completionsCache = completionsByLesson;

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      ${courses.map(c => {
        const items = (c.lessons || []).slice().sort((a, b) => a.order_index - b.order_index);
        const doneCount = items.filter(l => completionsByLesson.has(l.id)).length;
        const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
        return `
        <div class="glass-card p-5 flex flex-col gap-3 cursor-pointer hover:border-primary/30 transition-all" onclick="window.openCoursePlayer('${c.id}')">
          <div class="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-lg"><i class="fas fa-book-open"></i></div>
          <div>
            <h4 class="text-sm font-bold text-slate-800 dark:text-white">${window.sanitizeInput(c.title)}</h4>
            ${c.description ? `<p class="text-xs text-slate-400 mt-1 line-clamp-2">${window.sanitizeInput(c.description)}</p>` : ''}
          </div>
          <div>
            <div class="flex justify-between items-center mb-1">
              <span class="text-[0.6rem] font-black uppercase text-slate-400">${items.length} recurso(s)</span>
              <span class="text-[0.6rem] font-black text-primary">${pct}%</span>
            </div>
            <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div class="h-full bg-primary transition-all" style="width: ${pct}%"></div>
            </div>
          </div>
        </div>
      `;
      }).join('')}
    </div>
  `;
}

window.openCoursePlayer = function openCoursePlayer(courseId) {
  const course = (window._coursesCache || []).find(c => c.id === courseId);
  if (!course) return;

  const items = (course.lessons || []).slice().sort((a, b) => a.order_index - b.order_index);
  if (!items.length) return window.showToast('<i class="fas fa-circle-info"></i> Este curso todavía no tiene recursos', 'info');

  window._activeCourse = { course, items };

  const modal = document.createElement('div');
  modal.id = 'course-player-modal';
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-2 md:p-6 bg-slate-950/90 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-6xl h-full md:h-[88vh] overflow-hidden shadow-2xl animate-slideUp flex flex-col md:flex-row">
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div class="p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
          <div class="min-w-0">
            <h3 class="text-base md:text-lg font-bold text-slate-800 dark:text-white truncate">${window.sanitizeInput(course.title)}</h3>
            <p id="course-player-resource-title" class="text-xs text-slate-400 mt-0.5 truncate"></p>
          </div>
          <button class="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center shrink-0 ml-3" onclick="window.closeCoursePlayer()"><i class="fas fa-times"></i></button>
        </div>
        <div id="course-player-viewer" class="flex-1 p-4 md:p-6 overflow-y-auto custom-scrollbar"></div>
        <div id="course-player-footer" class="p-4 md:p-6 border-t border-slate-100 dark:border-slate-800 shrink-0"></div>
      </div>
      <div class="w-full md:w-80 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden max-h-[35vh] md:max-h-none">
        <div class="p-4 shrink-0">
          <div class="flex justify-between items-center mb-1.5">
            <span class="text-[0.6rem] font-black uppercase text-slate-400">Progreso del curso</span>
            <span id="course-player-progress-pct" class="text-[0.6rem] font-black text-primary"></span>
          </div>
          <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div id="course-player-progress-bar" class="h-full bg-primary transition-all"></div>
          </div>
        </div>
        <div id="course-player-sidebar" class="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3 space-y-2"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const firstUnlockedIndex = items.findIndex(l => !window._completionsCache.has(l.id));
  window.selectCourseResource(firstUnlockedIndex === -1 ? items.length - 1 : firstUnlockedIndex);
}

window.closeCoursePlayer = function closeCoursePlayer() {
  window.teardownScormSession?.();
  document.getElementById('course-player-modal')?.remove();
  window._activeCourse = null;
  window.loadLessons();
}

function isCourseResourceUnlocked(items, index) {
  if (index === 0) return true;
  const prev = items[index - 1];
  return window._completionsCache?.has(prev.id);
}

window.renderCourseSidebar = function renderCourseSidebar() {
  const { items } = window._activeCourse || {};
  if (!items) return;
  const completions = window._completionsCache;
  const doneCount = items.filter(l => completions.has(l.id)).length;
  const pct = Math.round((doneCount / items.length) * 100);

  const pctEl = document.getElementById('course-player-progress-pct');
  const barEl = document.getElementById('course-player-progress-bar');
  if (pctEl) pctEl.textContent = `${pct}% completado`;
  if (barEl) barEl.style.width = `${pct}%`;

  const sidebarEl = document.getElementById('course-player-sidebar');
  if (!sidebarEl) return;
  sidebarEl.innerHTML = items.map((l, i) => {
    const done = completions.has(l.id);
    const unlocked = isCourseResourceUnlocked(items, i);
    const isActive = i === window._activeCourseIndex;
    const completion = completions.get(l.id);
    const hasGrade = LESSON_TYPES_WITH_GRADE.has(l.content_type) && completion?.score != null;
    return `
      <div class="p-3 rounded-xl flex items-center gap-3 transition-all ${unlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'} ${isActive ? 'bg-primary/10 border border-primary/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}"
           onclick="${unlocked ? `window.selectCourseResource(${i})` : `window.showToast('<i class=\\'fas fa-lock\\'></i> Completá el recurso anterior primero', 'info')`}">
        <div class="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${done ? 'bg-emerald-500 text-white' : unlocked ? 'bg-primary/10 text-primary' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}">
          ${done ? '<i class="fas fa-check"></i>' : unlocked ? (i + 1) : '<i class="fas fa-lock text-[0.65rem]"></i>'}
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">${window.sanitizeInput(l.title)}</div>
          <div class="text-[0.6rem] text-slate-400">${LESSON_TYPE_LABEL[l.content_type]}${hasGrade ? ` · ${Math.round(completion.score)}%` : ''}</div>
        </div>
      </div>
    `;
  }).join('');
}

window.selectCourseResource = function selectCourseResource(index) {
  const { items } = window._activeCourse || {};
  if (!items || !items[index]) return;
  if (!isCourseResourceUnlocked(items, index)) {
    return window.showToast('<i class="fas fa-lock"></i> Completá el recurso anterior primero', 'info');
  }

  window.teardownScormSession?.();
  window._activeCourseIndex = index;
  const lesson = items[index];

  const titleEl = document.getElementById('course-player-resource-title');
  if (titleEl) titleEl.textContent = lesson.title;

  const hasAutoGrade = LESSON_TYPES_WITH_GRADE.has(lesson.content_type);
  let mediaHtml = '';
  if (lesson.content_type === 'video') {
    const ytMatch = lesson.content_url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{6,})/);
    mediaHtml = ytMatch
      ? `<iframe class="w-full aspect-video rounded-xl" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen></iframe>`
      : `<video class="w-full rounded-xl" src="${lesson.content_url}" controls></video>`;
  } else if (lesson.content_type === 'pdf') {
    mediaHtml = `<iframe class="w-full h-[60vh] rounded-xl border border-slate-200 dark:border-slate-700" src="${lesson.content_url}"></iframe>`;
  } else if (lesson.content_type === 'image') {
    mediaHtml = `<img src="${lesson.content_url}" class="w-full rounded-xl">`;
  } else if (lesson.content_type === 'scorm') {
    mediaHtml = `<iframe id="scorm-frame" class="w-full h-[60vh] rounded-xl border border-slate-200 dark:border-slate-700" src="${lesson.content_url}"></iframe>`;
  } else if (lesson.content_type === 'h5p') {
    mediaHtml = `<div id="h5p-container" class="w-full min-h-[50vh]"></div>`;
  }

  const viewerEl = document.getElementById('course-player-viewer');
  if (viewerEl) viewerEl.innerHTML = mediaHtml;

  const footerEl = document.getElementById('course-player-footer');
  if (footerEl) {
    footerEl.innerHTML = hasAutoGrade
      ? `<p id="lesson-live-score" class="text-center text-sm font-bold text-slate-500">La nota se guarda automáticamente mientras completás la actividad.</p>`
      : window._completionsCache.has(lesson.id)
        ? `<div class="text-center text-sm font-bold text-emerald-500"><i class="fas fa-circle-check"></i> Ya completaste este recurso</div>`
        : `<button class="btn-primary-tw w-full h-12 text-xs uppercase font-bold" id="btn-mark-lesson-seen" onclick="window.markLessonSeen('${lesson.id}')"><i class="fas fa-circle-check"></i> Marcar como visto</button>`;
  }

  if (lesson.content_type === 'scorm') {
    window.initScormSession(lesson.id);
  } else if (lesson.content_type === 'h5p') {
    window.initH5PSession(lesson);
  }

  window.renderCourseSidebar();
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

  window._completionsCache.set(lessonId, {});
  window.showToast('<i class="fas fa-circle-check"></i> ¡Recurso marcado como visto!', 'success');

  const { items } = window._activeCourse || {};
  if (items) {
    // Auto-avanzar al siguiente recurso recién desbloqueado, si existe.
    const nextIndex = window._activeCourseIndex + 1;
    if (nextIndex < items.length) {
      window.selectCourseResource(nextIndex);
    } else {
      window.renderCourseSidebar();
      const footerEl = document.getElementById('course-player-footer');
      if (footerEl) footerEl.innerHTML = `<div class="text-center text-sm font-bold text-emerald-500"><i class="fas fa-circle-check"></i> ¡Completaste todo el curso!</div>`;
    }
  }
}

// ================================================
// RUNTIME SCORM (API 1.2 + 2004) -- captura nota real
// ================================================
// El contenido SCORM, corriendo dentro del iframe, busca la API subiendo
// por la cadena de window.parent hasta encontrar un objeto `API`
// (SCORM 1.2) o `API_1484_11` (SCORM 2004). Como el iframe es hijo
// directo de esta página, alcanza con exponerlos acá.
async function persistLessonScore(lessonId, score, status, rawData) {
  await window._supabase.from('lesson_completions').upsert({
    lesson_id: lessonId,
    student_id: window.currentUser.id,
    score: score === null || isNaN(score) ? null : score,
    status: status || null,
    raw_data: rawData,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'lesson_id,student_id' });

  if (window._completionsCache) {
    window._completionsCache.set(lessonId, { score, status });
    window.renderCourseSidebar?.();
  }
}

function updateLiveScoreLabel(score, status) {
  const el = document.getElementById('lesson-live-score');
  if (!el) return;
  const pct = score !== null && !isNaN(score) ? `${Math.round(score)}%` : '--';
  el.innerHTML = `<i class="fas fa-circle-check text-emerald-500 mr-1"></i> Nota actual: <strong>${pct}</strong> ${status ? `(${window.sanitizeInput(status)})` : ''}`;
}

window.initScormSession = function initScormSession(lessonId) {
  const cmi = { score: null, status: null };

  const commit = () => { persistLessonScore(lessonId, cmi.score, cmi.status, { ...cmi }); updateLiveScoreLabel(cmi.score, cmi.status); return 'true'; };

  const scorm12 = {
    LMSInitialize: () => 'true',
    LMSFinish: () => commit(),
    LMSCommit: () => commit(),
    LMSGetValue: (key) => {
      if (key === 'cmi.core.score.raw') return cmi.score !== null ? String(cmi.score) : '';
      if (key === 'cmi.core.lesson_status') return cmi.status || 'incomplete';
      return '';
    },
    LMSSetValue: (key, value) => {
      if (key === 'cmi.core.score.raw') cmi.score = parseFloat(value);
      if (key === 'cmi.core.lesson_status') cmi.status = value;
      return 'true';
    },
    LMSGetLastError: () => '0',
    LMSGetErrorString: () => '',
    LMSGetDiagnostic: () => '',
  };

  const scorm2004 = {
    Initialize: () => 'true',
    Terminate: () => commit(),
    Commit: () => commit(),
    GetValue: (key) => {
      if (key === 'cmi.score.raw' || key === 'cmi.score.scaled') return cmi.score !== null ? String(cmi.score) : '';
      if (key === 'cmi.completion_status') return cmi.status || 'incomplete';
      return '';
    },
    SetValue: (key, value) => {
      if (key === 'cmi.score.raw') cmi.score = parseFloat(value);
      if (key === 'cmi.score.scaled') cmi.score = parseFloat(value) * 100;
      if (key === 'cmi.completion_status' || key === 'cmi.success_status') cmi.status = value;
      return 'true';
    },
    GetLastError: () => '0',
    GetErrorString: () => '',
    GetDiagnostic: () => '',
  };

  window.API = scorm12;
  window.API_1484_11 = scorm2004;
  window._scormCmi = cmi;

  updateLiveScoreLabel(null, null);
}

window.teardownScormSession = function teardownScormSession() {
  delete window.API;
  delete window.API_1484_11;
  delete window._scormCmi;
}

// ================================================
// RUNTIME H5P -- captura nota vía eventos xAPI
// ================================================
window.initH5PSession = async function initH5PSession(lesson, attempt = 1) {
  const container = document.getElementById('h5p-container');
  if (!container) return;

  // A veces main.bundle.js (que define window.H5PStandalone) todavía no
  // terminó de ejecutarse cuando el alumno navega rápido entre recursos del
  // curso, o Supabase Storage devolvió un 429 momentáneo en alguna librería
  // del paquete H5P -- ambos son transitorios, así que reintentamos un par
  // de veces antes de rendirnos (esto explicaba el "a veces sí, a veces no").
  if (typeof H5PStandalone === 'undefined') {
    if (attempt >= 3) {
      container.innerHTML = `<div class="text-center py-10"><p class="text-rose-500 text-sm mb-3">No se pudo cargar el reproductor H5P.</p><button class="btn-secondary-tw h-9 px-4 text-xs uppercase font-bold" onclick="window.initH5PSession(window._activeCourse.items[window._activeCourseIndex])"><i class="fas fa-rotate"></i> Reintentar</button></div>`;
      return;
    }
    setTimeout(() => window.initH5PSession(lesson, attempt + 1), 800);
    return;
  }

  try {
    // Un curso puede tener varios recursos H5P -- cada uno necesita su
    // propio acumulador de puntaje (algunos H5P, como Video Interactivo,
    // disparan VARIAS interacciones internas -- multi-choice con nota real,
    // preguntas abiertas sin nota, etc. -- y hay que sumarlas, no quedarnos
    // solo con la última que llegó, o una interacción sin nota pisa la nota
    // real de otra que sí tenía).
    const scoredInteractions = new Map();

    const h5p = new H5PStandalone.H5P(container, {
      h5pJsonPath: lesson.content_url.replace(/\/$/, ''),
      frameJs: 'https://cdn.jsdelivr.net/npm/h5p-standalone@3.7.0/dist/frame.bundle.js',
      frameCss: 'https://cdn.jsdelivr.net/npm/h5p-standalone@3.7.0/dist/styles/h5p.css',
    });

    // El propio H5PStandalone despacha xAPI a través de H5P.externalDispatcher
    // una vez que termina de inicializar el iframe interno.
    const waitForDispatcher = setInterval(() => {
      const innerH5P = document.querySelector('#h5p-container iframe')?.contentWindow?.H5P;
      if (innerH5P?.externalDispatcher) {
        clearInterval(waitForDispatcher);
        innerH5P.externalDispatcher.on('xAPI', (event) => {
          const statement = event?.data?.statement;
          const result = statement?.result;
          if (!result || result.score == null || !result.score.max) return;

          // Cada sub-interacción tiene su propio id de objeto xAPI -- se
          // guarda la última nota de CADA una y se suma el total al final.
          const objectId = statement.object?.id || crypto.randomUUID();
          scoredInteractions.set(objectId, { raw: result.score.raw ?? 0, max: result.score.max });

          let totalRaw = 0, totalMax = 0;
          scoredInteractions.forEach(s => { totalRaw += s.raw; totalMax += s.max; });
          const pct = totalMax > 0 ? Math.round((totalRaw / totalMax) * 100) : 0;
          const status = result.completion ? 'completed' : 'incomplete';
          persistLessonScore(lesson.id, pct, status, statement);
          updateLiveScoreLabel(pct, status);
        });
      }
    }, 500);
    setTimeout(() => clearInterval(waitForDispatcher), 20000);

  } catch (e) {
    console.error('Error cargando H5P:', e);
    container.innerHTML = '<p class="text-rose-500 text-sm text-center py-10">Error cargando el contenido H5P.</p>';
  }
}
