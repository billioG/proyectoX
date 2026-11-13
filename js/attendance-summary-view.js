// ================================================
// ANALÍTICA DE ASISTENCIA GLOBAL (VISTA RESUMEN)
// ================================================

let globalAttendanceData = [];
let schoolsMap = {}; // Maps school_code to school_name
let schoolsAddressMap = {}; // Maps school_code to school_address
let currentFilterDate = new Date(); // To track selected month

let currentContainerId = 'admin-attendance-report-container';

let currentOpts = {};

const pad2 = (n) => String(n).padStart(2, '0');
// Primer día del mes mostrado y del siguiente (texto AAAA-MM-DD): la columna `date` es una fecha, no una hora.
function monthBounds(d) {
    const y = d.getFullYear(), m = d.getMonth();
    const next = new Date(y, m + 1, 1);
    return { first: `${y}-${pad2(m + 1)}-01`, next: `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-01`, key: `${y}-${pad2(m + 1)}` };
}

// Esta vista muestra UN mes a la vez. Antes pedía TODA la asistencia de todos los tiempos (cada alumno, cada día, con dos relaciones) y
// la filtraba por mes en el navegador: crecía sin límite y, pasadas las 1000 filas que Supabase devuelve por defecto, mostraba
// cifras incompletas en silencio. Ahora pide solo el mes que se ve, completo (paginado con un orden estable) y guardado por mes.
window.showAttendanceSummaryView = async function showAttendanceSummaryView(opts = {}) {
    const { containerId = 'admin-attendance-report-container' } = opts;
    currentOpts = opts;
    currentContainerId = containerId;
    const container = document.getElementById(containerId);
    if (!container) return;
    await loadAttendanceMonth(container);
}

async function loadAttendanceMonth(container) {
    const { teacherIds = null, cacheKey = 'admin_global_attendance' } = currentOpts;
    const { first, next, key } = monthBounds(currentFilterDate);

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

        await fetchWithCache(`${cacheKey}_${key}`, async () => {
            // Coordinador: solo la asistencia tomada por sus docentes asignados
            // (RLS también lo exige -- ver migrations/school-project-visibility.sql).
            const buildAttendance = () => {
                let q = _supabase
                    .from('attendance')
                    .select(`
                        id, date, status, student_id, teacher_id,
                        students!fk_attendance_student(full_name, school_code),
                        teachers!fk_attendance_teacher(full_name)
                    `)
                    .gte('date', first).lt('date', next)
                    .order('date', { ascending: false })
                    .order('id'); // desempate: sin él, las páginas pueden repetir o saltarse filas
                if (teacherIds) q = q.in('teacher_id', teacherIds);
                return q;
            };

            const [attendance, schoolsResult] = await Promise.all([
                window.fetchAllRows(buildAttendance),
                // Los establecimientos casi no cambian: vigentes 10 minutos.
                window.fetchWithCache('attendance_view_schools', () => _supabase.from('schools').select('code, name, address'), null, { ttlMs: 10 * 60_000 }),
            ]);

            return { attendance: attendance || [], schools: schoolsResult || [] };
        }, (snapshot) => {
            globalAttendanceData = snapshot.attendance;

            // Crear mapa de códigos a nombres de escuela
            schoolsMap = (snapshot.schools || []).reduce((acc, school) => {
                acc[school.code.toLowerCase()] = school.name;
                return acc;
            }, {});
            schoolsAddressMap = (snapshot.schools || []).reduce((acc, school) => {
                acc[school.code.toLowerCase()] = school.address || '';
                return acc;
            }, {});

            window.renderAnalyticsView(container);
        });

    } catch (err) {
        console.error('Error loading attendance analytics:', err);
        container.innerHTML = `<div class="p-8 text-center text-rose-500 font-bold bg-rose-50 rounded-2xl dark:bg-rose-900/20"><i class="fas fa-circle-xmark"></i> Error al cargar datos: ${err.message}</div>`;
    }
}

