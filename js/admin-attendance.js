// ================================================
// DASHBOARD DE ASISTENCIA (VISTA ADMINISTRATIVA)
// ================================================

async function loadAdminAttendanceReport() {
    console.log('📊 Cargando Reporte de Asistencia (Vista Resumen)...');

    // Forzar la vista de resumen con expandibles como predeterminada
    if (typeof showAttendanceSummaryView === 'function') {
        showAttendanceSummaryView();
    } else {
        const container = document.getElementById('admin-attendance-report-container');
        if (container) container.innerHTML = '<div class="error-state">❌ Error: No se pudo cargar el módulo de resumen.</div>';
    }
}

function renderAdminAttendanceHTML(container, data) {
    // Esta función queda como fallback si se necesitara la tabla simple, 
    // pero el flujo principal ya usa showAttendanceSummaryView.
    container.innerHTML = `
        <div class="section-card">
            <p style="text-align:center; padding:20px; color:var(--text-light);">Cargando visualización de datos...</p>
        </div>
    `;
}

