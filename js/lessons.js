/**
 * LESSONS - Cursos con recursos ordenados (video/PDF/imagen + SCORM/H5P con
 * nota), estilo Platzi: bloqueo secuencial y barra de progreso.
 */

const LESSON_TYPE_ICON = { video: 'fa-video', pdf: 'fa-file-pdf', image: 'fa-image', scorm: 'fa-cube', h5p: 'fa-puzzle-piece', html5: 'fa-window-maximize', tinkercad: 'fa-microchip' };
const LESSON_TYPE_LABEL = { video: 'Video', pdf: 'PDF', image: 'Imagen', scorm: 'SCORM', h5p: 'H5P', html5: 'Aplicación HTML5', quiz: 'Quiz', tinkercad: 'Tinkercad' };
const LESSON_TYPES_WITH_GRADE = new Set(['scorm', 'h5p', 'quiz']);
// Subconjunto que sube un .zip (H5P/SCORM/HTML5 genérico) -- el quiz también
// tiene nota automática pero su UI de carga es un formulario de preguntas,
// no un archivo, así que necesita su propio chequeo separado. HTML5 no tiene
// nota automática (no habla xAPI/SCORM API) -- se completa como video/PDF,
// con "marcar como visto".
const ZIP_RESOURCE_TYPES = new Set(['scorm', 'h5p', 'html5']);
const QUIZ_QUESTION_TYPE_LABEL = { mc: 'Opción múltiple', tf: 'Verdadero/Falso', number: 'Número exacto', range: 'Rango (min-max)', text: 'Respuesta abierta (manual)' };
// Solo avisa en cursos creados desde que existe esta regla -- los que ya
// existían de antes no se les exige retroactivamente un cuestionario/H5P.
const GRADED_REQUIREMENT_SINCE = '2026-08-29T00:00:00Z';
const LESSON_STORAGE_BUCKET = 'course-content';

// h5p-standalone autoalojado (vendor/h5p-standalone/) en vez de CDN jsdelivr
// -- en redes escolares con filtros de contenido ese CDN a veces queda
// bloqueado/lento y el reproductor se quedaba colgado sin fallar nunca.
function h5pVendorUrl(file) {
  return `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}vendor/h5p-standalone/${file}`;
}

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
      <button class="btn-secondary-tw h-11 px-6 text-xs uppercase font-bold shrink-0" onclick="window.openExportSireModal()"><i class="fas fa-file-export"></i> Exportar Notas (SIRE)</button>
      <button class="btn-secondary-tw h-11 px-6 text-xs uppercase font-bold shrink-0" onclick="window.openCuadroFinalModal()"><i class="fas fa-table-list"></i> Cuadro de Resultados</button>
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
    <div class="glass-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><i class="fas fa-book-open"></i></div>
        <div class="min-w-0 flex-1 cursor-pointer" onclick="window.openCourseManager('${c.id}')">
          <h4 class="text-sm font-bold text-slate-800 dark:text-white truncate">${window.sanitizeInput(c.title)}</h4>
          <p class="text-[0.7rem] text-slate-400 truncate">${window.sanitizeInput(c.schools?.name || c.school_code)} · ${window.sanitizeInput(c.grade)} ${window.sanitizeInput(c.section)} · ${c.lessons?.length || 0} rec. · ${c.bimestre || 1}º Bim. · ${c.weight ?? 100}pts${window.userRole === 'admin' ? ` · ${window.sanitizeInput(c.teachers?.full_name || '')}` : ''}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0 sm:ml-auto">
        ${c.is_shared ? '<span class="text-[0.6rem] font-black uppercase px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 shrink-0"><i class="fas fa-share-nodes"></i> Compartido</span>' : ''}
        <button class="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shrink-0" title="Ver notas" onclick="window.openCourseGradesModal('${c.id}')"><i class="fas fa-chart-simple text-xs"></i></button>
        <button class="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shrink-0" title="${c.is_shared ? 'Dejar de compartir' : 'Compartir en biblioteca'}" onclick="window.toggleCourseShare('${c.id}', ${!c.is_shared})"><i class="fas fa-share-nodes text-xs"></i></button>
        <button class="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shrink-0" onclick="window.openCreateCourseModal('${c.id}')"><i class="fas fa-pen text-xs"></i></button>
        <button class="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center shrink-0" onclick="window.deleteCourse('${c.id}')"><i class="fas fa-trash-alt text-xs"></i></button>
      </div>
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

