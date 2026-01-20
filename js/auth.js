// ================================================
// AUTENTICACIÓN Y GESTIÓN DE SESIÓN - CORREGIDO
// ================================================

document.addEventListener('DOMContentLoaded', async function () {
  console.log('🔄 Inicializando autenticación...');

  const { data: { session } } = await _supabase.auth.getSession();

  if (session) {
    console.log('✅ Sesión activa encontrada');
    await handleSuccessfulLogin(session.user);
  } else {
    console.log('📝 No hay sesión activa, mostrando login');
    showLoginScreen();
  }

  const loginBtn = document.getElementById('btn-login');
  if (loginBtn) {
    console.log('✅ Botón de login encontrado');
    loginBtn.addEventListener('click', handleLogin);
  } else {
    console.error('❌ Botón btn-login NO encontrado');
  }

  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');

  if (usernameInput) {
    usernameInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') handleLogin();
    });
  }

  if (passwordInput) {
    passwordInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') handleLogin();
    });
  }

  _supabase.auth.onAuthStateChange((event, session) => {
    console.log('🔔 Evento de auth:', event);
    if (event === 'SIGNED_OUT') {
      showLoginScreen();
    }
  });
});

function showLoginScreen() {
  document.getElementById('auth-container').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
}

function showAppScreen() {
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('app-container').style.display = 'block';
}

async function handleLogin() {
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const loginBtn = document.getElementById('btn-login');

  const username = usernameInput?.value.trim();
  const password = passwordInput?.value.trim();

  if (!username || !password) {
    showToast('❌ Completa todos los campos', 'error');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

  try {
    let email = username;

    if (!username.includes('@')) {
      // 1. Intentar buscar en estudiantes
      const { data: student } = await _supabase
        .from('students')
        .select('email')
        .eq('username', username)
        .maybeSingle();

      if (student) {
        email = student.email;
      } else {
        // 2. Intentar buscar en docentes/admins
        const { data: teacher } = await _supabase
          .from('teachers')
          .select('email')
          .eq('username', username)
          .maybeSingle();

        if (teacher) {
          email = teacher.email;
        } else {
          throw new Error('Usuario no encontrado');
        }
      }
    }

    const { data, error } = await _supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    if (!data.user) {
      throw new Error('Error en la autenticación');
    }

    console.log('✅ Login exitoso');
    await handleSuccessfulLogin(data.user);

  } catch (err) {
    console.error('❌ Error en login:', err);
    showToast('❌ Usuario o contraseña incorrectos', 'error');
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
  }
}

async function handleSuccessfulLogin(user) {
  currentUser = user;

  try {
    const role = user.user_metadata?.role || 'estudiante';
    userRole = role;

    console.log('👤 Usuario:', user.email);
    console.log('🎭 Rol:', userRole);

    // Añadir clase de rol al body para control de CSS
    document.body.classList.remove('role-estudiante', 'role-docente', 'role-admin');
    document.body.classList.add(`role-${userRole}`);

    if (userRole === 'estudiante') {
      const { data, error } = await _supabase
        .from('students')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      userData = data;
    } else if (userRole === 'docente' || userRole === 'admin') {
      const { data, error } = await _supabase
        .from('teachers')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('⚠️ No se encontró perfil en tabla teachers:', error);
      }
      userData = data;
    }

    // Mostrar app ANTES de navegar
    showAppScreen();
    updateUserInterface(userData);
    setupNavigation();

    // Esperar a que el DOM esté listo
    await new Promise(resolve => setTimeout(resolve, 100));

    // Ahora sí navegar
    nav('feed');

    // Cargar grupos si es estudiante
    if (userRole === 'estudiante') {
      if (typeof loadGroupsForUpload === 'function') await loadGroupsForUpload();
    }

    // Inicializar gamificación (el módulo maneja la lógica por roles)
    if (typeof initGamification === 'function') initGamification();

    // Cargar notificaciones si es docente o admin
    if ((userRole === 'docente' || userRole === 'admin') && typeof loadTeacherNotifications === 'function') {
      await loadTeacherNotifications();
    }

    showToast('✅ Bienvenido/a', 'success');
    console.log('✅ Datos cargados correctamente');

  } catch (err) {
    console.error('❌ Error cargando datos del usuario:', err);
    showToast('❌ Error al cargar datos del usuario', 'error');
    await logout();
  }
}

function updateUserInterface(userData) {
  const userNameElement = document.getElementById('user-name');
  const userAvatarElement = document.getElementById('user-avatar');

  let displayName = 'Usuario';

  if (userData) {
    if (userRole === 'estudiante') {
      displayName = userData.full_name || userData.username || currentUser.email?.split('@')[0];
    } else if (userRole === 'docente' || userRole === 'admin') {
      displayName = userData.full_name || currentUser.email?.split('@')[0] || 'Docente';
    }
  } else {
    // Fallback si no hay registro en tablas (típico de admins puros)
    displayName = currentUser?.email?.split('@')[0] || (userRole === 'admin' ? 'Administrador' : 'Usuario');
  }

  if (userNameElement) {
    userNameElement.textContent = displayName;
  }

  if (userAvatarElement) {
    if (userRole === 'estudiante') {
      userAvatarElement.textContent = '🎓';
    } else if (userRole === 'docente') {
      userAvatarElement.textContent = '👨‍🏫';
    } else {
      userAvatarElement.textContent = '👑';
    }
  }
}

function setupNavigation() {
  document.getElementById('nav-estudiante').style.display = 'none';
  document.getElementById('nav-docente').style.display = 'none';
  document.getElementById('nav-admin').style.display = 'none';

  if (userRole === 'estudiante') {
    document.getElementById('nav-estudiante').style.display = 'block';
  } else if (userRole === 'docente') {
    document.getElementById('nav-docente').style.display = 'block';
  } else if (userRole === 'admin') {
    document.getElementById('nav-admin').style.display = 'block';
  }
}

async function logout() {
  const btn = document.querySelector('.btn-logout');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }

  try {
    console.log('🔄 Cerrando sesión...');

    // 1. Cerrar sesión en Supabase
    await _supabase.auth.signOut();

    // 2. Limpiar estados locales y UI
    currentUser = null;
    userRole = null;
    userData = null;

    // Limpiar elementos de UI para evitar parpadeos de datos anteriores al re-entrar
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) userNameElement.textContent = 'Usuario';

    // Limpiar contenedores principales
    ['feed-container', 'profile-content', 'ranking-container', 'eval-projects-container', 'groups-container', 'attendance-container'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });

    // 3. Mostrar pantalla de login sin recargar
    showLoginScreen();

    showToast('👋 Sesión cerrada correctamente', 'success');

  } catch (err) {
    console.error('Error cerrando sesión:', err);
    showLoginScreen();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Salir';
    }
  }
}

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

console.log('✅ auth.js cargado correctamente');
