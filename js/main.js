// main.js - Módulo Principal (ES Modules Edition)
import { showToast } from './utils.js';

// Variables de UI
let sidebarActive = false;

// Módulo Loader para Lazy Loading
const LOADED_MODULES = new Set();
const MODULE_MAP = {
    'admin-dashboard': ['js/admin-dashboard.js', 'js/admin-waivers.js', 'js/admin-reports.js', 'js/team-performance-widget.js'],
    'admin-teacher-performance': ['js/admin-performance.js'],
    'admin-success': ['js/admin-success.js', 'js/team-performance-widget.js', 'js/kpi-engine.js'],
    'schools': ['js/schools.js'],
    'students': ['js/students.js', 'js/pdf-processor.js'],
    'teachers': ['js/teachers.js'],
    'groups': ['js/groups.js'],
    'attendance': ['js/attendance.js', 'js/data/challenges.js'],
    'admin-attendance-report': ['js/admin-attendance.js', 'js/attendance-summary-view.js'],
    'admin-eval-report': ['js/admin-evaluations.js'],
    'evaluate': ['js/evaluation.js', 'js/evaluation-modals.js', 'js/evaluation-notifications.js'],
    'ranking': ['js/ranking.js'],
    'profile': ['js/profile.js', 'js/badges.js', 'js/kpi-engine.js', 'js/gamification.js', 'js/profile-modals.js', 'js/feed-ui.js', 'js/project-modals.js', 'js/reports.js', 'js/certificates.js'],
    'feed': ['js/projects.js', 'js/gamification.js', 'js/kpi-engine.js', 'js/feed-ui.js', 'js/project-modals.js', 'js/profile-modals.js', 'js/reports.js', 'js/certificates.js'],
    'upload': ['js/project-modals.js', 'js/groups.js'],
    'bonus-system': ['js/bonus-system.js', 'js/certificates.js']
};

export async function loadModule(name) {
    if (!MODULE_MAP[name]) return;

    const scripts = MODULE_MAP[name];

    // Migración a import() dinámico
    const loaders = scripts.map(async (src) => {
        if (LOADED_MODULES.has(src)) return;

        try {
            // Nota: Algunos archivos aún no son módulos, por lo que importirlos 
            // puede ejecutarlos pero no retornar nada útil si no tienen export.
            // Para archivos que no son módulos, seguimos usando inyección si es necesario,
            // pero probaremos import() primero ya que es más limpio.
            // Agregamos ./ para rutas relativas correctas en ESM
            const path = src.startsWith('js/') ? `./${src.split('js/')[1]}` : src;
            await import(path);
            LOADED_MODULES.add(src);
        } catch (e) {
            console.warn(`Fallback de carga para ${src}. Probando inyección tradicional...`);
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => {
                    LOADED_MODULES.add(src);
                    resolve();
                };
                script.onerror = () => reject(new Error(`Error al cargar el módulo: ${src}`));
                document.body.appendChild(script);
            });
        }
    });

    try {
        await Promise.all(loaders);
    } catch (err) {
        console.error(err);
        showToast('❌ Error al cargar componentes necesarios', 'error');
    }
}

window.addEventListener('load', () => {
    initTheme();

    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }
});

export function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const isDark = savedTheme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    updateThemeIcon(isDark);
}
window.initTheme = initTheme;

export function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}
window.toggleTheme = toggleTheme;

export function updateThemeIcon(isDark) {
    const icon = document.querySelector('#theme-toggle i');
    if (icon) {
        icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }
}
window.updateThemeIcon = updateThemeIcon;


export function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    // Buscamos por ID (nuevo botón) o por clase (antiguo botón, fallback)
    const toggle = document.getElementById('mobile-menu-btn') || document.querySelector('.sidebar-toggle');
    sidebarActive = !sidebarActive;

    if (sidebarActive) {
        sidebar.classList.add('active');
        if (toggle) toggle.innerHTML = '<i class="fas fa-times"></i>';
    } else {
        sidebar.classList.remove('active');
        if (toggle) toggle.innerHTML = '<i class="fas fa-bars"></i>';
    }
}
window.toggleSidebar = toggleSidebar;

