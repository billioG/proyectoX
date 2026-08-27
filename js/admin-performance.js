// ================================================
// GESTIÓN DE RENDIMIENTO DOCENTE (ADMIN)
// ================================================

async function loadAdminTeacherPerformance() {
    const container = document.getElementById('admin-teacher-performance-container');
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
        await fetchWithCache('admin_performance_dashboard', async () => {
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
            const teachers = (teachersRes.data || []).filter(t => !testTeacherIds.has(t.id));
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
            renderTeacherPerformanceHTML(container, data.performanceData, data.aggregatedKPIs);
        });

    } catch (err) {
        console.error('Error performance:', err);
        container.innerHTML = `<div class="error-state"><i class="fas fa-circle-xmark"></i> Error cargando desempeño: ${err.message}</div>`;
    }
}

function renderTeacherPerformanceHTML(container, data, kpis) {
    container.innerHTML = `
        <button onclick="window.nav('teachers')" style="background: none; border: none; color: var(--text-light); font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; margin-bottom: 16px; padding: 0;">
            <i class="fas fa-arrow-left"></i> Volver a Docentes
        </button>
        <!-- Aggregated KPIs Dashboard -->
        <div class="card-header" style="margin-bottom: 20px;">
            <div>
                <h2 style="margin:0; font-size: 1.5rem;"><i class="fas fa-chart-bar"></i> Desempeño General de Docentes</h2>
                <p style="color: var(--text-light); margin: 2px 0 0 0; font-size: 0.85rem;">Métricas agregadas de todos los docentes activos</p>
            </div>
        </div>

        <!-- KPIs Summary Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-bottom: 20px;">
            <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 18px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-left: 5px solid #f59e0b;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div style="font-size: 0.7rem; text-transform: uppercase; color: #92400e; font-weight: 700; margin-bottom: 5px;">Calificación Promedio</div>
                        <div style="font-size: 2rem; font-weight: 900; color: #78350f; line-height: 1;">${kpis.overallAvgRating}</div>
                        <div style="margin-top: 5px; color: #92400e; font-size: 0.7rem;">⭐ De ${kpis.totalActiveTeachers} docentes</div>
                    </div>
                    <i class="fas fa-star" style="font-size: 2rem; color: #f59e0b; opacity: 0.3;"></i>
                </div>
            </div>

            <div style="background: linear-gradient(135deg, #dbeafe, #bfdbfe); padding: 18px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-left: 5px solid #3b82f6;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div style="font-size: 0.7rem; text-transform: uppercase; color: #1e40af; font-weight: 700; margin-bottom: 5px;">Total Evaluaciones</div>
                        <div style="font-size: 2rem; font-weight: 900; color: #1e3a8a; line-height: 1;">${kpis.totalRatings}</div>
                        <div style="margin-top: 5px; color: #1e40af; font-size: 0.7rem;"><i class="fas fa-pen-to-square"></i> ${kpis.avgRatingsPerTeacher} por docente</div>
                    </div>
                    <i class="fas fa-clipboard-list" style="font-size: 2rem; color: #3b82f6; opacity: 0.3;"></i>
                </div>
            </div>

            <div style="background: linear-gradient(135deg, #d1fae5, #a7f3d0); padding: 18px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-left: 5px solid #10b981;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div style="font-size: 0.7rem; text-transform: uppercase; color: #065f46; font-weight: 700; margin-bottom: 5px;">Proyectos Calificados</div>
                        <div style="font-size: 2rem; font-weight: 900; color: #064e3b; line-height: 1;">${kpis.totalEvaluations}</div>
                        <div style="margin-top: 5px; color: #065f46; font-size: 0.7rem;"><i class="fas fa-book"></i> ${kpis.avgEvalsPerTeacher} por docente</div>
                    </div>
                    <i class="fas fa-project-diagram" style="font-size: 2rem; color: #10b981; opacity: 0.3;"></i>
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

        <!-- Antes esto eran DOS secciones separadas ("Desglose Individual" y
        "Docentes Más Activos") mostrando exactamente a los mismos docentes
        con datos distintos -- se unifica en una sola tarjeta por docente. -->
        <div class="card-header" style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h3 style="margin:0; font-size: 1.1rem;"><i class="fas fa-chart-line"></i> Desglose Individual por Docente</h3>
                <p style="color: var(--text-light); margin: 2px 0 0 0; font-size: 0.8rem;">Evaluaciones, satisfacción y actividad real -- ordenado por más activo</p>
            </div>
            <button class="btn-primary" onclick="window.loadAdminTeacherPerformance()" style="padding: 8px 16px; font-size: 0.8rem;">
                <i class="fas fa-sync-alt"></i> Actualizar
            </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
            ${(() => {
                const sorted = [...data].sort((a, b) => b.activeSeconds30d - a.activeSeconds30d);
                return sorted.map(t => {
                    const perfColor = getPerfColor(t.avgRating);
                    const perfLabel = t.avgRating >= 4.5 ? 'Sobresaliente' : (t.avgRating >= 3.5 ? 'Competente' : (t.avgRating > 0 ? 'Bajo Desempeño' : 'Sin Datos'));
                    const perfIcon = t.avgRating >= 4.5 ? 'fa-star' : (t.avgRating >= 3.5 ? 'fa-circle-check' : (t.avgRating > 0 ? 'fa-triangle-exclamation' : 'fa-circle-xmark'));
                    const hours = Math.floor(t.activeSeconds30d / 3600);
                    const minutes = Math.floor((t.activeSeconds30d % 3600) / 60);
                    const connLabel = t.daysSinceLogin === null ? 'Nunca conectó' : t.daysSinceLogin === 0 ? 'Hoy' : `Hace ${t.daysSinceLogin} día(s)`;
                    const connColor = t.daysSinceLogin === null ? '#94a3b8' : t.daysSinceLogin <= 3 ? '#10b981' : '#f59e0b';
                    const connBg = t.daysSinceLogin === null ? 'rgba(148,163,184,0.12)' : t.daysSinceLogin <= 3 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)';
                    return `
                    <div class="section-card" style="padding:16px 18px; ${!t.isActive ? 'opacity:0.55;' : ''}">
                        <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
                            <div style="width:44px; height:44px; border-radius:14px; overflow:hidden; background:var(--light-gray); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                ${t.profile_photo_url ? `<img src="${t.profile_photo_url}" style="width:100%; height:100%; object-fit:cover;">` : '<i class="fas fa-user-tie" style="opacity:0.4;"></i>'}
                            </div>
                            <div style="flex: 1; min-width: 180px;">
                                <strong style="display:block; font-size:0.95rem;">${t.full_name}</strong>
                                <small style="color: var(--text-light);">${t.email}</small>
                            </div>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span style="font-size:1.3rem; font-weight:800; color: ${perfColor};">${t.avgRating}</span>
                                <div style="color: #f59e0b; font-size: 0.75rem;">
                                    ${'<i class="fas fa-star"></i>'.repeat(Math.round(t.avgRating))}${'<i class="fas fa-star" style="opacity:0.2;"></i>'.repeat(5 - Math.round(t.avgRating))}
                                </div>
                            </div>
                            <span style="background:${perfColor}18; color:${perfColor}; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.03em; padding:4px 10px; border-radius:999px; white-space:nowrap;">
                                <i class="fas ${perfIcon}"></i> ${perfLabel}
                            </span>
                            <span style="background:${connBg}; color:${connColor}; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.03em; padding:4px 10px; border-radius:999px; white-space:nowrap;">
                                ${connLabel}
                            </span>
                        </div>
                        <div style="display:flex; gap:24px; margin-top:12px; padding-top:12px; border-top:1px solid rgba(148,163,184,0.15); flex-wrap:wrap;">
                            <div>
                                <div style="font-size:1.1rem; font-weight:800; line-height:1;">${t.totalRatings}</div>
                                <div style="font-size:0.6rem; text-transform:uppercase; color: var(--text-light); font-weight:700; letter-spacing:0.05em; margin-top:2px;">Evaluaciones Recibidas</div>
                            </div>
                            <div>
                                <div style="font-size:1.1rem; font-weight:800; line-height:1;">${t.totalEvals}</div>
                                <div style="font-size:0.6rem; text-transform:uppercase; color: var(--text-light); font-weight:700; letter-spacing:0.05em; margin-top:2px;">Proyectos Evaluados</div>
                            </div>
                            <div>
                                <div style="font-size:1.1rem; font-weight:800; line-height:1;">${hours}h ${minutes}m</div>
                                <div style="font-size:0.6rem; text-transform:uppercase; color: var(--text-light); font-weight:700; letter-spacing:0.05em; margin-top:2px;">Tiempo en Plataforma (30d)</div>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('');
            })()}
        </div>

        <h3 style="margin: 30px 0 15px;"><i class="fas fa-comments"></i> Comentarios de Estudiantes Destacados</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">
            ${data.flatMap(t => t.lastRatings.filter(r => r.message).map(r => `
                <div class="section-card" style="padding:15px; border-left: 4px solid ${getPerfColor(r.rating)};">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <strong>${r.students?.full_name || 'Estudiante'}</strong>
                        <span style="color: #f59e0b;">${'<i class="fas fa-star"></i>'.repeat(r.rating)}</span>
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

// Este archivo se carga vía import() dinámico (ver main.js loadModule) --
// sin exportar a window, main.js nunca podía llamar a esta función y el
// botón "Actualizar" (onclick inline, que corre en scope global) tampoco
// la encontraba. Por eso la pantalla se quedaba en blanco al entrar.
window.loadAdminTeacherPerformance = loadAdminTeacherPerformance;
