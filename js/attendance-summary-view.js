// ================================================
// ANALÍTICA DE ASISTENCIA GLOBAL (VISTA RESUMEN)
// ================================================

let globalAttendanceData = [];
let globalRoster = []; // estudiantes activos de las clases del mes
let lastGroups = {}; // 'establecimiento||docente' -> estadística por estudiante (para el reporte)
let schoolsMap = {}; // Maps school_code to school_name
let schoolsAddressMap = {}; // Maps school_code to school_address
let currentFilterDate = new Date(); // To track selected month

let currentContainerId = 'admin-attendance-report-container';

let currentOpts = {};

const pad2 = (n) => String(n).padStart(2, '0');
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
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
                        id, date, status, student_id, teacher_id, school_code, grade, section,
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

            // Estudiantes activos de las clases que aparecen: sirven para saber quién NO vino (no tiene registro).
            const codes = [...new Set((attendance || []).map((r) => r.school_code || r.students?.school_code).filter(Boolean))];
            const roster = codes.length ? await window.fetchAllRows(() => _supabase.from('students').select('id, full_name, school_code, grade, section').in('school_code', codes).eq('status', 'active').order('id')) : [];

            return { attendance: attendance || [], schools: schoolsResult || [], roster: roster || [] };
        }, (snapshot) => {
            globalAttendanceData = snapshot.attendance;
            globalRoster = snapshot.roster || [];

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

// ¿Quién faltó? El docente solo marca a quien VINO (con el QR o en la lista): quien no tiene registro ese día cuenta como inasistencia, sin que nadie
// la marque. Un día cuenta como clase dada cuando alguien de esa clase (establecimiento + grado + sección) tiene «presente»; así los fines de semana, feriados
// y días suspendidos no cuentan. Además, una inasistencia marcada a mano (presente -> ausente) también cuenta.
// Las fechas son texto AAAA-MM-DD (columna date): no pasan por Date, que las tomaba como UTC y mostraba el día anterior.
const dayOf = (d) => String(d).slice(0, 10);
const classKey = (school, grade, section) => [school, grade, section].map((v) => String(v ?? '').trim().toLowerCase()).join('|');

/** Clase de un registro (el registro viejo sin grado/sección usa la ficha del estudiante). */
function classOfRecord(r, rosterById) {
    const st = rosterById.get(r.student_id);
    return classKey(r.school_code ?? r.students?.school_code ?? st?.school_code, r.grade ?? st?.grade, r.section ?? st?.section);
}

/**
 * Estadística por estudiante de un grupo (establecimiento + docente).
 * @param groupRecords registros del grupo · @param allRecords TODOS los registros del mes (un día es «de clase» si cualquier docente de esa clase marcó presentes)
 * @param roster estudiantes activos {id, full_name, school_code, grade, section} · @param today AAAA-MM-DD: los días que faltan no cuentan
 * @returns [{ key, name, present: n, absent: n, presentDays: [], absentDays: [] }] por nombre
 */
function buildAttendanceStats(groupRecords, allRecords, roster, today = '9999-12-31') {
    const rosterById = new Map((roster || []).map((s) => [s.id, s]));
    const held = new Map(); // clase -> días con algún presente
    const status = new Map(); // estudiante|día -> 'present' | 'absent'
    for (const r of allRecords || []) {
        const d = dayOf(r.date);
        if (r.status === 'present') {
            const k = classOfRecord(r, rosterById);
            if (!held.has(k)) held.set(k, new Set());
            held.get(k).add(d);
        }
        const sk = r.student_id + '|' + d;
        if (r.status === 'present' || !status.has(sk)) status.set(sk, r.status === 'present' ? 'present' : 'absent');
    }
    const classes = new Set((groupRecords || []).map((r) => classOfRecord(r, rosterById)));
    const people = new Map(); // estudiantes de esas clases (por ficha) y quienes tienen registro en el grupo (aunque ya no estén en la ficha)
    for (const st of roster || []) if (classes.has(classKey(st.school_code, st.grade, st.section))) people.set(st.id, { name: st.full_name, cls: classKey(st.school_code, st.grade, st.section) });
    for (const r of groupRecords || []) if (!people.has(r.student_id)) people.set(r.student_id, { name: r.students?.full_name || 'Estudiante Eliminado', cls: classOfRecord(r, rosterById) });
    const out = [];
    for (const [id, p] of people) {
        const presentDays = new Set();
        const absentDays = new Set();
        for (const d of held.get(p.cls) || []) if (d <= today) (status.get(id + '|' + d) === 'present' ? presentDays : absentDays).add(d);
        for (const r of groupRecords || []) {
            if (r.student_id !== id) continue;
            const d = dayOf(r.date);
            if (d > today) continue;
            if (r.status === 'present') { presentDays.add(d); absentDays.delete(d); } else if (!presentDays.has(d)) absentDays.add(d);
        }
        out.push({ key: id, name: p.name, present: presentDays.size, absent: absentDays.size, presentDays: [...presentDays].sort(), absentDays: [...absentDays].sort() });
    }
    return out.sort((x, y) => x.name.localeCompare(y.name, 'es'));
}

window.renderAnalyticsView = function renderAnalyticsView(container) {
    // Filtrar datos por mes seleccionado
    const selectedYear = currentFilterDate.getFullYear();
    const selectedMonth = currentFilterDate.getMonth();

    // Filtramos los datos globales para usar solo los del mes seleccionado
    const monthPrefix = `${selectedYear}-${pad2(selectedMonth + 1)}`;
    const filteredData = globalAttendanceData.filter(record => dayOf(record.date).startsWith(monthPrefix));

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

        groupedData[groupKey].records.push(record);
    });

    // Convertir a array y ordenar por nombre de escuela
    const groups = Object.values(groupedData).sort((a, b) => a.schoolName.localeCompare(b.schoolName));
    const today = localToday();
    lastGroups = {};
    for (const g of groups) {
        g.students = buildAttendanceStats(g.records, filteredData, globalRoster, today);
        g.present = g.students.reduce((n, st) => n + st.present, 0);
        g.absent = g.students.reduce((n, st) => n + st.absent, 0);
        lastGroups[`${g.schoolName}||${g.teacherName}`] = g.students;
    }

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
                                            <th class="p-3 text-[0.65rem] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-700">Inasistencias</th>
                                            <th class="p-3 text-[0.65rem] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-700 text-right">Efectividad</th>
                                        </tr>
                                    </thead>
                                    <tbody class="text-sm">
                                        ${group.students.map(st => {
                                            const tot = st.present + st.absent;
                                            const pct = tot ? Math.round((st.present / tot) * 100) : 0;
                                            const pctClass = pct >= 85 ? 'text-emerald-500' : (pct >= 60 ? 'text-amber-500' : 'text-rose-500');
                                            return `
                                            <tr class="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
                                                <td class="p-3 border-b border-slate-100 dark:border-slate-800 align-top font-bold text-slate-700 dark:text-slate-300">${window.sanitizeInput(st.name)}</td>
                                                <td class="p-3 border-b border-slate-100 dark:border-slate-800 align-top"><span class="font-black text-emerald-600">${st.present}</span></td>
                                                <td class="p-3 border-b border-slate-100 dark:border-slate-800 align-top"><span class="font-black ${st.absent ? 'text-rose-600' : 'text-slate-300 dark:text-slate-600'}">${st.absent}</span></td>
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
    // Las fechas no caben en pantalla si son muchas: van en el reporte (una línea por estudiante y día, con las inasistencias automáticas).
    const students = lastGroups[`${schoolName}||${teacherName}`] || [];
    const lines = [];
    for (const st of students) {
        for (const d of st.presentDays) lines.push({ d, name: st.name, status: 'Presente' });
        for (const d of st.absentDays) lines.push({ d, name: st.name, status: 'Inasistencia' });
    }
    if (!lines.length) {
        alert('No hay datos para exportar.');
        return;
    }
    lines.sort((x, y) => x.d.localeCompare(y.d) || x.name.localeCompare(y.name, 'es'));
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const fmt = (d) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Fecha,Establecimiento,Docente,Estudiante,Estado\n";
    lines.forEach(l => { csvContent += `${fmt(l.d)},${q(schoolName)},${q(teacherName)},${q(l.name)},${l.status}\n`; });

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