// Storage no tiene carpetas reales -- list() solo devuelve el nivel
// inmediato del prefijo, y una entrada que en realidad es un
// pseudo-directorio viene con id:null. Los paquetes SCORM/H5P/HTML5 casi
// siempre traen una carpeta contenedora (el .zip trae todo adentro de
// "MiPaquete/..."), así que un list()+remove() de un solo nivel nunca
// encontraba los archivos reales -- el borrado de recurso corría sin
// error pero no liberaba nada de espacio en Storage.
async function listAllFilesRecursive(bucket, prefix) {
  const { data: entries } = await window._supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  let files = [];
  for (const e of (entries || [])) {
    const fullPath = `${prefix}/${e.name}`;
    if (e.id === null) {
      files = files.concat(await listAllFilesRecursive(bucket, fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function cleanupLessonStorageIfOrphaned(contentPath) {
  if (!contentPath) return;
  // Una lección copiada desde la biblioteca comparte content_path con el
  // original -- solo borramos los archivos de Storage si ninguna otra
  // lección (copia u original) sigue apuntando a esa misma carpeta.
  const { count } = await window._supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('content_path', contentPath);
  if (!count) {
    const files = await listAllFilesRecursive(LESSON_STORAGE_BUCKET, contentPath);
    // remove() tiene límites prácticos de tamaño de request -- se manda en
    // lotes de 100 por si algún paquete SCORM viene con muchísimos assets.
    for (let i = 0; i < files.length; i += 100) {
      await window._supabase.storage.from(LESSON_STORAGE_BUCKET).remove(files.slice(i, i + 100));
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
          <select id="course-class" class="input-field-tw h-11 text-sm" onchange="window.refreshCourseCnbAreaOptions()">
            ${classOptions.map((c, i) => `<option value="${i}" ${i === selectedIndex ? 'selected' : ''}>${window.sanitizeInput(c.schoolName)} · ${window.sanitizeInput(c.grade)} ${window.sanitizeInput(c.section)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Título *</label>
          <input type="text" id="course-title" class="input-field-tw h-11 text-sm" value="${editing ? window.sanitizeAttr(editing.title) : ''}">
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Área CNB *</label>
          <select id="course-cnb-area" class="input-field-tw h-11 text-sm"></select>
          <p class="text-[0.65rem] text-slate-400 mt-1">Área curricular oficial (CNB) a la que pertenece este curso -- la exige el Cuadro de Resultados Finales del MINEDUC.</p>
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
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Unidad / Bimestre</label>
            <select id="course-bimestre" class="input-field-tw h-11 text-sm">
              ${[1, 2, 3, 4].map(b => `<option value="${b}" ${(editing?.bimestre || 1) === b ? 'selected' : ''}>${b}º Bimestre</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Ponderación (puntos)</label>
            <input type="number" id="course-weight" min="0" max="100" value="${editing?.weight ?? 100}" class="input-field-tw h-11 text-sm">
          </div>
        </div>
        <p class="text-[0.65rem] text-slate-400 -mt-2"><i class="fas fa-circle-info"></i> Cuánto vale este curso dentro de la nota del bimestre. La plataforma reparte el peso entre sus recursos automáticamente (los que tienen nota real pesan más que los de solo lectura).</p>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Link de Clase Tinkercad (opcional)</label>
          <input type="text" id="course-tinkercad-class-url" placeholder="https://www.tinkercad.com/joinclass/..." class="input-field-tw h-11 text-sm" value="${editing ? window.sanitizeAttr(editing.tinkercad_class_url || '') : ''}">
          <p class="text-[0.65rem] text-slate-400 mt-1">Si lo llenás, los estudiantes de este curso ven un botón para entrar a tu clase de Tinkercad.</p>
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
  window._editingCourseCnbArea = editing?.cnb_area || null;
  window.refreshCourseCnbAreaOptions();
  if (!editing) attachFormDraftAutosave(modal, 'px_draft_course', ['course-title', 'course-description', 'course-tags']);
}

// El área depende del NIVEL de la clase elegida (primaria/básico/diversificado
// tienen listas CNB distintas) -- se recalcula cada vez que cambia el select
// de clase, preservando la selección guardada si se está editando un curso.
window.refreshCourseCnbAreaOptions = function refreshCourseCnbAreaOptions() {
  const classIndex = document.getElementById('course-class')?.value;
  const classOption = window._courseClassOptions?.[classIndex];
  const select = document.getElementById('course-cnb-area');
  if (!select || !classOption) return;
  const areas = window.getCnbAreasForGrade(classOption.grade);
  const preserve = window._editingCourseCnbArea;
  select.innerHTML = areas.map(a => `<option value="${window.sanitizeAttr(a)}" ${a === preserve ? 'selected' : ''}>${window.sanitizeInput(a)}</option>`).join('');
  window._editingCourseCnbArea = null; // solo se preserva la primera vez
};

window.saveCourse = async function saveCourse(editingId) {
  const classIndex = document.getElementById('course-class')?.value;
  const title = document.getElementById('course-title')?.value.trim();
  const description = document.getElementById('course-description')?.value.trim();
  const tags = (document.getElementById('course-tags')?.value || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const bimestre = parseInt(document.getElementById('course-bimestre')?.value) || 1;
  const weight = Math.min(100, Math.max(0, parseInt(document.getElementById('course-weight')?.value) || 0));
  const tinkercad_class_url = document.getElementById('course-tinkercad-class-url')?.value.trim() || null;
  const cnb_area = document.getElementById('course-cnb-area')?.value || null;
  const classOption = window._courseClassOptions?.[classIndex];
  const btn = document.getElementById('btn-save-course');

  if (!title) return window.showToast('<i class="fas fa-circle-xmark"></i> Ponele un título', 'error');
  if (!cnb_area) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí el área CNB del curso', 'error');
  if (!classOption) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí una clase', 'error');

  // El SIRE no acepta más de 100 puntos por bimestre -- si ya hay otros
  // cursos en el mismo bimestre/clase, sus ponderaciones se SUMAN (así
  // está pensado: varios cursos pueden repartirse el 100% de la nota del
  // bimestre). Si entre todos superan 100, se avisa antes de guardar.
  const { data: siblingCourses } = await window._supabase.from('courses')
    .select('id, weight').eq('school_code', classOption.school_code).eq('grade', classOption.grade)
    .eq('section', classOption.section).eq('bimestre', bimestre);
  const otherWeight = (siblingCourses || []).filter(c => c.id !== editingId).reduce((sum, c) => sum + (c.weight || 0), 0);
  if (otherWeight + weight > 100) {
    const proceed = confirm(`Los cursos de este bimestre ya suman ${otherWeight + weight} puntos (máximo 100 para el SIRE). ¿Guardar igual?`);
    if (!proceed) return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  if (editingId) {
    const { error } = await window._supabase.from('courses').update({
      title, description: description || null, tags, bimestre, weight, tinkercad_class_url, cnb_area,
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
    title, description: description || null, tags, bimestre, weight, tinkercad_class_url, cnb_area,
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
// CÁLCULO DE NOTA DEL CURSO -- reparto automático de peso
// ================================================
// La nota del curso sale SOLO de las actividades con nota automática
// (H5P/SCORM/quiz) -- se reparten los puntos del curso en partes iguales
// entre ellas. Video/PDF/imagen/HTML5/Tinkercad no entran a esta bolsa:
// solo cuentan para el % de "completado" (visto/no visto), no para la nota.
// Antes SÍ entraban (con menos peso) y eso diluía la nota real con
// recursos que ni siquiera se pueden calificar.
function computeResourceWeights(items) {
  const weights = new Map();
  const graded = items.filter(l => LESSON_TYPES_WITH_GRADE.has(l.content_type));
  if (!graded.length) return weights;
  const unit = 100 / graded.length;
  graded.forEach(l => weights.set(l.id, unit));
  return weights;
}

function resourceScorePct(lesson, completion) {
  if (LESSON_TYPES_WITH_GRADE.has(lesson.content_type)) {
    return completion?.score != null ? completion.score : 0;
  }
  return completion ? 100 : 0;
}

// completionsMap: Map(lessonId -> {score, status}) para UN alumno.
function computeCourseGradeForStudent(course, items, completionsMap) {
  const weights = computeResourceWeights(items);
  let pct = 0;
  const breakdown = items.map(l => {
    const completion = completionsMap.get(l.id);
    const score = resourceScorePct(l, completion);
    const weight = weights.get(l.id) || 0;
    pct += (score * weight) / 100;
    return { lesson: l, score, weight, done: !!completion };
  });
  const points = Math.round(((pct / 100) * (course.weight ?? 100)) * 100) / 100;
  return { pct: Math.round(pct), points, breakdown };
}

window.openCourseGradesModal = async function openCourseGradesModal(courseId) {
  const { data: course, error: courseErr } = await window._supabase.from('courses').select('*, schools(name)').eq('id', courseId).single();
  if (courseErr || !course) return window.showToast('<i class="fas fa-circle-xmark"></i> No se pudo cargar el curso', 'error');

  const [{ data: items }, { data: students }] = await Promise.all([
    window._supabase.from('lessons').select('*').eq('course_id', courseId).order('order_index', { ascending: true }),
    window._supabase.from('students').select('id, full_name, username').eq('school_code', course.school_code).eq('grade', course.grade).eq('section', course.section).order('full_name'),
  ]);

  const lessonIds = (items || []).map(l => l.id);
  const { data: completions } = lessonIds.length
    ? await window._supabase.from('lesson_completions').select('lesson_id, student_id, score, status').in('lesson_id', lessonIds)
    : { data: [] };

  const completionsByStudent = new Map();
  (completions || []).forEach(c => {
    if (!completionsByStudent.has(c.student_id)) completionsByStudent.set(c.student_id, new Map());
    completionsByStudent.get(c.student_id).set(c.lesson_id, c);
  });

  const sanitizeInput = window.sanitizeInput;
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-3xl max-h-[85vh] flex flex-col p-8 shadow-2xl animate-slideUp">
      <div class="flex justify-between items-start mb-2">
        <div>
          <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter">${sanitizeInput(course.title)}</h2>
          <p class="text-xs text-slate-400 mt-1">${course.bimestre || 1}º Bimestre · vale ${course.weight ?? 100} puntos · ${(items || []).length} recurso(s)</p>
        </div>
        <button class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center shrink-0" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <details class="mt-3 mb-1 group">
        <summary class="text-[0.65rem] font-bold text-primary uppercase tracking-widest cursor-pointer select-none"><i class="fas fa-circle-info mr-1"></i> ¿Cómo se pondera cada recurso?</summary>
        <div class="mt-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs space-y-2">
          <p class="text-slate-500 dark:text-slate-400">La nota del curso sale <strong>solo</strong> de los recursos con nota real (H5P/SCORM/Quiz), repartida en partes iguales entre ellos. Los de solo lectura (video/PDF/imagen, Tinkercad) cuentan para el % de "visto" pero no afectan la nota. Si no hay ningún recurso con nota, el curso vale 0 puntos hasta que agregues uno.</p>
          <table class="w-full text-left mt-2">
            <thead><tr class="text-[0.55rem] uppercase text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th class="py-1 pr-2">Recurso</th><th class="py-1 pr-2">Tipo</th><th class="py-1 text-right">Peso</th>
            </tr></thead>
            <tbody>
              ${(() => {
      const weights = computeResourceWeights(items || []);
      return (items || []).map(l => `
                  <tr class="border-b border-slate-100 dark:border-slate-800/50">
                    <td class="py-1.5 pr-2 font-bold text-slate-600 dark:text-slate-300 truncate max-w-[160px]">${sanitizeInput(l.title)}</td>
                    <td class="py-1.5 pr-2 text-slate-400">${LESSON_TYPE_LABEL[l.content_type]}${LESSON_TYPES_WITH_GRADE.has(l.content_type) ? ' <span class="text-emerald-500">(nota real)</span>' : ' <span class="text-slate-400">(visto)</span>'}</td>
                    <td class="py-1.5 text-right font-black text-primary">${(weights.get(l.id) || 0).toFixed(1)}%</td>
                  </tr>
                `).join('') || '<tr><td colspan="3" class="py-2 text-slate-400">Sin recursos todavía.</td></tr>';
    })()}
            </tbody>
          </table>
        </div>
      </details>
      <div class="overflow-y-auto custom-scrollbar mt-2 -mx-2 px-2">
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100 dark:border-slate-800">
              <th class="py-2 pr-4">Alumno</th>
              <th class="py-2 pr-4">Progreso</th>
              <th class="py-2 text-right">Puntos (de ${course.weight ?? 100})</th>
            </tr>
          </thead>
          <tbody>
            ${(students || []).map(s => {
              const grade = computeCourseGradeForStudent(course, items || [], completionsByStudent.get(s.id) || new Map());
              return `
                <tr class="border-b border-slate-50 dark:border-slate-800/50">
                  <td class="py-3 pr-4 font-bold text-slate-700 dark:text-slate-200">${sanitizeInput(s.full_name)}</td>
                  <td class="py-3 pr-4 text-slate-500">${grade.pct}%</td>
                  <td class="py-3 text-right font-black text-primary">${grade.points}</td>
                </tr>
              `;
            }).join('') || `<tr><td colspan="3" class="py-10 text-center text-slate-400">No hay alumnos en esta clase todavía.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
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
        <div class="flex items-center gap-2 shrink-0">
          ${course.is_shared ? `<button class="h-8 px-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-500 hover:bg-rose-500 hover:text-white text-[0.6rem] font-black uppercase transition-all" onclick="window.openCourseFeedbackInbox('${course.id}', '${window.sanitizeAttr(course.title)}')"><i class="fas fa-heart"></i> Feedback</button>` : ''}
          <button class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center shrink-0" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
        </div>
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

  const course = window._managingCourse;
  const hasGraded = lessons.some(l => LESSON_TYPES_WITH_GRADE.has(l.content_type));
  const warnMissingGraded = !hasGraded && course?.created_at >= GRADED_REQUIREMENT_SINCE;
  const warningHtml = warnMissingGraded ? `
    <div class="glass-card p-4 mb-3 border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
      <i class="fas fa-triangle-exclamation mt-0.5"></i>
      <span>Este curso todavía no tiene ninguna actividad con nota (Quiz, H5P o SCORM) -- vale <strong>0 puntos</strong> hasta que agregues una. Agregá al menos un cuestionario final.</span>
    </div>` : '';

  if (!lessons.length) {
    listEl.innerHTML = warningHtml + '<div class="glass-card p-8 text-center text-slate-400 text-sm">Todavía no agregaste recursos. Los alumnos verán este curso vacío.</div>';
    return;
  }

  listEl.innerHTML = warningHtml + lessons.map((l, i) => `
    <div class="glass-card p-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <span class="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-xs font-black shrink-0">${i + 1}</span>
        <div class="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><i class="fas ${LESSON_TYPE_ICON[l.content_type]}"></i></div>
        <div class="min-w-0 flex-1">
          <h4 class="text-sm font-bold text-slate-800 dark:text-white truncate">${window.sanitizeInput(l.title)}</h4>
          <p class="text-[0.65rem] text-slate-400">${LESSON_TYPE_LABEL[l.content_type]}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 justify-end sm:justify-start shrink-0">
        <button class="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shrink-0" onclick="window.previewCourseResource('${l.id}')" title="Ver recurso"><i class="fas fa-eye text-[0.65rem]"></i></button>
        <button class="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shrink-0 ${i === 0 ? 'opacity-30 pointer-events-none' : ''}" onclick="window.moveCourseResource('${l.id}', -1)"><i class="fas fa-arrow-up text-[0.65rem]"></i></button>
        <button class="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shrink-0 ${i === lessons.length - 1 ? 'opacity-30 pointer-events-none' : ''}" onclick="window.moveCourseResource('${l.id}', 1)"><i class="fas fa-arrow-down text-[0.65rem]"></i></button>
        <button class="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-colors flex items-center justify-center shrink-0" onclick="window.openAddResourceModal('${window._managingCourse.id}', '${l.id}')"><i class="fas fa-pen text-[0.6rem]"></i></button>
        <button class="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center shrink-0" onclick="window.deleteCourseResource('${l.id}')"><i class="fas fa-trash-alt text-[0.6rem]"></i></button>
      </div>
    </div>
  `).join('');
}

// Vista rápida de solo lectura para el docente -- antes solo podía editar
// título/orden del recurso sin nunca ver realmente el contenido (video,
// H5P, PDF...) sin tener que entrar como si fuera alumno.
window.previewCourseResource = function previewCourseResource(lessonId) {
  const lesson = (window._managingCourseLessons || []).find(l => l.id === lessonId);
  if (!lesson) return;

  // Mismo workaround que en selectCourseResource(): el estado global de
  // h5p-standalone (window.H5P/H5PIntegration) queda contaminado tras el
  // primer H5P cargado en la página -- vista previa docente y reproductor
  // alumno comparten el mismo _loadedH5PLessonId a propósito, porque el
  // problema es global, no por contexto.
  if (lesson.content_type === 'h5p' && window._loadedH5PLessonId && window._loadedH5PLessonId !== lesson.id) {
    sessionStorage.setItem('PX_RESUME_PREVIEW', JSON.stringify({ courseId: lesson.course_id, lessonId: lesson.id }));
    window.location.reload();
    return;
  }
  if (lesson.content_type === 'h5p') window._loadedH5PLessonId = lesson.id;

  const sanitizeInput = window.sanitizeInput || ((v) => v);

  let mediaHtml = '';
  if (lesson.content_type === 'video') {
    const ytMatch = lesson.content_url?.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{6,})/);
    mediaHtml = ytMatch
      ? `<iframe class="w-full aspect-video rounded-xl" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen></iframe>`
      : `<video class="w-full rounded-xl" src="${lesson.content_url}" controls></video>`;
  } else if (lesson.content_type === 'pdf') {
    mediaHtml = `<iframe class="w-full h-[60vh] rounded-xl border border-slate-200 dark:border-slate-700" src="${lesson.content_url}"></iframe>`;
  } else if (lesson.content_type === 'image') {
    mediaHtml = `<img src="${lesson.content_url}" class="w-full rounded-xl">`;
  } else if (lesson.content_type === 'tinkercad') {
    // Tinkercad manda X-Frame-Options: sameorigin en casi todas sus páginas
    // (solo el link especial de "Insertar" a veces lo evita, y es difícil
    // de encontrar en la UI actual) -- en vez de pelear con el iframe, se
    // abre el diseño en pestaña nueva con el link normal que el docente
    // ya tiene a mano.
    mediaHtml = `
      <div class="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-10 flex flex-col items-center gap-4 text-center">
        <i class="fas fa-microchip text-4xl text-primary"></i>
        <p class="text-sm text-slate-500 dark:text-slate-400">Este recurso abre el diseño de Tinkercad en una pestaña nueva.</p>
        <a href="${lesson.content_url}" target="_blank" rel="noopener" class="btn-primary-tw h-11 px-6 text-xs uppercase font-bold"><i class="fas fa-up-right-from-square"></i> Abrir en Tinkercad</a>
      </div>`;
  } else if (lesson.content_type === 'scorm' || lesson.content_type === 'html5') {
    // Ver comentario en selectCourseResource() -- srcdoc en vez de src=""
    // evita que Supabase pise el Content-Type a text/plain en la navegación.
    mediaHtml = `<iframe id="teacher-preview-frame" class="w-full h-[60vh] rounded-xl border border-slate-200 dark:border-slate-700"></iframe>`;
  } else if (lesson.content_type === 'h5p') {
    mediaHtml = `<div id="h5p-preview-container" class="w-full min-h-[50vh]"></div>`;
  } else if (lesson.content_type === 'quiz') {
    const qs = lesson.quiz_data || [];
    mediaHtml = `<div class="space-y-4 text-left">${qs.map((q, i) => `
      <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
        <p class="font-bold text-sm text-slate-800 dark:text-white mb-2">${i + 1}. ${sanitizeInput(q.question)} <span class="text-[0.6rem] text-slate-400 uppercase">(${QUIZ_QUESTION_TYPE_LABEL[q.type]})</span></p>
        ${q.type === 'mc' ? q.options.map((opt, oi) => `<p class="text-xs ${oi === q.correctIndex ? 'text-emerald-500 font-bold' : 'text-slate-500'} pl-3">${oi === q.correctIndex ? '✓' : '·'} ${sanitizeInput(opt)}</p>`).join('') : ''}
        ${q.type === 'tf' ? `<p class="text-xs text-emerald-500 font-bold pl-3">✓ ${q.correctBool ? 'Verdadero' : 'Falso'}</p>` : ''}
        ${q.type === 'number' ? `<p class="text-xs text-emerald-500 font-bold pl-3">✓ ${q.correctNumber} (± ${q.tolerance || 0})</p>` : ''}
        ${q.type === 'range' ? `<p class="text-xs text-emerald-500 font-bold pl-3">✓ Entre ${q.min} y ${q.max}</p>` : ''}
        ${q.type === 'text' ? `<p class="text-xs text-slate-400 pl-3">Respuesta abierta -- se califica manual</p>` : ''}
      </div>
    `).join('') || '<p class="text-slate-400 text-sm">Este quiz todavía no tiene preguntas.</p>'}</div>`;
  }

  document.getElementById('course-resource-preview-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'course-resource-preview-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
      <div class="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
        <div>
          <h3 class="text-sm font-black text-slate-800 dark:text-white">${sanitizeInput(lesson.title)}</h3>
          <p class="text-[0.6rem] text-slate-400 uppercase">${LESSON_TYPE_LABEL[lesson.content_type]} · Vista previa docente</p>
        </div>
        <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 flex items-center justify-center" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="flex-1 overflow-y-auto custom-scrollbar p-5">
        ${mediaHtml || '<p class="text-slate-400 text-sm text-center py-10">No hay contenido para previsualizar.</p>'}
        <div id="teacher-resource-comments" class="border-t border-slate-100 dark:border-slate-800 mt-5 pt-5"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window.loadTeacherResourceComments(lessonId);

  if (lesson.content_type === 'scorm' || lesson.content_type === 'html5') {
    window.loadIframeViaFetch('teacher-preview-frame', lesson.content_url);
  } else if (lesson.content_type === 'h5p') {
    // Reintenta hasta que H5PStandalone esté disponible, sin escribir
    // ninguna nota -- es solo vista previa, no crea lesson_completions.
    const tryInit = (attempt = 1) => {
      const container = document.getElementById('h5p-preview-container');
      if (!container) return;
      if (typeof H5PStandalone === 'undefined') {
        if (attempt >= 3) { container.innerHTML = '<p class="text-rose-500 text-sm text-center py-10">No se pudo cargar el reproductor H5P.</p>'; return; }
        setTimeout(() => tryInit(attempt + 1), 800);
        return;
      }
      resetH5PGlobalState();
      new H5PStandalone.H5P(container, {
        h5pJsonPath: lesson.content_url.replace(/\/$/, ''),
        frameJs: h5pVendorUrl('frame.bundle.js'),
        frameCss: h5pVendorUrl('styles/h5p.css'),
      });
    };
    tryInit();
  }
}

// Comentarios de equipo (docente) -- el docente elige qué equipo mirar
// porque cada hilo de comentarios está anclado a (recurso, equipo).
window.loadTeacherResourceComments = async function loadTeacherResourceComments(lessonId) {
  const course = window._managingCourse;
  const panel = document.getElementById('teacher-resource-comments');
  if (!panel || !course) return;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const { data: groups } = await window._supabase.from('groups').select('id, name')
    .eq('school_code', course.school_code).eq('grade', course.grade).eq('section', course.section)
    .order('name');

  panel.innerHTML = `
    <h4 class="text-xs font-black uppercase text-slate-400 tracking-widest mb-2"><i class="fas fa-comments"></i> Comentarios por equipo</h4>
    ${!groups?.length ? '<p class="text-xs text-slate-400">No hay equipos en esta clase todavía.</p>' : `
      <select id="teacher-comment-group" class="input-field-tw h-9 text-xs mb-2" onchange="window.loadTeacherCommentsForGroup('${lessonId}')">
        ${groups.map(g => `<option value="${g.id}">${sanitizeInput(g.name)}</option>`).join('')}
      </select>
      <div id="teacher-comments-list" class="space-y-2 max-h-52 overflow-y-auto custom-scrollbar mb-2 pr-1"></div>
      <div class="flex gap-2">
        <input id="teacher-comment-input" class="input-field-tw h-9 text-sm flex-1" placeholder="Escribí un comentario...">
        <button class="btn-primary-tw h-9 px-4 text-xs uppercase font-bold shrink-0" onclick="window.postTeacherResourceComment('${lessonId}')"><i class="fas fa-paper-plane"></i></button>
      </div>
    `}
  `;
  if (groups?.length) window.loadTeacherCommentsForGroup(lessonId);
};

window.loadTeacherCommentsForGroup = async function loadTeacherCommentsForGroup(lessonId) {
  const groupId = document.getElementById('teacher-comment-group')?.value;
  const list = document.getElementById('teacher-comments-list');
  if (!list || !groupId) return;

  const { data: comments } = await window._supabase.from('resource_comments').select('*')
    .eq('lesson_id', lessonId).eq('group_id', groupId).order('created_at', { ascending: true });

  const ids = (comments || []).map(c => c.id);
  let likes = [];
  if (ids.length) {
    const { data } = await window._supabase.from('resource_comment_likes').select('comment_id, user_id').in('comment_id', ids);
    likes = data || [];
  }

  list.innerHTML = window.buildResourceCommentsHtml(comments || [], likes, {
    likeFn: (id, liked) => `window.toggleTeacherCommentLike('${lessonId}', '${id}', ${liked})`,
    replyFn: (id) => `window.postTeacherResourceComment('${lessonId}', '${id}')`,
  });
};

window.postTeacherResourceComment = async function postTeacherResourceComment(lessonId, parentId) {
  const groupId = document.getElementById('teacher-comment-group')?.value;
  const inputId = parentId ? `reply-input-${parentId}` : 'teacher-comment-input';
  const input = document.getElementById(inputId);
  if (!input || !groupId) return;
  const content = input.value.trim();
  if (!content) return;
  const userData = window.userData || {};

  const { error } = await window._supabase.from('resource_comments').insert({
    lesson_id: lessonId,
    group_id: groupId,
    parent_id: parentId || null,
    author_id: window.currentUser.id,
    author_name: userData.full_name || 'Docente',
    author_role: window.userRole,
    content,
  });

  if (error) {
    const msg = error.message.includes('CONTENIDO_INAPROPIADO') ? 'Ese comentario tiene lenguaje no permitido' : error.message;
    return window.showToast('<i class="fas fa-circle-xmark"></i> ' + msg, 'error');
  }
  window.loadTeacherCommentsForGroup(lessonId);
};

window.toggleTeacherCommentLike = async function toggleTeacherCommentLike(lessonId, commentId, likedByMe) {
  const userId = window.currentUser.id;
  if (likedByMe) {
    await window._supabase.from('resource_comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
  } else {
    const { error } = await window._supabase.from('resource_comment_likes').insert({ comment_id: commentId, user_id: userId });
    if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    window.checkCommentAuthorBadges?.(commentId);
  }
  window.loadTeacherCommentsForGroup(lessonId);
};

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
  const isZip = editing ? ZIP_RESOURCE_TYPES.has(editing.content_type) : false;
  const isQuiz = editing ? editing.content_type === 'quiz' : false;
  const isFileType = isZip; // el quiz no usa URL/archivo, tiene su propio builder

  window._quizBuilderQuestions = isQuiz ? (editing.quiz_data || []).map(q => ({ ...q, _id: crypto.randomUUID() })) : [];

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn overflow-y-auto';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-8 shadow-2xl animate-slideUp my-6">
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
            <option value="html5">Aplicación HTML5 (.zip -- sin nota automática)</option>
            <option value="quiz">Quiz (preguntas -- con nota automática)</option>
            <option value="tinkercad">Tinkercad (abre el diseño en pestaña nueva)</option>
          </select>
        </div>
        <div id="resource-source-mode-wrap">
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Origen</label>
          <select id="resource-source-mode" class="input-field-tw h-11 text-sm" onchange="window.toggleResourceSourceField()">
            <option value="url">Link (YouTube, Drive con acceso público, etc.)</option>
            <option value="file">Subir archivo (funciona offline, no depende de un link externo)</option>
          </select>
        </div>`}
        <div id="resource-source-url-wrap" class="${isFileType || isQuiz ? 'hidden' : ''}">
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">URL *</label>
          <input type="text" id="resource-url" placeholder="https://..." class="input-field-tw h-11 text-sm" value="${editing && !isFileType && !isQuiz ? window.sanitizeAttr(editing.content_url || '') : ''}">
        </div>
        ${editing && isZip ? '<p class="text-[0.65rem] text-slate-400"><i class="fas fa-circle-info"></i> El archivo del paquete no se puede reemplazar acá -- borrá el recurso y creá uno nuevo si necesitás subir otro paquete.</p>' : !isQuiz ? `
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
        </div>` : ''}
        <div id="resource-quiz-builder-wrap" class="${isQuiz ? '' : 'hidden'} space-y-3">
          <div id="quiz-builder-list" class="space-y-3"></div>
          <div class="grid grid-cols-2 gap-2">
            ${Object.entries(QUIZ_QUESTION_TYPE_LABEL).map(([type, label]) => `
              <button type="button" class="btn-secondary-tw h-10 text-[0.65rem] uppercase font-bold" onclick="window.addQuizQuestion('${type}')"><i class="fas fa-plus"></i> ${label}</button>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="flex gap-3 mt-8">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-save-resource" onclick="window.saveResource('${courseId}', '${editing ? editing.id : ''}')">${editing ? 'Guardar Cambios' : 'Agregar'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  if (isQuiz) window.renderQuizBuilder();
  if (!editing) {
    attachFormDraftAutosave(modal, `px_draft_resource_${courseId}`, ['resource-title', 'resource-url', 'resource-type', 'resource-source-mode']);
    window.toggleResourceSourceField();
  }
}

window.toggleResourceSourceField = function toggleResourceSourceField() {
  const type = document.getElementById('resource-type')?.value;
  const isZipType = ZIP_RESOURCE_TYPES.has(type);
  const isQuiz = type === 'quiz';
  const sourceMode = document.getElementById('resource-source-mode')?.value || 'url';

  document.getElementById('resource-source-mode-wrap')?.classList.toggle('hidden', isZipType || isQuiz);
  document.getElementById('resource-source-file-wrap')?.classList.toggle('hidden', !isZipType);
  document.getElementById('resource-quiz-builder-wrap')?.classList.toggle('hidden', !isQuiz);
  if (isQuiz) window.renderQuizBuilder();

  const showUrl = !isZipType && !isQuiz && sourceMode === 'url';
  const showSingleFile = !isZipType && !isQuiz && sourceMode === 'file';
  document.getElementById('resource-source-url-wrap')?.classList.toggle('hidden', !showUrl);
  document.getElementById('resource-source-singlefile-wrap')?.classList.toggle('hidden', !showSingleFile);

  const singleFileInput = document.getElementById('resource-single-file');
  if (singleFileInput) singleFileInput.accept = SINGLEFILE_ACCEPT_BY_TYPE[type] || '';
}

// ================================================
// QUIZ BUILDER -- preguntas de opción múltiple, V/F, número, rango y texto
// ================================================
window.addQuizQuestion = function addQuizQuestion(type) {
  const q = { _id: crypto.randomUUID(), type, question: '' };
  if (type === 'mc') { q.options = ['', '']; q.correctIndex = 0; }
  if (type === 'tf') { q.correctBool = true; }
  if (type === 'number') { q.correctNumber = 0; q.tolerance = 0; }
  if (type === 'range') { q.min = 0; q.max = 10; }
  window._quizBuilderQuestions.push(q);
  window.renderQuizBuilder();
}

window.removeQuizQuestion = function removeQuizQuestion(id) {
  window._quizBuilderQuestions = window._quizBuilderQuestions.filter(q => q._id !== id);
  window.renderQuizBuilder();
}

window.updateQuizQuestionField = function updateQuizQuestionField(id, field, value) {
  const q = window._quizBuilderQuestions.find(q => q._id === id);
  if (q) q[field] = value;
}

window.updateQuizOption = function updateQuizOption(id, optIndex, value) {
  const q = window._quizBuilderQuestions.find(q => q._id === id);
  if (q) q.options[optIndex] = value;
}

window.addQuizOption = function addQuizOption(id) {
  const q = window._quizBuilderQuestions.find(q => q._id === id);
  if (q) { q.options.push(''); window.renderQuizBuilder(); }
}

window.renderQuizBuilder = function renderQuizBuilder() {
  const list = document.getElementById('quiz-builder-list');
  if (!list) return;
  const sanitizeAttr = window.sanitizeAttr || ((v) => v);
  list.innerHTML = (window._quizBuilderQuestions || []).map((q, i) => `
    <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-2">
      <div class="flex justify-between items-center">
        <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest">${i + 1}. ${QUIZ_QUESTION_TYPE_LABEL[q.type]}</span>
        <button type="button" class="text-rose-500 hover:text-rose-600" onclick="window.removeQuizQuestion('${q._id}')"><i class="fas fa-trash-alt text-xs"></i></button>
      </div>
      <input type="text" class="input-field-tw h-10 text-sm" placeholder="Pregunta" value="${sanitizeAttr(q.question || '')}" onchange="window.updateQuizQuestionField('${q._id}', 'question', this.value)">
      ${q.type === 'mc' ? `
        <div class="space-y-1.5">
          ${q.options.map((opt, oi) => `
            <div class="flex items-center gap-2">
              <input type="radio" name="mc-correct-${q._id}" ${q.correctIndex === oi ? 'checked' : ''} onchange="window.updateQuizQuestionField('${q._id}', 'correctIndex', ${oi})">
              <input type="text" class="input-field-tw h-9 text-xs flex-1" placeholder="Opción ${oi + 1}" value="${sanitizeAttr(opt)}" onchange="window.updateQuizOption('${q._id}', ${oi}, this.value)">
            </div>
          `).join('')}
          <button type="button" class="text-[0.6rem] font-bold text-primary uppercase" onclick="window.addQuizOption('${q._id}')"><i class="fas fa-plus"></i> Agregar opción</button>
        </div>
      ` : ''}
      ${q.type === 'tf' ? `
        <select class="input-field-tw h-9 text-xs" onchange="window.updateQuizQuestionField('${q._id}', 'correctBool', this.value === 'true')">
          <option value="true" ${q.correctBool ? 'selected' : ''}>Verdadero</option>
          <option value="false" ${!q.correctBool ? 'selected' : ''}>Falso</option>
        </select>
      ` : ''}
      ${q.type === 'number' ? `
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-[0.55rem] font-bold uppercase text-slate-400 tracking-wide mb-1 block">Respuesta correcta</label>
            <input type="number" class="input-field-tw h-9 text-xs" value="${q.correctNumber}" onchange="window.updateQuizQuestionField('${q._id}', 'correctNumber', parseFloat(this.value) || 0)">
          </div>
          <div>
            <label class="text-[0.55rem] font-bold uppercase text-slate-400 tracking-wide mb-1 block">Tolerancia (+/-)</label>
            <input type="number" class="input-field-tw h-9 text-xs" value="${q.tolerance}" onchange="window.updateQuizQuestionField('${q._id}', 'tolerance', parseFloat(this.value) || 0)">
          </div>
        </div>
        <p class="text-[0.6rem] text-slate-400 mt-1"><i class="fas fa-circle-info"></i> Dejá tolerancia en 0 si solo aceptás la respuesta exacta.</p>
      ` : ''}
      ${q.type === 'range' ? `
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-[0.55rem] font-bold uppercase text-slate-400 tracking-wide mb-1 block">Mínimo válido</label>
            <input type="number" class="input-field-tw h-9 text-xs" value="${q.min}" onchange="window.updateQuizQuestionField('${q._id}', 'min', parseFloat(this.value) || 0)">
          </div>
          <div>
            <label class="text-[0.55rem] font-bold uppercase text-slate-400 tracking-wide mb-1 block">Máximo válido</label>
            <input type="number" class="input-field-tw h-9 text-xs" value="${q.max}" onchange="window.updateQuizQuestionField('${q._id}', 'max', parseFloat(this.value) || 0)">
          </div>
        </div>
      ` : ''}
      ${q.type === 'text' ? `<p class="text-[0.6rem] text-slate-400"><i class="fas fa-circle-info"></i> Se califica manualmente -- no suma a la nota automática.</p>` : ''}
    </div>
  `).join('') || '<p class="text-[0.65rem] text-slate-400 text-center py-4">Agregá al menos una pregunta.</p>';
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

function validateQuizQuestions(questions) {
  if (!questions?.length) return 'Agregá al menos una pregunta';
  for (const q of questions) {
    if (!q.question?.trim()) return 'Todas las preguntas necesitan un enunciado';
    if (q.type === 'mc' && (!q.options || q.options.filter(o => o.trim()).length < 2)) return 'Las preguntas de opción múltiple necesitan al menos 2 opciones';
  }
  return null;
}

window.saveResource = async function saveResource(courseId, editingId) {
  const title = document.getElementById('resource-title')?.value.trim();
  let content_type = document.getElementById('resource-type')?.value;
  const isZip = ZIP_RESOURCE_TYPES.has(content_type);
  const isQuiz = content_type === 'quiz';
  const isFileType = isZip || isQuiz;
  const sourceMode = document.getElementById('resource-source-mode')?.value || 'url';
  const isSingleFileUpload = !isFileType && sourceMode === 'file';
  const content_url = document.getElementById('resource-url')?.value.trim();
  const file = document.getElementById('resource-file')?.files?.[0];
  const singleFile = document.getElementById('resource-single-file')?.files?.[0];
  const btn = document.getElementById('btn-save-resource');
  const progressEl = document.getElementById('resource-upload-progress');

  if (!title) return window.showToast('<i class="fas fa-circle-xmark"></i> Ponele un título', 'error');
  if (!isFileType && !isSingleFileUpload && !content_url) return window.showToast('<i class="fas fa-circle-xmark"></i> Completa la URL', 'error');
  // Un link de curso se abre embebido (iframe) o directo en la pestaña del
  // alumno -- sin esto, una cuenta docente comprometida (o un error de
  // tipeo) podía apuntar a cualquier sitio, incluido uno de phishing
  // disfrazado de recurso de clase.
  if (!isFileType && !isSingleFileUpload && content_url && !window.isAllowedContentHost(content_url)) {
    return window.showToast('<i class="fas fa-circle-xmark"></i> Ese link no es de un sitio permitido (YouTube, Drive, Tinkercad o archivos subidos a la plataforma)', 'error');
  }
  if (isSingleFileUpload && !singleFile) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí un archivo', 'error');
  if (isQuiz) {
    const quizErr = validateQuizQuestions(window._quizBuilderQuestions);
    if (quizErr) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + quizErr, 'error');
  }

  btn.disabled = true;

  const course = window._managingCourse;

  if (editingId) {
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    const update = { title };
    if (isQuiz) {
      update.quiz_data = window._quizBuilderQuestions.map(({ _id, ...q }) => q);
    } else if (!isZip) {
      update.content_url = content_url;
    }
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

  if (isZip && !file) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí un archivo .zip', 'error');

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
    } else if (isZip) {
      if (progressEl) progressEl.classList.remove('hidden');
      contentPath = `lessons/${lessonId}`;
      const uploaded = await window.extractAndUploadPackage(file, contentPath, (msg) => {
        if (progressEl) progressEl.textContent = msg;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${msg}`;
      });

      // Muchos exportadores (Genially, Lumi, etc.) empaquetan H5P DENTRO
      // de un SCORM real (traen imsmanifest.xml + SCORM_API_wrapper.js).
      // Se detecta el tipo real del paquete leyendo su contenido (manifiesto
      // > h5p.json > index.html) sin importar qué eligió el docente en el
      // dropdown -- evita que quede mal etiquetado y sin reproducirse.
      if (uploaded.packageType === 'scorm') {
        content_type = 'scorm';
        finalUrl = uploaded.entryUrl;
      } else if (uploaded.packageType === 'h5p') {
        content_type = 'h5p';
        finalUrl = uploaded.baseUrl; // H5P nativo necesita la carpeta base, no un archivo puntual
      } else if (uploaded.packageType === 'html5') {
        content_type = 'html5';
        finalUrl = uploaded.entryUrl;
      } else {
        throw new Error('No se encontró un archivo de entrada reconocible en el paquete (imsmanifest.xml, h5p.json o index.html).');
      }
    }

    const nextOrder = (window._managingCourseLessons || []).reduce((max, l) => Math.max(max, l.order_index), -1) + 1;

    const { data: newLesson, error } = await window._supabase.from('lessons').insert({
      id: lessonId,
      title,
      content_type,
      content_url: isQuiz ? null : finalUrl,
      content_path: contentPath,
      quiz_data: isQuiz ? window._quizBuilderQuestions.map(({ _id, ...q }) => q) : null,
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

  // Un .h5p "standalone" válido trae adentro TODAS las librerías que declara,
  // Y las que ESAS librerías a su vez necesitan (dependencias anidadas --
  // ej. H5P.DragText depende de H5P.JoubelUI, que depende de FontAwesome).
  // Algunos exportadores (ciertos modos de Genially/Lumi) asumen que esas
  // librerías ya viven en un servidor H5P con Hub, cosa que nuestro
  // reproductor standalone no tiene. Si falta alguna en cualquier nivel,
  // mejor avisar ANTES de subir nada (si no, el alumno ve "no se pudo
  // cargar el reproductor" sin explicación).
  const h5pJsonEntry = entries.find(e => /(^|\/)h5p\.json$/i.test(e.name) && !e.name.includes('/content/'));
  if (h5pJsonEntry) {
    try {
      const h5pJson = JSON.parse(await h5pJsonEntry.async('text'));
      const entryByName = new Map(entries.map(e => [e.name, e]));
      const folderNames = new Set([...entryByName.keys()].map(n => n.split('/')[0]));

      const visited = new Set();
      const missing = new Set();
      async function visitLib(dep) {
        const folder = `${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}`;
        if (visited.has(folder)) return;
        visited.add(folder);
        if (!folderNames.has(folder)) { missing.add(folder); return; }
        const libJsonEntry = entryByName.get(`${folder}/library.json`);
        if (!libJsonEntry) { missing.add(`${folder}/library.json`); return; }
        let libJson;
        try { libJson = JSON.parse(await libJsonEntry.async('text')); } catch { return; }
        const subDeps = [...(libJson.preloadedDependencies || []), ...(libJson.dynamicDependencies || [])];
        for (const d of subDeps) await visitLib(d);
      }
      for (const dep of (h5pJson.preloadedDependencies || [])) await visitLib(dep);

      if (missing.size) {
        throw new Error(`El archivo .h5p no trae las librerías que necesita (${[...missing].join(', ')}). Volvé a exportarlo asegurándote de incluir "todas las librerías" / "standalone" -- si no, el contenido no va a reproducirse.`);
      }
    } catch (e) {
      if (e.message.includes('librerías')) throw e;
      console.warn('No se pudo validar h5p.json:', e);
    }
  }

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
    if (error) {
      if (/maximum allowed size/i.test(error.message)) {
        const sizeMb = (blob.size / (1024 * 1024)).toFixed(1);
        throw new Error(`"${entry.name}" pesa ${sizeMb}MB y supera el límite de tamaño de archivo del proyecto. Comprimí ese archivo (usualmente un video) antes de volver a exportar el paquete, o pedile al admin que suba el límite en el panel de Supabase (Project Settings > Storage).`);
      }
      throw new Error(`Error subiendo ${entry.name}: ${error.message}`);
    }
    uploaded++;
    if (onProgress) onProgress(`Subiendo archivos... (${uploaded}/${entries.length})`);

    if (/(^|\/)imsmanifest\.xml$/i.test(entry.name)) {
      manifestXml = await entry.async('text');
    }
  }

  const { data: { publicUrl: baseUrl } } = _supabase.storage.from(LESSON_STORAGE_BUCKET).getPublicUrl(basePath);

  let entryUrl = null;
  let packageType = null;
  if (manifestXml) {
    packageType = 'scorm';
    try {
      const doc = new DOMParser().parseFromString(manifestXml, 'text/xml');
      const resource = doc.querySelector('resources > resource[href]') || doc.querySelector('resource[href]');
      const href = resource?.getAttribute('href');
      if (href) {
        // Supabase Storage fuerza text/plain + CSP sandbox en cualquier
        // .html público (anti-XSS de la plataforma, no configurable) --
        // el .js/.css del paquete sí cargan bien, pero el .html de entrada
        // nunca ejecuta su propio script así. Se sirve vía un proxy que
        // re-envía ESE archivo con headers normales (ver
        // serve-scorm-entry); el resto de los assets del paquete siguen
        // resolviendo directo a Storage gracias al <base href> que inyecta.
        const [hrefPath, hrefQuery] = href.split('?');
        const objectPath = `${basePath}/${hrefPath}`;
        entryUrl = `${window.SUPABASE_URL}/functions/v1/serve-scorm-entry?path=${encodeURIComponent(objectPath)}${hrefQuery ? `&${hrefQuery}` : ''}`;
      }
    } catch (e) {
      console.warn('No se pudo leer imsmanifest.xml:', e);
    }
  } else if (h5pJsonEntry) {
    packageType = 'h5p';
  } else {
    // Aplicación HTML5 genérica (Genially, exports de IA, etc.) -- sin
    // manifiesto ni h5p.json, solo un index.html + assets relativos. Se
    // busca en cualquier nivel del paquete (suele venir dentro de una
    // carpeta contenedora) y se sirve por el mismo proxy que SCORM, por la
    // misma razón (Storage fuerza text/plain en .html público).
    const indexEntry = entries.find(e => /(^|\/)index\.html?$/i.test(e.name));
    if (indexEntry) {
      packageType = 'html5';
      const objectPath = `${basePath}/${indexEntry.name}`;
      entryUrl = `${window.SUPABASE_URL}/functions/v1/serve-scorm-entry?path=${encodeURIComponent(objectPath)}`;
    }
  }

  return { baseUrl: baseUrl.endsWith('/') ? baseUrl : baseUrl + '/', entryUrl, packageType };
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

  // Los likes/feedback son un extra -- si course_feedback todavía no existe
  // (migración pendiente) o falla por lo que sea, no debe tumbar TODA la
  // biblioteca, solo mostrarse sin esa parte.
  if (courses?.length) {
    try {
      const courseIds = courses.map(c => c.id);
      const { data: feedback } = await _supabase.from('course_feedback').select('course_id, liked, teacher_id').in('course_id', courseIds);
      const byCourse = new Map();
      (feedback || []).forEach(f => {
        if (!byCourse.has(f.course_id)) byCourse.set(f.course_id, []);
        byCourse.get(f.course_id).push(f);
      });
      courses.forEach(c => { c.course_feedback = byCourse.get(c.id) || []; });
    } catch (e) {
      courses.forEach(c => { c.course_feedback = []; });
    }
  }
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
  const feedback = c.course_feedback || [];
  const likes = feedback.filter(f => f.liked).length;
  const likedByMe = feedback.some(f => f.teacher_id === window.currentUser?.id && f.liked);
  return `
    <div class="glass-card p-4 flex flex-col gap-3">
      <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><i class="fas fa-book-open"></i></div>
          <div class="min-w-0 flex-1">
            <h4 class="text-sm font-bold text-slate-800 dark:text-white truncate">${window.sanitizeInput(c.title)}</h4>
            <p class="text-[0.7rem] text-slate-400 truncate">${c.lessons?.length || 0} recurso(s) · por ${window.sanitizeInput(c.teachers?.full_name || 'Docente')} · ${window.sanitizeInput(c.schools?.name || c.school_code)}</p>
            ${c.tags?.length ? `<div class="flex flex-wrap gap-1 mt-1.5">${c.tags.map(t => `<span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[0.55rem] font-bold text-slate-500 uppercase">${window.sanitizeInput(t)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
        <button class="btn-primary-tw h-9 px-4 text-[0.65rem] uppercase font-bold shrink-0 sm:ml-auto" onclick="window.openCopyCourseModal('${c.id}')"><i class="fas fa-copy"></i> Copiar a mi clase</button>
      </div>
      <div class="flex items-center gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button class="flex items-center gap-1.5 text-xs font-bold ${likedByMe ? 'text-rose-500' : 'text-slate-400 hover:text-rose-400'}" onclick="window.toggleCourseLike('${c.id}')"><i class="fa${likedByMe ? 's' : 'r'} fa-heart"></i>${likes ? ' ' + likes : ''}</button>
        <button class="text-xs font-bold text-slate-400 hover:text-primary" onclick="window.openCourseFeedbackModal('${c.id}', '${window.sanitizeAttr(c.title)}')"><i class="fas fa-comment-dots"></i> Feedback</button>
      </div>
    </div>
  `;
}

window.toggleCourseLike = async function toggleCourseLike(courseId) {
  const _supabase = window._supabase;
  const teacherId = window.currentUser.id;

  const { data: existing } = await _supabase.from('course_feedback')
    .select('id, liked').eq('course_id', courseId).eq('teacher_id', teacherId).maybeSingle();

  const { error } = existing
    ? await _supabase.from('course_feedback').update({ liked: !existing.liked }).eq('id', existing.id)
    : await _supabase.from('course_feedback').insert({ course_id: courseId, teacher_id: teacherId, liked: true });

  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  window.openSharedCoursesLibrary();
};

window.openCourseFeedbackModal = function openCourseFeedbackModal(courseId, title) {
  document.getElementById('course-feedback-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'course-feedback-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-6 animate-slideUp">
      <h3 class="text-sm font-black text-slate-800 dark:text-white mb-1">Feedback para "${window.sanitizeInput(title)}"</h3>
      <p class="text-[0.65rem] text-slate-400 mb-4">Le va a llegar al docente que compartió este curso.</p>
      <textarea id="course-feedback-input" class="input-field-tw text-sm" rows="4" placeholder="¿Qué te pareció este curso?"></textarea>
      <div class="flex gap-3 mt-4">
        <button class="flex-1 btn-secondary-tw h-10 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="flex-[2] btn-primary-tw h-10 text-xs uppercase font-bold" onclick="window.submitCourseFeedback('${courseId}')"><i class="fas fa-paper-plane"></i> Enviar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.submitCourseFeedback = async function submitCourseFeedback(courseId) {
  const input = document.getElementById('course-feedback-input');
  const content = input?.value.trim();
  if (!content) return;

  const { error } = await window._supabase.from('course_feedback').upsert({
    course_id: courseId,
    teacher_id: window.currentUser.id,
    feedback: content,
  }, { onConflict: 'course_id,teacher_id' });

  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  window.showToast('<i class="fas fa-circle-check"></i> Feedback enviado', 'success');
  document.getElementById('course-feedback-modal')?.remove();
};

// El docente creador ve el feedback que le dejaron sobre SU curso compartido.
window.openCourseFeedbackInbox = async function openCourseFeedbackInbox(courseId, title) {
  document.getElementById('course-feedback-inbox-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'course-feedback-inbox-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md max-h-[80vh] flex flex-col p-6 animate-slideUp">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-sm font-black text-slate-800 dark:text-white">Feedback de "${window.sanitizeInput(title)}"</h3>
        <button class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 flex items-center justify-center shrink-0" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div id="course-feedback-inbox-list" class="space-y-2 overflow-y-auto custom-scrollbar">
        <div class="text-center text-slate-400 text-xs py-6"><i class="fas fa-spinner fa-spin"></i></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const { data: rows, error } = await window._supabase.from('course_feedback')
    .select('liked, feedback, created_at, teachers(full_name)').eq('course_id', courseId)
    .order('created_at', { ascending: false });

  const listEl = document.getElementById('course-feedback-inbox-list');
  if (error) { listEl.innerHTML = `<p class="text-rose-500 text-xs">${error.message}</p>`; return; }

  const likesCount = (rows || []).filter(r => r.liked).length;
  const withText = (rows || []).filter(r => r.feedback);

  listEl.innerHTML = `
    <p class="text-xs font-bold text-slate-500 mb-3"><i class="fas fa-heart text-rose-500"></i> ${likesCount} like(s)</p>
    ${withText.length ? withText.map(r => `
      <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs">
        <span class="font-bold text-slate-600 dark:text-slate-300">${window.sanitizeInput(r.teachers?.full_name || 'Docente')}</span>
        <p class="text-slate-500 dark:text-slate-400 mt-0.5">${window.sanitizeInput(r.feedback)}</p>
      </div>
    `).join('') : '<p class="text-xs text-slate-400">Todavía no hay comentarios de texto.</p>'}
  `;
};

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
      quiz_data: l.quiz_data,
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

  const cacheKey = `student_courses_${currentUser.id}`;
  let courses, completions, fromCache = false;

  const [coursesRes, completionsRes] = await Promise.all([
    _supabase.from('courses').select('*, lessons(*)')
      .eq('school_code', userData.school_code).eq('grade', userData.grade).eq('section', userData.section)
      .order('created_at', { ascending: false }),
    _supabase.from('lesson_completions').select('lesson_id, score, status').eq('student_id', currentUser.id),
  ]).catch(() => [{ data: null, error: { message: 'offline' } }, { data: null }]);

  if (coursesRes?.error || !coursesRes?.data) {
    // Sin conexión (o el fetch tiró) -- se usa la última copia de cursos
    // vista con internet, guardada la vez anterior que esto sí funcionó.
    const cached = await window._syncManager?.getCache(cacheKey);
    if (cached) {
      courses = cached.courses;
      completions = cached.completions;
      fromCache = true;
    } else {
      container.innerHTML = `<p class="text-rose-500 text-xs">Error: ${coursesRes?.error?.message || 'No se pudo cargar'}</p>`;
      return;
    }
  } else {
    courses = coursesRes.data;
    completions = completionsRes?.data;
    window._syncManager?.setCache(cacheKey, { courses, completions });
  }

  if (!courses?.length) { container.innerHTML = '<div class="glass-card p-10 text-center text-slate-400 text-sm">Tu docente todavía no publicó cursos.</div>'; return; }

  const completionsByLesson = new Map((completions || []).map(c => [c.lesson_id, c]));
  window._coursesCache = courses;
  window._completionsCache = completionsByLesson;

  // Si hay progreso encolado (avanzaste/completaste algo sin red), se ofrece
  // el mismo relevo QR que ya existe para asistencia (KolibriSync) -- el
  // docente lo escanea con SU teléfono y sube todo cuando llegue a internet.
  const pendingQueueCount = window._syncManager ? await window._syncManager.getQueueCount() : 0;

  container.innerHTML = `
    ${fromCache ? `<div class="glass-card p-3 mb-4 border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex flex-col sm:flex-row sm:items-center gap-2">
      <div class="flex items-center gap-2 grow"><i class="fas fa-cloud-slash"></i> Sin conexión -- viendo la última versión guardada. El progreso que ya viste offline vuelve a estar disponible; nuevos cursos/recursos aparecen al reconectar.</div>
      ${pendingQueueCount > 0 ? `<button onclick="KolibriSync.openSyncCenter()" class="shrink-0 h-8 px-3 rounded-lg bg-amber-500 text-white text-[0.65rem] font-bold uppercase whitespace-nowrap"><i class="fas fa-qrcode"></i> Generar código de entrega (${pendingQueueCount})</button>` : ''}
    </div>` : ''}
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
          ${c.tinkercad_class_url ? `
          <a href="${window.sanitizeAttr(c.tinkercad_class_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="mt-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[0.65rem] font-bold uppercase">
            <i class="fas fa-microchip"></i> Clase de Tinkercad
          </a>` : ''}
          ${window.isCourseDownloadedOffline(c.id) ? `
          <div class="mt-1 flex items-center gap-1.5">
            <div class="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 text-[0.65rem] font-bold uppercase">
              <i class="fas fa-circle-check"></i> Listo offline
            </div>
            <button id="btn-clear-course-${c.id}" onclick="event.stopPropagation(); window.clearCourseOffline('${c.id}')" title="Liberar espacio offline" class="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/10 hover:text-rose-500 text-slate-400"><i class="fas fa-trash-alt text-xs"></i></button>
          </div>` : `
          <button id="btn-download-course-${c.id}" onclick="event.stopPropagation(); window.downloadCourseOffline('${c.id}')" class="mt-1 flex items-center justify-center gap-1.5 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 text-[0.65rem] font-bold uppercase">
            <i class="fas fa-download"></i> Descargar para offline
          </button>`}
        </div>
      `;
      }).join('')}
    </div>
  `;
}

// Precarga los archivos de un curso (video/PDF/imagen/paquete SCORM-H5P) en
// el caché del service worker para que funcione sin internet -- antes
// solo se cacheaba lo que el alumno YA había abierto (cache oportunista),
// sin forma de preparar un curso de antemano para la clase de mañana.
window.isCourseDownloadedOffline = function isCourseDownloadedOffline(courseId) {
  const set = JSON.parse(localStorage.getItem('PX_OFFLINE_COURSES') || '[]');
  return set.includes(courseId);
};

// Lista TODOS los archivos de una carpeta de Storage, recursivo -- .list()
// del SDK solo devuelve un nivel; un paquete H5P trae carpetas de librería
// anidadas (H5P.DragText/, que depende de H5P.JoubelUI/, etc.), así que sin
// esto solo se cacheaba el archivo de entrada y el resto del paquete
// (JS/CSS/assets de esas librerías) seguía necesitando red.
async function listStorageFilesRecursive(bucket, path) {
  const { data, error } = await window._supabase.storage.from(bucket).list(path, { limit: 1000 });
  if (error || !data) return [];
  let files = [];
  for (const item of data) {
    const itemPath = `${path}/${item.name}`;
    if (item.id === null) {
      // "Carpeta" en Storage: el SDK las marca con id null (no son un
      // archivo real, solo un prefijo con más contenido adentro).
      files = files.concat(await listStorageFilesRecursive(bucket, itemPath));
    } else {
      files.push(itemPath);
    }
  }
  return files;
}

// Recursos simples (video/PDF/imagen) solo necesitan su content_url. Los
// paquetes SCORM/H5P/HTML5 (content_path) hay que bajarlos COMPLETOS -- el
// entry file por sí solo no alcanza para que funcionen offline. Compartida
// entre descargar y liberar espacio para que ambas vean EXACTAMENTE los
// mismos archivos.
//
// También separa cuáles son "críticos": el archivo de entrada de cada
// lección (h5p.json para H5P, o el content_url directo para video/PDF/
// SCORM/HTML5) -- si ESE puntual falla, la lección entera no arranca
// aunque el 99% del resto de la librería sí haya bajado bien. El umbral
// general de "listo offline" no distinguía esto: un curso con miles de
// archivos podía superar el 90% de éxito y aun así tener rota la lección
// que justo perdió su archivo de entrada.
async function getCourseOfflineUrls(course) {
  const simpleLessons = (course.lessons || []).filter(l => l.content_url && !l.content_path);
  const packageLessons = (course.lessons || []).filter(l => l.content_path);

  const criticalUrls = new Set(simpleLessons.map(l => l.content_url));
  let packageUrls = [];
  for (const lesson of packageLessons) {
    const files = await listStorageFilesRecursive(LESSON_STORAGE_BUCKET, lesson.content_path);
    const urls = files.map(f => window._supabase.storage.from(LESSON_STORAGE_BUCKET).getPublicUrl(f).data.publicUrl);
    packageUrls.push(...urls);

    if (lesson.content_type === 'h5p') {
      const entryUrl = urls.find(u => u.endsWith('/h5p.json'));
      if (entryUrl) criticalUrls.add(entryUrl);
    } else if (lesson.content_url) {
      criticalUrls.add(lesson.content_url);
    }
  }

  return { allUrls: [...simpleLessons.map(l => l.content_url), ...packageUrls], criticalUrls };
}

function refreshLessonsContainer() {
  if (typeof window.loadStudentCourses !== 'function') return;
  const container = document.getElementById('lessons-container');
  if (container) window.loadStudentCourses(container);
}

window.downloadCourseOffline = async function downloadCourseOffline(courseId) {
  const course = (window._coursesCache || []).find(c => c.id === courseId);
  if (!course) return;
  const btn = document.getElementById(`btn-download-course-${courseId}`);

  if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparando...';
  const { allUrls, criticalUrls } = await getCourseOfflineUrls(course);

  let done = 0, ok = 0;
  const failedCritical = new Set();
  const setProgress = () => {
    const pct = allUrls.length ? Math.round((done / allUrls.length) * 100) : 100;
    if (btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Descargando ${pct}% (${done}/${allUrls.length})`;
  };
  setProgress();

  // Un paquete H5P trae SU librería completa, y varias piezas de contenido
  // suelen compartir las mismas librerías (H5P.JoubelUI, FontAwesome, etc.)
  // -- sin este chequeo se volvían a bajar de red los mismos archivos una y
  // otra vez por cada lección. Cursos con miles de archivos chicos (H5P)
  // tardaban muchísimo en serie -- ahora van 16 en paralelo. Los archivos
  // CRÍTICOS (h5p.json, content_url) reintentan más veces -- perder uno de
  // esos rompe la lección entera aunque el resto de la librería sí baje.
  const mediaCache = await caches.open('projectx-media-v1');
  const CONCURRENCY = 16;
  let cursor = 0;

  async function fetchWithRetry(url, retries) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url);
        if (res.ok) return true;
      } catch (e) { /* sigue al siguiente intento */ }
    }
    return false;
  }

  async function worker() {
    while (cursor < allUrls.length) {
      const url = allUrls[cursor++];
      const isCritical = criticalUrls.has(url);
      const cached = await mediaCache.match(url);
      if (cached || await fetchWithRetry(url, isCritical ? 5 : 2)) {
        ok++;
      } else if (isCritical) {
        failedCritical.add(url);
      }
      done++;
      setProgress();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allUrls.length) }, worker));

  const successPct = allUrls.length ? (ok / allUrls.length) * 100 : 100;
  const DOWNLOAD_OK_THRESHOLD = 90;

  // Un curso puede superar el 90% general y AUN ASÍ tener rota una lección
  // puntual si justo el archivo de entrada de ESA lección falló -- por eso
  // failedCritical bloquea "listo offline" sin importar el % general.
  if (successPct < DOWNLOAD_OK_THRESHOLD || failedCritical.size > 0) {
    const msg = failedCritical.size > 0
      ? `No se pudieron descargar ${failedCritical.size} recurso(s) clave -- esas lecciones no van a funcionar offline. Probá de nuevo con mejor señal.`
      : `Solo se descargaron ${ok}/${allUrls.length} archivos -- probá de nuevo con mejor señal antes de confiar en que funcione offline.`;
    window.showToast(`<i class="fas fa-triangle-exclamation"></i> ${msg}`, 'error');
    if (btn) btn.innerHTML = '<i class="fas fa-download"></i> Reintentar descarga';
    return;
  }

  const set = new Set(JSON.parse(localStorage.getItem('PX_OFFLINE_COURSES') || '[]'));
  set.add(courseId);
  localStorage.setItem('PX_OFFLINE_COURSES', JSON.stringify([...set]));

  window.showToast('<i class="fas fa-circle-check"></i> Curso listo para usar sin internet', 'success');
  refreshLessonsContainer();
};

// "Liberar espacio offline" -- en tablets escolares (poco storage) un
// alumno puede haber descargado varios cursos a lo largo del año sin
// forma de sacarlos del caché salvo borrando datos del navegador entero.
window.clearCourseOffline = async function clearCourseOffline(courseId) {
  const course = (window._coursesCache || []).find(c => c.id === courseId);
  if (!course) return;
  if (!confirm('¿Borrar la copia offline de este curso? Vas a necesitar internet de nuevo para verlo hasta que lo descargues otra vez.')) return;

  const btn = document.getElementById(`btn-clear-course-${courseId}`);
  if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const { allUrls: urls } = await getCourseOfflineUrls(course);
    // 'projectx-media-v1' tiene que ser el MISMO nombre que MEDIA_CACHE_NAME
    // en service-worker.js -- no hay forma de importar esa constante desde
    // acá (contextos de ejecución separados), así que si algún día cambia
    // ahí, hay que actualizar este string también.
    const cache = await caches.open('projectx-media-v1');
    await Promise.all(urls.map(url => cache.delete(url)));
  } catch (e) { /* si el navegador no tiene ese caché (ej. Cache API no soportada), no hay nada que borrar */ }

  const set = new Set(JSON.parse(localStorage.getItem('PX_OFFLINE_COURSES') || '[]'));
  set.delete(courseId);
  localStorage.setItem('PX_OFFLINE_COURSES', JSON.stringify([...set]));

  window.showToast('<i class="fas fa-circle-check"></i> Espacio offline liberado', 'success');
  refreshLessonsContainer();
};

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

  // h5p-standalone acumula estado global (window.H5P/window.H5PIntegration)
  // entre instancias y se corrompe al inicializar un SEGUNDO contenido H5P
  // sin recargar la página completa -- confirmado: el primero siempre
  // carga bien, el segundo siempre falla ("tardó demasiado"), y solo
  // recargar la página lo arregla. En vez de pedirle al alumno que
  // recargue a mano (perdiendo su lugar en el curso), se recarga sola acá
  // guardando dónde estaba para volver directo a este mismo recurso.
  if (lesson.content_type === 'h5p' && window._loadedH5PLessonId && window._loadedH5PLessonId !== lesson.id) {
    sessionStorage.setItem('PX_RESUME_COURSE', JSON.stringify({ courseId: window._activeCourse.course.id, index }));
    window.location.reload();
    return;
  }
  if (lesson.content_type === 'h5p') window._loadedH5PLessonId = lesson.id;

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
  } else if (lesson.content_type === 'tinkercad') {
    // Tinkercad manda X-Frame-Options: sameorigin en casi todas sus páginas
    // (solo el link especial de "Insertar" a veces lo evita, y es difícil
    // de encontrar en la UI actual) -- en vez de pelear con el iframe, se
    // abre el diseño en pestaña nueva con el link normal que el docente
    // ya tiene a mano.
    mediaHtml = `
      <div class="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-10 flex flex-col items-center gap-4 text-center">
        <i class="fas fa-microchip text-4xl text-primary"></i>
        <p class="text-sm text-slate-500 dark:text-slate-400">Este recurso abre el diseño de Tinkercad en una pestaña nueva.</p>
        <a href="${lesson.content_url}" target="_blank" rel="noopener" class="btn-primary-tw h-11 px-6 text-xs uppercase font-bold"><i class="fas fa-up-right-from-square"></i> Abrir en Tinkercad</a>
      </div>`;
  } else if (lesson.content_type === 'scorm') {
    // src="" (no srcdoc) hacía una navegación HTTP normal al proxy --
    // Supabase pisa el Content-Type a text/plain + CSP sandbox en CUALQUIER
    // respuesta que sirva HTML a un cliente, sea de Storage o de una edge
    // function (política de la plataforma, no algo que el proxy pueda
    // evitar seteando sus propios headers). Encima el iframe quedaba en el
    // origen de Supabase, distinto al de esta app, así que window.parent.API
    // (donde SCORM busca la API de notas) tampoco era alcanzable por
    // política de mismo origen. Cargar el HTML por fetch() y meterlo con
    // srcdoc resuelve ambos problemas de una: no hay navegación HTTP (no
    // aplica la política de Content-Type) y un iframe srcdoc sin atributo
    // sandbox hereda el origen del padre (SCORM_API sí es alcanzable).
    mediaHtml = `<iframe id="scorm-frame" class="w-full h-[60vh] rounded-xl border border-slate-200 dark:border-slate-700"></iframe>`;
  } else if (lesson.content_type === 'html5') {
    // Sin nota automática (no habla xAPI/SCORM API) -- se completa como
    // video/PDF, con el botón "Marcar como visto" del footer genérico.
    mediaHtml = `<iframe id="html5-frame" class="w-full h-[60vh] rounded-xl border border-slate-200 dark:border-slate-700"></iframe>`;
  } else if (lesson.content_type === 'h5p') {
    // El spinner va AFUERA de #h5p-container (h5p-standalone no siempre
    // limpia el innerHTML previo, así que si el spinner vivía adentro a
    // veces quedaba pegado tapando el video ya cargado). Se saca a mano
    // en cuanto aparece el iframe real (ver más abajo).
    mediaHtml = `<div class="relative w-full min-h-[50vh]">
      <div id="h5p-container" class="w-full min-h-[50vh]"></div>
      <div id="h5p-loading-overlay" class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-white dark:bg-slate-900 pointer-events-none">
        <i class="fas fa-circle-notch fa-spin text-3xl mb-3 text-primary"></i>
        <span class="text-xs font-bold uppercase tracking-widest">Cargando actividad H5P...</span>
      </div>
    </div>`;
  } else if (lesson.content_type === 'quiz') {
    mediaHtml = renderQuizPlayerHtml(lesson);
  }

  const viewerEl = document.getElementById('course-player-viewer');
  if (viewerEl) viewerEl.innerHTML = mediaHtml + '<div id="resource-social-panel" class="mt-6 border-t border-slate-100 dark:border-slate-800 pt-5"></div>';
  window.loadResourceSocialPanel(lesson.id);

  const footerEl = document.getElementById('course-player-footer');
  if (footerEl) {
    footerEl.innerHTML = lesson.content_type === 'quiz'
      ? ''
      : hasAutoGrade
        ? `<p id="lesson-live-score" class="text-center text-sm font-bold text-slate-500">La nota se guarda automáticamente mientras completás la actividad.</p>`
        : window._completionsCache.has(lesson.id)
          ? `<div class="text-center text-sm font-bold text-emerald-500"><i class="fas fa-circle-check"></i> Ya completaste este recurso</div>`
          : `<button class="btn-primary-tw w-full h-12 text-xs uppercase font-bold" id="btn-mark-lesson-seen" onclick="window.markLessonSeen('${lesson.id}')"><i class="fas fa-circle-check"></i> Marcar como visto</button>`;
  }

  if (lesson.content_type === 'scorm') {
    window.loadIframeViaFetch('scorm-frame', lesson.content_url);
    window.initScormSession(lesson.id);
  } else if (lesson.content_type === 'html5') {
    window.loadIframeViaFetch('html5-frame', lesson.content_url);
  } else if (lesson.content_type === 'h5p') {
    window.initH5PSession(lesson);
  }

  window.renderCourseSidebar();
}

// Construye el árbol de comentarios (top-level + respuestas anidadas) con
// like por comentario -- lo usan tanto el panel del estudiante como el del
// docente, cada uno pasando sus propios likeFn/replyFn.
window.buildResourceCommentsHtml = function buildResourceCommentsHtml(comments, likeRows, fns) {
  const sanitizeInput = window.sanitizeInput || ((v) => v);
  const currentUserId = window.currentUser?.id;

  const likesByComment = new Map();
  (likeRows || []).forEach(l => {
    if (!likesByComment.has(l.comment_id)) likesByComment.set(l.comment_id, []);
    likesByComment.get(l.comment_id).push(l.user_id);
  });

  const childrenByParent = new Map();
  const roots = [];
  const byId = new Map(comments.map(c => [c.id, c]));
  comments.forEach(c => {
    if (c.parent_id && byId.has(c.parent_id)) {
      if (!childrenByParent.has(c.parent_id)) childrenByParent.set(c.parent_id, []);
      childrenByParent.get(c.parent_id).push(c);
    } else {
      roots.push(c);
    }
  });

  const renderNode = (c) => {
    const likes = likesByComment.get(c.id) || [];
    const likedByMe = likes.includes(currentUserId);
    const kids = childrenByParent.get(c.id) || [];
    return `
      <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs">
        <span class="font-bold ${c.author_role === 'docente' ? 'text-primary' : 'text-slate-600 dark:text-slate-300'}">${sanitizeInput(c.author_name)}${c.author_role === 'docente' ? ' <i class="fas fa-chalkboard-user"></i>' : ''}</span>
        <p class="text-slate-500 dark:text-slate-400 mt-0.5">${sanitizeInput(c.content)}</p>
        ${c.attachment_url ? `<a href="${c.attachment_url}" target="_blank" rel="noopener" class="block mt-1.5">${/\.(png|jpe?g|gif|webp)$/i.test(c.attachment_url) ? `<img src="${c.attachment_url}" class="max-h-32 rounded-lg border border-slate-200 dark:border-slate-700">` : `<span class="text-[0.65rem] font-bold text-primary"><i class="fas fa-paperclip"></i> Ver archivo adjunto</span>`}</a>` : ''}
        <div class="flex items-center gap-3 mt-1.5">
          <button class="text-[0.65rem] font-bold ${likedByMe ? 'text-rose-500' : 'text-slate-400 hover:text-rose-400'}" onclick="${fns.likeFn(c.id, likedByMe)}"><i class="fa${likedByMe ? 's' : 'r'} fa-heart"></i>${likes.length ? ' ' + likes.length : ''}</button>
          <button class="text-[0.65rem] font-bold text-slate-400 hover:text-primary" onclick="window.toggleCommentReplyBox('${c.id}')"><i class="fas fa-reply"></i> Responder</button>
        </div>
        <div id="reply-box-${c.id}" class="hidden mt-2 flex gap-2 pl-3 border-l-2 border-slate-200 dark:border-slate-700">
          <input id="reply-input-${c.id}" class="input-field-tw h-8 text-xs flex-1" placeholder="Responder...">
          <button class="btn-primary-tw h-8 px-3 text-[0.65rem] uppercase font-bold shrink-0" onclick="${fns.replyFn(c.id)}"><i class="fas fa-paper-plane"></i></button>
        </div>
        ${kids.length ? `<div class="mt-2 pl-3 border-l-2 border-slate-100 dark:border-slate-800 space-y-2">${kids.map(renderNode).join('')}</div>` : ''}
      </div>
    `;
  };

  return roots.length ? roots.map(renderNode).join('') : '<p class="text-xs text-slate-400">Todavía no hay comentarios.</p>';
};

window.toggleCommentReplyBox = function toggleCommentReplyBox(commentId) {
  document.getElementById(`reply-box-${commentId}`)?.classList.toggle('hidden');
};

// Nota personal privada + comentarios de equipo por recurso (estudiante).
window.loadResourceSocialPanel = async function loadResourceSocialPanel(lessonId) {
  const panel = document.getElementById('resource-social-panel');
  if (!panel) return;
  panel.innerHTML = '<p class="text-xs text-slate-400"><i class="fas fa-spinner fa-spin"></i> Cargando notas y comentarios...</p>';

  const _supabase = window._supabase;
  const currentUser = window.currentUser;

  const [{ data: notes }, { data: memberships }] = await Promise.all([
    _supabase.from('resource_notes').select('id, content').eq('lesson_id', lessonId).eq('student_id', currentUser.id).order('created_at', { ascending: true }),
    _supabase.from('group_members').select('group_id').eq('student_id', currentUser.id),
  ]);

  const groupId = memberships?.[0]?.group_id || null;
  let comments = [];
  let likes = [];
  if (groupId) {
    const { data } = await _supabase.from('resource_comments').select('*').eq('lesson_id', lessonId).eq('group_id', groupId).order('created_at', { ascending: true });
    comments = data || [];
    const ids = comments.map(c => c.id);
    if (ids.length) {
      const { data: likeData } = await _supabase.from('resource_comment_likes').select('comment_id, user_id').in('comment_id', ids);
      likes = likeData || [];
    }
  }

  window.renderResourceSocialPanel(lessonId, notes || [], comments, groupId, likes);
};

window.renderResourceSocialPanel = function renderResourceSocialPanel(lessonId, notes, comments, groupId, likes) {
  const panel = document.getElementById('resource-social-panel');
  if (!panel) return;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const commentsHtml = groupId ? window.buildResourceCommentsHtml(comments, likes, {
    likeFn: (id, liked) => `window.toggleResourceCommentLike('${lessonId}', '${id}', ${liked})`,
    replyFn: (id) => `window.postResourceComment('${lessonId}', '${groupId}', '${id}')`,
  }) : '';

  const notesHtml = notes.length ? notes.map(n => `
    <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs">
      <p class="text-slate-600 dark:text-slate-300">${sanitizeInput(n.content)}</p>
    </div>
  `).join('') : '<p class="text-xs text-slate-400">Todavía no escribiste notas.</p>';

  panel.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div>
        <h4 class="text-xs font-black uppercase text-slate-400 tracking-widest mb-2"><i class="fas fa-note-sticky"></i> Mis notas personales</h4>
        <p class="text-[0.6rem] text-slate-400 mb-2"><i class="fas fa-lock"></i> Privadas -- solo vos las ves, nadie puede responderlas ni darles like.</p>
        <div id="resource-notes-list" class="space-y-2 max-h-52 overflow-y-auto custom-scrollbar mb-2 pr-1">${notesHtml}</div>
        <div class="flex gap-2">
          <input id="resource-note-input" class="input-field-tw h-9 text-sm flex-1" placeholder="Escribí una nota nueva...">
          <button class="btn-primary-tw h-9 px-4 text-xs uppercase font-bold shrink-0" onclick="window.postResourceNote('${lessonId}')"><i class="fas fa-paper-plane"></i></button>
        </div>
      </div>
      <div>
        <h4 class="text-xs font-black uppercase text-slate-400 tracking-widest mb-2"><i class="fas fa-comments"></i> Comentarios del equipo</h4>
        ${!groupId ? `<p class="text-xs text-slate-400">Formá parte de un equipo para comentar acá.</p>` : `
          <div id="resource-comments-list" class="space-y-2 max-h-52 overflow-y-auto custom-scrollbar mb-2 pr-1">${commentsHtml}</div>
          <div id="resource-comment-attachment-preview" class="hidden mb-2"></div>
          <div class="flex gap-2">
            <input id="resource-comment-input" class="input-field-tw h-9 text-sm flex-1" placeholder="Escribí un comentario...">
            <label class="w-9 h-9 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-primary flex items-center justify-center cursor-pointer" title="Adjuntar captura o archivo (evidencia)">
              <i class="fas fa-paperclip"></i>
              <input type="file" id="resource-comment-file" class="hidden" accept="image/*,.pdf" onchange="window.previewResourceCommentAttachment(this)">
            </label>
            <button class="btn-primary-tw h-9 px-4 text-xs uppercase font-bold shrink-0" onclick="window.postResourceComment('${lessonId}', '${groupId}', null)"><i class="fas fa-paper-plane"></i></button>
          </div>
        `}
      </div>
    </div>
  `;
};

window.postResourceNote = async function postResourceNote(lessonId) {
  const input = document.getElementById('resource-note-input');
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;

  const { error } = await window._supabase.from('resource_notes').insert({
    lesson_id: lessonId,
    student_id: window.currentUser.id,
    content,
  });

  if (error) {
    const msg = error.message.includes('CONTENIDO_INAPROPIADO') ? 'Esa nota tiene lenguaje no permitido' : error.message;
    return window.showToast('<i class="fas fa-circle-xmark"></i> ' + msg, 'error');
  }
  window.loadResourceSocialPanel(lessonId);
};

window.previewResourceCommentAttachment = function previewResourceCommentAttachment(input) {
  const preview = document.getElementById('resource-comment-attachment-preview');
  if (!preview) return;
  const file = input.files?.[0];
  if (!file) { preview.classList.add('hidden'); preview.innerHTML = ''; return; }
  preview.classList.remove('hidden');
  preview.innerHTML = `<span class="inline-flex items-center gap-2 text-[0.65rem] font-bold text-primary bg-primary/10 px-2 py-1 rounded-lg"><i class="fas fa-paperclip"></i> ${window.sanitizeInput(file.name)} <i class="fas fa-times cursor-pointer" onclick="document.getElementById('resource-comment-file').value=''; window.previewResourceCommentAttachment(document.getElementById('resource-comment-file'));"></i></span>`;
};

window.postResourceComment = async function postResourceComment(lessonId, groupId, parentId) {
  const inputId = parentId ? `reply-input-${parentId}` : 'resource-comment-input';
  const input = document.getElementById(inputId);
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;
  const userData = window.userData || {};

  // Adjunto (evidencia de tarea) -- solo disponible en el comentario raíz,
  // no en respuestas, para mantener el input simple.
  const fileInput = !parentId ? document.getElementById('resource-comment-file') : null;
  const file = fileInput?.files?.[0];
  let attachment_url = null;
  if (file) {
    const fileName = `${window.currentUser.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const { error: uploadError } = await window._supabase.storage.from('comment-attachments').upload(fileName, file);
    if (uploadError) return window.showToast('<i class="fas fa-circle-xmark"></i> Error subiendo el adjunto: ' + uploadError.message, 'error');
    const { data } = window._supabase.storage.from('comment-attachments').getPublicUrl(fileName);
    attachment_url = data.publicUrl;
  }

  const { error } = await window._supabase.from('resource_comments').insert({
    lesson_id: lessonId,
    group_id: groupId,
    parent_id: parentId || null,
    author_id: window.currentUser.id,
    author_name: userData.full_name || 'Estudiante',
    author_role: window.userRole,
    content,
    attachment_url,
  });

  if (error) {
    const msg = error.message.includes('CONTENIDO_INAPROPIADO') ? 'Ese comentario tiene lenguaje no permitido' : error.message;
    return window.showToast('<i class="fas fa-circle-xmark"></i> ' + msg, 'error');
  }
  if (fileInput) { fileInput.value = ''; window.previewResourceCommentAttachment(fileInput); }
  if (typeof checkAllBadges === 'function') checkAllBadges(window.currentUser.id);
  window.loadResourceSocialPanel(lessonId);
};

window.toggleResourceCommentLike = async function toggleResourceCommentLike(lessonId, commentId, likedByMe) {
  const userId = window.currentUser.id;
  if (likedByMe) {
    await window._supabase.from('resource_comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
  } else {
    const { error } = await window._supabase.from('resource_comment_likes').insert({ comment_id: commentId, user_id: userId });
    if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    window.checkCommentAuthorBadges?.(commentId);
  }
  window.loadResourceSocialPanel(lessonId);
};

function renderQuizPlayerHtml(lesson) {
  const sanitizeInput = window.sanitizeInput || ((v) => v);
  const completion = window._completionsCache?.get(lesson.id);
  const questions = lesson.quiz_data || [];

  if (completion?.score != null) {
    return `<div class="text-center py-16">
      <i class="fas fa-circle-check text-5xl text-emerald-500 mb-4"></i>
      <p class="text-2xl font-black text-slate-800 dark:text-white">${Math.round(completion.score)}%</p>
      <p class="text-sm text-slate-400 mt-2">Ya respondiste este quiz.</p>
    </div>`;
  }

  return `
    <div class="space-y-5" id="quiz-player-form">
      ${questions.map((q, i) => `
        <div class="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
          <p class="font-bold text-sm text-slate-800 dark:text-white mb-3">${i + 1}. ${sanitizeInput(q.question)}</p>
          ${q.type === 'mc' ? q.options.map((opt, oi) => `
            <label class="flex items-center gap-2 py-1.5 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="radio" name="quiz-q-${i}" value="${oi}"> ${sanitizeInput(opt)}
            </label>
          `).join('') : ''}
          ${q.type === 'tf' ? `
            <label class="flex items-center gap-2 py-1.5 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="radio" name="quiz-q-${i}" value="true"> Verdadero
            </label>
            <label class="flex items-center gap-2 py-1.5 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="radio" name="quiz-q-${i}" value="false"> Falso
            </label>
          ` : ''}
          ${q.type === 'number' || q.type === 'range' ? `
            <input type="number" class="input-field-tw h-10 text-sm" id="quiz-q-${i}" placeholder="Tu respuesta">
          ` : ''}
          ${q.type === 'text' ? `
            <textarea class="input-field-tw text-sm" id="quiz-q-${i}" rows="3" placeholder="Tu respuesta"></textarea>
          ` : ''}
        </div>
      `).join('')}
      <button class="btn-primary-tw w-full h-12 text-xs uppercase font-bold" onclick="window.submitQuizAnswers('${lesson.id}')"><i class="fas fa-paper-plane"></i> Enviar Respuestas</button>
    </div>
  `;
}

window.submitQuizAnswers = async function submitQuizAnswers(lessonId) {
  const { items } = window._activeCourse || {};
  const lesson = (items || []).find(l => l.id === lessonId);
  if (!lesson) return;
  const questions = lesson.quiz_data || [];

  const answers = [];
  let correct = 0;
  let graded = 0;

  questions.forEach((q, i) => {
    let raw = null;
    if (q.type === 'mc' || q.type === 'tf') {
      raw = document.querySelector(`input[name="quiz-q-${i}"]:checked`)?.value ?? null;
    } else {
      raw = document.getElementById(`quiz-q-${i}`)?.value?.trim() || null;
    }
    answers.push(raw);

    if (q.type === 'text') return; // se califica manual, no entra al puntaje automático

    graded++;
    if (q.type === 'mc' && raw !== null && parseInt(raw, 10) === q.correctIndex) correct++;
    if (q.type === 'tf' && raw !== null && (raw === 'true') === q.correctBool) correct++;
    if (q.type === 'number' && raw !== null && !isNaN(parseFloat(raw)) && Math.abs(parseFloat(raw) - q.correctNumber) <= (q.tolerance || 0)) correct++;
    if (q.type === 'range' && raw !== null && !isNaN(parseFloat(raw)) && parseFloat(raw) >= q.min && parseFloat(raw) <= q.max) correct++;
  });

  const score = graded > 0 ? (correct / graded) * 100 : 0;

  await persistLessonScore(lessonId, score, 'completed', { answers });
  window.showToast(`<i class="fas fa-circle-check"></i> ¡Quiz enviado! Nota: ${Math.round(score)}%`, 'success');

  const nextIndex = window._activeCourseIndex + 1;
  if (nextIndex < items.length) {
    window.selectCourseResource(nextIndex);
  } else {
    window.renderCourseSidebar();
    const footerEl = document.getElementById('course-player-footer');
    if (footerEl) footerEl.innerHTML = `<div class="text-center text-sm font-bold text-emerald-500"><i class="fas fa-circle-check"></i> ¡Completaste todo el curso!</div>`;
  }
}

window.markLessonSeen = async function markLessonSeen(lessonId) {
  const btn = document.getElementById('btn-mark-lesson-seen');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  const payload = { lesson_id: lessonId, student_id: window.currentUser.id };
  const { queued, error } = await upsertLessonCompletion(payload);

  if (error) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-circle-check"></i> Marcar como visto'; }
    return;
  }

  window._completionsCache.set(lessonId, {});
  window.showToast(queued
    ? '<i class="fas fa-cloud-slash"></i> Guardado en este dispositivo -- se sincroniza al reconectar'
    : '<i class="fas fa-circle-check"></i> ¡Recurso marcado como visto!', 'success');

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
// Escribe una completion de lección con resiliencia offline -- antes esto
// (y markLessonSeen) hacían el upsert directo sin chequear el error: sin
// conexión, el progreso se perdía en silencio (ni error ni reintento).
// Ahora, si falla (típicamente por estar offline), se encola en
// SyncManager y se sincroniza solo al volver la conexión.
async function upsertLessonCompletion(payload) {
  const { error } = await window._supabase.from('lesson_completions').upsert(payload, { onConflict: 'lesson_id,student_id' });
  if (!error) return { queued: false, error: null };

  if (navigator.onLine) return { queued: false, error }; // error real, no de conectividad
  await window._syncManager?.enqueue('mark_lesson_complete', payload);
  return { queued: true, error: null };
}

async function persistLessonScore(lessonId, score, status, rawData) {
  const payload = {
    lesson_id: lessonId,
    student_id: window.currentUser.id,
    score: score === null || isNaN(score) ? null : score,
    status: status || null,
    raw_data: rawData,
    completed_at: new Date().toISOString(),
  };
  const { queued } = await upsertLessonCompletion(payload);
  if (queued) window.showToast('<i class="fas fa-cloud-slash"></i> Nota guardada en este dispositivo -- se sincroniza al reconectar', 'info');

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

// Carga el HTML de entrada (SCORM/HTML5) por fetch() y lo mete con srcdoc
// en vez de navegar el iframe a la URL directamente -- ver el comentario
// largo en selectCourseResource() sobre por qué src="" no funciona (Supabase
// pisa el Content-Type a text/plain + CSP sandbox en cualquier respuesta
// HTML servida a un cliente, y de paso deja el iframe en otro origen).
window.loadIframeViaFetch = async function loadIframeViaFetch(iframeId, url) {
  const iframe = document.getElementById(iframeId);
  if (!iframe || !url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    iframe.srcdoc = await res.text();
  } catch (e) {
    console.error('Error cargando contenido embebido:', e);
    iframe.srcdoc = '<p style="font-family:sans-serif;color:#e11d48;padding:24px;text-align:center;">No se pudo cargar el contenido.</p>';
  }
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
// h5p-standalone guarda TODO en globales compartidos (window.H5P,
// window.H5PIntegration, y marca cada <script>/<link> que inyecta con
// data-h5p="..." para no volver a insertarlos) -- está pensado para una
// sola actividad por carga de página completa, no para navegar entre
// varios recursos H5P de un curso sin recargar. La segunda vez, esos
// globales quedan con el estado de la actividad ANTERIOR (ej.
// H5P.preventInit en false, contenidos previos todavía en
// H5PIntegration.contents) y la inicialización de la nueva falla --
// coincide exacto con "el primero carga bien, el segundo da error, y
// recargar la página lo arregla" reportado. Se resetea todo antes de
// cada instancia nueva para que cada una arranque como si fuera la
// primera carga de la página.
function resetH5PGlobalState() {
  delete window.H5P;
  delete window.H5PIntegration;
  document.querySelectorAll('script[data-h5p], link[data-h5p]').forEach(el => el.remove());
}

window.initH5PSession = async function initH5PSession(lesson, attempt = 1) {
  const container = document.getElementById('h5p-container');
  if (!container) return;
  resetH5PGlobalState();

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
      frameJs: h5pVendorUrl('frame.bundle.js'),
      frameCss: h5pVendorUrl('styles/h5p.css'),
    });

    // No confiar en que h5p-standalone limpie el contenedor solo -- se
    // saca el spinner a mano en cuanto aparece el iframe real (a veces
    // quedaba pegado tapando el contenido ya cargado).
    const waitForIframe = setInterval(() => {
      if (document.querySelector('#h5p-container iframe')) {
        clearInterval(waitForIframe);
        document.getElementById('h5p-loading-overlay')?.remove();
      }
    }, 200);
    setTimeout(() => {
      clearInterval(waitForIframe);
      // Si a los 15s nunca apareció el iframe, h5p-standalone se quedó
      // colgado (ej. un fetch interno que nunca resuelve ni rechaza) --
      // antes se quedaba el spinner girando para siempre sin forma de
      // reintentar salvo salir y volver a entrar al recurso.
      const overlay = document.getElementById('h5p-loading-overlay');
      if (overlay) {
        // El overlay nace con pointer-events-none (para no tapar clicks
        // mientras es solo un spinner decorativo) -- sin sacarlo acá el
        // botón Reintentar se ve pero los clicks lo atraviesan.
        overlay.classList.remove('pointer-events-none');
        overlay.innerHTML = `<p class="text-rose-500 text-sm mb-3 px-4 text-center">El contenido tardó demasiado en cargar.</p><button class="btn-secondary-tw h-9 px-4 text-xs uppercase font-bold" onclick="window.selectCourseResource(window._activeCourseIndex)"><i class="fas fa-rotate"></i> Reintentar</button>`;
      }
    }, 15000);

    // El propio H5PStandalone despacha xAPI a través de H5P.externalDispatcher
    // una vez que termina de inicializar el iframe interno.
    const waitForDispatcher = setInterval(() => {
      const innerH5P = document.querySelector('#h5p-container iframe')?.contentWindow?.H5P;
      if (innerH5P?.externalDispatcher) {
        clearInterval(waitForDispatcher);
        innerH5P.externalDispatcher.on('xAPI', (event) => {
          const statement = event?.data?.statement;
          const result = statement?.result;

          if (result && result.score != null && result.score.max) {
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
            return;
          }

          // Contenido H5P sin nota (ej. "Mensaje", texto libre, tarjetas
          // informativas) nunca dispara un result.score -- antes se
          // ignoraba por completo, nunca se guardaba ninguna fila de
          // avance y el curso quedaba trabado para siempre en ese
          // recurso. Si llega una señal de "completado/respondido" y
          // todavía no hay nada guardado, se cuenta como visto (igual que
          // video/PDF) para desbloquear el siguiente.
          const verb = statement?.verb?.id || '';
          const isCompletionSignal = /\/(completed|answered)$/.test(verb) || result?.completion;
          if (isCompletionSignal && !window._completionsCache?.has(lesson.id)) {
            persistLessonScore(lesson.id, null, 'completed', statement);
            updateLiveScoreLabel(null, 'completed');
          }
        });
      }
    }, 500);
    setTimeout(() => clearInterval(waitForDispatcher), 20000);

  } catch (e) {
    console.error('Error cargando H5P:', e);
    container.innerHTML = '<p class="text-rose-500 text-sm text-center py-10">Error cargando el contenido H5P.</p>';
  }
}

// ================================================
// EXPORTAR NOTAS ESTILO SIRE/SIREEDUCA
// ================================================
// El SIRE no acepta subir archivos -- las notas se ingresan a mano, una por
// una, en su propia web. Esto genera una hoja de cálculo con el mismo orden
// (Código Personal, nombre, notas por unidad, nota final, resultado) para
// que el docente la tenga al lado mientras teclea en el SIRE, en vez de
// tener que calcular todo de memoria.
window.openExportSireModal = async function openExportSireModal() {
  const classOptions = await getClassOptionsForCurrentUser();
  if (!classOptions.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés clases asignadas todavía', 'error');

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-8 shadow-2xl animate-slideUp">
      <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter mb-2"><i class="fas fa-file-export text-primary mr-2"></i> Exportar Notas (SIRE)</h2>
      <p class="text-xs text-slate-400 mb-6">Genera una hoja con Código Personal, nombre y notas por unidad (bimestre) de todos los cursos de la clase, lista para copiar mientras cargás las notas en el SIRE -- el sistema del MINEDUC no acepta subir archivos.</p>
      <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Clase</label>
      <select id="sire-export-class" class="input-field-tw h-11 text-sm mb-6">
        ${classOptions.map((c, i) => `<option value="${i}">${window.sanitizeInput(c.schoolName)} · ${window.sanitizeInput(c.grade)} ${window.sanitizeInput(c.section)}</option>`).join('')}
      </select>
      <div class="flex gap-3">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-confirm-sire-export" onclick="window.confirmExportSire()"><i class="fas fa-download"></i> Descargar CSV</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window._sireExportClassOptions = classOptions;
}

window.confirmExportSire = async function confirmExportSire() {
  const classIndex = document.getElementById('sire-export-class')?.value;
  const classOption = window._sireExportClassOptions?.[classIndex];
  if (!classOption) return;

  const btn = document.getElementById('btn-confirm-sire-export');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const { school_code, grade, section } = classOption;
    const _supabase = window._supabase;

    const [{ data: students }, { data: courses }] = await Promise.all([
      _supabase.from('students').select('id, full_name, cui, codigo_personal').eq('school_code', school_code).eq('grade', grade).eq('section', section).order('full_name'),
      _supabase.from('courses').select('*').eq('school_code', school_code).eq('grade', grade).eq('section', section),
    ]);

    if (!students?.length) throw new Error('No hay alumnos en esa clase');

    const courseIds = (courses || []).map(c => c.id);
    const { data: allLessons } = courseIds.length
      ? await _supabase.from('lessons').select('*').in('course_id', courseIds)
      : { data: [] };
    const lessonIds = (allLessons || []).map(l => l.id);
    const { data: allCompletions } = lessonIds.length
      ? await _supabase.from('lesson_completions').select('lesson_id, student_id, score, status').in('lesson_id', lessonIds)
      : { data: [] };

    const lessonsByCourse = new Map();
    (allLessons || []).forEach(l => {
      if (!lessonsByCourse.has(l.course_id)) lessonsByCourse.set(l.course_id, []);
      lessonsByCourse.get(l.course_id).push(l);
    });

    const completionsByStudentLesson = new Map();
    (allCompletions || []).forEach(c => {
      completionsByStudentLesson.set(`${c.student_id}|${c.lesson_id}`, c);
    });

    // Puntos de cada estudiante por bimestre = suma de los puntos de todos
    // los cursos de ese bimestre asignados a su clase.
    const rows = students.map((s, idx) => {
      const unidadPoints = [0, 0, 0, 0];
      const unidadHasCourses = [false, false, false, false];

      (courses || []).forEach(course => {
        const items = lessonsByCourse.get(course.id) || [];
        const completionsMap = new Map(items.map(l => [l.id, completionsByStudentLesson.get(`${s.id}|${l.id}`)]).filter(([, v]) => v));
        const courseGrade = computeCourseGradeForStudent(course, items, completionsMap);
        const bIdx = Math.min(4, Math.max(1, course.bimestre || 1)) - 1;
        unidadPoints[bIdx] += courseGrade.points;
        unidadHasCourses[bIdx] = true;
      });

      // El SIRE no acepta más de 100 puntos por unidad -- si el docente
      // asignó varios cursos al mismo bimestre y sus ponderaciones suman
      // más de 100 entre todos, se limita acá (el tope real hay que
      // corregirlo repartiendo el peso entre esos cursos, esto es solo
      // para no romper la importación al SIRE).
      const cappedUnidadPoints = unidadPoints.map(v => Math.min(100, v));
      const unidadesConDatos = cappedUnidadPoints.filter((_, i) => unidadHasCourses[i]);
      const notaFinal = unidadesConDatos.length ? Math.round(unidadesConDatos.reduce((a, b) => a + b, 0) / unidadesConDatos.length) : 0;

      return {
        clave: idx + 1,
        codigoPersonal: s.codigo_personal || s.cui || '',
        nombre: s.full_name,
        unidades: cappedUnidadPoints.map((v, i) => unidadHasCourses[i] ? Math.round(v) : ''),
        notaFinal,
        resultado: notaFinal >= 60 ? 'Promovido' : 'No Promovido',
      };
    });

    let csv = 'Clave,Codigo Personal,Nombre del Estudiante,Unidad 1,Unidad 2,Unidad 3,Unidad 4,Nota Final,Resultado\n';
    rows.forEach(r => {
      const nombre = (r.nombre || '').replace(/"/g, '""');
      csv += `${r.clave},"${r.codigoPersonal}","${nombre}",${r.unidades.join(',')},${r.notaFinal},${r.resultado}\n`;
    });

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notas-sire-${grade}-${section}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    window.showToast('<i class="fas fa-circle-check"></i> Notas exportadas', 'success');
    document.querySelector('.fixed.z-\\[200\\]')?.remove();
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-download"></i> Descargar CSV';
  }
}

// ================================================
// CUADRO DE RESULTADOS FINALES (borrador para cargar en el SIRE)
// ================================================
// IMPORTANTE: esto es un BORRADOR de trabajo, no un documento oficial del
// MINEDUC -- ayuda a calcular notas por ÁREA CNB y quién promueve, para que
// el docente lo transcriba al sistema oficial (SIRE), igual que el CSV de
// arriba. No lleva sello/membrete del Ministerio para no confundirse con el
// documento real que el sistema oficial emite.
window.openCuadroFinalModal = async function openCuadroFinalModal() {
  const classOptions = await getClassOptionsForCurrentUser();
  if (!classOptions.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No tenés clases asignadas todavía', 'error');

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-8 shadow-2xl animate-slideUp">
      <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter mb-2"><i class="fas fa-table-list text-primary mr-2"></i> Cuadro de Resultados Finales</h2>
      <p class="text-xs text-slate-400 mb-6">Borrador de trabajo con notas finales por área CNB y quién promueve -- para transcribir al SIRE. No es el documento oficial del MINEDUC.</p>
      <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Clase</label>
      <select id="cuadro-final-class" class="input-field-tw h-11 text-sm mb-6">
        ${classOptions.map((c, i) => `<option value="${i}">${window.sanitizeInput(c.schoolName)} · ${window.sanitizeInput(c.grade)} ${window.sanitizeInput(c.section)}</option>`).join('')}
      </select>
      <div class="flex gap-3">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-confirm-cuadro-final" onclick="window.confirmCuadroFinal()"><i class="fas fa-print"></i> Generar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window._cuadroFinalClassOptions = classOptions;
}

window.confirmCuadroFinal = async function confirmCuadroFinal() {
  const classIndex = document.getElementById('cuadro-final-class')?.value;
  const classOption = window._cuadroFinalClassOptions?.[classIndex];
  if (!classOption) return;

  const btn = document.getElementById('btn-confirm-cuadro-final');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const { school_code, grade, section } = classOption;
    const _supabase = window._supabase;

    const [{ data: school }, { data: students }, { data: courses }] = await Promise.all([
      _supabase.from('schools').select('*').eq('code', school_code).maybeSingle(),
      _supabase.from('students').select('id, full_name, cui, codigo_personal, gender').eq('school_code', school_code).eq('grade', grade).eq('section', section).order('full_name'),
      _supabase.from('courses').select('*').eq('school_code', school_code).eq('grade', grade).eq('section', section),
    ]);

    if (!students?.length) throw new Error('No hay alumnos en esa clase');
    const coursesWithArea = (courses || []).filter(c => c.cnb_area);
    if (!coursesWithArea.length) throw new Error('Ningún curso de esta clase tiene Área CNB asignada -- editá los cursos y elegí su área');

    const courseIds = coursesWithArea.map(c => c.id);
    const { data: allLessons } = courseIds.length
      ? await _supabase.from('lessons').select('*').in('course_id', courseIds)
      : { data: [] };
    const lessonIds = (allLessons || []).map(l => l.id);
    const { data: allCompletions } = lessonIds.length
      ? await _supabase.from('lesson_completions').select('lesson_id, student_id, score, status').in('lesson_id', lessonIds)
      : { data: [] };

    const lessonsByCourse = new Map();
    (allLessons || []).forEach(l => {
      if (!lessonsByCourse.has(l.course_id)) lessonsByCourse.set(l.course_id, []);
      lessonsByCourse.get(l.course_id).push(l);
    });
    const completionsByStudentLesson = new Map();
    (allCompletions || []).forEach(c => completionsByStudentLesson.set(`${c.student_id}|${c.lesson_id}`, c));

    // Áreas presentes en esta clase, en el orden oficial del CNB para el
    // nivel de esta clase (no alfabético -- más fácil de leer/transcribir).
    const areaOrder = window.getCnbAreasForGrade(grade);
    const areasPresent = Array.from(new Set(coursesWithArea.map(c => c.cnb_area)))
      .sort((a, b) => areaOrder.indexOf(a) - areaOrder.indexOf(b));

    const coursesByArea = new Map();
    coursesWithArea.forEach(c => {
      if (!coursesByArea.has(c.cnb_area)) coursesByArea.set(c.cnb_area, []);
      coursesByArea.get(c.cnb_area).push(c);
    });

    // Nota final del área = suma de puntos ganados / suma de puntos
    // posibles de TODOS los cursos de esa área (sin importar en qué
    // bimestre estén) -- normalizado a 0-100 sin asumir que existan los
    // 4 bimestres completos.
    const rows = students.map((s, idx) => {
      const areaScores = areasPresent.map(area => {
        const areaCourses = coursesByArea.get(area) || [];
        let earned = 0, possible = 0;
        areaCourses.forEach(course => {
          const items = lessonsByCourse.get(course.id) || [];
          const completionsMap = new Map(items.map(l => [l.id, completionsByStudentLesson.get(`${s.id}|${l.id}`)]).filter(([, v]) => v));
          const courseGrade = computeCourseGradeForStudent(course, items, completionsMap);
          earned += courseGrade.points;
          possible += course.weight ?? 100;
        });
        return possible > 0 ? Math.round((earned / possible) * 100) : 0;
      });
      const promovido = areaScores.every(sc => sc >= 60);
      return {
        no: idx + 1,
        codigoPersonal: s.codigo_personal || s.cui || '',
        nombre: s.full_name,
        gender: s.gender || '',
        areaScores,
        promovido,
      };
    });

    const resumen = {
      promM: rows.filter(r => r.promovido && r.gender?.startsWith('m')).length,
      promF: rows.filter(r => r.promovido && r.gender?.startsWith('f')).length,
      noPromM: rows.filter(r => !r.promovido && r.gender?.startsWith('m')).length,
      noPromF: rows.filter(r => !r.promovido && r.gender?.startsWith('f')).length,
    };

    const sanitizeInput = window.sanitizeInput || ((v) => v);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
      <head>
        <title>Cuadro de Resultados Finales -- ${sanitizeInput(grade)} ${sanitizeInput(section)}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 24px; }
          h1 { font-size: 15px; margin: 0 0 4px; }
          h2 { font-size: 12px; margin: 0 0 16px; font-weight: normal; color: #444; }
          .disclaimer { background: #fff8e1; border: 1px solid #f0c14b; padding: 8px 12px; margin-bottom: 16px; font-size: 10px; }
          .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 16px; margin-bottom: 16px; font-size: 10px; }
          .meta b { display: block; color: #555; font-size: 9px; text-transform: uppercase; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
          th, td { border: 1px solid #999; padding: 4px 6px; text-align: center; }
          th { background: #f0f0f0; font-size: 9px; text-transform: uppercase; }
          td.nombre { text-align: left; }
          .resumen-table { width: auto; }
          .no-promovido { color: #b91c1c; font-weight: bold; }
          .promovido { color: #15803d; font-weight: bold; }
          .firma { margin-top: 60px; text-align: center; font-size: 10px; }
          .firma div { border-top: 1px solid #333; width: 260px; margin: 0 auto; padding-top: 4px; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;">Imprimir</button>
        <h1>BORRADOR -- Cuadro de Resultados Finales</h1>
        <h2>Uso interno para transcribir al SIRE -- NO es el documento oficial del MINEDUC</h2>
        <div class="disclaimer">Esta hoja se generó automáticamente a partir de las notas cargadas en el sistema. Verificá los datos antes de cargarlos al SIRE -- la responsabilidad del contenido final es del establecimiento.</div>
        <div class="meta">
          <div><b>Centro Educativo</b>${sanitizeInput(school?.name || school_code)}</div>
          <div><b>Código</b>${sanitizeInput(school_code)}</div>
          <div><b>Departamento</b>${sanitizeInput(school?.department || '')}</div>
          <div><b>Municipio</b>${sanitizeInput(school?.municipality || '')}</div>
          <div><b>Sector / Jornada</b>${sanitizeInput(school?.sector || '')} / ${sanitizeInput(school?.schedule || '')}</div>
          <div><b>Grado / Sección</b>${sanitizeInput(grade)} / ${sanitizeInput(section)}</div>
          <div><b>Docente</b>${sanitizeInput(window.userData?.full_name || '')}</div>
          <div><b>Fecha</b>${new Date().toLocaleDateString('es-GT')}</div>
        </div>
        <table class="resumen-table">
          <thead><tr><th rowspan="2">&nbsp;</th><th colspan="2">Promovidos(as)</th><th colspan="2">No Promovidos(as)</th></tr>
          <tr><th>M</th><th>F</th><th>M</th><th>F</th></tr></thead>
          <tbody><tr><td><b>Total</b></td><td>${resumen.promM}</td><td>${resumen.promF}</td><td>${resumen.noPromM}</td><td>${resumen.noPromF}</td></tr></tbody>
        </table>
        <table>
          <thead>
            <tr>
              <th rowspan="2">No.</th><th rowspan="2">Código Personal</th><th rowspan="2">Nombre del Estudiante</th>
              <th colspan="${areasPresent.length}">Áreas</th><th rowspan="2">Resultado</th>
            </tr>
            <tr>${areasPresent.map((a, i) => `<th>${i + 1}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.no}</td>
                <td>${sanitizeInput(r.codigoPersonal)}</td>
                <td class="nombre">${sanitizeInput(r.nombre)}</td>
                ${r.areaScores.map(sc => `<td class="${sc < 60 ? 'no-promovido' : ''}">${sc}</td>`).join('')}
                <td class="${r.promovido ? 'promovido' : 'no-promovido'}">${r.promovido ? 'PROMOVIDO(A)' : 'NO PROMOVIDO(A)'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p style="font-size:9px;color:#555;"><b>Áreas:</b> ${areasPresent.map((a, i) => `${i + 1}. ${sanitizeInput(a)}`).join(' &nbsp;·&nbsp; ')}</p>
        <div class="firma"><div>${sanitizeInput(window.userData?.full_name || 'Docente')}</div></div>
      </body>
      </html>
    `);
    printWindow.document.close();

    window.showToast('<i class="fas fa-circle-check"></i> Cuadro generado', 'success');
    document.querySelector('.fixed.z-\\[200\\]')?.remove();
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-print"></i> Generar';
  }
}
