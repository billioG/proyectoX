// ================================================
// GESTIÓN DE RENDIMIENTO DOCENTE (ADMIN)
// ================================================

async function loadAdminTeacherPerformance() {
    const container = document.getElementById('admin-teacher-performance-container');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center; padding: 40px;">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i>
            <p style="margin-top: 10px;">Analizando desempeño de docentes...</p>
        </div>
    `;

    try {
        const [teachersRes, ratingsRes, evalsRes] = await Promise.all([
            _supabase.from('teachers').select('*'),
            _supabase.from('teacher_ratings').select('rating, teacher_id, message, created_at, students:student_id(full_name)'),
            _supabase.from('evaluations').select('id, teacher_id')
        ]);

        const teachers = teachersRes.data || [];
        const ratings = ratingsRes.data || [];
        const evaluations = evalsRes.data || [];

        // Calculate individual teacher performance
        const performanceData = teachers.map(t => {
            const tr = ratings.filter(r => r.teacher_id === t.id);
            const te = evaluations.filter(e => e.teacher_id === t.id);
            const avg = tr.length > 0 ? (tr.reduce((s, r) => s + r.rating, 0) / tr.length).toFixed(1) : 0;

            return {
                ...t,
                avgRating: parseFloat(avg),
                totalRatings: tr.length,
                totalEvals: te.length,
                lastRatings: tr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3),
                isActive: tr.length > 0 || te.length > 0 // Consider active if has ratings or evaluations
            };
        }).sort((a, b) => b.avgRating - a.avgRating);

        // Calculate aggregated KPIs from ALL ACTIVE teachers
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

        renderTeacherPerformanceHTML(container, performanceData, aggregatedKPIs);

    } catch (err) {
        console.error('Error performance:', err);
        container.innerHTML = `<div class="error-state">❌ Error cargando desempeño: ${err.message}</div>`;
    }
}

function renderTeacherPerformanceHTML(container, data, kpis) {
    container.innerHTML = `
        <!-- Aggregated KPIs Dashboard -->
        <div class="card-header" style="margin-bottom: 25px;">
            <div>
                <h2 style="margin:0;">📊 Desempeño General de Docentes</h2>
                <p style="color: var(--text-light); margin: 5px 0 0 0;">Métricas agregadas de todos los docentes activos en la plataforma</p>
            </div>
        </div>

        <!-- KPIs Summary Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px;">
            <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-left: 5px solid #f59e0b;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div style="font-size: 0.8rem; text-transform: uppercase; color: #92400e; font-weight: 700; margin-bottom: 8px;">Calificación Promedio General</div>
                        <div style="font-size: 2.5rem; font-weight: 900; color: #78350f; line-height: 1;">${kpis.overallAvgRating}</div>
                        <div style="margin-top: 8px; color: #92400e; font-size: 0.8rem;">⭐ De ${kpis.totalActiveTeachers} docentes activos</div>
                    </div>
                    <i class="fas fa-star" style="font-size: 2.5rem; color: #f59e0b; opacity: 0.3;"></i>
                </div>
            </div>

            <div style="background: linear-gradient(135deg, #dbeafe, #bfdbfe); padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-left: 5px solid #3b82f6;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div style="font-size: 0.8rem; text-transform: uppercase; color: #1e40af; font-weight: 700; margin-bottom: 8px;">Total Evaluaciones</div>
                        <div style="font-size: 2.5rem; font-weight: 900; color: #1e3a8a; line-height: 1;">${kpis.totalRatings}</div>
                        <div style="margin-top: 8px; color: #1e40af; font-size: 0.8rem;">📝 ${kpis.avgRatingsPerTeacher} por docente</div>
                    </div>
                    <i class="fas fa-clipboard-list" style="font-size: 2.5rem; color: #3b82f6; opacity: 0.3;"></i>
                </div>
            </div>

            <div style="background: linear-gradient(135deg, #d1fae5, #a7f3d0); padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-left: 5px solid #10b981;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div style="font-size: 0.8rem; text-transform: uppercase; color: #065f46; font-weight: 700; margin-bottom: 8px;">Proyectos Calificados</div>
                        <div style="font-size: 2.5rem; font-weight: 900; color: #064e3b; line-height: 1;">${kpis.totalEvaluations}</div>
                        <div style="margin-top: 8px; color: #065f46; font-size: 0.8rem;">📚 ${kpis.avgEvalsPerTeacher} por docente</div>
                    </div>
                    <i class="fas fa-project-diagram" style="font-size: 2.5rem; color: #10b981; opacity: 0.3;"></i>
                </div>
            </div>

            <div style="background: linear-gradient(135deg, #e0e7ff, #c7d2fe); padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-left: 5px solid #8b5cf6;">
                <div>
                    <div style="font-size: 0.8rem; text-transform: uppercase; color: #5b21b6; font-weight: 700; margin-bottom: 12px;">Distribución de Desempeño</div>
                    <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 0.8rem; color: #5b21b6;">Sobresaliente</span>
                            <strong style="color: #10b981; font-size: 1.1rem;">${kpis.excellentTeachers}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 0.8rem; color: #5b21b6;">Competente</span>
                            <strong style="color: #3b82f6; font-size: 1.1rem;">${kpis.competentTeachers}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 0.8rem; color: #5b21b6;">Necesita Atención</span>
                            <strong style="color: #ef4444; font-size: 1.1rem;">${kpis.needsAttention}</strong>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Individual Teacher Performance Table -->
        <div class="card-header" style="margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h3 style="margin:0;">📈 Desglose Individual por Docente</h3>
                <p style="color: var(--text-light); margin: 5px 0 0 0;">Análisis detallado de cada docente basado en evaluaciones de estudiantes</p>
            </div>
            <button class="btn-primary" onclick="loadAdminTeacherPerformance()">
                <i class="fas fa-sync-alt"></i> Actualizar
            </button>
        </div>

        <div class="table-container section-card">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Docente</th>
                        <th>Calificación Promedio</th>
                        <th>Evaluaciones Recibidas</th>
                        <th>Proyectos Evaluados</th>
                        <th>Nivel de Satisfacción</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(t => `
                        <tr style="${!t.isActive ? 'opacity: 0.5;' : ''}">
                            <td>
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--light-gray); overflow: hidden; display: flex; align-items: center; justify-content: center;">
                                        ${t.profile_photo_url ? `<img src="${t.profile_photo_url}" style="width:100%; height:100%; object-fit:cover;">` : '<i class="fas fa-user-tie"></i>'}
                                    </div>
                                    <div>
                                        <strong style="display:block;">${t.full_name}</strong>
                                        <small style="color: var(--text-light);">${t.email}</small>
                                    </div>
                                </div>
                            </td>
                            <td>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 1.2rem; font-weight: 700; color: ${getPerfColor(t.avgRating)}">${t.avgRating}</span>
                                    <div style="color: #f59e0b; font-size: 0.8rem;">
                                        ${'★'.repeat(Math.round(t.avgRating))}${'☆'.repeat(5 - Math.round(t.avgRating))}
                                    </div>
                                </div>
                            </td>
                            <td style="text-align: center;">${t.totalRatings}</td>
                            <td style="text-align: center;">${t.totalEvals}</td>
                            <td>
                                <span class="status-badge ${t.avgRating >= 4 ? 'status-active' : (t.avgRating >= 3 ? 'status-pending' : 'status-inactive')}">
                                    ${t.avgRating >= 4.5 ? '🌟 Sobresaliente' : (t.avgRating >= 3.5 ? '✅ Competente' : (t.avgRating > 0 ? '⚠️ Bajo Desempeño' : '❌ Sin Datos'))}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <h3 style="margin: 30px 0 15px;"><i class="fas fa-comments"></i> Comentarios de Estudiantes Destacados</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">
            ${data.flatMap(t => t.lastRatings.filter(r => r.message).map(r => `
                <div class="section-card" style="padding:15px; border-left: 4px solid ${getPerfColor(r.rating)};">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <strong>${r.students?.full_name || 'Estudiante'}</strong>
                        <span style="color: #f59e0b;">${'★'.repeat(r.rating)}</span>
                    </div>
                    <p style="font-size: 0.9rem; font-style: italic; color: var(--text-color);">"${r.message}"</p>
                    <div style="margin-top: 10px; text-align: right;">
                        <small style="color: var(--text-light);">Para: ${t.full_name}</small>
                    </div>
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
