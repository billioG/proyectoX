// ================================================
// DASHBOARD DE RESULTADOS ACADÉMICOS (VISTA ADMINISTRATIVA)
// ================================================

async function loadAdminEvalReport() {
    console.log('📈 Cargando reporte de resultados académicos...');
    const container = document.getElementById('admin-eval-report-container');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center; padding: 40px;">
            <i class="fas fa-circle-notch fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i>
            <p style="margin-top: 10px; color: var(--text-light);">Analizando evaluaciones y proyectos...</p>
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
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error al cargar el reporte</h3>
                <p>${err.message}</p>
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
        <div class="stats-grid" style="margin-bottom: 30px;">
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(99, 102, 241, 0.1); color: #6366f1;">
                    <i class="fas fa-star"></i>
                </div>
                <div class="stat-info">
                    <h3>${stats.averageScore}</h3>
                    <p>Promedio General</p>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">
                    <i class="fas fa-check-double"></i>
                </div>
                <div class="stat-info">
                    <h3>${stats.evaluatedProjects}</h3>
                    <p>Proyectos Calificados</p>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b;">
                    <i class="fas fa-hourglass-half"></i>
                </div>
                <div class="stat-info">
                    <h3>${stats.pendingProjects}</h3>
                    <p>Pendientes</p>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6;">
                    <i class="fas fa-project-diagram"></i>
                </div>
                <div class="stat-info">
                    <h3>${stats.totalProjects}</h3>
                    <p>Total Proyectos</p>
                </div>
            </div>
        </div>

        <div class="section-card">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0;">📅 Rendimiento por Establecimiento</h3>
                <button class="btn-secondary btn-sm" onclick="loadAdminEvalReport()">
                    <i class="fas fa-sync-alt"></i> Actualizar
                </button>
            </div>

            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Establecimiento</th>
                            <th>Proyectos</th>
                            <th>Progreso</th>
                            <th>Promedio</th>
                            <th>Nivel</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.schoolStats.map(school => {
        const progress = school.total > 0 ? Math.round((school.evaluated / school.total) * 100) : 0;
        return `
                                <tr>
                                    <td><strong>${school.name}</strong></td>
                                    <td>${school.total}</td>
                                    <td>
                                        <div style="display:flex; align-items:center; gap:10px;">
                                            <div style="flex:1; height:6px; background:#eee; border-radius:3px; min-width:60px;">
                                                <div style="width:${progress}%; height:100%; background:var(--primary-color); border-radius:3px;"></div>
                                            </div>
                                            <small>${progress}%</small>
                                        </div>
                                    </td>
                                    <td><strong style="color: ${getScoreColor(school.average)}">${school.average}</strong></td>
                                    <td>
                                        <span class="status-badge ${getScoreStatus(school.average)}">
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
