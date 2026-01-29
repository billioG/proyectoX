// ================================================
// REPORTE DETALLADO DE ACTIVIDAD MENSUAL
// ================================================

async function showMonthlyActivityReport() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'monthly-activity-report-modal';
    modal.innerHTML = '<div class="modal-content"><p><i class="fas fa-spinner fa-spin"></i> Generando reporte de actividad mensual...</p></div>';
    document.body.appendChild(modal);

    try {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const cacheKey = `monthly_activity_report_${startOfMonth.toISOString().slice(0, 7)}`;

        await fetchWithCache(cacheKey, async () => {
            let { data: waivers, error } = await _supabase
                .from('attendance_waivers')
                .select(`
                    *,
                    teachers(full_name, email, phone),
                    schools(name, code, address)
                `)
                .gte('created_at', startOfMonth.toISOString())
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('Error fetching monthly waivers, trying fallback:', error);
                const [fallbackWaivers, teachers, schools] = await Promise.all([
                    _supabase.from('attendance_waivers').select('*').gte('created_at', startOfMonth.toISOString()).order('created_at', { ascending: false }),
                    _supabase.from('teachers').select('id, full_name, email, phone'),
                    _supabase.from('schools').select('code, name, address')
                ]);

                waivers = (fallbackWaivers.data || []).map(w => ({
                    ...w,
                    teachers: teachers.data?.find(t => t.id === w.teacher_id) || { full_name: 'Docente', email: '', phone: '' },
                    schools: schools.data?.find(s => s.code === w.school_code) || { name: w.school_code || 'Sin establecimiento', code: w.school_code, address: '' }
                }));
            }
            return waivers || [];
        }, (waivers) => {
            renderMonthlyActivityUI(modal, waivers, startOfMonth);
        });

    } catch (err) {
        console.error('Error en showMonthlyActivityReport:', err);
        modal.innerHTML = `
            <div class="modal-content">
                <p class="error-msg">❌ Error generando reporte: ${err.message}</p>
                <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cerrar</button>
            </div>
        `;
    }
}

