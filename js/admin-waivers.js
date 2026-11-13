// ================================================
// GESTIÓN DE EXENCIONES DE ASISTENCIA (ADMIN)
// ================================================
import { renderWaiverHistoryTable, formatWaiverDate } from './waiver-logic.js';
window.formatWaiverDate = formatWaiverDate; // lo usa el cuadro de pendientes del dashboard (js/admin-dashboard.js)

window.loadPendingWaivers = async function loadPendingWaivers() {
  try {
    const { data: waivers, error } = await window._supabase
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

// Cuadro «Centro de Acción» del dashboard: se vuelve a pedir AL SERVIDOR cada vez (consulta chica, sin pasar por el snapshot en caché del
// dashboard). Antes la lista salía de admin_dashboard_snapshot: primero se pintaba lo guardado en el dispositivo (sin las solicitudes nuevas) y
// toda la tanda de 9 consultas pesadas tenía que terminar para que apareciera algo; con un error en esa tanda se quedaba lo viejo.
window.refreshAdminWaivers = async function refreshAdminWaivers() {
  const box = document.getElementById('admin-waivers-quick');
  if (!box || !window._supabase) return false;
  const { data, error } = await window._supabase
    .from('attendance_waivers')
    .select('*, teachers!teacher_id(full_name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) { console.error('Error actualizando exenciones pendientes:', error); return false; } // no se pinta «todo al día» si falló la consulta
  const pending = (data || []).filter(w => !window.isTestTeacherEmail?.(w.teachers?.email));
  const el = document.getElementById('admin-waivers-quick'); // el dashboard pudo repintarse mientras tanto
  if (!el) return false;
  if (typeof window.renderWaiverQuickAccess === 'function') el.innerHTML = window.renderWaiverQuickAccess(pending);
  return true;
}

// Evita aprobar/rechazar dos veces la misma solicitud con un doble toque.
const waiversInFlight = new Set();

// Tras aprobar/rechazar: el snapshot guardado ya no sirve y se actualiza el cuadro al momento; si la pantalla no tiene el cuadro, se recarga el dashboard.
async function afterWaiverChange() {
  try { window.invalidateCache?.('admin_dashboard_snapshot'); } catch (e) { /* sin caché que invalidar */ }
  const ok = await window.refreshAdminWaivers();
  if (!ok && typeof window.loadAdminDashboard === 'function') await window.loadAdminDashboard();
}

window.approveWaiver = async function approveWaiver(waiverId) {
  if (waiversInFlight.has(waiverId)) return;
  waiversInFlight.add(waiverId);
  const btn = window.event?.target?.closest?.('button') || null;
  const oldText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  try {
    // 1. Obtener detalles de la exención
    const { data: waiver, error: waiverError } = await window._supabase
      .from('attendance_waivers')
      .select('*')
      .eq('id', waiverId)
      .single();

    if (waiverError) throw waiverError;

    // 2. Aprobar la exención
    const { error: updateError } = await window._supabase
      .from('attendance_waivers')
      .update({
        status: 'approved',
        admin_comment: 'Aprobado automáticamente',
        updated_at: new Date().toISOString()
      })
      .eq('id', waiverId);

    if (updateError) throw updateError;

    // 3. Registrar asistencia automática para los estudiantes afectados.
    //    Si esto falla, la exención YA quedó aprobada: se avisa, pero el panel se actualiza igual
    //    (antes el error saltaba el refresco y la solicitud seguía viéndose como pendiente).
    let attendanceOk = true;
    try { await window.registerAttendanceForWaiver(waiver); } catch (e) { attendanceOk = false; console.error('Exención aprobada, pero falló el registro de asistencia:', e); }

    window.showToast(attendanceOk
      ? '<i class="fas fa-circle-check"></i> Exención aprobada y asistencia registrada'
      : '<i class="fas fa-triangle-exclamation"></i> Exención aprobada, pero no se pudo registrar la asistencia de los estudiantes. Avisa a soporte.', attendanceOk ? 'success' : 'error');

    await afterWaiverChange();

  } catch (err) {
    console.error('Error aprobando exención:', err);
    window.showToast('<i class="fas fa-circle-xmark"></i> Error: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = oldText; }
  } finally {
    waiversInFlight.delete(waiverId);
  }
}

window.rejectWaiver = async function rejectWaiver(waiverId) {
  const reason = prompt('¿Por qué rechazas esta solicitud? (opcional)');
  if (reason === null) return; // «Cancelar» no rechaza nada
  if (waiversInFlight.has(waiverId)) return;
  waiversInFlight.add(waiverId);

  try {
    const { error } = await window._supabase
      .from('attendance_waivers')
      .update({
        status: 'rejected',
        admin_comment: reason || 'Rechazado',
        updated_at: new Date().toISOString()
      })
      .eq('id', waiverId);

    if (error) throw error;

    window.showToast('<i class="fas fa-circle-check"></i> Exención rechazada', 'success');

    await afterWaiverChange();

  } catch (err) {
    console.error('Error rechazando exención:', err);
    window.showToast('<i class="fas fa-circle-xmark"></i> Error: ' + err.message, 'error');
  } finally {
    waiversInFlight.delete(waiverId);
  }
}

window.registerAttendanceForWaiver = async function registerAttendanceForWaiver(waiver) {
  try {
    const { teacher_id, date, school_code, grade, section } = waiver;

    // Determinar qué estudiantes se ven afectados
    let studentsQuery = window._supabase
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
      const { error: insertError } = await window._supabase
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

window.showWaiverDetailsModal = async function showWaiverDetailsModal(waiver) {
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
        <h2><i class="fas fa-clipboard-list"></i> Detalles de la Solicitud</h2>
        <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body">
        <div style="display: grid; gap: 16px;">
          <div>
            <strong style="color: var(--heading-color);"><i class="fas fa-chalkboard-user"></i>‍<i class="fas fa-school"></i> Docente:</strong>
            <p style="margin: 4px 0 0 0;">${window.sanitizeInput(teacherName)}</p>
            <small style="color: var(--text-light);">${teacherEmail}</small>
          </div>

          <div>
            <strong style="color: var(--heading-color);"><i class="fas fa-calendar-days"></i> Fecha Afectada:</strong>
            <p style="margin: 4px 0 0 0;">${window.formatDate(waiver.date)}</p>
          </div>

          <div>
            <strong style="color: var(--heading-color);"><i class="fas fa-school"></i> Establecimiento:</strong>
            <p style="margin: 4px 0 0 0;">${waiver.school_code || 'No especificado'}</p>
          </div>

          <div>
            <strong style="color: var(--heading-color);"><i class="fas fa-book"></i> Alcance:</strong>
            <p style="margin: 4px 0 0 0;">${scopeText}</p>
          </div>

          <div>
            <strong style="color: var(--heading-color);"><i class="fas fa-pen-to-square"></i> Motivo:</strong>
            <p style="margin: 4px 0 0 0; padding: 12px; background: var(--light-gray); border-radius: 8px;">
              ${window.sanitizeInput(waiver.reason)}
            </p>
          </div>

          <div>
            <strong style="color: var(--heading-color);"><i class="fas fa-clock"></i> Solicitado:</strong>
            <p style="margin: 4px 0 0 0;">${window.formatDate(waiver.created_at)}</p>
          </div>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 24px; justify-content: flex-end;">
          <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cerrar</button>
          <button class="btn-secondary" onclick="window.rejectWaiver('${waiver.id}'); this.closest('.modal').remove();" style="background: var(--danger-color); border-color: var(--danger-color);">
            <i class="fas fa-times"></i> Rechazar
          </button>
          <button class="btn-primary" onclick="window.approveWaiver('${waiver.id}'); this.closest('.modal').remove();">
            <i class="fas fa-check"></i> Aprobar
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

// Historial de exenciones: ventana fija con fondo oscuro (clases Tailwind ya compiladas; `.modal`/`.modal-content` NO existen en ningún CSS
// del proyecto, por eso antes el contenido se pintaba como texto suelto al final de la página y cada clic en «Ver historial» agregaba otro bloque).
const REPORTS_MODAL_ID = 'waiver-reports-modal';

function closeWaiverReports() {
  const m = document.getElementById(REPORTS_MODAL_ID);
  if (m?._onKey) document.removeEventListener('keydown', m._onKey);
  m?.remove();
}
window.closeWaiverReports = closeWaiverReports;

function waiverReportsShell(innerHtml) {
  return `
    <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700">
      <div class="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <h3 class="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3"><i class="fas fa-clipboard-list text-primary"></i> Historial de Exenciones</h3>
        <button type="button" data-close-waivers aria-label="Cerrar" class="w-9 h-9 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-2xl leading-none">×</button>
      </div>
      <div class="p-6 overflow-y-auto flex-1">${innerHtml}</div>
      <div class="flex justify-end p-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
        <button type="button" data-close-waivers class="px-5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase tracking-widest">Cerrar</button>
      </div>
    </div>`;
}

window.showWaiverReports = async function showWaiverReports() {
  closeWaiverReports(); // nunca dos ventanas ni bloques repetidos
  const modal = document.createElement('div');
  modal.id = REPORTS_MODAL_ID;
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm';
  modal.innerHTML = waiverReportsShell('<p class="text-center py-10 text-sm font-bold text-slate-400"><i class="fas fa-spinner fa-spin"></i> Cargando historial de exenciones...</p>');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest?.('[data-close-waivers]')) closeWaiverReports(); });
  modal._onKey = (e) => { if (e.key === 'Escape') closeWaiverReports(); };
  document.addEventListener('keydown', modal._onKey);
  document.body.appendChild(modal);

  let shown = false;
  try {
    // fetchWithCache llama al callback hasta 2 veces (lo guardado y lo fresco): cada llamada REEMPLAZA el contenido, no lo agrega.
    const result = await window.fetchWithCache('admin_waivers_history', async () => {
      return await window._supabase
        .from('attendance_waivers')
        .select('*, teachers(full_name), schools(name)')
        .order('created_at', { ascending: false });
    }, (waivers) => {
      if (document.getElementById(REPORTS_MODAL_ID) !== modal) return; // ya la cerraron
      shown = true;
      window.renderWaiverReportsUI(modal, waivers);
    });
    // Sin conexión y sin nada guardado fetchWithCache no lanza: devuelve null.
    if (!shown && document.getElementById(REPORTS_MODAL_ID) === modal) throw new Error(result === null ? 'sin datos' : 'sin respuesta');
  } catch (e) {
    console.error(e);
    const m = document.getElementById(REPORTS_MODAL_ID);
    if (m && !shown) m.innerHTML = waiverReportsShell('<p class="text-center py-10 text-sm font-bold text-rose-500"><i class="fas fa-circle-xmark"></i> No se pudo cargar el historial. Revisa tu conexión e inténtalo de nuevo.</p>');
  }
}

window.renderWaiverReportsUI = function renderWaiverReportsUI(modal, waivers) {
  modal.innerHTML = waiverReportsShell(renderWaiverHistoryTable(waivers, window.sanitizeInput));
}

console.log('✅ admin-waivers.js actualizado');
