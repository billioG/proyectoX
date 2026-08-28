// ================================================
// GESTIÓN DE DOCENTES Y ASIGNACIONES
// ================================================

window.loadTeachers = async function loadTeachers() {
  const container = document.getElementById('teachers-container');
  if (!container) {
    console.warn('⚠️ Contenedor de docentes no encontrado en el DOM.');
    return;
  }

  const _supabase = window._supabase;
  const fetchWithCache = window.fetchWithCache;

  if (!container.innerHTML || container.innerHTML.includes('fa-circle-notch')) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center p-20 text-slate-400">
          <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
          <span class="font-bold tracking-widest uppercase text-xs">Cargando equipo docente...</span>
      </div>
    `;
  }

  try {
    await fetchWithCache('teachers_list', async () => {
      const [{ data, error }, { data: evals }] = await Promise.all([
        _supabase
          .from('teachers')
          .select(`
              *,
              teacher_assignments(
                id,
                school_code,
                grade,
                section,
                schools(name, address, school_programs(programs(name)))
              )
            `)
          .order('full_name'),
        // Sin FK declarada entre teachers y evaluations -- PostgREST no
        // puede embeder ese join (rompía la carga entera con 400: "Could
        // not find a relationship"). Se trae aparte y se cuenta a mano.
        _supabase.from('evaluations').select('teacher_id'),
      ]);
      if (error) throw error;

      const evalCountByTeacher = new Map();
      (evals || []).forEach(e => evalCountByTeacher.set(e.teacher_id, (evalCountByTeacher.get(e.teacher_id) || 0) + 1));
      (data || []).forEach(t => { t.evalCount = evalCountByTeacher.get(t.id) || 0; });

      return data;
    }, (teachers) => {
      window.renderTeachersContent(container, teachers);
    });

  } catch (err) {
    console.error('Error cargando docentes:', err);
    container.innerHTML = '<div class="error-state"><i class="fas fa-circle-xmark"></i> Error al cargar docentes</div>';
  }
}

window.renderTeachersContent = function renderTeachersContent(container, teachers) {
  const sanitizeInput = window.sanitizeInput || ((v) => v);
  container.innerHTML = `
      <div class="flex flex-col md:flex-row gap-6 mb-10 items-center animate-slideUp">
        <div class="relative grow w-full">
            <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input type="text" id="search-teachers" class="input-field-tw pl-12 h-12 text-sm font-semibold" placeholder="FILTRO: NOMBRE, EMAIL O ASIGNACIÓN..." oninput="window.filterTeachers()">
        </div>
        <div class="flex gap-3 w-full md:w-auto shrink-0">
            <button class="btn-primary-tw grow h-12 px-6 text-xs uppercase font-bold tracking-widest" onclick="window.openAddTeacherModal()">
              <i class="fas fa-user-plus"></i> NUEVO DOCENTE
            </button>
            <button class="btn-secondary-tw grow h-12 px-6 text-xs uppercase font-bold tracking-widest" onclick="window.exportTeachersCSV()">
              <i class="fas fa-file-csv"></i> EXPORTAR
            </button>
            <button class="btn-secondary-tw grow h-12 px-6 text-xs uppercase font-bold tracking-widest" onclick="window.openImportTeachersModal()">
              <i class="fas fa-file-import"></i> IMPORTAR CSV
            </button>
            <button class="btn-secondary-tw grow h-12 px-6 text-xs uppercase font-bold tracking-widest" onclick="window.nav('admin-teacher-performance')">
              <i class="fas fa-bolt"></i> ACTIVIDAD
            </button>
        </div>
      </div>

      ${!teachers || teachers.length === 0 ? `
        <div class="glass-card p-16 text-center border-2 border-dashed border-slate-100 dark:border-slate-800">
            <i class="fas fa-chalkboard-teacher text-6xl text-slate-200 dark:text-slate-800 mb-4 mx-auto block"></i>
            <p class="text-slate-500 font-bold uppercase tracking-widest text-sm mb-6">No hay docentes registrados</p>
            <button class="btn-primary-tw mx-auto h-11 px-8" onclick="window.openAddTeacherModal()"><i class="fas fa-plus"></i> AGREGAR EL PRIMERO</button>
        </div>
      ` : window.renderTeacherGroups(teachers, sanitizeInput)}
    `;
}

// Agrupa por programa (schools.programa) -> establecimiento (primera
// asignación del docente). Un docente sin asignaciones cae en "Sin Asignar".
window.renderTeacherGroups = function renderTeacherGroups(teachers, sanitizeInput) {
    const groups = new Map(); // programaKey -> Map(schoolName -> teachers[])
    teachers.forEach(t => {
        const firstSchool = t.teacher_assignments?.[0]?.schools;
        const schoolName = firstSchool?.name || 'Sin Asignar';
        const schoolAddress = firstSchool?.address || '';
        // Un colegio puede pertenecer a varios programas (tabla programs +
        // school_programs, gestionados por el admin) -- el docente aparece
        // repetido bajo cada programa al que pertenece su establecimiento.
        const programas = (firstSchool?.school_programs || []).map(sp => sp.programs?.name).filter(Boolean);
        const programaKeys = programas.length > 0 ? programas : ['Sin Programa'];
        programaKeys.forEach(programaKey => {
            if (!groups.has(programaKey)) groups.set(programaKey, new Map());
            const bySchool = groups.get(programaKey);
            if (!bySchool.has(schoolName)) bySchool.set(schoolName, { address: schoolAddress, teachers: [] });
            bySchool.get(schoolName).teachers.push(t);
        });
    });

    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([programa, bySchool]) => `
        <div class="mb-10">
            <h2 class="text-sm font-black text-primary uppercase tracking-[0.2em] mb-4 flex items-center gap-2"><i class="fas fa-layer-group"></i> ${sanitizeInput(programa)}</h2>
            ${[...bySchool.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([schoolName, groupData]) => `
                <details class="mb-5 group/school" open>
                    <summary class="list-none cursor-pointer flex items-start gap-2 mb-3 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase tracking-widest">
                        <i class="fas fa-chevron-right text-[0.6rem] transition-transform group-open/school:rotate-90 mt-0.5 shrink-0"></i>
                        <i class="fas fa-school text-slate-400 mt-0.5 shrink-0"></i>
                        <span class="min-w-0 flex-1 break-words">
                            ${sanitizeInput(schoolName)} <span class="text-slate-400 font-normal normal-case">(${groupData.teachers.length})</span>
                            ${groupData.address ? `<span class="block text-[0.6rem] text-slate-400 font-medium normal-case tracking-normal break-words">${sanitizeInput(groupData.address)}</span>` : ''}
                        </span>
                    </summary>
                    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        ${groupData.teachers.map(t => window.renderTeacherCard(t, sanitizeInput)).join('')}
                    </div>
                </details>
            `).join('')}
        </div>
    `).join('');
}

window.renderTeacherCard = function renderTeacherCard(t, sanitizeInput) {
            // "ACTIVO" era texto fijo, siempre igual sin importar el docente --
            // ahora depende de si entró en los últimos 3 días.
            const lastLoginDate = t.last_login ? new Date(t.last_login.includes('T') ? t.last_login : t.last_login + 'T00:00:00') : null;
            const daysSinceLogin = lastLoginDate && !isNaN(lastLoginDate.getTime()) ? Math.floor((Date.now() - lastLoginDate.getTime()) / 86400000) : null;
            const isRecentlyActive = daysSinceLogin !== null && daysSinceLogin <= 3;
            const statusBadge = isRecentlyActive
              ? `<div class="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 text-[0.6rem] font-bold uppercase tracking-widest border border-emerald-500/10 flex items-center gap-1"><i class="fas fa-circle text-[0.4rem]"></i> ACTIVO</div>`
              : `<div class="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 text-[0.6rem] font-bold uppercase tracking-widest border border-amber-500/10 flex items-center gap-1"><i class="fas fa-circle text-[0.4rem]"></i> INACTIVO</div>`;
            return `
            <div class="teacher-card glass-card p-0 overflow-hidden hover:translate-y-[-4px] transition-all group" data-name="${t.full_name.toLowerCase()}" data-email="${t.email.toLowerCase()}">
                <div class="p-6 relative">
                    <div class="flex justify-between items-start mb-4">
                        <div class="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700">
                             ${t.profile_photo_url ? `<img src="${t.profile_photo_url}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center text-slate-300 text-2xl"><i class="fas fa-user"></i></div>`}
                        </div>
                        <div class="flex flex-col items-end gap-1">
                             ${statusBadge}
                             ${t.role === 'admin' ? `<span class="text-[0.55rem] font-bold text-rose-500 uppercase tracking-widest bg-rose-50 px-2 py-0.5 rounded-md">ADMIN</span>` : ''}
                             ${t.role === 'coordinador' ? `<span class="text-[0.55rem] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md">COORDINADOR</span>` : ''}
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
                             <div class="text-lg font-bold text-indigo-500">${t.evalCount || 0}</div>
                         </div>
                    </div>
                    <p class="text-[0.6rem] text-slate-400 font-bold uppercase tracking-widest mb-4"><i class="fas fa-clock"></i> Última conexión: ${lastLoginDate ? lastLoginDate.toLocaleDateString('es-GT') : 'Nunca'}</p>

                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="window.viewTeacherAssignments('${t.id}', '${sanitizeInput(t.full_name)}')" class="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400 text-xs font-bold uppercase tracking-wider transition-all border border-transparent hover:border-indigo-200">
                            <i class="fas fa-school mr-1"></i> Carga
                        </button>
                        <button onclick="window.openAssignTeacherModal('${t.id}', '${sanitizeInput(t.full_name)}')" class="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/20 text-xs font-bold uppercase tracking-wider transition-all border border-transparent hover:border-primary/20">
                            <i class="fas fa-plus mr-1"></i> Asignar
                        </button>
                    </div>
                    ${t.role !== 'admin' ? `
                    <div class="grid grid-cols-1 gap-2 mt-2">
                        ${t.role === 'coordinador' ? `
                        <button onclick="window.openCoordinatorAssignModal('${t.id}', '${sanitizeInput(t.full_name)}')" class="py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider transition-all border border-indigo-100 dark:border-indigo-800">
                            <i class="fas fa-users-gear mr-1"></i> Docentes a Cargo
                        </button>
                        <button onclick="window.setTeacherRole('${t.id}', 'docente')" class="py-2 rounded-xl bg-transparent text-slate-400 hover:text-rose-500 text-[0.65rem] font-bold uppercase tracking-wider transition-all">
                            Quitar rol de coordinador
                        </button>
                        ` : `
                        <button onclick="window.setTeacherRole('${t.id}', 'coordinador')" class="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400 text-[0.65rem] font-bold uppercase tracking-wider transition-all border border-transparent hover:border-indigo-200">
                            <i class="fas fa-user-shield mr-1"></i> Hacer Coordinador
                        </button>
                        `}
                    </div>
                    ` : ''}
                </div>

                <div class="bg-slate-50/50 dark:bg-slate-800/30 p-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center group-hover:bg-slate-100 dark:group-hover:bg-slate-800 transition-colors">
                     <span class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-widest pl-2">ID: ...${t.id.substr(-6)}</span>
                     <div class="flex gap-1">
                        <button onclick="window.editTeacher('${t.id}')" class="w-8 h-8 rounded-lg text-slate-400 hover:text-primary hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="window.deleteTeacher('${t.id}', '${sanitizeInput(t.full_name)}')" class="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm">
                            <i class="fas fa-trash"></i>
                        </button>
                     </div>
                </div>
            </div>
          `;
}

window.openAddTeacherModal = function openAddTeacherModal() {
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
          <input type="password" id="teacher-password" class="input-field-tw" placeholder="Mínimo 6 caracteres" value="Quetzal.2026">
        </div>

        <label class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
          <input type="checkbox" id="teacher-is-1bot" class="w-5 h-5 rounded text-primary focus:ring-primary border-slate-300">
          <span class="text-sm font-bold text-slate-700 dark:text-slate-300">Es equipo interno (Habilitar Bonos)</span>
        </label>

        <button class="btn-primary-tw w-full mt-4" onclick="window.addTeacher()" id="btn-add-teacher">
          <i class="fas fa-save"></i> Crear Cuenta Docente
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

window.addTeacher = async function addTeacher() {
  const name = document.getElementById('teacher-name')?.value.trim();
  const email = document.getElementById('teacher-email')?.value.trim();
  const phone = document.getElementById('teacher-phone')?.value.trim();
  const birth = document.getElementById('teacher-birth')?.value;
  const password = document.getElementById('teacher-password')?.value.trim();
  const is1bot = document.getElementById('teacher-is-1bot')?.checked || false;
  const btn = document.getElementById('btn-add-teacher');
  const showToast = window.showToast;
  const _supabase = window._supabase;
  const loadTeachers = window.loadTeachers;

  if (!name || !email || !password) {
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Completa nombre, email y contraseña', 'error');
    return;
  }

  if (password.length < 6) {
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> La contraseña debe tener al menos 6 caracteres', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';

  try {
    // Se crea vía edge function (service role, gateada por is_admin() real) en
    // vez de auth.signUp() desde el cliente -- signUp() puede reemplazar la
    // sesión activa del admin por la del docente recién creado si la
    // confirmación de email está desactivada, y además es un endpoint público
    // que cualquiera podría llamar directamente para autoregistrarse como docente.
    const { data: { session } } = await _supabase.auth.getSession();
    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/admin-create-teacher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ name, email, phone: phone || null, birth: birth || null, password, is1bot }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Error creando docente');

    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-check"></i> Docente creado correctamente', 'success');
    document.getElementById('add-teacher-modal').remove();
    if (typeof loadTeachers === 'function') await loadTeachers();

  } catch (err) {
    console.error('Error creando docente:', err);
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus"></i> Crear Docente';
  }
}

// ================================================
// IMPORTAR DOCENTES DESDE CSV (alta masiva)
// ================================================
// Reusa admin-create-teacher (misma edge function que el alta manual, ya
// gateada por is_admin() real) llamándola una vez por fila -- así no hace
// falta desplegar una función nueva ni tocar la lógica de creación.
function parseTeachersCsvText(text) {
  const lines = text.split(/\r\n|\n/).filter(l => l.trim().length);
  return lines.map(line => {
    const cells = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if ((ch === ',' || ch === '\t') && !inQuotes) {
        cells.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  });
}

window.openImportTeachersModal = function openImportTeachersModal() {
  document.getElementById('import-teachers-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'import-teachers-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg max-h-[85vh] flex flex-col p-8 animate-slideUp">
      <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter mb-2"><i class="fas fa-file-import text-primary mr-2"></i> Importar Docentes (CSV)</h2>
      <p class="text-xs text-slate-400 mb-4">El archivo puede tener cualquier orden de columnas -- se detectan solas las de nombre, correo y teléfono por el encabezado.</p>
      <input type="file" id="import-teachers-file" accept=".csv" class="input-field-tw mb-3">
      <div id="import-teachers-preview" class="text-xs mb-4"></div>
      <div class="mb-4">
        <label class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest block mb-1.5">Contraseña temporal para todos</label>
        <input type="text" id="import-teachers-password" class="input-field-tw h-11 text-sm" value="Quetzal.2026">
      </div>
      <div id="import-teachers-results" class="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 mb-4"></div>
      <div class="flex gap-3 shrink-0">
        <button class="flex-1 btn-secondary-tw h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cerrar</button>
        <button class="flex-[2] btn-primary-tw h-11 text-xs uppercase font-bold" id="btn-run-import-teachers" onclick="window.runImportTeachers()"><i class="fas fa-upload"></i> Crear Cuentas</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('import-teachers-file').addEventListener('change', window.previewImportTeachers);
};

window.previewImportTeachers = function previewImportTeachers(e) {
  const file = e.target.files[0];
  if (!file) return;
  const sanitizeInput = window.sanitizeInput || ((v) => v);
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseTeachersCsvText(reader.result);
    const previewEl = document.getElementById('import-teachers-preview');
    if (rows.length < 2) {
      previewEl.innerHTML = '<span class="text-rose-500 font-bold">El archivo no tiene filas de datos.</span>';
      window._importTeachersRows = [];
      return;
    }

    const header = rows[0].map(h => h.toLowerCase());
    const nameIdx = header.findIndex(h => h.includes('nombre') && !h.includes('apellido'));
    const emailIdx = header.findIndex(h => h.includes('correo') || h.includes('email'));
    const phoneIdx = header.findIndex(h => h.includes('tel') || h.includes('phone') || h.includes('celular'));

    if (nameIdx === -1 || emailIdx === -1) {
      previewEl.innerHTML = '<span class="text-rose-500 font-bold">No se detectaron columnas de nombre y correo en el encabezado.</span>';
      window._importTeachersRows = [];
      return;
    }

    const dataRows = rows.slice(1).map(r => ({
      name: (r[nameIdx] || '').trim(),
      email: (r[emailIdx] || '').trim().toLowerCase(),
      phone: phoneIdx > -1 ? (r[phoneIdx] || '').trim() : '',
    })).filter(r => r.name && r.email);

    window._importTeachersRows = dataRows;
    previewEl.innerHTML = `<span class="text-emerald-500 font-bold">${dataRows.length} docente(s) detectado(s)</span> -- nombre: "${sanitizeInput(rows[0][nameIdx])}", correo: "${sanitizeInput(rows[0][emailIdx])}"${phoneIdx > -1 ? `, teléfono: "${sanitizeInput(rows[0][phoneIdx])}"` : ''}`;
  };
  reader.readAsText(file);
};

window.runImportTeachers = async function runImportTeachers() {
  const rows = window._importTeachersRows || [];
  const password = document.getElementById('import-teachers-password')?.value.trim();
  const resultsEl = document.getElementById('import-teachers-results');
  const btn = document.getElementById('btn-run-import-teachers');
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  if (!rows.length) return window.showToast('<i class="fas fa-circle-xmark"></i> Subí un CSV válido primero', 'error');
  if (!password || password.length < 6) return window.showToast('<i class="fas fa-circle-xmark"></i> La contraseña debe tener al menos 6 caracteres', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
  resultsEl.innerHTML = '';

  const { data: { session } } = await window._supabase.auth.getSession();
  let ok = 0, fail = 0;

  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'text-xs px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2';
    line.innerHTML = `<i class="fas fa-spinner fa-spin text-slate-400"></i> ${sanitizeInput(row.name)}`;
    resultsEl.appendChild(line);
    resultsEl.scrollTop = resultsEl.scrollHeight;

    try {
      const res = await fetch(`${window.SUPABASE_URL}/functions/v1/admin-create-teacher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: row.name, email: row.email, phone: row.phone || null, password }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error desconocido');
      ok++;
      line.innerHTML = `<i class="fas fa-circle-check text-emerald-500"></i> ${sanitizeInput(row.name)} <span class="text-slate-400">(${sanitizeInput(row.email)})</span>`;
    } catch (err) {
      fail++;
      line.innerHTML = `<i class="fas fa-circle-xmark text-rose-500"></i> ${sanitizeInput(row.name)} <span class="text-rose-400">-- ${sanitizeInput(err.message)}</span>`;
    }
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-upload"></i> Crear Cuentas';
  window.showToast(`<i class="fas fa-circle-check"></i> ${ok} creado(s), ${fail} con error`, ok > 0 ? 'success' : 'error');
  if (ok > 0 && typeof window.loadTeachers === 'function') window.loadTeachers();
};

