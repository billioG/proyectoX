
// ================================================
// PROCESAMIENTO DE PDF - EXTRAE ESTABLECIMIENTOS Y ESTUDIANTES
// ================================================

window.extractedStudents = [];
window.extractedSchool = null;
window.isProcessingCanceled = false;

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('pdf-file-input');
    const btn = document.getElementById('btn-process-pdf');

    if (fileInput && btn) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type === 'application/pdf') {
                btn.disabled = false;
                btn.style.opacity = '1';
            } else {
                btn.disabled = true;
                btn.style.opacity = '0.5';
            }
        });
    }
});

window.processPDFFile = async function processPDFFile() {
    const fileInput = document.getElementById('pdf-file-input');
    const file = fileInput?.files[0];

    if (!file) {
        return window.showToast('❌ Selecciona un archivo PDF', 'error');
    }

    window.isProcessingCanceled = false;

    if (typeof pdfjsLib === 'undefined') {
        return window.showToast('❌ Error: Librería PDF.js no cargada', 'error');
    }

    const progressContainer = document.getElementById('pdf-processing-progress');
    const progressBar = document.getElementById('pdf-progress-bar');
    const statusText = document.getElementById('pdf-processing-status');
    const btn = document.getElementById('btn-process-pdf');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    statusText.textContent = 'Cargando PDF...';

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;

        let allText = '';

        for (let i = 1; i <= numPages; i++) {
            if (window.isProcessingCanceled) return;
            progressBar.style.width = `${(i / numPages) * 40}% `;
            progressBar.textContent = `${Math.round((i / numPages) * 40)}% `;
            statusText.textContent = `Extrayendo texto de página ${i}/${numPages}...`;

            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            allText += '\n' + pageText;
        }

        progressBar.style.width = '50%';
        statusText.textContent = 'Extrayendo información del establecimiento...';

        window.extractedSchool = extractSchoolInfo(allText);

        progressBar.style.width = '60%';
        statusText.textContent = 'Analizando estructura...';

        // await saveSchool(window.extractedSchool); // ELIMINADO: No guardar hasta confirmar

        progressBar.style.width = '70%';
        statusText.textContent = 'Extrayendo estudiantes...';

        window.extractedStudents = extractStudentsFromText(allText, window.extractedSchool);
        window.extractedStudents = await ensureUniqueUsernames(window.extractedStudents);

        progressBar.style.width = '100%';
        progressBar.textContent = '100%';
        statusText.textContent = `✅ ${window.extractedStudents.length} estudiantes extraídos`;

        window.showToast(`✅ Establecimiento y ${window.extractedStudents.length} estudiantes encontrados`, 'success');

        displaySchoolPreview(window.extractedSchool);
        displayStudentsPreview(window.extractedStudents);
        showConfirmationButton(window.extractedStudents);

    } catch (err) {
        console.error('Error procesando PDF:', err);
        statusText.textContent = '❌ Error procesando PDF';
        progressBar.style.background = 'var(--danger-color)';
        window.showToast('❌ Error: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-file-pdf"></i> Procesar PDF';
    }
}

function extractSchoolInfo(text) {
    const codeMatch = text.match(/C[oó]digo:\s*([0-9\-]+)/i);
    const nameMatch = text.match(/Nombre:\s*([A-ZÑÁÉÍÓÚ\s\.]+?)(?:\s+Direcci[oó]n|Direcci[oó]n:\s|$)/i);
    const addressMatch = text.match(/Direcci[oó]n:\s*([A-ZÑÁÉÍÓÚ0-9\s\.,]+?)(?:\s+Departamento|$)/i);
    const deptMatch = text.match(/Departamento:\s*([A-ZÑÁÉÍÓÚ]+)/i);
    const municipioMatch = text.match(/Municipio:\s*([A-ZÑÁÉÍÓÚ\s]+?)(?:\s+|$)/i);
    const nivelMatch = text.match(/Nivel:\s*([0-9A-Z\-\s]+?)(?:\s+Jornada|Jornada:|$)/i);
    const jornadaMatch = text.match(/Jornada:\s*([A-ZÑÁÉÍÓÚ]+)/i);
    const sectorMatch = text.match(/Sector:\s*([A-ZÑÁÉÍÓÚ]+)/i);
    const areaMatch = text.match(/[AÁ]rea:\s*([A-ZÑÁÉÍÓÚ]+)/i);

    const code = codeMatch ? codeMatch[1].trim() : `CODE-${Date.now()}`;
    const name = nameMatch ? nameMatch[1].trim() : 'Establecimiento Desconocido';
    const department = deptMatch ? deptMatch[1].trim() : '';
    const municipality = municipioMatch ? municipioMatch[1].trim() : '';

    let level = 'Primaria';
    if (nivelMatch) {
        const nivelText = nivelMatch[1].toUpperCase();
        if (nivelText.includes('46') || nivelText.includes('DIVERSIFICADO')) level = 'Diversificado';
        else if (nivelText.includes('43') || nivelText.includes('PRIMARIA')) level = 'Primaria';
        else if (nivelText.includes('BÁSICO') || nivelText.includes('BASICO')) level = 'Básico';
    }

    return {
        code: code,
        name: name,
        address: addressMatch ? addressMatch[1].trim() : '',
        department: department,
        municipality: municipality,
        sector: sectorMatch ? sectorMatch[1].trim() : 'Oficial',
        level: level,
        schedule: jornadaMatch ? jornadaMatch[1].trim() : 'Matutina',
        area: areaMatch ? areaMatch[1].trim() : 'Rural'
    };
}

