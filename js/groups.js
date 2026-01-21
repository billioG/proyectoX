// ================================================
// GESTIÓN DE GRUPOS - PARTE 1: CARGAR Y MOSTRAR
// ================================================

async function loadGroups() {
  const container = document.getElementById('groups-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fas fa-circle-notch fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i><p style="margin-top:10px;">Cargando tus grupos...</p></div>';

  try {
    let assignments = [];
    if (userRole === 'docente') {
      const { data } = await _supabase
        .from('teacher_assignments')
        .select('school_code, grade, section')
        .eq('teacher_id', currentUser.id);
      assignments = data || [];

      if (assignments.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-user-shield" style="font-size: 3rem; opacity: 0.2; margin-bottom: 20px; display: block;"></i>
            <h3>No tienes grupos asignados</h3>
            <p>Por favor, contacta al administrador para que te asigne establecimientos, grados y secciones.</p>
          </div>
        `;
        return;
      }
    }

    let query = _supabase
      .from('groups')
      .select(`
        *,
        schools(name),
        group_members(
          id,
          role,
          students(id, full_name, username)
        )
      `);

    if (userRole === 'docente') {
      const schoolCodes = [...new Set(assignments.map(a => a.school_code))];
      query = query.in('school_code', schoolCodes);
    }

    const { data: allGroups, error } = await query.order('school_code, grade, section, name');

    if (error) throw error;

    // Filtrado robusto para docentes (coincidencia de tripla: colegio, grado, sección)
    let groups = allGroups || [];
    if (userRole === 'docente') {
      groups = allGroups.filter(g =>
        assignments.some(a =>
          String(a.school_code) === String(g.school_code) &&
          String(a.grade) === String(g.grade) &&
          String(a.section) === String(g.section)
        )
      );
    }

    if (groups.length === 0) {
      container.innerHTML = `
        <div class="empty-state">📭 No hay grupos creados en tus secciones asignadas</div>
        ${userRole === 'docente' ? `
          <button class="btn-primary" onclick="openCreateGroupModal()">
            <i class="fas fa-users"></i> Crear Primer Grupo
          </button>
        ` : ''}
      `;
      return;
    }

    container.innerHTML = `
      ${userRole === 'docente' ? `
        <div style="margin-bottom: 24px; display: flex; gap: 12px; flex-wrap: wrap;">
          <button class="btn-primary" onclick="openCreateGroupModal()">
            <i class="fas fa-users"></i> Crear Nuevo Grupo
          </button>
          <button class="btn-secondary" onclick="exportGroupsCSV()">
            <i class="fas fa-download"></i> Exportar Grupos
          </button>
        </div>
      ` : (userRole === 'admin' ? `
        <div style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; background: var(--bg-hover); padding: 15px; border-radius: 12px; border: 1px solid var(--border-color);">
          <div>
            <h3 style="margin:0; color: var(--primary-color);">📊 Supervisión de Grupos</h3>
            <p style="margin:0; font-size: 0.9rem; color: var(--text-light);">Vista de solo lectura para administración</p>
          </div>
          <button class="btn-secondary" onclick="exportGroupsCSV()">
            <i class="fas fa-download"></i> Reporte CSV
          </button>
        </div>
      ` : '')}

      ${groups.map(g => renderGroupAccordion(g)).join('')}
    `;

  } catch (err) {
    console.error('Error cargando grupos:', err);
    container.innerHTML = '<div class="error-state">❌ Error al cargar grupos</div>';
  }
}

function renderGroupAccordion(g) {
  const members = g.group_members || [];
  const planner = members.find(m => m.role === 'planner');
  const maker = members.find(m => m.role === 'maker');
  const speaker = members.find(m => m.role === 'speaker');
  const helper = members.find(m => m.role === 'helper');

  return `
    <div class="group-accordion" style="margin-bottom: 15px;">
      <div class="group-accordion-header" onclick="toggleGroupAccordion(${g.id})" id="group-header-${g.id}">
        <div class="group-accordion-title">
          <span style="font-size: 1.5rem;">👥</span>
          <div>
            <h3 style="margin: 0; font-size: 1.2rem;">${sanitizeInput(g.name)}</h3>
            <small style="opacity: 0.8;">
              🏫 ${g.schools?.name || 'Sin establecimiento'} • 
              📚 ${g.grade} - ${g.section} • 
              ${members.length} integrante(s)
            </small>
          </div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          ${userRole === 'docente' ? `
            <button class="btn-icon" onclick="event.stopPropagation(); openEditGroupModal(${g.id});" title="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon" onclick="event.stopPropagation(); deleteGroup(${g.id}, '${sanitizeInput(g.name).replace(/'/g, "\\'")}');" title="Eliminar" style="color: var(--danger-color);">
              <i class="fas fa-trash"></i>
            </button>
          ` : ''}
          <i class="fas fa-chevron-down group-accordion-icon"></i>
        </div>
      </div>
      
      <div class="group-accordion-body" id="group-body-${g.id}">
        <h4 style="margin-bottom: 15px; color: var(--dark);">Roles del Grupo</h4>
        
        <div class="group-members-grid">
          ${renderRoleCard('planner', planner)}
          ${renderRoleCard('maker', maker)}
          ${renderRoleCard('speaker', speaker)}
          ${helper ? renderRoleCard('helper', helper) : ''}
        </div>

        ${members.length > 0 ? `
          <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid var(--light);">
            <strong style="display: block; margin-bottom: 10px;">Todos los Integrantes:</strong>
            <ul style="list-style: none; padding: 0; margin: 0;">
              ${members.map(m => `
                <li style="padding: 10px; background: var(--light-gray); border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                  <span>
                    <strong>${sanitizeInput(m.students?.full_name || 'Desconocido')}</strong>
                    <small style="color: var(--text-light); margin-left: 10px;">@${m.students?.username || ''}</small>
                  </span>
                  ${m.role ? `<span style="background: var(--bg-card); padding: 4px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; color: var(--text-dark); border: 1px solid var(--border-color);">${getRoleLabel(m.role)}</span>` : ''}
                </li>
              `).join('')}
            </ul>
          </div>
        ` : '<p style="color: var(--text-light); margin-top: 15px; text-align: center;">No hay integrantes asignados</p>'}
      </div>
    </div>
  `;
}

function renderRoleCard(roleType, member) {
  const roleConfig = {
    'planner': { icon: '📋', label: 'Planner', color: '#1976d2', bg: '#e3f2fd' },
    'maker': { icon: '🔨', label: 'Maker', color: '#f57c00', bg: '#fff3e0' },
    'speaker': { icon: '🎤', label: 'Speaker', color: '#388e3c', bg: '#e8f5e9' },
    'helper': { icon: '🤝', label: 'Helper', color: '#7b1fa2', bg: '#f3e5f5' }
  };

  const config = roleConfig[roleType];

  if (member) {
    return `
      <div class="member-role-card ${roleType}">
        <strong>${config.icon} ${config.label}</strong>
        <p>${sanitizeInput(member.students?.full_name || 'Sin asignar')}</p>
        <small>@${member.students?.username || ''}</small>
      </div>
    `;
  } else {
    return `
      <div class="member-role-card locked">
        <strong>${config.icon} ${config.label}</strong>
        <p>Sin asignar</p>
      </div>
    `;
  }
}

function toggleGroupAccordion(groupId) {
  const header = document.getElementById(`group-header-${groupId}`);
  const body = document.getElementById(`group-body-${groupId}`);

  if (!header || !body) return;

  const isActive = header.classList.contains('active');

  document.querySelectorAll('.group-accordion-header').forEach(h => h.classList.remove('active'));
  document.querySelectorAll('.group-accordion-body').forEach(b => b.classList.remove('active'));

  if (!isActive) {
    header.classList.add('active');
    body.classList.add('active');
  }
}

function getRoleLabel(role) {
  const roles = {
    'planner': '📋 Planner',
    'maker': '🔨 Maker',
    'speaker': '🎤 Speaker',
    'helper': '🤝 Helper'
  };
  return roles[role] || role;
}
// ================================================
// PARTE 2: CREAR GRUPO Y CARGAR ESTUDIANTES
// ================================================

async function openCreateGroupModal() {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'create-group-modal';

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>➕ Crear Grupo</h2>
        <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <label>
          <strong>Nombre del Grupo:</strong>
          <input type="text" id="group-name" class="input-field" placeholder="Ej: Los Innovadores">
        </label>

        <label>
          <strong>Establecimiento:</strong>
          <select id="group-school" class="input-field" onchange="loadGradesForGroup()">
            <option value="">Seleccionar...</option>
          </select>
        </label>

        <label>
          <strong>Grado:</strong>
          <select id="group-grade" class="input-field" onchange="loadSectionsForGroup()">
            <option value="">Seleccionar establecimiento primero...</option>
          </select>
        </label>
 
        <label>
          <strong>Sección:</strong>
          <select id="group-section" class="input-field" onchange="loadStudentsForGroup()">
            <option value="">Seleccionar grado primero...</option>
          </select>
        </label>

        <div id="students-selection" style="display: none; margin-top: 20px;">
          <h4>👥 Seleccionar Integrantes y Asignar Roles</h4>
          <p style="color: var(--text-light); margin-bottom: 15px; font-size: 0.9rem;">
            Selecciona entre 3 y 4 estudiantes y asigna un rol a cada uno (Planner, Maker, Speaker, Helper)
          </p>
          <div id="students-list"></div>
        </div>

        <button class="btn-primary" onclick="createGroup()" id="btn-create-group" style="margin-top: 20px;">
          <i class="fas fa-users"></i> Crear Grupo
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  await loadSchoolsForGroup();
}

async function loadSchoolsForGroup() {
  const select = document.getElementById('group-school');
  if (!select) return;

  try {
    let query = _supabase.from('schools').select('code, name, level').order('name');

    if (userRole === 'docente') {
      const { data: assignments } = await _supabase
        .from('teacher_assignments')
        .select('school_code')
        .eq('teacher_id', currentUser.id);

      if (assignments && assignments.length > 0) {
        const schoolCodes = [...new Set(assignments.map(a => a.school_code))];
        query = query.in('code', schoolCodes);
      } else {
        select.innerHTML = '<option value="">No tienes establecimientos asignados</option>';
        return;
      }
    }

    const { data: schools } = await query;

    if (schools && schools.length > 0) {
      select.innerHTML = '<option value="">Seleccionar...</option>' +
        schools.map(s => `<option value="${s.code}" data-level="${s.level}">${sanitizeInput(s.name)}</option>`).join('');
    }
  } catch (err) {
    console.error('Error cargando establecimientos:', err);
  }
}

async function loadGradesForGroup() {
  const schoolSelect = document.getElementById('group-school');
  const gradeSelect = document.getElementById('group-grade');
  const sectionSelect = document.getElementById('group-section');

  if (!schoolSelect || !gradeSelect || !sectionSelect) return;

  const schoolCode = schoolSelect.value;

  // Limpiar grado y sección
  gradeSelect.innerHTML = '<option value="">Cargando grados...</option>';
  sectionSelect.innerHTML = '<option value="">Seleccionar grado primero...</option>';

  if (!schoolCode) {
    gradeSelect.innerHTML = '<option value="">Seleccionar establecimiento primero...</option>';
    return;
  }

  try {
    let uniqueGrades = [];

    if (userRole === 'docente') {
      // Para docentes, usamos sus asignaciones como filtro
      const { data: assignments } = await _supabase
        .from('teacher_assignments')
        .select('grade')
        .eq('teacher_id', currentUser.id)
        .eq('school_code', schoolCode);

      if (assignments) {
        uniqueGrades = [...new Set(assignments.map(a => a.grade))].sort();
      }
    } else {
      // Para otros (admin), obtenemos grados de los estudiantes
      const { data: students } = await _supabase
        .from('students')
        .select('grade')
        .eq('school_code', schoolCode)
        .neq('grade', null);

      if (students) {
        uniqueGrades = [...new Set(students.map(s => s.grade))].sort();
      }
    }

    if (uniqueGrades.length > 0) {
      gradeSelect.innerHTML = '<option value="">Seleccionar grado...</option>' +
        uniqueGrades.map(g => `<option value="${g}">${g}</option>`).join('');
    } else {
      gradeSelect.innerHTML = '<option value="">Sin grados disponibles</option>';
    }
  } catch (err) {
    console.error('Error cargando grados:', err);
    gradeSelect.innerHTML = '<option value="">Error al cargar grados</option>';
  }
}

async function loadSectionsForGroup() {
  const schoolSelect = document.getElementById('group-school');
  const gradeSelect = document.getElementById('group-grade');
  const sectionSelect = document.getElementById('group-section');

  if (!schoolSelect || !gradeSelect || !sectionSelect) return;

  const schoolCode = schoolSelect.value;
  const grade = gradeSelect.value;

  sectionSelect.innerHTML = '<option value="">Cargando secciones...</option>';

  if (!schoolCode || !grade) {
    sectionSelect.innerHTML = '<option value="">Seleccionar grado primero...</option>';
    return;
  }

  try {
    let uniqueSections = [];

    if (userRole === 'docente') {
      // Filtrar secciones por asignación
      const { data: assignments } = await _supabase
        .from('teacher_assignments')
        .select('section')
        .eq('teacher_id', currentUser.id)
        .eq('school_code', schoolCode)
        .eq('grade', grade);

      if (assignments) {
        uniqueSections = [...new Set(assignments.map(a => a.section))].sort();
      }
    } else {
      // Obtener secciones de los estudiantes (admin)
      const { data: students } = await _supabase
        .from('students')
        .select('section')
        .eq('school_code', schoolCode)
        .eq('grade', grade)
        .neq('section', null);

      if (students) {
        uniqueSections = [...new Set(students.map(s => s.section))].sort();
      }
    }

    if (uniqueSections.length > 0) {
      sectionSelect.innerHTML = '<option value="">Seleccionar sección...</option>' +
        uniqueSections.map(s => `<option value="${s}">${s}</option>`).join('');
    } else {
      sectionSelect.innerHTML = '<option value="">Sin secciones disponibles</option>';
    }
  } catch (err) {
    console.error('Error cargando secciones:', err);
    sectionSelect.innerHTML = '<option value="">Error al cargar secciones</option>';
  }
}

async function loadStudentsForGroup() {
  const schoolCode = document.getElementById('group-school')?.value;
  const grade = document.getElementById('group-grade')?.value;
  const section = document.getElementById('group-section')?.value;
  const container = document.getElementById('students-list');
  const selectionDiv = document.getElementById('students-selection');

  if (!schoolCode || !grade || !section || !container) return;

  try {
    const { data: allStudents, error } = await _supabase
      .from('students')
      .select('id, full_name, username')
      .eq('school_code', schoolCode)
      .eq('grade', grade)
      .eq('section', section)
      .order('full_name');

    if (error) throw error;

    if (!allStudents || allStudents.length === 0) {
      container.innerHTML = '<p class="empty-state">No hay estudiantes en este grado y sección</p>';
      selectionDiv.style.display = 'block';
      return;
    }

    const { data: groupMembers, error: membersError } = await _supabase
      .from('group_members')
      .select('student_id');

    if (membersError) throw membersError;

    const assignedStudentIds = new Set(groupMembers?.map(m => m.student_id) || []);
    const availableStudents = allStudents.filter(s => !assignedStudentIds.has(s.id));

    if (availableStudents.length === 0) {
      container.innerHTML = '<p class="empty-state">⚠️ Todos los estudiantes de este grado ya están asignados a grupos</p>';
      selectionDiv.style.display = 'block';
      return;
    }

    container.innerHTML = availableStudents.map(s => `
      <div class="student-select-item" style="margin-bottom: 15px; padding: 15px; background: var(--light); border-radius: 8px;">
        <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: pointer;">
          <input type="checkbox" class="student-checkbox" value="${s.id}" onchange="toggleStudentRole(this)">
          <strong>${sanitizeInput(s.full_name)}</strong>
          <code style="background: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem;">@${s.username}</code>
        </label>
        <div class="role-selection" style="display: none; margin-left: 30px;">
          <label style="font-size: 0.9rem; color: var(--text-light); display: block; margin-bottom: 5px;">Asignar rol:</label>
          <select class="student-role-select input-field" style="margin-top: 5px;" disabled>
            <option value="">Sin rol asignado</option>
            ${GROUP_ROLES.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
          </select>
        </div>
      </div>
    `).join('');

    selectionDiv.style.display = 'block';

  } catch (err) {
    console.error('Error cargando estudiantes:', err);
  }
}

function toggleStudentRole(checkbox) {
  const container = checkbox.closest('.student-select-item');
  const roleDiv = container.querySelector('.role-selection');
  const roleSelect = container.querySelector('.student-role-select');

  if (checkbox.checked) {
    roleDiv.style.display = 'block';
    roleSelect.disabled = false;
  } else {
    roleDiv.style.display = 'none';
    roleSelect.disabled = true;
    roleSelect.value = '';
  }
}

function toggleGroupAccordion(groupId) {
  const header = document.getElementById(`group-header-${groupId}`);
  const body = document.getElementById(`group-body-${groupId}`);

  if (!header || !body) return;

  const isActive = header.classList.contains('active');

  document.querySelectorAll('.group-accordion-header').forEach(h => h.classList.remove('active'));
  document.querySelectorAll('.group-accordion-body').forEach(b => b.classList.remove('active'));

  if (!isActive) {
    header.classList.add('active');
    body.classList.add('active');
  }
}

// getRoleLabel se encuentra definida anteriormente
// ================================================
// PARTE 3: CREAR GRUPO
// ================================================

async function createGroup() {
  const name = document.getElementById('group-name')?.value.trim();
  const schoolCode = document.getElementById('group-school')?.value;
  const grade = document.getElementById('group-grade')?.value;
  const section = document.getElementById('group-section')?.value;
  const btn = document.getElementById('btn-create-group');

  if (!name) {
    return showToast('❌ Ingresa un nombre para el grupo', 'error');
  }

  if (!schoolCode || !grade || !section) {
    return showToast('❌ Selecciona establecimiento, grado y sección', 'error');
  }

  const checkboxes = document.querySelectorAll('.student-checkbox:checked');

  if (checkboxes.length < 3 || checkboxes.length > 4) {
    return showToast('❌ Un grupo debe tener entre 3 y 4 integrantes', 'error');
  }

  const members = [];
  const roles = [];

  checkboxes.forEach(cb => {
    const container = cb.closest('.student-select-item');
    const roleSelect = container.querySelector('.student-role-select');
    const studentId = cb.value;
    const role = roleSelect?.value || null;

    members.push({ student_id: studentId, role: role });
    if (role) roles.push(role);
  });

  const uniqueRoles = new Set(roles);
  if (roles.length !== uniqueRoles.size) {
    return showToast('❌ No puedes asignar el mismo rol a varios estudiantes', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';

  try {
    const { data: groupData, error: groupError } = await _supabase
      .from('groups')
      .insert({
        name: name,
        school_code: schoolCode,
        grade: grade,
        section: section,
        created_by: currentUser.id
      })
      .select()
      .single();

    if (groupError) throw groupError;

    const membersToInsert = members.map(m => ({
      group_id: groupData.id,
      student_id: m.student_id,
      role: m.role
    }));

    const { error: membersError } = await _supabase
      .from('group_members')
      .insert(membersToInsert);

    if (membersError) {
      if (membersError.code === '23514') {
        throw new Error('El rol "Helper" aún no está permitido en la base de datos de Supabase. Debes ejecutar el comando SQL de actualización para permitir este nuevo rol.');
      }
      throw membersError;
    }

    showToast('✅ Grupo creado correctamente', 'success');
    document.getElementById('create-group-modal').remove();
    await loadGroups();

  } catch (err) {
    console.error('Error creando grupo:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-users"></i> Crear Grupo';
  }
}
// ================================================
// PARTE 4: EDITAR Y ELIMINAR GRUPOS
// ================================================

async function openEditGroupModal(groupId) {
  try {
    const { data: group, error } = await _supabase
      .from('groups')
      .select(`
        *,
        schools(name),
        group_members(
          id,
          student_id,
          role,
          students(id, full_name, username)
        )
      `)
      .eq('id', groupId)
      .single();

    if (error) throw error;

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'edit-group-modal';

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>✏️ Editar Grupo: ${sanitizeInput(group.name)}</h2>
          <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body">
          <p style="background: var(--light-gray); padding: 16px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid var(--primary-color);">
            <strong style="font-size: 1rem;">🏫 ${group.schools?.name || 'Establecimiento'}</strong><br>
            <small style="color: var(--text-light);">📚 ${group.grade} - Sección ${group.section}</small>
          </p>

          <h4 style="margin-bottom: 12px;">Cambiar Integrantes y Roles</h4>
          <p style="color: var(--text-light); margin-bottom: 15px; font-size: 0.85rem;">
            Puedes agregar, quitar o cambiar roles de los integrantes. Un grupo debe tener entre 3 y 4 integrantes.
          </p>
          <div id="edit-students-list"></div>
          
          <button class="btn-primary" onclick="saveGroupChanges(${groupId})" id="btn-save-group" style="margin-top: 20px;">
            <i class="fas fa-save"></i> Guardar Cambios
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    await loadStudentsForEdit(groupId, group);

  } catch (err) {
    console.error('Error cargando grupo:', err);
    showToast('❌ Error al cargar grupo', 'error');
  }
}

async function loadStudentsForEdit(groupId, group) {
  const container = document.getElementById('edit-students-list');
  if (!container) return;

  try {
    const { data: allStudents } = await _supabase
      .from('students')
      .select('id, full_name, username')
      .eq('school_code', group.school_code)
      .eq('grade', group.grade)
      .eq('section', group.section)
      .order('full_name');

    const { data: otherGroupMembers } = await _supabase
      .from('group_members')
      .select('student_id, group_id')
      .neq('group_id', groupId);

    const assignedToOtherGroups = new Set(otherGroupMembers?.map(m => m.student_id) || []);

    const currentMemberIds = new Set(group.group_members.map(m => m.student_id));
    const currentMembers = group.group_members.reduce((acc, m) => {
      acc[m.student_id] = m.role;
      return acc;
    }, {});

    const availableStudents = allStudents.filter(s =>
      currentMemberIds.has(s.id) || !assignedToOtherGroups.has(s.id)
    );

    if (availableStudents.length === 0) {
      container.innerHTML = '<p class="empty-state">No hay estudiantes disponibles</p>';
      return;
    }

    container.innerHTML = availableStudents.map(s => {
      const isChecked = currentMemberIds.has(s.id);
      const currentRole = currentMembers[s.id] || '';
      const isInOtherGroup = assignedToOtherGroups.has(s.id);

      return `
        <div class="student-select-item" style="margin-bottom: 15px; padding: 15px; background: var(--light); border-radius: 8px; ${isInOtherGroup ? 'opacity: 0.6;' : ''}">
          <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: pointer;">
            <input 
              type="checkbox" 
              class="student-checkbox" 
              value="${s.id}" 
              ${isChecked ? 'checked' : ''} 
              ${isInOtherGroup ? 'disabled' : ''}
              onchange="toggleStudentRole(this)"
            >
            <strong>${sanitizeInput(s.full_name)}</strong>
            <code style="background: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem;">@${s.username}</code>
            ${isInOtherGroup ? '<span style="color: var(--warning-color); font-size: 0.75rem; margin-left: 8px;">⚠️ En otro grupo</span>' : ''}
          </label>
          <div class="role-selection" style="${isChecked ? '' : 'display: none;'} margin-left: 30px;">
            <label style="font-size: 0.9rem; color: var(--text-light); display: block; margin-bottom: 5px;">Asignar rol:</label>
            <select class="student-role-select input-field" style="margin-top: 5px;" ${isChecked ? '' : 'disabled'}>
              <option value="">Sin rol asignado</option>
              ${GROUP_ROLES.map(r => `<option value="${r.value}" ${currentRole === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
            </select>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Error cargando estudiantes:', err);
  }
}

async function saveGroupChanges(groupId) {
  const btn = document.getElementById('btn-save-group');

  const checkboxes = document.querySelectorAll('.student-checkbox:checked');

  if (checkboxes.length < 3 || checkboxes.length > 4) {
    return showToast('❌ Un grupo debe tener entre 3 y 4 integrantes', 'error');
  }

  const members = [];
  const roles = [];

  checkboxes.forEach(cb => {
    const container = cb.closest('.student-select-item');
    const roleSelect = container.querySelector('.student-role-select');
    const studentId = cb.value;
    const role = roleSelect?.value || null;

    members.push({ student_id: studentId, role: role });
    if (role) roles.push(role);
  });

  const uniqueRoles = new Set(roles);
  if (roles.length !== uniqueRoles.size) {
    return showToast('❌ No puedes asignar el mismo rol a varios estudiantes', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

  try {
    await _supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId);

    const membersToInsert = members.map(m => ({
      group_id: groupId,
      student_id: m.student_id,
      role: m.role
    }));

    const { error } = await _supabase
      .from('group_members')
      .insert(membersToInsert);

    if (error) {
      if (error.code === '23514') {
        throw new Error('El rol "Helper" aún no está permitido en la base de datos de Supabase. Debes ejecutar el comando SQL de actualización para permitir este nuevo rol.');
      }
      throw error;
    }

    showToast('✅ Grupo actualizado correctamente', 'success');
    document.getElementById('edit-group-modal').remove();
    await loadGroups();

  } catch (err) {
    console.error('Error actualizando grupo:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
  }
}

async function deleteGroup(groupId, groupName) {
  if (!confirm(`¿Eliminar el grupo "${groupName}"?`)) {
    return;
  }

  try {
    const { error } = await _supabase
      .from('groups')
      .delete()
      .eq('id', groupId);

    if (error) throw error;

    showToast('✅ Grupo eliminado', 'success');
    await loadGroups();

  } catch (err) {
    console.error('Error eliminando grupo:', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}

console.log('✅ groups.js cargado completamente');