window.openAssignTeacherModal = function openAssignTeacherModal(teacherId, teacherName) {
  const sanitizeInput = window.sanitizeInput || ((v) => v);
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
           <select id="assign-school" class="input-field-tw" onchange="window.loadGradesForAssignment()">
             <option value="">Seleccionar...</option>
           </select>
        </div>

        <label class="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
          <input type="checkbox" id="assign-all" onchange="window.toggleBulkAssignment(this.checked)" class="w-5 h-5 rounded text-primary focus:ring-primary border-slate-300">
          <span class="text-sm font-bold text-slate-700 dark:text-slate-300">Asignar TODOS los grados y secciones de este colegio</span>
        </label>

        <div id="individual-assign-fields" class="grid grid-cols-2 gap-4 transition-opacity duration-300">
          <div>
             <label class="text-[0.7rem] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Grado</label>
             <select id="assign-grade" class="input-field-tw" onchange="window.loadSectionsForAssignment()">
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

        <button class="btn-primary-tw w-full mt-2" onclick="window.assignTeacher('${teacherId}')" id="btn-assign">
          <i class="fas fa-check-circle"></i> Confirmar Asignación
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  window.loadSchoolsForAssignment();
}

window.loadSchoolsForAssignment = async function loadSchoolsForAssignment() {
  const select = document.getElementById('assign-school');
  if (!select) return;
  const _supabase = window._supabase;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  try {
    const { data: schools } = await _supabase
      .from('schools')
      .select('code, name, level, address')
      .order('name');

    if (schools && schools.length > 0) {
      // <option> nativo no soporta texto en dos tamaños -- se agrega la
      // dirección en la misma línea para poder distinguir establecimientos
      // con el mismo nombre (antes solo se mostraba el nombre).
      select.innerHTML = '<option value="">Seleccionar...</option>' +
        schools.map(s => `<option value="${s.code}" data-level="${s.level}">${sanitizeInput(s.name)}${s.address ? ' — ' + sanitizeInput(s.address) : ''}</option>`).join('');
    }
  } catch (err) {
    console.error('Error cargando establecimientos:', err);
  }
}

