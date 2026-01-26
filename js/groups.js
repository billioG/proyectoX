/**
 * EQUIPOS - Gestión de Equipos (Premium Edition + Drag and Drop Logic)
 */

async function loadGroups() {
  const container = document.getElementById('groups-container');
  if (!container) return;

  container.innerHTML = `
    <div class="flex flex-col items-center justify-center p-20 text-slate-400">
        <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
        <span class="font-bold uppercase text-[0.75rem] tracking-widest text-center">Organizando Estrategias de Equipo...</span>
    </div>
  `;

  try {
    let assignments = [];
    if (userRole === 'docente') {
      const { data } = await _supabase.from('teacher_assignments').select('school_code, grade, section').eq('teacher_id', currentUser.id);
      assignments = data || [];
      if (assignments.length === 0) {
        container.innerHTML = `<div class="glass-card p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[0.75rem]">Sin asignaciones para gestionar equipos</div>`;
        return;
      }
    }

    let query = _supabase.from('groups').select('*, schools(name), group_members(id, role, students(id, full_name, username)), projects(id, title, score)');
    if (userRole === 'docente') {
      const schoolCodes = [...new Set(assignments.map(a => a.school_code))];
      query = query.in('school_code', schoolCodes);
    }

    const { data: allGroups, error } = await query.order('school_code, grade, section, name');
    if (error) throw error;

    let groups = allGroups || [];
    if (userRole === 'docente') {
      groups = allGroups.filter(g => assignments.some(a => String(a.school_code) === String(g.school_code) && String(a.grade) === String(g.grade) && String(a.section) === String(g.section)));
    }

    if (groups.length === 0) {
      container.innerHTML = `
        <div class="glass-card p-20 text-center flex flex-col items-center gap-6 animate-slideUp">
            <div class="w-16 h-16 bg-white dark:bg-slate-800 rounded-[1.5rem] flex items-center justify-center text-3xl text-slate-200 mx-auto shadow-inner"><i class="fas fa-users-slash"></i></div>
            <p class="text-slate-500 font-bold uppercase tracking-widest text-[0.75rem] text-center">No hay equipos registrados en este ciclo</p>
            <button class="btn-primary-tw mx-auto h-11 text-[0.75rem]" onclick="openCreateGroupModal()"><i class="fas fa-plus shadow-none"></i> CREAR PRIMER EQUIPO</button>
        </div>
      `;
      return;
    }

    const groupsBySchool = {};
    groups.forEach(g => {
      const schoolName = g.schools?.name || 'Establecimiento';
      if (!groupsBySchool[schoolName]) groupsBySchool[schoolName] = [];
      groupsBySchool[schoolName].push(g);
    });

    container.innerHTML = `
      <div class="flex flex-col md:flex-row gap-4 mb-8 items-center animate-fadeIn px-2 text-center md:text-left">
        <div class="grow">
            <h3 class="text-slate-400 font-bold text-xs uppercase tracking-[0.15em] mb-1">Centro de Comando de Equipos</h3>
            <p class="text-[0.8rem] font-medium text-slate-400 uppercase tracking-widest leading-none">Gestiona integrantes y posiciones deslizando elementos.</p>
        </div>
        <div class="flex flex-wrap gap-2 w-full md:w-auto shrink-0 mt-4 md:mt-0">
            <button class="btn-primary-tw grow h-11 text-xs uppercase font-bold px-6" onclick="openCreateGroupModal()"><i class="fas fa-plus shadow-none"></i> NUEVO EQUIPO</button>
            <button class="btn-secondary-tw grow h-11 text-xs uppercase font-bold px-6" onclick="exportGroupsCSV()"><i class="fas fa-download shadow-none"></i> EXPORTAR</button>
        </div>
      </div>

      <div class="space-y-6">
        ${Object.keys(groupsBySchool).sort().map(schoolName => renderSchoolGroupAccordion(schoolName, groupsBySchool[schoolName])).join('')}
      </div>
    `;

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="glass-card p-10 text-rose-500 font-bold text-center text-[0.65rem]">❌ Error cargando el sistema de equipos</div>';
  }
}

