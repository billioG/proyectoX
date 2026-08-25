/**
 * LESSONS - Módulo de lecciones (video/PDF/imagen + SCORM/H5P con nota)
 */

const LESSON_TYPE_ICON = { video: 'fa-video', pdf: 'fa-file-pdf', image: 'fa-image', scorm: 'fa-cube', h5p: 'fa-puzzle-piece' };
const LESSON_TYPE_LABEL = { video: 'Video', pdf: 'PDF', image: 'Imagen', scorm: 'SCORM', h5p: 'H5P' };
const LESSON_TYPES_WITH_GRADE = new Set(['scorm', 'h5p']);
const LESSON_STORAGE_BUCKET = 'course-content';

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
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Tipo</label>
          <select id="lesson-type" class="input-field-tw h-11 text-sm" onchange="window.toggleLessonSourceField()">
            <option value="video">Video (YouTube o link directo)</option>
            <option value="pdf">PDF (link directo)</option>
            <option value="image">Imagen (link directo)</option>
            <option value="scorm">SCORM (.zip -- con nota automática)</option>
            <option value="h5p">H5P (.zip -- con nota automática)</option>
          </select>
        </div>
        <div id="lesson-source-url-wrap">
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">URL *</label>
          <input type="text" id="lesson-url" placeholder="https://..." class="input-field-tw h-11 text-sm">
        </div>
        <div id="lesson-source-file-wrap" class="hidden">
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Archivo .zip *</label>
          <input type="file" id="lesson-file" class="input-field-tw text-sm py-2.5">
          <p class="text-[0.65rem] text-slate-400 mt-1">Aceptamos .zip y .h5p (es el mismo formato).</p>
          <p id="lesson-upload-progress" class="text-[0.65rem] text-slate-400 mt-2 hidden"></p>
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

window.toggleLessonSourceField = function toggleLessonSourceField() {
  const type = document.getElementById('lesson-type')?.value;
  const isFile = LESSON_TYPES_WITH_GRADE.has(type);
  document.getElementById('lesson-source-url-wrap')?.classList.toggle('hidden', isFile);
  document.getElementById('lesson-source-file-wrap')?.classList.toggle('hidden', !isFile);
}

