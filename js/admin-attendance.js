// ================================================
// DASHBOARD DE ASISTENCIA (VISTA ADMINISTRATIVA)
// ================================================

window.loadAdminAttendanceReport = async function loadAdminAttendanceReport() {
    console.log('📊 Cargando Reporte de Asistencia (Vista Resumen)...');

    // Forzar la vista de resumen con expandibles como predeterminada
    if (typeof window.showAttendanceSummaryView === 'function') {
        window.showAttendanceSummaryView();
    } else {
        const container = document.getElementById('admin-attendance-report-container');
        if (container) container.innerHTML = '<div class="error-state"><i class="fas fa-circle-xmark"></i> Error: No se pudo cargar el módulo de resumen.</div>';
    }
}

window.renderAdminAttendanceHTML = function renderAdminAttendanceHTML(container, data) {
    // Esta función queda como fallback si se necesitara la tabla simple, 
    // pero el flujo principal ya usa showAttendanceSummaryView.
    container.innerHTML = `
        <div class="section-card">
            <p style="text-align:center; padding:20px; color:var(--text-light);">Cargando visualización de datos...</p>
        </div>
    `;
}

