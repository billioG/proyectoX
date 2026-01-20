// ================================================
// NAVEGACIÓN Y UTILIDADES - PARTE 1
// ================================================

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
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcon(isDark);

  // Feedback táctil si está disponible
  if (navigator.vibrate) navigator.vibrate(50);
}

function updateThemeIcon(isDark) {
  const icon = document.querySelector('#theme-toggle i');
  if (icon) {
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
  }
}

let sidebarActive = false;

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.querySelector('.sidebar-toggle');

  if (!sidebar) return;

  sidebarActive = !sidebarActive;

  if (sidebarActive) {
    sidebar.classList.add('active');
    if (toggle) toggle.innerHTML = '<i class="fas fa-times"></i>';
  } else {
    sidebar.classList.remove('active');
    if (toggle) toggle.innerHTML = '<i class="fas fa-bars"></i>';
  }
}

function nav(view) {
  console.log('📍 Navegando a:', view);

  const mainContent = document.querySelector('.main-content');
  if (!mainContent) {
    console.error('❌ main-content no encontrado, esperando...');
    setTimeout(() => nav(view), 100);
    return;
  }

  // Ocultar todas las vistas
  const allViews = document.querySelectorAll('.view-section');
  allViews.forEach(v => v.style.display = 'none');

  // Remover clase active de todos los nav-items
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => item.classList.remove('active'));

  // Activar el nav-item correspondiente
  navItems.forEach(item => {
    if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(`nav('${view}')`)) {
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

  // Si es docente, refrescar contador de notificaciones en cada navegación
  if (typeof userRole !== 'undefined' && userRole === 'docente' && typeof loadTeacherNotifications === 'function') {
    loadTeacherNotifications();
  }

  console.log(`✅ Navegación completada: ${view}`);
}
// ================================================
// PARTE 2 CARGAR CONTENIDO POR VISTA - CORREGIDO
// ================================================

function loadViewContent(view) {
  switch (view) {
    case 'feed':
      if (typeof loadFeed === 'function') {
        loadFeed();
      }
      break;

    case 'upload':
      if (userRole === 'estudiante' && typeof loadGroupsForUpload === 'function') {
        loadGroupsForUpload();
      }
      break;

    case 'schools':
      if ((userRole === 'admin' || userRole === 'docente') && typeof loadSchools === 'function') {
        loadSchools();
      }
      break;

    case 'students':
      if ((userRole === 'admin' || userRole === 'docente') && typeof loadStudents === 'function') {
        loadStudents();
      }
      break;

    case 'teachers':
      if (userRole === 'admin' && typeof loadTeachers === 'function') {
        loadTeachers();
      }
      break;

    case 'groups':
      if (typeof loadGroups === 'function') {
        loadGroups();
      }
      break;

    case 'attendance':
      if ((userRole === 'docente' || userRole === 'admin') && typeof loadAttendance === 'function') {
        loadAttendance();
      }
      break;

    case 'evaluate':
      if ((userRole === 'docente' || userRole === 'admin') && typeof loadEvaluationProjects === 'function') {
        loadEvaluationProjects();
      }
      break;

    case 'ranking':
      if (typeof loadRanking === 'function') {
        loadRanking();
      }
      break;

    case 'profile':
      if (typeof loadProfile === 'function') {
        loadProfile();
      }
      break;

    default:
      console.warn(`⚠️ Vista desconocida: ${view}`);
  }
}

// ================================================
// PARTE 3: TOAST Y FUNCIONES AUXILIARES
// ================================================

function showToast(message, type = 'default') {
  let container = document.getElementById('toast-container');

  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        container.removeChild(toast);
      }
    }, 300);
  }, 4000);
}

// Cerrar modales al hacer clic fuera
document.addEventListener('click', function (e) {
  if (e.target.classList.contains('modal')) {
    e.target.remove();
  }
});

// Cerrar sidebar en móvil al hacer clic fuera
document.addEventListener('click', function (e) {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.querySelector('.sidebar-toggle');

  if (sidebar && toggle && window.innerWidth <= 768) {
    if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
      sidebar.classList.remove('active');
      if (toggle) toggle.innerHTML = '<i class="fas fa-bars"></i>';
      sidebarActive = false;
    }
  }
});

// Funciones auxiliares globales
function sanitizeInput(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return 'Sin fecha';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(dateString) {
  if (!dateString) return 'Sin fecha';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-GT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().split('T')[0];
  const finalFilename = filename.replace('.csv', `_${timestamp}.csv`);

  link.setAttribute('href', url);
  link.setAttribute('download', finalFilename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

console.log('✅ main.js cargado correctamente');