async function saveSchool(schoolData) {
    try {
        const { data: existing } = await window._supabase
            .from('schools')
            .select('id')
            .eq('code', schoolData.code)
            .maybeSingle();

        if (existing) {
            console.log('⊘ Establecimiento ya existe:', schoolData.code);
            return;
        }

        const { error } = await window._supabase
            .from('schools')
            .insert({
                code: schoolData.code,
                name: schoolData.name,
                address: schoolData.address,
                department: schoolData.department,
                municipality: schoolData.municipality,
                sector: schoolData.sector,
                level: schoolData.level,
                schedule: schoolData.schedule,
                area: schoolData.area
            });

        if (error) throw error;

        console.log('✓ Establecimiento creado:', schoolData.name);
        window.showToast('✅ Establecimiento registrado', 'success');

    } catch (err) {
        console.error('Error guardando establecimiento:', err);
    }
}

function displaySchoolPreview(school) {
    const container = document.getElementById('school-preview-container');
    if (!container || !school) return;

    container.innerHTML = `
        <h3 class="text-xl font-black text-slate-800 dark:text-white mb-6 pl-2 border-l-4 border-primary">🏫 Establecimiento Detectado</h3>
        <div class="glass-card p-6 bg-slate-50 dark:bg-slate-900/50">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                    <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest block mb-1">Código</span>
                    <p class="text-sm font-bold text-slate-800 dark:text-white font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded inline-block">${sanitizeInput(school.code)}</p>
                </div>
                <div class="sm:col-span-2">
                    <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest block mb-1">Nombre Oficial</span>
                    <p class="text-sm font-bold text-slate-800 dark:text-white truncate" title="${sanitizeInput(school.name)}">${sanitizeInput(school.name)}</p>
                </div>
                <div>
                    <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest block mb-1">Departamento</span>
                    <p class="text-sm font-bold text-slate-600 dark:text-slate-300">${sanitizeInput(school.department)}</p>
                </div>
                <div>
                    <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest block mb-1">Municipio</span>
                    <p class="text-sm font-bold text-slate-600 dark:text-slate-300">${sanitizeInput(school.municipality)}</p>
                </div>
                <div>
                    <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest block mb-1">Sector</span>
                    <span class="px-2 py-0.5 rounded text-[0.65rem] font-black uppercase tracking-wider bg-indigo-50 text-indigo-600 border border-indigo-100">${sanitizeInput(school.sector)}</span>
                </div>
                <div>
                    <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest block mb-1">Nivel</span>
                    <span class="px-2 py-0.5 rounded text-[0.65rem] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100">${sanitizeInput(school.level)}</span>
                </div>
                <div>
                    <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest block mb-1">Jornada</span>
                    <p class="text-sm font-bold text-slate-600 dark:text-slate-300">${sanitizeInput(school.schedule)}</p>
                </div>
            </div>
        </div>
    `;
    container.style.display = 'block';
}