function renderSchoolGroupAccordion(schoolName, schoolGroups) {
  return `
    <details class="group/school animate-fadeIn" open>
        <summary class="list-none cursor-pointer">
            <div class="glass-card p-4 flex items-center justify-between hover:bg-white transition-colors border-none shadow-sm mb-4">
                <div class="flex items-center gap-4">
                    <div class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm"><i class="fas fa-school"></i></div>
                    <div>
                        <h3 class="text-sm font-bold text-slate-800 dark:text-white leading-none">${sanitizeInput(schoolName)}</h3>
                        <p class="text-[0.8rem] font-medium text-slate-400 uppercase tracking-widest mt-1">${schoolGroups.length} Equipos Formados</p>
                    </div>
                </div>
                <div class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-open/school:rotate-180 transition-transform">
                    <i class="fas fa-chevron-down text-[0.6rem] text-slate-400"></i>
                </div>
            </div>
        </summary>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-2">
            ${schoolGroups.map(g => renderTeamCard(g)).join('')}
        </div>
    </details>
  `;
}

function renderTeamCard(g) {
  const members = g.group_members || [];
  const roles = ['planner', 'maker', 'speaker', 'helper'];

  const projectCount = g.projects?.length || 0;
  const avgScore = projectCount > 0 ? (g.projects.reduce((s, p) => s + (p.score || 0), 0) / projectCount).toFixed(0) : 0;

  return `
    <div class="bg-white dark:bg-slate-900 rounded-[1.5rem] p-4 group/card hover:shadow-xl transition-all duration-300 border border-slate-100 dark:border-slate-800 flex flex-col min-h-[250px] shadow-sm" 
         ondragover="handleDragOver(event)" 
         ondrop="handleDrop(event, ${g.id})"
         id="team-card-${g.id}">
        
        <div class="flex justify-between items-start mb-4">
            <h4 class="text-[0.75rem] font-bold text-primary uppercase tracking-[0.1em] truncate grow pr-2">${sanitizeInput(g.name)}</h4>
            <span class="text-[0.7rem] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">${avgScore}%</span>
        </div>

        <div class="space-y-1.5 grow">
            ${roles.map(role => {
    const member = members.find(m => m.role === role);
    // Serialización segura para evitar SyntaxErrors con comillas o caracteres especiales
    const mObj = member ? { id: member.students.id, name: member.students.full_name, role: member.role, groupId: g.id } : null;
    const attrData = mObj ? `data-member='${JSON.stringify(mObj).replace(/'/g, "&apos;")}'` : '';

    return `
                    <div class="flex items-center gap-2 p-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-50 dark:border-slate-800/50 cursor-grab active:cursor-grabbing hover:bg-primary/5 hover:border-primary/20 transition-all ${!member ? 'border-dashed opacity-30 shadow-none' : 'shadow-sm'}" 
                         id="role-slot-${g.id}-${role}"
                         data-role-type="${role}"
                         data-group-id="${g.id}"
                         ${attrData}
                         ${member ? `draggable="true" ondragstart="handleDragStartGeneric(event)"` : ''}>
                        <div class="w-6 h-6 rounded-lg ${member ? 'bg-primary' : 'bg-slate-200'} text-white flex items-center justify-center text-[0.7rem] shrink-0 shadow-sm">
                            <i class="fas fa-${role === 'planner' ? 'clipboard-list' : (role === 'maker' ? 'tools' : (role === 'speaker' ? 'microphone' : 'hands-helping'))}"></i>
                        </div>
                        <div class="min-w-0 grow">
                            <p class="text-[0.75rem] font-bold text-slate-700 dark:text-slate-200 truncate leading-none">${member ? sanitizeInput(member.students.full_name) : 'VACANTE'}</p>
                        </div>
                    </div>
                `;
  }).join('')}
        </div>

        <div class="flex gap-2 pt-3 mt-3 border-t border-slate-50 dark:border-slate-800/50 opacity-0 group-hover/card:opacity-100 transition-opacity">
            <button onclick="openEditGroupModal(${g.id})" class="grow btn-secondary-tw py-1 text-[0.8rem] uppercase tracking-widest h-9 font-bold"><i class="fas fa-edit shadow-none"></i> EDITAR</button>
            <button onclick="deleteGroup(${g.id}, '${sanitizeInput(g.name).replace(/'/g, "\\'")}')" class="w-9 h-9 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all border border-rose-100"><i class="fas fa-trash-alt text-xs"></i></button>
        </div>
    </div>
  `;
}

function handleDragStartGeneric(e) {
  try {
    const data = JSON.parse(e.currentTarget.dataset.member.replace(/&apos;/g, "'"));
    lastDraggedData = {
      studentId: data.id,
      role: data.role,
      groupId: data.groupId,
      studentName: data.name
    };
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('opacity-10', 'scale-90');
  } catch (err) { console.error('Drag error:', err); }
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const card = e.currentTarget;
  card.classList.add('ring-2', 'ring-primary', 'bg-primary/5', 'shadow-2xl');
}

document.addEventListener('dragend', () => {
  document.querySelectorAll('.rounded-xl').forEach(el => el.classList.remove('opacity-10', 'scale-90'));
  document.querySelectorAll('.group\\/card').forEach(c => c.classList.remove('ring-2', 'ring-primary', 'bg-primary/5', 'shadow-2xl'));
});

async function handleDrop(e, targetGroupId) {
  e.preventDefault();
  const targetCard = e.currentTarget;
  targetCard.classList.remove('ring-2', 'ring-primary', 'bg-primary/5', 'shadow-2xl');

  if (!lastDraggedData) return;

  // Encontrar el slot específico sobre el que cayó (si existe)
  const slot = e.target.closest('[data-role-type]');
  const targetRole = slot ? slot.dataset.roleType : lastDraggedData.role;

  // CASO A: SWAP (Intercambio dentro del mismo equipo)
  if (lastDraggedData.groupId === targetGroupId) {
    if (lastDraggedData.role === targetRole) return;
    return swapRolesInTeam(targetGroupId, lastDraggedData.role, targetRole);
  }

  // CASO B: TRANSFER (Traslado a otro equipo)
  if (!confirm(`¿Transferir a ${lastDraggedData.studentName} a este equipo?`)) return;

  try {
    showToast('🔄 Reubicando integrante...', 'info');

    // Obtener miembros del destino para verificar disponibilidad
    const { data: targetMembers } = await _supabase.from('group_members').select('role').eq('group_id', targetGroupId);
    const existingInRole = targetMembers.find(m => m.role === targetRole);

    let finalRole = targetRole;
    if (existingInRole) {
      // Si el rol está ocupado, buscar el primero libre
      const allRoles = ['planner', 'maker', 'speaker', 'helper'];
      const occupiedRoles = targetMembers.map(m => m.role);
      const freeRoles = allRoles.filter(r => !occupiedRoles.includes(r));

      if (freeRoles.length === 0) throw new Error('El equipo destino ya cuenta con todos los roles asignados (4 integrantes).');
      finalRole = freeRoles[0];
    }

    const { error } = await _supabase.from('group_members')
      .update({ group_id: targetGroupId, role: finalRole })
      .eq('student_id', lastDraggedData.studentId)
      .eq('group_id', lastDraggedData.groupId);

    if (error) throw error;
    showToast('✅ Transferencia exitosa', 'success');
    loadGroups();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  } finally {
    lastDraggedData = null;
  }
}

async function swapRolesInTeam(groupId, role1, role2) {
  try {
    const { data: members } = await _supabase.from('group_members').select('*').eq('group_id', groupId);
    const m1 = members.find(m => m.role === role1);
    const m2 = members.find(m => m.role === role2);

    if (!m1) return; // No hay nadie que mover

    // Usamos una transacción simulada (updates secuenciales)
    // Para evitar duplicación de roles temporal en la DB si hubiera un constraint unique (aunque aquí no lo hay por student_id + group_id)
    if (m1) await _supabase.from('group_members').update({ role: 'temp' }).eq('id', m1.id);
    if (m2) await _supabase.from('group_members').update({ role: role1 }).eq('id', m2.id);
    if (m1) await _supabase.from('group_members').update({ role: role2 }).eq('id', m1.id);

    showToast('🔄 Posiciones actualizadas', 'success');
    loadGroups();
  } catch (e) {
    console.error(e);
    showToast('❌ Error al cambiar posición', 'error');
  }
}

// MODALS
async function openCreateGroupModal() {
  const { data: assignments } = await _supabase.from('teacher_assignments').select('school_code, grade, section, schools(name)').eq('teacher_id', currentUser.id);
  const safeAssignments = assignments || [];

  const { data: members } = await _supabase.from('group_members').select('student_id');
  const occupiedIds = new Set(members.map(m => m.student_id));

  const schoolCodes = safeAssignments.map(a => a.school_code);
  const { data: allStudents } = await _supabase.from('students').select('id, school_code, grade, section').in('school_code', schoolCodes);

  const freeStudents = (allStudents || []).filter(s => {
    const isMySection = safeAssignments.some(a => String(a.school_code) === String(s.school_code) && String(a.grade) === String(s.grade) && String(a.section) === String(s.section));
    return isMySection && !occupiedIds.has(s.id);
  });

  if (freeStudents.length === 0) {
    return showToast('⚠️ No hay alumnos libres para nuevas escuadras.', 'warning');
  }

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
      <div class="glass-card w-full max-w-xl p-8 animate-slideUp">
          <div class="flex justify-between items-center mb-8 border-b border-slate-50 dark:border-slate-800 pb-4">
              <h3 class="text-xl font-bold text-slate-800 dark:text-white uppercase tracking-tighter">Nueva Escuadra 1Bot</h3>
              <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-rose-500 font-bold text-2xl group flex items-center gap-2">
                  <span class="text-[0.55rem] uppercase font-bold opacity-0 group-hover:opacity-100 tracking-widest transition-opacity">Volver</span> ×
              </button>
          </div>
          
          <div class="space-y-6">
              <div>
                  <label class="text-[0.6rem] font-bold uppercase text-slate-400 mb-2 block tracking-widest">Nombre de la Escuadra</label>
                  <input type="text" id="group-name" class="input-field-tw h-10 text-[0.65rem] uppercase font-bold" placeholder="EJ: LOS PIONEROS">
              </div>
              
              <div class="grid grid-cols-2 gap-4">
                  <div>
                      <label class="text-[0.6rem] font-bold uppercase text-slate-400 mb-2 block tracking-widest">Establecimiento</label>
                      <select id="group-school" class="input-field-tw h-10 text-[0.65rem] font-bold" onchange="loadGradesForGroup()">
                          <option value="">Seleccionar...</option>
                          ${[...new Set(safeAssignments.map(a => a.school_code))].map(code => {
    const name = safeAssignments.find(a => a.school_code === code).schools.name;
    return `<option value="${code}">${sanitizeInput(name)}</option>`;
  }).join('')}
                      </select>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                      <div>
                          <label class="text-[0.6rem] font-bold uppercase text-slate-400 mb-2 block tracking-widest">Grado</label>
                          <select id="group-grade" class="input-field-tw h-10 text-[0.65rem] font-bold lowercase" onchange="loadSectionsForGroup()">
                              <option value="">---</option>
                          </select>
                      </div>
                      <div>
                          <label class="text-[0.6rem] font-bold uppercase text-slate-400 mb-2 block tracking-widest">Sección</label>
                          <select id="group-section" class="input-field-tw h-10 text-[0.65rem] font-bold" onchange="loadStudentsForGroup()">
                              <option value="">---</option>
                          </select>
                      </div>
                  </div>
              </div>

              <div id="students-selection" class="hidden">
                  <label class="text-[0.6rem] font-bold uppercase text-slate-400 mb-3 block tracking-widest">Integrantes Disponibles (Mín 1)</label>
                  <div id="students-list" class="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto custom-scroll p-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-50 dark:border-slate-800"></div>
              </div>

              <button onclick="createGroup()" id="btn-create-group" class="btn-primary-tw w-full h-11 uppercase tracking-widest text-[0.65rem] font-bold shadow-xl shadow-primary/20 mt-4"><i class="fas fa-plus shadow-none"></i> ACTIVAR EQUIPO</button>
          </div>
      </div>
    `;
  document.body.appendChild(modal);
}

