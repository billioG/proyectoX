// ================================================
// GESTIÓN DE DOCENTES Y ASIGNACIONES
// ================================================

async function loadTeachers() {
  const container = document.getElementById('teachers-container');
  if (!container) {
    console.warn('⚠️ Contenedor de docentes no encontrado en el DOM.');
    return;
  }

  container.innerHTML = `
    <div class="flex flex-col items-center justify-center p-20 text-slate-400">
        <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
        <span class="font-bold tracking-widest uppercase text-xs">Cargando equipo docente...</span>
    </div>
  `;

  try {
    const { data: teachers, error } = await _supabase
      .from('teachers')
      .select(`
        *,
        teacher_assignments(
          id,
          school_code,
          grade,
          section,
          schools(name)
        )
      `)
      .order('full_name');

    if (error) throw error;

    container.innerHTML = `
      <div class="flex flex-col md:flex-row gap-6 mb-10 items-center animate-slideUp">
        <div class="relative grow w-full">
            <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input type="text" id="search-teachers" class="input-field-tw pl-12 h-12 text-sm font-semibold" placeholder="FILTRO: NOMBRE, EMAIL O ASIGNACIÓN..." oninput="filterTeachers()">
        </div>
        <div class="flex gap-3 w-full md:w-auto shrink-0">
            <button class="btn-primary-tw grow h-12 px-6 text-xs uppercase font-bold tracking-widest" onclick="openAddTeacherModal()">
              <i class="fas fa-user-plus"></i> NUEVO DOCENTE
            </button>
            <button class="btn-secondary-tw grow h-12 px-6 text-xs uppercase font-bold tracking-widest" onclick="exportTeachersCSV()">
              <i class="fas fa-file-csv"></i> EXPORTAR
            </button>
        </div>
      </div>

      ${!teachers || teachers.length === 0 ? `
        <div class="glass-card p-16 text-center border-2 border-dashed border-slate-100 dark:border-slate-800">
            <i class="fas fa-chalkboard-teacher text-6xl text-slate-200 dark:text-slate-800 mb-4 mx-auto block"></i>
            <p class="text-slate-500 font-bold uppercase tracking-widest text-sm mb-6">No hay docentes registrados</p>
            <button class="btn-primary-tw mx-auto h-11 px-8" onclick="openAddTeacherModal()"><i class="fas fa-plus"></i> AGREGAR EL PRIMERO</button>
        </div>
      ` : `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          ${teachers.map(t => `
            <div class="teacher-card glass-card p-0 overflow-hidden hover:translate-y-[-4px] transition-all group" data-name="${t.full_name.toLowerCase()}" data-email="${t.email.toLowerCase()}">
                <div class="p-6 relative">
                    <div class="flex justify-between items-start mb-4">
                        <div class="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700">
                             ${t.profile_photo_url ? `<img src="${t.profile_photo_url}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-slate-300 text-2xl"><i class="fas fa-user"></i></div>`}
                        </div>
                        <div class="flex flex-col items-end gap-1">
                             <div class="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 text-[0.6rem] font-bold uppercase tracking-widest border border-emerald-500/10 flex items-center gap-1">
                                <i class="fas fa-circle text-[0.4rem]"></i> ACTIVO
                             </div>
                             ${t.role === 'admin' ? `<span class="text-[0.55rem] font-bold text-rose-500 uppercase tracking-widest bg-rose-50 px-2 py-0.5 rounded-md">ADMIN</span>` : ''}
                        </div>
                    </div>
                    
                    <h3 class="text-lg font-bold text-slate-800 dark:text-white leading-tight mb-1">${sanitizeInput(t.full_name)}</h3>
                    <p class="text-sm text-slate-400 font-medium mb-4 flex items-center gap-2">
                        <i class="fas fa-envelope text-xs opacity-50"></i> ${sanitizeInput(t.email)}
                    </p>

                    <div class="flex gap-2 mb-4">
                         <div class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 grow text-center">
                             <div class="textxs text-slate-400 font-bold uppercase tracking-tighter">Asignaciones</div>
                             <div class="text-lg font-bold text-slate-700 dark:text-slate-200">${t.teacher_assignments?.length || 0}</div>
                         </div>
                         <div class="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 grow text-center">
                             <div class="textxs text-slate-400 font-bold uppercase tracking-tighter">Proyectos</div>
                             <div class="text-lg font-bold text-indigo-500">--</div>
                         </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="viewTeacherAssignments('${t.id}', '${sanitizeInput(t.full_name)}')" class="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400 text-xs font-bold uppercase tracking-wider transition-all border border-transparent hover:border-indigo-200">
                            <i class="fas fa-school mr-1"></i> Carga
                        </button>
                        <button onclick="openAssignTeacherModal('${t.id}', '${sanitizeInput(t.full_name)}')" class="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/20 text-xs font-bold uppercase tracking-wider transition-all border border-transparent hover:border-primary/20">
                            <i class="fas fa-plus mr-1"></i> Asignar
                        </button>
                    </div>
                </div>

                <div class="bg-slate-50/50 dark:bg-slate-800/30 p-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center group-hover:bg-slate-100 dark:group-hover:bg-slate-800 transition-colors">
                     <span class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-widest pl-2">ID: ...${t.id.substr(-6)}</span>
                     <div class="flex gap-1">
                        <button onclick="editTeacher('${t.id}')" class="w-8 h-8 rounded-lg text-slate-400 hover:text-primary hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deleteTeacher('${t.id}', '${sanitizeInput(t.full_name)}')" class="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm">
                            <i class="fas fa-trash"></i>
                        </button>
                     </div>
                </div>
            </div>
          `).join('')}
        </div>
      `}
    `;

  } catch (err) {
    console.error('Error cargando docentes:', err);
    container.innerHTML = '<div class="error-state">❌ Error al cargar docentes</div>';
  }
}

function openAddTeacherModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn';
  modal.id = 'add-teacher-modal';

  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-8 bg-white dark:bg-slate-900 animate-slideUp">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight m-0 flex items-center gap-3">
            <i class="fas fa-user-plus text-primary"></i> Nuevo Docente
        </h2>
        <button class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center font-bold" onclick="this.closest('.fixed').remove()">
            <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="space-y-4">
        <div>
          <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Nombre Completo</label>
          <input type="text" id="teacher-name" class="input-field-tw" placeholder="Ej: Maria Gonzalez">
        </div>

        <div>
          <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Correo Electrónico</label>
          <input type="email" id="teacher-email" class="input-field-tw" placeholder="correo@ejemplo.com">
        </div>

        <div>
          <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Fecha de Nacimiento</label>
          <input type="date" id="teacher-birth" class="input-field-tw">
        </div>

        <div>
          <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Teléfono (Opcional)</label>
          <input type="tel" id="teacher-phone" class="input-field-tw" placeholder="1234-5678">
        </div>

        <div>
          <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Contraseña Temporal</label>
          <input type="password" id="teacher-password" class="input-field-tw" placeholder="Mínimo 6 caracteres" value="1bot.org">
        </div>

        <button class="btn-primary-tw w-full mt-4" onclick="addTeacher()" id="btn-add-teacher">
          <i class="fas fa-save"></i> Crear Cuenta Docente
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