window.loadGradesForAssignment = function loadGradesForAssignment() {
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
  window.loadAvailableGrades(schoolCode, level);
}

window.loadAvailableGrades = async function loadAvailableGrades(schoolCode, level) {
  const gradeSelect = document.getElementById('assign-grade');
  if (!gradeSelect) return;
  const _supabase = window._supabase;

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

window.loadSectionsForAssignment = async function loadSectionsForAssignment() {
  const schoolSelect = document.getElementById('assign-school');
  const gradeSelect = document.getElementById('assign-grade');
  const sectionSelect = document.getElementById('assign-section');

  if (!schoolSelect || !gradeSelect || !sectionSelect) return;

  const schoolCode = schoolSelect.value;
  const grade = gradeSelect.value;
  const _supabase = window._supabase;

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

window.toggleBulkAssignment = function toggleBulkAssignment(isBulk) {
  const individualFields = document.getElementById('individual-assign-fields');
  if (individualFields) {
    individualFields.style.opacity = isBulk ? '0.3' : '1';
    individualFields.style.pointerEvents = isBulk ? 'none' : 'auto';
  }
}

window.assignTeacher = async function assignTeacher(teacherId) {
  const schoolCode = document.getElementById('assign-school')?.value;
  const grade = document.getElementById('assign-grade')?.value;
  const section = document.getElementById('assign-section')?.value;
  const isBulk = document.getElementById('assign-all')?.checked;
  const btn = document.getElementById('btn-assign');
  const _supabase = window._supabase;
  const showToast = window.showToast;
  const loadTeachers = window.loadTeachers;

  if (!schoolCode) {
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Selecciona un establecimiento', 'error');
    return;
  }

  if (!isBulk && (!grade || !section)) {
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Completa grado y sección o selecciona "Asignar a todos"', 'error');
    return;
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
        if (typeof showToast === 'function') showToast('ℹ️ El docente ya está asignado a todos los grados existentes', 'info');
      } else {
        // Conflicto: grupos que ya están a cargo de OTRO docente -- antes se
        // asignaban en silencio, permitiendo que dos docentes terminaran
        // compartiendo el mismo grupo sin que el admin se enterara.
        const { data: otherAssignments } = await _supabase
          .from('teacher_assignments')
          .select('grade, section, teachers(full_name)')
          .eq('school_code', schoolCode)
          .neq('teacher_id', teacherId);
        const ownerByGroup = new Map();
        (otherAssignments || []).forEach(a => ownerByGroup.set(`${a.grade}-${a.section}`, a.teachers?.full_name || 'otro docente'));
        const conflicts = newAssignments.filter(a => ownerByGroup.has(`${a.grade}-${a.section}`));

        if (conflicts.length > 0) {
          const names = [...new Set(conflicts.map(c => ownerByGroup.get(`${c.grade}-${c.section}`)))].join(', ');
          const proceed = confirm(`${conflicts.length} de estos grupos ya están a cargo de: ${names}. ¿Seguro que querés asignarlos también a este docente?`);
          if (!proceed) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Finalizar Asignación';
            return;
          }
        }

        const { error: insertError } = await _supabase
          .from('teacher_assignments')
          .insert(newAssignments);
        if (insertError) throw insertError;
        if (typeof showToast === 'function') showToast(`<i class="fas fa-circle-check"></i> Se crearon ${newAssignments.length} asignaciones correctamente`, 'success');
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
        if (typeof showToast === 'function') showToast('<i class="fas fa-triangle-exclamation"></i>️ Esta asignación ya existe', 'warning');
      } else {
        const { data: conflict } = await _supabase
          .from('teacher_assignments')
          .select('id, teachers(full_name)')
          .eq('school_code', schoolCode)
          .eq('grade', grade)
          .eq('section', section)
          .neq('teacher_id', teacherId)
          .maybeSingle();

        if (conflict) {
          const otherName = conflict.teachers?.full_name || 'otro docente';
          const proceed = confirm(`Este grupo (${grade} "${section}") ya está a cargo de ${otherName}. ¿Seguro que querés asignarlo también a este docente?`);
          if (!proceed) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Finalizar Asignación';
            return;
          }
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
        if (typeof showToast === 'function') showToast('<i class="fas fa-circle-check"></i> Asignación creada correctamente', 'success');
      }
    }

    document.getElementById('assign-teacher-modal').remove();
    if (typeof loadTeachers === 'function') await loadTeachers();

  } catch (err) {
    console.error('Error asignando docente:', err);
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Finalizar Asignación';
  }
}