function renderMonthlyActivityUI(modal, waivers, startOfMonth) {
    // Enrich waivers
    const enrichedWaivers = (waivers || []).map(w => ({
        ...w,
        teachers: w.teachers || { full_name: 'Docente', email: '', phone: '' },
        schools: w.schools || { name: w.school_code || 'Sin establecimiento', code: w.school_code, address: '' }
    }));

    // Group by establishment for summary
    const establishmentStats = {};
    enrichedWaivers.forEach(w => {
        const schoolName = w.schools?.name || w.school_code || 'Sin establecimiento';
        if (!establishmentStats[schoolName]) {
            establishmentStats[schoolName] = {
                name: schoolName,
                total: 0,
                pending: 0,
                approved: 0,
                rejected: 0,
                teachers: new Set(),
                dates: new Set()
            };
        }
        establishmentStats[schoolName].total++;
        if (w.status === 'pending') establishmentStats[schoolName].pending++;
        if (w.status === 'approved') establishmentStats[schoolName].approved++;
        if (w.status === 'rejected') establishmentStats[schoolName].rejected++;
        establishmentStats[schoolName].teachers.add(w.teachers?.full_name || 'Docente');
        establishmentStats[schoolName].dates.add(w.date);
    });

    const monthName = startOfMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1000px;">
            <div class="modal-header">
                <h2>📊 Reporte Detallado de Actividad - ${monthName}</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()">×</button>
            </div>
            <div class="modal-body">
                <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); padding: 20px; border-radius: 12px; margin-bottom: 25px; border-left: 5px solid #10b981;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <h3 style="margin: 0; color: #065f46;">Resumen General del Mes</h3>
                            <p style="margin: 5px 0 0; color: #047857; font-size: 0.9rem;">
                                ${enrichedWaivers.length} solicitudes de exención procesadas en total
                            </p>
                        </div>
                        <div style="text-align: right;">
                            <button class="btn-primary btn-sm" onclick="window.print()" style="margin: 0;">
                                <i class="fas fa-print"></i> Imprimir
                            </button>
                        </div>
                    </div>
                </div>

                <h3 style="margin: 25px 0 15px; color: var(--heading-color);">
                    <i class="fas fa-building"></i> Resumen por Establecimiento
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-bottom: 30px;">
                    ${Object.values(establishmentStats).map(stat => `
                        <div class="section-card" style="padding: 20px; border-left: 4px solid var(--primary-color);">
                            <h4 style="margin: 0 0 15px; color: var(--heading-color); font-size: 1rem;">
                                ${sanitizeInput(stat.name)}
                            </h4>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 15px;">
                                <div style="background: #f8fafc; padding: 10px; border-radius: 8px; text-align: center;">
                                    <div style="font-size: 1.5rem; font-weight: 800; color: var(--primary-color);">${stat.total}</div>
                                    <div style="font-size: 0.75rem; color: var(--text-light);">Total</div>
                                </div>
                                <div style="background: #fef3c7; padding: 10px; border-radius: 8px; text-align: center;">
                                    <div style="font-size: 1.5rem; font-weight: 800; color: #f59e0b;">${stat.pending}</div>
                                    <div style="font-size: 0.75rem; color: #78350f;">Pendientes</div>
                                </div>
                                <div style="background: #d1fae5; padding: 10px; border-radius: 8px; text-align: center;">
                                    <div style="font-size: 1.5rem; font-weight: 800; color: #10b981;">${stat.approved}</div>
                                    <div style="font-size: 0.75rem; color: #064e3b;">Aprobadas</div>
                                </div>
                                <div style="background: #fecaca; padding: 10px; border-radius: 8px; text-align: center;">
                                    <div style="font-size: 1.5rem; font-weight: 800; color: #ef4444;">${stat.rejected}</div>
                                    <div style="font-size: 0.75rem; color: #7f1d1d;">Rechazadas</div>
                                </div>
                            </div>
                            <div style="border-top: 1px solid #e2e8f0; padding-top: 10px;">
                                <small style="display: block; color: var(--text-light); margin-bottom: 5px;">
                                    <strong>${stat.teachers.size}</strong> docente(s) involucrado(s)
                                </small>
                                <small style="display: block; color: var(--text-light);">
                                    <strong>${stat.dates.size}</strong> fecha(s) afectada(s)
                                </small>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <h3 style="margin: 25px 0 15px; color: var(--heading-color);">
                    <i class="fas fa-list-alt"></i> Detalle Completo de Solicitudes
                </h3>
                <div class="table-container" style="max-height: 400px; overflow-y: auto;">
                    <table class="data-table">
                        <thead style="position: sticky; top: 0; background: white; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <tr>
                                <th>Fecha</th>
                                <th>Docente</th>
                                <th>Establecimiento</th>
                                <th>Alcance</th>
                                <th>Fecha Afectada</th>
                                <th>Motivo</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${enrichedWaivers.map(w => {
        const teacherName = w.teachers?.full_name || 'Docente';
        const schoolName = w.schools?.name || w.school_code || 'Sin establecimiento';
        const scope = w.grade && w.section ? `${w.grade} ${w.section}` : 'Todo el establecimiento';

        let statusBadge = '';
        let rowColor = 'white';
        if (w.status === 'pending') {
            statusBadge = '<span class="status-badge status-pending">⏳ Pendiente</span>';
            rowColor = '#fffbeb';
        } else if (w.status === 'approved') {
            statusBadge = '<span class="status-badge status-active">✅ Aprobada</span>';
            rowColor = '#f0fdf4';
        } else if (w.status === 'rejected') {
            statusBadge = '<span class="status-badge status-inactive">❌ Rechazada</span>';
            rowColor = '#fef2f2';
        }

        return `
                                    <tr style="background: ${rowColor};">
                                        <td style="white-space: nowrap;">
                                            <small style="color: var(--text-light);">${formatDate(w.created_at)}</small>
                                        </td>
                                        <td>
                                            <div>
                                                <strong style="display: block;">${sanitizeInput(teacherName)}</strong>
                                                <small style="color: var(--text-light);">${w.teachers?.email || ''}</small>
                                            </div>
                                        </td>
                                        <td>
                                            <strong>${sanitizeInput(schoolName)}</strong>
                                        </td>
                                        <td>
                                            <small>${scope}</small>
                                        </td>
                                        <td style="white-space: nowrap;">
                                            ${formatDate(w.date)}
                                        </td>
                                        <td>
                                            <div style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${sanitizeInput(w.reason)}">
                                                ${sanitizeInput(w.reason)}
                                            </div>
                                        </td>
                                        <td>${statusBadge}</td>
                                    </tr>
                                `;
    }).join('')}
                            ${enrichedWaivers.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding: 40px; color: var(--text-light);">No hay solicitudes este mes</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>

                <div style="margin-top: 25px; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                    <h4 style="margin: 0 0 15px; color: var(--heading-color); font-size: 0.95rem;">
                        <i class="fas fa-chart-pie" style="color: var(--primary-color);"></i> Análisis Estadístico
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <div>
                            <strong style="display: block; margin-bottom: 5px; color: var(--text-dark);">Tasa de Aprobación</strong>
                            <div style="font-size: 1.5rem; font-weight: 800; color: #10b981;">
                                ${enrichedWaivers.length > 0 ? Math.round((enrichedWaivers.filter(w => w.status === 'approved').length / enrichedWaivers.length) * 100) : 0}%
                            </div>
                        </div>
                        <div>
                            <strong style="display: block; margin-bottom: 5px; color: var(--text-dark);">Establecimientos Afectados</strong>
                            <div style="font-size: 1.5rem; font-weight: 800; color: var(--primary-color);">
                                ${Object.keys(establishmentStats).length}
                            </div>
                        </div>
                        <div>
                            <strong style="display: block; margin-bottom: 5px; color: var(--text-dark);">Promedio por Día</strong>
                            <div style="font-size: 1.5rem; font-weight: 800; color: #f59e0b;">
                                ${(enrichedWaivers.length / new Date().getDate()).toFixed(1)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

console.log('✅ admin-monthly-report.js cargado');
