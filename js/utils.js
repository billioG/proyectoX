// ================================================
// UTILS.JS - FUNCIONES COMPARTIDAS (Versión Clásica)
// ================================================

import { createQueryCache, createCoalescer } from './query-cache.js';
import { safeUrl } from './safe-html.js';
import { friendlyErrorText } from './help-messages.js'; // también define window.friendlyError, window.validateProjectForm y window.openHelp (docs/soporte/)

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

// Errores técnicos (Postgres/Supabase/red) -> mensaje claro: la tabla y friendlyErrorText viven en js/help-messages.js (una sola fuente).
export { friendlyErrorText };

// Algunos mensajes vienen de funciones de la base de datos escritas con voseo
// ("No tenés suficientes gemas"); la app habla de tú. Se convierten al mostrarlos
// para no tener que volver a correr esas migraciones.
const VOSEO_SERVER = { 'tenés': 'tienes', 'Tenés': 'Tienes', 'podés': 'puedes', 'Podés': 'Puedes', 'querés': 'quieres', 'necesitás': 'necesitas', 'sos': 'eres' };
const VOSEO_RE = /(^|[^\p{L}])(tenés|Tenés|podés|Podés|querés|necesitás|sos)(?![\p{L}])/gu;
export function deVoseo(text) {
    return String(text ?? '').replace(VOSEO_RE, (m, pre, w) => pre + VOSEO_SERVER[w]);
}
window.deVoseo = deVoseo;