window.viewTeacherAssignments = async function viewTeacherAssignments(teacherId, teacherName) {
  const _supabase = window._supabase;
  const showToast = window.showToast;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  try {
    const { data: assignments, error } = await _supabase
      .from('teacher_assignments')
      .select(`
        id,
        school_code,
        grade,
        section,
        schools(name, address)
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
                    ${a.schools?.address ? `<div class="text-[0.65rem] text-slate-400 font-medium ml-5 mt-0.5">${sanitizeInput(a.schools.address)}</div>` : ''}
                    <div class="flex gap-2 mt-2">
                        <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[0.65rem] font-bold uppercase tracking-wide">
                            ${a.grade}
                        </span>
                        <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-[0.65rem] font-bold uppercase tracking-wide">
                            Sección ${a.section}
                        </span>
                    </div>
                  </div>
                  <button class="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-500 text-xs font-bold hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 focus:opacity-100" onclick="window.removeAssignment && window.removeAssignment(${a.id}, '${teacherId}')">
                    <i class="fas fa-trash-alt"></i>
                  </button>
                </div>
              `).join('')}
            </div>
          `}
        </div>
        <div class="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-center">
             <button class="text-xs font-bold text-primary hover:underline uppercase tracking-widest" onclick="this.closest('.fixed').remove(); window.openAssignTeacherModal && window.openAssignTeacherModal('${teacherId}', '${sanitizeInput(teacherName)}')">
                <i class="fas fa-plus mr-1"></i> Agregar Nueva Asignación
             </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

  } catch (err) {
    console.error('Error cargando asignaciones:', err);
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error al cargar asignaciones', 'error');
  }
}

window.removeAssignment = async function removeAssignment(assignmentId, teacherId) {
  if (!confirm('¿Quitar esta asignación?')) return;
  const _supabase = window._supabase;
  const showToast = window.showToast;

  const { error } = await _supabase.from('teacher_assignments').delete().eq('id', assignmentId);
  if (error) {
    console.error('Error quitando asignación:', error);
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error: ' + error.message, 'error');
    return;
  }

  if (typeof showToast === 'function') showToast('<i class="fas fa-circle-check"></i> Asignación quitada', 'success');
  document.getElementById('view-assignments-modal')?.remove();

  // Recargar el modal con los datos frescos
  const { data: teacher } = await _supabase.from('teachers').select('full_name').eq('id', teacherId).maybeSingle();
  if (typeof window.viewTeacherAssignments === 'function') {
    window.viewTeacherAssignments(teacherId, teacher?.full_name || '');
  }
  if (typeof window.loadTeachers === 'function') window.loadTeachers();
}

window.editTeacher = async function editTeacher(teacherId) {
  const _supabase = window._supabase;
  const showToast = window.showToast;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

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
            <input type="text" id="edit-teacher-name" class="input-field-tw" value="${window.sanitizeAttr(teacher.full_name)}">
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

          <label class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors mb-4">
            <input type="checkbox" id="edit-teacher-is-1bot" class="w-5 h-5 rounded text-primary focus:ring-primary border-slate-300" ${teacher.is_1bot_team ? 'checked' : ''}>
            <span class="text-sm font-bold text-slate-700 dark:text-slate-300">Es equipo interno (Habilitar Bonos)</span>
          </label>

          <button class="btn-primary-tw w-full mt-4" onclick="window.updateTeacher('${teacherId}')" id="btn-update-teacher">
            <i class="fas fa-save"></i> Guardar Cambios
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

  } catch (err) {
    console.error('Error cargando docente para editar:', err);
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error al cargar datos del docente', 'error');
  }
}

window.updateTeacher = async function updateTeacher(teacherId) {
  const name = document.getElementById('edit-teacher-name')?.value.trim();
  const phone = document.getElementById('edit-teacher-phone')?.value.trim();
  const birth = document.getElementById('edit-teacher-birth')?.value;
  const is1bot = document.getElementById('edit-teacher-is-1bot')?.checked || false;
  const btn = document.getElementById('btn-update-teacher');
  const _supabase = window._supabase;
  const showToast = window.showToast;
  const loadTeachers = window.loadTeachers;

  if (!name) {
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> El nombre es obligatorio', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

  try {
    const { error } = await _supabase
      .from('teachers')
      .update({
        full_name: name,
        phone: phone || null,
        birth_date: birth || null,
        is_1bot_team: is1bot
      })
      .eq('id', teacherId);

    if (error) throw error;

    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-check"></i> Datos actualizados correctamente', 'success');
    document.getElementById('edit-teacher-modal').remove();
    if (typeof loadTeachers === 'function') await loadTeachers();

  } catch (err) {
    console.error('Error actualizando docente:', err);
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
  }
}

window.deleteTeacher = async function deleteTeacher(teacherId, teacherName) {
  const _supabase = window._supabase;
  const showToast = window.showToast;
  const loadTeachers = window.loadTeachers;

  if (!confirm(`¿Eliminar a ${teacherName}?\n\nEsto eliminará:\n- El usuario de autenticación\n- Todas sus asignaciones\n- Sus evaluaciones a proyectos`)) {
    return;
  }

  try {
    const { error } = await _supabase
      .from('teachers')
      .delete()
      .eq('id', teacherId);

    if (error) throw error;

    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-check"></i> Docente eliminado', 'success');
    if (typeof loadTeachers === 'function') await loadTeachers();

  } catch (err) {
    console.error('Error eliminando docente:', err);
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error: ' + err.message, 'error');
  }
}

// ================================================
// ROL COORDINADOR
// ================================================
window.setTeacherRole = async function setTeacherRole(teacherId, role) {
  const _supabase = window._supabase;
  const showToast = window.showToast;
  const loadTeachers = window.loadTeachers;

  if (role === 'coordinador' && !confirm('¿Convertir a este docente en coordinador? Podrá ver la información de los docentes que le asignes.')) return;
  if (role === 'docente' && !confirm('¿Quitar el rol de coordinador? Perderá acceso a la información de sus docentes asignados.')) return;

  try {
    const { error } = await _supabase.from('teachers').update({ role }).eq('id', teacherId);
    if (error) throw error;
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-check"></i> Rol actualizado', 'success');
    if (typeof loadTeachers === 'function') await loadTeachers();
  } catch (err) {
    console.error('Error actualizando rol:', err);
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error: ' + err.message, 'error');
  }
}

window.openCoordinatorAssignModal = async function openCoordinatorAssignModal(coordinatorId, coordinatorName) {
  const _supabase = window._supabase;
  const sanitizeInput = window.sanitizeInput || ((v) => v);
  document.getElementById('coordinator-assign-modal')?.remove();

  const [{ data: allTeachers }, { data: currentAssignments }] = await Promise.all([
    _supabase.from('teachers').select('id, full_name, email').neq('id', coordinatorId).order('full_name'),
    _supabase.from('coordinator_assignments').select('teacher_id').eq('coordinator_id', coordinatorId),
  ]);
  const assignedIds = new Set((currentAssignments || []).map(a => a.teacher_id));

  const modal = document.createElement('div');
  modal.id = 'coordinator-assign-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg max-h-[85vh] flex flex-col p-8 animate-slideUp bg-white dark:bg-slate-900">
      <div class="flex justify-between items-center mb-2">
        <h2 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight m-0"><i class="fas fa-users-gear text-indigo-500 mr-2"></i> Docentes a Cargo</h2>
        <button class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center font-bold" onclick="this.closest('.fixed').remove()">
            <i class="fas fa-times"></i>
        </button>
      </div>
      <p class="text-xs text-slate-400 mb-4">Seleccioná qué docentes puede ver <strong>${sanitizeInput(coordinatorName)}</strong> desde su panel de coordinador.</p>
      <div class="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 mb-4" id="coordinator-teacher-list">
        ${(allTeachers || []).map(t => `
          <label class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
            <input type="checkbox" value="${t.id}" ${assignedIds.has(t.id) ? 'checked' : ''} class="coordinator-teacher-checkbox w-5 h-5 rounded text-primary focus:ring-primary border-slate-300">
            <span class="text-sm font-bold text-slate-700 dark:text-slate-300">${sanitizeInput(t.full_name)}</span>
            <span class="text-xs text-slate-400 ml-auto">${sanitizeInput(t.email)}</span>
          </label>
        `).join('') || '<p class="text-xs text-slate-400 text-center py-8">No hay otros docentes registrados.</p>'}
      </div>
      <button class="btn-primary-tw w-full h-12 text-xs uppercase font-bold tracking-widest shrink-0" onclick="window.saveCoordinatorAssignments('${coordinatorId}')" id="btn-save-coordinator-assign">
        <i class="fas fa-save"></i> Guardar
      </button>
    </div>
  `;
  document.body.appendChild(modal);
}

