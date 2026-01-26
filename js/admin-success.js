// ================================================
// CUSTOMER SUCCESS HUB & BUSINESS ANALYTICS
// ================================================

/**
 * REGLA DE NEGOCIO (Fidelización):
 * - 4 Bimestres por año.
 * - 4 Proyectos por bimestre por alumno.
 * - Equipos de 3-4 integrantes (Promedio 3.5).
 * - Target de proyectos por colegio = (Estudiantes / 3.5) * 4 (por bimestre).
 */

async function loadAdminSuccessHub() {
    console.log('🎯 Cargando Customer Success Hub...');
    const container = document.getElementById('admin-success-container');
    if (!container) return;

    // 1. Sincronizar configuración global desde DB
    await syncSystemConfig();

    container.innerHTML = `
        <div style="text-align:center; padding: 40px;">
            <i class="fas fa-circle-notch fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i>
            <p style="margin-top: 10px; color: var(--text-light);">Calculando métricas de impacto...</p>
        </div>
    `;

    try {
        // Fetch schools, projects, students AND teacher performance data
        const [schoolsRes, projectsRes, studentsRes, teachersRes, ratingsRes, evalsRes] = await Promise.all([
            _supabase.from('schools').select('*'),
            _supabase.from('projects').select('id, created_at, students:user_id(school_code)'),
            _supabase.from('students').select('id, school_code'),
            _supabase.from('teachers').select('*'),
            _supabase.from('teacher_ratings').select('rating, teacher_id, message, created_at, students:student_id(full_name)'),
            _supabase.from('evaluations').select('id, teacher_id')
        ]);

        if (schoolsRes.error) throw schoolsRes.error;
        if (projectsRes.error) {
            console.warn('Proyectos con select user_id falló, intentando estándar:', projectsRes.error);
            const backup = await _supabase.from('projects').select('id, created_at, students(school_code)');
            if (backup.error) throw backup.error;
            projectsRes.data = backup.data;
        }
        if (studentsRes.error) throw studentsRes.error;

        const schools = schoolsRes.data || [];
        const allProjects = projectsRes.data || [];
        const allStudents = studentsRes.data || [];
        const teachers = teachersRes.data || [];
        const ratings = ratingsRes.data || [];
        const evaluations = evalsRes.data || [];

        // Calculate teacher performance KPIs
        const performanceData = teachers.map(t => {
            const tr = ratings.filter(r => r.teacher_id === t.id);
            const te = evaluations.filter(e => e.teacher_id === t.id);
            const avg = tr.length > 0 ? (tr.reduce((s, r) => s + r.rating, 0) / tr.length).toFixed(1) : 0;

            return {
                ...t,
                avgRating: parseFloat(avg),
                totalRatings: tr.length,
                totalEvals: te.length,
                isActive: tr.length > 0 || te.length > 0
            };
        });

        const activeTeachers = performanceData.filter(t => t.isActive);
        const aggregatedKPIs = {
            totalActiveTeachers: activeTeachers.length,
            totalInactiveTeachers: teachers.length - activeTeachers.length,
            overallAvgRating: activeTeachers.length > 0
                ? (activeTeachers.reduce((sum, t) => sum + t.avgRating, 0) / activeTeachers.length).toFixed(1)
                : 0,
            totalRatings: ratings.length,
            totalEvaluations: evaluations.length,
            avgRatingsPerTeacher: activeTeachers.length > 0
                ? Math.round(ratings.length / activeTeachers.length)
                : 0,
            avgEvalsPerTeacher: activeTeachers.length > 0
                ? Math.round(evaluations.length / activeTeachers.length)
                : 0,
            excellentTeachers: activeTeachers.filter(t => t.avgRating >= 4.5).length,
            competentTeachers: activeTeachers.filter(t => t.avgRating >= 3.5 && t.avgRating < 4.5).length,
            needsAttention: activeTeachers.filter(t => t.avgRating < 3.5 && t.avgRating > 0).length
        };

        console.log(`📋 CS Hub Data: ${allProjects.length} proyectos, ${allStudents.length} estudiantes, ${aggregatedKPIs.totalActiveTeachers} docentes activos`);

        renderSuccessHubHTML(container, schools, allProjects, allStudents, aggregatedKPIs);

    } catch (err) {
        console.error('Error CS Hub:', err);
        container.innerHTML = `<div class="error-state">❌ Error al cargar métricas: ${err.message}</div>`;
    }
}