async function addTeacher() {
  const name = document.getElementById('teacher-name')?.value.trim();
  const email = document.getElementById('teacher-email')?.value.trim();
  const phone = document.getElementById('teacher-phone')?.value.trim();
  const birth = document.getElementById('teacher-birth')?.value;
  const password = document.getElementById('teacher-password')?.value.trim();
  const btn = document.getElementById('btn-add-teacher');

  if (!name || !email || !password) {
    return showToast('❌ Completa nombre, email y contraseña', 'error');
  }

  if (password.length < 6) {
    return showToast('❌ La contraseña debe tener al menos 6 caracteres', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';

  try {
    const { data: authData, error: authError } = await _supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: name,
          role: 'docente'
        },
        emailRedirectTo: undefined
      }
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('No se pudo crear usuario');

    await new Promise(resolve => setTimeout(resolve, 500));

    const { error: dbError } = await _supabase
      .from('teachers')
      .insert({
        id: authData.user.id,
        full_name: name,
        email: email,
        phone: phone || null,
        birth_date: birth || null,
        role: 'docente'
      });

    if (dbError) throw dbError;

    showToast('✅ Docente creado correctamente', 'success');
    document.getElementById('add-teacher-modal').remove();
    await loadTeachers();

  } catch (err) {
    console.error('Error creando docente:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus"></i> Crear Docente';
  }
}

function openAssignTeacherModal(teacherId, teacherName) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn';
  modal.id = 'assign-teacher-modal';

  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-8 bg-white dark:bg-slate-900 animate-slideUp">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight m-0 flex items-center gap-3">
            <i class="fas fa-chalkboard-teacher text-primary"></i> Asignar Carga
        </h2>
        <button class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center font-bold" onclick="this.closest('.fixed').remove()">
            <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="space-y-5">
        <div class="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300 flex gap-3 items-start">
            <i class="fas fa-info-circle mt-0.5"></i>
            <p>Estás asignando clases a <strong>${sanitizeInput(teacherName)}</strong>. Esto le permitirá ver alumnos y evaluar proyectos.</p>
        </div>

        <div>
           <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Establecimiento</label>
           <select id="assign-school" class="input-field-tw" onchange="loadGradesForAssignment()">
             <option value="">Seleccionar...</option>
           </select>
        </div>

        <label class="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
          <input type="checkbox" id="assign-all" onchange="toggleBulkAssignment(this.checked)" class="w-5 h-5 rounded text-primary focus:ring-primary border-slate-300">
          <span class="text-sm font-bold text-slate-700 dark:text-slate-300">Asignar TODOS los grados y secciones de este colegio</span>
        </label>

        <div id="individual-assign-fields" class="grid grid-cols-2 gap-4 transition-opacity duration-300">
          <div>
             <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Grado</label>
             <select id="assign-grade" class="input-field-tw" onchange="loadSectionsForAssignment()">
               <option value="">Seleccionar...</option>
             </select>
          </div>
          <div>
             <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Sección</label>
             <select id="assign-section" class="input-field-tw">
               <option value="">Seleccionar...</option>
             </select>
          </div>
        </div>

        <button class="btn-primary-tw w-full mt-2" onclick="assignTeacher('${teacherId}')" id="btn-assign">
          <i class="fas fa-check-circle"></i> Confirmar Asignación
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  loadSchoolsForAssignment();
}

async function loadSchoolsForAssignment() {
  const select = document.getElementById('assign-school');
  if (!select) return;

  try {
    const { data: schools } = await _supabase
      .from('schools')
      .select('code, name, level')
      .order('name');

    if (schools && schools.length > 0) {
      select.innerHTML = '<option value="">Seleccionar...</option>' +
        schools.map(s => `<option value="${s.code}" data-level="${s.level}">${sanitizeInput(s.name)}</option>`).join('');
    }
  } catch (err) {
    console.error('Error cargando establecimientos:', err);
  }
}

function loadGradesForAssignment() {
  const schoolSelect = document.getElementById('assign-school');
  const gradeSelect = document.getElementById('assign-grade');
  const sectionSelect = document.getElementById('assign-section');

  if (!schoolSelect || !gradeSelect || !sectionSelect) return;

  const selectedOption = schoolSelect.options[schoolSelect.selectedIndex];
  const schoolCode = schoolSelect.value;
  const level = selectedOption?.dataset.level || 'Primaria';

  // Limpiar secciones cuando se cambia de establecimiento
  sectionSelect.innerHTML = '<option value="">Seleccionar grado primero...</option>';

  // Cargar solo los grados disponibles para este establecimiento
  loadAvailableGrades(schoolCode, level);
}

async function loadAvailableGrades(schoolCode, level) {
  const gradeSelect = document.getElementById('assign-grade');
  if (!gradeSelect) return;

  try {
    // Obtener estudiantes del establecimiento para ver qué grados existen
    const { data: students } = await _supabase
      .from('students')
      .select('grade')
      .eq('school_code', schoolCode)
      .neq('grade', null);

    if (students && students.length > 0) {
      // Obtener grados únicos
      const uniqueGrades = [...new Set(students.map(s => s.grade))].sort();

      gradeSelect.innerHTML = '<option value="">Seleccionar...</option>' +
        uniqueGrades.map(g => `<option value="${g}">${g}</option>`).join('');
    } else {
      gradeSelect.innerHTML = '<option value="">No hay grados disponibles</option>';
    }
  } catch (err) {
    console.error('Error cargando grados:', err);
    gradeSelect.innerHTML = '<option value="">Error al cargar grados</option>';
  }
}