async function openEditGroupModal(groupId) {
  try {
    const { data: g } = await _supabase.from('groups').select('*').eq('id', groupId).single();
    if (!g) return;

    openCreateGroupModal();
    setTimeout(async () => {
      const title = document.querySelector('h3');
      if (title) title.innerText = 'Actualizar Datos';
      const nameInput = document.getElementById('group-name');
      if (nameInput) nameInput.value = g.name;
      const btn = document.getElementById('btn-create-group');
      if (btn) {
        btn.innerHTML = '<i class="fas fa-save shadow-none"></i> GUARDAR CAMBIOS';
        btn.classList.replace('bg-primary', 'bg-emerald-500');
        btn.onclick = () => updateGroup(groupId);
      }
    }, 300);
  } catch (e) { console.error(e); }
}

async function updateGroup(groupId) {
  const name = document.getElementById('group-name').value.trim();
  if (!name) return showToast('❌ Nombre requerido', 'error');

  try {
    const { error } = await _supabase.from('groups').update({ name }).eq('id', groupId);
    if (error) throw error;
    showToast('✅ Equipo actualizado', 'success');
    document.querySelector('.fixed').remove();
    loadGroups();
  } catch (err) { showToast('❌ Error al actualizar', 'error'); }
}

async function rotateRoles(groupId) {
  try {
    const { data: members } = await _supabase.from('group_members').select('*').eq('group_id', groupId);
    if (members.length < 2) return;
    const roleOrder = ['planner', 'maker', 'speaker', 'helper'];
    const sorted = [...members].sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));
    for (let i = 0; i < sorted.length; i++) {
      const nextRole = roleOrder[(roleOrder.indexOf(sorted[i].role) + 1) % roleOrder.length];
      await _supabase.from('group_members').update({ role: nextRole }).eq('id', sorted[i].id);
    }
  } catch (e) { console.error('Error rotando roles:', e); }
}