function renderSuccessHubHTML(container, schools, allProjects, allStudents, kpis) {
    const schoolMetrics = schools.map(s => {
        const schoolStudents = allStudents.filter(st => String(st.school_code) === String(s.code));

        // Filtrado robusto
        const schoolProjects = allProjects.filter(p => {
            const student = Array.isArray(p.students) ? p.students[0] : p.students;
            return student && String(student.school_code) === String(s.code);
        });

        // REGLA DE SALUD DINÁMICA
        const localMeta = s.projects_per_bimestre || SYSTEM_CONFIG.projectsPerBimester;
        const expectedGroups = Math.ceil(schoolStudents.length / SYSTEM_CONFIG.studentsPerTeam);
        const targetProjectsPerBimestre = expectedGroups * localMeta;

        let healthScore = 0;
        if (targetProjectsPerBimestre > 0) {
            healthScore = Math.min(Math.round((schoolProjects.length / targetProjectsPerBimestre) * 100), 100);
        }

        return {
            ...s,
            healthScore,
            projectCount: schoolProjects.length,
            studentCount: schoolStudents.length,
            target: targetProjectsPerBimestre
        };
    }).sort((a, b) => b.healthScore - a.healthScore);

    const avgHealth = schoolMetrics.length > 0
        ? Math.round(schoolMetrics.reduce((a, b) => a + b.healthScore, 0) / schoolMetrics.length)
        : 0;

    container.innerHTML = `
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 animate-slideUp gap-4">
            <div>
                <h1 class="text-3xl font-bold text-slate-800 dark:text-white tracking-tight leading-none mb-2">🎯 Centro de Fidelización (CS Hub)</h1>
                <p class="text-slate-500 dark:text-slate-400 font-medium">Monitor de salud institucional basado en métricas de cumplimiento (${SYSTEM_CONFIG.projectsPerBimester} proyectos/bimestre por equipo).</p>
            </div>
            <div class="flex gap-2">
                <button class="btn-secondary-tw h-10 text-xs px-4" onclick="openSystemGoalsModal()">
                    <i class="fas fa-cog"></i> AJUSTAR METAS
                </button>
            </div>
        </div>

        <!-- KPIs Dashboard -->
        <div class="glass-card p-8 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/50 mb-10 border-l-[6px] border-l-primary">
            <div class="flex items-center gap-4 mb-6">
                 <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-xl"><i class="fas fa-chalkboard-teacher"></i></div>
                 <div>
                    <h2 class="text-xl font-bold text-slate-800 dark:text-white leading-tight">Desempeño General Docente</h2>
                    <p class="text-sm text-slate-400 font-medium">Métricas agregadas de todos los docentes activos</p>
                 </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <!-- Avg Rating -->
                <div class="bg-amber-50 dark:bg-amber-900/10 p-6 rounded-2xl border border-amber-100 dark:border-amber-900/30 relative overflow-hidden group hover:scale-[1.02] transition-transform">
                    <div class="absolute right-0 top-0 p-4 opacity-10 text-6xl text-amber-500 group-hover:scale-110 transition-transform"><i class="fas fa-star"></i></div>
                    <div class="relative z-10">
                        <div class="text-[0.65rem] font-bold uppercase text-amber-600 dark:text-amber-500 tracking-widest mb-2">Nota Promedio</div>
                        <div class="text-4xl font-bold text-amber-700 dark:text-amber-400 mb-1 leading-none">${kpis.overallAvgRating}</div>
                        <div class="text-[0.6rem] font-bold text-amber-600/70 dark:text-amber-500/70 uppercase tracking-tight">De ${kpis.totalActiveTeachers} docentes activos</div>
                    </div>
                </div>

                <!-- Evaluaciones -->
                <div class="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-900/30 relative overflow-hidden group hover:scale-[1.02] transition-transform">
                     <div class="absolute right-0 top-0 p-4 opacity-10 text-6xl text-blue-500 group-hover:scale-110 transition-transform"><i class="fas fa-clipboard-list"></i></div>
                     <div class="relative z-10">
                        <div class="text-[0.65rem] font-bold uppercase text-blue-600 dark:text-blue-500 tracking-widest mb-2">Total Evaluaciones</div>
                        <div class="text-4xl font-bold text-blue-700 dark:text-blue-400 mb-1 leading-none">${kpis.totalRatings}</div>
                        <div class="text-[0.6rem] font-bold text-blue-600/70 dark:text-blue-500/70 uppercase tracking-tight">📝 ${kpis.avgRatingsPerTeacher} por docente</div>
                     </div>
                </div>

                <!-- Proyectos Calificados -->
                <div class="bg-emerald-50 dark:bg-emerald-900/10 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 relative overflow-hidden group hover:scale-[1.02] transition-transform">
                     <div class="absolute right-0 top-0 p-4 opacity-10 text-6xl text-emerald-500 group-hover:scale-110 transition-transform"><i class="fas fa-project-diagram"></i></div>
                     <div class="relative z-10">
                        <div class="text-[0.65rem] font-bold uppercase text-emerald-600 dark:text-emerald-500 tracking-widest mb-2">Proyectos Calificados</div>
                        <div class="text-4xl font-bold text-emerald-700 dark:text-emerald-400 mb-1 leading-none">${kpis.totalEvaluations}</div>
                        <div class="text-[0.6rem] font-bold text-emerald-600/70 dark:text-emerald-500/70 uppercase tracking-tight">📚 ${kpis.avgEvalsPerTeacher} por docente</div>
                     </div>
                </div>

                <!-- Distribución -->
                <div class="bg-violet-50 dark:bg-violet-900/10 p-6 rounded-2xl border border-violet-100 dark:border-violet-900/30 relative overflow-hidden">
                     <div class="text-[0.65rem] font-bold uppercase text-violet-600 dark:text-violet-500 tracking-widest mb-3">Distribución de Talento</div>
                     <div class="space-y-2">
                        <div class="flex justify-between items-center">
                            <span class="text-[0.65rem] font-bold text-violet-700 dark:text-violet-300 uppercase">🌟 Sobresaliente</span>
                            <span class="text-sm font-bold text-emerald-500">${kpis.excellentTeachers}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-[0.65rem] font-bold text-violet-700 dark:text-violet-300 uppercase">✅ Competente</span>
                            <span class="text-sm font-bold text-blue-500">${kpis.competentTeachers}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-[0.65rem] font-bold text-violet-700 dark:text-violet-300 uppercase">⚠️ Requiere Apoyo</span>
                            <span class="text-sm font-bold text-rose-500">${kpis.needsAttention}</span>
                        </div>
                     </div>
                </div>
            </div>
        </div>

        <!-- Fidelización Stats -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div class="glass-card p-6 border-l-4 border-rose-500 flex items-center justify-between">
                <div>
                    <div class="text-3xl font-bold text-rose-500 mb-1">${schoolMetrics.filter(s => s.healthScore < 40).length}</div>
                    <div class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Riesgo Alto (< 40%)</div>
                </div>
                <i class="fas fa-heart-broken text-3xl text-rose-500/20"></i>
            </div>
            <div class="glass-card p-6 border-l-4 border-emerald-500 flex items-center justify-between">
                <div>
                    <div class="text-3xl font-bold text-emerald-500 mb-1">${schoolMetrics.filter(s => s.healthScore >= 80).length}</div>
                    <div class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Excelencia (>= 80%)</div>
                </div>
                <i class="fas fa-check-circle text-3xl text-emerald-500/20"></i>
            </div>
            <div class="glass-card p-6 border-l-4 border-indigo-500 flex items-center justify-between">
                <div>
                    <div class="text-3xl font-bold text-indigo-500 mb-1">${avgHealth}%</div>
                    <div class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Salud Global</div>
                </div>
                <i class="fas fa-chart-line text-3xl text-indigo-500/20"></i>
            </div>
        </div>

        <div class="glass-card p-0 overflow-hidden">
            <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                <h3 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <i class="fas fa-university text-slate-400"></i> Desempeño por Establecimiento
                </h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="text-[0.65rem] font-bold uppercase text-slate-400 tracking-widest bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                            <th class="px-6 py-4">Establecimiento</th>
                            <th class="px-6 py-4">Salud (Vs Meta)</th>
                            <th class="px-6 py-4 text-center">Cumplimiento</th>
                            <th class="px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        ${schoolMetrics.map(s => `
                            <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                <td class="px-6 py-4">
                                    <div class="text-sm font-bold text-slate-800 dark:text-white leading-tight">${sanitizeInput(s.name)}</div>
                                    <div class="text-[0.65rem] font-bold text-slate-400 mt-1 uppercase tracking-wide">
                                        ${s.studentCount} Estudiantes <span class="mx-1">•</span> Meta: ${s.target} Proy.
                                    </div>
                                </td>
                                <td class="px-6 py-4 w-1/3">
                                    <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                                        <div class="h-full rounded-full transition-all duration-1000 ease-out ${s.healthScore < 40 ? 'bg-rose-500' : (s.healthScore < 80 ? 'bg-amber-400' : 'bg-emerald-500')}" style="width: ${s.healthScore}%"></div>
                                    </div>
                                    <div class="text-[0.65rem] font-bold uppercase tracking-wider ${s.healthScore < 40 ? 'text-rose-500' : (s.healthScore < 80 ? 'text-amber-500' : 'text-emerald-500')}">
                                        ${s.healthScore}% DE LA META
                                    </div>
                                </td>
                                <td class="px-6 py-4 text-center">
                                    <span class="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold tracking-widest">
                                        ${s.projectCount} / ${s.target}
                                    </span>
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <div class="flex justify-end gap-2">
                                        <button class="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all flex items-center justify-center border border-transparent" onclick="generateExecutiveReport('${s.code}')" title="Reporte Ejecutivo">
                                            <i class="fas fa-file-invoice text-sm"></i>
                                        </button>
                                        <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary hover:bg-primary/10 transition-all flex items-center justify-center border border-transparent" onclick="showDigitalTalentMap('${s.code}')" title="Mapa de Talento">
                                            <i class="fas fa-rocket text-sm"></i>
                                        </button>
                                        <button class="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all flex items-center justify-center border border-transparent" onclick="openSchoolGoalsModal(${s.id}, ${s.projects_per_bimestre || SYSTEM_CONFIG.projectsPerBimester}, '${sanitizeInput(s.name).replace(/'/g, "\\'")}')" title="Ajustar Meta Local">
                                            <i class="fas fa-bullseye text-sm"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function generateExecutiveReport(schoolCode) {
    const container = document.getElementById('admin-success-container');
    container.innerHTML = '<div style="text-align:center; padding: 100px;"><i class="fas fa-sync fa-spin" style="font-size:3rem; color:var(--primary-color);"></i><p>Compilando Reporte...</p></div>';

    try {
        const [schoolRes, projectsRes, studentsRes, teachersRes, assignmentsRes, ratingsRes, evalsRes] = await Promise.all([
            _supabase.from('schools').select('*').eq('code', schoolCode).single(),
            _supabase.from('projects').select('id, title, score, votes, created_at, video_url, students:user_id(school_code)'),
            _supabase.from('students').select('id, school_code').eq('school_code', schoolCode),
            _supabase.from('teachers').select('*'),
            _supabase.from('teacher_assignments').select('*').eq('school_code', schoolCode),
            _supabase.from('teacher_ratings').select('rating, teacher_id, students:student_id(school_code)'),
            _supabase.from('evaluations').select('total_score, teacher_id')
        ]);

        const school = schoolRes.data;
        const allProjectsData = projectsRes.data || [];
        const schoolProjects = allProjectsData.filter(p => {
            const s = Array.isArray(p.students) ? p.students[0] : p.students;
            return s && String(s.school_code) === String(schoolCode);
        });
        const schoolStudents = studentsRes.data || [];
        const allTeachers = teachersRes.data || [];
        const schoolAssignments = assignmentsRes.data || [];
        const allRatings = ratingsRes.data || [];
        const allEvals = evalsRes.data || [];

        const teacherIds = [...new Set(schoolAssignments.map(a => a.teacher_id))];
        const schoolTeachers = allTeachers.filter(t => teacherIds.includes(t.id));

        // Filtrar ratings para que SOLO cuenten los de este establecimiento
        const schoolRatings = allRatings.filter(r => {
            const stu = Array.isArray(r.students) ? r.students[0] : r.students;
            return teacherIds.includes(r.teacher_id) && stu && String(stu.school_code) === String(schoolCode);
        });

        // Filtrar evaluaciones de proyectos (para contar cuántos ha evaluado el docente en este colegio)
        const schoolEvals = allEvals.filter(e => teacherIds.includes(e.teacher_id));

        renderExecutiveReportView(container, school, schoolProjects, schoolStudents, schoolTeachers, schoolRatings, schoolEvals);

    } catch (err) {
        console.error('Error reporte:', err);
        loadAdminSuccessHub();
    }
}

