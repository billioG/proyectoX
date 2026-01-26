/**
 * PROJECTS - Controlador principal del feed (Tailwind Edition)
 */

async function initProjects() {
  if (typeof setupVideoUpload === 'function') setupVideoUpload();
  if (typeof setupRealtime === 'function') setupRealtime();
}

async function loadFeed() {
  const container = document.getElementById('feed-container');
  if (!container) return;

  container.innerHTML = `
    <div class="col-span-full flex flex-col items-center justify-center p-20 text-slate-400">
        <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
        <span class="font-black uppercase text-xs tracking-widest">Sincronizando Proyectos...</span>
    </div>
  `;

  try {
    const { data: allProjects, error } = await _supabase.from('projects')
      .select(`*, students(*, schools(*)), groups(name, group_members(student_id))`)
      .order('votes', { ascending: false })
      .order('score', { ascending: false });

    if (error) throw error;

    const projects = allProjects.filter(p => {
      const isApproved = p.score && p.score > 0;
      const isOwner = p.user_id === currentUser?.id;
      const isGroupMember = p.groups?.group_members?.some(m => m.student_id === currentUser?.id);
      return isApproved || isOwner || isGroupMember || userRole === 'docente' || userRole === 'admin';
    });

    let headerHTML = '';

    if (userRole === 'estudiante') headerHTML += await renderStudentRatingPrompt();

    if (userRole === 'docente') {
      const teacherPanel = await renderTeacherManagementPanel();

      headerHTML += `
        <div class="mb-10 animate-slideUp">
            ${teacherPanel}
        </div>
      `;
    } else if (userRole === 'admin') {
      headerHTML += renderAdminPanel();
    }

    headerHTML += renderFeedFilters(projects);

    const cardsHTML = `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">${projects.map(p => renderProjectCard(p)).join('')}</div>`;
    container.innerHTML = headerHTML + cardsHTML;

    setupVideoAudioControl();

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="col-span-full p-10 text-rose-500 font-bold glass-card">❌ Error al cargar proyectos</div>';
  }
}

async function renderStudentRatingPrompt() { return ''; }

async function renderTeacherManagementPanel() {
  const today = new Date().getDate();
  const showReportBtn = today >= 25 && today <= 31;
  const { count } = await _supabase.from('weekly_evidence').select('*', { count: 'exact', head: true }).eq('teacher_id', currentUser.id).gte('created_at', new Date(new Date().setDate(new Date().getDate() - 7)).toISOString());

  let html = renderTeacherPanel(count > 0, showReportBtn);

  // Inyectar el reto activo dinámicamente si existe
  const challengeHtml = await renderActiveChallengeBanner();
  setTimeout(() => {
    const slot = document.getElementById('challenge-indicator-slot');
    if (slot) slot.innerHTML = challengeHtml;
  }, 50);

  return html;
}

async function renderActiveChallengeBanner() {
  if (typeof MONTHLY_CHALLENGES === 'undefined') return '';
  const active = MONTHLY_CHALLENGES.find(c => c.isActive);
  if (!active) return '';
  const { data } = await _supabase.from('teacher_challenges').select('id').eq('teacher_id', currentUser.id).eq('challenge_id', active.id).maybeSingle();
  return renderChallengeBanner(active, !!data);
}

function renderFeedFilters(projects) {
  if (userRole !== 'docente' && userRole !== 'admin') return '';
  const schools = [...new Set(projects.map(p => p.students?.schools?.name).filter(Boolean))].sort();
  return `
        <div class="col-span-full glass-card p-4 mb-8 flex flex-col md:flex-row gap-4 items-center animate-slideUp border-none shadow-sm">
            <div class="relative grow w-full">
                <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input type="text" id="filter-title" class="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-slate-400" placeholder="BUSCAR PROYECTO O EQUIPO..." oninput="applyFeedFilters()">
            </div>
            <select id="filter-school" class="w-full md:w-64 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-[0.65rem] font-bold uppercase tracking-widest focus:ring-2 focus:ring-primary/20 transition-all" onchange="applyFeedFilters()">
                <option value="">TODAS LAS ENTIDADES</option>
                ${schools.map(s => `<option value="${s}">${sanitizeInput(s)}</option>`).join('')}
            </select>
        </div>
    `;
}

function applyFeedFilters() {
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

function setupVideoAudioControl() {
  const videos = document.querySelectorAll('video');
  videos.forEach(v => v.addEventListener('play', () => videos.forEach(o => { if (o !== v) o.pause(); })));
}

async function toggleLike(projectId) {
  if (!currentUser) return showToast('❌ Inicia sesión para dar like', 'error');
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
      showToast('💔 Voto removido', 'default');
    } else {
      // Agregar like
      await _supabase.from('project_likes').insert({ project_id: projectId, user_id: userId });
      newVotes = newVotes + 1;
      showToast('❤️ ¡Te gusta este proyecto!', 'success');
    }

    // Actualizar conteo en proyecto
    await _supabase.from('projects').update({ votes: newVotes }).eq('id', projectId);

    // Actualizar UI
    const voteEl = document.querySelector(`[data-votes-id="${projectId}"]`);
    if (voteEl) voteEl.innerText = newVotes;

  } catch (err) {
    console.error(err);
    showToast('❌ Error al procesar voto', 'error');
  }
}

console.log('✅ projects.js refacturado (Tailwind Edition)');