window.saveLesson = async function saveLesson() {
  const classIndex = document.getElementById('lesson-class')?.value;
  const title = document.getElementById('lesson-title')?.value.trim();
  const description = document.getElementById('lesson-description')?.value.trim();
  let content_type = document.getElementById('lesson-type')?.value;
  const isFileType = LESSON_TYPES_WITH_GRADE.has(content_type);
  const content_url = document.getElementById('lesson-url')?.value.trim();
  const file = document.getElementById('lesson-file')?.files?.[0];
  const btn = document.getElementById('btn-save-lesson');
  const progressEl = document.getElementById('lesson-upload-progress');

  if (!title) return window.showToast('<i class="fas fa-circle-xmark"></i> Ponele un título', 'error');
  if (!isFileType && !content_url) return window.showToast('<i class="fas fa-circle-xmark"></i> Completa la URL', 'error');
  if (isFileType && !file) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí un archivo .zip', 'error');
  const classOption = window._lessonClassOptions?.[classIndex];
  if (!classOption) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí una clase', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...';

  try {
    const lessonId = crypto.randomUUID();
    let finalUrl = content_url;
    let contentPath = null;

    if (isFileType) {
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

    const { error } = await window._supabase.from('lessons').insert({
      id: lessonId,
      title,
      description: description || null,
      content_type,
      content_url: finalUrl,
      content_path: contentPath,
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
    console.error('Error publicando lección:', err);
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Publicar';
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
    const blob = await entry.async('blob');
    const path = `${basePath}/${entry.name}`;
    // JSZip no le pone tipo MIME al blob -- sin esto, Storage lo sirve
    // como application/octet-stream y el navegador nunca ejecuta el
    // HTML/JS, solo lo muestra como texto crudo.
    const contentType = window.getFileMimeType(entry.name);
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

window.deleteLesson = async function deleteLesson(id) {
  if (!confirm('¿Eliminar esta lección? Los alumnos ya no podrán verla.')) return;

  const { data: lesson } = await window._supabase.from('lessons').select('content_path').eq('id', id).maybeSingle();
  const { error } = await window._supabase.from('lessons').delete().eq('id', id);
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  if (lesson?.content_path) {
    const { data: files } = await window._supabase.storage.from(LESSON_STORAGE_BUCKET).list(lesson.content_path, { limit: 1000 });
    if (files?.length) {
      await window._supabase.storage.from(LESSON_STORAGE_BUCKET).remove(files.map(f => `${lesson.content_path}/${f.name}`));
    }
  }

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
    _supabase.from('lesson_completions').select('lesson_id, score, status').eq('student_id', currentUser.id),
  ]);

  if (error) { container.innerHTML = `<p class="text-rose-500 text-xs">Error: ${error.message}</p>`; return; }
  if (!lessons?.length) { container.innerHTML = '<div class="glass-card p-10 text-center text-slate-400 text-sm">Tu docente todavía no publicó lecciones.</div>'; return; }

  const completionsByLesson = new Map((completions || []).map(c => [c.lesson_id, c]));
  window._lessonsCache = lessons;

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      ${lessons.map(l => {
        const completion = completionsByLesson.get(l.id);
        const done = !!completion;
        const hasGrade = LESSON_TYPES_WITH_GRADE.has(l.content_type);
        let badgeHtml;
        if (hasGrade && completion?.score != null) {
          badgeHtml = `<i class="fas fa-star"></i> ${Math.round(completion.score)}%`;
        } else if (done) {
          badgeHtml = '<i class="fas fa-circle-check"></i> Visto';
        } else {
          badgeHtml = hasGrade ? 'Sin completar' : 'Sin ver';
        }
        return `
        <div class="glass-card p-5 flex flex-col gap-3 cursor-pointer hover:border-primary/30 transition-all" onclick="window.openLessonViewer('${l.id}')">
          <div class="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-lg"><i class="fas ${LESSON_TYPE_ICON[l.content_type]}"></i></div>
          <div>
            <h4 class="text-sm font-bold text-slate-800 dark:text-white">${window.sanitizeInput(l.title)}</h4>
            ${l.description ? `<p class="text-xs text-slate-400 mt-1 line-clamp-2">${window.sanitizeInput(l.description)}</p>` : ''}
          </div>
          <span class="text-[0.6rem] font-black uppercase px-2 py-1 rounded-lg w-fit ${done ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}">
            ${badgeHtml}
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

  const hasAutoGrade = LESSON_TYPES_WITH_GRADE.has(lesson.content_type);
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
  } else if (lesson.content_type === 'scorm') {
    mediaHtml = `<iframe id="scorm-frame" class="w-full h-[70vh] rounded-xl border border-slate-200 dark:border-slate-700" src="${lesson.content_url}"></iframe>`;
  } else if (lesson.content_type === 'h5p') {
    mediaHtml = `<div id="h5p-container" class="w-full min-h-[60vh]"></div>`;
  }

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-4xl p-0 overflow-hidden shadow-2xl animate-slideUp">
      <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
        <div>
          <h3 class="text-lg font-bold text-slate-800 dark:text-white">${window.sanitizeInput(lesson.title)}</h3>
          ${lesson.description ? `<p class="text-xs text-slate-400 mt-1">${window.sanitizeInput(lesson.description)}</p>` : ''}
        </div>
        <button class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center shrink-0" onclick="window.closeLessonViewer()"><i class="fas fa-times"></i></button>
      </div>
      <div class="p-6 max-h-[75vh] overflow-y-auto custom-scrollbar">${mediaHtml}</div>
      <div class="p-6 border-t border-slate-100 dark:border-slate-800">
        ${hasAutoGrade
          ? `<p id="lesson-live-score" class="text-center text-sm font-bold text-slate-500">La nota se guarda automáticamente mientras completás la actividad.</p>`
          : `<button class="btn-primary-tw w-full h-12 text-xs uppercase font-bold" id="btn-mark-lesson-seen" onclick="window.markLessonSeen('${lesson.id}')"><i class="fas fa-circle-check"></i> Marcar como visto</button>`
        }
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  if (lesson.content_type === 'scorm') {
    window.initScormSession(lesson.id);
  } else if (lesson.content_type === 'h5p') {
    window.initH5PSession(lesson);
  }
}

window.closeLessonViewer = function closeLessonViewer() {
  window.teardownScormSession?.();
  document.querySelector('.fixed.z-\\[200\\]')?.remove();
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
window.initH5PSession = async function initH5PSession(lesson) {
  const container = document.getElementById('h5p-container');
  if (!container || typeof H5PStandalone === 'undefined') {
    if (container) container.innerHTML = '<p class="text-rose-500 text-sm text-center py-10">No se pudo cargar el reproductor H5P.</p>';
    return;
  }

  try {
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
          const result = event?.data?.statement?.result;
          if (!result || result.score == null) return;
          const raw = result.score.raw ?? (result.score.scaled != null ? result.score.scaled * 100 : null);
          const max = result.score.max || 100;
          const pct = raw !== null ? Math.round((raw / max) * 100) : null;
          const status = result.completion ? 'completed' : 'incomplete';
          persistLessonScore(lesson.id, pct, status, event.data.statement);
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