async function loadSectionsForAssignment() {
  const schoolSelect = document.getElementById('assign-school');
  const gradeSelect = document.getElementById('assign-grade');
  const sectionSelect = document.getElementById('assign-section');

  if (!schoolSelect || !gradeSelect || !sectionSelect) return;

  const schoolCode = schoolSelect.value;
  const grade = gradeSelect.value;

  if (!schoolCode || !grade) {
    sectionSelect.innerHTML = '<option value="">Seleccionar...</option>';
    return;
  }

  try {
    // Obtener solo las secciones que tienen estudiantes con este grado y establecimiento
    const { data: students } = await _supabase
      .from('students')
      .select('section')
      .eq('school_code', schoolCode)
      .eq('grade', grade)
      .neq('section', null);

    if (students && students.length > 0) {
      // Obtener secciones únicas y ordenadas
      const uniqueSections = [...new Set(students.map(s => s.section))].sort();

      sectionSelect.innerHTML = '<option value="">Seleccionar...</option>' +
        uniqueSections.map(s => `<option value="${s}">${s}</option>`).join('');
    } else {
      sectionSelect.innerHTML = '<option value="">No hay secciones para este grado</option>';
    }
  } catch (err) {
    console.error('Error cargando secciones:', err);
    sectionSelect.innerHTML = '<option value="">Error al cargar secciones</option>';
  }
}

function toggleBulkAssignment(isBulk) {
  const individualFields = document.getElementById('individual-assign-fields');
  if (individualFields) {
    individualFields.style.opacity = isBulk ? '0.3' : '1';
    individualFields.style.pointerEvents = isBulk ? 'none' : 'auto';
  }
}

