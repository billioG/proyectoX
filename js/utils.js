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
// Compatibilidad Legacy
window.syncSystemConfig = syncSystemConfig;
window.saveSystemConfig = saveSystemConfig;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.debounce = debounce;
window.sanitizeInput = sanitizeInput;
window.showToast = showToast;
window.getStatusBadge = getStatusBadge;
window.fetchWithCache = fetchWithCache;
window.compressData = compressData;
window.decompressData = decompressData;
