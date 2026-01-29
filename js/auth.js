import { _supabase, updateAppState } from './config.js';
import { showToast, nav } from './main.js';
import { MOTIVATIONAL_QUOTES } from './data/quotes.js';

/**
 * AUTH - Gestión de autenticación y sesión de usuario (Tailwind Edition)
 */

export async function initAuth() {
  // Intentar recuperar sesión offline primero
  const cachedUser = localStorage.getItem('PX_CACHED_USER');
  const cachedData = localStorage.getItem('PX_CACHED_USER_DATA');
  const cachedRole = localStorage.getItem('PX_CACHED_ROLE');

  const { data: { session } } = await _supabase.auth.getSession();

  if (session) {
    await handleSuccessfulLogin(session.user);
  } else if (cachedUser && cachedData && cachedRole) {
    // Si estamos offline y hay datos en cache, permitir entrada
    console.log('🔌 Modo Offline: Cargando sesión desde caché');
    updateAppState('currentUser', JSON.parse(cachedUser));
    updateAppState('userData', JSON.parse(cachedData));
    updateAppState('userRole', cachedRole);

    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';

    updateHeaderUI();
    setupNavigationUI();
    nav(window.userRole === 'admin' ? 'admin-dashboard' : 'feed');

    if (typeof window.initOnboarding === 'function') {
      window.initOnboarding();
    }

    showToast('📶 Conectado en modo Offline', 'info');
  } else {
    showLoginScreen();
  }

  document.getElementById('btn-login')?.addEventListener('click', handleLogin);
  ['login-username', 'login-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
  });

  _supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      localStorage.removeItem('PX_CACHED_USER');
      localStorage.removeItem('PX_CACHED_USER_DATA');
      localStorage.removeItem('PX_CACHED_ROLE');
      showLoginScreen();
    }
    if (event === 'SIGNED_IN' && session) {
      await handleSuccessfulLogin(session.user);
    }
  });
}
window.initAuth = initAuth;

function showLoginScreen() {
  const authContainer = document.getElementById('auth-container');
  authContainer.style.display = 'flex';
  authContainer.className = "min-h-screen flex flex-col justify-center items-center bg-slate-50 dark:bg-slate-950 px-6 py-12 transition-colors duration-500";

  document.getElementById('app-container').style.display = 'none';
  renderMotivationalQuote();
}

function renderMotivationalQuote() {
  const container = document.querySelector('.login-help');
  if (!container || typeof MOTIVATIONAL_QUOTES === 'undefined') return;
  const quote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
  container.innerHTML = `
    <div class="glass-card p-8 border-l-8 border-primary dark:bg-slate-900/40 mt-12 max-w-lg mx-auto transform hover:-translate-y-1 transition-all duration-300">
      <p class="text-xl italic font-medium text-slate-700 dark:text-slate-300 mb-4 leading-relaxed tracking-tight">"${quote}"</p>
      <div class="flex items-center gap-3">
        <div class="h-1 w-12 bg-primary rounded-full"></div>
        <div class="text-sm font-black uppercase text-primary tracking-widest">Inspiración Diaria</div>
      </div>
    </div>
  `;
}

