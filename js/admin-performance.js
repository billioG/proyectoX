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
            _supabase.from('teacher_ratings').select('rating, teacher_id, message, created_at, students(full_name)'),
            _supabase.from('evaluations').select('id, teacher_id')
        ]);

        const teachers = teachersRes.data || [];
        const ratings = ratingsRes.data || [];
        const evaluations = evalsRes.data || [];

        const performanceData = teachers.map(t => {
            const tr = ratings.filter(r => r.teacher_id === t.id);
            const te = evaluations.filter(e => e.teacher_id === t.id);
            const avg = tr.length > 0 ? (tr.reduce((s, r) => s + r.rating, 0) / tr.length).toFixed(1) : 0;

            return {
                ...t,
                avgRating: parseFloat(avg),
                totalRatings: tr.length,
                totalEvals: te.length,
                lastRatings: tr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3)
            };
        }).sort((a, b) => b.avgRating - a.avgRating);

        renderTeacherPerformanceHTML(container, performanceData);

    } catch (err) {
        console.error('Error performance:', err);
        container.innerHTML = `<div class="error-state">❌ Error cargando desempeño: ${err.message}</div>`;
    }
}

function renderTeacherPerformanceHTML(container, data) {
    container.innerHTML = `
        <div class="card-header" style="margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h2 style="margin:0;">📊 Desempeño General de Docentes</h2>
                <p style="color: var(--text-light); margin: 5px 0 0 0;">Análisis basado en evaluaciones de estudiantes y actividad en plataforma</p>
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
                        <th>Volumen de Calificaciones</th>
                        <th>Proyectos Evaluados</th>
                        <th>Nivel de Satisfacción</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(t => `
                        <tr>
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
                            <td>${t.totalRatings} recibidas</td>
                            <td>${t.totalEvals} proyectos</td>
                            <td>
                                <span class="status-badge ${t.avgRating >= 4 ? 'status-active' : (t.avgRating >= 3 ? 'status-pending' : 'status-inactive')}">
                                    ${t.avgRating >= 4.5 ? 'Sobresaliente' : (t.avgRating >= 3.5 ? 'Competente' : 'Bajo Desempeño')}
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
