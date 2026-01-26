// ================================================
// UTILS.JS - FUNCIONES COMPARTIDAS (Versión Clásica)
// ================================================

// GLOBAL SYSTEM CONFIGURATION
const SYSTEM_CONFIG = {
    projectsPerBimester: parseInt(localStorage.getItem('sys_projects_per_bimestre')) || 4,
    studentsPerTeam: 3.5
};

async function syncSystemConfig() {
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

async function saveSystemConfig(projects) {
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

function formatCurrency(amount) {
    return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(amount);
}

function formatDate(dateString) {
    if (!dateString) return 'S/F';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Fecha inválida';
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('es-GT', options);
    } catch (e) { return 'S/F'; }
}

function formatDateTime(dateString) {
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

function debounce(func, wait) {
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

function sanitizeInput(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type = 'default') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
        // Fallback simple si no hay sistema de toast
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

function getStatusBadge(status) {
    const statuses = {
        'active': 'status-active',
        'pending': 'status-pending',
        'inactive': 'status-inactive',
        'approved': 'status-active',
        'rejected': 'status-inactive'
    };
    return statuses[status] || 'status-pending';
}