function extractStudentsFromText(text, schoolInfo) {
    const students = [];
    const pattern = /(\d+)\s+[A-Z0-9]+\s+([A-ZÑÁÉÍÓÚ]+(?:\s+[A-ZÑÁÉÍÓÚ]+){1,3})\s+([A-ZÑÁÉÍÓÚ]+(?:\s+[A-ZÑÁÉÍÓÚ]+){0,3})\s+(\d{2}\/\d{2}\/\d{4})\s+(?:Guatemalteca|GUATEMALTECA)\s+(?:CUI|DPI)\s+(\d{13})\s+(MASCULINO|FEMENINO|Masculino|Femenino)/gi;
    const gradeMatches = text.matchAll(/Grado:\s*(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|PRIMER|SEGUNDO|TERCER)\s+(?:GRADO\s+)?(BASICO|BÁSICO|PRIMARIA|DIVERSIFICADO)?\s*Secci[oó]n:\s*([A-Z])/gi);

    const gradeArray = Array.from(gradeMatches);

    for (let i = 0; i < gradeArray.length; i++) {
        const gradeMatch = gradeArray[i];
        const levelFromPDF = gradeMatch[2] ? gradeMatch[2].toUpperCase() : null;
        const currentGrade = normalizeGrade(gradeMatch[1], levelFromPDF || schoolInfo.level);
        const currentSection = gradeMatch[3].toUpperCase();

        const startIndex = gradeMatch.index;
        const endIndex = gradeArray[i + 1] ? gradeArray[i + 1].index : text.length;
        const sectionText = text.substring(startIndex, endIndex);

        const studentMatches = sectionText.matchAll(pattern);

        for (const match of studentMatches) {
            const apellidosCompletos = match[2].trim();
            const nombresCompletos = match[3].trim();
            const birthDateStr = match[4]; // DD/MM/YYYY format
            const cui = match[5];
            const genderRaw = match[6].toUpperCase();

            // Convertir fecha de DD/MM/YYYY a YYYY-MM-DD
            const [day, month, year] = birthDateStr.split('/');
            const birthDate = `${year}-${month}-${day}`;

            // Normalizar género a minúsculas
            const gender = genderRaw.includes('MASCULINO') ? 'masculino' : 'femenino';

            const apellidosParts = apellidosCompletos.split(/\s+/).filter(a => a.length > 0);
            const apellido1 = apellidosParts[0] || '';
            const apellido2 = apellidosParts[1] || apellidosParts[0] || '';

            const nombresParts = nombresCompletos.split(/\s+/).filter(n => n.length > 0);
            const primerNombre = nombresParts[0] || '';
            const segundoNombre = nombresParts[1] || '';

            const fullName = `${nombresCompletos} ${apellidosCompletos}`;

            students.push({
                primerNombre,
                segundoNombre,
                apellido1,
                apellido2,
                fullName,
                cui,
                birth_date: birthDate,
                gender: gender,
                grade: currentGrade,
                section: currentSection,
                school_code: schoolInfo.code
            });
        }
    }

    return students;
}

function normalizeGrade(gradeText, level) {
    const upperGrade = gradeText.toUpperCase();
    const normalizedLevel = level ? level.toUpperCase() : 'PRIMARIA';

    // Normalizar el nivel extraído del PDF
    let levelType = 'Primaria';
    if (normalizedLevel.includes('BÁSICO') || normalizedLevel.includes('BASICO')) {
        levelType = 'Básico';
    } else if (normalizedLevel.includes('DIVERSIFICADO')) {
        levelType = 'Diversificado';
    }

    const gradesMap = {
        // Primero, Segundo, Tercero: Primaria o Básico
        'PRIMERO': levelType === 'Básico' ? '1ro Básico' : '1ro Primaria',
        'PRIMER': levelType === 'Básico' ? '1ro Básico' : '1ro Primaria',
        'SEGUNDO': levelType === 'Básico' ? '2do Básico' : '2do Primaria',
        'TERCERO': levelType === 'Básico' ? '3ro Básico' : '3ro Primaria',
        'TERCER': levelType === 'Básico' ? '3ro Básico' : '3ro Primaria',
        // Cuarto, Quinto, Sexto: Primaria o Diversificado
        'CUARTO': levelType === 'Diversificado' ? '4to Diversificado' : '4to Primaria',
        'QUINTO': levelType === 'Diversificado' ? '5to Diversificado' : '5to Primaria',
        'SEXTO': levelType === 'Diversificado' ? '6to Diversificado' : '6to Primaria'
    };

    return gradesMap[upperGrade] || gradeText;
}

