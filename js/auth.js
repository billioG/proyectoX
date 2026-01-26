/**
 * AUTH - Gestión de autenticación y sesión de usuario (Tailwind Edition)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await _supabase.auth.getSession();
  if (session) await handleSuccessfulLogin(session.user);
  else showLoginScreen();

  document.getElementById('btn-login')?.addEventListener('click', handleLogin);
  ['login-username', 'login-password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
  });

  _supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') showLoginScreen();
  });
});

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

async function handleLogin() {
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

async function handleSuccessfulLogin(user) {
  currentUser = user;
  userRole = user.user_metadata?.role || 'estudiante';

  // Sincronizar clases globales
  document.documentElement.className = localStorage.getItem('theme') === 'dark' ? 'dark' : '';
  document.body.className = `role-${userRole} bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300`;

  try {
    const table = userRole === 'estudiante' ? 'students' : 'teachers';
    const { data } = await _supabase.from(table).select('*').eq('id', user.id).maybeSingle();
    userData = data;

    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';

    updateHeaderUI();
    setupNavigationUI();

    nav(userRole === 'admin' ? 'admin-dashboard' : 'feed');

    if (typeof initGamification === 'function') initGamification();
    if (userRole === 'docente' || userRole === 'admin') {
      if (typeof loadTeacherNotifications === 'function') loadTeacherNotifications();
      if (typeof loadTeacherSidebarKPIs === 'function') loadTeacherSidebarKPIs();
    }

    showToast('👋 ¡Hola de nuevo!', 'success');
  } catch (err) { console.error(err); logout(); }
}

function updateHeaderUI() {
  const name = userData?.full_name || currentUser.email.split('@')[0];
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

async function logout() {
  await _supabase.auth.signOut();
  currentUser = null; userRole = null; userData = null;
  location.reload();
}