async function assignTeacher(teacherId) {
  const schoolCode = document.getElementById('assign-school')?.value;
  const grade = document.getElementById('assign-grade')?.value;
  const section = document.getElementById('assign-section')?.value;
  const isBulk = document.getElementById('assign-all')?.checked;
  const btn = document.getElementById('btn-assign');

  if (!schoolCode) {
    return showToast('❌ Selecciona un establecimiento', 'error');
  }

  if (!isBulk && (!grade || !section)) {
    return showToast('❌ Completa grado y sección o selecciona "Asignar a todos"', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

  try {
    if (isBulk) {
      // ASIGNACIÓN MASIVA
      // 1. Obtener todos los grados y secciones únicos del colegio
      const { data: students, error: studentError } = await _supabase
        .from('students')
        .select('grade, section')
        .eq('school_code', schoolCode);

      if (studentError) throw studentError;

      // Crear combinaciones únicas
      const combinations = [];
      const seen = new Set();
      students.forEach(s => {
        const key = `${s.grade}-${s.section}`;
        if (s.grade && s.section && !seen.has(key)) {
          combinations.push({ grade: s.grade, section: s.section });
          seen.add(key);
        }
      });

      if (combinations.length === 0) {
        throw new Error('No se encontraron grados o secciones con alumnos en este colegio.');
      }

      // 2. Obtener asignaciones existentes para no duplicar
      const { data: existing } = await _supabase
        .from('teacher_assignments')
        .select('grade, section')
        .eq('teacher_id', teacherId)
        .eq('school_code', schoolCode);

      const existingKeys = new Set((existing || []).map(e => `${e.grade}-${e.section}`));

      // 3. Filtrar solo las nuevas
      const newAssignments = combinations
        .filter(c => !existingKeys.has(`${c.grade}-${c.section}`))
        .map(c => ({
          teacher_id: teacherId,
          school_code: schoolCode,
          grade: c.grade,
          section: c.section
        }));

      if (newAssignments.length === 0) {
        showToast('ℹ️ El docente ya está asignado a todos los grados existentes', 'info');
      } else {
        const { error: insertError } = await _supabase
          .from('teacher_assignments')
          .insert(newAssignments);
        if (insertError) throw insertError;
        showToast(`✅ Se crearon ${newAssignments.length} asignaciones correctamente`, 'success');
      }

    } else {
      // ASIGNACIÓN INDIVIDUAL
      const { data: existing } = await _supabase
        .from('teacher_assignments')
        .select('id')
        .eq('teacher_id', teacherId)
        .eq('school_code', schoolCode)
        .eq('grade', grade)
        .eq('section', section)
        .maybeSingle();

      if (existing) {
        showToast('⚠️ Esta asignación ya existe', 'warning');
      } else {
        const { error } = await _supabase
          .from('teacher_assignments')
          .insert({
            teacher_id: teacherId,
            school_code: schoolCode,
            grade: grade,
            section: section
          });
        if (error) throw error;
        showToast('✅ Asignación creada correctamente', 'success');
      }
    }

    document.getElementById('assign-teacher-modal').remove();
    await loadTeachers();

  } catch (err) {
    console.error('Error asignando docente:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Finalizar Asignación';
  }
}

async function viewTeacherAssignments(teacherId, teacherName) {
  try {
    const { data: assignments, error } = await _supabase
      .from('teacher_assignments')
      .select(`
        id,
        school_code,
        grade,
        section,
        schools(name)
      `)
      .eq('teacher_id', teacherId);

    if (error) throw error;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn';
    modal.id = 'view-assignments-modal';

    modal.innerHTML = `
      <div class="glass-card w-full max-w-lg p-0 bg-white dark:bg-slate-900 animate-slideUp overflow-hidden">
        <div class="p-6 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
            <div>
                <h2 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight m-0">
                    Carga Académica
                </h2>
                <p class="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">${sanitizeInput(teacherName)}</p>
            </div>
            <button class="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center font-bold shadow-sm" onclick="this.closest('.fixed').remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        
        <div class="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
          ${!assignments || assignments.length === 0 ? `
            <div class="text-center py-8">
                <div class="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-300 text-2xl mx-auto mb-4">
                    <i class="fas fa-folder-open"></i>
                </div>
                <p class="text-slate-500 font-bold text-sm">No tiene asignaciones activas</p>
            </div>
          ` : `
            <div class="space-y-3">
              ${assignments.map(a => `
                <div class="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm hover:border-sidebar-active/30 transition-colors group">
                  <div>
                    <div class="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <i class="fas fa-school text-slate-400 text-xs"></i> 
                        ${sanitizeInput(a.schools?.name || 'Establecimiento')}
                    </div>
                    <div class="flex gap-2 mt-2">
                        <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[0.65rem] font-bold uppercase tracking-wide">
                            ${a.grade}
                        </span>
                        <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[0.65rem] font-bold uppercase tracking-wide">
                            Sección ${a.section}
                        </span>
                    </div>
                  </div>
                  <button class="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-500 text-xs font-bold hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 focus:opacity-100" onclick="removeAssignment(${a.id}, '${teacherId}')">
                    <i class="fas fa-trash-alt"></i>
                  </button>
                </div>
              `).join('')}
            </div>
          `}
        </div>
        <div class="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-center">
             <button class="text-xs font-bold text-primary hover:underline uppercase tracking-widest" onclick="this.closest('.fixed').remove(); openAssignTeacherModal('${teacherId}', '${sanitizeInput(teacherName)}')">
                <i class="fas fa-plus mr-1"></i> Agregar Nueva Asignación
             </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

  } catch (err) {
    console.error('Error cargando asignaciones:', err);
    showToast('❌ Error al cargar asignaciones', 'error');
  }
}

async function editTeacher(teacherId) {
  try {
    const { data: teacher, error } = await _supabase
      .from('teachers')
      .select('*')
      .eq('id', teacherId)
      .single();

    if (error) throw error;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn';
    modal.id = 'edit-teacher-modal';

    modal.innerHTML = `
      <div class="glass-card w-full max-w-md p-8 bg-white dark:bg-slate-900 animate-slideUp">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight m-0 flex items-center gap-3">
              <i class="fas fa-user-edit text-primary"></i> Editar Docente
          </h2>
          <button class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center font-bold" onclick="this.closest('.fixed').remove()">
              <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Nombre Completo</label>
            <input type="text" id="edit-teacher-name" class="input-field-tw" value="${sanitizeInput(teacher.full_name)}">
          </div>

          <div>
            <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Email (No editable)</label>
            <input type="email" id="edit-teacher-email" class="input-field-tw opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800" value="${teacher.email}" readonly>
          </div>

          <div>
            <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Teléfono</label>
            <input type="tel" id="edit-teacher-phone" class="input-field-tw" value="${teacher.phone || ''}" placeholder="1234-5678">
          </div>

          <div>
            <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Fecha de Nacimiento</label>
            <input type="date" id="edit-teacher-birth" class="input-field-tw" value="${teacher.birth_date || ''}">
          </div>

          <button class="btn-primary-tw w-full mt-4" onclick="updateTeacher('${teacherId}')" id="btn-update-teacher">
            <i class="fas fa-save"></i> Guardar Cambios
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

  } catch (err) {
    console.error('Error cargando docente para editar:', err);
    showToast('❌ Error al cargar datos del docente', 'error');
  }
}

async function updateTeacher(teacherId) {
  const name = document.getElementById('edit-teacher-name')?.value.trim();
  const phone = document.getElementById('edit-teacher-phone')?.value.trim();
  const birth = document.getElementById('edit-teacher-birth')?.value;
  const btn = document.getElementById('btn-update-teacher');

  if (!name) {
    return showToast('❌ El nombre es obligatorio', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

  try {
    const { error } = await _supabase
      .from('teachers')
      .update({
        full_name: name,
        phone: phone || null,
        birth_date: birth || null
      })
      .eq('id', teacherId);

    if (error) throw error;

    showToast('✅ Datos actualizados correctamente', 'success');
    document.getElementById('edit-teacher-modal').remove();
    await loadTeachers();

  } catch (err) {
    console.error('Error actualizando docente:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
  }
}

async function deleteTeacher(teacherId, teacherName) {
  if (!confirm(`¿Eliminar a ${teacherName}?\n\nEsto eliminará:\n- El usuario de autenticación\n- Todas sus asignaciones\n- Sus evaluaciones a proyectos`)) {
    return;
  }

  try {
    const { error } = await _supabase
      .from('teachers')
      .delete()
      .eq('id', teacherId);

    if (error) throw error;

    showToast('✅ Docente eliminado', 'success');
    await loadTeachers();

  } catch (err) {
    console.error('Error eliminando docente:', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}

async function exportTeachersCSV() {
  try {
    const { data: teachers } = await _supabase
      .from('teachers')
      .select(`
        *,
        teacher_assignments(
          school_code,
          grade,
          section,
          schools(name)
        )
      `)
      .order('full_name');

    if (!teachers || teachers.length === 0) {
      return showToast('❌ No hay docentes para exportar', 'error');
    }

    let csvContent = 'Nombre,Email,Telefono,Asignaciones\n';

    teachers.forEach(t => {
      const nombre = (t.full_name || '').replace(/,/g, ';');
      const email = t.email || '';
      const telefono = t.phone || '';
      const asignaciones = t.teacher_assignments?.map(a =>
        `${a.schools?.name || ''} ${a.grade} ${a.section}`
      ).join('; ') || 'Sin asignaciones';

      csvContent += `"${nombre}",${email},${telefono},"${asignaciones}"\n`;
    });

    downloadCSV(csvContent, 'docentes_export.csv');
    showToast(`✅ ${teachers.length} docentes exportados`, 'success');

  } catch (err) {
    console.error('Error exportando docentes:', err);
    showToast('❌ Error al exportar', 'error');
  }
}


function filterTeachers() {
  const term = (document.getElementById('search-teachers')?.value || '').toLowerCase().trim();
  const cards = document.querySelectorAll('.teacher-card');
  cards.forEach(card => {
    const match = card.dataset.name.includes(term) || card.dataset.email.includes(term);
    card.style.display = match ? 'block' : 'none';
    if (match) card.classList.add('animate-fadeIn');
  });
}
console.log('✅ teachers.js cargado correctamente (Tailwind Premium)');
