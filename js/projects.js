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
        .select(`*, students(*, schools(*)), groups(name, group_members(student_id)), evaluations(total_score, feedback)`)
        .order('votes', { ascending: false })
        .order('score', { ascending: false });
      if (error) throw error;
      await window.attachProjectAuthors(data);
      return data;
    }, (allProjects) => {
      if (allProjects) window.processAndRenderFeed(container, allProjects);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="col-span-full p-10 text-rose-500 font-bold glass-card"><i class="fas fa-circle-xmark"></i> Error al cargar proyectos</div>';
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

  restoreFeedFilters();
  window.setupVideoAudioControl();
  window.applyMyReactionIcons?.();
}

window.renderStudentRatingPrompt = async function renderStudentRatingPrompt() {
  const progressHtml = await window.renderCourseProgressBanner();
  const challengeHtml = await window.renderActiveChallengeBanner();
  let html = '';
  if (progressHtml) html += `<div class="mb-4 animate-slideUp">${progressHtml}</div>`;
  if (challengeHtml) html += `<div class="mb-8 animate-slideUp">${challengeHtml}</div>`;
  return html;
}

// Pedido de un docente: Inicio solo mostraba el feed de proyectos, sin
// forma de ver que te falta trabajo en Cursos -- un alumno podía tener un
// curso al 80% y nunca darse cuenta si no entraba a esa sección aparte.
window.renderCourseProgressBanner = async function renderCourseProgressBanner() {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const userData = window.userData;
  if (!userData?.school_code || !userData?.grade || !userData?.section) return '';

  const [{ data: courses }, { data: completions }] = await Promise.all([
    _supabase.from('courses').select('id, title, lessons(id)')
      .eq('school_code', userData.school_code).eq('grade', userData.grade).eq('section', userData.section),
    _supabase.from('lesson_completions').select('lesson_id').eq('student_id', currentUser.id),
  ]);
  if (!courses?.length) return '';

  const doneIds = new Set((completions || []).map(c => c.lesson_id));
  const withProgress = courses.map(c => {
    const total = (c.lessons || []).length;
    const done = (c.lessons || []).filter(l => doneIds.has(l.id)).length;
    return { title: c.title, total, done, pct: total ? Math.round((done / total) * 100) : 100 };
  }).filter(c => c.total > 0);

  const pending = withProgress.filter(c => c.pct < 100).sort((a, b) => a.pct - b.pct);
  if (!pending.length) return '';

  const top = pending[0];
  const extra = pending.length - 1;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  return `
    <div onclick="window.nav('lessons')" class="glass-card p-4 flex items-center gap-4 cursor-pointer hover:border-primary/30 transition-all border-l-4 border-l-amber-500">
      <div class="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-lg shrink-0"><i class="fas fa-book-open"></i></div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wide truncate">Trabajo pendiente: ${sanitizeInput(top.title)}</p>
        <p class="text-[0.65rem] text-slate-400">${top.pct}% completado -- ${top.total - top.done} recurso(s) por hacer${extra > 0 ? ` · +${extra} curso(s) más con trabajo pendiente` : ''}</p>
      </div>
      <i class="fas fa-arrow-right text-slate-300"></i>
    </div>
  `;
}

window.renderTeacherManagementPanel = async function renderTeacherManagementPanel() {
  // Evidencia semanal, informe mensual y el reto docente con XP son del
  // programa de retribución 1bot -- no aplican a docentes de otras
  // escuelas ni al docente de demostración.
  if (!window.userData?.is_1bot_team) return '';

  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const renderTeacherPanel = window.renderTeacherPanel;

  const now = new Date();
  const today = now.getDate();
  const showReportBtn = today >= 25 && today <= 31;
  const { count } = await _supabase.from('weekly_evidence').select('*', { count: 'exact', head: true }).eq('teacher_id', currentUser.id).gte('created_at', new Date(new Date().setDate(new Date().getDate() - 7)).toISOString());

  let reportAlreadySent = false;
  if (showReportBtn) {
    const { count: reportCount } = await _supabase.from('teacher_monthly_reports')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', currentUser.id)
      .eq('month', now.getMonth() + 1)
      .eq('year', now.getFullYear());
    reportAlreadySent = (reportCount || 0) > 0;
  }

  let html = (typeof renderTeacherPanel === 'function') ? renderTeacherPanel(count > 0, showReportBtn, reportAlreadySent) : '';

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
  const userRole = window.userRole;
  const renderChallengeBanner = window.renderChallengeBanner;

  // Reto del mes: contenido DISTINTO para docentes (técnica docente) y
  // estudiantes (gestión emocional/crecimiento personal) -- cada uno con
  // su propia lista (data/challenges.js vs data/student-challenges.js),
  // su propia tabla (student_challenges no comparte FK con
  // teacher_challenges) y su propio modal de envío.
  const isStudent = userRole === 'estudiante';
  const CHALLENGES = isStudent ? window.STUDENT_MONTHLY_CHALLENGES : window.MONTHLY_CHALLENGES;
  if (!CHALLENGES) return '';
  const active = CHALLENGES.find(c => c.isActive);
  if (!active) return '';

  const table = isStudent ? 'student_challenges' : 'teacher_challenges';
  const idField = isStudent ? 'student_id' : 'teacher_id';
  const openFn = isStudent ? 'openStudentChallengeModal' : 'openChallengeEvidenceModal';

  const { data } = await _supabase.from(table).select('id').eq(idField, currentUser.id).eq('challenge_id', active.id).maybeSingle();
  return (typeof renderChallengeBanner === 'function') ? renderChallengeBanner(active, !!data, openFn) : '';
}