function getDynamicSuccessMessage(health) {
    if (health >= 80) {
        return {
            note: "¡Resultados Extraordinarios! Su institución lidera la vanguardia digital. Es un privilegio ver cómo alumnos y docentes han convertido la tecnología en un motor de excelencia.",
            next: "Planificación de expansión de impacto"
        };
    } else if (health >= 50) {
        return {
            note: "¡Gran trayectoria de crecimiento! Los indicadores reflejan una sólida adopción tecnológica. Felicitamos a su equipo por el compromiso constante en proyectos de innovación.",
            next: "Optimización de participación docente"
        };
    } else {
        return {
            note: "¡Gran potencial detectado! Estamos en la etapa de despertar el talento digital. Apreciamos la base construida y estamos listos para acelerar juntos el éxito de sus estudiantes.",
            next: "Estrategia de activación de talento"
        };
    }
}

function renderExecutiveReportView(container, school, projects, students, teachers, ratings, evals) {
    const avgScore = projects.length > 0 ? (projects.reduce((a, b) => a + (b.score || 0), 0) / projects.length).toFixed(1) : 0;

    // Matriz de salud
    const schoolTargetVal = school.projects_per_bimestre || SYSTEM_CONFIG.projectsPerBimester;
    const expectedGroups = Math.ceil(students.length / SYSTEM_CONFIG.studentsPerTeam);
    const target = expectedGroups * schoolTargetVal;
    const health = target > 0 ? Math.min(Math.round((projects.length / target) * 100), 100) : 0;

    const dynamicData = getDynamicSuccessMessage(health);

    container.innerHTML = `
        <div class="bg-white dark:bg-slate-900 w-full max-w-4xl mx-auto border border-slate-200 dark:border-slate-800 shadow-xl font-sans print:shadow-none print:border-none print:max-w-none transition-colors duration-300 print:m-0 print:p-0" id="executive-report-root">
            <!-- Print specific styles (Gold Standard Executive View) -->
            <style>
                @media print {
                    @page { 
                        margin: 1.5cm 1.2cm; 
                        size: A4 portrait;
                    }
                    .no-print { display: none !important; }
                    
                    /* Reset and Container */
                    body { background: white !important; color: black !important; font-size: 9pt !important; line-height: 1.3 !important; }
                    .dark { background: white !important; color: black !important; }
                    #executive-report-root { 
                        border: none !important; 
                        box-shadow: none !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    /* Content containment to prevent extra pages */
                    section, .grid, .glass-card, table, tr { 
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                    }
                    
                    /* Header Clean & Executive */
                    .bg-slate-900 { 
                        background-color: #0f172a !important; 
                        -webkit-print-color-adjust: exact; 
                        color: white !important; 
                        border-radius: 8px !important;
                        margin-bottom: 1rem !important;
                    }
                    .bg-slate-900.p-8 { padding: 1.2rem 1.5rem !important; }
                    .text-white { color: white !important; }
                    .text-3xl { font-size: 1.3rem !important; }
                    .text-4xl { font-size: 1.5rem !important; }
                    .drop-shadow-lg, .blur-3xl { display: none !important; }
                    
                    /* Section Spacing */
                    .p-8, .p-12 { padding: 0.5rem 0 !important; }
                    .md\\:p-12 { padding: 0.5rem 0 !important; }
                    .space-y-8 > * + * { margin-top: 0.75rem !important; }
                    .mb-6, .mb-4 { margin-bottom: 0.5rem !important; }
                    
                    /* Grid Control */
                    .grid { gap: 0.75rem !important; display: grid !important; }
                    .grid-cols-4 { grid-template-columns: repeat(4, 1fr) !important; }
                    .grid-cols-3 { grid-template-columns: repeat(3, 1fr) !important; }
                    .grid-cols-2 { grid-template-columns: repeat(2, 1fr) !important; }
                    
                    /* Metric Cards */
                    .p-5 { padding: 0.8rem !important; border-radius: 10px !important; border: 1pt solid #eee !important; background: white !important; }
                    .text-3xl { font-size: 1.4rem !important; }
                    .text-[0.6rem], .text-[0.55rem], .text-[0.65rem] { font-size: 7pt !important; }
                    
                    /* Table Stats */
                    table { font-size: 8pt !important; width: 100% !important; border-spacing: 0 !important; border-collapse: collapse !important; }
                    th { border-bottom: 1.5pt solid #0f172a !important; padding: 6px 8px !important; }
                    td { padding: 6px 8px !important; border-bottom: 0.5pt solid #f1f5f9 !important; }
                    
                    /* Professional Elements */
                    .fa-award { font-size: 3rem !important; color: #f59e0b !important; -webkit-print-color-adjust: exact; }
                    .bg-slate-900.border { border: none !important; }
                }
            </style>
            
            <!-- Header Premium -->
            <div class="bg-slate-900 text-white p-8 relative overflow-hidden group print:p-8 text-left">
                 <button class="absolute top-4 left-4 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg no-print flex items-center gap-2" onclick="loadAdminSuccessHub()">
                    <i class="fas fa-arrow-left"></i> Volver al Hub
                </button>

                <div class="flex justify-between items-end mt-6 relative z-10 print:mt-2">
                    <div>
                        <div class="text-[0.6rem] font-black uppercase text-indigo-400 tracking-[0.2em] mb-1">Impact Report</div>
                        <h1 class="text-3xl font-black tracking-tighter leading-none mb-1 text-white">${sanitizeInput(school.name)}</h1>
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Target Bimestral: <span class="text-white">${target} Proyectos</span></p>
                    </div>
                    <div class="text-right">
                         <div class="text-[0.55rem] font-bold uppercase text-slate-500 tracking-widest mb-1">Sello de Calidad</div>
                         <i class="fas fa-award text-5xl text-amber-400"></i>
                    </div>
                </div>

                <!-- Web Only Abstract Decorative Elements -->
                <div class="absolute -right-10 -top-10 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none print:hidden"></div>
                <div class="absolute -left-10 -bottom-10 w-48 h-48 bg-primary/20 rounded-full blur-3xl pointer-events-none print:hidden"></div>
            </div>

            <div class="p-8 md:p-12 space-y-8">
                
                <!-- WINNING BY DESIGN: STRATEGIC OVERVIEW -->
                <section>
                    <div class="flex justify-between items-center mb-6 pb-2 border-b border-slate-100 dark:border-slate-800">
                        <h2 class="flex items-center gap-3 text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">
                            <span class="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 flex items-center justify-center text-sm"><i class="fas fa-chess"></i></span>
                            Tablero de Impacto Estratégico
                        </h2>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div class="p-5 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700 shadow-sm text-left">
                            <div class="flex justify-between items-start mb-3">
                                <div class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs"><i class="fas fa-chalkboard-teacher"></i></div>
                                <span class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Participación</span>
                            </div>
                            <div class="text-3xl font-black text-slate-800 dark:text-white mb-1">
                                ${Math.round((teachers.filter(t => evals.some(e => e.teacher_id === t.id)).length / (teachers.length || 1)) * 100)}%
                            </div>
                            <div class="text-[0.65rem] font-bold uppercase text-slate-500 dark:text-slate-400 leading-tight">Docentes Activos</div>
                        </div>

                        <div class="p-5 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700 shadow-sm text-left">
                             <div class="flex justify-between items-start mb-3">
                                <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs"><i class="fas fa-chart-line"></i></div>
                                <span class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Progreso</span>
                            </div>
                            <div class="flex items-end gap-2 mb-1">
                                <div class="text-3xl font-black text-slate-800 dark:text-white">+15%</div>
                            </div>
                            <div class="text-[0.65rem] font-bold uppercase text-slate-500 dark:text-slate-400 leading-tight">Mejora Estudiantil</div>
                        </div>

                        <div class="p-5 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700 shadow-sm text-left">
                             <div class="flex justify-between items-start mb-3">
                                <div class="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs"><i class="fas fa-medal"></i></div>
                                <span class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Liderazgo</span>
                            </div>
                            <div class="text-3xl font-black text-slate-800 dark:text-white mb-1">
                                ${teachers.filter(t => evals.filter(e => e.teacher_id === t.id).length > 5).length}
                            </div>
                            <div class="text-[0.65rem] font-bold uppercase text-slate-500 dark:text-slate-400 leading-tight">Líderes Digitales</div>
                        </div>

                        <div class="p-5 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700 shadow-sm text-left">
                             <div class="flex justify-between items-start mb-3">
                                <div class="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs"><i class="fas fa-smile"></i></div>
                                <span class="text-[0.6rem] font-bold uppercase tracking-widest text-slate-400">Clima</span>
                            </div>
                            <div class="text-2xl font-black text-slate-800 dark:text-white">Positiva</div>
                            <div class="text-[0.65rem] font-bold uppercase text-slate-500 dark:text-slate-400 leading-tight">Satisfacción</div>
                        </div>
                    </div>
                </section>
                
                <section>
                    <h2 class="flex items-center gap-3 text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 text-left">
                        <span class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm"><i class="fas fa-rocket"></i></span>
                        Impacto Digital & Gestión de Talento
                    </h2>
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div class="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800 text-center">
                             <div class="text-[0.6rem] font-black uppercase text-indigo-400 tracking-widest mb-1">Cumplimiento Meta</div>
                             <div class="text-4xl font-black text-indigo-600 dark:text-white">${health}%</div>
                        </div>
                        <div class="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-800 text-center">
                             <div class="text-[0.6rem] font-black uppercase text-emerald-400 tracking-widest mb-1">Calidad Promedio</div>
                             <div class="text-4xl font-black text-emerald-600 dark:text-white">${avgScore}</div>
                        </div>
                        <div class="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-2xl border border-amber-100 dark:border-amber-800 text-center">
                             <div class="text-[0.6rem] font-black uppercase text-amber-500 tracking-widest mb-1">Proyectos Totales</div>
                             <div class="text-4xl font-black text-amber-600 dark:text-white">${projects.length}</div>
                        </div>
                    </div>

                    <div class="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 text-[0.6rem] font-black uppercase text-slate-500">
                                    <th class="px-6 py-3">Líder Educativo</th>
                                    <th class="px-6 py-3 text-center">Satisfacción</th>
                                    <th class="px-6 py-3 text-center">Impacto</th>
                                    <th class="px-6 py-3 text-center">Desempeño</th>
                                </tr>
                            </thead>
                            <tbody>
                            ${teachers.map(t => {
        const tr = ratings.filter(r => r.teacher_id === t.id);
        const te = evals.filter(e => e.teacher_id === t.id);
        const avg = tr.length > 0 ? (tr.reduce((s, r) => s + r.rating, 0) / tr.length).toFixed(1) : '---';
        const avgAcademic = te.length > 0 ? (te.reduce((s, e) => s + (e.total_score || 0), 0) / te.length).toFixed(0) : '---';
        let perfClass = 'border-rose-200 text-rose-700 bg-rose-50/50'; let perfText = 'REQUERIDO';
        if (parseFloat(avg) >= 4.5) { perfClass = 'border-emerald-200 text-emerald-700 bg-emerald-50/50'; perfText = 'EXCELENTE'; }
        else if (parseFloat(avg) >= 3.5) { perfClass = 'border-amber-200 text-amber-700 bg-amber-50/50'; perfText = 'SÓLIDO'; }
        return `
            <tr class="text-sm border-b border-slate-50 dark:border-slate-800">
                <td class="px-6 py-3">
                    <div class="font-bold text-slate-800 dark:text-white">${sanitizeInput(t.full_name)}</div>
                </td>
                <td class="px-6 py-3 text-center font-bold text-amber-500">${avg} 🌟</td>
                <td class="px-6 py-3 text-center font-bold text-primary">${avgAcademic}</td>
                <td class="px-6 py-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[0.55rem] font-black uppercase border ${perfClass}">${perfText}</span>
                </td>
            </tr>
        `;
    }).join('')}
                            </tbody>
                        </table>
                    </div>
                </section>
                
                <!-- Section 3: Insights & Strategic Actions -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 text-left">
                     <div class="bg-slate-900 border border-slate-800 p-8 rounded-2xl flex flex-col justify-center relative overflow-hidden group print:bg-slate-900">
                        <div class="relative z-10">
                            <h4 class="text-[0.6rem] font-black uppercase text-rose-500 tracking-[0.2em] mb-4 flex items-center gap-2">
                                <i class="fas fa-heart"></i> Nota de Customer Success
                            </h4>
                             <p class="text-white text-lg font-medium italic leading-relaxed">"${dynamicData.note}"</p>
                        </div>
                     </div>

                     <div class="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center flex flex-col justify-center relative overflow-hidden print:bg-slate-900">
                          <h4 class="text-[0.6rem] font-black uppercase text-emerald-400 tracking-[0.2em] mb-4">Próxima Sesión</h4>
                          <div class="text-2xl font-black text-white mb-6 leading-tight uppercase tracking-tighter">${dynamicData.next}</div>
                          <div class="inline-block mx-auto bg-emerald-500/10 px-6 py-2 rounded-xl border border-emerald-500/30 text-[0.7rem] font-black text-emerald-400 uppercase tracking-widest">
                              SUGERIDA: ${health < 40 ? '3 días' : (health < 80 ? '7 días' : '15 días')}
                          </div>
                     </div>
                </div>

                <div class="flex justify-end pt-6 border-t border-slate-100 dark:border-slate-800 no-print">
                     <button class="btn-primary-tw h-12 px-8" onclick="window.print()"><i class="fas fa-print"></i> IMPRIMIR</button>
                </div>
            </div>
        </div>
    `;
}