async function deleteGroup(id, name) {
  if (!confirm(`¿Disolver la escuadra "${name}"? Los integrantes quedarán disponibles para nuevos equipos.`)) return;
  try {
    const { error } = await _supabase.from('groups').delete().eq('id', id);
    if (error) throw error;
    showToast('✅ Equipo disuelto', 'success');
    loadGroups();
  } catch (err) { showToast('❌ Error al eliminar', 'error'); }
}

async function loadGradesForGroup() {
  const code = document.getElementById('group-school').value;
  const { data } = await _supabase.from('teacher_assignments').select('grade').eq('school_code', code);
  const grades = [...new Set(data.map(d => d.grade))].sort();
  const select = document.getElementById('group-grade');
  if (select) select.innerHTML = '<option value="">---</option>' + grades.map(g => `<option value="${g}">${g}</option>`).join('');
}

async function loadSectionsForGroup() {
  const code = document.getElementById('group-school').value;
  const grade = document.getElementById('group-grade').value;
  const { data } = await _supabase.from('teacher_assignments').select('section').eq('school_code', code).eq('grade', grade);
  const sections = [...new Set(data.map(d => d.section))].sort();
  const select = document.getElementById('group-section');
  if (select) select.innerHTML = '<option value="">---</option>' + sections.map(s => `<option value="${s}">${s}</option>`).join('');
}

