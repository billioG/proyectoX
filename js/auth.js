import { _supabase, updateAppState } from './config.js';
import { showToast, nav } from './main.js';
import { MOTIVATIONAL_QUOTES } from './data/quotes.js';

/**
 * AUTH - Gestión de autenticación y sesión de usuario (Tailwind Edition)
 */

// Espera a que window[name] exista como función -- usado para el resume
// tras el reload forzado por H5P, donde el módulo que la define (lessons.js)
// puede seguir cargando vía import() dinámico en frío.
function waitForGlobalFn(name, timeout = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (typeof window[name] === 'function') return resolve(true);
      if (Date.now() - start > timeout) return resolve(false);
      setTimeout(check, 100);
    };
    check();
  });
}

export async function initAuth() {
  // El link de "recuperar contraseña" también autentica al usuario (así
  // funciona Supabase Auth) -- si no distinguimos este caso, getSession()
  // de abajo ve una sesión válida y entra derecho a la app, sin nunca
  // pedir la contraseña nueva. Se detecta por el ?type=recovery/#type=recovery
  // que Supabase agrega al redirectTo, y en ese caso no se hace login normal:
  // se espera al evento PASSWORD_RECOVERY para abrir el modal de nueva contraseña.
  const isRecoveryLink = window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery');

  // El listener se registra ANTES que cualquier otra cosa para no perderse
  // el evento PASSWORD_RECOVERY si ya se dispara durante el getSession() de abajo.
  _supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      localStorage.removeItem('PX_CACHED_USER');
      localStorage.removeItem('PX_CACHED_USER_DATA');
      localStorage.removeItem('PX_CACHED_ROLE');
      // En un dispositivo compartido (tablet de aula), sin esto el próximo
      // usuario que entra hereda la última vista del anterior -- si era un
      // docente/admin viendo "students" (Gestión de Estudiantes con import
      // de nómina), un estudiante que entra después aterriza ahí en vez de
      // en su feed.
      sessionStorage.removeItem('PX_LAST_VIEW');
      showLoginScreen();
    }
    if (event === 'PASSWORD_RECOVERY') {
      openSetNewPasswordModal();
      return;
    }
    if (event === 'SIGNED_IN' && session && !isRecoveryLink) {
      // Supabase puede re-emitir SIGNED_IN con la MISMA sesión al volver a
      // enfocar la pestaña (revalida el token en segundo plano). Si ya
      // tenemos a este mismo usuario cargado, handleSuccessfulLogin() de
      // nuevo llama a nav() y eso borra cualquier modal abierto (ej. el
      // formulario de crear curso) -- se veía como "la app se reinicia y
      // pierdo lo que estaba escribiendo" al cambiar de pestaña y volver.
      if (window.currentUser?.id === session.user.id) return;
      await handleSuccessfulLogin(session.user);
    }
  });

  if (isRecoveryLink) {
    // No depende de que el evento PASSWORD_RECOVERY llegue a tiempo (puede
    // dispararse antes de que este listener quede armado) -- ya sabemos por
    // la URL que es un link de recuperación, así que se abre directo.
    showLoginScreen();
    document.getElementById('btn-login')?.addEventListener('click', handleLogin);
    ['login-username', 'login-password'].forEach(id => {
      document.getElementById(id)?.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
    });
    openSetNewPasswordModal();
    return;
  }

  // Intentar recuperar sesión offline primero
  const cachedUser = localStorage.getItem('PX_CACHED_USER');
  const cachedData = localStorage.getItem('PX_CACHED_USER_DATA');
  const cachedRole = localStorage.getItem('PX_CACHED_ROLE');

  const { data: { session } } = await _supabase.auth.getSession();

  if (session) {
    await handleSuccessfulLogin(session.user);
  } else if (cachedUser && cachedData && cachedRole) {
    // Si estamos offline y hay datos en cache, permitir entrada.
    // PX_CACHED_ROLE viene de localStorage sin ninguna verificación
    // criptográfica -- cualquiera puede escribirlo desde la consola. Sin
    // sesión Supabase real no hay JWT, así que ninguna escritura a la base
    // de datos va a pasar RLS de todas formas, pero por las dudas nunca
    // se navega directo al panel admin solo por el rol cacheado: siempre
    // aterriza en 'feed' (vista de solo lectura de datos ya propios) y se
    // marca el modo para que la UI de escritura/admin quede deshabilitada
    // hasta que exista una sesión real.
    console.log('🔌 Modo Offline: Cargando sesión desde caché (solo lectura)');
    updateAppState('currentUser', JSON.parse(cachedUser));
    updateAppState('userData', JSON.parse(cachedData));
    updateAppState('userRole', cachedRole);
    window.isOfflineCachedSession = true;

    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';

    updateHeaderUI();
    setupNavigationUI();
    nav('feed');

    if (typeof window.initOnboarding === 'function') {
      window.initOnboarding();
    }

    showToast('<i class="fas fa-wifi"></i> Conectado en modo Offline (solo lectura)', 'info');
  } else {
    showLoginScreen();
  }

  document.getElementById('btn-login')?.addEventListener('click', handleLogin);
  ['login-username', 'login-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
  });
}
window.initAuth = initAuth;