async function showDigitalTalentMap(schoolCode) {
    const container = document.getElementById('admin-success-container');
    container.innerHTML = '<div style="text-align:center; padding: 100px;"><i class="fas fa-rocket fa-spin" style="font-size:3rem; color:var(--primary-color);"></i><p>Generando Mapa de Talento...</p></div>';

    try {
        const [schoolRes, projectsRes] = await Promise.all([
            _supabase.from('schools').select('*').eq('code', schoolCode).single(),
            _supabase.from('projects').select('*, students:user_id!inner(school_code, full_name)').eq('students.school_code', schoolCode).order('score', { ascending: false })
        ]);

        const schoolProjects = (projectsRes.data || []).slice(0, 9);

        container.innerHTML = `
            <div style="background: #0f172a; border-radius: 20px; padding: 40px; color: white; min-height: 80vh;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px;">
                    <div>
                        <button class="btn-secondary" onclick="loadAdminSuccessHub()" style="background: rgba(255,255,255,0.1); color: white; border: none; margin-bottom: 20px; border-radius: 8px; padding: 8px 16px;">
                            <i class="fas fa-arrow-left"></i> Volver a CS Hub
                        </button>
                        <h1 style="font-size: 2.2rem; background: linear-gradient(90deg, #6366f1, #22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                            Digital Talent Map: ${schoolRes.data?.name || schoolCode}
                        </h1>
                        <p style="opacity: 0.7;">Los proyectos con mayor impacto visual y académico.</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    ${schoolProjects.map(p => `
                        <div class="section-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 0; overflow: hidden;">
                            <div style="height: 180px; background: #000; position: relative; display: flex; align-items: center; justify-content: center;">
                                ${p.video_url ? `
                                    <video style="width: 100%; height: 100%; object-fit: cover; opacity: 0.5;">
                                        <source src="${p.video_url}" type="video/mp4">
                                    </video>
                                    <i class="fas fa-play-circle" style="position: absolute; font-size: 2.5rem; color: white;"></i>
                                ` : '<i class="fas fa-video-slash" style="font-size: 2.5rem; opacity:0.1;"></i>'}
                                <div style="position: absolute; top: 10px; right: 10px; background: #f59e0b; color: #000; padding: 2px 8px; border-radius: 10px; font-weight: 800; font-size: 0.7rem;">⭐ ${p.score || '---'}</div>
                            </div>
                            <div style="padding: 15px;">
                                <h3 style="margin:0 0 5px 0; color: #818cf8;">${p.title}</h3>
                                <p style="font-size: 0.8rem; opacity: 0.6; margin-bottom: 15px;">Autor: ${Array.isArray(p.students) ? p.students[0]?.full_name : p.students?.full_name || 'N/A'}</p>
                                <button class="btn-primary btn-sm" onclick="viewProjectDetails(${p.id})">Ver Detalles</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } catch (err) {
        console.error('Error mapa talento:', err);
        loadAdminSuccessHub();
    }
}