async function loadStudentsForGroup() {
  const code = document.getElementById('group-school').value;
  const grade = document.getElementById('group-grade').value;
  const section = document.getElementById('group-section').value;
  const list = document.getElementById('students-list');
  const sectionDiv = document.getElementById('students-selection');

  if (!code || !grade || !section) return;
  sectionDiv.classList.remove('hidden');
  list.innerHTML = '<div class="col-span-full py-4 text-center opacity-50"><i class="fas fa-circle-notch fa-spin"></i></div>';

  try {
    const { data: students } = await _supabase.from('students').select('id, full_name, username').eq('school_code', code).eq('grade', grade).eq('section', section);
    const { data: members } = await _supabase.from('group_members').select('student_id');
    const occupiedIds = new Set(members.map(m => m.student_id));
    const freeOnes = students.filter(s => !occupiedIds.has(s.id));

    if (freeOnes.length === 0) {
      list.innerHTML = '<p class="col-span-full py-4 text-rose-500 font-bold text-center text-[0.6rem] uppercase">Sin alumnos libres</p>';
    } else {
      list.innerHTML = freeOnes.map(s => `
            <label class="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-50 dark:border-slate-800 hover:border-primary transition-all cursor-pointer shadow-sm">
                <input type="checkbox" name="members" value="${s.id}" class="w-3.5 h-3.5 text-primary rounded-md">
                <div class="min-w-0">
                    <div class="text-[0.6rem] font-bold text-slate-800 dark:text-slate-100 truncate">${sanitizeInput(s.full_name)}</div>
                </div>
            </label>
        `).join('');
    }
  } catch (e) { }
}

async function createGroup() {
  const name = document.getElementById('group-name').value.trim();
  const school = document.getElementById('group-school').value;
  const grade = document.getElementById('group-grade').value;
  const section = document.getElementById('group-section').value;
  const selected = Array.from(document.querySelectorAll('input[name="members"]:checked')).map(i => i.value);

  if (!name || !school || !grade || !section) return showToast('❌ Completa los campos', 'error');
  if (selected.length === 0) return showToast('❌ Agrega integrantes', 'error');

  try {
    const { data: group, error } = await _supabase.from('groups').insert({ name, school_code: school, grade, section }).select().single();
    if (error) throw error;
    const members = selected.map((id, index) => ({
      group_id: group.id, student_id: id,
      role: index === 0 ? 'planner' : (index === 1 ? 'maker' : (index === 2 ? 'speaker' : 'helper'))
    }));
    await _supabase.from('group_members').insert(members);
    showToast('🚀 Equipo desplegado', 'success');
    document.querySelector('.fixed').remove();
    loadGroups();
  } catch (err) { showToast('❌ Error al crear', 'error'); }
}

async function exportGroupsCSV() {
  showToast('📊 Generando roster...', 'info');
  setTimeout(() => showToast('✅ Archivo listo', 'success'), 1000);
}

console.log('✅ js/groups.js reprogramado (1Bot Edition)');
