/**
 * ADMIN DASHBOARD - Panel principal (Tailwind Edition)
 */

let dashboardStats = null;

window.loadAdminDashboard = async function loadAdminDashboard() {
    const container = document.getElementById('admin-dashboard-container');
    if (!container) return;

    const _supabase = window._supabase;
    const fetchWithCache = window.fetchWithCache;

    // Mostrar skeleton o loader inicial solo si no hay nada
    if (!container.innerHTML || container.innerHTML.includes('fa-circle-notch')) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-20 text-slate-400">
                <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
                <span class="font-bold tracking-widest uppercase text-xs">Cargando Inteligencia de Datos</span>
            </div>
        `;
    }

    try {
        // Patrón Local-First: Carga instantánea desde cache + actualización de red
        await fetchWithCache('admin_dashboard_snapshot', async () => {
            const now = new Date();
            const [projects, students, teachers, schools, evals, ratings, waivers, activeTime, monthlyReports] = await Promise.all([
                _supabase.from('projects').select('id, created_at, students:user_id(school_code)'),
                _supabase.from('students').select('gender, school_code'),
                _supabase.from('teachers').select('*'),
                _supabase.from('schools').select('*'),
                _supabase.from('evaluations').select('total_score, teacher_id'),
                _supabase.from('teacher_ratings').select('rating, teacher_id, students(school_code)'),
                _supabase.from('attendance_waivers').select('*, teachers!teacher_id(full_name)').eq('status', 'pending'),
                _supabase.from('active_time_tracking').select('user_id, total_seconds, role, school_code'),
                _supabase.from('teacher_monthly_reports').select('*, teachers(full_name, email)').eq('month', now.getMonth() + 1).eq('year', now.getFullYear())
            ]);

            // Cuentas/establecimiento de prueba interna -- no deben contaminar
            // el dashboard ejecutivo (rendimiento, satisfacción, tiempo, etc.).
            const testSchoolCodes = window.getTestSchoolCodes ? window.getTestSchoolCodes(schools.data) : new Set();
            const testTeacherIds = new Set((teachers.data || []).filter(t => window.isTestTeacherEmail?.(t.email)).map(t => t.id));

            const filteredProjects = (projects.data || []).filter(p => {
                const student = Array.isArray(p.students) ? p.students[0] : p.students;
                return !student || !window.isTestSchoolCode(testSchoolCodes, student.school_code);
            });
            const filteredStudents = (students.data || []).filter(s => !window.isTestSchoolCode(testSchoolCodes, s.school_code));
            const filteredTeachers = (teachers.data || []).filter(t => !testTeacherIds.has(t.id));
            const filteredSchools = (schools.data || []).filter(s => !window.isTestSchoolCode(testSchoolCodes, s.code));
            const filteredEvals = (evals.data || []).filter(e => !testTeacherIds.has(e.teacher_id));
            const filteredRatings = (ratings.data || []).filter(r => {
                const student = Array.isArray(r.students) ? r.students[0] : r.students;
                return !testTeacherIds.has(r.teacher_id) && (!student || !window.isTestSchoolCode(testSchoolCodes, student.school_code));
            });
            const filteredWaivers = (waivers.data || []).filter(w => !testTeacherIds.has(w.teacher_id));
            const filteredActiveTime = (activeTime.data || []).filter(a => !window.isTestSchoolCode(testSchoolCodes, a.school_code) && !testTeacherIds.has(a.user_id));
            const filteredMonthlyReports = (monthlyReports.data || []).filter(r => !testTeacherIds.has(r.teacher_id));

            return {
                projects: filteredProjects,
                students: filteredStudents,
                teachers: filteredTeachers,
                schools: filteredSchools,
                evals: filteredEvals,
                ratings: filteredRatings,
                waivers: filteredWaivers,
                activeTime: filteredActiveTime,
                monthlyReports: filteredMonthlyReports
            };
        }, (snapshot) => {
            // Procesar y renderizar los datos (ya sean de cache o frescos)
            window.processAndRenderDashboard(container, snapshot);
        });

    } catch (err) {
        console.error('Error Dashboard:', err);
        container.innerHTML = '<div class="p-10 text-rose-500 font-bold bg-rose-50 rounded-3xl border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/30"><i class="fas fa-circle-xmark"></i> Error al cargar el Dashboard Ejecutivo</div>';
    }
}

window.processAndRenderDashboard = function processAndRenderDashboard(container, data) {
    const { projects, students, teachers, schools, evals, ratings, waivers, activeTime, monthlyReports } = data;
    window._monthlyReportsCache = monthlyReports || [];

    const totalActiveSeconds = (activeTime || []).reduce((sum, entry) => sum + (entry.total_seconds || 0), 0);
    const activeTimeByRole = (activeTime || []).reduce((acc, entry) => {
        acc[entry.role] = (acc[entry.role] || 0) + (entry.total_seconds || 0);
        return acc;
    }, {});

    const stats = {
        totalProjects: projects?.length || 0,
        totalStudents: students?.length || 0,
        avgScore: evals?.length > 0 ? (evals.reduce((s, e) => s + (e.total_score || 0), 0) / evals.length).toFixed(1) : 0,
        globalSatisfaction: ratings?.length > 0 ? (ratings.reduce((s, r) => s + (r.rating || 0), 0) / ratings.length).toFixed(1) : 0,
        pendingWaivers: waivers || [],
        monthlyReports: monthlyReports || [],
        totalTeachers: teachers?.length || 0,
        gender: {
            F: students?.filter(s => s.gender?.toLowerCase().startsWith('f')).length || 0,
            M: students?.filter(s => s.gender?.toLowerCase().startsWith('m')).length || 0
        },
        rawStudents: students || [],
        rawRatings: ratings || [],
        activeTime: {
            totalSeconds: totalActiveSeconds,
            byRole: activeTimeByRole,
            raw: activeTime || []
        }
    };

    // Actualizar variable global para modales
    dashboardStats = { ...stats, schools: schools || [] };

    // Calcular métricas individuales por docente
    teachers.forEach(t => {
        const tRatings = ratings?.filter(r => r.teacher_id === t.id) || [];
        const tEvals = evals?.filter(e => e.teacher_id === t.id) || [];

        t.stats = {
            rating: tRatings.length > 0 ? (tRatings.reduce((sum, r) => sum + r.rating, 0) / tRatings.length) : 0,
            ratingsCount: tRatings.length,
            evalsCount: tEvals.length,
            avgEvalScore: tEvals.length > 0 ? (tEvals.reduce((sum, e) => sum + e.total_score, 0) / tEvals.length) : 0
        };
    });

    // Ordenar por rating
    teachers.sort((a, b) => b.stats.rating - a.stats.rating);

    window.renderDashboardUI(container, stats, teachers || [], schools || []);
    if (typeof window.loadTeamPerformanceDashboard === 'function') window.loadTeamPerformanceDashboard();
}

window.renderDashboardUI = function renderDashboardUI(container, stats, teachers, schools) {
    container.innerHTML = `
        <div class="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 mb-8">
            <div class="max-w-2xl">
                <h1 class="text-3xl md:text-4xl font-black text-slate-800 dark:text-white tracking-tight leading-tight mb-2">
                    Panel de Control <span class="text-primary">Ejecutivo</span>
                </h1>
                <p class="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                    Visión estratégica del progreso académico y satisfacción.
                </p>
            </div>
            
            <div class="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 w-full xl:w-auto">
                <button class="sm:flex-1 xl:flex-none bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold py-2.5 px-4 sm:px-5 rounded-xl shadow-lg shadow-amber-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 text-[0.65rem] sm:text-xs uppercase tracking-wider group" onclick="nav('admin-rocks')">
                    <i class="fas fa-flag-checkered text-sm group-hover:scale-110 transition-transform"></i>
                    <span>Gestión Tareas</span>
                </button>

                <button class="sm:flex-1 xl:flex-none bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-bold py-2.5 px-4 sm:px-5 rounded-xl shadow-lg shadow-fuchsia-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 text-[0.65rem] sm:text-xs uppercase tracking-wider group" onclick="window.openRandomEventsAdminModal()">
                    <i class="fas fa-bolt text-sm group-hover:scale-110 transition-transform"></i>
                    <span>Eventos Sorpresa</span>
                </button>

                <button class="sm:flex-1 xl:flex-none bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold py-2.5 px-4 sm:px-5 rounded-xl shadow-lg shadow-emerald-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 text-[0.65rem] sm:text-xs uppercase tracking-wider group" onclick="typeof window.openTournamentSeasonsAdminModal === 'function' ? window.openTournamentSeasonsAdminModal() : window.loadModule('profile').then(() => window.openTournamentSeasonsAdminModal())">
                    <i class="fas fa-earth-americas text-sm group-hover:scale-110 transition-transform"></i>
                    <span>Torneos</span>
                </button>

                <button class="sm:flex-1 xl:flex-none bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold py-2.5 px-4 sm:px-5 rounded-xl shadow-lg shadow-sky-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 text-[0.65rem] sm:text-xs uppercase tracking-wider group" onclick="typeof window.openAnnouncementsInbox === 'function' ? window.openAnnouncementsInbox() : window.loadModule('profile').then(() => window.openAnnouncementsInbox())">
                    <i class="fas fa-bell text-sm group-hover:scale-110 transition-transform"></i>
                    <span>Avisos</span>
                </button>

                <button class="sm:flex-1 xl:flex-none bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 hover:border-indigo-500 font-bold py-2.5 px-4 sm:px-5 rounded-xl shadow-md hover:shadow-indigo-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 text-[0.65rem] sm:text-xs uppercase tracking-wider" onclick="exportAllData()">
                    <i class="fas fa-database text-sm"></i>
                    <span>Exportar</span>
                </button>
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            <div class="glass-card p-8 bg-gradient-to-br from-primary to-blue-600 text-white border-none shadow-primary/30 transform hover:-translate-y-1 transition-transform">
                <div class="text-[0.65rem] font-black uppercase tracking-[0.2em] mb-4 opacity-80">Rendimiento Promedio</div>
                <div class="text-5xl font-black mb-2">${stats.avgScore} <span class="text-xl opacity-60">pts</span></div>
                <div class="h-1.5 w-full bg-white/20 rounded-full mt-6 overflow-hidden">
                    <div class="h-full bg-white" style="width: ${stats.avgScore}%"></div>
                </div>
            </div>

            <div class="glass-card p-8 bg-white dark:bg-slate-900 overflow-hidden relative cursor-pointer group" onclick="showSchoolSatisfactionModal()">
                <div class="absolute -right-6 -top-6 text-9xl text-slate-50 dark:text-slate-800 pointer-events-none transition-transform group-hover:scale-110">
                    <i class="fas fa-heart"></i>
                </div>
                <div class="relative z-10">
                    <div class="text-[0.65rem] font-black uppercase tracking-[0.2em] mb-4 text-slate-400">Satisfacción Global</div>
                    <div class="text-5xl font-black text-slate-800 dark:text-white mb-2 flex items-baseline gap-2">
                        ${stats.globalSatisfaction} <span class="text-2xl text-amber-500"><i class="fas fa-star"></i></span>
                    </div>
                    <div class="text-sm font-bold text-emerald-500 mt-6 flex items-center gap-1">
                        <i class="fas fa-external-link-alt"></i> Ver detalle por centro
                    </div>
                </div>
            </div>

            <div class="glass-card p-8 bg-white dark:bg-slate-900 border-l-8 border-indigo-500">
                <div class="text-[0.65rem] font-black uppercase tracking-[0.2em] mb-4 text-slate-400">Proyectos Capturados</div>
                <div class="text-5xl font-black text-slate-800 dark:text-white mb-2">${stats.totalProjects}</div>
                <p class="text-xs text-slate-500 mt-6 font-bold uppercase tracking-wider">Crecimiento este bimestre: +12%</p>
            </div>

            <div class="glass-card p-8 bg-white dark:bg-slate-900 border-l-8 border-emerald-500 cursor-pointer group hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors" onclick="showActiveTimeModal()">
                <div class="text-[0.65rem] font-black uppercase tracking-[0.2em] mb-4 text-slate-400">Tiempo de Actividad</div>
                <div class="text-5xl font-black text-slate-800 dark:text-white mb-2">
                    ${(stats.activeTime.totalSeconds / 3600).toFixed(1)} <span class="text-xl opacity-60">hrs</span>
                </div>
                <div class="text-[0.65rem] font-bold text-slate-400 mt-6 uppercase tracking-widest flex justify-between">
                    <span>Est: ${Math.floor((stats.activeTime.byRole['estudiante'] || 0) / 3600)}h</span>
                    <span>Doc: ${Math.floor((stats.activeTime.byRole['docente'] || 0) / 3600)}h</span>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10 items-start">
            <div class="flex flex-col gap-8">
                <div id="team-performance-widget"></div>

                <div class="glass-card p-8 bg-white dark:bg-slate-900">
                    <div class="flex items-center justify-between mb-6">
                        <h4 class="text-xs font-black uppercase text-slate-400 tracking-[0.2em]">Informes Mensuales -- ATT</h4>
                        <span class="text-[0.65rem] font-black px-3 py-1.5 rounded-full ${stats.monthlyReports.length >= stats.totalTeachers && stats.totalTeachers > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}">${stats.monthlyReports.length} / ${stats.totalTeachers} DOCENTES</span>
                    </div>
                    ${renderMonthlyReportsQuickAccess(stats.monthlyReports, teachers || [])}
                    <button onclick="window.generateGeneralMonthlyReport()" class="w-full mt-4 h-11 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all text-[0.65rem] font-black uppercase tracking-widest flex items-center justify-center gap-2" ${stats.monthlyReports.length === 0 ? 'disabled style="opacity:.4;cursor:not-allowed;"' : ''}>
                        <i class="fas fa-file-lines"></i> Generar Informe General
                    </button>
                </div>
            </div>

            <div class="glass-card p-8 bg-white dark:bg-slate-900">
                <div class="flex justify-between items-center mb-8">
                    <h3 class="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                        <i class="fas fa-bell text-rose-500"></i> Centro de Acción
                    </h3>
                    <span class="bg-rose-500/10 text-rose-500 text-[0.65rem] font-black px-3 py-1.5 rounded-full">INTERVENCIÓN REQUERIDA</span>
                </div>
                ${renderWaiverQuickAccess(stats.pendingWaivers)}

                <div class="mt-10 pt-8 border-t border-slate-100 dark:border-slate-800">
                    <div class="flex items-center justify-between mb-6">
                        <h4 class="text-xs font-black uppercase text-slate-400 tracking-[0.2em]">Demografía Estudiantil</h4>
                        <button onclick="showDemographicsDetail()" class="text-[0.65rem] font-bold uppercase text-primary hover:text-indigo-700 transition-colors flex items-center gap-1">
                            <i class="fas fa-table"></i> Ver Detalle
                        </button>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-rose-50 dark:bg-rose-900/10 p-5 rounded-2xl border border-rose-100 dark:border-rose-900/30 flex justify-between items-center">
                            <div>
                                <div class="text-2xl font-black text-rose-600 dark:text-rose-400">${stats.gender.F}</div>
                                <div class="text-[0.6rem] font-black uppercase text-rose-500 opacity-70">Mujeres</div>
                            </div>
                            <i class="fas fa-venus text-3xl opacity-20 text-rose-500"></i>
                        </div>
                        <div class="bg-blue-50 dark:bg-blue-900/10 p-5 rounded-2xl border border-blue-100 dark:border-blue-900/30 flex justify-between items-center">
                            <div>
                                <div class="text-2xl font-black text-blue-600 dark:text-blue-400">${stats.gender.M}</div>
                                <div class="text-[0.6rem] font-black uppercase text-blue-500 opacity-70">Hombres</div>
                            </div>
                            <i class="fas fa-mars text-3xl opacity-20 text-blue-500"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="glass-card p-0 bg-white dark:bg-slate-900 overflow-hidden shadow-2xl">
            <div class="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h3 class="text-xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                    <i class="fas fa-chalkboard-teacher text-indigo-500"></i> Ranking Docente Global
                </h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-50 dark:bg-slate-800/50 text-[0.65rem] font-black uppercase text-slate-500 dark:text-slate-400 tracking-[0.15em]">
                            <th class="px-8 py-5">Docente Líder</th>
                            <th class="px-8 py-5">Evaluación</th>
                            <th class="px-8 py-5 text-right">Métricas</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        ${teachers.map(t => window.renderTeacherRow(t, stats)).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}




window.showDemographicsDetail = function () {
    if (!dashboardStats || !dashboardStats.rawStudents) {
        alert('Datos cargando...');
        return;
    }

    const students = dashboardStats.rawStudents;
    const schools = dashboardStats.schools;

    // Create map of school code -> name
    const schoolMap = schools.reduce((acc, s) => {
        acc[s.code] = s.name;
        return acc;
    }, {});

    // Group students by school
    const schoolStats = {};
    students.forEach(s => {
        const schoolCode = s.school_code || 'SIN_CODIGO';
        if (!schoolStats[schoolCode]) {
            schoolStats[schoolCode] = { F: 0, M: 0, Total: 0, Name: schoolMap[schoolCode] || schoolCode };
        }
        const g = s.gender?.toLowerCase().charAt(0);
        if (g === 'f') schoolStats[schoolCode].F++;
        else if (g === 'm') schoolStats[schoolCode].M++;
        schoolStats[schoolCode].Total++;
    });

    const rows = Object.entries(schoolStats).map(([code, stat]) => stat);
    rows.sort((a, b) => b.Total - a.Total);

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
            <div class="p-6 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                <h2 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <i class="fas fa-users text-primary"></i> Demografía por Establecimiento
                </h2>
                <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all flex items-center justify-center" onclick="this.closest('.fixed').remove()">
                    <i class="fas fa-times text-lg"></i>
                </button>
            </div>
            
            <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                 <table class="w-full text-left">
                    <thead>
                        <tr class="text-[0.6rem] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                            <th class="pb-3 text-left">Establecimiento</th>
                            <th class="pb-3 text-center text-rose-500">Mujeres</th>
                            <th class="pb-3 text-center text-blue-500">Hombres</th>
                            <th class="pb-3 text-center">Total</th>
                        </tr>
                    </thead>
                    <tbody class="text-sm font-medium">
                        ${rows.map(row => `
                            <tr class="border-b border-slate-50 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td class="py-3 pr-4 text-slate-700 dark:text-slate-200">${row.Name}</td>
                                <td class="py-3 text-center font-bold text-rose-500 bg-rose-50/50 dark:bg-rose-900/10 rounded-lg">${row.F}</td>
                                <td class="py-3 text-center font-bold text-blue-500 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg">${row.M}</td>
                                <td class="py-3 text-center font-black text-slate-800 dark:text-white">${row.Total}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                 </table>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.showActiveTimeModal = function () {
    if (!dashboardStats || !dashboardStats.activeTime) return;

    const schools = dashboardStats.schools;
    const activeData = dashboardStats.activeTime.raw;

    // Antes comparaba códigos con === directo -- si schools.code guarda
    // "001" (con ceros) y active_time_tracking.school_code llega como "1"
    // (u otro formato), la búsqueda fallaba en silencio para CADA
    // establecimiento real y todos terminaban etiquetados igual, como si
    // fueran el mismo genérico "Actividad General". Se normaliza a string.
    const schoolMap = schools.reduce((acc, s) => {
        acc[String(s.code)] = s.name;
        return acc;
    }, {});

    const breakdown = {};
    activeData.forEach(entry => {
        const code = entry.school_code != null ? String(entry.school_code) : '__SIN_CODIGO__';
        if (!breakdown[code]) {
            const knownName = schoolMap[code];
            breakdown[code] = {
                name: knownName || (code === '__SIN_CODIGO__' ? 'Sin establecimiento asignado' : `Código desconocido: ${code}`),
                estudiante: 0, docente: 0, total: 0,
                estudianteUsers: new Set(), docenteUsers: new Set(),
            };
        }
        breakdown[code][entry.role] = (breakdown[code][entry.role] || 0) + entry.total_seconds;
        breakdown[code].total += entry.total_seconds;
        if (entry.role === 'estudiante') breakdown[code].estudianteUsers.add(entry.user_id);
        if (entry.role === 'docente') breakdown[code].docenteUsers.add(entry.user_id);
    });

    const rows = Object.values(breakdown).sort((a, b) => b.total - a.total);

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    }

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900 border border-emerald-500/30">
            <div class="p-6 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                <h2 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <i class="fas fa-clock text-emerald-500"></i> Tiempo Activo por Centro
                </h2>
                <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-all flex items-center justify-center font-bold" onclick="this.closest('.fixed').remove()">
                    <i class="fas fa-times text-lg"></i>
                </button>
            </div>
            
            <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                 <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30">
                        <div class="text-[0.6rem] font-bold text-emerald-600 uppercase mb-1">Total Acumulado</div>
                        <div class="text-2xl font-black text-emerald-700 dark:text-emerald-400">${formatTime(dashboardStats.activeTime.totalSeconds)}</div>
                    </div>
                    <div class="p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                        <div class="text-[0.6rem] font-bold text-blue-600 uppercase mb-1">Estudiantes</div>
                        <div class="text-2xl font-black text-blue-700 dark:text-blue-400">${formatTime(dashboardStats.activeTime.byRole['estudiante'] || 0)}</div>
                    </div>
                    <div class="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30">
                        <div class="text-[0.6rem] font-bold text-indigo-600 uppercase mb-1">Docentes</div>
                        <div class="text-2xl font-black text-indigo-700 dark:text-indigo-400">${formatTime(dashboardStats.activeTime.byRole['docente'] || 0)}</div>
                    </div>
                 </div>

                 <table class="w-full text-left">
                    <thead>
                        <tr class="text-[0.6rem] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                            <th class="pb-3 text-left">Establecimiento</th>
                            <th class="pb-3 text-center">Estudiantes</th>
                            <th class="pb-3 text-center">Docentes</th>
                            <th class="pb-3 text-center">Total</th>
                            <th class="pb-3 text-right">% del Total</th>
                        </tr>
                    </thead>
                    <tbody class="text-sm">
                        ${rows.map(row => {
                            const pct = dashboardStats.activeTime.totalSeconds > 0 ? Math.round((row.total / dashboardStats.activeTime.totalSeconds) * 100) : 0;
                            return `
                            <tr class="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td class="py-4 pr-4 font-bold text-slate-800 dark:text-white">${row.name}</td>
                                <td class="py-4 text-center text-slate-500 font-medium">${formatTime(row.estudiante)} <span class="text-[0.6rem] text-slate-400">(${row.estudianteUsers.size})</span></td>
                                <td class="py-4 text-center text-slate-500 font-medium">${formatTime(row.docente)} <span class="text-[0.6rem] text-slate-400">(${row.docenteUsers.size})</span></td>
                                <td class="py-4 text-center font-black text-emerald-500">${formatTime(row.total)}</td>
                                <td class="py-4 text-right text-slate-400 font-bold">${pct}%</td>
                            </tr>
                        `;
                        }).join('')}
                    </tbody>
                 </table>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.showSchoolSatisfactionModal = function () {
    if (!dashboardStats) return;

    const schools = dashboardStats.schools || [];
    const ratings = dashboardStats.rawRatings || [];

    const schoolMap = schools.reduce((acc, s) => {
        acc[String(s.code)] = s.name;
        return acc;
    }, {});

    const breakdown = {};
    ratings.forEach(r => {
        const student = Array.isArray(r.students) ? r.students[0] : r.students;
        const code = student?.school_code != null ? String(student.school_code) : 'SIN_CENTRO';
        if (!breakdown[code]) {
            breakdown[code] = { name: schoolMap[code] || 'Sin Establecimiento', sum: 0, count: 0 };
        }
        breakdown[code].sum += (r.rating || 0);
        breakdown[code].count++;
    });

    const rows = Object.values(breakdown)
        .map(row => ({ ...row, avg: row.count > 0 ? row.sum / row.count : 0 }))
        .sort((a, b) => b.avg - a.avg);

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900 border border-amber-500/30">
            <div class="p-6 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                <h2 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <i class="fas fa-heart text-amber-500"></i> Satisfacción por Centro
                </h2>
                <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-all flex items-center justify-center font-bold" onclick="this.closest('.fixed').remove()">
                    <i class="fas fa-times text-lg"></i>
                </button>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                ${rows.length === 0 ? `
                    <div class="text-center py-16 text-slate-400">
                        <i class="fas fa-star text-4xl mb-4 opacity-20"></i>
                        <p class="font-bold text-xs uppercase tracking-widest">Aún no hay calificaciones registradas</p>
                    </div>
                ` : `
                <table class="w-full text-left">
                    <thead>
                        <tr class="text-[0.6rem] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700">
                            <th class="pb-3 text-left">Establecimiento</th>
                            <th class="pb-3 text-center">Promedio</th>
                            <th class="pb-3 text-center">Calificaciones</th>
                        </tr>
                    </thead>
                    <tbody class="text-sm">
                        ${rows.map(row => `
                            <tr class="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td class="py-4 pr-4 font-bold text-slate-800 dark:text-white">${row.name}</td>
                                <td class="py-4 text-center font-black text-amber-500">${row.avg.toFixed(1)} <i class="fas fa-star text-xs"></i></td>
                                <td class="py-4 text-center text-slate-500 font-medium">${row.count}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                `}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};
function renderWaiverQuickAccess(waivers) {
    if (waivers.length === 0) return `
        <div class="bg-emerald-50 dark:bg-emerald-950/20 p-8 rounded-3xl text-center border border-emerald-100 dark:border-emerald-900/30">
            <i class="fas fa-calendar-check text-4xl text-emerald-500 mb-4 opacity-50"></i>
            <p class="text-emerald-800 dark:text-emerald-400 font-bold">Todo está al día</p>
            <p class="text-xs text-emerald-600/70 mt-1">No hay solicitudes de exención pendientes.</p>
        </div>
    `;

    return `
        <div class="space-y-4 max-h-[280px] overflow-y-auto pr-2 custom-scrollbar">
            ${waivers.map(w => `
                <div class="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-primary/30 transition-all">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                            ${(w.teachers?.full_name || 'D')[0]}
                        </div>
                        <div>
                            <div class="text-sm font-black text-slate-800 dark:text-white">${w.teachers?.full_name || 'Docente'}</div>
                            <div class="text-[0.65rem] text-slate-500 dark:text-slate-500 font-bold"><i class="far fa-calendar-alt mr-1"></i> ${new Date(w.date).toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="approveWaiver('${w.id}')" class="w-9 h-9 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"><i class="fas fa-check"></i></button>
                        <button onclick="rejectWaiver('${w.id}')" class="w-9 h-9 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"><i class="fas fa-times"></i></button>
                    </div>
                </div>
            `).join('')}
        </div>
        <button class="w-full mt-6 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-black rounded-2xl transition-all" onclick="showWaiverReports()">
            VER HISTORIAL COMPLETO
        </button>
    `;
}

function renderMonthlyReportsQuickAccess(reports, allTeachers) {
    const sentIds = new Set(reports.map(r => r.teacher_id));
    const pending = (allTeachers || []).filter(t => !sentIds.has(t.id));

    if (reports.length === 0) return `
        <div class="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-2xl text-center border border-amber-100 dark:border-amber-900/30">
            <p class="text-amber-800 dark:text-amber-400 font-bold text-sm">Ningún docente ha enviado su informe este mes todavía.</p>
        </div>
    `;

    return `
        <div class="space-y-3 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
            ${reports.map(r => `
                <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-primary/30 transition-all">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0"><i class="fas fa-check text-xs"></i></div>
                        <span class="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">${window.sanitizeInput(r.teachers?.full_name || 'Docente')}</span>
                    </div>
                    <button onclick="window.viewTeacherMonthlyReport('${r.id}')" class="shrink-0 h-8 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary text-[0.6rem] font-black uppercase">Ver</button>
                </div>
            `).join('')}
            ${pending.map(t => `
                <div class="flex items-center gap-3 p-3 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 opacity-60">
                    <div class="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-400 flex items-center justify-center shrink-0"><i class="fas fa-clock text-xs"></i></div>
                    <span class="text-sm font-bold text-slate-500 dark:text-slate-400 truncate">${window.sanitizeInput(t.full_name || 'Docente')} -- pendiente</span>
                </div>
            `).join('')}
        </div>
    `;
}

window.viewTeacherMonthlyReport = function viewTeacherMonthlyReport(reportId) {
    const r = (window._monthlyReportsCache || []).find(x => x.id === reportId);
    if (!r) return;
    const sanitizeInput = window.sanitizeInput || ((v) => v);
    const monthName = new Date(r.year, r.month - 1, 1).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
      <div class="glass-card w-full max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar p-8 shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="text-xl font-black text-slate-800 dark:text-white uppercase">${sanitizeInput(r.teachers?.full_name || 'Docente')}</h2>
            <p class="text-xs text-slate-400 uppercase tracking-widest mt-1">${monthName}</p>
          </div>
          <button onclick="this.closest('.fixed').remove()" class="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 flex items-center justify-center"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-5 text-sm">
          <div><h4 class="text-[0.65rem] font-black uppercase text-primary mb-2">Resultados Alcanzados</h4><p class="text-slate-600 dark:text-slate-300 mb-2 italic">${sanitizeInput(r.results_intro || '')}</p>
            <ul class="list-disc pl-5 space-y-1">${(r.results || []).map(x => `<li class="text-slate-600 dark:text-slate-300">${sanitizeInput(x)}</li>`).join('')}</ul>
          </div>
          <div><h4 class="text-[0.65rem] font-black uppercase text-primary mb-2">Inconvenientes Externos</h4><p class="text-slate-600 dark:text-slate-300">${sanitizeInput(r.inconveniences || '')}</p></div>
          <div><h4 class="text-[0.65rem] font-black uppercase text-primary mb-2">Acciones Implementadas</h4><p class="text-slate-600 dark:text-slate-300">${sanitizeInput(r.actions || '')}</p></div>
          <div><h4 class="text-[0.65rem] font-black uppercase text-primary mb-2">Conclusión</h4><p class="text-slate-600 dark:text-slate-300">${sanitizeInput(r.conclusion || '')}</p></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
}

window.generateGeneralMonthlyReport = async function generateGeneralMonthlyReport() {
    const reports = window._monthlyReportsCache || [];
    if (!reports.length) return;
    const sanitizeInput = window.sanitizeInput || ((v) => v);
    const monthName = new Date(reports[0].year, reports[0].month - 1, 1).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
      <div class="glass-card w-full max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar p-0 shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
        <div class="bg-gradient-to-br from-primary to-indigo-600 p-8 text-center sticky top-0 z-10">
          <h2 class="text-2xl font-black text-white uppercase tracking-tight">Informe General -- ATT</h2>
          <p class="text-indigo-100 text-[0.65rem] font-bold uppercase tracking-[0.2em] mt-1"><i class="fas fa-robot"></i> ${monthName} -- redactado por IA a partir de ${reports.length} docente(s)</p>
          <div class="flex justify-center gap-3 mt-4">
            <button id="btn-print-general-report" onclick="window.print()" class="bg-white/20 hover:bg-white/30 text-white text-[0.65rem] font-black uppercase px-4 py-2 rounded-lg hidden"><i class="fas fa-print"></i> Imprimir</button>
            <button onclick="this.closest('.fixed').remove()" class="bg-white/20 hover:bg-white/30 text-white text-[0.65rem] font-black uppercase px-4 py-2 rounded-lg">Cerrar</button>
          </div>
        </div>
        <div id="general-report-body" class="p-8">
          <div class="flex flex-col items-center justify-center py-16 text-slate-400">
            <i class="fas fa-circle-notch fa-spin text-3xl mb-4 text-primary"></i>
            <span class="text-xs font-bold uppercase tracking-widest">La IA está redactando el informe...</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    try {
        const { data: { session } } = await window._supabase.auth.getSession();
        const res = await fetch(`${window.SUPABASE_URL}/functions/v1/ai-generate-general-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: JSON.stringify({ month: reports[0].month, year: reports[0].year }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Error generando el informe');

        document.getElementById('btn-print-general-report')?.classList.remove('hidden');
        document.getElementById('general-report-body').innerHTML = `
          <div class="space-y-6 text-sm mb-8">
            <div><h4 class="text-[0.65rem] font-black uppercase text-primary mb-2">Introducción</h4><p class="text-slate-600 dark:text-slate-300 leading-relaxed">${sanitizeInput(result.introduccion)}</p></div>
            <div><h4 class="text-[0.65rem] font-black uppercase text-primary mb-2">Resultados Alcanzados</h4><p class="text-slate-600 dark:text-slate-300 leading-relaxed">${sanitizeInput(result.resultados)}</p></div>
            <div><h4 class="text-[0.65rem] font-black uppercase text-primary mb-2">Inconvenientes Externos</h4><p class="text-slate-600 dark:text-slate-300 leading-relaxed">${sanitizeInput(result.inconvenientes)}</p></div>
            <div><h4 class="text-[0.65rem] font-black uppercase text-primary mb-2">Acciones Implementadas</h4><p class="text-slate-600 dark:text-slate-300 leading-relaxed">${sanitizeInput(result.acciones)}</p></div>
            <div><h4 class="text-[0.65rem] font-black uppercase text-primary mb-2">Conclusión</h4><p class="text-slate-600 dark:text-slate-300 leading-relaxed">${sanitizeInput(result.conclusion)}</p></div>
          </div>
          <details class="border-t border-slate-100 dark:border-slate-800 pt-6">
            <summary class="cursor-pointer text-[0.65rem] font-black uppercase text-slate-400 tracking-widest mb-4">Ver informes originales por docente</summary>
            <div class="space-y-6 mt-4">
              ${reports.map(r => `
                <div class="border-b border-slate-100 dark:border-slate-800 pb-6">
                  <h3 class="text-sm font-black text-slate-800 dark:text-white mb-2">${sanitizeInput(r.teachers?.full_name || 'Docente')}</h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400"><strong>Resultados:</strong> ${sanitizeInput(r.results_intro || '')} ${(r.results || []).map(x => sanitizeInput(x)).join('; ')}</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400"><strong>Inconvenientes:</strong> ${sanitizeInput(r.inconveniences || '')}</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400"><strong>Acciones:</strong> ${sanitizeInput(r.actions || '')}</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400"><strong>Conclusión:</strong> ${sanitizeInput(r.conclusion || '')}</p>
                </div>
              `).join('')}
            </div>
          </details>
        `;
    } catch (err) {
        document.getElementById('general-report-body').innerHTML = `<div class="p-8 text-center text-rose-500 text-sm font-bold"><i class="fas fa-circle-xmark"></i> ${sanitizeInput(err.message)}</div>`;
    }
}

window.renderTeacherRow = function renderTeacherRow(t, stats) {
    const rating = t.stats?.rating || 0;
    const stars = Math.round(rating);

    return `
        <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-color group">
            <td class="px-8 py-5">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center text-slate-400 group-hover:scale-110 transition-transform">
                        ${t.profile_photo_url ? `<img src="${t.profile_photo_url}" class="w-full h-full object-cover">` : '<i class="fas fa-user-tie text-xl"></i>'}
                    </div>
                    <div>
                        <div class="text-base font-black text-slate-800 dark:text-white">${t.full_name}</div>
                        <div class="text-xs font-bold text-slate-400 tracking-tight">${t.email}</div>
                    </div>
                </div>
            </td>
            <td class="px-8 py-5">
                <div class="flex items-center gap-2">
                    <span class="text-lg font-black text-slate-800 dark:text-white tracking-tighter">${rating > 0 ? rating.toFixed(1) : '--'}</span>
                    <div class="flex text-[0.6rem] text-amber-500 ${rating === 0 ? 'opacity-30' : ''}">
                        ${Array(5).fill(0).map((_, i) => `<i class="fas fa-star ${i < stars ? '' : 'text-slate-200 dark:text-slate-700'}"></i>`).join('')}
                    </div>
                    <span class="text-[0.6rem] font-bold text-slate-400">(${t.stats?.ratingsCount || 0})</span>
                </div>
            </td>
            <td class="px-8 py-5 text-right">
                <button onclick="window.showTeacherDetailedReport('${t.id}')" class="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-primary hover:bg-primary/10 transition-all" title="Ver Reporte Detallado">
                    <i class="fas fa-chart-line text-lg"></i>
                </button>
            </td>
        </tr>
    `;
}

// ================================================
// EXPORTAR DATOS
// ================================================
window.exportAllData = function () {
    if (!dashboardStats) {
        showToast('<i class="fas fa-triangle-exclamation"></i>️ No hay datos para exportar. Espera a que termine la carga.', 'warning');
        return;
    }

    try {
        // Preparar Datos CSV
        // Header
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Reporte Ejecutivo Quetzal LMS\n";
        csvContent += `Fecha Exportacion,${new Date().toLocaleString()}\n`;
        csvContent += `Promedio General,${dashboardStats.avgScore}\n`;
        csvContent += `Satisfaccion Global,${dashboardStats.globalSatisfaction}\n`;
        csvContent += `Total Estudiantes,${dashboardStats.totalStudents}\n`;
        csvContent += `Total Proyectos,${dashboardStats.totalProjects}\n\n`;

        // Tabla de Estudiantes Raw (Muestreo)
        csvContent += "METRICAS GENERALES\n";
        csvContent += "Categoria,Valor\n";
        csvContent += `Estudiantes Femenino,${dashboardStats.gender.F}\n`;
        csvContent += `Estudiantes Masculino,${dashboardStats.gender.M}\n`;
        csvContent += `Escuelas Activas,${dashboardStats.schools ? dashboardStats.schools.length : 0}\n\n`;

        // Descargar
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `reporte_ejecutivo_quetzal_lms_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('<i class="fas fa-circle-check"></i> Datos exportados exitosamente', 'success');

    } catch (err) {
        console.error('Error exportando:', err);
        showToast('<i class="fas fa-circle-xmark"></i> Error al exportar datos', 'error');
    }
};
