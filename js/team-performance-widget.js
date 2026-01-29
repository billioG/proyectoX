// ================================================
// DASHBOARD DE DESEMPEÑO DE EQUIPO (Versión Corregida)
// ================================================

async function loadTeamPerformanceDashboard() {
    const container = document.getElementById('team-performance-widget');
    if (!container) return;

    try {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const startOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0];
        const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString().split('T')[0];
        const monthName = now.toLocaleDateString('es-ES', { month: 'long' });

        // Cargar todos los datos necesarios en paralelo
        const [teachersRes, attendanceRes, evalsRes, weeklyEvidenceRes, monthlyReportsRes, assignmentsRes, waiversRes, groupsRes, schoolsRes] = await Promise.all([
            _supabase.from('teachers').select('*'),
            _supabase.from('attendance').select('teacher_id, date, status'),
            _supabase.from('evaluations').select('teacher_id, created_at'),
            _supabase.from('weekly_evidence').select('teacher_id, created_at'),
            _supabase.from('teacher_monthly_reports').select('teacher_id, month, year'),
            _supabase.from('teacher_assignments').select('teacher_id, school_code, grade, section'),
            _supabase.from('attendance_waivers').select('*').eq('status', 'approved').gte('date', startOfMonth).lte('date', endOfMonth),
            _supabase.from('groups').select('*'),
            _supabase.from('schools').select('id, code, projects_per_bimestre')
        ]);

        const teachers = teachersRes.data || [];
        const attendanceRaw = attendanceRes.data || [];
        const evaluations = evalsRes.data || [];
        const evidence = weeklyEvidenceRes.data || [];
        const reports = monthlyReportsRes.data || [];
        const assignments = assignmentsRes.data || [];
        const approvedWaivers = waiversRes.data || [];
        const allGroups = groupsRes.data || [];
        const schools = schoolsRes.data || [];

        // Filtrar docentes activos (con al menos una asignación)
        const activeTeachers = teachers.filter(t => assignments.some(a => a.teacher_id === t.id));

        // ============================================
        // CÁLCULO DE METAS DINÁMICAS AGREGADAS
        // ============================================

        // 1. META DE ASISTENCIA: Total de asignaciones * 4 sesiones/mes - exenciones aprobadas
        const SESSIONS_PER_MONTH = 4;
        const rawAttendanceTarget = assignments.length * SESSIONS_PER_MONTH;
        const totalAttendanceTarget = Math.max(0, rawAttendanceTarget - approvedWaivers.length);

        // 2. META DE EVALUACIONES: Total de equipos en todos los establecimientos * meta de proyectos
        // Obtener códigos únicos de establecimientos asignados
        const assignedSchoolCodes = [...new Set(assignments.map(a => a.school_code))];

        // Filtrar grupos que pertenecen a los establecimientos asignados
        const relevantGroups = allGroups.filter(g => assignedSchoolCodes.includes(g.school_code));

        // Calcular meta de evaluaciones considerando la meta personalizada de cada establecimiento
        let totalEvalTarget = 0;
        assignedSchoolCodes.forEach(code => {
            const school = schools.find(s => s.code === code);
            const projectsPerBimester = school?.projects_per_bimestre || SYSTEM_CONFIG.projectsPerBimester || 4;
            const groupsInSchool = relevantGroups.filter(g => g.school_code === code).length;
            totalEvalTarget += (groupsInSchool * projectsPerBimester);
        });

        // 3. META DE EVIDENCIA: 4 evidencias por asignación al mes
        const totalEvidenceTarget = assignments.length * 4;

        // 4. META DE REPORTES: 1 por docente activo
        const totalReportTarget = activeTeachers.length;

        // ============================================
        // CONTEO DE COMPLETADOS
        // ============================================

        const startDate = new Date(currentYear, currentMonth - 1, 1);
        const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);

        // Contar listas únicas (por docente y fecha)
        const uniqueLists = new Set();
        attendanceRaw.forEach(r => {
            const date = new Date(r.date);
            if (date >= startDate && date <= endDate) {
                uniqueLists.add(`${r.teacher_id}_${r.date}`);
            }
        });

        const completed = {
            attendance: uniqueLists.size,
            evaluations: evaluations.filter(e => {
                const d = new Date(e.created_at);
                return d >= startDate && d <= endDate;
            }).length,
            evidence: evidence.filter(ev => {
                const d = new Date(ev.created_at);
                return d >= startDate && d <= endDate;
            }).length,
            reports: reports.filter(r => r.month === currentMonth && r.year === currentYear).length
        };

        // Calcular XP total (ponderaciones: 30% Asist, 40% Eval, 20% Evid, 10% Report)
        const xp = Math.min(100, Math.round(
            ((completed.attendance / (totalAttendanceTarget || 1)) * 30) +
            ((completed.evaluations / (totalEvalTarget || 1)) * 40) +
            ((completed.evidence / (totalEvidenceTarget || 1)) * 20) +
            ((completed.reports / (totalReportTarget || 1)) * 10)
        ) || 0);

        renderTeamPerformanceWidget(container, {
            monthName,
            totalXP: xp,
            activeTeachersCount: activeTeachers.length,
            attendance: { completed: completed.attendance, target: totalAttendanceTarget },
            evaluations: { completed: completed.evaluations, target: totalEvalTarget },
            evidence: { completed: completed.evidence, target: totalEvidenceTarget },
            reports: { completed: completed.reports, target: totalReportTarget }
        });

    } catch (err) {
        console.error('Error calculando KPIs de equipo:', err);
        container.innerHTML = `<div class="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-xl text-center font-bold">Error calculando metas del equipo</div>`;
    }
}

