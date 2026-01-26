/**
 * STUDENTS - Gestión de Estudiantes (Premium Edition)
 */

async function loadStudents() {
  const container = document.getElementById('students-container');
  if (!container) return;

  const pdfCard = document.getElementById('pdf-import-card');
  if (pdfCard) {
    pdfCard.className = userRole === 'admin' ? 'glass-card p-6 mb-8 block animate-slideUp' : 'hidden';
  }

  container.innerHTML = `
    <div class="flex flex-col items-center justify-center p-20 text-slate-400">
        <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
        <span class="font-bold uppercase text-xs tracking-widest text-center">Sincronizando Base de Datos...</span>
    </div>
  `;

  try {
    let assignments = [];
    if (userRole === 'docente') {
      const { data } = await _supabase.from('teacher_assignments').select('school_code, grade, section').eq('teacher_id', currentUser.id);
      assignments = data || [];
    }

    let query = _supabase.from('students').select('*, schools(name, code)');
    if (userRole === 'docente' && assignments.length > 0) {
      const schoolCodes = [...new Set(assignments.map(a => a.school_code))];
      query = query.in('school_code', schoolCodes);
    }

    const { data: allStudents, error } = await query.order('school_code, grade, section, full_name');
    if (error) throw error;

    let students = allStudents || [];
    if (userRole === 'docente') {
      students = allStudents.filter(s => assignments.some(a => String(a.school_code) === String(s.school_code) && String(a.grade) === String(s.grade) && String(a.section) === String(s.section)));
    }

    if (students.length === 0) {
      container.innerHTML = `
        <div class="glass-card p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800">
            <i class="fas fa-user-graduate text-5xl text-slate-200 dark:text-slate-800 mb-4 mx-auto"></i>
            <p class="text-slate-500 font-bold uppercase tracking-widest text-sm mb-6 text-center">No hay alumnos registrados en tus secciones</p>
            ${userRole === 'admin' ? `<button class="btn-primary-tw mx-auto" onclick="openAddStudentModal()"><i class="fas fa-user-plus"></i> AGREGAR ALUMNO</button>` : ''}
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
            <input type="text" id="search-students" class="input-field-tw pl-12 h-11 text-sm font-bold" placeholder="FILTRO: NOMBRE, USUARIO O CUI..." oninput="filterStudents()">
        </div>
        <div class="flex gap-2 w-full md:w-auto shrink-0">
            ${userRole === 'admin' ? `<button class="btn-primary-tw grow h-11 text-xs uppercase font-bold" onclick="openAddStudentModal()"><i class="fas fa-plus"></i> NUEVO</button>` : ''}
            <button class="btn-secondary-tw grow h-11 text-xs uppercase font-bold" onclick="exportStudentsCSV()"><i class="fas fa-download"></i> EXPORTAR</button>
        </div>
      </div>
      
      <div class="space-y-3">
        ${Object.entries(groupedBySchool).sort((a, b) => a[1].schoolName.localeCompare(b[1].schoolName)).map(([schoolCode, schoolData]) => renderSchoolAccordion(schoolCode, schoolData)).join('')}
      </div>
    `;

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="glass-card p-10 text-rose-500 font-bold text-center">❌ Falló la sincronización de alumnos</div>';
  }
}

function renderSchoolAccordion(schoolCode, schoolData) {
  return `
    <details class="group/school bg-white dark:bg-slate-900 overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800 transition-all">
        <summary class="list-none cursor-pointer p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
            <div class="flex items-center gap-4">
                <div class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-md"><i class="fas fa-school"></i></div>
                <div>
                    <h3 class="text-sm font-bold text-slate-800 dark:text-white leading-none">${sanitizeInput(schoolData.schoolName)}</h3>
                    <p class="text-[0.55rem] font-bold text-slate-400 uppercase tracking-widest mt-1">${schoolData.students.length} Alumnos Registrados</p>
                </div>
            </div>
            <div class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-open/school:rotate-180 transition-transform">
                <i class="fas fa-chevron-down text-[0.6rem] text-slate-400"></i>
            </div>
        </summary>
        <div class="p-4 pt-0 overflow-x-auto">
            <table class="table-tw">
                <thead>
                    <tr>
                        <th class="w-12 text-[0.6rem]">#</th>
                        <th class="text-[0.6rem]">PERFIL</th>
                        <th class="text-[0.6rem]">ID / PIN</th>
                        <th class="text-[0.6rem]">GRADO</th>
                        <th class="text-right text-[0.6rem]">ACCIONES</th>
                    </tr>
                </thead>
                <tbody>
                    ${schoolData.students.map((s, index) => `
                        <tr class="student-row group" data-name="${s.full_name.toLowerCase()}" data-username="${s.username.toLowerCase()}" data-cui="${s.cui || ''}">
                            <td class="text-center font-bold text-slate-400 text-xs">${index + 1}</td>
                            <td>
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-primary font-bold overflow-hidden border border-slate-200 shadow-sm shrink-0">
                                        ${s.profile_photo_url ? `<img src="${s.profile_photo_url}" class="w-full h-full object-cover">` : s.full_name.charAt(0)}
                                    </div>
                                    <div>
                                        <div class="text-[0.9rem] font-bold text-slate-800 dark:text-white leading-tight">${sanitizeInput(s.full_name)}</div>
                                        <div class="text-[0.8rem] font-medium text-primary uppercase tracking-widest mt-0.5">@${sanitizeInput(s.username)}</div>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div class="text-[0.85rem] font-bold text-slate-700 dark:text-slate-300 tracking-tight">${s.cui || '---'}</div>
                                <div class="text-[0.75rem] font-medium text-slate-400 uppercase tracking-widest">PIN: ${s.password_generated || '---'}</div>
                            </td>
                            <td>
                                <div class="flex gap-1 flex-wrap">
                                    <span class="px-2.5 py-1 rounded-lg bg-primary/5 text-primary text-[0.8rem] font-bold uppercase tracking-widest border border-primary/10">${sanitizeInput(s.grade)} ${sanitizeInput(s.section)}</span>
                                </div>
                            </td>
                            <td class="text-right">
                                <div class="flex justify-end gap-2">
                                    <button onclick="window.viewStudentQR('${s.id}', '${sanitizeInput(s.full_name).replace(/'/g, "\\'")}', '${s.username}')" class="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 text-slate-400 hover:text-emerald-500 hover:border-emerald-200 transition-all flex items-center justify-center border border-slate-100 shadow-sm" title="Acceso QR"><i class="fas fa-qrcode text-sm"></i></button>
                                    <button onclick="window.editStudent('${s.id}')" class="w-9 h-9 rounded-lg bg-white dark:bg-slate-800 text-slate-400 hover:text-primary hover:border-primary/30 transition-all flex items-center justify-center border border-slate-100 shadow-sm" title="Editar"><i class="fas fa-edit text-sm"></i></button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </details>
  `;
}

function filterStudents() {
  const term = (document.getElementById('search-students')?.value || '').toLowerCase().trim();
  const rows = document.querySelectorAll('.student-row');
  rows.forEach(row => {
    const match = row.dataset.name.includes(term) || row.dataset.username.includes(term) || row.dataset.cui.includes(term);
    row.style.display = match ? 'table-row' : 'none';
    if (match) row.classList.add('animate-fadeIn');
  });
}

// Ensure functions are global for onclick
window.viewStudentQR = async function (studentId, studentName, username) {
  const qrData = JSON.stringify({ id: studentId, username, timestamp: Date.now() });

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
      <div class="glass-card w-full max-w-sm p-10 text-center animate-slideUp">
          <div class="flex justify-between items-center mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter">Credencial Digital</h3>
              <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-rose-500 font-bold text-2xl">×</button>
          </div>
          <div id="qrcode-container" class="bg-white p-6 rounded-3xl shadow-lg border border-slate-100 inline-block mb-6 mx-auto"></div>
          <p class="font-bold text-slate-800 dark:text-white mb-1 uppercase tracking-tight">${studentName}</p>
          <p class="text-[0.6rem] font-bold text-primary uppercase tracking-widest mb-8">@${username}</p>
          <div class="flex flex-col gap-2">
              <button onclick="downloadQR('${username}')" class="btn-primary-tw w-full h-11 text-xs uppercase tracking-widest"><i class="fas fa-download mr-2 shadow-none"></i> DESCARGAR</button>
              <button onclick="this.closest('.fixed').remove()" class="btn-secondary-tw w-full h-11 text-xs uppercase tracking-widest">CERRAR</button>
          </div>
      </div>
    `;
  document.body.appendChild(modal);

  const checkQR = setInterval(() => {
    if (typeof QRCode !== 'undefined' && document.getElementById('qrcode-container')) {
      new QRCode(document.getElementById('qrcode-container'), { text: qrData, width: 200, height: 200, colorDark: "#020617", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
      clearInterval(checkQR);
    }
  }, 100);
};

window.editStudent = async function (studentId) {
  const { data: s } = await _supabase.from('students').select('*').eq('id', studentId).single();
  if (!s) return;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
      <div class="glass-card w-full max-w-lg p-10 animate-slideUp">
          <div class="flex justify-between items-center mb-10 border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 class="text-xl font-bold text-slate-800 dark:text-white uppercase tracking-tighter"><i class="fas fa-user-edit text-primary mr-2"></i> Perfil Académico</h3>
              <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-rose-500 font-bold text-2xl">×</button>
          </div>
          <div class="space-y-6 text-left">
              <div>
                  <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Nombre Completo</label>
                  <input type="text" id="edit-student-name" class="input-field-tw h-11 text-sm" value="${sanitizeInput(s.full_name)}">
              </div>
              <div class="grid grid-cols-2 gap-4">
                  <div>
                      <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">CUI</label>
                      <input type="text" id="edit-student-cui" class="input-field-tw h-11 text-sm" value="${s.cui || ''}" maxlength="13">
                  </div>
                   <div>
                       <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Género</label>
                       <select id="edit-student-gender" class="input-field-tw h-11 text-sm">
                           <option value="masculino" ${s.gender === 'masculino' ? 'selected' : ''}>Masculino</option>
                           <option value="femenino" ${s.gender === 'femenino' ? 'selected' : ''}>Femenino</option>
                       </select>
                   </div>
               </div>
               <div>
                   <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Fecha de Nacimiento</label>
                   <input type="date" id="edit-student-birth" class="input-field-tw h-11 text-sm" value="${s.birth_date || ''}">
               </div>
          </div>
          <button onclick="window.saveStudentChanges('${studentId}')" id="btn-save-student" class="btn-primary-tw w-full mt-10 h-14 uppercase tracking-[0.2em] shadow-xl shadow-primary/30"><i class="fas fa-save shadow-none mr-2"></i> ACTUALIZAR EXPEDIENTE</button>
      </div>
    `;
  document.body.appendChild(modal);
};

window.saveStudentChanges = async function (studentId) {
  const name = document.getElementById('edit-student-name').value.trim();
  const cui = document.getElementById('edit-student-cui').value.trim();
  const gender = document.getElementById('edit-student-gender').value;
  const birth = document.getElementById('edit-student-birth').value;
  const btn = document.getElementById('btn-save-student');

  if (!name) return showToast('❌ Nombre requerido', 'error');
  btn.disabled = true;

  try {
    const { error } = await _supabase.from('students').update({ full_name: name, cui, gender, birth_date: birth || null }).eq('id', studentId);
    if (error) throw error;
    showToast('✅ Estudiante actualizado', 'success');
    document.querySelector('.fixed').remove();
    loadStudents();
  } catch (e) { showToast('❌ Error al guardar', 'error'); } finally { btn.disabled = false; }
};

window.downloadQR = function (username) {
  const canvas = document.querySelector('#qrcode-container canvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `QR_${username}.png`;
  link.href = canvas.toDataURL();
  link.click();
};

console.log('✅ students.js reprogramado con Accordions y Acciones (Premium Edition)');