window.renderFeedFilters = function renderFeedFilters(projects) {
  const userRole = window.userRole;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const sanitizeAttr = window.sanitizeAttr || ((v) => v);

  // Establecimientos presentes en el feed, por código (el nombre puede
  // repetirse o diferir en mayúsculas entre filas).
  const schoolsByCode = new Map();
  projects.forEach(p => {
    const code = p.students?.school_code;
    if (code && !schoolsByCode.has(code)) schoolsByCode.set(code, p.students?.schools?.name || code);
  });
  const myCode = userRole === 'estudiante' ? window.userData?.school_code : null;
  const options = [...schoolsByCode].filter(([code]) => code !== myCode).sort((a, b) => a[1].localeCompare(b[1]));
  const mine = myCode ? [[myCode, schoolsByCode.get(myCode) || 'Mi establecimiento']] : [];

  return `
        <div class="col-span-full glass-card p-4 mb-8 flex flex-col md:flex-row gap-4 items-center animate-slideUp border-none shadow-sm">
            <div class="relative grow w-full">
                <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input type="text" id="filter-title" class="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-slate-400" placeholder="BUSCAR PROYECTO O EQUIPO..." oninput="window.applyFeedFilters()">
            </div>
            <select id="filter-school" class="w-full md:w-64 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-[0.65rem] font-bold uppercase tracking-widest focus:ring-2 focus:ring-primary/20 transition-all" onchange="window.applyFeedFilters()">
                <option value="">TODAS LAS ENTIDADES</option>
                ${mine.map(([code, name]) => `<option value="${sanitizeAttr(code)}">★ Mi establecimiento (${sanitizeInput(name)})</option>`).join('')}
                ${options.map(([code, name]) => `<option value="${sanitizeAttr(code)}">${sanitizeInput(name)}</option>`).join('')}
            </select>
        </div>
    `;
}

// El feed se pinta dos veces (primero desde caché, luego con datos frescos) y
// cada pintado recrea los controles: el filtro se guarda acá y se reaplica
// después de cada render, si no se perdía apenas llegaban los datos nuevos.
window._feedFilters = { title: '', school: '' };

window.applyFeedFilters = function applyFeedFilters() {
  const titleEl = document.getElementById('filter-title');
  const schoolEl = document.getElementById('filter-school');
  if (titleEl) window._feedFilters.title = titleEl.value;
  if (schoolEl) window._feedFilters.school = schoolEl.value;

  const title = window._feedFilters.title.trim().toLowerCase();
  const school = window._feedFilters.school;

  document.querySelectorAll('.project-card').forEach(card => {
    const cardTitle = (card.getAttribute('data-title') || '').toLowerCase();
    const match = cardTitle.includes(title) && (!school || card.getAttribute('data-school-code') === school);
    card.style.display = match ? '' : 'none';
  });
}

function restoreFeedFilters() {
  const titleEl = document.getElementById('filter-title');
  const schoolEl = document.getElementById('filter-school');
  if (titleEl) titleEl.value = window._feedFilters.title;
  if (schoolEl) schoolEl.value = window._feedFilters.school;
  window.applyFeedFilters();
}

window.setupVideoAudioControl = function setupVideoAudioControl() {
  const videos = document.querySelectorAll('video');
  videos.forEach(v => v.addEventListener('play', () => videos.forEach(o => { if (o !== v) o.pause(); })));
}

console.log('✅ projects.js refacturado (Tailwind Edition)');
