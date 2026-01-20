// ================================================
// GESTIÓN DE ESTABLECIMIENTOS - PARTE 1
// ================================================

async function loadSchools() {
  const container = document.getElementById('schools-container');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Cargando establecimientos...</div>';

  try {
    const { data: schools, error } = await _supabase
      .from('schools')
      .select('*')
      .order('department, municipality, name');

    if (error) throw error;

    container.innerHTML = `
      <div style="margin-bottom: 24px; display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn-primary" onclick="openAddSchoolModal()">
          <i class="fas fa-school"></i> Agregar Establecimiento
        </button>
        <button class="btn-secondary" onclick="exportSchoolsCSV()">
          <i class="fas fa-download"></i> Exportar CSV
        </button>
        <input 
          type="text" 
          id="search-schools" 
          placeholder="🔍 Buscar establecimiento..." 
          style="padding: 10px 16px; border: 1px solid var(--border-color); border-radius: 8px; flex: 1; min-width: 250px; font-size: 0.9rem;"
          onkeyup="filterSchools()"
        >
      </div>

      ${!schools || schools.length === 0 ? '<div class="empty-state">📭 No hay establecimientos registrados</div>' : `
        <div style="overflow-x: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Departamento</th>
                <th>Municipio</th>
                <th>Sector</th>
                <th>Nivel</th>
                <th>Área</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${schools.map(s => `
                <tr class="school-row" data-name="${s.name.toLowerCase()}" data-code="${s.code.toLowerCase()}">
                  <td>de>${sanitizeInput(s.code)}</code></td>
                  <td><strong>${sanitizeInput(s.name)}</strong></td>
                  <td>${sanitizeInput(s.department)}</td>
                  <td>${sanitizeInput(s.municipality)}</td>
                  <td>
                    <span style="background: var(--light-gray); padding: 4px 10px; border-radius: 6px; font-size: 0.85rem; font-weight: 500;">
                      ${sanitizeInput(s.sector)}
                    </span>
                  </td>
                  <td>
                    <span style="background: #e3f2fd; color: #1976d2; padding: 4px 10px; border-radius: 6px; font-size: 0.85rem; font-weight: 500;">
                      ${sanitizeInput(s.level)}
                    </span>
                  </td>
                  <td>
                    <span style="background: #e8f5e9; color: #388e3c; padding: 4px 10px; border-radius: 6px; font-size: 0.85rem; font-weight: 500;">
                      ${sanitizeInput(s.area)}
                    </span>
                  </td>
                  <td>
                    <button class="btn-icon" onclick="viewSchoolDetails(${s.id})" title="Ver detalles">
                      <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon" onclick="editSchool(${s.id})" title="Editar">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteSchool(${s.id}, '${sanitizeInput(s.name).replace(/'/g, "\\'")}');" title="Eliminar" style="color: var(--danger-color);">
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
    console.error('Error cargando establecimientos:', err);
    container.innerHTML = '<div class="error-state">❌ Error al cargar establecimientos</div>';
  }
}

function filterSchools() {
  const searchTerm = document.getElementById('search-schools')?.value.toLowerCase() || '';
  const rows = document.querySelectorAll('.school-row');
  
  rows.forEach(row => {
    const name = row.dataset.name || '';
    const code = row.dataset.code || '';
    
    if (name.includes(searchTerm) || code.includes(searchTerm)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
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
    modal.className = 'modal active';
    
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>✏️ Editar Establecimiento</h2>
          <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
            <label>
              <strong>Código:</strong>
              <input type="text" id="edit-school-code" class="input-field" value="${sanitizeInput(school.code)}" readonly style="background: var(--light-gray); cursor: not-allowed;">
              <small style="color: var(--text-light); font-size: 0.8rem;">El código no se puede modificar</small>
            </label>

            <label>
              <strong>Nombre:</strong>
              <input type="text" id="edit-school-name" class="input-field" value="${sanitizeInput(school.name)}">
            </label>

            <label>
              <strong>Dirección:</strong>
              <input type="text" id="edit-school-address" class="input-field" value="${sanitizeInput(school.address || '')}">
            </label>

            <label>
              <strong>Teléfono:</strong>
              <input type="tel" id="edit-school-phone" class="input-field" value="${sanitizeInput(school.phone || '')}">
            </label>

            <label>
              <strong>Email:</strong>
              <input type="email" id="edit-school-email" class="input-field" value="${sanitizeInput(school.email || '')}">
            </label>

            <label>
              <strong>Departamento:</strong>
              <input type="text" id="edit-school-department" class="input-field" value="${sanitizeInput(school.department)}">
            </label>

            <label>
              <strong>Municipio:</strong>
              <input type="text" id="edit-school-municipality" class="input-field" value="${sanitizeInput(school.municipality)}">
            </label>

            <label>
              <strong>Sector:</strong>
              <select id="edit-school-sector" class="input-field">
                ${SCHOOL_SECTORS.map(s => `<option value="${s}" ${school.sector === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </label>

            <label>
              <strong>Nivel:</strong>
              <select id="edit-school-level" class="input-field">
                ${EDUCATION_LEVELS.map(l => `<option value="${l}" ${school.level === l ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </label>

            <label>
              <strong>Jornada:</strong>
              <select id="edit-school-schedule" class="input-field">
                ${SCHEDULES.map(s => `<option value="${s}" ${school.schedule === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </label>

            <label>
              <strong>Área:</strong>
              <select id="edit-school-area" class="input-field">
                ${AREAS.map(a => `<option value="${a}" ${school.area === a ? 'selected' : ''}>${a}</option>`).join('')}
              </select>
            </label>
          </div>

          <button class="btn-primary" onclick="saveSchoolChanges(${schoolId})" id="btn-save-school" style="margin-top: 20px;">
            <i class="fas fa-save"></i> Guardar Cambios
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
        area
      })
      .eq('id', schoolId);

    if (error) throw error;

    showToast('✅ Establecimiento actualizado correctamente', 'success');
    document.querySelector('.modal').remove();
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

console.log('✅ schools.js cargado completamente');
