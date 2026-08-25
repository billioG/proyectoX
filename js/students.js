/**
 * STUDENTS - Gestión de Estudiantes (Premium Edition)
 */

window.openClassPasswordsPanel = async function openClassPasswordsPanel() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-3xl p-0 overflow-hidden shadow-2xl animate-slideUp">
      <div class="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <h2 class="text-xl font-bold text-slate-800 dark:text-white uppercase tracking-tighter"><i class="fas fa-key text-primary mr-2"></i> Contraseñas de Clase</h2>
        <button class="text-slate-400 hover:text-rose-500 font-bold text-2xl transition-colors" onclick="this.closest('.fixed').remove()">×</button>
      </div>
      <div class="p-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
        <p class="text-xs text-slate-400 mb-6">Cada clase (establecimiento + grado + sección) tiene UNA contraseña compartida para todos sus alumnos. Podés desactivarla por completo para que entren solo con su usuario (modo Kolibri). Al cambiar una contraseña, se actualiza al instante la cuenta real de cada alumno matriculado ahí.</p>

        <div class="p-6 rounded-2xl bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-900/30 mb-6">
          <p class="text-[0.65rem] font-black uppercase text-rose-500 tracking-widest mb-1"><i class="fas fa-triangle-exclamation mr-1"></i> Restablecer establecimiento completo</p>
          <p class="text-[0.7rem] text-slate-500 mb-4">Aplica UNA contraseña a TODAS las clases (todos los grados y secciones) de un establecimiento a la vez, y sincroniza a todos sus alumnos.</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <select id="reset-school-select" class="input-field-tw h-11 text-sm sm:col-span-1"><option value="">Cargando establecimientos...</option></select>
            <input type="text" id="reset-password" placeholder="Nueva contraseña (vacío = generar una)" class="input-field-tw h-11 text-sm sm:col-span-2">
          </div>
          <label class="flex items-center gap-2 text-xs font-bold text-slate-500 mb-4">
            <input type="checkbox" id="reset-requires-password" checked class="w-4 h-4"> Requiere contraseña (destildar = todo el establecimiento entra solo con usuario)
          </label>
          <button class="btn-secondary-tw h-11 px-8 text-xs uppercase font-black border border-rose-300 text-rose-500" id="btn-reset-school" onclick="window.resetSchoolPasswords()">Aplicar a todo el establecimiento</button>
        </div>

        <p class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest mb-3">Clases (por establecimiento, grado y sección)</p>
        <div id="class-passwords-list" class="space-y-4">
          <div class="text-center text-slate-400 text-xs py-6"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window.loadClassPasswordsList();
  window.loadSchoolSelectForReset();
}

window.loadSchoolSelectForReset = async function loadSchoolSelectForReset() {
  const sel = document.getElementById('reset-school-select');
  if (!sel) return;
  const { data } = await window._supabase.from('schools').select('code, name').order('name');
  sel.innerHTML = (data || []).map(s => `<option value="${window.sanitizeAttr(s.code)}">${window.sanitizeInput(s.name)} (${window.sanitizeInput(s.code)})</option>`).join('') || '<option value="">Sin establecimientos</option>';
}