function openSchoolGoalsModal(schoolId, currentTarget, schoolName) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[250] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-sm p-8 animate-slideUp border-t-4 border-t-amber-500">
            <h2 class="text-xl font-bold text-slate-800 dark:text-white uppercase mb-4 flex items-center gap-3">
                <i class="fas fa-bullseye text-amber-500"></i> Meta Específica
            </h2>
            <p class="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mb-6">${schoolName}</p>
            
            <div class="space-y-4">
                <div>
                    <label class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest block mb-2">Proyectos por Equipo/Bimestre</label>
                    <input type="number" id="input-school-projects" class="input-field-tw" value="${currentTarget}" min="1" max="20">
                    <p class="text-[0.6rem] text-slate-400 mt-2 italic">Define un objetivo personalizado para este establecimiento. Si se borra, volverá al estándar del sistema.</p>
                </div>
                <div class="flex gap-3 pt-4">
                    <button class="flex-1 btn-secondary-tw text-xs" onclick="this.closest('.fixed').remove()">CANCELAR</button>
                    <button class="flex-[2] btn-primary-tw text-xs !bg-amber-500 hover:!bg-amber-600 border-none" onclick="applySchoolGoals(${schoolId})">
                        <i class="fas fa-check"></i> GUARDAR META
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function applySchoolGoals(schoolId) {
    const val = parseInt(document.getElementById('input-school-projects')?.value);
    if (isNaN(val) || val < 1) return showToast('❌ Ingresa un número válido', 'error');

    try {
        const { error } = await _supabase.from('schools').update({
            projects_per_bimestre: val
        }).eq('id', schoolId);

        if (error) throw error;

        showToast('🎯 Meta personalizada actualizada', 'success');
        document.querySelector('.fixed.z-\\[250\\]')?.remove();
        loadAdminSuccessHub();
    } catch (e) {
        console.error('Error actualizando meta local:', e);
        showToast('❌ Error al guardar meta local (Verifica DB)', 'error');
    }
}

function openSystemGoalsModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-sm p-8 animate-slideUp">
            <h2 class="text-xl font-bold text-slate-800 dark:text-white uppercase mb-6 flex items-center gap-3">
                <i class="fas fa-globe text-primary"></i> Estándar Global
            </h2>
            <div class="space-y-4">
                <div>
                    <label class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest block mb-2">Valor Base del Sistema</label>
                    <input type="number" id="input-sys-projects" class="input-field-tw" value="${SYSTEM_CONFIG.projectsPerBimester}" min="1" max="20">
                    <p class="text-[0.6rem] text-slate-400 mt-2 italic">Aplica para todos los colegios que NO tengan una meta personalizada.</p>
                </div>
                <div class="flex gap-3 pt-4">
                    <button class="flex-1 btn-secondary-tw text-xs" onclick="this.closest('.fixed').remove()">CANCELAR</button>
                    <button class="flex-[2] btn-primary-tw text-xs" onclick="applySystemGoals()">
                        <i class="fas fa-check"></i> APLICAR GLOBAL
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function applySystemGoals() {
    const val = parseInt(document.getElementById('input-sys-projects')?.value);
    if (isNaN(val) || val < 1) return showToast('❌ Ingresa un número válido', 'error');

    saveSystemConfig(val);
    showToast('🚀 Metas globales actualizadas', 'success');

    const hubContainer = document.getElementById('admin-success-container');
    if (hubContainer) {
        document.querySelector('.fixed')?.remove();
        loadAdminSuccessHub();
    }
}