function generateUsername(primerNombre, segundoNombre, apellido1, apellido2) {
    const cleanName = (str) => str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z]/g, '');

    const nombre1 = cleanName(primerNombre);
    const nombre2 = cleanName(segundoNombre);
    const ap1 = cleanName(apellido1);

    // Nomenclatura sugerida: primer letra del nombre + el apellido
    const baseUsername = nombre1.charAt(0) + ap1;
    // Variación: primer letra del nombre + primer letra del segundo nombre + apellido
    const altUsername = nombre2 ? nombre1.charAt(0) + nombre2.charAt(0) + ap1 : '';

    return { base: baseUsername, alternative: altUsername };
}

async function ensureUniqueUsernames(students) {
    console.log(`🔍 Iniciando validación de unicidad para ${students.length} estudiantes...`);
    window.showToast(`🚀 Creando ${students.length} usuarios... Por favor espera.`, 'info');

    let existingUsernames = new Set();
    try {
        // Obtenemos todos los usernames para evitar consultas repetitivas en el loop
        const { data: existingStudents, error } = await window._supabase
            .from('students')
            .select('username');

        if (error) {
            console.error('Error al obtener usernames existentes:', error);
        } else {
            existingUsernames = new Set(existingStudents?.map(s => s.username) || []);
            console.log(`✅ ${existingUsernames.size} usernames existentes cargados.`);
        }
    } catch (e) {
        console.warn('⚠️ No se pudo conectar con la DB para verificar unicidad, procediendo con precaución local.', e);
    }

    const usedInThisBatch = new Set();

    return students.map((student, index) => {
        // Asegurar que tenemos strings válidos
        const p1 = student.primerNombre || 'estudiante';
        const p2 = student.segundoNombre || '';
        const a1 = student.apellido1 || '1bot';
        const a2 = student.apellido2 || '';

        const { base, alternative } = generateUsername(p1, p2, a1, a2);

        let finalUsername = base;

        // Si ya existe en DB o en este lote
        if (existingUsernames.has(base) || usedInThisBatch.has(base)) {
            if (alternative && !existingUsernames.has(alternative) && !usedInThisBatch.has(alternative)) {
                finalUsername = alternative;
            } else {
                // Generar variante con números
                let counter = 1;
                let testUsername = base + counter;
                // Límite de seguridad para evitar loops infinitos
                while ((existingUsernames.has(testUsername) || usedInThisBatch.has(testUsername)) && counter < 1000) {
                    counter++;
                    testUsername = base + counter;
                }
                finalUsername = testUsername;
            }
        }

        usedInThisBatch.add(finalUsername);

        if (index % 50 === 0) console.log(`⏳ Procesados ${index}/${students.length} usernames...`);

        return {
            ...student,
            username: finalUsername,
            email: `${finalUsername}@estudiante.edu.gt`,
            password: '1bot.Org2024'
        };
    });
}