window.loadClassPasswordsList = async function loadClassPasswordsList() {
  const listEl = document.getElementById('class-passwords-list');
  if (!listEl) return;

  // Se listan TODAS las clases reales (existan o no en class_passwords todavía),
  // derivadas directo de los alumnos matriculados -- no solo las ya configuradas.
  const [{ data: students, error: stErr }, { data: configured, error: cpErr }, { data: schools }] = await Promise.all([
    window._supabase.from('students').select('school_code, grade, section'),
    window._supabase.from('class_passwords').select('school_code, grade, section, requires_password'),
    window._supabase.from('schools').select('code, name'),
  ]);
  if (stErr || cpErr) { listEl.innerHTML = `<p class="text-rose-500 text-xs">Error: ${(stErr || cpErr).message}</p>`; return; }

  const schoolNames = new Map((schools || []).map(s => [s.code, s.name]));
  const configuredMap = new Map((configured || []).map(c => [`${c.school_code}|${c.grade}|${c.section}`, c.requires_password]));

  const bySchool = new Map();
  (students || []).forEach(s => {
    if (!s.school_code || !s.grade || !s.section) return;
    const key = `${s.grade}|${s.section}`;
    if (!bySchool.has(s.school_code)) bySchool.set(s.school_code, new Set());
    bySchool.get(s.school_code).add(key);
  });

  if (!bySchool.size) { listEl.innerHTML = '<p class="text-slate-400 text-xs">Todavía no hay alumnos matriculados.</p>'; return; }

  listEl.innerHTML = Array.from(bySchool.entries()).map(([school_code, combos]) => `
    <div class="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
      <div class="px-4 py-2 bg-slate-100 dark:bg-slate-800/70 text-xs font-black text-slate-600 dark:text-slate-300">${window.sanitizeInput(schoolNames.get(school_code) || school_code)}</div>
      <div class="divide-y divide-slate-100 dark:divide-slate-800">
        ${Array.from(combos).sort().map(combo => {
          const [grade, section] = combo.split('|');
          const key = `${school_code}|${grade}|${section}`;
          const requiresPw = configuredMap.has(key) ? configuredMap.get(key) : true;
          return `
          <div class="flex items-center justify-between px-4 py-2.5 text-xs">
            <span class="text-slate-600 dark:text-slate-300">${window.sanitizeInput(grade)} · ${window.sanitizeInput(section)}</span>
            <div class="flex items-center gap-3">
              <span class="text-[0.6rem] font-black uppercase px-2 py-1 rounded-lg ${requiresPw ? 'bg-slate-200 dark:bg-slate-700 text-slate-500' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'}">
                ${requiresPw ? 'Con contraseña' : 'Sin contraseña'}
              </span>
              <button class="text-primary hover:underline font-bold" onclick="window.editClassPassword('${window.sanitizeAttr(school_code)}','${window.sanitizeAttr(grade)}','${window.sanitizeAttr(section)}',${requiresPw})">Editar</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `).join('');
}

window.editClassPassword = function editClassPassword(school_code, grade, section, currentlyRequiresPw) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-sm p-8 shadow-2xl animate-slideUp">
      <h3 class="text-sm font-black uppercase text-slate-800 dark:text-white mb-1">${window.sanitizeInput(school_code)}</h3>
      <p class="text-xs text-slate-400 mb-5">${window.sanitizeInput(grade)} · ${window.sanitizeInput(section)}</p>
      <input type="text" id="ecp-password" placeholder="Nueva contraseña (vacío = generar una)" class="input-field-tw h-11 text-sm w-full mb-3">
      <label class="flex items-center gap-2 text-xs font-bold text-slate-500 mb-5">
        <input type="checkbox" id="ecp-requires-password" ${currentlyRequiresPw ? 'checked' : ''} class="w-4 h-4"> Requiere contraseña
      </label>
      <div class="flex gap-3">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-save-one-class" onclick="window.saveClassPassword('${window.sanitizeAttr(school_code)}','${window.sanitizeAttr(grade)}','${window.sanitizeAttr(section)}')">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.saveClassPassword = async function saveClassPassword(school_code, grade, section) {
  const password = document.getElementById('ecp-password')?.value.trim() || null;
  const requires_password = document.getElementById('ecp-requires-password')?.checked;
  const btn = document.getElementById('btn-save-one-class');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/admin-set-class-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ school_code, grade, section, password, requires_password }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al guardar');

    const pwMsg = result.password ? ` · Contraseña: ${result.password}` : '';
    window.showToast(`<i class="fas fa-circle-check"></i> Guardado${result.updated ? ` (${result.updated} alumnos sincronizados)` : ''}${pwMsg}`, 'success');
    document.querySelector('.fixed.z-\\[300\\]')?.remove();
    window.loadClassPasswordsList();
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Guardar';
  }
}

window.resetSchoolPasswords = async function resetSchoolPasswords() {
  const school_code = document.getElementById('reset-school-select')?.value;
  const password = document.getElementById('reset-password')?.value.trim() || null;
  const requires_password = document.getElementById('reset-requires-password')?.checked;
  const btn = document.getElementById('btn-reset-school');

  if (!school_code) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí un establecimiento', 'error');
  if (!confirm('Esto va a cambiar la contraseña de TODAS las clases de este establecimiento y sincronizar a todos sus alumnos. ¿Continuar?')) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando...';

  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/admin-set-class-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ school_code, password, requires_password, apply_to_whole_school: true }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al aplicar');

    const pwMsg = result.password ? ` · Contraseña: ${result.password}` : '';
    window.showToast(`<i class="fas fa-circle-check"></i> ${result.classes?.length || 0} clases actualizadas, ${result.updated} alumnos sincronizados${pwMsg}`, 'success');
    document.getElementById('reset-password').value = '';
    window.loadClassPasswordsList();
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Aplicar a todo el establecimiento';
  }
}

window.loadStudents = async function loadStudents() {
  const container = document.getElementById('students-container');
  if (!container) return;

  const userRole = window.userRole;
  const currentUser = window.currentUser;
  const _supabase = window._supabase;
  const fetchWithCache = window.fetchWithCache;

  const pdfCard = document.getElementById('pdf-import-card');
  if (pdfCard) {
    pdfCard.className = userRole === 'admin' ? 'glass-card p-6 mb-8 block animate-slideUp' : 'hidden';
  }

  // Loader inicial
  if (!container.innerHTML || container.innerHTML.includes('fa-circle-notch')) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center p-20 text-slate-400">
          <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
          <span class="font-bold uppercase text-xs tracking-widest text-center">Sincronizando Base de Datos...</span>
      </div>
    `;
  }

  try {
    if (!currentUser) return;
    const cacheKey = `students_list_${currentUser.id}`;

    await fetchWithCache(cacheKey, async () => {
      // 1. Obtener asignaciones si es docente
      let assignments = [];
      if (userRole === 'docente') {
        const { data } = await _supabase.from('teacher_assignments').select('school_code, grade, section').eq('teacher_id', currentUser.id);
        assignments = data || [];
      }

      // 2. Query base de estudiantes
      let query = _supabase.from('students').select('*, schools(name, code)');
      if (userRole === 'docente' && assignments.length > 0) {
        const schoolCodes = [...new Set(assignments.map(a => a.school_code))];
        query = query.in('school_code', schoolCodes);
      }

      const { data: allStudents, error } = await query.order('school_code, grade, section, full_name');
      if (error) throw error;

      // 3. Filtrado final por sección si es docente
      let students = allStudents || [];
      if (userRole === 'docente') {
        students = allStudents.filter(s => assignments.some(a =>
          String(a.school_code) === String(s.school_code) &&
          String(a.grade) === String(s.grade) &&
          String(a.section) === String(s.section)
        ));
      }

      return students;
    }, (students) => {
      window.renderStudentsList(container, students);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="glass-card p-10 text-rose-500 font-bold text-center"><i class="fas fa-circle-xmark"></i> Falló la sincronización de alumnos</div>';
  }
}

window.renderStudentsList = function renderStudentsList(container, students) {
  const userRole = window.userRole;
  if (!students || students.length === 0) {
    container.innerHTML = `
        <div class="glass-card p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800">
            <i class="fas fa-user-graduate text-5xl text-slate-200 dark:text-slate-800 mb-4 mx-auto"></i>
            <p class="text-slate-500 font-bold uppercase tracking-widest text-sm mb-6 text-center">No hay alumnos registrados en tus secciones</p>
            ${userRole === 'admin' ? `<button class="btn-primary-tw mx-auto" onclick="window.openAddStudentModal()"><i class="fas fa-user-plus"></i> AGREGAR ALUMNO</button>` : ''}
        </div>
      `;
    return;
  }

  // Agrupar por establecimiento
  const groupedBySchool = students.reduce((acc, student) => {
    const schoolCode = student.school_code || 'sin-asignar';
    if (!acc[schoolCode]) {
      acc[schoolCode] = { schoolName: student.schools?.name || 'Otro Establecimiento', students: [] };
    }
    acc[schoolCode].students.push(student);
    return acc;
  }, {});

  container.innerHTML = `
      <div class="flex flex-col md:flex-row gap-4 mb-4 items-center animate-slideUp">
        <div class="relative grow w-full">
            <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input type="text" id="search-students" class="input-field-tw pl-12 h-11 text-sm font-bold" placeholder="FILTRO: NOMBRE, USUARIO O CUI..." oninput="window.filterStudents()">
        </div>
        <div class="flex gap-2 w-full md:w-auto shrink-0">
            ${userRole === 'admin' ? `<button class="btn-primary-tw grow h-11 text-xs uppercase font-bold" onclick="window.openAddStudentModal()"><i class="fas fa-plus"></i> NUEVO</button>` : ''}
            <button class="btn-secondary-tw grow h-11 text-xs uppercase font-bold" onclick="window.exportStudentsCSV()"><i class="fas fa-download"></i> EXPORTAR</button>
        </div>
      </div>

      ${userRole === 'admin' ? `
      <div class="flex items-center justify-between mb-6 px-1">
        <label class="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer">
          <input type="checkbox" id="select-all-students" onchange="window.toggleSelectAllStudents(this.checked)" class="w-4 h-4">
          Seleccionar todos los visibles
        </label>
        <button id="btn-bulk-delete-students" class="btn-secondary-tw h-9 px-4 text-xs uppercase font-bold border border-rose-300 text-rose-500 hidden" onclick="window.bulkDeleteSelectedStudents()">
          <i class="fas fa-trash-alt"></i> Eliminar seleccionados (<span id="bulk-delete-count">0</span>)
        </button>
      </div>
      ` : ''}

      <div class="space-y-6">
        ${Object.entries(groupedBySchool).map(([schoolCode, group]) => `
          <details class="group/school animate-fadeIn" open>
            <summary class="list-none cursor-pointer mb-4">
                <div class="glass-card p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-none shadow-sm">
                    <div class="flex items-center gap-4">
                        <div class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm"><i class="fas fa-school"></i></div>
                        <div>
                            <h3 class="text-sm font-bold text-slate-800 dark:text-white leading-none">${group.schoolName}</h3>
                            <p class="text-[0.8rem] font-medium text-slate-400 uppercase tracking-widest mt-1">${group.students.length} Alumnos Registrados</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        ${userRole === 'admin' ? `
                          <button onclick="event.preventDefault(); event.stopPropagation(); window.deleteAllStudentsInSchool('${window.sanitizeAttr(schoolCode)}', '${window.sanitizeAttr(group.schoolName)}')" class="h-8 px-3 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors text-[0.65rem] font-bold uppercase tracking-widest flex items-center gap-1.5">
                            <i class="fas fa-trash-alt"></i> Eliminar todos
                          </button>
                        ` : ''}
                        <div class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-open/school:rotate-180 transition-transform">
                            <i class="fas fa-chevron-down text-[0.6rem] text-slate-400"></i>
                        </div>
                    </div>
                </div>
            </summary>
            
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pl-2 border-l-2 border-slate-100 dark:border-slate-800 ml-4">
              ${group.students.map(s => `
                <div class="student-card bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-3 flex items-center gap-3 group relative overflow-hidden hover:border-primary/30 transition-all shadow-sm"
                     data-name="${window.sanitizeAttr(s.full_name?.toLowerCase() || '')}"
                     data-cui="${window.sanitizeAttr(s.cui || '')}"
                     data-username="${window.sanitizeAttr(s.username?.toLowerCase() || '')}">
                  ${window.userRole === 'admin' ? `
                    <input type="checkbox" class="student-select-checkbox w-4 h-4 shrink-0" value="${window.sanitizeAttr(s.id)}" onchange="window.updateBulkDeleteBar()">
                  ` : ''}
                  <div class="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 group-hover:bg-primary group-hover:text-white transition-colors flex items-center justify-center font-bold text-sm shrink-0">
                    ${window.sanitizeInput((s.full_name || 'A')[0])}
                  </div>
                  <div class="min-w-0 flex-1">
                    <h4 class="text-xs font-black text-slate-800 dark:text-white truncate uppercase tracking-tight">${window.sanitizeInput(s.full_name || '')}</h4>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[0.55rem] font-bold text-slate-500 uppercase tracking-widest">${s.grade} ${s.section}</span>
                        <span class="text-[0.6rem] font-mono text-slate-400">@${s.username || 'sin-usuario'}</span>
                    </div>
                  </div>
                  
                  ${window.userRole === 'admin' ? `
                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onclick="window.editStudent('${s.id}')" class="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-colors flex items-center justify-center">
                        <i class="fas fa-edit text-[0.6rem]"></i>
                      </button>
                      <button onclick="window.deleteStudent('${s.id}')" class="w-7 h-7 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors flex items-center justify-center">
                        <i class="fas fa-trash-alt text-[0.6rem]"></i>
                      </button>
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </details>
        `).join('')}
      </div>
  `;
}

window.filterStudents = function filterStudents() {
  const query = document.getElementById('search-students').value.toLowerCase();
  document.querySelectorAll('.student-card').forEach(card => {
    const name = card.dataset.name || '';
    const cui = card.dataset.cui || '';
    const user = card.dataset.username || '';
    if (name.includes(query) || cui.includes(query) || user.includes(query)) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
}

window.openAddStudentModal = async function openAddStudentModal(student = null) {
  const _supabase = window._supabase;
  const { data: schools } = await _supabase.from('schools').select('code, name').order('name');

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-xl max-h-[90vh] overflow-y-auto custom-scrollbar p-0 shadow-2xl animate-slideUp">
      <div class="p-6 bg-primary text-white sticky top-0 z-10">
        <div class="flex justify-between items-center">
          <h2 class="text-xl font-black uppercase tracking-tight">${student ? 'Editar Alumno' : 'Nuevo Alumno'}</h2>
          <button onclick="this.closest('.fixed').remove()" class="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      
      <form id="student-form" onsubmit="window.submitStudent(event)" class="p-6 space-y-5">
        <input type="hidden" id="student-id" value="${student?.id || ''}">
        
        <div>
          <label class="block text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nombre Completo *</label>
          <input type="text" id="student-name" value="${window.sanitizeAttr(student?.full_name || '')}" required
                 class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all"
                 oninput="window.generateStudentUsername(this.value)">
        </div>

        <div>
           <label class="block text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Usuario Generado (Automático)</label>
           <input type="text" id="student-username" value="${student?.username || ''}" readonly
                  class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-slate-500 cursor-not-allowed font-mono text-sm">
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Establecimiento *</label>
            <select id="student-school" required class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all">
              <option value="">Seleccionar...</option>
              ${schools?.map(s => `<option value="${s.code}" ${student?.school_code === s.code ? 'selected' : ''}>${s.name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5">CUI (13 dígitos) *</label>
            <input type="text" id="student-cui" maxlength="13" placeholder="Ej: 1234567890101" value="${student?.cui || ''}" required
                   class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all">
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
           <div>
            <label class="block text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Nivel *</label>
            <select id="student-level" required class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all" onchange="window.updateGradesByLevel()">
              <option value="">...</option>
              ${(window.EDUCATION_LEVELS || []).map(l => `<option value="${l}" ${student?.level === l ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Grado *</label>
            <select id="student-grade" required class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all">
               <option value="">...</option>
               ${student?.grade ? `<option value="${student.grade}" selected>${student.grade}</option>` : ''}
            </select>
          </div>
           <div>
            <label class="block text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Sección *</label>
            <select id="student-section" required class="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all">
              <option value="">...</option>
              ${(window.SECTIONS || []).map(s => `<option value="${s}" ${student?.section === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="pt-4 flex gap-3">
          <button type="button" onclick="this.closest('.fixed').remove()" class="flex-1 px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors uppercase text-xs">Cancelar</button>
          <button type="submit" class="flex-1 bg-primary text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/20 uppercase text-xs">Guardar Alumno</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  if (student?.level) window.updateGradesByLevel();
}

window.updateGradesByLevel = function updateGradesByLevel() {
  const levelSelection = document.getElementById('student-level').value;
  const gradeSelect = document.getElementById('student-grade');
  const grades = (window.GRADES_BY_LEVEL || {})[levelSelection] || [];

  gradeSelect.innerHTML = '<option value="">Seleccionar...</option>' +
    grades.map(g => `<option value="${g}">${g}</option>`).join('');
}

window.submitStudent = async function submitStudent(e) {
  e.preventDefault();
  const _supabase = window._supabase;
  const showToast = window.showToast;
  const btn = e.target.querySelector('button[type="submit"]') || document.querySelector('#student-form button.btn-primary-tw');

  const id = document.getElementById('student-id').value;
  const username = document.getElementById('student-username').value;
  const full_name = document.getElementById('student-name').value;
  const school_code = document.getElementById('student-school').value;
  const cui = document.getElementById('student-cui').value;
  const grade = document.getElementById('student-grade').value;
  const section = document.getElementById('student-section').value;

  try {
    if (id) {
      // Editar: la cuenta de acceso ya existe, solo se tocan los datos.
      const { error } = await _supabase.from('students').update({ full_name, school_code, cui, grade, section }).eq('id', id);
      if (error) throw error;
      showToast('<i class="fas fa-circle-check"></i> Alumno actualizado', 'success');
      e.target.closest('.fixed').remove();
      window.loadStudents();
      return;
    }

    // Nuevo: hace falta una cuenta de acceso real (Auth + fila en
    // students), igual que la importación masiva -- si solo se
    // insertara la fila, el alumno jamás podría loguearse.
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...'; }

    const finalUsername = username || (full_name.split(' ')[0].toLowerCase() + Math.floor(1000 + Math.random() * 9000));

    const { data: classPw } = await _supabase.from('class_passwords').select('password, requires_password').eq('school_code', school_code).eq('grade', grade).eq('section', section).maybeSingle();
    const password = classPw?.requires_password === false
      ? Math.random().toString(36).slice(-10) // clase sin contraseña -- igual necesita alguna en Auth, no se usará para entrar
      : (classPw?.password || Math.random().toString(36).slice(-10));

    const { data: { session } } = await _supabase.auth.getSession();
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/admin-bulk-import-students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({
        students: [{ fullName: full_name, username: finalUsername, email: `${finalUsername}@estudiante.edu.gt`, password, school_code, grade, section, cui }],
      }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al crear alumno');
    const item = result.results?.[0];
    if (item?.status === 'error') throw new Error(item.message || 'Error al crear alumno');

    showToast('<i class="fas fa-circle-check"></i> Alumno creado', 'success');
    e.target.closest('.fixed').remove();
    window.loadStudents();
  } catch (err) {
    console.error('Error guardando alumno:', err);
    showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar Alumno'; }
  }
}

window.editStudent = async function editStudent(id) {
  const _supabase = window._supabase;
  const { data, error } = await _supabase.from('students').select('*').eq('id', id).single();
  if (data) window.openAddStudentModal(data);
}

window.deleteStudent = async function deleteStudent(id) {
  if (!confirm('¿Seguro? Esto también elimina su cuenta de acceso.')) return;
  await window.deleteStudentsBulk([id]);
}

window.toggleSelectAllStudents = function toggleSelectAllStudents(checked) {
  document.querySelectorAll('.student-card').forEach(card => {
    if (card.style.display === 'none') return; // respeta el filtro de búsqueda
    const cb = card.querySelector('.student-select-checkbox');
    if (cb) cb.checked = checked;
  });
  window.updateBulkDeleteBar();
}

window.updateBulkDeleteBar = function updateBulkDeleteBar() {
  const checked = document.querySelectorAll('.student-select-checkbox:checked');
  const btn = document.getElementById('btn-bulk-delete-students');
  const countEl = document.getElementById('bulk-delete-count');
  if (countEl) countEl.textContent = checked.length;
  if (btn) btn.classList.toggle('hidden', checked.length === 0);
}

window.deleteAllStudentsInSchool = async function deleteAllStudentsInSchool(schoolCode, schoolName) {
  const { data: students, error } = await window._supabase.from('students').select('id').eq('school_code', schoolCode);
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  if (!students?.length) return window.showToast('<i class="fas fa-circle-info"></i> No hay alumnos en ese establecimiento', 'info');

  if (!confirm(`¿Eliminar los ${students.length} alumno(s) de "${schoolName}"? Esto también elimina sus cuentas de acceso. No se puede deshacer.`)) return;
  await window.deleteStudentsBulk(students.map(s => s.id));
}

window.bulkDeleteSelectedStudents = async function bulkDeleteSelectedStudents() {
  const ids = Array.from(document.querySelectorAll('.student-select-checkbox:checked')).map(cb => cb.value);
  if (!ids.length) return;
  if (!confirm(`¿Eliminar ${ids.length} alumno(s)? Esto también elimina sus cuentas de acceso. No se puede deshacer.`)) return;
  await window.deleteStudentsBulk(ids);
}

window.deleteStudentsBulk = async function deleteStudentsBulk(ids) {
  const btn = document.getElementById('btn-bulk-delete-students');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Eliminando...'; }

  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/admin-delete-students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ ids }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error al eliminar');

    window.showToast(`<i class="fas fa-trash-alt"></i> ${result.deleted} alumno(s) eliminado(s)${result.errors?.length ? ` (${result.errors.length} con error)` : ''}`, result.errors?.length ? 'warning' : 'success');
    if (result.errors?.length) console.error('Errores al eliminar alumnos:', result.errors);
    window.loadStudents();
  } catch (err) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash-alt"></i> Eliminar seleccionados (<span id="bulk-delete-count">0</span>)'; }
  }
}

window.exportStudentsCSV = async function exportStudentsCSV() {
  const _supabase = window._supabase;
  const { data } = await _supabase.from('students').select('full_name, username, school_code, grade, section').order('full_name');
  if (!data) return;

  let csv = 'Nombre,Usuario,Escuela,Grado,Seccion\n';
  data.forEach(s => {
    csv += `"${s.full_name}","${s.username}","${s.school_code}","${s.grade}","${s.section}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', 'estudiantes_projectx.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


let usernameDebounceTimer;

window.generateStudentUsername = function generateStudentUsername(fullName) {
  const input = document.getElementById('student-username');
  if (!input || !fullName) return;

  // Si es edición de un usuario existente (y el campo ya tenía valor original cargado), no sugerimos cambios automáticos
  // a menos que el usuario lo borre explícitamente. Asumimos que si hay valor y data-original (que pondremos al abrir modal) es edición.
  if (input.dataset.originalValue && input.value === input.dataset.originalValue) return;

  clearTimeout(usernameDebounceTimer);

  // Feedback visual de "pensando"
  input.parentElement.classList.add('opacity-50');

  usernameDebounceTimer = setTimeout(async () => {
    try {
      const cleanName = fullName.toLowerCase().trim()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar tildes
        .replace(/[^a-z0-9\s]/g, '');

      const parts = cleanName.split(/\s+/);
      if (parts.length < 1) return;

      // Identificar partes del nombre (heuristicas simples)
      // Asumimos: Nombre1 (Nombre2?) Apellido1 (Apellido2?)
      // Si hay 2 partes: Nombre Apellido
      // Si hay 3 partes: Nombre1 Nombre2 Apellido1 O Nombre1 Apellido1 Apellido2 (difícil saber, probamos variaciones)
      // Si hay 4 partes: N1 N2 A1 A2

      let n1 = parts[0];
      let n2 = '';
      let a1 = '';
      let a2 = '';

      if (parts.length === 2) {
        a1 = parts[1];
      } else if (parts.length === 3) {
        // Caso ambiguo: Juan Pablo Perez vs Juan Perez Lopez
        // Probamos asumir N1 N2 A1 primero
        n2 = parts[1];
        a1 = parts[2];
      } else if (parts.length >= 4) {
        n2 = parts[1];
        a1 = parts[2]; // Asumimos 3er token es primer apellido
        a2 = parts[3];
      }

      // Si no detectamos apellido (solo 1 nombre), usamos el nombre completo o generamos algo
      if (!a1 && parts.length === 1) {
        a1 = 'alumno'; // Fallback
      }

      // Generar lista de candidatos en orden de preferencia
      const candidates = [];

      // 1. Primera letra nombre + Primer apellido (jperez)
      if (n1 && a1) candidates.push(`${n1[0]}${a1}`);

      // 2. Primera letra nombre + Primera letra 2do nombre + Primer apellido (japerez)
      if (n1 && n2 && a1) candidates.push(`${n1[0]}${n2[0]}${a1}`);

      // 3. Primera letra nombre + Primer apellido + Primera letra 2do apellido (jperezl)
      if (n1 && a1 && a2) candidates.push(`${n1[0]}${a1}${a2[0]}`);

      // 4. Nombre completo + Primer apellido (juanperez)
      if (n1 && a1) candidates.push(`${n1}${a1}`);

      // 5. Variaciones truncadas o extendidas
      // ...

      // Verificar disponibilidad en DB
      // Necesitamos consultar todos los usernames que coincidan con estos patrones
      // Hacemos una consulta "OR"

      const { data: existingUsers } = await window._supabase
        .from('students')
        .select('username')
        .in('username', candidates);

      const existingSet = new Set(existingUsers?.map(u => u.username) || []);

      let selectedUsername = '';

      // Buscar el primer candidato libre
      for (const candidate of candidates) {
        if (!existingSet.has(candidate)) {
          selectedUsername = candidate;
          break;
        }
      }

      // Si todos están ocupados, usar el candidato 1 con un número incremental (revisión rápida)
      if (!selectedUsername && candidates.length > 0) {
        // Fallback robusto: Base + Random
        // Idealmente buscaríamos el siguiente secuencial, pero random es más rápido para UX sin tantas queries
        const base = candidates[0];
        const randomSuffix = Math.floor(10 + Math.random() * 90); // 2 dígitos
        selectedUsername = `${base}${randomSuffix}`;
      }

      if (selectedUsername) {
        input.value = selectedUsername;
        // input.classList.add('bg-green-50', 'text-green-600', 'font-bold');
        // setTimeout(() => input.classList.remove('bg-green-50', 'text-green-600', 'font-bold'), 1000);
      }

    } catch (err) {
      console.error('Error generando usuario:', err);
    } finally {
      input.parentElement.classList.remove('opacity-50');
    }
  }, 600); // 600ms debounce
}

console.log('✅ students.js cargado (Versión ES Module)');
