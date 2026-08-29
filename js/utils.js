// ================================================
// UTILS.JS - FUNCIONES COMPARTIDAS (Versión Clásica)
// ================================================

// GLOBAL SYSTEM CONFIGURATION
export const SYSTEM_CONFIG = {
    projectsPerBimester: parseInt(localStorage.getItem('sys_projects_per_bimestre')) || 4,
    studentsPerTeam: 3.5
};
window.SYSTEM_CONFIG = SYSTEM_CONFIG;

export async function syncSystemConfig() {
    try {
        // Intentar cargar desde la base de datos (tabla system_config con columnas key, value)
        const { data, error } = await _supabase.from('system_config').select('value').eq('key', 'projects_per_bimestre').maybeSingle();
        if (data && !error) {
            const val = parseInt(data.value);
            if (!isNaN(val)) {
                SYSTEM_CONFIG.projectsPerBimester = val;
                localStorage.setItem('sys_projects_per_bimestre', val);
                return val;
            }
        }
    } catch (e) {
        console.warn('⚠️ No se pudo sincronizar la configuración desde la DB. Usando local.', e);
    }
    return SYSTEM_CONFIG.projectsPerBimester;
}

export async function saveSystemConfig(projects) {
    SYSTEM_CONFIG.projectsPerBimester = projects;
    localStorage.setItem('sys_projects_per_bimestre', projects);

    try {
        // Intentar persistir en la base de datos
        await _supabase.from('system_config').upsert({
            key: 'projects_per_bimestre',
            value: projects.toString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
    } catch (e) {
        console.error('❌ Error persistiendo configuración en DB:', e);
    }
}

export function formatCurrency(amount) {
    return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(amount);
}

export function formatDate(dateString) {
    if (!dateString) return 'S/F';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Fecha inválida';
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('es-GT', options);
    } catch (e) { return 'S/F'; }
}

export function formatDateTime(dateString) {
    if (!dateString) return 'S/F';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Fecha inválida';
        const options = {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        };
        return date.toLocaleDateString('es-GT', options);
    } catch (e) { return 'S/F'; }
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function sanitizeInput(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// sanitizeInput() no escapa comillas (innerHTML de un text node no las
// necesita) -- usar esta variante cuando el valor va dentro de un atributo
// HTML entrecomillado (value="...", data-x="...") para evitar breakout.
export function sanitizeAttr(str) {
    return sanitizeInput(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function showToast(message, type = 'default') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} show`;
    toast.innerHTML = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export function getStatusBadge(status) {
    const statuses = {
        'active': 'status-active',
        'pending': 'status-pending',
        'inactive': 'status-inactive',
        'approved': 'status-active',
        'rejected': 'status-inactive'
    };
    return statuses[status] || 'status-pending';
}

/**
 * fetchWithCache - Patrón Stale-While-Revalidate para Offline-First
 * @param {string} cacheKey - Clave única para el cache en IndexedDB
 * @param {Function} fetchPromise - Función que retorna la promesa de Supabase
 * @param {Function} onUpdate - Callback opcional cuando lleguen los datos frescos (recibe data y un flag isFromCache)
 */
export async function fetchWithCache(cacheKey, fetchPromise, onUpdate = null) {
    let cachedData = null;

    // 1. Intentar obtener de cache local (Instantáneo)
    if (typeof _syncManager !== 'undefined') {
        try {
            cachedData = await _syncManager.getCache(cacheKey);
            if (cachedData && onUpdate) {
                onUpdate(cachedData, true); // true = desde cache
            }
        } catch (e) {
            console.warn(`⚠️ Error leyendo cache para ${cacheKey}:`, e);
        }
    }

    // 2. Intentar obtener de la red (Segundo plano o si no hay cache)
    try {
        const result = await fetchPromise();

        // Manejar estructura de respuesta de Supabase {data, error}
        if (result && result.error) throw result.error;

        const freshData = result && result.data !== undefined ? result.data : result;

        // 3. Guardar en cache si tenemos datos exitosos
        if (typeof _syncManager !== 'undefined' && freshData) {
            await _syncManager.setCache(cacheKey, freshData);
        }

        // 4. Notificar a la UI con datos frescos
        if (onUpdate) {
            onUpdate(freshData, false); // false = desde red (fresco)
        }

        return freshData;
    } catch (err) {
        console.warn(`🔌 Fallo de red para ${cacheKey}, usando cache si existe:`, err);
        return cachedData;
    }
}

/**
 * QR_MAP - Mapeo de llaves cortas para compresión de QR (Modo Kolibri)
 * Ahorra espacio crítico para permitir más registros en un solo código.
 */
const QR_MAP = {
    // Top level
    'action': 'a',
    'data': 'd',
    'timestamp': 'ts',

    // Acciones
    'mark_attendance': 'ma',
    'save_evaluation': 'se',

    // Campos de datos
    'student_id': 'si',
    'teacher_id': 'ti',
    'school_code': 'sc',
    'grade': 'g',
    'section': 's',
    'date': 'dt',
    'status': 'st',
    'project_id': 'pi',
    'total_score': 'tsc',
    'creativity_score': 'cs',
    'clarity_score': 'cls',
    'functionality_score': 'fs',
    'teamwork_score': 'tsm',
    'social_impact_score': 'sis',
    'feedback': 'fb'
};

/**
 * compressData - Transforma llaves largas en cortas usando QR_MAP
 */
function compressData(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(compressData);

    const compressed = {};
    for (const key in obj) {
        const shortKey = QR_MAP[key] || key;
        let value = obj[key];

        // Comprimir el valor si es la acción
        if (key === 'action') value = QR_MAP[value] || value;
        // Recursivo para 'data' o 'items'
        else if (typeof value === 'object' && value !== null) value = compressData(value);

        compressed[shortKey] = value;
    }
    return compressed;
}

/**
 * decompressData - Transforma llaves cortas en largas usando QR_MAP
 */
function decompressData(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(decompressData);

    // Mapa inverso para descompresión
    const reverseMap = {};
    for (const key in QR_MAP) reverseMap[QR_MAP[key]] = key;

    const decompressed = {};
    for (const key in obj) {
        const longKey = reverseMap[key] || key;
        let value = obj[key];

        // Descomprimir el valor si es la acción
        if (longKey === 'action') value = reverseMap[value] || value;
        // Recursivo para 'data' o 'items'
        else if (typeof value === 'object' && value !== null) value = decompressData(value);

        decompressed[longKey] = value;
    }
    return decompressed;
}
// PostgREST corta en silencio a 1000 filas si no se pide rango explícito --
// con la base ya superando esa cifra en `students`, varias consultas
// agregadas (dashboard, salud por establecimiento, exportaciones) venían
// devolviendo datos incompletos sin ningún error visible. `buildQuery`
// recibe el cliente supabase y debe devolver una query nueva SIN .range()
// (se le agrega acá) -- se le vuelve a llamar en cada página porque una
// query de Supabase no se puede reutilizar/clonar tras ejecutarse.
async function fetchAllRows(buildQuery, pageSize = 1000) {
  let rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
window.fetchAllRows = fetchAllRows;

// Convierte "3ro Básico"/"4to Primaria"/"2do Diversificado" en un rango
// numérico comparable (Primaria 1-6, Básico 7-9, Diversificado 10-12) --
// usado para filtrar contenido (temas de duelos/práctica) por qué tan
// avanzado es, sin tener que mantener listas de grados a mano.
const GRADE_ORDINALS = { '1ro': 1, '2do': 2, '3ro': 3, '4to': 4, '5to': 5, '6to': 6 };
function getGradeRank(gradeText) {
  if (!gradeText) return 0;
  const parts = String(gradeText).trim().toLowerCase().split(/\s+/);
  const ord = GRADE_ORDINALS[parts[0]] || 0;
  const level = parts[1] || '';
  if (level.startsWith('prim')) return ord;
  if (level.startsWith('bás') || level.startsWith('bas')) return 6 + ord;
  if (level.startsWith('div')) return 9 + ord;
  return ord;
}
window.getGradeRank = getGradeRank;

// Secuencia canónica de grados (usada para "Promover Ciclo Escolar") --
// devuelve el siguiente grado exacto, o null si ya es el último (6to
// Diversificado), lo que indica que ese alumno egresa en vez de promover.
const GRADE_SEQUENCE = [
  '1ro Primaria', '2do Primaria', '3ro Primaria', '4to Primaria', '5to Primaria', '6to Primaria',
  '1ro Básico', '2do Básico', '3ro Básico',
  '4to Diversificado', '5to Diversificado', '6to Diversificado',
];
function getNextGrade(gradeText) {
  const idx = GRADE_SEQUENCE.findIndex(g => g.toLowerCase() === String(gradeText || '').trim().toLowerCase());
  if (idx === -1 || idx === GRADE_SEQUENCE.length - 1) return null;
  return GRADE_SEQUENCE[idx + 1];
}
window.getNextGrade = getNextGrade;

function getNivelFromGrade(gradeText) {
  const rank = getGradeRank(gradeText);
  if (rank <= 6) return 'primaria';
  if (rank <= 9) return 'basico';
  return 'diversificado';
}
window.getNivelFromGrade = getNivelFromGrade;

// Áreas curriculares oficiales del CNB (Currículo Nacional Base, MINEDUC)
// por nivel -- necesarias para que el Cuadro de Resultados Finales /
// Certificado de Estudios tenga las columnas que el MINEDUC exige (no
// nombres de curso libres que pone el docente, ej. "mBlock").
const CNB_AREAS_BY_NIVEL = {
  primaria: [
    'Comunicación y Lenguaje L1', 'Comunicación y Lenguaje L2', 'Matemáticas',
    'Medio Social y Natural', 'Ciencias Naturales', 'Ciencias Sociales',
    'Formación Ciudadana', 'Expresión Artística', 'Educación Física',
    'Productividad y Desarrollo', 'Tecnologías del Aprendizaje y la Comunicación',
  ],
  basico: [
    'Comunicación y Lenguaje L1 (Idioma Español)', 'Comunicación y Lenguaje L2 (Idioma Extranjero)',
    'Matemática', 'Ciencias Naturales', 'Ciencias Sociales', 'Formación Ciudadana',
    'Expresión Artística', 'Educación Física', 'Emprendimiento para la Productividad',
    'Tecnologías del Aprendizaje y la Comunicación',
  ],
  diversificado: [
    'Idioma Español', 'Idioma Extranjero', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales',
    'Filosofía', 'Formación Ciudadana', 'Expresión Artística', 'Educación Física',
    'Curso Técnico / Especialidad', 'Seminario', 'Práctica Supervisada',
  ],
};
window.getCnbAreasForGrade = function getCnbAreasForGrade(gradeText) {
  return CNB_AREAS_BY_NIVEL[getNivelFromGrade(gradeText)] || CNB_AREAS_BY_NIVEL.basico;
};

// Traba simple para no disparar varias generaciones de IA en paralelo --
// varios alumnos (o el mismo, clickeando rápido en Práctica Solo) pidiendo
// quizzes a la vez agotaba el límite de tokens por minuto de la cuenta de
// Groq compartida, y las respuestas truncadas rompían el parseo de JSON.
window.aiGenerationLock = {
  active: false,
  tryAcquire() {
    if (this.active) {
      if (typeof window.showToast === 'function') {
        window.showToast('<i class="fas fa-hourglass-half"></i> Ya hay una generación en curso -- esperá un momento', 'info');
      }
      return false;
    }
    this.active = true;
    return true;
  },
  release() { this.active = false; },
};

// Compatibilidad Legacy
window.syncSystemConfig = syncSystemConfig;
window.saveSystemConfig = saveSystemConfig;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.debounce = debounce;
window.sanitizeInput = sanitizeInput;
window.sanitizeAttr = sanitizeAttr;
window.showToast = showToast;
window.getStatusBadge = getStatusBadge;
window.fetchWithCache = fetchWithCache;
window.compressData = compressData;
window.decompressData = decompressData;
