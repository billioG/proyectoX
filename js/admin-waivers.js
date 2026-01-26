// ================================================
// GESTIÓN DE EXENCIONES DE ASISTENCIA (ADMIN)
// ================================================

async function loadPendingWaivers() {
  try {
    const { data: waivers, error } = await _supabase
      .from('attendance_waivers')
      .select(`
        *,
        teachers(full_name, email)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return waivers || [];
  } catch (err) {
    console.error('Error cargando exenciones pendientes:', err);
    return [];
  }
}

async function approveWaiver(waiverId) {
  const btn = event.target;
  const oldText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

  try {
    // 1. Obtener detalles de la exención
    const { data: waiver, error: waiverError } = await _supabase
      .from('attendance_waivers')
      .select('*')
      .eq('id', waiverId)
      .single();

    if (waiverError) throw waiverError;

    // 2. Aprobar la exención
    const { error: updateError } = await _supabase
      .from('attendance_waivers')
      .update({
        status: 'approved',
        admin_comment: 'Aprobado automáticamente',
        updated_at: new Date().toISOString()
      })
      .eq('id', waiverId);

    if (updateError) throw updateError;

    // 3. Registrar asistencia automática para los estudiantes afectados
    await registerAttendanceForWaiver(waiver);

    showToast('✅ Exención aprobada y asistencia registrada', 'success');

    // Recargar dashboard
    if (typeof loadAdminDashboard === 'function') {
      await loadAdminDashboard();
    }

  } catch (err) {
    console.error('Error aprobando exención:', err);
    showToast('❌ Error: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = oldText;
  }
}

async function rejectWaiver(waiverId) {
  const reason = prompt('¿Por qué rechazas esta solicitud? (opcional)');

  try {
    const { error } = await _supabase
      .from('attendance_waivers')
      .update({
        status: 'rejected',
        admin_comment: reason || 'Rechazado',
        updated_at: new Date().toISOString()
      })
      .eq('id', waiverId);

    if (error) throw error;

    showToast('✅ Exención rechazada', 'success');

    // Recargar dashboard
    if (typeof loadAdminDashboard === 'function') {
      await loadAdminDashboard();
    }

  } catch (err) {
    console.error('Error rechazando exención:', err);
    showToast('❌ Error: ' + err.message, 'error');
  }
}

async function registerAttendanceForWaiver(waiver) {
  try {
    const { teacher_id, date, school_code, grade, section } = waiver;

    // Determinar qué estudiantes se ven afectados
    let studentsQuery = _supabase
      .from('students')
      .select('id')
      .eq('school_code', school_code);

    // Si tiene grade y section específicos, filtrar por ellos
    if (grade && section) {
      studentsQuery = studentsQuery.eq('grade', grade).eq('section', section);
    }

    const { data: students, error: studentsError } = await studentsQuery;

    if (studentsError) throw studentsError;

    if (!students || students.length === 0) {
      console.warn('No se encontraron estudiantes para esta exención');
      return;
    }

    // Crear registros de asistencia para todos los estudiantes
    const attendanceRecords = students.map(student => ({
      student_id: student.id,
      teacher_id: teacher_id,
      school_code: school_code,
      grade: grade || null,
      section: section || null,
      date: date,
      time: '08:00:00', // Hora por defecto
      status: 'excused', // Estado especial para exenciones aprobadas
      created_at: new Date().toISOString()
    }));

    // Insertar en lotes para evitar problemas de tamaño
    const batchSize = 100;
    for (let i = 0; i < attendanceRecords.length; i += batchSize) {
      const batch = attendanceRecords.slice(i, i + batchSize);
      const { error: insertError } = await _supabase
        .from('attendance')
        .upsert(batch, { onConflict: 'student_id,date', ignoreDuplicates: false });

      if (insertError) {
        console.error('Error insertando lote de asistencia:', insertError);
        throw insertError;
      }
    }

    console.log(`✅ Registrada asistencia para ${students.length} estudiantes`);

  } catch (err) {
    console.error('Error registrando asistencia automática:', err);
    throw err;
  }
}

async function showWaiverDetailsModal(waiver) {
  const modal = document.createElement('div');
  modal.className = 'modal active';

  const teacherName = waiver.teachers?.full_name || 'Docente';
  const teacherEmail = waiver.teachers?.email || '';
  const scopeText = waiver.grade && waiver.section
    ? `${waiver.grade} ${waiver.section}`
    : 'Todos los grupos del establecimiento';

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header">
        <h2>📋 Detalles de la Solicitud</h2>
        <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <div style="display: grid; gap: 16px;">
          <div>
            <strong style="color: var(--heading-color);">👨‍🏫 Docente:</strong>
            <p style="margin: 4px 0 0 0;">${sanitizeInput(teacherName)}</p>
            <small style="color: var(--text-light);">${teacherEmail}</small>
          </div>

          <div>
            <strong style="color: var(--heading-color);">📅 Fecha Afectada:</strong>
            <p style="margin: 4px 0 0 0;">${formatDate(waiver.date)}</p>
          </div>

          <div>
            <strong style="color: var(--heading-color);">🏫 Establecimiento:</strong>
            <p style="margin: 4px 0 0 0;">${waiver.school_code || 'No especificado'}</p>
          </div>

          <div>
            <strong style="color: var(--heading-color);">📚 Alcance:</strong>
            <p style="margin: 4px 0 0 0;">${scopeText}</p>
          </div>

          <div>
            <strong style="color: var(--heading-color);">📝 Motivo:</strong>
            <p style="margin: 4px 0 0 0; padding: 12px; background: var(--light-gray); border-radius: 8px;">
              ${sanitizeInput(waiver.reason)}
            </p>
          </div>

          <div>
            <strong style="color: var(--heading-color);">🕐 Solicitado:</strong>
            <p style="margin: 4px 0 0 0;">${formatDate(waiver.created_at)}</p>
          </div>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 24px; justify-content: flex-end;">
          <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cerrar</button>
          <button class="btn-secondary" onclick="rejectWaiver('${waiver.id}'); this.closest('.modal').remove();" style="background: var(--danger-color); border-color: var(--danger-color);">
            <i class="fas fa-times"></i> Rechazar
          </button>
          <button class="btn-primary" onclick="approveWaiver('${waiver.id}'); this.closest('.modal').remove();">
            <i class="fas fa-check"></i> Aprobar
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

async function showWaiverReports() {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = '<div class="modal-content"><p>Cargando reporte completo de exenciones...</p></div>';
  document.body.appendChild(modal);

  try {
    let { data: waivers } = await _supabase
      .from('attendance_waivers')
      .select('*, teachers(full_name), schools(name)')
      .order('created_at', { ascending: false });

    modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h2>📋 Historial de Exenciones</h2>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div class="table-container" style="max-height: 500px; overflow-y: auto;">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Docente</th>
                                    <th>Establecimiento</th>
                                    <th>Motivo</th>
                                    <th>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${waivers.map(w => `
                                    <tr>
                                        <td>${formatDate(w.date)}</td>
                                        <td><strong>${w.teachers?.full_name || 'N/A'}</strong></td>
                                        <td>${w.schools?.name || w.school_code}</td>
                                        <td>${sanitizeInput(w.reason)}</td>
                                        <td><span class="status-badge status-${w.status}">${w.status.toUpperCase()}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
  } catch (e) { console.error(e); }
}

console.log('✅ admin-waivers.js actualizado');