window.saveCoordinatorAssignments = async function saveCoordinatorAssignments(coordinatorId) {
  const _supabase = window._supabase;
  const showToast = window.showToast;
  const btn = document.getElementById('btn-save-coordinator-assign');
  const selectedIds = [...document.querySelectorAll('.coordinator-teacher-checkbox:checked')].map(el => el.value);

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

  try {
    // Reemplazo completo: borra todas las asignaciones actuales de este
    // coordinador y crea de nuevo solo las que quedaron marcadas -- más
    // simple y seguro que diffear altas/bajas fila por fila.
    const { error: delError } = await _supabase.from('coordinator_assignments').delete().eq('coordinator_id', coordinatorId);
    if (delError) throw delError;

    if (selectedIds.length > 0) {
      const { error: insError } = await _supabase.from('coordinator_assignments')
        .insert(selectedIds.map(teacher_id => ({ coordinator_id: coordinatorId, teacher_id })));
      if (insError) throw insError;
    }

    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-check"></i> Docentes asignados correctamente', 'success');
    document.getElementById('coordinator-assign-modal')?.remove();
  } catch (err) {
    console.error('Error guardando asignaciones de coordinador:', err);
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar';
  }
}

window.exportTeachersCSV = async function exportTeachersCSV() {
  const _supabase = window._supabase;
  const showToast = window.showToast;
  const downloadCSV = window.downloadCSV;

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
      if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> No hay docentes para exportar', 'error');
      return;
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

    if (typeof downloadCSV === 'function') {
      downloadCSV(csvContent, 'docentes_export.csv');
      if (typeof showToast === 'function') showToast(`<i class="fas fa-circle-check"></i> ${teachers.length} docentes exportados`, 'success');
    }

  } catch (err) {
    console.error('Error exportando docentes:', err);
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error al exportar', 'error');
  }
}

window.filterTeachers = function filterTeachers() {
  const term = (document.getElementById('search-teachers')?.value || '').toLowerCase().trim();
  const cards = document.querySelectorAll('.teacher-card');
  cards.forEach(card => {
    const match = card.dataset.name.includes(term) || card.dataset.email.includes(term);
    card.style.display = match ? 'block' : 'none';
    if (match) card.classList.add('animate-fadeIn');
  });
}

console.log('✅ teachers.js cargado correctamente (Tailwind Premium)');