export function nav(view) {
    console.log('📍 Navegando a:', view);

    // Ocultar todas las vistas
    const allViews = document.querySelectorAll('.view-section');
    allViews.forEach(v => v.style.display = 'none');

    // Desactivar todos los items del menú
    const allNavItems = document.querySelectorAll('.nav-item');
    allNavItems.forEach(item => item.classList.remove('active'));

    // Activar item actual
    allNavItems.forEach(item => {
        if (item.getAttribute('onclick')?.includes(`'${view}'`)) {
            item.classList.add('active');
        }
    });

    // Mostrar vista seleccionada
    const targetView = document.getElementById(`view-${view}`);
    if (targetView) {
        targetView.style.display = 'block';
    } else {
        console.error(`❌ Vista view-${view} no encontrada`);
        return;
    }

    // Cerrar sidebar en móvil después de navegar
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('mobile-menu-btn') || document.querySelector('.sidebar-toggle');

        if (sidebar) sidebar.classList.remove('active');
        if (toggle) toggle.innerHTML = '<i class="fas fa-bars"></i>';
        sidebarActive = false;
    }

    // Limpiar modales abiertos al navegar (pero NO remover el sidebar o el header)
    document.querySelectorAll('.fixed:not(#sidebar):not(#header), .modal').forEach(m => m.remove());

    // Cargar módulos necesarios antes de ejecutar contenido
    loadModule(view).then(() => {
        loadViewContent(view);
    });

    console.log(`✅ Navegación completada: ${view}`);
}
window.nav = nav;

export function loadViewContent(view) {
    const userRole = window.userRole;
    switch (view) {
        case 'admin-dashboard':
            if (userRole === 'admin' && typeof window.loadAdminDashboard === 'function') window.loadAdminDashboard();
            break;
        case 'admin-teacher-performance':
            if (userRole === 'admin' && typeof window.loadAdminTeacherPerformance === 'function') window.loadAdminTeacherPerformance();
            break;
        case 'admin-success':
            if (userRole === 'admin' && typeof window.loadAdminSuccessHub === 'function') window.loadAdminSuccessHub();
            break;
        case 'admin-rocks':
            if (userRole === 'admin' && typeof window.loadAdminRocksManagement === 'function') window.loadAdminRocksManagement();
            break;
        case 'feed':
            if (typeof window.loadFeed === 'function') window.loadFeed();
            break;
        case 'schools':
            if (userRole === 'admin' && typeof window.loadSchools === 'function') window.loadSchools();
            break;
        case 'students':
            if ((userRole === 'admin' || userRole === 'docente') && typeof window.loadStudents === 'function') window.loadStudents();
            break;
        case 'teachers':
            if (userRole === 'admin' && typeof window.loadTeachers === 'function') window.loadTeachers();
            break;
        case 'groups':
            if (typeof window.loadGroups === 'function') window.loadGroups();
            break;
        case 'attendance':
            if (typeof window.loadAttendance === 'function') window.loadAttendance();
            break;
        case 'admin-attendance-report':
            if (userRole === 'admin' && typeof window.loadAdminAttendanceReport === 'function') window.loadAdminAttendanceReport();
            break;
        case 'admin-eval-report':
            if (userRole === 'admin' && typeof window.loadAdminEvalReport === 'function') window.loadAdminEvalReport();
            break;
        case 'evaluate':
            if (typeof window.loadEvaluationProjects === 'function') window.loadEvaluationProjects();
            break;
        case 'ranking':
            if (typeof window.loadRanking === 'function') window.loadRanking();
            break;
        case 'upload':
            if (typeof window.initUploadView === 'function') window.initUploadView();
            break;
        case 'bonus-system':
            if (typeof window.loadBonusSystem === 'function') window.loadBonusSystem();
            break;
        case 'profile':
            if (typeof window.loadProfile === 'function') window.loadProfile();
            if (typeof window.initGamification === 'function') window.initGamification();
            break;
    }

    // Gamification check on feed too
    if (view === 'feed' && typeof window.initGamification === 'function') {
        window.initGamification();
    }
}
window.loadViewContent = loadViewContent;
window.loadModule = loadModule;

// Exportar showToast para que otros módulos lo usen
export { showToast };
window.showToast = showToast;

console.log('✅ main.js reparado y cargado correctamente');
