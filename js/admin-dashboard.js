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
            const [projects, students, teachers, schools, evals, ratings, waivers, activeTime] = await Promise.all([
                _supabase.from('projects').select('id, created_at'),
                _supabase.from('students').select('gender, school_code'),
                _supabase.from('teachers').select('*'),
                _supabase.from('schools').select('*'),
                _supabase.from('evaluations').select('total_score, teacher_id'),
                _supabase.from('teacher_ratings').select('rating, teacher_id, students(school_code)'),
                _supabase.from('attendance_waivers').select('*, teachers!teacher_id(full_name)').eq('status', 'pending'),
                _supabase.from('active_time_tracking').select('total_seconds, role, school_code')
            ]);

            return {
                projects: projects.data || [],
                students: students.data || [],
                teachers: teachers.data || [],
                schools: schools.data || [],
                evals: evals.data || [],
                ratings: ratings.data || [],
                waivers: waivers.data || [],
                activeTime: activeTime.data || []
            };
        }, (snapshot) => {
            // Procesar y renderizar los datos (ya sean de cache o frescos)
            window.processAndRenderDashboard(container, snapshot);
        });

    } catch (err) {
        console.error('Error Dashboard:', err);
        container.innerHTML = '<div class="p-10 text-rose-500 font-bold bg-rose-50 rounded-3xl border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/30">❌ Error al cargar el Dashboard Ejecutivo</div>';
    }
}

window.processAndRenderDashboard = function processAndRenderDashboard(container, data) {
    const { projects, students, teachers, schools, evals, ratings, waivers, activeTime } = data;

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
        gender: {
            F: students?.filter(s => s.gender?.toLowerCase().startsWith('f')).length || 0,
            M: students?.filter(s => s.gender?.toLowerCase().startsWith('m')).length || 0
        },
        rawStudents: students || [],
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
            
            <div class="flex gap-3 w-full xl:w-auto">
                <button class="flex-1 xl:flex-none bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold py-2.5 px-5 rounded-xl shadow-lg shadow-amber-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 text-xs uppercase tracking-wider group" onclick="nav('admin-rocks')">
                    <i class="fas fa-flag-checkered text-sm group-hover:scale-110 transition-transform"></i>
                    <span>Gestión Tareas</span>
                </button>
                
                <button class="flex-1 xl:flex-none bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 hover:border-indigo-500 font-bold py-2.5 px-5 rounded-xl shadow-md hover:shadow-indigo-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 text-xs uppercase tracking-wider" onclick="exportAllData()">
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
                        ${stats.globalSatisfaction} <span class="text-2xl text-amber-500">★</span>
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

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
            <div id="team-performance-widget"></div>
            
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

    const schoolMap = schools.reduce((acc, s) => {
        acc[s.code] = s.name;
        return acc;
    }, {});

    const breakdown = {};
    activeData.forEach(entry => {
        const code = entry.school_code || 'GENERAL';
        if (!breakdown[code]) {
            breakdown[code] = { name: schoolMap[code] || 'Actividad General', estudiante: 0, docente: 0, total: 0 };
        }
        breakdown[code][entry.role] = (breakdown[code][entry.role] || 0) + entry.total_seconds;
        breakdown[code].total += entry.total_seconds;
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
                        </tr>
                    </thead>
                    <tbody class="text-sm">
                        ${rows.map(row => `
                            <tr class="border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td class="py-4 pr-4 font-bold text-slate-800 dark:text-white">${row.name}</td>
                                <td class="py-4 text-center text-slate-500 font-medium">${formatTime(row.estudiante)}</td>
                                <td class="py-4 text-center text-slate-500 font-medium">${formatTime(row.docente)}</td>
                                <td class="py-4 text-center font-black text-emerald-500">${formatTime(row.total)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                 </table>
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
        showToast('⚠️ No hay datos para exportar. Espera a que termine la carga.', 'warning');
        return;
    }

    try {
        // Preparar Datos CSV
        // Header
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Reporte Ejecutivo 1Bot\n";
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
        link.setAttribute("download", `reporte_ejecutivo_1bot_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('✅ Datos exportados exitosamente', 'success');

    } catch (err) {
        console.error('Error exportando:', err);
        showToast('❌ Error al exportar datos', 'error');
    }
};
