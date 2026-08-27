// ================================================
// GESTIÓN DE RENDIMIENTO DOCENTE (ADMIN)
// ================================================

async function loadAdminTeacherPerformance(opts = {}) {
    const {
        containerId = 'admin-teacher-performance-container',
        teacherIds = null,
        cacheKey = 'admin_performance_dashboard',
        title = 'Desempeño General de Docentes',
        subtitle = 'Métricas agregadas de todos los docentes activos',
        backView = 'teachers',
    } = opts;
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!container.innerHTML || container.innerHTML.includes('fa-spinner')) {
        container.innerHTML = `
            <div style="text-align:center; padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i>
                <p style="margin-top: 10px;">Analizando desempeño de docentes...</p>
            </div>
        `;
    }

    try {
        await fetchWithCache(cacheKey, async () => {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const [teachersRes, ratingsRes, evalsRes, activeTimeRes] = await Promise.all([
                _supabase.from('teachers').select('*'),
                _supabase.from('teacher_ratings').select('rating, teacher_id, message, created_at, students:student_id(full_name)'),
                _supabase.from('evaluations').select('id, teacher_id'),
                _supabase.from('active_time_tracking').select('user_id, total_seconds').eq('role', 'docente').gte('activity_date', thirtyDaysAgo),
            ]);

            // Cuentas de prueba interna -- no deben contaminar el reporte real.
            // (ratings/evaluations también hay que filtrarlos por separado --
            // el desglose por docente ya excluía la cuenta de prueba porque
            // itera sobre `teachers` ya filtrado, pero los totales agregados
            // de abajo usan estos arrays crudos directamente.)
            const testTeacherIds = new Set((teachersRes.data || []).filter(t => window.isTestTeacherEmail?.(t.email)).map(t => t.id));
            let teachers = (teachersRes.data || []).filter(t => !testTeacherIds.has(t.id));
            if (teacherIds) teachers = teachers.filter(t => teacherIds.includes(t.id));
            const ratings = (ratingsRes.data || []).filter(r => !testTeacherIds.has(r.teacher_id));
            const evaluations = (evalsRes.data || []).filter(e => !testTeacherIds.has(e.teacher_id));
            const activeTime = (activeTimeRes.data || []).filter(a => !testTeacherIds.has(a.user_id));

            const secondsByTeacher = new Map();
            activeTime.forEach(r => secondsByTeacher.set(r.user_id, (secondsByTeacher.get(r.user_id) || 0) + (r.total_seconds || 0)));

            // Calculate individual teacher performance
            const performanceData = teachers.map(t => {
                const tr = ratings.filter(r => r.teacher_id === t.id);
                const te = evaluations.filter(e => e.teacher_id === t.id);
                const avg = tr.length > 0 ? (tr.reduce((s, r) => s + r.rating, 0) / tr.length).toFixed(1) : 0;
                const lastLoginDate = t.last_login ? new Date(t.last_login.includes('T') ? t.last_login : t.last_login + 'T00:00:00') : null;
                const daysSinceLogin = lastLoginDate && !isNaN(lastLoginDate.getTime()) ? Math.floor((Date.now() - lastLoginDate.getTime()) / 86400000) : null;

                return {
                    ...t,
                    avgRating: parseFloat(avg),
                    totalRatings: tr.length,
                    totalEvals: te.length,
                    lastRatings: tr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3),
                    isActive: tr.length > 0 || te.length > 0,
                    activeSeconds30d: secondsByTeacher.get(t.id) || 0,
                    daysSinceLogin,
                };
            }).sort((a, b) => b.avgRating - a.avgRating);

            // Calculate aggregated KPIs
            const activeTeachers = performanceData.filter(t => t.isActive);
            const aggregatedKPIs = {
                totalActiveTeachers: activeTeachers.length,
                totalInactiveTeachers: teachers.length - activeTeachers.length,
                overallAvgRating: activeTeachers.length > 0
                    ? (activeTeachers.reduce((sum, t) => sum + t.avgRating, 0) / activeTeachers.length).toFixed(1)
                    : 0,
                totalRatings: ratings.length,
                totalEvaluations: evaluations.length,
                avgRatingsPerTeacher: activeTeachers.length > 0 ? Math.round(ratings.length / activeTeachers.length) : 0,
                avgEvalsPerTeacher: activeTeachers.length > 0 ? Math.round(evaluations.length / activeTeachers.length) : 0,
                excellentTeachers: activeTeachers.filter(t => t.avgRating >= 4.5).length,
                competentTeachers: activeTeachers.filter(t => t.avgRating >= 3.5 && t.avgRating < 4.5).length,
                needsAttention: activeTeachers.filter(t => t.avgRating < 3.5 && t.avgRating > 0).length
            };

            return { performanceData, aggregatedKPIs };
        }, (data) => {
            renderTeacherPerformanceHTML(container, data.performanceData, data.aggregatedKPIs, { title, subtitle, backView });
        });

    } catch (err) {
        console.error('Error performance:', err);
        container.innerHTML = `<div class="error-state"><i class="fas fa-circle-xmark"></i> Error cargando desempeño: ${err.message}</div>`;
    }
}

