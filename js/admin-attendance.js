// ================================================
// DASHBOARD DE ASISTENCIA (VISTA ADMINISTRATIVA)
// ================================================

async function loadAdminAttendanceReport() {
    console.log('📊 Cargando reporte de asistencia administrativo...');
    const container = document.getElementById('admin-attendance-report-container');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center; padding: 40px;">
            <i class="fas fa-circle-notch fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i>
            <p style="margin-top: 10px; color: var(--text-light);">Analizando datos de asistencia...</p>
        </div>
    `;

    try {
        // En 'attendance', 'school_code' podría no existir, usamos relación con students.
        const [attendanceRes, schoolsRes, studentsRes] = await Promise.all([
            _supabase.from('attendance').select('status, date, student_id'),
            _supabase.from('schools').select('id, name, code'),
            _supabase.from('students').select('id, school_code')
        ]);

        const attendanceRecords = attendanceRes.data || [];
        const schools = schoolsRes.data || [];
        const studentsList = studentsRes.data || [];

        console.log(`📋 Reporte Asistencia: ${attendanceRecords.length} registros para ${schools.length} escuelas.`);

        // 2. Agrupar por Establecimiento y calcular métricas "Reales"
        const schoolStats = schools.map(school => {
            // Filtrar estudiantes de esta escuela usando comparación de strings robusta
            const schoolStudents = studentsList.filter(s => String(s.school_code) === String(school.code));
            const studentCount = schoolStudents.length;
            const studentIds = schoolStudents.map(s => s.id);

            // Registros de la escuela basados en IDs de estudiantes
            const schoolRecords = attendanceRecords.filter(r => studentIds.includes(r.student_id));

            // Determinar cuántos días se ha tomado asistencia en esta escuela
            const uniqueDates = [...new Set(schoolRecords.map(r => r.date))];
            const daysCount = Math.max(uniqueDates.length, 1);

            const presentCount = schoolRecords.filter(r => r.status === 'present').length;
            const lateCount = schoolRecords.filter(r => r.status === 'late').length;

            // Tasa de asistencia = (Presentes + Tardes) / (Estudiantes Totales * Días de Clase)
            const expectedAttendance = studentCount * daysCount;
            const actualAttendance = presentCount + lateCount;

            // Si no hay registros, la tasa es 0. Si hay registros, se divide por lo esperado del total de alumnos.
            let rate = 0;
            if (expectedAttendance > 0 && schoolRecords.length > 0) {
                rate = Math.min(Math.round((actualAttendance / expectedAttendance) * 100), 100);
            }

            return {
                name: school.name,
                totalRecords: schoolRecords.length,
                presentCount: presentCount,
                absentCount: schoolRecords.filter(r => r.status === 'absent').length,
                lateCount: lateCount,
                rate: rate,
                studentsCount: studentCount,
                daysCount: schoolRecords.length > 0 ? uniqueDates.length : 0
            };
        }).sort((a, b) => b.rate - a.rate);

        const totalPresent = schoolStats.reduce((a, b) => a + b.presentCount, 0);
        const totalLate = schoolStats.reduce((a, b) => a + b.lateCount, 0);
        const totalAbsent = schoolStats.reduce((a, b) => a + b.absentCount, 0);
        const totalRecords = schoolStats.reduce((a, b) => a + b.totalRecords, 0);

        const globalRate = schoolStats.filter(s => s.totalRecords > 0).length > 0
            ? Math.round(schoolStats.reduce((a, b) => a + b.rate, 0) / schoolStats.length)
            : 0;

        renderAdminAttendanceHTML(container, {
            globalRate, totalPresent, totalAbsent, totalLate, totalRecords, schoolStats
        });

    } catch (err) {
        console.error('Error cargando reporte asistencia:', err);
        container.innerHTML = `<div class="error-state">❌ Error: ${err.message}</div>`;
    }
}

function renderAdminAttendanceHTML(container, data) {
    container.innerHTML = `
        <div class="stats-grid" style="margin-bottom: 30px;">
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: #10b981;">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="stat-info">
                    <h3>${data.globalRate}%</h3>
                    <p>Asistencia Global (Real)</p>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6;">
                    <i class="fas fa-users"></i>
                </div>
                <div class="stat-info">
                    <h3>${data.totalPresent}</h3>
                    <p>Asistencias Totales</p>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;">
                    <i class="fas fa-user-times"></i>
                </div>
                <div class="stat-info">
                    <h3>${data.totalAbsent}</h3>
                    <p>Ausencias Totales</p>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon" style="background: rgba(245, 158, 11, 0.1); color: #f59e0b;">
                    <i class="fas fa-clock"></i>
                </div>
                <div class="stat-info">
                    <h3>${data.totalLate}</h3>
                    <p>Tardanzas</p>
                </div>
            </div>
        </div>

        <div class="section-card">
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0;"><i class="fas fa-building"></i> Desempeño por Establecimiento</h3>
                <button class="btn-secondary btn-sm" onclick="loadAdminAttendanceReport()">
                    <i class="fas fa-sync-alt"></i> Actualizar
                </button>
            </div>

            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Establecimiento</th>
                            <th>Estudiantes</th>
                            <th>Días Escaneados</th>
                            <th>Tasa de Asistencia</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.schoolStats.map(s => `
                            <tr>
                                <td><strong>${s.name}</strong></td>
                                <td>${s.studentsCount}</td>
                                <td>${s.daysCount}</td>
                                <td>
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <div style="flex:1; height:6px; background:#eee; border-radius:3px; min-width:80px;">
                                            <div style="width:${s.rate}%; height:100%; background:${s.rate > 80 ? '#10b981' : (s.rate > 50 ? '#f59e0b' : '#ef4444')}; border-radius:3px;"></div>
                                        </div>
                                        <small>${s.rate}%</small>
                                    </div>
                                    <small style="color:var(--text-light);">${s.presentCount + s.lateCount} de ${s.studentsCount * Math.max(s.daysCount, 1)} esperados</small>
                                </td>
                                <td>
                                    <span class="status-badge ${s.rate > 80 ? 'status-active' : (s.rate > 50 ? 'status-pending' : 'status-inactive')}">
                                        ${s.rate > 80 ? 'Óptimo' : (s.rate > 50 ? 'Regular' : 'Crítico')}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}