function displayStudentsPreview(students) {
    const previewContainer = document.getElementById('pdf-preview-container');
    if (!previewContainer || students.length === 0) return;

    if (!document.getElementById('pdf-preview-table')) {
        previewContainer.innerHTML = `
            <div class="flex justify-between items-end mb-6">
                <h3 class="text-xl font-black text-slate-800 dark:text-white pl-2 border-l-4 border-indigo-500">📋 Vista Previa de Estudiantes</h3>
                <span class="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-xs font-bold ring-1 ring-indigo-500/20">${students.length} Registros Encontrados</span>
            </div>
            
            <div class="glass-card p-0 overflow-hidden shadow-xl">
                <div class="overflow-x-auto">
                    <table id="pdf-preview-table" class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-slate-50 dark:bg-slate-800 text-[0.6rem] font-black uppercase text-slate-400 tracking-widest border-b border-slate-200 dark:border-slate-700">
                                <th class="px-6 py-4 text-center w-12">#</th>
                                <th class="px-6 py-4">Estudiante</th>
                                <th class="px-6 py-4">Credenciales</th>
                                <th class="px-6 py-4 text-center">Info Personal</th>
                                <th class="px-6 py-4 text-center">Académico</th>
                            </tr>
                        </thead>
                        <tbody id="pdf-preview-tbody" class="divide-y divide-slate-100 dark:divide-slate-800"></tbody>
                    </table>
                </div>
            </div>
        `;
    }

    const tbody = document.getElementById('pdf-preview-tbody');
    const studentsPerPage = 20;
    let currentPage = 1;
    const totalPages = Math.ceil(students.length / studentsPerPage);

    function renderPage(page) {
        const start = (page - 1) * studentsPerPage;
        const end = start + studentsPerPage;
        const pageStudents = students.slice(start, end);

        tbody.innerHTML = pageStudents.map((s, index) => `
            <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                <td class="px-6 py-4 text-center text-xs font-bold text-slate-400">${start + index + 1}</td>
                <td class="px-6 py-4">
                    <div class="text-sm font-bold text-slate-800 dark:text-white">${sanitizeInput(s.fullName)}</div>
                    <div class="text-[0.65rem] font-bold text-slate-400 uppercase tracking-wider mt-0.5">CUI: ${s.cui}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2 mb-1">
                        <i class="fas fa-user text-xs text-slate-300"></i>
                        <span class="text-xs font-mono font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">${s.username}</span>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex flex-col gap-1 items-center">
                         <span class="text-xs font-medium text-slate-600">${s.birth_date || '-'}</span>
                         <span class="px-2 py-0.5 rounded text-[0.55rem] font-black uppercase tracking-wider ${s.gender === 'masculino' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}">
                            ${s.gender ? (s.gender === 'masculino' ? 'MASCULINO' : 'FEMENINO') : '-'}
                         </span>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex flex-col gap-1 items-center">
                        <span class="text-xs font-bold text-slate-700 dark:text-slate-300">${s.grade}</span>
                        <span class="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-black text-slate-500 border border-slate-200 dark:border-slate-700">${s.section}</span>
                    </div>
                </td>
            </tr>
        `).join('') + `
            <tr>
                <td colspan="5" class="px-6 py-4">
                    <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2">
                        <button onclick="changePage(${page - 1})" ${page === 1 ? 'disabled' : ''} class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 text-slate-500 hover:text-primary disabled:opacity-30 transition-all shadow-sm">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <span class="text-xs font-black text-slate-400 uppercase tracking-widest">Página ${page} de ${totalPages}</span>
                        <button onclick="changePage(${page + 1})" ${page === totalPages ? 'disabled' : ''} class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 text-slate-500 hover:text-primary disabled:opacity-30 transition-all shadow-sm">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    window.changePage = (page) => {
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            renderPage(page);
        }
    };

    renderPage(1);
    previewContainer.style.display = 'block';
}

function showConfirmationButton(students) {
    const actionsContainer = document.getElementById('pdf-actions-container');
    const confirmBtn = document.getElementById('btn-confirm-users');

    if (actionsContainer && confirmBtn) {
        confirmBtn.innerHTML = `<i class="fas fa-check-circle"></i> Crear Usuarios (${students.length})`;
        actionsContainer.style.display = 'flex';
    }
}

window.cancelPDFImport = function cancelPDFImport() {
    window.isProcessingCanceled = true;
    window.extractedStudents = [];
    window.extractedSchool = null;

    const previewContainer = document.getElementById('pdf-preview-container');
    const schoolPreview = document.getElementById('school-preview-container');
    const progressContainer = document.getElementById('pdf-processing-progress');
    const actionsContainer = document.getElementById('pdf-actions-container');
    const fileInput = document.getElementById('pdf-file-input');
    const btn = document.getElementById('btn-process-pdf');

    if (previewContainer) previewContainer.style.display = 'none';
    if (schoolPreview) schoolPreview.style.display = 'none';
    if (progressContainer) progressContainer.style.display = 'none';
    if (actionsContainer) actionsContainer.style.display = 'none';
    if (fileInput) fileInput.value = '';
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.innerHTML = '<i class="fas fa-file-pdf"></i> Procesar PDF';
    }

    window.showToast('❌ Importación cancelada', 'warning');
}

window.confirmAndCreateUsers = async function confirmAndCreateUsers() {
    await window.createUsersFromExtractedData(window.extractedStudents);
}

window.createUsersFromExtractedData = async function createUsersFromExtractedData(students) {
    if (students.length === 0) {
        return window.showToast('❌ No hay estudiantes para crear', 'error');
    }

    const actionsContainer = document.getElementById('pdf-actions-container');
    const progressContainer = document.getElementById('pdf-processing-progress');
    const progressBar = document.getElementById('pdf-progress-bar');
    const statusText = document.getElementById('pdf-processing-status');

    if (actionsContainer) actionsContainer.style.display = 'none';
    if (window.isProcessingCanceled) return;

    // CLIENTE TEMPORAL: Esto es clave. Creamos una instancia de Supabase que NO guarda sesión
    // para que el signUp de los alumnos no sobrescriba la sesión del administrador.
    const tempSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    if (window.extractedSchool) {
        statusText.textContent = 'Guardando establecimiento...';
        await saveSchool(window.extractedSchool);
    }

    const existingUsernames = new Set();
    const existingEmails = new Set();
    const existingCUIs = new Set();

    try {
        statusText.textContent = 'Verificando duplicados en la nube...';
        const { data: allExisting } = await window._supabase.from('students').select('username, email, cui');
        if (allExisting) {
            allExisting.forEach(s => {
                if (s.username) existingUsernames.add(s.username);
                if (s.email) existingEmails.add(s.email);
                if (s.cui) existingCUIs.add(s.cui);
            });
        }
    } catch (e) {
        console.error('Error lookup:', e);
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    progressContainer.style.display = 'block';

    for (let i = 0; i < students.length; i++) {
        if (window.isProcessingCanceled) break;

        const student = students[i];
        const progress = ((i + 1) / students.length) * 100;

        progressBar.style.width = `${progress}%`;
        progressBar.textContent = `${Math.round(progress)}%`;

        statusText.innerHTML = `
            <div style="margin-bottom: 8px;"><strong>Creando estudiantes...</strong> (${i + 1}/${students.length})</div>
            <div style="font-size: 0.9rem; color: #64748b;">👤 <code>${student.username}</code> - ${student.fullName}</div>
        `;

        if (existingUsernames.has(student.username) || existingEmails.has(student.email) || (student.cui && existingCUIs.has(student.cui))) {
            skippedCount++;
            continue;
        }

        try {
            // Usamos el cliente TEMPORAL para el signUp. 
            // Al tener persistSession: false, NO tocará el localStorage ni cerrará tu sesión.
            const { data: authData, error: authError } = await tempSupabase.auth.signUp({
                email: student.email,
                password: student.password,
                options: {
                    data: {
                        full_name: student.fullName,
                        role: 'estudiante',
                        needs_password_change: true
                    }
                }
            });

            if (authError) {
                if (authError.message.includes('already registered')) {
                    skippedCount++;
                    continue;
                }
                if (authError.status === 429) {
                    statusText.innerHTML += `<div class="text-rose-500 font-bold mt-2 animate-pulse">⚠️ LÍMITE ALCANZADO. ESPERANDO 60S...</div>`;
                    await new Promise(r => setTimeout(r, 60000));
                    i--; continue;
                }
                throw authError;
            }

            if (!authData.user) throw new Error('Auth error');
            await new Promise(r => setTimeout(r, 500));

            const { error: dbError } = await window._supabase.from('students').insert({
                id: authData.user.id,
                full_name: student.fullName,
                username: student.username,
                email: student.email,
                school_code: student.school_code,
                grade: student.grade,
                section: student.section,
                cui: student.cui,
                gender: student.gender || null,
                birth_date: student.birth_date || null,
                password_generated: student.password
            });

            if (dbError) throw dbError;
            successCount++;

            await new Promise(r => setTimeout(r, 2000));

        } catch (err) {
            console.error(`Error:`, err);
            errorCount++;
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    progressBar.style.background = successCount > 0 ? '#10b981' : '#f59e0b';
    progressBar.style.width = '100%';
    statusText.innerHTML = `
        <div class="text-center mb-6"><h3 class="text-xl font-black uppercase">Proceso Completado</h3></div>
        <div class="grid grid-cols-3 gap-4">
            <div class="bg-emerald-50 p-4 rounded-xl text-center"><div class="text-2xl font-black text-emerald-500">${successCount}</div><div class="text-[0.6rem] uppercase tracking-tighter">Éxito</div></div>
            <div class="bg-amber-50 p-4 rounded-xl text-center"><div class="text-2xl font-black text-amber-500">${skippedCount}</div><div class="text-[0.6rem] uppercase tracking-tighter">Omitidos</div></div>
            <div class="bg-rose-50 p-4 rounded-xl text-center"><div class="text-2xl font-black text-rose-500">${errorCount}</div><div class="text-[0.6rem] uppercase tracking-tighter">Errores</div></div>
        </div>
    `;

    if (successCount > 0) window.showToast(`✅ ${successCount} estudiantes creados`, 'success');
    if (typeof window.loadStudents === 'function') setTimeout(window.loadStudents, 2000);
}

console.log('✅ pdf-processor.js cargado correctamente');