window.checkLoginPasswordMode = async function checkLoginPasswordMode() {
  const userEl = document.getElementById('login-username');
  const wrapEl = document.getElementById('login-password-wrap');
  const hintEl = document.getElementById('login-passwordless-hint');
  // Los usuarios de alumno se generan siempre en minúscula -- si el
  // celular puso la primera letra en mayúscula (autocapitalize), la
  // comparación exacta no encontraba al alumno y nunca detectaba el modo
  // sin contraseña.
  const username = userEl?.value.trim().toLowerCase();
  if (!username || username.includes('@')) {
    // Email -> siempre requiere contraseña (docentes/admin), no aplica el modo clase.
    if (wrapEl) wrapEl.classList.remove('hidden');
    if (hintEl) hintEl.classList.add('hidden');
    return;
  }

  try {
    const { data: requiresPassword } = await _supabase.rpc('resolve_login_mode_by_username', { p_username: username });
    const needsPassword = requiresPassword !== false;
    if (wrapEl) wrapEl.classList.toggle('hidden', !needsPassword);
    if (hintEl) hintEl.classList.toggle('hidden', needsPassword);
  } catch (e) {
    // Ante cualquier duda, mostrar el campo -- nunca ocultarlo por error.
    if (wrapEl) wrapEl.classList.remove('hidden');
    if (hintEl) hintEl.classList.add('hidden');
  }
}

window.toggleLoginPasswordVisibility = function toggleLoginPasswordVisibility() {
  const input = document.getElementById('login-password');
  const icon = document.getElementById('login-password-eye');
  if (!input || !icon) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  icon.className = isHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
}

window.openForgotPasswordModal = function openForgotPasswordModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-sm p-8 shadow-2xl animate-slideUp">
      <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter mb-2"><i class="fas fa-key text-primary mr-2"></i> Recuperar Contraseña</h2>
      <p class="text-xs text-slate-400 mb-6">Ingresá tu correo y te enviamos un enlace para restablecer tu contraseña.</p>
      <input type="email" id="forgot-password-email" placeholder="tu@correo.com"
        class="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4">
      <div class="flex gap-3">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-send-reset" onclick="window.sendPasswordResetEmail()">Enviar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('forgot-password-email')?.focus();
}

window.sendPasswordResetEmail = async function sendPasswordResetEmail() {
  const email = document.getElementById('forgot-password-email')?.value.trim();
  const btn = document.getElementById('btn-send-reset');
  if (!email) return showToast('<i class="fas fa-circle-xmark"></i> Ingresá tu correo', 'error');

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  try {
    const { error } = await _supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) throw error;
    document.querySelector('.fixed.z-\\[200\\]')?.remove();
    showToast('<i class="fas fa-circle-check"></i> Revisá tu correo para restablecer tu contraseña', 'success');
  } catch (err) {
    showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Enviar'; }
  }
}

window.openChangePasswordModal = openSetNewPasswordModal;

