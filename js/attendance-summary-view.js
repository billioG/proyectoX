// ================================================
// ANALÍTICA DE ASISTENCIA GLOBAL (VISTA RESUMEN)
// ================================================

let globalAttendanceData = [];
let schoolsMap = {}; // Maps school_code to school_name
let currentFilterDate = new Date(); // To track selected month

window.showAttendanceSummaryView = async function showAttendanceSummaryView() {
    const container = document.getElementById('admin-attendance-report-container');
    if (!container) return;

    if (!container.innerHTML || container.innerHTML.includes('fa-circle-notch')) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-20 text-slate-400">
                <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
                <span class="font-bold tracking-widest uppercase text-xs">Analizando Datos de Asistencia...</span>
            </div>
        `;
    }

    try {
        const _supabase = window._supabase;
        const fetchWithCache = window.fetchWithCache;

        await fetchWithCache('admin_global_attendance', async () => {
            // 1. Cargar registros de asistencia y datos de escuelas en paralelo
            const [attendanceResult, schoolsResult] = await Promise.all([
                _supabase
                    .from('attendance')
                    .select(`
                        *,
                        students!fk_attendance_student(full_name, school_code),
                        teachers!fk_attendance_teacher(full_name)
                    `)
                    .order('date', { ascending: false }),
                _supabase
                    .from('schools')
                    .select('code, name')
            ]);

            if (attendanceResult.error) throw attendanceResult.error;
            if (schoolsResult.error) throw schoolsResult.error;

            return {
                attendance: attendanceResult.data || [],
                schools: schoolsResult.data || []
            };
        }, (snapshot) => {
            globalAttendanceData = snapshot.attendance;

            // Crear mapa de códigos a nombres de escuela
            schoolsMap = (snapshot.schools || []).reduce((acc, school) => {
                acc[school.code.toLowerCase()] = school.name;
                return acc;
            }, {});

            window.renderAnalyticsView(container);
        });

    } catch (err) {
        console.error('Error loading attendance analytics:', err);
        container.innerHTML = `<div class="p-8 text-center text-rose-500 font-bold bg-rose-50 rounded-2xl dark:bg-rose-900/20">❌ Error al cargar datos: ${err.message}</div>`;
    }
}

window.renderAnalyticsView = function renderAnalyticsView(container) {
    // Filtrar datos por mes seleccionado
    const selectedYear = currentFilterDate.getFullYear();
    const selectedMonth = currentFilterDate.getMonth();

    // Filtramos los datos globales para usar solo los del mes seleccionado
    const filteredData = globalAttendanceData.filter(record => {
        const d = new Date(record.date);
        return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });

    // Agrupar datos filtrados
    const groupedData = {};

    filteredData.forEach(record => {
        const schoolCode = record.students?.school_code || 'N/A';
        const schoolName = schoolsMap[schoolCode.toLowerCase()] || `Código: ${schoolCode}`; // Fallback al código si no hay nombre
        const teacherName = record.teachers?.full_name || 'Desconocido';
        const groupKey = `${schoolName}||${teacherName}`;

        if (!groupedData[groupKey]) {
            groupedData[groupKey] = {
                schoolName: schoolName,
                teacherName: teacherName,
                present: 0,
                absent: 0,
                records: []
            };
        }

        if (record.status === 'present') {
            groupedData[groupKey].present++;
        } else {
            groupedData[groupKey].absent++;
        }
        groupedData[groupKey].records.push(record);
    });

    // Convertir a array y ordenar por nombre de escuela
    const groups = Object.values(groupedData).sort((a, b) => a.schoolName.localeCompare(b.schoolName));

    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    let html = `
        <div class="flex flex-col md:flex-row justify-between items-center mb-8 animate-slideUp gap-4">
            <div>
                 <h1 class="text-3xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-1">📊 Analítica de Asistencia Global</h1>
                 <p class="text-slate-500 dark:text-slate-400 font-medium text-sm">Resumen mensual por establecimiento y docente.</p>
            </div>
            
            <div class="flex items-center gap-4 bg-white dark:bg-slate-900 p-1.5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                <button onclick="window.changeFilterMonth(-1)" class="w-10 h-10 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="text-center w-40">
                     <div class="text-[0.65rem] font-bold uppercase text-slate-400 tracking-wider leading-none mb-0.5">Viendo</div>
                     <div class="text-sm font-black text-slate-800 dark:text-white leading-none">${monthNames[selectedMonth]} ${selectedYear}</div>
                </div>
                <button onclick="window.changeFilterMonth(1)" class="w-10 h-10 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>

        <div class="space-y-4 animate-fadeIn">
    `;

    if (groups.length === 0) {
        html += `
            <div class="glass-card p-16 text-center">
                <i class="fas fa-calendar-times text-6xl text-slate-200 dark:text-slate-800 mb-6"></i>
                <h2 class="text-xl font-bold text-slate-500 uppercase tracking-widest">Sin Registros en esta Fecha</h2>
                <p class="text-slate-400 mt-2">No se encontraron asistencias en ${monthNames[selectedMonth]} ${selectedYear}.</p>
            </div>
        `;
    } else {
        // Render groups logic (same as before but using filtered groups)
        groups.forEach((group, index) => {
            const total = group.present + group.absent;
            const percentage = total > 0 ? Math.round((group.present / total) * 100) : 0;
            const colorClass = percentage >= 85 ? 'text-emerald-500' : (percentage >= 60 ? 'text-amber-500' : 'text-rose-500');
            const uniqueId = `group-${index}`;

            html += `
                <div class="glass-card hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer overflow-hidden group-item" id="${uniqueId}">
                    <!-- Cabecera Clickable -->
                    <div class="p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4" onclick="window.toggleGroupDetails('${uniqueId}')">
                        <div class="flex flex-col gap-1 grow">
                            <div class="flex items-center gap-3">
                                <span class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-slate-800 text-indigo-500 flex items-center justify-center text-lg shrink-0">
                                    <i class="fas fa-school"></i>
                                </span>
                                <div>
                                    <h3 class="text-lg font-black text-slate-800 dark:text-white leading-tight hover:text-indigo-500 transition-colors">${group.schoolName}</h3>
                                    <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
                                        <i class="fas fa-chalkboard-teacher text-xs"></i> ${group.teacherName}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="flex flex-wrap items-center gap-6 w-full lg:w-auto mt-2 lg:mt-0">
                            <!-- Stats -->
                            <div class="flex items-center gap-8 px-6 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                                <div class="text-center">
                                    <div class="text-[0.65rem] uppercase font-bold text-slate-400 tracking-wider">Asistencias</div>
                                    <div class="text-lg font-black text-emerald-500">${group.present}</div>
                                </div>
                                <div class="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                                <div class="text-center">
                                    <div class="text-[0.65rem] uppercase font-bold text-slate-400 tracking-wider">Inasistencias</div>
                                    <div class="text-lg font-black text-rose-500">${group.absent}</div>
                                </div>
                                <div class="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                                <div class="text-center">
                                    <div class="text-[0.65rem] uppercase font-bold text-slate-400 tracking-wider">Efectividad</div>
                                    <div class="text-lg font-black ${colorClass}">${percentage}%</div>
                                </div>
                            </div>

                            <!-- Actions -->
                            <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                                 <button onclick="window.exportGroupReport('${group.schoolName}', '${group.teacherName}')" class="h-10 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-all font-bold text-xs uppercase tracking-wide flex items-center gap-2">
                                    <i class="fas fa-download"></i> Reporte
                                 </button>
                                 <div class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-slate-100 dark:group-hover:bg-slate-800 transition-colors pointer-events-none">
                                    <i class="fas fa-chevron-down transform transition-transform duration-300 chevron-icon"></i>
                                 </div>
                            </div>
                        </div>
                    </div>

                    <!-- Detalle Desplegable -->
                    <div class="details-content hidden border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                         <div class="p-6">
                            <div class="overflow-x-auto">
                                <table class="w-full text-left border-collapse">
                                    <thead>
                                        <tr>
                                            <th class="p-3 text-[0.65rem] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-700">Fecha</th>
                                            <th class="p-3 text-[0.65rem] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-700">Estudiante</th>
                                            <th class="p-3 text-[0.65rem] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-700 text-right">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody class="text-sm">
                                        ${group.records.sort((a, b) => new Date(b.date) - new Date(a.date)).map(record => `
                                            <tr class="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
                                                <td class="p-3 font-mono text-slate-500 text-xs border-b border-slate-100 dark:border-slate-800">${new Date(record.date).toLocaleDateString()}</td>
                                                <td class="p-3 font-bold text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800">${record.students?.full_name || 'Estudiante Eliminado'}</td>
                                                <td class="p-3 text-right border-b border-slate-100 dark:border-slate-800">
                                                    ${record.status === 'present'
                    ? '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 text-xs font-bold uppercase"><i class="fas fa-check"></i> Presente</span>'
                    : '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50 text-rose-600 text-xs font-bold uppercase"><i class="fas fa-times"></i> Ausente</span>'
                }
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                         </div>
                    </div>
                </div>
            `;
        });
    }

    html += `</div>`;
    container.innerHTML = html;
}

