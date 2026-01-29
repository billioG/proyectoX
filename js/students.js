/**
 * STUDENTS - Gestión de Estudiantes (Premium Edition)
 */

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
    container.innerHTML = '<div class="glass-card p-10 text-rose-500 font-bold text-center">❌ Falló la sincronización de alumnos</div>';
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
      <div class="flex flex-col md:flex-row gap-4 mb-8 items-center animate-slideUp">
        <div class="relative grow w-full">
            <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input type="text" id="search-students" class="input-field-tw pl-12 h-11 text-sm font-bold" placeholder="FILTRO: NOMBRE, USUARIO O CUI..." oninput="window.filterStudents()">
        </div>
        <div class="flex gap-2 w-full md:w-auto shrink-0">
            ${userRole === 'admin' ? `<button class="btn-primary-tw grow h-11 text-xs uppercase font-bold" onclick="window.openAddStudentModal()"><i class="fas fa-plus"></i> NUEVO</button>` : ''}
            <button class="btn-secondary-tw grow h-11 text-xs uppercase font-bold" onclick="window.exportStudentsCSV()"><i class="fas fa-download"></i> EXPORTAR</button>
        </div>
      </div>
      
      <div class="space-y-6">
        ${Object.values(groupedBySchool).map(group => `
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
                    <div class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-open/school:rotate-180 transition-transform">
                        <i class="fas fa-chevron-down text-[0.6rem] text-slate-400"></i>
                    </div>
                </div>
            </summary>
            
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pl-2 border-l-2 border-slate-100 dark:border-slate-800 ml-4">
              ${group.students.map(s => `
                <div class="student-card bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-3 flex items-center gap-3 group relative overflow-hidden hover:border-primary/30 transition-all shadow-sm" 
                     data-name="${s.full_name?.toLowerCase()}" 
                     data-cui="${s.cui_last_4}"
                     data-username="${s.username?.toLowerCase()}">
                  <div class="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 group-hover:bg-primary group-hover:text-white transition-colors flex items-center justify-center font-bold text-sm shrink-0">
                    ${(s.full_name || 'A')[0]}
                  </div>
                  <div class="min-w-0 flex-1">
                    <h4 class="text-xs font-black text-slate-800 dark:text-white truncate uppercase tracking-tight">${s.full_name}</h4>
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
          <input type="text" id="student-name" value="${student?.full_name || ''}" required 
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
            <label class="block text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5">DPI / CUI (4 dígitos) *</label>
            <input type="text" id="student-cui" maxlength="4" placeholder="Ej: 1234" value="${student?.cui_last_4 || ''}" required
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

  const id = document.getElementById('student-id').value;
  const username = document.getElementById('student-username').value;
  const studentData = {
    full_name: document.getElementById('student-name').value,
    school_code: document.getElementById('student-school').value,
    cui_last_4: document.getElementById('student-cui').value,
    level: document.getElementById('student-level').value,
    grade: document.getElementById('student-grade').value,
    section: document.getElementById('student-section').value,
    is_active: true
  };

  try {
    let error;
    if (id) {
      const res = await _supabase.from('students').update(studentData).eq('id', id);
      error = res.error;
    } else {
      // Generar username basado en input
      studentData.username = username || (studentData.full_name.split(' ')[0].toLowerCase() + Math.floor(1000 + Math.random() * 9000));
      const res = await _supabase.from('students').insert(studentData);
      error = res.error;
    }

    if (error) throw error;
    showToast('✅ Alumno guardado', 'success');
    e.target.closest('.fixed').remove();
    window.loadStudents();
  } catch (err) {
    showToast('❌ Error al guardar', 'error');
  }
}

window.editStudent = async function editStudent(id) {
  const _supabase = window._supabase;
  const { data, error } = await _supabase.from('students').select('*').eq('id', id).single();
  if (data) window.openAddStudentModal(data);
}

window.deleteStudent = async function deleteStudent(id) {
  if (!confirm('¿Seguro?')) return;
  const _supabase = window._supabase;
  const { error } = await _supabase.from('students').delete().eq('id', id);
  if (!error) {
    window.showToast('🗑️ Alumno eliminado', 'success');
    window.loadStudents();
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