// Una fila por estudiante (antes una por cada día de cada estudiante y la lista se hacía larguísima): días que asistió y días que faltó, en orden.
// La fecha es texto AAAA-MM-DD (columna date): se parte sin pasar por Date, que la tomaba como UTC y mostraba el día anterior.
function groupAttendanceByStudent(records) {
    const byStudent = new Map();
    for (const r of records || []) {
        const key = r.student_id ?? r.students?.full_name ?? 'sin-estudiante';
        if (!byStudent.has(key)) byStudent.set(key, { key, name: r.students?.full_name || 'Estudiante Eliminado', present: [], absent: [] });
        byStudent.get(key)[r.status === 'present' ? 'present' : 'absent'].push(String(r.date).slice(0, 10));
    }
    return [...byStudent.values()]
        .map((st) => ({ ...st, present: [...new Set(st.present)].sort(), absent: [...new Set(st.absent)].sort() }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// «Asistió 3 · 7, 8, 12»: el total y los días del mes (el mes ya está en el selector); al pasar el cursor, la fecha completa.
function attendanceDayChips(days, kind) {
    if (!days.length) return '<span class="text-slate-300 dark:text-slate-600">—</span>';
    const tone = kind === 'present' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600';
    const chips = days.map((d) => {
        const [y, m, day] = d.split('-');
        return `<span title="${day}/${m}/${y}" class="inline-block px-1.5 py-0.5 rounded-md ${tone} text-xs font-bold">${Number(day)}</span>`;
    }).join(' ');
    return `<div class="flex flex-wrap items-center gap-1"><span class="font-black ${kind === 'present' ? 'text-emerald-600' : 'text-rose-600'} mr-1">${days.length}</span>${chips}</div>`;
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
        const schoolAddress = schoolsAddressMap[schoolCode.toLowerCase()] || '';
        const teacherName = record.teachers?.full_name || 'Desconocido';
        const groupKey = `${schoolName}||${teacherName}`;

        if (!groupedData[groupKey]) {
            groupedData[groupKey] = {
                schoolName: schoolName,
                schoolAddress: schoolAddress,
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
                 <h1 class="text-3xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-1"><i class="fas fa-chart-bar"></i> Analítica de Asistencia Global</h1>
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
                                    ${group.schoolAddress ? `<p class="text-[0.65rem] text-slate-400 font-medium">${window.sanitizeInput(group.schoolAddress)}</p>` : ''}
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
                                            <th class="p-3 text-[0.65rem] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-700">Estudiante</th>
                                            <th class="p-3 text-[0.65rem] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-700">Asistencias</th>
                                            <th class="p-3 text-[0.65rem] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-700">Ausencias</th>
                                            <th class="p-3 text-[0.65rem] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-700 text-right">Efectividad</th>
                                        </tr>
                                    </thead>
                                    <tbody class="text-sm">
                                        ${groupAttendanceByStudent(group.records).map(st => {
                                            const tot = st.present.length + st.absent.length;
                                            const pct = tot ? Math.round((st.present.length / tot) * 100) : 0;
                                            const pctClass = pct >= 85 ? 'text-emerald-500' : (pct >= 60 ? 'text-amber-500' : 'text-rose-500');
                                            return `
                                            <tr class="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
                                                <td class="p-3 border-b border-slate-100 dark:border-slate-800 align-top font-bold text-slate-700 dark:text-slate-300">${window.sanitizeInput(st.name)}</td>
                                                <td class="p-3 border-b border-slate-100 dark:border-slate-800 align-top">${attendanceDayChips(st.present, 'present')}</td>
                                                <td class="p-3 border-b border-slate-100 dark:border-slate-800 align-top">${attendanceDayChips(st.absent, 'absent')}</td>
                                                <td class="p-3 border-b border-slate-100 dark:border-slate-800 align-top text-right font-black ${pctClass}">${pct}%</td>
                                            </tr>`;
                                        }).join('')}
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
    // setMonth con el día 31 «salta» de mes (31 de marzo - 1 mes = 3 de marzo): se fija el día 1 antes de mover.
    currentFilterDate.setDate(1);
    currentFilterDate.setMonth(currentFilterDate.getMonth() + delta);
    const container = document.getElementById(currentContainerId);
    if (container) loadAttendanceMonth(container); // pide ESE mes (guardado por mes: volver a uno ya visto es instantáneo)
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

    link.setAttribute("download", `Reporte_Asistencia_${schoolName}_${monthBounds(currentFilterDate).key}.csv`); // el mes que se está viendo
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
