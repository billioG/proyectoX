// ================================================
// GESTIÓN DE ESTABLECIMIENTOS - PARTE 1
// ================================================

async function loadSchools() {
  const container = document.getElementById('schools-container');
  if (!container) return;

  container.innerHTML = `
    <div class="flex flex-col items-center justify-center p-20 text-slate-400">
        <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
        <span class="font-bold tracking-widest uppercase text-xs">Sincronizando Establecimientos...</span>
    </div>
  `;

  try {
    const { data: schools, error } = await _supabase
      .from('schools')
      .select('*')
      .order('department, municipality, name');

    if (error) throw error;

    container.innerHTML = `
      <div class="flex flex-col md:flex-row gap-6 mb-10 items-center animate-slideUp">
        <div class="relative grow w-full">
            <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input type="text" id="search-schools" class="input-field-tw pl-12 h-12 text-sm font-semibold" placeholder="FILTRO: NOMBRE, CÓDIGO O MUNICIPIO..." oninput="filterSchools()">
        </div>
        <div class="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl shrink-0">
            <button id="btn-list-view" class="px-6 h-10 rounded-xl text-[0.6rem] font-black uppercase tracking-widest transition-all bg-white dark:bg-slate-700 shadow-sm text-primary" onclick="toggleSchoolView('list')">
                <i class="fas fa-list-ul mr-2"></i> LISTADO
            </button>
            <button id="btn-map-view" class="px-6 h-10 rounded-xl text-[0.6rem] font-black uppercase tracking-widest transition-all text-slate-500 hover:text-primary" onclick="toggleSchoolView('map')">
                <i class="fas fa-map-marked-alt mr-2"></i> DISTRIBUCIÓN
            </button>
        </div>
        <div class="flex gap-3 w-full md:w-auto shrink-0">
            <button class="btn-primary-tw grow h-12 px-6 text-xs uppercase font-bold tracking-widest" onclick="openAddSchoolModal()">
              <i class="fas fa-plus"></i> AGREGAR
            </button>
        </div>
      </div>

      <div id="schools-list-view" class="space-y-6">
        ${!schools || schools.length === 0 ? `
          <div class="glass-card p-16 text-center border-2 border-dashed border-slate-100 dark:border-slate-800">
              <i class="fas fa-school text-6xl text-slate-200 dark:text-slate-800 mb-4 mx-auto block"></i>
              <p class="text-slate-500 font-bold uppercase tracking-widest text-sm mb-6">No hay establecimientos registrados</p>
              <button class="btn-primary-tw mx-auto h-11 px-8" onclick="openAddSchoolModal()"><i class="fas fa-plus"></i> COMENZAR REGISTRO</button>
          </div>
        ` : `
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            ${schools.map(s => `
              <div class="school-card glass-card p-6 flex flex-col sm:flex-row gap-6 hover:translate-y-[-4px] transition-all group" data-name="${s.name.toLowerCase()}" data-code="${s.code.toLowerCase()}" data-municipality="${s.municipality.toLowerCase()}">
                  <div class="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-slate-800 text-indigo-500 flex items-center justify-center text-3xl shrink-0 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                      <i class="fas fa-university"></i>
                  </div>
                  <div class="grow flex flex-col justify-between">
                      <div class="mb-4">
                          <div class="flex justify-between items-start mb-2">
                             <span class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-[0.6rem] font-bold uppercase tracking-widest">${sanitizeInput(s.code)}</span>
                             <div class="flex gap-1">
                                 <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[0.55rem] font-bold uppercase tracking-tighter border border-emerald-500/10">${sanitizeInput(s.level)}</span>
                                 <span class="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[0.55rem] font-bold uppercase tracking-tighter border border-blue-500/10">${sanitizeInput(s.sector)}</span>
                             </div>
                          </div>
                          <h3 class="text-lg font-bold text-slate-800 dark:text-white leading-tight uppercase mb-1">${sanitizeInput(s.name)}</h3>
                          <p class="text-[0.7rem] text-slate-400 font-semibold uppercase tracking-widest flex items-center gap-1">
                             <i class="fas fa-map-marker-alt text-primary/50 text-[0.6rem]"></i> ${sanitizeInput(s.municipality)}, ${sanitizeInput(s.department)}
                          </p>
                      </div>
                      <div class="flex items-center justify-between pt-4 border-t border-slate-50 dark:border-slate-800/50">
                          <div class="flex gap-2">
                              <span class="px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-orange-900/10 text-orange-600 dark:text-orange-400 text-[0.6rem] font-bold uppercase tracking-widest border border-orange-500/10">${sanitizeInput(s.area)}</span>
                              <span class="px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-900/10 text-violet-600 dark:text-violet-400 text-[0.6rem] font-bold uppercase tracking-widest border border-violet-500/10">${sanitizeInput(s.schedule)}</span>
                          </div>
                          <div class="flex gap-2">
                              <button class="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary transition-all flex items-center justify-center border border-slate-50 dark:border-slate-800" onclick="editSchool(${s.id})" title="Editar">
                                  <i class="fas fa-edit text-sm"></i>
                              </button>
                              <button class="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-all flex items-center justify-center border border-slate-50 dark:border-slate-800" onclick="deleteSchool(${s.id}, '${sanitizeInput(s.name).replace(/'/g, "\\'")}')" title="Eliminar">
                                  <i class="fas fa-trash text-sm"></i>
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div id="schools-map-view" class="hidden animate-fadeIn">
        ${renderDepartmentalHeatmap(schools)}
      </div>
    `;

  } catch (err) {
    console.error('Error cargando establecimientos:', err);
    container.innerHTML = '<div class="glass-card p-10 text-rose-500 font-bold text-center">❌ Falló la sincronización de establecimientos</div>';
  }
}



function filterSchools() {
  const searchTerm = (document.getElementById('search-schools')?.value || '').toLowerCase().trim();
  const cards = document.querySelectorAll('.school-card');

  cards.forEach(card => {
    const name = card.dataset.name || '';
    const code = card.dataset.code || '';
    const muni = card.dataset.municipality || '';

    if (name.includes(searchTerm) || code.includes(searchTerm) || muni.includes(searchTerm)) {
      card.style.display = '';
      card.classList.add('animate-fadeIn');
    } else {
      card.style.display = 'none';
    }
  });
}
// ================================================
// PARTE 3: EDITAR Y ELIMINAR ESTABLECIMIENTOS
// ================================================

async function editSchool(schoolId) {
  try {
    const { data: school, error } = await _supabase
      .from('schools')
      .select('*')
      .eq('id', schoolId)
      .single();

    if (error) throw error;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';

    modal.innerHTML = `
      <div class="glass-card w-full max-w-2xl p-0 overflow-hidden shadow-2xl animate-slideUp">
        <div class="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
          <h2 class="text-xl font-bold text-slate-800 dark:text-white uppercase tracking-tighter"><i class="fas fa-edit text-primary mr-2"></i> Editar Establecimiento</h2>
          <button class="text-slate-400 hover:text-rose-500 font-bold text-2xl transition-colors" onclick="this.closest('.fixed').remove()">×</button>
        </div>
        
        <div class="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            <div class="col-span-full">
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Código del Establecimiento</label>
                <input type="text" class="input-field-tw h-12 text-sm bg-slate-50 dark:bg-slate-800 cursor-not-allowed opacity-60" value="${sanitizeInput(school.code)}" readonly>
                <p class="text-[0.6rem] text-slate-400 mt-2 italic ml-1">* El código no es editable por integridad de datos.</p>
            </div>

            <div class="col-span-full">
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Nombre Oficial</label>
                <input type="text" id="edit-school-name" class="input-field-tw h-12 text-sm" value="${sanitizeInput(school.name)}">
            </div>

            <div class="col-span-full font-bold text-slate-800 dark:text-white py-2 border-b border-slate-50 dark:border-slate-800 uppercase text-[0.65rem] tracking-widest bg-primary/5 -mx-8 px-8 mb-2 mt-4">Localización y GPS (Antifraude)</div>

            <div>
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Latitud</label>
                <input type="number" step="any" id="edit-school-lat" class="input-field-tw h-11 text-sm" value="${school.latitude || ''}" placeholder="Ej: 14.6349">
            </div>
            <div>
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Longitud</label>
                <input type="number" step="any" id="edit-school-lng" class="input-field-tw h-11 text-sm" value="${school.longitude || ''}" placeholder="Ej: -90.5069">
            </div>
            <div class="col-span-full">
                <div class="flex gap-4 items-end">
                    <div class="grow">
                        <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Radio de Geocerca (Metros)</label>
                        <input type="number" id="edit-school-radius" class="input-field-tw h-11 text-sm" value="${school.geofence_radius || 100}">
                    </div>
                    <button class="btn-secondary-tw h-11 text-[0.6rem] font-black uppercase" onclick="captureSchoolGPS()">
                        <i class="fas fa-crosshairs mr-2"></i> Capturar Mi GPS
                    </button>
                </div>
                <p class="text-[0.6rem] text-slate-400 mt-2 italic ml-1">Define el punto central y el radio permitido para el Check-in del tutor.</p>
            </div>

            <div class="col-span-full font-bold text-slate-800 dark:text-white py-2 border-b border-slate-50 dark:border-slate-800 uppercase text-[0.65rem] tracking-widest bg-primary/5 -mx-8 px-8 mb-2 mt-4">Localización y Contacto</div>

            <div>
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Departamento</label>
                <input type="text" id="edit-school-department" class="input-field-tw h-11 text-sm" value="${sanitizeInput(school.department)}">
            </div>
            <div>
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Municipio</label>
                <input type="text" id="edit-school-municipality" class="input-field-tw h-11 text-sm" value="${sanitizeInput(school.municipality)}">
            </div>

            <div class="col-span-full">
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Dirección Completa</label>
                <input type="text" id="edit-school-address" class="input-field-tw h-11 text-sm" value="${sanitizeInput(school.address || '')}">
            </div>

            <div>
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Teléfono</label>
                <input type="tel" id="edit-school-phone" class="input-field-tw h-11 text-sm" value="${sanitizeInput(school.phone || '')}">
            </div>
            <div>
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Email Institucional</label>
                <input type="email" id="edit-school-email" class="input-field-tw h-11 text-sm" value="${sanitizeInput(school.email || '')}">
            </div>

            <div class="col-span-full font-bold text-slate-800 dark:text-white py-2 border-b border-slate-50 dark:border-slate-800 uppercase text-[0.65rem] tracking-widest bg-primary/5 -mx-8 px-8 mb-2 mt-4">Categorización Educativa</div>

            <div>
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Sector</label>
                <select id="edit-school-sector" class="input-field-tw h-11 text-sm">
                  ${SCHOOL_SECTORS.map(s => `<option value="${s}" ${school.sector === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Nivel</label>
                <select id="edit-school-level" class="input-field-tw h-11 text-sm">
                  ${EDUCATION_LEVELS.map(l => `<option value="${l}" ${school.level === l ? 'selected' : ''}>${l}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Jornada</label>
                <select id="edit-school-schedule" class="input-field-tw h-11 text-sm">
                  ${SCHEDULES.map(s => `<option value="${s}" ${school.schedule === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-2 block ml-1">Área</label>
                <select id="edit-school-area" class="input-field-tw h-11 text-sm">
                  ${AREAS.map(a => `<option value="${a}" ${school.area === a ? 'selected' : ''}>${a}</option>`).join('')}
                </select>
            </div>

            <div class="col-span-full">
                <div class="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                    <label class="text-[0.6rem] font-black uppercase text-amber-600 dark:text-amber-500 tracking-widest mb-2 block ml-1">Meta de Proyectos (Bimestre)</label>
                    <input type="number" id="edit-school-projects-target" class="input-field-tw h-11 text-sm border-amber-200" value="${school.projects_per_bimestre || 4}" min="1" max="20">
                    <p class="text-[0.6rem] text-amber-600/70 mt-2 italic ml-1">* Esta meta personalizada para el establecimiento prevalece sobre el estándar global.</p>
                </div>
            </div>
          </div>
        </div>

        <div class="p-8 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
            <button class="btn-secondary-tw px-6 h-12 text-xs uppercase font-bold tracking-widest" onclick="this.closest('.fixed').remove()">CANCELAR</button>
            <button class="btn-primary-tw px-10 h-12 text-xs uppercase font-bold tracking-widest shadow-xl shadow-primary/30" onclick="saveSchoolChanges(${schoolId})" id="btn-save-school">
              <i class="fas fa-save mr-2 shadow-none"></i> ACTUALIZAR DATOS
            </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

  } catch (err) {
    console.error('Error cargando establecimiento:', err);
    showToast('❌ Error al cargar establecimiento', 'error');
  }
}

function captureSchoolGPS() {
  const btn = event.currentTarget;
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detectando...';

  if (!navigator.geolocation) {
    showToast('❌ Tu navegador no soporta geolocalización', 'error');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      document.getElementById('edit-school-lat').value = latitude.toFixed(6);
      document.getElementById('edit-school-lng').value = longitude.toFixed(6);
      showToast('📍 Coordenadas capturadas con éxito', 'success');
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    },
    (err) => {
      console.error('Error GPS:', err);
      showToast('❌ No se pudo obtener la ubicación: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    },
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
  );
}

async function saveSchoolChanges(schoolId) {
  const name = document.getElementById('edit-school-name')?.value.trim();
  const address = document.getElementById('edit-school-address')?.value.trim();
  const phone = document.getElementById('edit-school-phone')?.value.trim();
  const email = document.getElementById('edit-school-email')?.value.trim();
  const department = document.getElementById('edit-school-department')?.value.trim();
  const municipality = document.getElementById('edit-school-municipality')?.value.trim();
  const sector = document.getElementById('edit-school-sector')?.value;
  const level = document.getElementById('edit-school-level')?.value;
  const schedule = document.getElementById('edit-school-schedule')?.value;
  const area = document.getElementById('edit-school-area')?.value;
  const projectsTarget = parseInt(document.getElementById('edit-school-projects-target')?.value);

  const lat = parseFloat(document.getElementById('edit-school-lat')?.value);
  const lng = parseFloat(document.getElementById('edit-school-lng')?.value);
  const radius = parseInt(document.getElementById('edit-school-radius')?.value);

  const btn = document.getElementById('btn-save-school');

  if (!name || !department || !municipality) {
    return showToast('❌ Completa nombre, departamento y municipio', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

  try {
    const { error } = await _supabase
      .from('schools')
      .update({
        name,
        address: address || null,
        phone: phone || null,
        email: email || null,
        department,
        municipality,
        sector,
        level,
        schedule,
        area,
        projects_per_bimestre: isNaN(projectsTarget) ? 4 : projectsTarget,
        latitude: isNaN(lat) ? null : lat,
        longitude: isNaN(lng) ? null : lng,
        geofence_radius: isNaN(radius) ? 100 : radius
      })
      .eq('id', schoolId);

    if (error) throw error;

    showToast('✅ Establecimiento actualizado correctamente', 'success');

    // Remover específicamente el modal de edición
    const editModal = document.querySelector('.fixed.z-\\[200\\]');
    if (editModal) editModal.remove();
    else document.querySelector('.fixed').remove(); // Fallback

    await loadSchools();

  } catch (err) {
    console.error('Error actualizando establecimiento:', err);
    showToast('❌ Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
  }
}

async function deleteSchool(schoolId, schoolName) {
  if (!confirm(`¿Eliminar "${schoolName}"?\n\nAdvertencia: Esto puede afectar a estudiantes y docentes asignados.`)) {
    return;
  }

  try {
    const { error } = await _supabase
      .from('schools')
      .delete()
      .eq('id', schoolId);

    if (error) throw error;

    showToast('✅ Establecimiento eliminado', 'success');
    await loadSchools();

  } catch (err) {
    console.error('Error eliminando establecimiento:', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}

async function exportSchoolsCSV() {
  try {
    const { data: schools } = await _supabase
      .from('schools')
      .select('*')
      .order('department, municipality, name');

    if (!schools || schools.length === 0) {
      return showToast('❌ No hay establecimientos para exportar', 'error');
    }

    let csvContent = 'Codigo,Nombre,Direccion,Telefono,Email,Departamento,Municipio,Sector,Nivel,Jornada,Area\n';

    schools.forEach(s => {
      const nombre = (s.name || '').replace(/,/g, ';');
      const direccion = (s.address || '').replace(/,/g, ';');

      csvContent += `${s.code},"${nombre}","${direccion}",${s.phone || ''},${s.email || ''},${s.department},${s.municipality},${s.sector},${s.level},${s.schedule},${s.area}\n`;
    });

    downloadCSV(csvContent, 'establecimientos_export.csv');
    showToast(`✅ ${schools.length} establecimientos exportados`, 'success');

  } catch (err) {
    console.error('Error exportando:', err);
    showToast('❌ Error al exportar', 'error');
  }
}

function toggleSchoolView(view) {
  const list = document.getElementById('schools-list-view');
  const map = document.getElementById('schools-map-view');
  const btnList = document.getElementById('btn-list-view');
  const btnMap = document.getElementById('btn-map-view');

  if (view === 'list') {
    list?.classList.remove('hidden');
    map?.classList.add('hidden');
    btnList?.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-primary');
    btnList?.classList.remove('text-slate-500');
    btnMap?.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-primary');
    btnMap?.classList.add('text-slate-500');
  } else {
    list?.classList.add('hidden');
    map?.classList.remove('hidden');
    btnMap?.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-primary');
    btnMap?.classList.remove('text-slate-500');
    btnList?.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-primary');
    btnList?.classList.add('text-slate-500');
  }
}

function renderDepartmentalHeatmap(schools) {
  if (!schools || schools.length === 0) return '';

  const deptCounts = {};
  schools.forEach(s => {
    const dept = s.department || 'Sin Definir';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });

  const sortedDepts = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = sortedDepts[0][1];

  return `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      ${sortedDepts.map(([name, count]) => {
    const intensity = Math.max(10, Math.round((count / maxCount) * 100));
    // Using semi-transparent primary color for heatmap
    return `
          <div class="glass-card p-6 border-l-4 transition-all hover:scale-[1.02] cursor-default flex flex-col justify-between" style="border-left-color: rgba(0, 173, 239, ${intensity / 100}); background: rgba(0, 173, 239, ${intensity / 400})">
            <div>
                <h4 class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mb-1">Departamento</h4>
                <div class="text-xl font-black text-slate-800 dark:text-white uppercase truncate">${sanitizeInput(name)}</div>
            </div>
            <div class="mt-4 flex items-end justify-between">
                <div>
                   <div class="text-3xl font-black text-primary">${count}</div>
                   <div class="text-[0.55rem] font-bold text-slate-400 uppercase tracking-tighter">Establecimientos</div>
                </div>
                <div class="w-10 h-10 rounded-full flex items-center justify-center bg-white dark:bg-slate-800 text-primary shadow-sm">
                   <i class="fas fa-map-marker-alt"></i>
                </div>
            </div>
          </div>
        `;
  }).join('')}
    </div>
  `;
}

console.log('✅ schools.js cargado completamente');