window.changeFilterMonth = function (delta) {
    currentFilterDate.setMonth(currentFilterDate.getMonth() + delta);
    const container = document.getElementById('admin-attendance-report-container');
    if (container) window.renderAnalyticsView(container);
}

// Función global para manejar el acordeón
window.toggleGroupDetails = function (id) {
    const el = document.getElementById(id);
    if (!el) return;

    const content = el.querySelector('.details-content');
    const chevron = el.querySelector('.chevron-icon');

    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        content.classList.add('animate-fadeIn'); // Small fade
        chevron.classList.add('rotate-180');
    } else {
        content.classList.add('hidden');
        chevron.classList.remove('rotate-180');
    }
};

window.exportGroupReport = function (schoolName, teacherName) {
    // Buscar los datos en memoria
    const groupData = globalAttendanceData.filter(r => {
        const sCode = r.students?.school_code || 'N/A';
        const sName = schoolsMap[sCode.toLowerCase()] || `Código: ${sCode}`;
        const tName = r.teachers?.full_name || 'Desconocido';
        return sName === schoolName && tName === teacherName;
    });

    if (!groupData.length) {
        alert('No hay datos para exportar.');
        return;
    }

    // Generar CSV simple
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Fecha,Establecimiento,Docente,Estudiante,Estado\n";

    groupData.forEach(r => {
        const date = new Date(r.date).toLocaleDateString();
        const student = r.students?.full_name || 'N/A';
        const status = r.status === 'present' ? 'Presente' : 'Ausente';
        csvContent += `${date},"${schoolName}","${teacherName}","${student}",${status}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    // Añadir BOM para que Excel abra bien los caracteres especiales
    link.setAttribute("href", 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvContent.substring(25)));

    link.setAttribute("download", `Reporte_Asistencia_${schoolName}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