function openSetNewPasswordModal(allowCancel) {
  if (document.getElementById('set-new-password-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'set-new-password-modal';
  modal.className = 'fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-sm p-8 shadow-2xl animate-slideUp relative">
      ${allowCancel ? `<button onclick="document.getElementById('set-new-password-modal')?.remove()" class="absolute top-4 right-4 w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center"><i class="fas fa-times"></i></button>` : ''}
      <h2 class="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter mb-2"><i class="fas fa-lock text-primary mr-2"></i> Nueva Contraseña</h2>
      <p class="text-xs text-slate-400 mb-6">Ingresá tu nueva contraseña para continuar.</p>
      <input type="password" id="new-password-input" placeholder="Nueva contraseña (mín. 6 caracteres)"
        class="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4">
      <div class="flex gap-3">
        ${allowCancel ? `<button class="btn-secondary-tw flex-1 h-12 text-xs uppercase font-bold" onclick="document.getElementById('set-new-password-modal')?.remove()">Cancelar</button>` : ''}
        <button class="btn-primary-tw flex-1 h-12 text-xs uppercase font-bold" id="btn-set-new-password" onclick="window.submitNewPassword()">Guardar y Continuar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.submitNewPassword = async function submitNewPassword() {
  const password = document.getElementById('new-password-input')?.value;
  const btn = document.getElementById('btn-set-new-password');
  if (!password || password.length < 6) return showToast('<i class="fas fa-circle-xmark"></i> Mínimo 6 caracteres', 'error');

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  try {
    const { error } = await _supabase.auth.updateUser({ password });
    if (error) throw error;
    document.getElementById('set-new-password-modal')?.remove();
    showToast('<i class="fas fa-circle-check"></i> Contraseña actualizada', 'success');
  } catch (err) {
    showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar y Continuar'; }
  }
}

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
    <div class="text-center max-w-sm mx-auto px-4">
      <p class="text-xs italic text-slate-500 dark:text-slate-400 leading-relaxed">"${quote}"</p>
    </div>
  `;
}

export async function handleLogin() {
  const userEl = document.getElementById('login-username');
  const passEl = document.getElementById('login-password');
  const btn = document.getElementById('btn-login');

  const rawUsername = userEl?.value.trim();
  // El email sí puede tener mayúsculas válidas -- solo se normaliza el
  // usuario de alumno (siempre se genera en minúscula).
  const username = rawUsername?.includes('@') ? rawUsername : rawUsername?.toLowerCase();
  const password = passEl?.value.trim();
  if (!username) return showToast('<i class="fas fa-circle-xmark"></i> Ingresá tu usuario o correo', 'error');

  btn.disabled = true;
  btn.classList.add('opacity-50', 'cursor-not-allowed');
  btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verificando...';

  try {
    if (username.includes('@')) {
      // Docentes/admin siempre entran con email + contraseña real.
      if (!password) throw new Error('Ingresá tu contraseña');
      const { data, error } = await _supabase.auth.signInWithPassword({ email: username, password });
      if (error) throw error;
      await handleSuccessfulLogin(data.user);
    } else {
      // Login de alumno por usuario -- pasa por la edge function
      // student-login, que valida la contraseña de CLASE (o permite
      // entrar sin ella si esa clase la tiene desactivada) sin exponer
      // nunca la contraseña real al cliente, y emite la sesión vía
      // magic link.
      const res = await fetch(`${window.SUPABASE_URL}/functions/v1/student-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ username, password }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Login fallido');

      const { data, error } = await _supabase.auth.verifyOtp({
        token_hash: result.token_hash,
        type: 'magiclink',
      });
      if (error) throw error;
      await handleSuccessfulLogin(data.user);
    }
  } catch (err) {
    showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
    btn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i> Entrar';
  }
}

