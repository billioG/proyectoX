// ================================================
// GESTIÓN DE DOCENTES Y ASIGNACIONES
// ================================================

async function loadTeachers() {
  const container = document.getElementById('teachers-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Cargando docentes...</div>';

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
      <div style="margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
        <button class="btn-primary" onclick="openAddTeacherModal()">
          <i class="fas fa-user-plus"></i> Agregar Docente
        </button>
        <button class="btn-secondary" onclick="exportTeachersCSV()">
          <i class="fas fa-download"></i> Exportar CSV
        </button>
      </div>

      ${!teachers || teachers.length === 0 ? '<div class="empty-state">📭 No hay docentes registrados</div>' : `
        <div style="overflow-x: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Asignaciones</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${teachers.map((t, index) => `
                <tr>
                  <td style="text-align: center;">${index + 1}</td>
                  <td>
                    ${t.profile_photo_url ? `<img src="${t.profile_photo_url}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover; margin-right: 8px; vertical-align: middle;">` : ''}
                    <strong>${sanitizeInput(t.full_name)}</strong>
                  </td>
                  <td><code>${sanitizeInput(t.email)}</code></td>
                  <td>${t.phone || 'N/A'}</td>
                  <td>
                    ${t.teacher_assignments?.length > 0 ? `
                      <button class="btn-secondary btn-sm" onclick="viewTeacherAssignments('${t.id}', '${sanitizeInput(t.full_name)}')">
                        <i class="fas fa-school"></i> Ver ${t.teacher_assignments.length} asignación(es)
                      </button>
                    ` : '<span style="color: var(--text-light);">Sin asignaciones</span>'}
                  </td>
                  <td>
                    <button class="btn-icon" onclick="openAssignTeacherModal('${t.id}', '${sanitizeInput(t.full_name)}')" title="Asignar">
                      <i class="fas fa-plus-circle"></i>
                    </button>
                    <button class="btn-icon" onclick="editTeacher('${t.id}')" title="Editar">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteTeacher('${t.id}', '${sanitizeInput(t.full_name)}')" title="Eliminar" style="color: var(--danger-color);">
                      <i class="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
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
  modal.className = 'modal active';
  modal.id = 'add-teacher-modal';
  
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>➕ Agregar Docente</h2>
        <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <label>
          <strong>Nombre Completo:</strong>
          <input type="text" id="teacher-name" class="input-field" placeholder="Nombre del docente">
        </label>

        <label>
          <strong>Email:</strong>
          <input type="email" id="teacher-email" class="input-field" placeholder="correo@ejemplo.com">
        </label>

        <label>
          <strong>Teléfono (Opcional):</strong>
          <input type="tel" id="teacher-phone" class="input-field" placeholder="1234-5678">
        </label>

        <label>
          <strong>Contraseña:</strong>
          <input type="password" id="teacher-password" class="input-field" placeholder="Mínimo 6 caracteres" value="1bot.org">
        </label>

        <button class="btn-primary" onclick="addTeacher()" id="btn-add-teacher">
          <i class="fas fa-user-plus"></i> Crear Docente
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
  modal.className = 'modal active';
  modal.id = 'assign-teacher-modal';
  
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>📋 Asignar a ${sanitizeInput(teacherName)}</h2>
        <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <p style="color: var(--text-light); margin-bottom: 15px;">
          Asigna al docente a un establecimiento, grado y sección
        </p>

        <label>
          <strong>Establecimiento:</strong>
          <select id="assign-school" class="input-field" onchange="loadGradesForAssignment()">
            <option value="">Seleccionar...</option>
          </select>
        </label>

        <label>
          <strong>Grado:</strong>
          <select id="assign-grade" class="input-field" onchange="loadSectionsForAssignment()">
            <option value="">Seleccionar...</option>
          </select>
        </label>

        <label>
          <strong>Sección:</strong>
          <select id="assign-section" class="input-field">
            <option value="">Seleccionar...</option>
          </select>
        </label>

        <button class="btn-primary" onclick="assignTeacher('${teacherId}')" id="btn-assign">
          <i class="fas fa-check"></i> Asignar
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

async function assignTeacher(teacherId) {
  const schoolCode = document.getElementById('assign-school')?.value;
  const grade = document.getElementById('assign-grade')?.value;
  const section = document.getElementById('assign-section')?.value;
  const btn = document.getElementById('btn-assign');

  if (!schoolCode || !grade || !section) {
    return showToast('❌ Completa todos los campos', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Asignando...';

  try {
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
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i> Asignar';
      return;
    }

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
    document.getElementById('assign-teacher-modal').remove();
    await loadTeachers();

  } catch (err) {
    console.error('Error asignando docente:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Asignar';
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
    modal.className = 'modal active';
    modal.id = 'view-assignments-modal';
    
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>📋 Asignaciones de ${sanitizeInput(teacherName)}</h2>
          <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body">
          ${!assignments || assignments.length === 0 ? '<p class="empty-state">No tiene asignaciones</p>' : `
            <div>
              ${assignments.map(a => `
                <div class="assignment-item">
                  <div>
                    <strong>${sanitizeInput(a.schools?.name || 'Establecimiento')}</strong>
                    <p style="margin: 5px 0 0; color: var(--text-light);">
                      ${a.grade} - Sección ${a.section}
                    </p>
                  </div>
                  <button class="btn-danger btn-sm" onclick="removeAssignment(${a.id}, '${teacherId}')">
                    <i class="fas fa-trash"></i> Eliminar
                  </button>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);

  } catch (err) {
    console.error('Error cargando asignaciones:', err);
    showToast('❌ Error al cargar asignaciones', 'error');
  }
}

async function removeAssignment(assignmentId, teacherId) {
  if (!confirm('¿Eliminar esta asignación?')) return;

  try {
    const { error } = await _supabase
      .from('teacher_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) throw error;

    showToast('✅ Asignación eliminada', 'success');
    document.getElementById('view-assignments-modal').remove();
    await loadTeachers();

  } catch (err) {
    console.error('Error eliminando asignación:', err);
    showToast('❌ Error: ' + err.message, 'error');
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

console.log('✅ teachers.js cargado correctamente');