export function showToast(message, type = 'default') {
    message = deVoseo(message);
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    if (type === 'error') {
        const plain = String(message).replace(/<[^>]*>/g, ' ');
        const friendly = friendlyErrorText(plain);
        if (friendly) {
            console.warn('Error original:', plain.replace(/\s+/g, ' ').trim());
            message = `<i class="fas fa-circle-xmark"></i> ${friendly}`;
        }
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} show`;
    toast.innerHTML = message;

    container.appendChild(toast);

    // Los errores llevan más texto y hay que poder leerlos con calma.
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, type === 'error' ? 6000 : 3000);
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
// Caché de consultas (js/query-cache.js): muestra lo guardado en el dispositivo y pide lo nuevo al servidor; con { ttlMs } usa lo guardado SIN
// consultar mientras sea reciente, y las pedidas idénticas a la vez comparten una sola consulta. Sin opciones se comporta como siempre.
const _queryCache = createQueryCache({
    readEntry: async (key) => (typeof _syncManager !== 'undefined' && _syncManager.getCacheEntry ? _syncManager.getCacheEntry(key) : null),
    writeEntry: async (key, data) => { if (typeof _syncManager !== 'undefined') await _syncManager.setCache(key, data); },
    warn: (...args) => console.warn('⚠️', ...args),
});
export async function fetchWithCache(cacheKey, fetchPromise, onUpdate = null, opts = {}) {
    return _queryCache.fetchWithCache(cacheKey, fetchPromise, onUpdate, opts);
}
// Después de guardar algo que cambia datos cacheados con ttlMs: la próxima lectura va al servidor. Acepta una clave o un prefijo.
export function invalidateCache(keyOrPrefix) { return _queryCache.invalidate(keyOrPrefix); }
window.invalidateCache = invalidateCache;
// window.coalesce(clave, fn, { minGapMs, force }): corre fn una vez aunque lo pidan varios a la vez o muy seguido (ver js/query-cache.js).
const _coalescer = createCoalescer();
window.coalesce = (key, fn, opts) => _coalescer.run(key, fn, opts);

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
// false para clubes/extraescolares (grados fuera del pensum).
window.isRegularGrade = (gradeText) => GRADE_SEQUENCE.some(g => g.toLowerCase() === String(gradeText || '').trim().toLowerCase());

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

// Hosts permitidos para un link de recurso de lección (video/PDF/imagen/
// Tinkercad) -- se embebe en iframe o se abre directo en la pestaña del
// alumno, así que sin esto una cuenta docente comprometida (o un typo)
// podía apuntar a cualquier sitio, incluido uno de phishing disfrazado de
// material de clase. Mismo allowlist server-side en migrations/
// content-url-allowlist.sql -- esto es solo la primera línea de defensa
// (mejor UX, avisa antes de guardar); lo que de verdad bloquea es el
// trigger en la base de datos.
const ALLOWED_CONTENT_HOSTS = [
  'vyptkxudkmlpyfosppzh.supabase.co',
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be',
  'drive.google.com',
  'tinkercad.com', 'www.tinkercad.com',
];
window.isAllowedContentHost = function isAllowedContentHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOWED_CONTENT_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
};

// "Ya jugué este duelo" vivía solo en un Set en memoria -- al recargar se
// perdía y volvía a aparecer "Jugar", que terminaba en error "Ya jugaste".
// Se reconstruye desde las filas propias en la tabla de resultados.
// Vía RPC (get_my_played_duel_ids): leer la tabla de resultados directo
// podía fallar en silencio por permisos por columna y dejaba "Jugar"
// visible aunque ya hubieras jugado.
window.hydratePlayedSet = async function hydratePlayedSet(resultsTable, duels, setName) {
  window[setName] = window[setName] || new Set();
  // Cada recarga de una sección de juego puede venir de un duelo que se
  // acaba de cerrar en el servidor: pone al día las gemas en pantalla.
  window.refreshMyWalletSoon?.();
  const activeIds = (duels || []).filter(d => d.status === 'active').map(d => d.id);
  if (!activeIds.length || !window.currentUser) return;
  const { data, error } = await window._supabase.rpc('get_my_played_duel_ids', { p_ids: activeIds });
  if (!error) {
    (data || []).forEach(id => window[setName].add(id));
    return;
  }
  const { data: rows } = await window._supabase.from(resultsTable)
    .select('duel_id').in('duel_id', activeIds).eq('student_id', window.currentUser.id);
  (rows || []).forEach(r => window[setName].add(r.duel_id));
};

// Traba simple para no disparar varias generaciones de IA en paralelo --
// varios alumnos (o el mismo, clickeando rápido) pidiendo palabras/quizzes
// a la vez agotaba el límite de tokens por minuto de la cuenta de Groq
// compartida, y las respuestas truncadas rompían el parseo de JSON.
window.aiGenerationLock = {
  active: false,
  tryAcquire() {
    if (this.active) {
      if (typeof window.showToast === 'function') {
        window.showToast('<i class="fas fa-hourglass-half"></i> Ya hay una generación en curso -- espera un momento', 'info');
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
window.safeUrl = safeUrl;
window.showToast = showToast;
window.friendlyErrorText = friendlyErrorText;
window.getStatusBadge = getStatusBadge;
window.fetchWithCache = fetchWithCache;

// El embed students(...) de un proyecto llega null cuando el autor es de otra
// clase (la RLS de students solo deja ver a uno mismo/compañeros/personal).
// Esto completa nombre/curso/escuela con una función que devuelve solo esos
// campos de autores de proyectos visibles (migrations/fix-cross-school-public-projects.sql).
// Columnas de students que la app puede leer directo. password_generated (la
// contraseña real del alumno), cui, codigo_personal, pin_* y qr_* NO se leen
// con select: solo el admin o el docente asignado a esa clase, con
// fetchStudentSecrets() (migrations/security-hardening-2026-10.sql).
export const STUDENT_COLS = 'id, full_name, username, email, school_code, grade, section, profile_photo_url, role, created_at, birth_date, gender, xp, gems, streak, last_login, streak_freeze, daily_chest_last_claimed, gems_earned_total, has_gold_frame, has_mascot_glasses, status, companion_equipped, companion_species, season_id, season_xp, league_tier, league_week, league_last_result, duel_win_streak, best_duel_win_streak, created_by, pin_updated_at';
window.STUDENT_COLS = STUDENT_COLS;

// La función del servidor todavía no existe si no se corrió el SQL: en ese
// caso se leen las columnas como antes, para no romper nada en la transición.
const _rpcMissing = (error) => error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || ''));

// Map id -> { password_generated, cui, codigo_personal } de los alumnos que el
// usuario puede administrar. Los demás no vienen en el mapa.
window.fetchStudentSecrets = async function fetchStudentSecrets(ids) {
    const map = new Map();
    const list = [...new Set((ids || []).filter(Boolean))];
    for (let i = 0; i < list.length; i += 400) {
        const chunk = list.slice(i, i + 400);
        let { data, error } = await window._supabase.rpc('staff_student_secrets', { p_ids: chunk });
        if (_rpcMissing(error)) {
            ({ data, error } = await window._supabase.from('students').select('id, password_generated, cui, codigo_personal').in('id', chunk));
        }
        if (error) { console.warn('No se pudieron leer los datos privados de los alumnos:', error.message); continue; }
        (data || []).forEach(r => map.set(r.id, { password_generated: r.password_generated, cui: r.cui, codigo_personal: r.codigo_personal }));
    }
    return map;
};

// Contraseñas de alumnos para mostrar o imprimir (solo admin o docente asignado). Ya no existen legibles en la base
// (migrations/student-password-hash.sql): la Edge Function staff-student-passwords las descifra con una llave que solo vive en el
// servidor y solo entrega las de alumnos que quien llama puede administrar. Devuelve Map id -> contraseña (texto) o null.
// Lanza un Error con un mensaje claro si no se pudo (sin sesión, función sin configurar, etc.).
window.fetchStudentPasswords = async function fetchStudentPasswords(ids) {
    const map = new Map();
    const list = [...new Set((ids || []).filter(Boolean))];
    if (!list.length) return map;
    const { data: { session } } = await window._supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Sesión no disponible');
    for (let i = 0; i < list.length; i += 200) {
        const chunk = list.slice(i, i + 200);
        const res = await fetch(`${window.SUPABASE_URL}/functions/v1/staff-student-passwords`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ action: 'reveal', ids: chunk }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'No se pudieron obtener las contraseñas');
        Object.entries(body.passwords || {}).forEach(([id, pw]) => map.set(id, pw));
    }
    return map;
};

// Completa en cada fila password_generated/cui/codigo_personal (si el usuario
// tiene permiso) y marca _secretsOk para saber si esos datos son reales.
window.mergeStudentSecrets = async function mergeStudentSecrets(rows) {
    if (!rows || !rows.length) return rows;
    const map = await window.fetchStudentSecrets(rows.map(r => r.id));
    rows.forEach(r => { const sec = map.get(r.id); if (sec) Object.assign(r, sec, { _secretsOk: true }); });
    return rows;
};

// Cuáles de estos CUI ya están registrados (para no importar dos veces al
// mismo alumno), sin poder leer el CUI de nadie.
window.fetchExistingCuis = async function fetchExistingCuis(cuis) {
    const found = new Set();
    const list = [...new Set((cuis || []).filter(Boolean).map(String))];
    for (let i = 0; i < list.length; i += 400) {
        const chunk = list.slice(i, i + 400);
        let { data, error } = await window._supabase.rpc('staff_existing_cuis', { p_cuis: chunk });
        if (_rpcMissing(error)) {
            ({ data, error } = await window._supabase.from('students').select('cui').in('cui', chunk));
            data = (data || []).map(r => r.cui);
        }
        if (error) { console.warn('No se pudo verificar CUI duplicados:', error.message); continue; }
        (data || []).forEach(c => found.add(typeof c === 'string' ? c : (c?.staff_existing_cuis ?? c?.cui)));
    }
    return found;
};

window.attachProjectAuthors = async function attachProjectAuthors(projects) {
    const missing = (projects || []).filter(p => !p.students && p.user_id);
    if (!missing.length) return projects;
    const ids = [...new Set(missing.map(p => p.user_id))];
    const { data, error } = await window._supabase.rpc('public_project_authors', { p_user_ids: ids });
    if (error) {
        console.warn('No se pudieron completar los autores de proyectos:', error.message);
        return projects;
    }
    const byId = new Map((data || []).map(a => [a.id, {
        id: a.id, full_name: a.full_name, school_code: a.school_code, grade: a.grade,
        section: a.section, profile_photo_url: a.profile_photo_url,
        schools: { code: a.school_code, name: a.school_name }
    }]));
    missing.forEach(p => { p.students = byId.get(p.user_id) || null; });
    return projects;
};
window.compressData = compressData;
window.decompressData = decompressData;
