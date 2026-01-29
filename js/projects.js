/**
 * PROJECTS - Controlador principal del feed (Tailwind Edition)
 */

window.initProjects = async function initProjects() {
  if (typeof window.setupVideoUpload === 'function') window.setupVideoUpload();
  if (typeof window.setupRealtime === 'function') window.setupRealtime();
}

window.loadFeed = async function loadFeed() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  const _supabase = window._supabase;
  const fetchWithCache = window.fetchWithCache;

  // Solo mostrar loader si no hay contenido previo (evitar parpadeo)
  if (!container.innerHTML || container.innerHTML.includes('fa-circle-notch')) {
    container.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center p-20 text-slate-400">
          <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
          <span class="font-black uppercase text-xs tracking-widest">Sincronizando Proyectos...</span>
      </div>
    `;
  }

  try {
    // Patrón Local-First: Cargar de cache e intentar red
    await fetchWithCache('projects_feed_cache', async () => {
      const { data, error } = await _supabase.from('projects')
        .select(`*, students(*, schools(*)), groups(name, group_members(student_id))`)
        .order('votes', { ascending: false })
        .order('score', { ascending: false });
      if (error) throw error;
      return data;
    }, (allProjects) => {
      if (allProjects) window.processAndRenderFeed(container, allProjects);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="col-span-full p-10 text-rose-500 font-bold glass-card">❌ Error al cargar proyectos</div>';
  }
}

window.processAndRenderFeed = async function processAndRenderFeed(container, allProjects) {
  const currentUser = window.currentUser;
  const userRole = window.userRole;

  const projects = allProjects.filter(p => {
    const isApproved = p.score && p.score > 0;
    const isOwner = p.user_id === currentUser?.id;
    const isGroupMember = p.groups?.group_members?.some(m => m.student_id === currentUser?.id);
    return isApproved || isOwner || isGroupMember || userRole === 'docente' || userRole === 'admin';
  });

  let headerHTML = '';

  if (userRole === 'estudiante') headerHTML += await window.renderStudentRatingPrompt();

  if (userRole === 'docente') {
    const teacherPanel = await window.renderTeacherManagementPanel();
    headerHTML += `<div class="mb-10 animate-slideUp">${teacherPanel}</div>`;
  } else if (userRole === 'admin') {
    headerHTML += (typeof window.renderAdminPanel === 'function') ? window.renderAdminPanel() : '';
  }

  headerHTML += window.renderFeedFilters(projects);

  const cardsHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 pb-20">${projects.map(p => (typeof window.renderProjectCard === 'function') ? window.renderProjectCard(p) : '').join('')}</div>`;
  container.innerHTML = headerHTML + cardsHTML;

  window.setupVideoAudioControl();
}

window.renderStudentRatingPrompt = async function renderStudentRatingPrompt() { return ''; }

window.renderTeacherManagementPanel = async function renderTeacherManagementPanel() {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const renderTeacherPanel = window.renderTeacherPanel;

  const today = new Date().getDate();
  const showReportBtn = today >= 25 && today <= 31;
  const { count } = await _supabase.from('weekly_evidence').select('*', { count: 'exact', head: true }).eq('teacher_id', currentUser.id).gte('created_at', new Date(new Date().setDate(new Date().getDate() - 7)).toISOString());

  let html = (typeof renderTeacherPanel === 'function') ? renderTeacherPanel(count > 0, showReportBtn) : '';

  // Inyectar el reto activo dinámicamente si existe
  const challengeHtml = await window.renderActiveChallengeBanner();
  setTimeout(() => {
    const slot = document.getElementById('challenge-indicator-slot');
    if (slot) slot.innerHTML = challengeHtml;
  }, 50);

  return html;
}

