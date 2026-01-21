// ================================================
// DASHBOARD PRINCIPAL DEL ADMINISTRADOR
// ================================================

async function loadAdminDashboard() {
    const container = document.getElementById('admin-dashboard-container');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center; padding: 40px;">
            <i class="fas fa-circle-notch fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i>
            <p style="margin-top: 10px; color: var(--text-light);">Cargando panel ejecutivo...</p>
        </div>
    `;

    try {
        const [
            projectsRes,
            studentsRes,
            teachersRes,
            schoolsRes,
            groupsRes,
            evalsRes,
            ratingsRes
        ] = await Promise.all([
            _supabase.from('projects').select('id, created_at, students:user_id(school_code)'),
            _supabase.from('students').select('id', { count: 'exact', head: true }),
            _supabase.from('teachers').select('*'),
            _supabase.from('schools').select('id, name, code'),
            _supabase.from('groups').select('id, school_code, created_by'),
            _supabase.from('evaluations').select('total_score, teacher_id'),
            _supabase.from('teacher_ratings').select('rating, teacher_id, message, created_at, students:student_id(full_name, school_code)')
        ]);

        if (projectsRes.error) {
            console.warn('Dashboard projects error, retrying standard join:', projectsRes.error);
            const backup = await _supabase.from('projects').select('id, created_at, students(school_code)');
            if (!backup.error) projectsRes.data = backup.data;
        }

        const teachers = teachersRes.data || [];
        const schools = schoolsRes.data || [];
        const groups = groupsRes.data || [];
        const projects = projectsRes.data || [];
        const evaluations = evalsRes.data || [];
        const ratings = ratingsRes.data || [];

        // 1. Estadísticas Base
        const totalProjects = projects.length;
        const totalStudents = studentsRes.count || 0;
        const avgScore = evaluations.length > 0
            ? (evaluations.reduce((sum, e) => sum + (e.total_score || 0), 0) / evaluations.length).toFixed(1)
            : 0;

        // 2. Satisfacción Global (Promedio de todos los docentes)
        const globalSatisfaction = ratings.length > 0
            ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1)
            : 0;

        // 3. Rendimiento Docente con Desglose por Establecimiento (Accordion support)
        const teacherPerformance = teachers.map(t => {
            const tr = ratings.filter(r => r.teacher_id === t.id);
            const te = evaluations.filter(e => e.teacher_id === t.id);

            // Promedio Global del Docente
            const globalAvg = tr.length > 0 ? (tr.reduce((s, r) => s + r.rating, 0) / tr.length).toFixed(1) : 0;

            // Desglose por Establecimiento
            const schoolBreakdown = [];
            const schoolGroups = {};

            tr.forEach(r => {
                const student = Array.isArray(r.students) ? r.students[0] : r.students;
                if (student && student.school_code) {
                    if (!schoolGroups[student.school_code]) {
                        const schoolInfo = schools.find(s => s.code === student.school_code);
                        schoolGroups[student.school_code] = {
                            name: schoolInfo ? schoolInfo.name : student.school_code,
                            ratings: [],
                            count: 0
                        };
                    }
                    schoolGroups[student.school_code].ratings.push(r.rating);
                    schoolGroups[student.school_code].count++;
                }
            });

            for (const code in schoolGroups) {
                const group = schoolGroups[code];
                const avg = (group.ratings.reduce((a, b) => a + b, 0) / group.ratings.length).toFixed(1);
                schoolBreakdown.push({
                    schoolCode: code,
                    schoolName: group.name,
                    avg: parseFloat(avg),
                    count: group.count
                });
            }

            return {
                ...t,
                avgRating: parseFloat(globalAvg),
                totalRatings: tr.length,
                totalEvals: te.length,
                schoolBreakdown: schoolBreakdown.sort((a, b) => b.avg - a.avg)
            };
        }).sort((a, b) => b.avgRating - a.avgRating);

        // 4. Rendimiento por Establecimiento (Para el Modal General)
        const schoolPerformance = schools.map(s => {
            const schoolRatings = ratings.filter(r => {
                const student = Array.isArray(r.students) ? r.students[0] : r.students;
                return student && student.school_code === s.code;
            });
            const avg = schoolRatings.length > 0
                ? (schoolRatings.reduce((sum, r) => sum + r.rating, 0) / schoolRatings.length).toFixed(1)
                : 0;
            return {
                ...s,
                avgRating: parseFloat(avg),
                totalRatings: schoolRatings.length
            };
        }).sort((a, b) => b.avgRating - a.avgRating);

        // 5. Alertas de Salud
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        const schoolAlarms = schools.filter(school => {
            const schoolProjects = projects.filter(p => {
                const s = Array.isArray(p.students) ? p.students[0] : p.students;
                return s && s.school_code === school.code;
            });
            const recent = schoolProjects.filter(p => new Date(p.created_at) > fifteenDaysAgo);
            return recent.length === 0 && schoolProjects.length < 3;
        }).length;

        renderAdminDashboardHTML(container, {
            totalProjects, totalStudents, avgScore,
            teacherPerformance, schoolAlarms,
            globalSatisfaction, schoolPerformance
        });

    } catch (err) {
        console.error('Error dashboard:', err);
        container.innerHTML = `<div class="error-state">❌ Error: ${err.message}</div>`;
    }
}

function renderAdminDashboardHTML(container, stats) {
    container.innerHTML = `
        <style>
            .teacher-row { cursor: pointer; transition: background 0.2s; }
            .teacher-row:hover { background: #f8fafc; }
            .school-breakdown { display: none; background: #fdfdfd; border-top: 1px solid #eee; }
            .school-breakdown.active { display: table-row; }
            .breakdown-content { padding: 15px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
            .school-stat-pill { background: white; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        </style>

        <div class="dashboard-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
            <div>
                <h1 style="font-size: 1.8rem; color: var(--heading-color); margin: 0;">Panel de Control Administrativo</h1>
                <p style="color: var(--text-light); margin: 5px 0 0 0;">Análisis detallado de satisfacción y rendimiento</p>
            </div>
            <button class="btn-primary" onclick="exportAllData()">
                <i class="fas fa-file-export"></i> Exportar Datos (Backup)
            </button>
        </div>

        <div class="stats-grid" style="margin-bottom: 30px;">
            <div class="stat-card" style="background: linear-gradient(135deg, var(--primary-color), var(--primary-dark)); color: white;">
                <div class="stat-icon" style="background: rgba(255,255,255,0.2);"><i class="fas fa-star" style="color:white;"></i></div>
                <div class="stat-info">
                    <h3 style="color:white;">${stats.avgScore}</h3>
                    <p style="color:white; opacity:0.9;">Promedio Académico</p>
                </div>
            </div>

            <div class="stat-card" style="cursor:pointer; border: 1px solid rgba(16, 185, 129, 0.2);" onclick="showSchoolSatisfactionModal()">
                <div class="stat-icon" style="background: rgba(16,185,129,0.1); color: #10b981;"><i class="fas fa-heart"></i></div>
                <div class="stat-info">
                    <h3>${stats.globalSatisfaction}</h3>
                    <p>Satisfacción General Global <i class="fas fa-external-link-alt" style="font-size: 0.7rem; opacity: 0.5;"></i></p>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6;"><i class="fas fa-project-diagram"></i></div>
                <div class="stat-info">
                    <h3>${stats.totalProjects}</h3>
                    <p>Proyectos Totales</p>
                </div>
            </div>

            <div class="stat-card" style="cursor:pointer; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05);" onclick="nav('admin-success')">
                <div class="stat-icon" style="background: rgba(239,68,68,0.1); color: #ef4444;"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="stat-info">
                    <h3>${stats.schoolAlarms}</h3>
                    <p style="color: #ef4444; font-weight: 600;">Alertas de Salud (CS)</p>
                </div>
            </div>
        </div>

        <div class="section-card" style="margin-bottom: 30px;">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
                <div>
                    <h3 style="margin:0;"><i class="fas fa-chalkboard-teacher"></i> Ranking y Satisfacción Docente</h3>
                    <p style="color: var(--text-light); font-size: 0.85rem; margin-top: 5px;">Clic en un docente para ver su calificación por cada centro educativo.</p>
                </div>
                <button class="btn-secondary btn-sm" onclick="showMetricsInfo()">
                    <i class="fas fa-info-circle"></i> Ayuda
                </button>
            </div>
            
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Docente</th>
                            <th>Calificación Global</th>
                            <th>Proyectos Eval.</th>
                            <th>Nivel General</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.teacherPerformance.map(t => `
                            <tr class="teacher-row" onclick="toggleTeacherBreakdown('${t.id}')">
                                <td>
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <div style="width: 32px; height: 32px; border-radius: 50%; background: #eee; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                                            ${t.profile_photo_url ? `<img src="${t.profile_photo_url}" style="width:100%; height:100%; object-fit:cover;">` : '<i class="fas fa-user-tie"></i>'}
                                        </div>
                                        <strong>${t.full_name}</strong>
                                    </div>
                                </td>
                                <td>
                                    <div style="display: flex; align-items: center; gap: 5px;">
                                        <strong style="color: ${getDashboardPerfColor(t.avgRating)}">${t.avgRating}</strong>
                                        <span style="color: #f59e0b; font-size: 0.7rem;">${'★'.repeat(Math.round(t.avgRating))}</span>
                                    </div>
                                </td>
                                <td style="text-align:center;">${t.totalEvals}</td>
                                <td>
                                    <span class="status-badge ${t.avgRating >= 4 ? 'status-active' : (t.avgRating >= 3 ? 'status-pending' : 'status-inactive')}">
                                        ${getSatisfactionLabel(t.avgRating)}
                                    </span>
                                </td>
                                <td><i class="fas fa-chevron-down" style="color: #cbd5e1;" id="icon-${t.id}"></i></td>
                            </tr>
                            <tr class="school-breakdown" id="breakdown-${t.id}">
                                <td colspan="5">
                                    <div class="breakdown-content">
                                        ${t.schoolBreakdown.length > 0 ? t.schoolBreakdown.map(sb => `
                                            <div class="school-stat-pill">
                                                <small style="color: var(--text-light); display:block; margin-bottom: 2px;">${sb.schoolName}</small>
                                                <div style="display:flex; justify-content: space-between; align-items:center;">
                                                    <strong style="color: ${getDashboardPerfColor(sb.avg)}; font-size: 1.1rem;">${sb.avg} ⭐</strong>
                                                    <span style="font-size: 0.7rem; background: #f1f5f9; padding: 2px 6px; border-radius: 10px;">${sb.count} votos</span>
                                                </div>
                                            </div>
                                        `).join('') : '<p style="color: var(--text-light); font-size: 0.8rem; padding: 10px;">No hay evaluaciones por establecimiento aún.</p>'}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div id="metrics-explanation" class="info-box" style="display: none; margin-bottom: 30px;">
             <h4 style="margin:0 0 10px 0; color: var(--primary-color);">Criterios de Satisfacción</h4>
             <p style="font-size: 0.85rem; color: var(--text-dark);">
                La <strong>Calificación Global</strong> es el promedio del docente en todos sus centros. 
                Al expandir la fila, verás el promedio específico que le otorgan los alumnos en cada establecimiento.
             </p>
        </div>

        <script>
            window._lastDashboardSchoolPerf = ${JSON.stringify(stats.schoolPerformance)};
        </script>
    `;
}

function toggleTeacherBreakdown(id) {
    const row = document.getElementById(`breakdown-${id}`);
    const icon = document.getElementById(`icon-${id}`);
    if (row) {
        const isActive = row.classList.toggle('active');
        if (icon) {
            icon.style.transform = isActive ? 'rotate(180deg)' : 'rotate(0)';
        }
    }
}

function showSchoolSatisfactionModal() {
    const data = window._lastDashboardSchoolPerf || [];
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>❤️ Satisfacción Promedio de Docentes por Centro</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <p style="margin-bottom: 20px; color: var(--text-light);">Promedio de todos los docentes asignados a cada establecimiento.</p>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Establecimiento</th>
                                <th>Satisfacción Promedio</th>
                                <th>Feedback Recibido</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(s => `
                                <tr>
                                    <td><strong>${s.name}</strong></td>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <strong style="color: ${getDashboardPerfColor(s.avgRating)}">${s.avgRating}</strong>
                                            <span style="color: #f59e0b; font-size: 0.7rem;">${'★'.repeat(Math.round(s.avgRating))}</span>
                                        </div>
                                    </td>
                                    <td>${s.totalRatings} respuestas</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function getSatisfactionLabel(score) {
    if (score >= 4.5) return 'Sobresaliente';
    if (score >= 3.5) return 'Competente';
    if (score >= 2.5) return 'Regular';
    if (score > 0) return 'Atención Urgente';
    return 'Sin Datos';
}

function getDashboardPerfColor(score) {
    if (score >= 4.5) return '#10b981';
    if (score >= 3.5) return '#3b82f6';
    if (score >= 2.5) return '#f59e0b';
    return '#ef4444';
}
