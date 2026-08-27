// ================================================
// PANEL COORDINADOR -- ve solo los docentes que el admin le asignó
// (tabla coordinator_assignments). Reusa el render de desempeño de
// admin-performance.js, solo filtrando el set de docentes.
// ================================================
window.loadCoordinatorDashboard = async function loadCoordinatorDashboard() {
    const container = document.getElementById('coordinator-dashboard-container');
    if (!container || !window.currentUser) return;

    const { data: assignments } = await window._supabase
        .from('coordinator_assignments')
        .select('teacher_id')
        .eq('coordinator_id', window.currentUser.id);

    const teacherIds = (assignments || []).map(a => a.teacher_id);

    if (teacherIds.length === 0) {
        container.innerHTML = `
            <div class="glass-card p-16 text-center border-2 border-dashed border-slate-100 dark:border-slate-800">
                <i class="fas fa-users-slash text-6xl text-slate-200 dark:text-slate-800 mb-4 mx-auto block"></i>
                <p class="text-slate-500 font-bold uppercase tracking-widest text-sm">Todavía no tenés docentes asignados</p>
                <p class="text-slate-400 text-xs mt-2">Pedile a un administrador que te asigne docentes desde el panel de Docentes.</p>
            </div>
        `;
        return;
    }

    if (typeof window.loadAdminTeacherPerformance !== 'function') return;
    await window.loadAdminTeacherPerformance({
        containerId: 'coordinator-dashboard-container',
        teacherIds,
        cacheKey: `coordinator_dashboard_${window.currentUser.id}`,
        title: 'Mis Docentes',
        subtitle: 'Métricas de los docentes asignados a tu coordinación',
        backView: null,
    });
}

console.log('✅ coordinator.js cargado');
