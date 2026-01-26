// ================================================
// DASHBOARD DE RESULTADOS ACADÉMICOS (VISTA ADMINISTRATIVA)
// ================================================

async function loadAdminEvalReport() {
    console.log('📈 Cargando reporte de resultados académicos...');
    const container = document.getElementById('admin-eval-report-container');
    if (!container) return;

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-20 text-slate-400">
            <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
            <span class="font-bold tracking-widest uppercase text-xs">Analizando métricas académicas...</span>
        </div>
    `;

    try {
        // Obtenemos los proyectos con su puntaje directo (score) y relación con estudiantes
        const [projectsRes, schoolsRes] = await Promise.all([
            _supabase.from('projects').select('id, title, score, students:user_id(school_code)'),
            _supabase.from('schools').select('code, name')
        ]);

        if (projectsRes.error) {
            console.warn('Error primary query, trying fallback join...');
            const backup = await _supabase.from('projects').select('id, title, score, students(school_code)');
            if (backup.error) throw backup.error;
            projectsRes.data = backup.data;
        }

        const projects = projectsRes.data || [];
        const schools = schoolsRes.data || [];

        console.log(`📋 Reporte Académico: Procesando ${projects.length} proyectos.`);

        // 2. Calcular estadísticas basadas en el 'score' de la tabla projects
        const stats = calculateEvalStats(projects, schools);

        // 3. Renderizar Dashboard
        renderEvalDashboard(container, stats);

    } catch (err) {
        console.error('Error cargando reporte académico:', err);
        container.innerHTML = `
            <div class="glass-card p-10 text-rose-500 font-bold text-center border-l-4 border-rose-500 bg-rose-50/50 dark:bg-rose-900/10">
                <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
                <h3 class="text-lg font-bold uppercase tracking-tight">Error de Sincronización</h3>
                <p class="text-sm opacity-80">${err.message}</p>
            </div>
        `;
    }
}

function calculateEvalStats(projects, schools) {
    const totalProjects = projects.length;

    // Un proyecto está calificado si tiene un score > 0
    const projectsWithScore = projects.filter(p => (p.score || 0) > 0);
    const evaluatedProjects = projectsWithScore.length;
    const pendingProjects = totalProjects - evaluatedProjects;

    // Promedio general basado en los proyectos que ya tienen punteo
    const averageScore = evaluatedProjects > 0
        ? (projectsWithScore.reduce((acc, curr) => acc + (curr.score || 0), 0) / evaluatedProjects).toFixed(1)
        : 0;

    // Agrupar por Establecimiento
    const schoolStats = schools.map(school => {
        const getProjSchoolCode = (p) => {
            if (!p.students) return null;
            const s = Array.isArray(p.students) ? p.students[0] : p.students;
            return s?.school_code;
        };

        const schoolProjects = projects.filter(p => String(getProjSchoolCode(p)) === String(school.code));
        const schoolWithScore = schoolProjects.filter(p => (p.score || 0) > 0);

        const avg = schoolWithScore.length > 0
            ? (schoolWithScore.reduce((acc, curr) => acc + (curr.score || 0), 0) / schoolWithScore.length).toFixed(1)
            : 0;

        return {
            name: school.name,
            total: schoolProjects.length,
            evaluated: schoolWithScore.length,
            average: parseFloat(avg)
        };
    }).sort((a, b) => b.average - a.average);

    return {
        totalProjects,
        evaluatedProjects,
        pendingProjects,
        averageScore,
        schoolStats
    };
}

function renderEvalDashboard(container, stats) {
    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 animate-slideUp">
             <div>
                <h1 class="text-3xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-2">📈 Resultados Académicos</h1>
                <p class="text-slate-500 dark:text-slate-400 font-medium">Análisis de calidad de proyectos y rendimiento por establecimiento.</p>
             </div>
             <button class="btn-secondary-tw px-5 h-10 text-xs uppercase font-bold tracking-widest" onclick="loadAdminEvalReport()">
                <i class="fas fa-sync-alt animate-spin-slow"></i> ACTUALIZAR
             </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
            <div class="glass-card p-6 bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-indigo-500/20 group hover:-translate-y-1 transition-transform">
                <div class="flex justify-between items-start mb-4">
                     <span class="text-[0.65rem] font-bold uppercase tracking-widest opacity-80">Promedio General</span>
                     <i class="fas fa-star text-2xl opacity-40 group-hover:scale-110 transition-transform"></i>
                </div>
                <div class="text-4xl font-black mb-1">${stats.averageScore}</div>
                <div class="h-1.5 w-full bg-black/20 rounded-full mt-2 overflow-hidden">
                    <div class="h-full bg-white/90" style="width: ${stats.averageScore}%"></div>
                </div>
            </div>
            
            <div class="glass-card p-6 border-l-4 border-emerald-500 group hover:-translate-y-1 transition-transform">
                <div class="flex justify-between items-start mb-4">
                     <span class="text-[0.65rem] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Calificados</span>
                     <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 flex items-center justify-center text-lg group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                        <i class="fas fa-check-double"></i>
                     </div>
                </div>
                <div class="text-3xl font-black text-slate-800 dark:text-white mb-1">${stats.evaluatedProjects}</div>
                <p class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wide">Proyectos Completados</p>
            </div>

            <div class="glass-card p-6 border-l-4 border-amber-500 group hover:-translate-y-1 transition-transform">
                <div class="flex justify-between items-start mb-4">
                     <span class="text-[0.65rem] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Pendientes</span>
                     <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-500 flex items-center justify-center text-lg group-hover:bg-amber-500 group-hover:text-white transition-colors">
                        <i class="fas fa-hourglass-half"></i>
                     </div>
                </div>
                <div class="text-3xl font-black text-slate-800 dark:text-white mb-1">${stats.pendingProjects}</div>
                <p class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wide">Requieren Evaluación</p>
            </div>

            <div class="glass-card p-6 border-l-4 border-blue-500 group hover:-translate-y-1 transition-transform">
                <div class="flex justify-between items-start mb-4">
                     <span class="text-[0.65rem] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Total Proyectos</span>
                     <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center text-lg group-hover:bg-blue-500 group-hover:text-white transition-colors">
                        <i class="fas fa-project-diagram"></i>
                     </div>
                </div>
                <div class="text-3xl font-black text-slate-800 dark:text-white mb-1">${stats.totalProjects}</div>
                <p class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wide">Universo Total</p>
            </div>
        </div>

        <div class="glass-card p-0 overflow-hidden shadow-xl">
            <div class="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <h3 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <i class="fas fa-school text-slate-400"></i> Rendimiento por Establecimiento
                </h3>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="text-[0.65rem] font-bold uppercase text-slate-400 tracking-widest bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                            <th class="px-6 py-4">Establecimiento</th>
                            <th class="px-6 py-4 text-center">Entrega</th>
                            <th class="px-6 py-4 w-1/3">Progreso Evaluación</th>
                            <th class="px-6 py-4 text-right">Promedio</th>
                            <th class="px-6 py-4 text-center">Nivel</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        ${stats.schoolStats.map(school => {
        const progress = school.total > 0 ? Math.round((school.evaluated / school.total) * 100) : 0;
        return `
                                <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td class="px-6 py-4">
                                        <div class="text-sm font-bold text-slate-800 dark:text-white">${school.name}</div>
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                       <div class="flex flex-col items-center justify-center">
                                            <span class="text-lg font-black text-slate-700 dark:text-white leading-none">${school.total}</span>
                                            <span class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Proy.</span>
                                       </div>
                                    </td>
                                    <td class="px-6 py-4">
                                        <div class="flex items-center gap-3">
                                            <div class="grow h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div class="h-full bg-primary rounded-full transition-all duration-1000" style="width:${progress}%"></div>
                                            </div>
                                            <span class="text-xs font-bold text-primary">${progress}%</span>
                                        </div>
                                    </td>
                                    <td class="px-6 py-4 text-right">
                                        <span class="text-lg font-black" style="color: ${getScoreColor(school.average)}">${school.average}</span>
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                        <span class="px-2 py-1 rounded-md text-[0.6rem] font-bold uppercase tracking-wider border" 
                                            style="background: ${getScoreColor(school.average)}15; color: ${getScoreColor(school.average)}; border-color: ${getScoreColor(school.average)}30;">
                                            ${getScoreLabel(school.average)}
                                        </span>
                                    </td>
                                </tr>
                            `;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function getScoreColor(score) {
    if (score >= 85) return '#10b981';
    if (score >= 70) return '#f59e0b';
    return '#ef4444';
}

function getScoreStatus(score) {
    if (score >= 85) return 'status-active';
    if (score >= 70) return 'status-pending';
    return 'status-inactive';
}

function getScoreLabel(score) {
    if (score >= 90) return 'Sobresaliente';
    if (score >= 75) return 'Satisfactorio';
    if (score > 0) return 'Necesita Mejora';
    return 'Sin datos';
}