export async function handleLogin() {
  const userEl = document.getElementById('login-username');
  const passEl = document.getElementById('login-password');
  const btn = document.getElementById('btn-login');

  const username = userEl?.value.trim();
  const password = passEl?.value.trim();
  if (!username || !password) return showToast('❌ Completa los campos', 'error');

  btn.disabled = true;
  btn.classList.add('opacity-50', 'cursor-not-allowed');
  btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verificando...';

  try {
    let email = username;
    if (!username.includes('@')) {
      const { data: st } = await _supabase.from('students').select('email').eq('username', username).maybeSingle();
      if (st) email = st.email;
      else {
        const { data: tc } = await _supabase.from('teachers').select('email').eq('username', username).maybeSingle();
        if (tc) email = tc.email;
        else throw new Error('Usuario no encontrado');
      }
    }

    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await handleSuccessfulLogin(data.user);
  } catch (err) {
    showToast('❌ Login fallido: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
    btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i> Entrar';
  }
}

export async function handleSuccessfulLogin(user) {
  updateAppState('currentUser', user);
  // Rol prioritario desde metadatos
  let role = user.user_metadata?.role || 'estudiante';
  updateAppState('userRole', role);

  // Sincronizar clases globales
  document.documentElement.className = localStorage.getItem('theme') === 'dark' ? 'dark' : '';
  document.body.className = `role-${role} bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300`;

  try {
    let table = role === 'estudiante' ? 'students' : (role === 'admin' ? 'teachers' : 'students');
    let { data, error: tableError } = await _supabase.from(table).select('*').eq('id', user.id).maybeSingle();

    // Auto-corrección: Si el metadato falla, buscar en la otra tabla
    if (!data || tableError) {
      const altTable = table === 'students' ? 'teachers' : 'students';
      const { data: altData } = await _supabase.from(altTable).select('*').eq('id', user.id).maybeSingle();
      if (altData) {
        role = altTable === 'students' ? 'estudiante' : 'docente';
        console.log(`🛡️ Auto-corrección de rol: ${window.userRole} -> ${role}`);
        updateAppState('userRole', role);
        updateAppState('userData', altData);
        document.body.className = `role-${role} bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300`;
      } else {
        updateAppState('userData', data);
      }
    } else {
      updateAppState('userData', data);
    }

    if (window.userData) {
      localStorage.setItem('PX_CACHED_USER', JSON.stringify(user));
      localStorage.setItem('PX_CACHED_USER_DATA', JSON.stringify(window.userData));
      localStorage.setItem('PX_CACHED_ROLE', window.userRole);
    }

    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';

    updateHeaderUI();
    setupNavigationUI();

    // Verificación de cambio de contraseña obligatorio
    if (user.user_metadata?.needs_password_change) {
      showMandatoryPasswordChangeModal();
    } else {
      nav(window.userRole === 'admin' ? 'admin-dashboard' : 'feed');
    }

    if (typeof initGamification === 'function') initGamification();
    if (window.userRole === 'estudiante' && typeof checkAllBadges === 'function') {
      checkAllBadges(user.id);
    }
    if (window.userRole === 'docente' || window.userRole === 'admin') {
      if (typeof loadTeacherNotifications === 'function') loadTeacherNotifications();
      if (typeof loadTeacherSidebarKPIs === 'function') loadTeacherSidebarKPIs();
    }

    if (typeof window.initOnboarding === 'function') {
      window.initOnboarding();
    }

    showToast('👋 ¡Hola de nuevo!', 'success');
  } catch (err) {
    console.error(err);
    // Si falla el fetch de userData (ej. offline), intentamos usar el caché
    const cachedData = localStorage.getItem('PX_CACHED_USER_DATA');
    if (cachedData) {
      updateAppState('userData', JSON.parse(cachedData));
      // Continuar si tenemos algo en cache
      document.getElementById('auth-container').style.display = 'none';
      document.getElementById('app-container').style.display = 'block';
      updateHeaderUI();
      setupNavigationUI();
      nav(window.userRole === 'admin' ? 'admin-dashboard' : 'feed');

      if (typeof window.initOnboarding === 'function') {
        window.initOnboarding();
      }
    } else {
      logout();
    }
  }
}

function updateHeaderUI() {
  const name = userData?.full_name || currentUser?.email?.split('@')[0] || 'Usuario';
  const avatar = userRole === 'estudiante' ? '🎓' : (userRole === 'docente' ? '👨‍🏫' : '👑');

  const nameEl = document.getElementById('user-name');
  if (nameEl) nameEl.textContent = name;

  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) {
    if (userData?.profile_photo_url) {
      avatarEl.innerHTML = `<img src="${userData.profile_photo_url}" class="w-full h-full object-cover rounded-xl">`;
      avatarEl.classList.remove('bg-primary/10', 'text-primary');
    } else {
      avatarEl.textContent = avatar;
      avatarEl.classList.add('bg-primary/10', 'text-primary');
    }
  }
}

