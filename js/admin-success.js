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

    container.innerHTML = `
        <div style="text-align:center; padding: 40px;">
            <i class="fas fa-circle-notch fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i>
            <p style="margin-top: 10px; color: var(--text-light);">Calculando métricas de impacto...</p>
        </div>
    `;

    try {
        // La tabla 'projects' NO tiene columna 'status'.
        const [schoolsRes, projectsRes, studentsRes] = await Promise.all([
            _supabase.from('schools').select('*'),
            _supabase.from('projects').select('id, created_at, students:user_id(school_code)'),
            _supabase.from('students').select('id, school_code')
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

        console.log(`📋 CS Hub Data: ${allProjects.length} proyectos, ${allStudents.length} estudiantes`);

        renderSuccessHubHTML(container, schools, allProjects, allStudents);

    } catch (err) {
        console.error('Error CS Hub:', err);
        container.innerHTML = `<div class="error-state">❌ Error al cargar métricas: ${err.message}</div>`;
    }
}

function renderSuccessHubHTML(container, schools, allProjects, allStudents) {
    const schoolMetrics = schools.map(s => {
        const schoolStudents = allStudents.filter(st => String(st.school_code) === String(s.code));

        // Filtrado robusto
        const schoolProjects = allProjects.filter(p => {
            const student = Array.isArray(p.students) ? p.students[0] : p.students;
            return student && String(student.school_code) === String(s.code);
        });

        // REGLA DE SALUD DINÁMICA
        const expectedGroups = Math.ceil(schoolStudents.length / 3.5);
        const targetProjectsPerBimestre = expectedGroups * 4;

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
        <div class="dashboard-header" style="margin-bottom: 30px;">
            <h1 style="color: var(--heading-color); font-size: 1.8rem;">🎯 Centro de Fidelización (Customer Success)</h1>
            <p style="color: var(--text-light);">Basado en métricas de cumplimiento: 4 proyectos/bimestre por equipo.</p>
        </div>

        <div class="stats-grid" style="margin-bottom: 30px;">
            <div class="stat-card" style="border-left: 4px solid #ef4444;">
                <strong style="color: #ef4444;">${schoolMetrics.filter(s => s.healthScore < 40).length}</strong>
                <span>Bajo Cumplimiento (< 40%)</span>
            </div>
            <div class="stat-card" style="border-left: 4px solid #10b981;">
                <strong style="color: #10b981;">${schoolMetrics.filter(s => s.healthScore >= 80).length}</strong>
                <span>Colegios Excelentes</span>
            </div>
            <div class="stat-card">
                <strong>${avgHealth}%</strong>
                <span>Salud Promedio Global</span>
            </div>
        </div>

        <div class="section-card">
            <h3 style="margin-bottom: 20px;"><i class="fas fa-university"></i> Desempeño por Establecimiento</h3>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Establecimiento</th>
                            <th>Salud (Vs Meta Bimestre)</th>
                            <th>Cumplimiento</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${schoolMetrics.map(s => `
                            <tr>
                                <td>
                                    <strong>${s.name}</strong><br>
                                    <small style="color:var(--text-light)">${s.studentCount} estudiantes | Meta: ${s.target} proy.</small>
                                </td>
                                <td>
                                    <div style="width: 120px; height: 10px; background: #eee; border-radius: 5px; overflow: hidden; margin-bottom: 5px;">
                                        <div style="width: ${s.healthScore}%; background: ${s.healthScore < 40 ? '#ef4444' : (s.healthScore < 80 ? '#f59e0b' : '#10b981')}; height: 100%;"></div>
                                    </div>
                                    <small style="font-weight:700; color: ${s.healthScore < 40 ? '#ef4444' : (s.healthScore < 80 ? '#f59e0b' : '#10b981')}">${s.healthScore}% de la meta</small>
                                </td>
                                <td>
                                    <span style="font-size: 0.9rem; font-weight:600;">${s.projectCount} / ${s.target}</span>
                                </td>
                                <td>
                                    <div style="display: flex; gap: 8px;">
                                        <button class="btn-primary btn-sm" onclick="generateExecutiveReport('${s.code}')" style="background:#4f46e5;">
                                            <i class="fas fa-file-invoice"></i> Reporte
                                        </button>
                                        <button class="btn-secondary btn-sm" onclick="showDigitalTalentMap('${s.code}')">
                                            <i class="fas fa-rocket"></i> Mapa
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
    const expectedGroups = Math.ceil(students.length / 3.5);
    const target = expectedGroups * 4;
    const health = target > 0 ? Math.min(Math.round((projects.length / target) * 100), 100) : 0;

    const dynamicData = getDynamicSuccessMessage(health);

    container.innerHTML = `
        <div style="background: white; width: 100%; max-width: 750px; margin: 0 auto; border: 1px solid #eee; font-family: 'Poppins', sans-serif;">
            <div style="background: #1e293b; color: white; padding: 15px 25px; position: relative;">
                <button class="btn-secondary btn-sm no-print" onclick="loadAdminSuccessHub()" style="position: absolute; left: 10px; top: 10px; background: rgba(255,255,255,0.1); color: white; border: none; font-size: 0.65rem;">
                    <i class="fas fa-arrow-left"></i> Volver
                </button>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h4 style="color: #6366f1; text-transform: uppercase; letter-spacing: 1px; margin: 0; font-size: 0.65rem;">Executive Impact Report</h4>
                        <h1 style="font-size: 1.3rem; margin: 2px 0;">${school.name}</h1>
                        <p style="opacity: 0.7; margin: 0; font-size: 0.7rem;">Meta del Bimestre: ${target} Proyectos</p>
                    </div>
                    <div style="text-align: right;">
                        <span style="display:block; font-size: 0.55rem; opacity: 0.6;">Sello de Calidad Educativa</span>
                        <i class="fas fa-award" style="font-size: 1.6rem; color: #f59e0b;"></i>
                    </div>
                </div>
            </div>

            <div style="padding: 15px 25px;">
                <h2 style="border-bottom: 1px solid #eee; padding-bottom: 3px; margin: 0 0 10px 0; color: #1e293b; font-size: 0.95rem;">🚀 Impacto e Innovación Digital</h2>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px;">
                    <div style="text-align: center; padding: 8px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <span style="display: block; font-size: 0.6rem; color: #64748b;">Cumplimiento Meta</span>
                        <strong style="font-size: 1.2rem; color: #4f46e5;">${health}%</strong>
                    </div>
                    <div style="text-align: center; padding: 8px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <span style="display: block; font-size: 0.6rem; color: #64748b;">Calidad Promedio</span>
                        <strong style="font-size: 1.2rem; color: #10b981;">${avgScore}/100</strong>
                    </div>
                    <div style="text-align: center; padding: 8px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                        <span style="display: block; font-size: 0.6rem; color: #64748b;">Proyectos Entregados</span>
                        <strong style="font-size: 1.2rem; color: #f59e0b;">${projects.length}</strong>
                    </div>
                </div>

                <h2 style="border-bottom: 1px solid #eee; padding-bottom: 3px; margin: 0 0 8px 0; color: #1e293b; font-size: 0.95rem;">👨‍🏫 Gestión de Capital Humano</h2>
                <div class="table-container" style="margin-bottom: 15px;">
                    <table class="data-table" style="font-size: 0.7rem; width: 100%;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 5px;">Líder Educativo</th>
                                <th style="padding: 5px; text-align: center;">Satisfacción (${school.name})</th>
                                <th style="padding: 5px; text-align: center;">Evals</th>
                                <th style="padding: 5px; text-align: center;">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${teachers.slice(0, 8).map(t => {
        const tr = ratings.filter(r => r.teacher_id === t.id);
        const te = evals.filter(e => e.teacher_id === t.id);
        const avg = tr.length > 0 ? (tr.reduce((s, r) => s + r.rating, 0) / tr.length).toFixed(1) : '---';
        return `
                                    <tr>
                                        <td style="padding: 4px 5px;"><strong>${t.full_name}</strong></td>
                                        <td style="padding: 4px 5px; text-align: center; color: #f59e0b;">${avg} ⭐</td>
                                        <td style="padding: 4px 5px; text-align: center;">${te.length}</td>
                                        <td style="padding: 4px 5px; text-align: center;">
                                            <span style="padding: 2px 5px; border-radius: 3px; font-size: 0.55rem; border: 1px solid #ddd;
                                                ${parseFloat(avg) >= 4 ? 'background: #dcfce7;' : (parseFloat(avg) >= 3 ? 'background: #fef9c3;' : 'background: #fee2e2;')}">
                                                ${parseFloat(avg) >= 4.5 ? 'Excelencia' : (parseFloat(avg) >= 3.5 ? 'Sólido' : 'Refuerzo')}
                                            </span>
                                        </td>
                                    </tr>
                                `;
    }).join('')}
                        </tbody>
                    </table>
                </div>

                <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <h4 style="margin: 0 0 5px 0; color: #1e293b; font-size: 0.75rem;"><i class="fas fa-heart" style="color:#ef4444;"></i> Nota CS</h4>
                        <p style="margin: 0; font-size: 0.7rem; color: #475569; line-height: 1.3; font-style: italic;">"${dynamicData.note}"</p>
                    </div>
                    <div style="background: #f0fdf4; padding: 12px; border-radius: 8px; border: 1px solid #bbf7d0; text-align: center;">
                        <h4 style="margin: 0 0 5px 0; color: #166534; font-size: 0.75rem;">Próxima Sesión</h4>
                        <strong style="display:block; font-size: 0.8rem; color: #166534; margin-bottom: 3px;">${dynamicData.next}</strong>
                        <div style="background: white; padding: 4px; border-radius: 4px; border: 1px dashed #86efac; font-size: 0.8rem;">
                            Sugerida: ${health < 40 ? '3 días' : (health < 80 ? '7 días' : '15 días')}
                        </div>
                    </div>
                </div>

                <div class="no-print" style="display: flex; justify-content: flex-end;">
                    <button class="btn-primary btn-sm" onclick="window.print()" style="background: #2563eb;">
                        <i class="fas fa-print"></i> Imprimir Reporte
                    </button>
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