export async function handleSuccessfulLogin(user) {
  updateAppState('currentUser', user);

  try {
    // El rol SIEMPRE se determina desde las tablas teachers/students (server-side,
    // protegidas por RLS), NUNCA desde user_metadata: ese campo lo puede editar
    // el propio usuario desde el navegador (auth.updateUser) y confiar en él acá
    // permitía que cualquier docente se auto-asignara 'admin' en el cliente.
    let role = 'estudiante';
    let data = null;

    const { data: teacherRow } = await _supabase.from('teachers').select('*').eq('id', user.id).maybeSingle();
    if (teacherRow) {
      data = teacherRow;
      role = teacherRow.role === 'admin' ? 'admin' : teacherRow.role === 'coordinador' ? 'coordinador' : 'docente';
    } else {
      const { data: studentRow } = await _supabase.from('students').select('*').eq('id', user.id).maybeSingle();
      if (studentRow) {
        data = studentRow;
        role = 'estudiante';
      }
    }

    // Egresado (ver "Promover Ciclo Escolar" en Estudiantes -- admin) o
    // dado de baja (retiro a mitad de año) -- en ambos casos se conserva
    // la cuenta y su historial, pero ya no puede entrar.
    if (data?.status === 'egresado' || data?.status === 'baja') {
      await _supabase.auth.signOut();
      const msg = data.status === 'egresado'
        ? 'Esta cuenta ya egresó y no tiene acceso. Contactá a tu establecimiento si creés que es un error.'
        : 'Esta cuenta fue dada de baja. Contactá a tu establecimiento si creés que es un error.';
      showToast('<i class="fas fa-graduation-cap"></i> ' + msg, 'error');
      return;
    }

    updateAppState('userRole', role);
    updateAppState('userData', data);

    // Sincronizar clases globales
    document.documentElement.className = localStorage.getItem('theme') === 'dark' ? 'dark' : '';
    document.body.className = `role-${role} bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300`;

    if (window.userData) {
      localStorage.setItem('PX_CACHED_USER', JSON.stringify(user));
      localStorage.setItem('PX_CACHED_USER_DATA', JSON.stringify(window.userData));
      localStorage.setItem('PX_CACHED_ROLE', window.userRole);
    }

    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';

    updateHeaderUI();
    setupNavigationUI();

    // La mascota no debe aparecer hasta que haya sesión -- app.js solo la
    // inicializa si YA había currentUser al cargar la página; este es el
    // caso de login recién hecho en la misma carga (app.js ya pasó por
    // ese chequeo antes de que esto corriera).
    if (window.MascotWidget && typeof window.MascotWidget.init === 'function') {
      window.MascotWidget.init();
    }

    // Mismo problema de timing que la mascota: el listener 'load' de
    // announcements.js corre 3s después de cargar la página, pero en un
    // login recién hecho (SPA, sin recargar) ese timer ya venció con
    // currentUser todavía undefined -- la campanita se quedaba sin badge
    // hasta el próximo refresh manual.
    if (typeof window.loadAnnouncementsUnreadCount === 'function') {
      window.loadAnnouncementsUnreadCount();
    }

    // Verificación de cambio de contraseña obligatorio -- no aplica si la
    // clase del alumno está configurada como "sin contraseña" (si no, se le
    // pediría fijar una contraseña que después ni siquiera va a usar).
    let mustChangePassword = !!user.user_metadata?.needs_password_change;
    if (mustChangePassword && role === 'estudiante' && data?.school_code && data?.grade && data?.section) {
      const { data: classRequiresPassword } = await _supabase.rpc('get_class_login_mode', {
        p_school_code: data.school_code, p_grade: data.grade, p_section: data.section,
      });
      if (classRequiresPassword === false) mustChangePassword = false;
    }

    if (mustChangePassword) {
      showMandatoryPasswordChangeModal();
    } else {
      const defaultView = window.userRole === 'admin' ? 'admin-dashboard' : window.userRole === 'coordinador' ? 'coordinator-dashboard' : window.userRole === 'estudiante' ? 'lessons' : 'feed';
      const lastView = sessionStorage.getItem('PX_LAST_VIEW');
      // Además de existir en el DOM, la vista guardada tiene que ser válida
      // para el rol de ESTE usuario -- si no, un estudiante podría heredar
      // la última vista de un docente/admin que usó el mismo dispositivo
      // antes (ej. "students", con el import de nómina MINEDUC).
      const hasLastView = lastView && document.getElementById(`view-${lastView}`) && isViewAllowedForRole(lastView, window.userRole);
      nav(hasLastView ? lastView : defaultView);

      // Clic en notificación push con la app cerrada (cold start): el
      // service worker abre la ventana con "?open=<target>" (ver
      // service-worker.js/notificationclick) -- acá se lee y ruteá una vez,
      // limpiando la URL para que un refresh no vuelva a disparar la ruta.
      const openTarget = new URLSearchParams(location.search).get('open');
      if (openTarget) {
        history.replaceState(null, '', location.pathname);
        if (typeof window.routeNotificationTarget === 'function') window.routeNotificationTarget(openTarget);
      }

      // Resume tras reload forzado (workaround H5P: 2do recurso h5p en la
      // misma sesión de página siempre falla, así que se recarga la página
      // completa y se retoma acá el curso/recurso donde el usuario iba).
      // nav('lessons') dispara la carga del módulo lessons.js vía import()
      // dinámico -- en frío (recién recargada la página) puede tardar más
      // de los 300ms fijos que había antes, dejando openCoursePlayer/
      // openCourseManager todavía indefinidos quand se intentaban llamar.
      // Por eso ahora se espera activamente a que la función exista.
      const resumeRaw = sessionStorage.getItem('PX_RESUME_COURSE');
      if (resumeRaw && window.userRole === 'estudiante') {
        sessionStorage.removeItem('PX_RESUME_COURSE');
        try {
          const { courseId, index } = JSON.parse(resumeRaw);
          nav('lessons');
          waitForGlobalFn('openCoursePlayer').then(async (ok) => {
            if (!ok) return;
            if (!window._coursesCache) await window.loadLessons();
            window.openCoursePlayer(courseId);
            window.selectCourseResource(index);
          });
        } catch (e) { /* ignora resume corrupto */ }
      }

      // Mismo workaround, para la vista previa de H5P del docente (modal
      // "Gestionar recursos" -> Vista previa).
      const resumePreviewRaw = sessionStorage.getItem('PX_RESUME_PREVIEW');
      if (resumePreviewRaw && (window.userRole === 'docente' || window.userRole === 'admin')) {
        sessionStorage.removeItem('PX_RESUME_PREVIEW');
        try {
          const { courseId, lessonId } = JSON.parse(resumePreviewRaw);
          nav('lessons');
          waitForGlobalFn('openCourseManager').then(async (ok) => {
            if (!ok) return;
            await window.openCourseManager(courseId);
            window.previewCourseResource(lessonId);
          });
        } catch (e) { /* ignora resume corrupto */ }
      }
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

    showToast('<i class="fas fa-hand"></i> ¡Hola de nuevo!', 'success');
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
  const avatar = userRole === 'estudiante' ? '<i class="fas fa-graduation-cap"></i>' : (userRole === 'docente' ? '<i class="fas fa-chalkboard-user"></i>‍<i class="fas fa-school"></i>' : '<i class="fas fa-crown"></i>');

  const nameEl = document.getElementById('user-name');
  if (nameEl) nameEl.textContent = name;

  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl) {
    if (userData?.profile_photo_url) {
      avatarEl.innerHTML = `<img src="${userData.profile_photo_url}" class="w-full h-full object-cover rounded-xl">`;
      avatarEl.classList.remove('bg-primary/10', 'text-primary');
    } else {
      avatarEl.innerHTML = avatar;
      avatarEl.classList.add('bg-primary/10', 'text-primary');
    }
  }

  if (typeof window.renderDevModeToggle === 'function') window.renderDevModeToggle();
}

function setupNavigationUI() {
  ['nav-estudiante', 'nav-docente', 'nav-admin', 'nav-coordinador'].forEach(id => {
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

  if (pass.length < 6) return showToast('<i class="fas fa-circle-xmark"></i> Mínimo 6 caracteres', 'error');
  if (pass !== conf) return showToast('<i class="fas fa-circle-xmark"></i> Las contraseñas no coinciden', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Protegiendo cuenta...';

  try {
    const { error } = await _supabase.auth.updateUser({
      password: pass,
      data: { needs_password_change: false }
    });

    if (error) throw error;

    showToast('<i class="fas fa-wand-magic-sparkles"></i> ¡Contraseña actualizada con éxito!', 'success');
    document.getElementById('mandatory-password-modal').remove();

    // Ahora sí, navegar según el rol
    nav(userRole === 'admin' ? 'admin-dashboard' : 'feed');

    if (typeof startBirthdayConfetti === 'function') startBirthdayConfetti();

  } catch (err) {
    showToast('<i class="fas fa-circle-xmark"></i> Error: ' + err.message, 'error');
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