function setupNavigationUI() {
  ['nav-estudiante', 'nav-docente', 'nav-admin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === `nav-${userRole}` ? 'block' : 'none';
  });
}

function showMandatoryPasswordChangeModal() {
  // Limpiar si ya existe uno (prevenir duplicados)
  document.getElementById('mandatory-password-modal')?.remove();

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md';
  modal.id = 'mandatory-password-modal';

  modal.innerHTML = `
    <div class="glass-card w-full max-w-md p-8 shadow-2xl animate-slideUp bg-white dark:bg-slate-900 border-2 border-primary/30">
        <div class="text-center mb-8">
            <div class="w-20 h-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-3xl mx-auto mb-4 shadow-inner">
                <i class="fas fa-key"></i>
            </div>
            <h2 class="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Seguridad Requerida</h2>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Por favor, cambia tu contraseña temporal por una segura antes de continuar.</p>
        </div>

        <div class="space-y-4 mb-8">
            <div>
                <label class="text-[0.65rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">Nueva Contraseña</label>
                <div class="relative">
                    <i class="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input type="password" id="mandatory-pass-field" class="input-field-tw pl-12 h-12" placeholder="••••••••" autocomplete="new-password">
                </div>
            </div>
            <div>
                <label class="text-[0.65rem] font-black uppercase text-slate-400 mb-2 block tracking-widest">Confirmar Contraseña</label>
                <div class="relative">
                    <i class="fas fa-check-circle absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input type="password" id="mandatory-conf-field" class="input-field-tw pl-12 h-12" placeholder="••••••••" autocomplete="new-password">
                </div>
            </div>
            <div class="p-4 bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-200 dark:border-amber-500/20 text-[0.7rem] text-amber-700 dark:text-amber-400 font-bold leading-relaxed">
                <i class="fas fa-info-circle mr-1"></i> La contraseña debe tener al menos 6 caracteres.
            </div>
        </div>

        <button id="btn-change-password-submit" onclick="handleMandatoryPasswordChange()" class="btn-primary-tw w-full h-14 text-sm font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20">
            ACTUALIZAR Y COMENZAR
        </button>
    </div>
  `;

  document.body.appendChild(modal);
}

async function handleMandatoryPasswordChange() {
  const passEl = document.getElementById('mandatory-pass-field');
  const confEl = document.getElementById('mandatory-conf-field');
  const btn = document.getElementById('btn-change-password-submit');

  if (!passEl || !confEl) return console.error('Campos no encontrados');

  const pass = passEl.value.trim();
  const conf = confEl.value.trim();

  if (pass.length < 6) return showToast('❌ Mínimo 6 caracteres', 'error');
  if (pass !== conf) return showToast('❌ Las contraseñas no coinciden', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Protegiendo cuenta...';

  try {
    const { error } = await _supabase.auth.updateUser({
      password: pass,
      data: { needs_password_change: false }
    });

    if (error) throw error;

    showToast('✨ ¡Contraseña actualizada con éxito!', 'success');
    document.getElementById('mandatory-password-modal').remove();

    // Ahora sí, navegar según el rol
    nav(userRole === 'admin' ? 'admin-dashboard' : 'feed');

    if (typeof startBirthdayConfetti === 'function') startBirthdayConfetti();

  } catch (err) {
    showToast('❌ Error: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'ACTUALIZAR Y COMENZAR';
  }
}

export async function logout() {
  localStorage.removeItem('PX_CACHED_USER');
  localStorage.removeItem('PX_CACHED_USER_DATA');
  localStorage.removeItem('PX_CACHED_ROLE');
  await _supabase.auth.signOut();
  location.reload();
}
window.logout = logout;
window.handleLogin = handleLogin;

