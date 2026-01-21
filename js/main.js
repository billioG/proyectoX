// ================================================
// NAVEGACIÓN Y UTILIDADES - REPARADO
// ================================================

let sidebarActive = false;

window.addEventListener('load', () => {
    initTheme();

    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }
});

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        updateThemeIcon(true);
    } else {
        updateThemeIcon(false);
    }
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
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

    // Cargar contenido según la vista
    loadViewContent(view);

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
            if (userRole === 'admin' && typeof loadStudents === 'function') loadStudents();
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
        case 'profile':
            if (typeof loadProfile === 'function') loadProfile();
            break;
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
