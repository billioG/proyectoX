// ================================================
// GESTIÓN DE ESTUDIANTES - PARTE 1: ACORDEÓN
// ================================================

async function loadStudents() {
  const container = document.getElementById('students-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Cargando estudiantes...</div>';

  try {
    const { data: students, error } = await _supabase
      .from('students')
      .select(`
        *,
        schools(name, code)
      `)
      .order('school_code, grade, section, full_name');

    if (error) throw error;

    if (!students || students.length === 0) {
      container.innerHTML = '<div class="empty-state">📭 No hay estudiantes registrados</div>';
      return;
    }

    // Agrupar por establecimiento
    const groupedBySchool = students.reduce((acc, student) => {
      const schoolCode = student.school_code || 'sin-asignar';
      if (!acc[schoolCode]) {
        acc[schoolCode] = {
          schoolName: student.schools?.name || 'Sin Establecimiento Asignado',
          students: []
        };
      }
      acc[schoolCode].students.push(student);
      return acc;
    }, {});

    container.innerHTML = `
      <div style="margin-bottom: 24px; display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn-primary" onclick="openAddStudentModal()">
          <i class="fas fa-user-plus"></i> Agregar Estudiante
        </button>
        <button class="btn-secondary" onclick="exportStudentsCSV()">
          <i class="fas fa-download"></i> Exportar CSV
        </button>
        <input 
          type="text" 
          id="search-students" 
          placeholder="🔍 Buscar estudiante..." 
          style="padding: 10px 16px; border: 1px solid var(--border-color); border-radius: 8px; flex: 1; min-width: 250px; font-size: 0.9rem;"
          onkeyup="filterStudents()"
        >
      </div>
      
      ${Object.entries(groupedBySchool).map(([schoolCode, schoolData]) => {
      const schoolStudents = schoolData.students;

      return `
          <div class="school-accordion">
            <div class="school-accordion-header" onclick="toggleSchoolAccordion('${schoolCode}')" id="school-header-${schoolCode}">
              <div style="flex: 1;">
                <h3 style="margin: 0; font-size: 1.2rem; font-weight: 600;">
                  🏫 ${sanitizeInput(schoolData.schoolName)}
                </h3>
                <small style="opacity: 0.8; font-size: 0.85rem;">
                  ${schoolStudents.length} estudiante(s) • Código: ${schoolCode}
                </small>
              </div>
              <div style="display: flex; gap: 12px; align-items: center;">
                <span style="background: rgba(255,255,255,0.2); padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 0.9rem;">
                  ${schoolStudents.length}
                </span>
                <i class="fas fa-chevron-down" style="font-size: 1.2rem; transition: transform 0.3s;"></i>
              </div>
            </div>
            
            <div class="school-accordion-body" id="school-body-${schoolCode}">
              <div style="overflow-x: auto;">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nombre</th>
                      <th>Username</th>
                      <th>Email</th>
                      <th>CUI</th>
                      <th>Género</th>
                      <th>Fecha Nac.</th>
                      <th>Grado</th>
                      <th>Sección</th>
                      <th>Password</th>
                      <th>QR</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${schoolStudents.map((s, index) => `
                      <tr class="student-row" data-name="${s.full_name.toLowerCase()}" data-username="${s.username.toLowerCase()}">
                        <td style="text-align: center; font-weight: 600;">${index + 1}</td>
                        <td>
                          ${s.profile_photo_url ? `<img src="${s.profile_photo_url}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; margin-right: 8px; vertical-align: middle; border: 2px solid var(--primary-color);">` : ''}
                          <strong>${sanitizeInput(s.full_name)}</strong>
                        </td>
                        <td>
                          <code>${sanitizeInput(s.username)}</code>
                          <button class="btn-icon" onclick="copyToClipboard('${s.username}')" title="Copiar" style="margin-left: 4px;">
                            <i class="fas fa-copy"></i>
                          </button>
                        </td>
                        <td><code style="font-size: 0.8rem;">${sanitizeInput(s.email)}</code></td>
                        <td><code style="font-size: 0.8rem;">${s.cui || 'N/A'}</code></td>
                        <td style="text-align: center;">${s.gender ? (s.gender === 'masculino' ? '👨' : '👩') : '-'}</td>
                        <td style="text-align: center; font-size: 0.85rem;">${s.birth_date ? new Date(s.birth_date).toLocaleDateString('es-GT') : '-'}</td>
                        <td style="text-align: center;">${sanitizeInput(s.grade)}</td>
                        <td style="text-align: center; font-weight: 600;">${sanitizeInput(s.section)}</td>
                        <td>
                          <code>${s.password_generated || '1bot.org'}</code>
                          <button class="btn-icon" onclick="copyToClipboard('${s.password_generated || '1bot.org'}')" title="Copiar" style="margin-left: 4px;">
                            <i class="fas fa-copy"></i>
                          </button>
                        </td>
                        <td style="text-align: center;">
                          <button class="btn-icon" onclick="viewStudentQR('${s.id}', '${sanitizeInput(s.full_name)}', '${s.username}')" title="Ver QR">
                            <i class="fas fa-qrcode"></i>
                          </button>
                        </td>
                        <td>
                          <button class="btn-icon" onclick="openResetPasswordModal('${s.id}', '${sanitizeInput(s.full_name)}')" title="Restablecer Contraseña" style="color: var(--primary-color);">
                            <i class="fas fa-key"></i>
                          </button>
                          <button class="btn-icon" onclick="editStudent('${s.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                          </button>
                          <button class="btn-icon" onclick="deleteStudent('${s.id}', '${sanitizeInput(s.full_name)}')" title="Eliminar" style="color: var(--danger-color);">
                            <i class="fas fa-trash"></i>
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;
    }).join('')}
    `;

    await updateTotalUsersCount();

  } catch (err) {
    console.error('Error cargando estudiantes:', err);
    container.innerHTML = '<div class="error-state">❌ Error al cargar estudiantes</div>';
  }
}

function toggleSchoolAccordion(schoolCode) {
  const header = document.getElementById(`school-header-${schoolCode}`);
  const body = document.getElementById(`school-body-${schoolCode}`);

  if (!header || !body) return;

  const isActive = header.classList.contains('active');

  // Cerrar todos
  document.querySelectorAll('.school-accordion-header').forEach(h => h.classList.remove('active'));
  document.querySelectorAll('.school-accordion-body').forEach(b => b.classList.remove('active'));

  // Abrir el seleccionado si no estaba activo
  if (!isActive) {
    header.classList.add('active');
    body.classList.add('active');
  }
}

function filterStudents() {
  const searchTerm = document.getElementById('search-students')?.value.toLowerCase().trim() || '';
  const rows = document.querySelectorAll('.student-row');
  const accordions = document.querySelectorAll('.school-accordion');

  // Si no hay búsqueda, mostramos todo y dejamos los acordeones cerrados (o como estén)
  if (!searchTerm) {
    rows.forEach(row => row.style.display = '');
    return;
  }

  // Realizar la búsqueda
  rows.forEach(row => {
    const name = row.dataset.name || '';
    const username = row.dataset.username || '';

    if (name.includes(searchTerm) || username.includes(searchTerm)) {
      row.style.display = '';

      // Expandir el acordeón padre si hay un resultado dentro
      const body = row.closest('.school-accordion-body');
      if (body) {
        body.classList.add('active');
        const schoolCode = body.id.replace('school-body-', '');
        const header = document.getElementById(`school-header-${schoolCode}`);
        if (header) header.classList.add('active');
      }
    } else {
      row.style.display = 'none';
    }
  });
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('✅ Copiado al portapapeles', 'success');
  } catch (err) {
    showToast('❌ Error al copiar', 'error');
  }
}
// ================================================
// PARTE 2: EDITAR, ELIMINAR, QR Y MODALES
// ================================================

async function viewStudentQR(studentId, studentName, username) {
  try {
    // Generar datos del QR
    const qrData = JSON.stringify({
      id: studentId,
      username: username,
      timestamp: Date.now()
    });

    // Guardar QR data en la base de datos
    await _supabase
      .from('students')
      .update({ qr_data: qrData })
      .eq('id', studentId);

    const modal = document.createElement('div');
    modal.className = 'modal active';

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>📱 Código QR de ${sanitizeInput(studentName)}</h2>
          <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body" style="text-align: center;">
          <p style="margin-bottom: 20px; color: var(--text-light);">
            Usa este código QR para tomar asistencia estilo Plickers
          </p>
          
          <div id="qrcode-container" style="display: inline-block; padding: 20px; background: white; border-radius: 12px; box-shadow: var(--shadow-md);"></div>
          
          <div style="margin-top: 20px; padding: 16px; background: var(--light-gray); border-radius: 8px;">
            <p style="margin: 0 0 8px; font-weight: 600;">Datos del Estudiante:</p>
            <p style="margin: 4px 0;"><strong>Username:</strong> <code style="background: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem;">${username}</code></p>
            <p style="margin: 4px 0;"><strong>ID:</strong> <code style="background: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem;">${studentId.substring(0, 8)}...</code></p>
          </div>

          <button class="btn-secondary" onclick="downloadQR('${username}')" style="margin-top: 16px;">
            <i class="fas fa-download"></i> Descargar QR
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Generar QR usando una librería externa (usaremos QRCode.js)
    loadQRCodeLibrary().then(() => {
      const container = document.getElementById('qrcode-container');
      if (container && typeof QRCode !== 'undefined') {
        new QRCode(container, {
          text: qrData,
          width: 256,
          height: 256,
          colorDark: "#00bcd4",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      } else {
        container.innerHTML = `<p style="color: var(--danger-color);">Error generando QR</p>`;
      }
    });

  } catch (err) {
    console.error('Error generando QR:', err);
    showToast('❌ Error al generar QR', 'error');
  }
}

function loadQRCodeLibrary() {
  return new Promise((resolve, reject) => {
    if (typeof QRCode !== 'undefined') {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function downloadQR(username) {
  const canvas = document.querySelector('#qrcode-container canvas');
  if (canvas) {
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `QR_${username}.png`;
    link.href = url;
    link.click();
    showToast('✅ QR descargado', 'success');
  }
}

function openAddStudentModal() {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'add-student-modal';

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>➕ Agregar Estudiante</h2>
        <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <label>
          <strong>Nombre Completo:</strong>
          <input type="text" id="student-name" class="input-field" placeholder="Nombre del estudiante">
        </label>

        <label>
          <strong>Email (Opcional):</strong>
          <input type="email" id="student-email" class="input-field" placeholder="correo@ejemplo.com">
        </label>

        <label>
          <strong>CUI (Opcional):</strong>
          <input type="text" id="student-cui" class="input-field" placeholder="1234567890123" maxlength="13">
        </label>

        <label>
          <strong>Establecimiento:</strong>
          <select id="student-school" class="input-field" onchange="loadGradesForSchool()">
            <option value="">Seleccionar...</option>
          </select>
        </label>

        <label>
          <strong>Grado:</strong>
          <select id="student-grade" class="input-field">
            <option value="">Seleccionar...</option>
          </select>
        </label>

        <label>
          <strong>Sección:</strong>
          <select id="student-section" class="input-field">
            <option value="">Seleccionar...</option>
          </select>
        </label>

        <button class="btn-primary" onclick="addStudentManual()" id="btn-add-student">
          <i class="fas fa-user-plus"></i> Crear Estudiante
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  loadSchoolsForSelect();
}

async function loadSchoolsForSelect() {
  const select = document.getElementById('student-school');
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

function loadGradesForSchool() {
  const schoolSelect = document.getElementById('student-school');
  const gradeSelect = document.getElementById('student-grade');
  const sectionSelect = document.getElementById('student-section');

  if (!schoolSelect || !gradeSelect || !sectionSelect) return;

  const selectedOption = schoolSelect.options[schoolSelect.selectedIndex];
  const level = selectedOption?.dataset.level || 'Primaria';

  const grades = GRADES_BY_LEVEL[level] || [];

  gradeSelect.innerHTML = '<option value="">Seleccionar...</option>' +
    grades.map(g => `<option value="${g}">${g}</option>`).join('');

  sectionSelect.innerHTML = '<option value="">Seleccionar...</option>' +
    SECTIONS.map(s => `<option value="${s}">${s}</option>`).join('');
}
// ================================================
// PARTE 3: AGREGAR, EDITAR Y ELIMINAR ESTUDIANTES
// ================================================

async function addStudentManual() {
  const name = document.getElementById('student-name')?.value.trim();
  const email = document.getElementById('student-email')?.value.trim();
  const cui = document.getElementById('student-cui')?.value.trim();
  const schoolCode = document.getElementById('student-school')?.value;
  const grade = document.getElementById('student-grade')?.value;
  const section = document.getElementById('student-section')?.value;
  const btn = document.getElementById('btn-add-student');

  if (!name) {
    return showToast('❌ Ingresa el nombre completo', 'error');
  }

  if (!schoolCode || !grade || !section) {
    return showToast('❌ Completa establecimiento, grado y sección', 'error');
  }

  const nameParts = name.split(/\s+/).filter(p => p.length > 0);
  if (nameParts.length < 3) {
    return showToast('❌ Ingresa al menos nombre y dos apellidos', 'error');
  }

  const primerNombre = nameParts[0];
  const segundoNombre = nameParts[1] || '';
  const apellido1 = nameParts[2] || '';
  const apellido2 = nameParts[3] || apellido1;

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';

  try {
    const { base, alternative } = generateUsername(primerNombre, segundoNombre, apellido1, apellido2);

    const { data: existing } = await _supabase
      .from('students')
      .select('username')
      .eq('username', base)
      .maybeSingle();

    const username = existing ? alternative || (base + '1') : base;
    const finalEmail = email || `${username}@estudiante.edu.gt`;
    const password = '1bot.org';

    // Generar QR data
    const qrData = JSON.stringify({
      username: username,
      student_id: 'temp',
      school: schoolCode
    });

    const { data: authData, error: authError } = await _supabase.auth.signUp({
      email: finalEmail,
      password: password,
      options: {
        data: {
          full_name: name,
          role: 'estudiante'
        },
        emailRedirectTo: undefined
      }
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('No se pudo crear usuario');

    await new Promise(resolve => setTimeout(resolve, 500));

    const { error: dbError } = await _supabase
      .from('students')
      .insert({
        id: authData.user.id,
        full_name: name,
        username: username,
        email: finalEmail,
        school_code: schoolCode,
        grade: grade,
        section: section,
        cui: cui || null,
        password_generated: password,
        role: 'estudiante',
        qr_data: qrData.replace('temp', authData.user.id)
      });

    if (dbError) throw dbError;

    showToast('✅ Estudiante creado correctamente', 'success');

    alert(`✅ Estudiante creado:\n\nUsuario: ${username}\nContraseña: ${password}\nEmail: ${finalEmail}\n\n⚠️ Guarda esta información`);

    document.getElementById('add-student-modal').remove();
    await loadStudents();

  } catch (err) {
    console.error('Error creando estudiante:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus"></i> Crear Estudiante';
  }
}

async function editStudent(studentId) {
  try {
    const { data: student, error } = await _supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single();

    if (error) throw error;

    const modal = document.createElement('div');
    modal.className = 'modal active';

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>✏️ Editar Estudiante</h2>
          <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body">
          <label>
            <strong>Nombre Completo:</strong>
            <input type="text" id="edit-student-name" class="input-field" value="${sanitizeInput(student.full_name)}">
          </label>

          <label>
            <strong>Email:</strong>
            <input type="email" id="edit-student-email" class="input-field" value="${sanitizeInput(student.email)}">
          </label>

          <label>
            <strong>CUI:</strong>
            <input type="text" id="edit-student-cui" class="input-field" value="${student.cui || ''}" maxlength="13">
          </label>

          <label>
            <strong>Establecimiento:</strong>
            <select id="edit-student-school" class="input-field" onchange="loadGradesForEditStudent()">
              <option value="">Seleccionar...</option>
            </select>
          </label>

          <label>
            <strong>Grado:</strong>
            <select id="edit-student-grade" class="input-field">
              <option value="">Seleccionar...</option>
            </select>
          </label>

          <label>
            <strong>Sección:</strong>
            <select id="edit-student-section" class="input-field">
              <option value="">Seleccionar...</option>
            </select>
          </label>

          <button class="btn-primary" onclick="saveStudentChanges('${studentId}')" id="btn-save-student">
            <i class="fas fa-save"></i> Guardar Cambios
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Cargar escuelas y preseleccionar
    await loadSchoolsForEditStudent(student);

  } catch (err) {
    console.error('Error cargando estudiante:', err);
    showToast('❌ Error al cargar estudiante', 'error');
  }
}

async function loadSchoolsForEditStudent(student) {
  const select = document.getElementById('edit-student-school');
  if (!select) return;

  try {
    const { data: schools } = await _supabase
      .from('schools')
      .select('code, name, level')
      .order('name');

    if (schools && schools.length > 0) {
      select.innerHTML = '<option value="">Seleccionar...</option>' +
        schools.map(s => `<option value="${s.code}" data-level="${s.level}" ${s.code === student.school_code ? 'selected' : ''}>${sanitizeInput(s.name)}</option>`).join('');

      loadGradesForEditStudent();

      // Preseleccionar grado y sección
      setTimeout(() => {
        const gradeSelect = document.getElementById('edit-student-grade');
        const sectionSelect = document.getElementById('edit-student-section');
        if (gradeSelect) gradeSelect.value = student.grade;
        if (sectionSelect) sectionSelect.value = student.section;
      }, 100);
    }
  } catch (err) {
    console.error('Error cargando establecimientos:', err);
  }
}

function loadGradesForEditStudent() {
  const schoolSelect = document.getElementById('edit-student-school');
  const gradeSelect = document.getElementById('edit-student-grade');
  const sectionSelect = document.getElementById('edit-student-section');

  if (!schoolSelect || !gradeSelect || !sectionSelect) return;

  const selectedOption = schoolSelect.options[schoolSelect.selectedIndex];
  const level = selectedOption?.dataset.level || 'Primaria';

  const grades = GRADES_BY_LEVEL[level] || [];

  const currentGrade = gradeSelect.value;
  const currentSection = sectionSelect.value;

  gradeSelect.innerHTML = '<option value="">Seleccionar...</option>' +
    grades.map(g => `<option value="${g}">${g}</option>`).join('');

  sectionSelect.innerHTML = '<option value="">Seleccionar...</option>' +
    SECTIONS.map(s => `<option value="${s}">${s}</option>`).join('');

  if (currentGrade) gradeSelect.value = currentGrade;
  if (currentSection) sectionSelect.value = currentSection;
}

async function saveStudentChanges(studentId) {
  const name = document.getElementById('edit-student-name')?.value.trim();
  const email = document.getElementById('edit-student-email')?.value.trim();
  const cui = document.getElementById('edit-student-cui')?.value.trim();
  const schoolCode = document.getElementById('edit-student-school')?.value;
  const grade = document.getElementById('edit-student-grade')?.value;
  const section = document.getElementById('edit-student-section')?.value;
  const btn = document.getElementById('btn-save-student');

  if (!name || !email || !schoolCode || !grade || !section) {
    return showToast('❌ Completa todos los campos obligatorios', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

  try {
    const { error } = await _supabase
      .from('students')
      .update({
        full_name: name,
        email: email,
        school_code: schoolCode,
        grade: grade,
        section: section,
        cui: cui || null
      })
      .eq('id', studentId);

    if (error) throw error;

    showToast('✅ Estudiante actualizado correctamente', 'success');
    document.querySelector('.modal').remove();
    await loadStudents();

  } catch (err) {
    console.error('Error actualizando estudiante:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
  }
}

async function deleteStudent(studentId, studentName) {
  if (!confirm(`¿Eliminar a ${studentName}?\n\nEsto eliminará:\n- El usuario de autenticación\n- Todos sus proyectos\n- Sus calificaciones\n- Sus insignias`)) {
    return;
  }

  try {
    const { error } = await _supabase
      .from('students')
      .delete()
      .eq('id', studentId);

    if (error) throw error;

    showToast('✅ Estudiante eliminado', 'success');
    await loadStudents();

  } catch (err) {
    console.error('Error eliminando estudiante:', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}

async function updateTotalUsersCount() {
  try {
    const { count } = await _supabase
      .from('students')
      .select('*', { count: 'exact', head: true });

    const countElement = document.getElementById('total-users-count');
    if (countElement) countElement.textContent = count || 0;
  } catch (err) {
    console.error('Error contando usuarios:', err);
  }
}

function openResetPasswordModal(studentId, studentName) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'reset-password-modal';

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>🔑 Restablecer Contraseña</h2>
        <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <p style="margin-bottom: 20px;">Estás restableciendo la contraseña para: <br><strong>${studentName}</strong></p>
        
        <label>Nueva Contraseña:</label>
        <input type="text" id="new-student-password" class="input-field" value="1bot.org" style="margin-bottom: 20px;">
        
        <p style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 20px;">
          <i class="fas fa-info-circle"></i> Al cambiar la contraseña aquí, se actualizará el registro visual del estudiante. El sistema intentará sincronizarlo con el inicio de sesión.
        </p>
        
        <div style="display: flex; gap: 10px;">
          <button class="btn-secondary" style="flex: 1;" onclick="this.closest('.modal').remove()">Cancelar</button>
          <button class="btn-primary" style="flex: 1;" onclick="resetStudentPassword('${studentId}')">
            <i class="fas fa-save"></i> Guardar Cambio
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

async function resetStudentPassword(studentId) {
  const newPassword = document.getElementById('new-student-password')?.value.trim();

  if (!newPassword) {
    return showToast('❌ Ingresa una contraseña válida', 'error');
  }

  const btn = document.querySelector('#reset-password-modal .btn-primary');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

  try {
    // 1. Actualizar en la tabla de estudiantes (metadatos/visual)
    const { error: dbError } = await _supabase
      .from('students')
      .update({ password_generated: newPassword })
      .eq('id', studentId);

    if (dbError) throw dbError;

    // 2. Intentar llamar a una función RPC para actualizar auth.users
    const { error: rpcError } = await _supabase.rpc('admin_reset_user_password', {
      user_id: studentId,
      new_password: newPassword
    });

    if (rpcError) {
      console.warn('⚠️ No se pudo actualizar auth.users automáticamente:', rpcError);
      showToast('✅ Contraseña visual actualizada. Asegúrate de tener el RPC de administrador configurado.', 'warning');
    } else {
      showToast('✅ Contraseña restablecida correctamente', 'success');
    }

    document.getElementById('reset-password-modal').remove();
    loadStudents();

  } catch (err) {
    console.error('Error restableciendo contraseña:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambio';
  }
}

console.log('✅ students.js cargado completamente');