window.renderActiveChallengeBanner = async function renderActiveChallengeBanner() {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const MONTHLY_CHALLENGES = window.MONTHLY_CHALLENGES;
  const renderChallengeBanner = window.renderChallengeBanner;

  if (typeof MONTHLY_CHALLENGES === 'undefined' || !MONTHLY_CHALLENGES) return '';
  const active = MONTHLY_CHALLENGES.find(c => c.isActive);
  if (!active) return '';
  const { data } = await _supabase.from('teacher_challenges').select('id').eq('teacher_id', currentUser.id).eq('challenge_id', active.id).maybeSingle();
  return (typeof renderChallengeBanner === 'function') ? renderChallengeBanner(active, !!data) : '';
}

window.renderFeedFilters = function renderFeedFilters(projects) {
  const userRole = window.userRole;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  if (userRole !== 'docente' && userRole !== 'admin') return '';
  const schools = [...new Set(projects.map(p => p.students?.schools?.name).filter(Boolean))].sort();
  return `
        <div class="col-span-full glass-card p-4 mb-8 flex flex-col md:flex-row gap-4 items-center animate-slideUp border-none shadow-sm">
            <div class="relative grow w-full">
                <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input type="text" id="filter-title" class="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-slate-400" placeholder="BUSCAR PROYECTO O EQUIPO..." oninput="window.applyFeedFilters()">
            </div>
            <select id="filter-school" class="w-full md:w-64 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-[0.65rem] font-bold uppercase tracking-widest focus:ring-2 focus:ring-primary/20 transition-all" onchange="window.applyFeedFilters()">
                <option value="">TODAS LAS ENTIDADES</option>
                ${schools.map(s => `<option value="${s}">${sanitizeInput(s)}</option>`).join('')}
            </select>
        </div>
    `;
}

window.applyFeedFilters = function applyFeedFilters() {
  const title = (document.getElementById('filter-title')?.value || '').toLowerCase();
  const school = document.getElementById('filter-school')?.value || '';
  const cards = document.querySelectorAll('.project-card');

  cards.forEach(card => {
    const cardTitle = (card.getAttribute('data-title') || '').toLowerCase();
    const cardSchool = card.getAttribute('data-school') || '';
    const match = cardTitle.includes(title) && (!school || cardSchool === school);
    card.style.display = match ? 'flex' : 'none';
  });
}

window.setupVideoAudioControl = function setupVideoAudioControl() {
  const videos = document.querySelectorAll('video');
  videos.forEach(v => v.addEventListener('play', () => videos.forEach(o => { if (o !== v) o.pause(); })));
}

window.toggleLike = async function toggleLike(projectId) {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const showToast = window.showToast;

  if (!currentUser) {
    if (typeof showToast === 'function') showToast('❌ Inicia sesión para dar like', 'error');
    return;
  }
  const userId = currentUser.id;

  try {
    // 1. Verificar si ya existe el like en la BD
    const { data: existingLike } = await _supabase
      .from('project_likes')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    const { data: project } = await _supabase.from('projects').select('votes').eq('id', projectId).single();
    if (!project) return;

    let newVotes = project.votes || 0;

    if (existingLike) {
      // Remover like
      await _supabase.from('project_likes').delete().eq('id', existingLike.id);
      newVotes = Math.max(0, newVotes - 1);
      if (typeof showToast === 'function') showToast('💔 Voto removido', 'default');
    } else {
      // Agregar like
      await _supabase.from('project_likes').insert({ project_id: projectId, user_id: userId });
      newVotes = newVotes + 1;
      if (typeof showToast === 'function') showToast('❤️ ¡Te gusta este proyecto!', 'success');
    }

    // Actualizar conteo en proyecto
    await _supabase.from('projects').update({ votes: newVotes }).eq('id', projectId);

    // Actualizar UI
    const voteEl = document.querySelector(`[data-votes-id="${projectId}"]`);
    if (voteEl) voteEl.innerText = newVotes;

  } catch (err) {
    console.error(err);
    if (typeof showToast === 'function') showToast('❌ Error al procesar voto', 'error');
  }
}

console.log('✅ projects.js refacturado (Tailwind Edition)');
