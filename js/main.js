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

async function loadModule(name) {
    if (!MODULE_MAP[name]) return;

    const scripts = MODULE_MAP[name];
    const loaders = scripts.map(src => {
        if (LOADED_MODULES.has(src)) return Promise.resolve();

        // Verificar si ya está en el DOM por el index.html original (mientras migramos)
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            LOADED_MODULES.add(src);
            return Promise.resolve();
        }

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

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const isDark = savedTheme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    updateThemeIcon(isDark);
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    const icon = document.querySelector('#theme-toggle i');
    if (icon) {
        icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.querySelector('.sidebar-toggle');
    sidebarActive = !sidebarActive;

    if (sidebarActive) {
        sidebar.classList.add('active');
        toggle.innerHTML = '<i class="fas fa-times"></i>';
    } else {
        sidebar.classList.remove('active');
        toggle.innerHTML = '<i class="fas fa-bars"></i>';
    }
}

function nav(view) {
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
        const toggle = document.querySelector('.sidebar-toggle');
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

function loadViewContent(view) {
    switch (view) {
        case 'admin-dashboard':
            if (userRole === 'admin' && typeof loadAdminDashboard === 'function') loadAdminDashboard();
            break;
        case 'admin-teacher-performance':
            if (userRole === 'admin' && typeof loadAdminTeacherPerformance === 'function') loadAdminTeacherPerformance();
            break;
        case 'admin-success':
            if (userRole === 'admin' && typeof loadAdminSuccessHub === 'function') loadAdminSuccessHub();
            break;
        case 'feed':
            if (typeof loadFeed === 'function') loadFeed();
            break;
        case 'schools':
            if (userRole === 'admin' && typeof loadSchools === 'function') loadSchools();
            break;
        case 'students':
            if ((userRole === 'admin' || userRole === 'docente') && typeof loadStudents === 'function') loadStudents();
            break;
        case 'teachers':
            if (userRole === 'admin' && typeof loadTeachers === 'function') loadTeachers();
            break;
        case 'groups':
            if (typeof loadGroups === 'function') loadGroups();
            break;
        case 'attendance':
            if (typeof loadAttendance === 'function') loadAttendance();
            break;
        case 'admin-attendance-report':
            if (userRole === 'admin' && typeof loadAdminAttendanceReport === 'function') loadAdminAttendanceReport();
            break;
        case 'admin-eval-report':
            if (userRole === 'admin' && typeof loadAdminEvalReport === 'function') loadAdminEvalReport();
            break;
        case 'evaluate':
            if (typeof loadEvaluationProjects === 'function') loadEvaluationProjects();
            break;
        case 'ranking':
            if (typeof loadRanking === 'function') loadRanking();
            break;
        case 'upload':
            if (typeof initUploadView === 'function') initUploadView();
            break;
        case 'bonus-system':
            if (typeof loadBonusSystem === 'function') loadBonusSystem();
            break;
        case 'profile':
            if (typeof loadProfile === 'function') loadProfile();
            if (typeof initGamification === 'function') initGamification();
            break;
    }

    // Gamification check on feed too
    if (view === 'feed' && typeof initGamification === 'function') {
        initGamification();
    }
}

// ================================================
// TOAST NOTIFICATIONS
// ================================================

function showToast(message, type = 'default') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} show`; // Añadir show por defecto para simplificar
    toast.innerHTML = message;

    container.appendChild(toast);

    // Eliminar después de 3 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

console.log('✅ main.js reparado y cargado correctamente');