function renderTeamPerformanceWidget(container, data) {
    container.innerHTML = `
        <div class="glass-card p-6 bg-white dark:bg-slate-900 h-full relative group">
            <!-- Tooltip / Explanation -->
            <div class="absolute top-4 right-4 text-slate-300 dark:text-slate-600 hover:text-primary transition-colors cursor-help group-hover:opacity-100 opacity-50 z-20" 
                 onclick="alert('👶 EXPLICACIÓN SIMPLE:\n\nImagina que ganar XP es como un videojuego 🎮\n\n1. ASISTENCIA (30%): Pasar lista en tus clases.\n2. EVALUACIÓN (40%): Calificar los proyectos de tus alumnos.\n3. EVIDENCIA (20%): Subir fotos de actividades semanales.\n4. INFORME (10%): Enviar tu resumen mensual.\n\n¡Si cumples todas tus metas del mes, ganas 100 XP! 🌟')">
                <i class="fas fa-question-circle text-lg"></i>
            </div>

            <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <i class="fas fa-chart-pie"></i>
                </div>
                <div>
                     <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider leading-none">Desempeño de Equipo</h3>
                     <p class="text-[0.65rem] font-bold text-slate-400 uppercase tracking-widest mt-1">${data.monthName}</p>
                </div>
            </div>

            <div class="flex items-end justify-between mb-8 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div class="w-full">
                    <div class="flex items-baseline gap-1 mb-2">
                        <span class="text-5xl font-black text-slate-800 dark:text-white leading-none">${data.totalXP}</span>
                        <span class="text-sm font-bold text-slate-400">/ 100 XP</span>
                    </div>
                    <div class="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-primary to-blue-500 transition-all duration-1000" style="width: ${data.totalXP}%"></div>
                    </div>
                </div>
                <div class="ml-6 text-right hidden sm:block">
                     <div class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mb-1">Docentes Activos</div>
                     <div class="text-2xl font-black text-slate-700 dark:text-white">${data.activeTeachersCount}</div>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <!-- Asistencia -->
                <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                    <i class="fas fa-clipboard-check text-indigo-500 text-xl mb-2"></i>
                    <div class="text-[0.6rem] font-black text-slate-400 uppercase tracking-widest mb-1">Asistencia</div>
                    <div class="text-xl font-black text-slate-800 dark:text-white">${data.attendance.completed} <span class="text-xs text-slate-400 font-bold">/ ${data.attendance.target}</span></div>
                    <div class="text-[0.6rem] font-bold text-slate-400 mt-1">Listas Firmadas</div>
                </div>

                <!-- Evaluación -->
                <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                    <i class="fas fa-star text-amber-500 text-xl mb-2"></i>
                    <div class="text-[0.6rem] font-black text-slate-400 uppercase tracking-widest mb-1">Evaluación</div>
                    <div class="text-xl font-black text-slate-800 dark:text-white">${data.evaluations.completed} <span class="text-xs text-slate-400 font-bold">/ ${data.evaluations.target}</span></div>
                    <div class="text-[0.6rem] font-bold text-slate-400 mt-1">Proyectos</div>
                </div>

                <!-- Evidencia -->
                <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                    <i class="fas fa-camera text-emerald-500 text-xl mb-2"></i>
                    <div class="text-[0.6rem] font-black text-slate-400 uppercase tracking-widest mb-1">Evidencia</div>
                    <div class="text-xl font-black text-slate-800 dark:text-white">${data.evidence.completed} <span class="text-xs text-slate-400 font-bold">/ ${data.evidence.target}</span></div>
                    <div class="text-[0.6rem] font-bold text-slate-400 mt-1">Fotos Semanales</div>
                </div>

                <!-- Informe -->
                <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                    <i class="fas fa-file-invoice text-violet-500 text-xl mb-2"></i>
                    <div class="text-[0.6rem] font-black text-slate-400 uppercase tracking-widest mb-1">Informe</div>
                    <div class="text-xl font-black text-slate-800 dark:text-white">${data.reports.completed} <span class="text-xs text-slate-400 font-bold">/ ${data.reports.target}</span></div>
                    <div class="text-[0.6rem] font-bold text-slate-400 mt-1">Mensuales</div>
                </div>
            </div>
        </div>
    `;
}