function renderTeacherPerformanceHTML(container, data, kpis, opts = {}) {
    const { title = 'Desempeño General de Docentes', subtitle = 'Métricas agregadas de todos los docentes activos', backView = 'teachers' } = opts;
    const sanitizeInput = window.sanitizeInput || ((v) => v);
    container.innerHTML = `
        ${backView ? `
        <button onclick="window.nav('${backView}')" class="text-slate-400 hover:text-primary font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2 transition-colors">
            <i class="fas fa-arrow-left"></i> Volver
        </button>
        ` : ''}

        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
                <h1 class="text-2xl md:text-3xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-2"><i class="fas fa-chart-bar text-primary"></i> ${sanitizeInput(title)}</h1>
                <p class="text-slate-500 dark:text-slate-400 font-medium text-sm">${sanitizeInput(subtitle)}</p>
            </div>
            <button onclick="typeof window.loadCoordinatorDashboard === 'function' && window.userRole === 'coordinador' ? window.loadCoordinatorDashboard() : window.loadAdminTeacherPerformance()" class="btn-secondary-tw h-10 px-5 text-xs uppercase font-bold tracking-widest shrink-0">
                <i class="fas fa-sync-alt"></i> Actualizar
            </button>
        </div>

        <!-- KPIs -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
            <div class="glass-card p-6 border-l-4 border-amber-500 group hover:-translate-y-1 transition-transform">
                <div class="flex justify-between items-start mb-4">
                    <span class="text-[0.65rem] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Calificación Promedio</span>
                    <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-500 flex items-center justify-center text-lg group-hover:bg-amber-500 group-hover:text-white transition-colors"><i class="fas fa-star"></i></div>
                </div>
                <div class="text-3xl font-black text-slate-800 dark:text-white mb-1">${kpis.overallAvgRating}</div>
                <p class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wide">De ${kpis.totalActiveTeachers} docentes activos</p>
            </div>

            <div class="glass-card p-6 border-l-4 border-blue-500 group hover:-translate-y-1 transition-transform">
                <div class="flex justify-between items-start mb-4">
                    <span class="text-[0.65rem] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Total Evaluaciones</span>
                    <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center text-lg group-hover:bg-blue-500 group-hover:text-white transition-colors"><i class="fas fa-pen-to-square"></i></div>
                </div>
                <div class="text-3xl font-black text-slate-800 dark:text-white mb-1">${kpis.totalRatings}</div>
                <p class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wide">${kpis.avgRatingsPerTeacher} por docente</p>
            </div>

            <div class="glass-card p-6 border-l-4 border-emerald-500 group hover:-translate-y-1 transition-transform">
                <div class="flex justify-between items-start mb-4">
                    <span class="text-[0.65rem] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Proyectos Calificados</span>
                    <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 flex items-center justify-center text-lg group-hover:bg-emerald-500 group-hover:text-white transition-colors"><i class="fas fa-project-diagram"></i></div>
                </div>
                <div class="text-3xl font-black text-slate-800 dark:text-white mb-1">${kpis.totalEvaluations}</div>
                <p class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wide">${kpis.avgEvalsPerTeacher} por docente</p>
            </div>

            <div class="glass-card p-6 border-l-4 border-primary">
                <span class="text-[0.65rem] font-bold uppercase tracking-widest text-primary block mb-3">Distribución de Desempeño</span>
                <div class="space-y-2">
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide">Sobresaliente</span>
                        <strong class="text-emerald-500 text-base">${kpis.excellentTeachers}</strong>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide">Competente</span>
                        <strong class="text-blue-500 text-base">${kpis.competentTeachers}</strong>
                    </div>
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide">Necesita Atención</span>
                        <strong class="text-rose-500 text-base">${kpis.needsAttention}</strong>
                    </div>
                </div>
            </div>
        </div>

        <!-- Antes esto eran DOS secciones separadas ("Desglose Individual" y
        "Docentes Más Activos") mostrando exactamente a los mismos docentes
        con datos distintos -- unificado en una sola fila colapsable por
        docente (menos ruido visual, el detalle se ve solo si hace falta). -->
        <h3 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2 mb-1"><i class="fas fa-chart-line text-primary"></i> Desglose Individual por Docente</h3>
        <p class="text-slate-500 dark:text-slate-400 text-xs mb-5">Evaluaciones, satisfacción y actividad real -- ordenado por más activo. Tocá una fila para ver el detalle.</p>

        <div class="space-y-3 mb-10">
            ${(() => {
                const sorted = [...data].sort((a, b) => b.activeSeconds30d - a.activeSeconds30d);
                return sorted.map(t => {
                    const perfColor = getPerfColor(t.avgRating);
                    const perfLabel = t.avgRating >= 4.5 ? 'Sobresaliente' : (t.avgRating >= 3.5 ? 'Competente' : (t.avgRating > 0 ? 'Bajo Desempeño' : 'Sin Datos'));
                    const perfIcon = t.avgRating >= 4.5 ? 'fa-star' : (t.avgRating >= 3.5 ? 'fa-circle-check' : (t.avgRating > 0 ? 'fa-triangle-exclamation' : 'fa-circle-xmark'));
                    const hours = Math.floor(t.activeSeconds30d / 3600);
                    const minutes = Math.floor((t.activeSeconds30d % 3600) / 60);
                    const connLabel = t.daysSinceLogin === null ? 'Nunca conectó' : t.daysSinceLogin === 0 ? 'Hoy' : `Hace ${t.daysSinceLogin} día(s)`;
                    const connClasses = t.daysSinceLogin === null ? 'bg-slate-100 dark:bg-slate-800 text-slate-500' : t.daysSinceLogin <= 3 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400';
                    return `
                    <details class="group/row glass-card overflow-hidden ${!t.isActive ? 'opacity-60' : ''}">
                        <summary class="list-none cursor-pointer p-4 flex items-center gap-4 flex-wrap hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                            <i class="fas fa-chevron-right text-slate-300 dark:text-slate-600 text-xs transition-transform group-open/row:rotate-90 shrink-0"></i>
                            <div class="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                ${t.profile_photo_url ? `<img src="${t.profile_photo_url}" class="w-full h-full object-cover">` : '<i class="fas fa-user-tie text-slate-400"></i>'}
                            </div>
                            <div class="flex-1 min-w-[160px]">
                                <div class="font-bold text-sm text-slate-800 dark:text-white">${sanitizeInput(t.full_name)}</div>
                                <div class="text-xs text-slate-400">${sanitizeInput(t.email)}</div>
                            </div>
                            <div class="flex items-center gap-1.5 shrink-0">
                                <span class="text-lg font-black" style="color:${perfColor}">${t.avgRating}</span>
                                <div class="text-amber-400 text-xs">${'<i class="fas fa-star"></i>'.repeat(Math.round(t.avgRating))}${'<i class="fas fa-star opacity-20"></i>'.repeat(5 - Math.round(t.avgRating))}</div>
                            </div>
                            <span class="px-2.5 py-1 rounded-lg text-[0.6rem] font-bold uppercase tracking-widest shrink-0" style="background:${perfColor}18; color:${perfColor};">
                                <i class="fas ${perfIcon}"></i> ${perfLabel}
                            </span>
                            <span class="px-2.5 py-1 rounded-lg text-[0.6rem] font-bold uppercase tracking-widest shrink-0 ${connClasses}">${connLabel}</span>
                        </summary>
                        <div class="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800 flex gap-8 flex-wrap">
                            <div>
                                <div class="text-lg font-black text-slate-800 dark:text-white leading-none">${t.totalRatings}</div>
                                <div class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-wide mt-1">Evaluaciones Recibidas</div>
                            </div>
                            <div>
                                <div class="text-lg font-black text-slate-800 dark:text-white leading-none">${t.totalEvals}</div>
                                <div class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-wide mt-1">Proyectos Evaluados</div>
                            </div>
                            <div>
                                <div class="text-lg font-black text-slate-800 dark:text-white leading-none">${hours}h ${minutes}m</div>
                                <div class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-wide mt-1">Tiempo en Plataforma (30d)</div>
                            </div>
                        </div>
                    </details>
                    `;
                }).join('');
            })()}
        </div>

        <h3 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2 mb-5"><i class="fas fa-comments text-primary"></i> Comentarios de Estudiantes Destacados</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            ${data.flatMap(t => t.lastRatings.filter(r => r.message).map(r => `
                <div class="glass-card p-4 border-l-4" style="border-color:${getPerfColor(r.rating)};">
                    <div class="flex justify-between items-center mb-2">
                        <strong class="text-sm text-slate-800 dark:text-white">${sanitizeInput(r.students?.full_name || 'Estudiante')}</strong>
                        <span class="text-amber-400 text-xs">${'<i class="fas fa-star"></i>'.repeat(r.rating)}</span>
                    </div>
                    <p class="text-sm italic text-slate-600 dark:text-slate-300">"${sanitizeInput(r.message)}"</p>
                    <p class="text-right text-[0.6rem] font-bold uppercase text-slate-400 tracking-wide mt-3">Para: ${sanitizeInput(t.full_name)}</p>
                </div>
            `)).slice(0, 6).join('')}
        </div>
    `;
}

function getPerfColor(score) {
    if (score >= 4.5) return '#10b981';
    if (score >= 3.5) return '#3b82f6';
    if (score >= 2.5) return '#f59e0b';
    return '#ef4444';
}

// Este archivo se carga vía import() dinámico (ver main.js loadModule) --
// sin exportar a window, main.js nunca podía llamar a esta función y el
// botón "Actualizar" (onclick inline, que corre en scope global) tampoco
// la encontraba. Por eso la pantalla se quedaba en blanco al entrar.
window.loadAdminTeacherPerformance = loadAdminTeacherPerformance;
