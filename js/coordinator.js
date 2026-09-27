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

// ================================================
// REPORTES DE MI ESTABLECIMIENTO -- asistencia y resultados académicos
// de las escuelas donde da clase alguno de sus docentes asignados, y el
// switch de si esas escuelas salen o no en el Hall de la Fama de otras
// escuelas. Requiere migrations/school-project-visibility.sql.
// ================================================
window.loadCoordinatorReports = async function loadCoordinatorReports() {
    const container = document.getElementById('coordinator-reports-container');
    if (!container || !window.currentUser) return;
    const _supabase = window._supabase;

    const { data: assignments } = await _supabase
        .from('coordinator_assignments')
        .select('teacher_id')
        .eq('coordinator_id', window.currentUser.id);
    const teacherIds = (assignments || []).map(a => a.teacher_id);

    if (!teacherIds.length) {
        container.innerHTML = `
            <div class="glass-card p-16 text-center border-2 border-dashed border-slate-100 dark:border-slate-800">
                <i class="fas fa-school-flag text-6xl text-slate-200 dark:text-slate-800 mb-4 mx-auto block"></i>
                <p class="text-slate-500 font-bold uppercase tracking-widest text-sm">Todavía no tenés docentes asignados</p>
            </div>
        `;
        return;
    }

    const { data: teacherAssignments } = await _supabase
        .from('teacher_assignments')
        .select('school_code')
        .in('teacher_id', teacherIds);
    const schoolCodes = [...new Set((teacherAssignments || []).map(a => a.school_code).filter(Boolean))];

    const { data: schools } = schoolCodes.length
        ? await _supabase.from('schools').select('code, name, public_projects').in('code', schoolCodes)
        : { data: [] };

    container.innerHTML = `
        <div class="glass-card p-6 mb-8">
            <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-1 flex items-center gap-2"><i class="fas fa-trophy text-amber-500"></i> Hall de la Fama</h3>
            <p class="text-xs text-slate-400 mb-4">Si lo apagás, los proyectos de ese establecimiento solo los ven sus propios docentes y alumnos.</p>
            <div class="space-y-3">
                ${(schools || []).map(s => `
                    <div class="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <span class="text-sm font-bold text-slate-700 dark:text-slate-200">${window.sanitizeInput(s.name)}</span>
                        <label class="relative inline-flex items-center cursor-pointer shrink-0">
                            <input type="checkbox" class="sr-only peer" ${s.public_projects !== false ? 'checked' : ''} onchange="window.toggleSchoolPublicProjects('${s.code}', this.checked)">
                            <div class="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:bg-indigo-500 transition-colors"></div>
                            <div class="absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full transition-transform peer-checked:translate-x-5"></div>
                        </label>
                    </div>
                `).join('') || '<p class="text-xs text-slate-400">Sin establecimientos.</p>'}
            </div>
        </div>

        <div id="coordinator-eval-report-container" class="mb-8"></div>
        <div id="coordinator-attendance-report-container"></div>
    `;

    if (typeof window.loadAdminEvalReport === 'function') {
        window.loadAdminEvalReport({
            containerId: 'coordinator-eval-report-container',
            schoolCodes,
            cacheKey: `coordinator_evals_${window.currentUser.id}`,
        });
    }
    if (typeof window.showAttendanceSummaryView === 'function') {
        window.showAttendanceSummaryView({
            containerId: 'coordinator-attendance-report-container',
            teacherIds,
            cacheKey: `coordinator_attendance_${window.currentUser.id}`,
        });
    }
}

window.toggleSchoolPublicProjects = async function toggleSchoolPublicProjects(schoolCode, isPublic) {
    const { error } = await window._supabase.rpc('set_school_public_projects', { p_school_code: schoolCode, p_public: isPublic });
    if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
    window.showToast(`<i class="fas fa-circle-check"></i> ${isPublic ? 'Ahora sale en el Hall de la Fama' : 'Ya no sale en el Hall de la Fama de otras escuelas'}`, 'success');
}

console.log('✅ coordinator.js cargado');
