/**
 * FEED UI - Componentes visuales para el feed de proyectos (Premium Edition)
 */

function renderTeacherPanel(hasWeeklyEvidence, showReportBtn) {
  return `
    <div class="glass-card px-5 py-4 border-none bg-slate-900 text-white shadow-md flex items-center justify-between gap-4 grow">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center text-lg shrink-0"><i class="fas fa-chalkboard-teacher"></i></div>
        <div>
          <h3 class="text-sm font-semibold tracking-tight leading-none mb-1 uppercase">Gestión Académica</h3>
          <p class="text-[0.8rem] text-white/50 font-medium uppercase tracking-widest leading-none">Control Docente 1Bot</p>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <div id="challenge-indicator-slot"></div>
        <div class="flex gap-2">
          ${hasWeeklyEvidence ? `
            <div class="bg-emerald-500/20 text-emerald-400 font-semibold py-2 px-5 rounded-xl flex items-center gap-2 text-[0.8rem] uppercase tracking-widest border border-emerald-500/30">
                <i class="fas fa-check"></i> EVIDENCIA LISTA
            </div>` : `
            <div class="bg-slate-800 text-slate-500 font-semibold py-2 px-5 rounded-xl flex items-center gap-2 text-[0.8rem] uppercase tracking-widest border border-slate-700">
                <i class="fas fa-clock"></i> EVIDENCIA PENDIENTE
            </div>`}
          ${showReportBtn ? `
            <button class="bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-5 rounded-xl transition-all text-[0.8rem] uppercase tracking-widest" onclick="openMonthlyReportModal()">INFORME</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderAdminPanel() {
  return `
    <div class="glass-card px-4 py-3 mb-6 bg-indigo-600 text-white border-none shadow-md flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="w-7 h-7 rounded-lg bg-white/20 text-white flex items-center justify-center text-xs shrink-0"><i class="fas fa-shield-alt"></i></div>
        <div>
          <h3 class="text-[0.65rem] font-semibold tracking-tight leading-none mb-1">PANEL MAESTRO</h3>
          <p class="text-indigo-100/50 text-[0.55rem] font-medium uppercase tracking-widest leading-none">Gestión Técnica Global</p>
        </div>
      </div>
      <button class="bg-white text-indigo-600 font-semibold py-1.5 px-3 rounded-lg transition-all text-[0.55rem] uppercase tracking-widest" onclick="nav('admin-dashboard')">ADMIN</button>
    </div>
  `;
}

function renderChallengeBanner(activeChallenge, hasCompleted) {
  if (!activeChallenge) return '';
  return `
    <div onclick="openChallengeEvidenceModal('${activeChallenge.id}')" class="flex items-center gap-3 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl border border-amber-500/20 animate-pulse cursor-pointer transition-all group/challenge relative" title="${activeChallenge.description}">
      <div class="w-3 h-3 rounded-full bg-amber-500 animate-ping"></div>
      <span class="text-[0.8rem] font-semibold text-amber-600 uppercase tracking-widest">Reto Activo: ${activeChallenge.name}</span>
      ${hasCompleted ? '<i class="fas fa-check-circle text-emerald-500 text-sm"></i>' : ''}
    </div>
  `;
}

function renderProjectCard(p) {
  const isEvaluated = p.score > 0 || (p.evaluations && p.evaluations.length > 0);
  const score = p.score || (p.evaluations?.[0]?.total_score || 0);

  // Privacidad: Estudiantes solo ven sus propios puntajes/votos o los de su grupo
  const isOwner = p.user_id === currentUser?.id;
  const isGroupMember = p.groups?.group_members?.some(m => m.student_id === currentUser?.id);
  const canSeeScore = isOwner || isGroupMember || userRole === 'docente' || userRole === 'admin';

  return `
    <div class="project-card group bg-white dark:bg-slate-900 rounded-[2rem] overflow-hidden hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 flex flex-col border border-slate-100 dark:border-slate-800" data-title="${(p.title || '').toLowerCase()}" data-school="${p.students?.schools?.name || ''}">
      
      <!-- Media Header -->
      <div class="relative aspect-[4/3] bg-slate-900 overflow-hidden m-2 rounded-[1.5rem]">
        ${p.video_url ? `
            <video preload="metadata" class="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-all duration-700">
              <source src="${p.video_url}" type="video/mp4">
            </video>
            <div class="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-all"></div>
            <div class="absolute inset-0 flex items-center justify-center">
                <div class="w-12 h-12 bg-white/10 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/30 text-white text-lg group-hover:scale-110 transition-transform">
                    <i class="fas fa-play ml-1"></i>
                </div>
            </div>
        ` : `
            <div class="w-full h-full flex flex-col items-center justify-center text-slate-700 bg-slate-800/50">
                <i class="fas fa-video-slash text-2xl mb-2 opacity-20"></i>
                <span class="text-[0.8rem] font-semibold uppercase tracking-widest opacity-40">Sin Media</span>
            </div>
        `}
        
        <div class="absolute top-3 left-3">
            <span class="px-3 py-1.5 rounded-xl bg-black/40 backdrop-blur-md text-white text-[0.8rem] font-semibold uppercase tracking-widest border border-white/10 shadow-lg">
                ${p.bimestre || 1}º Bimestre
            </span>
        </div>
        
        ${canSeeScore ? `
          <div class="absolute top-3 right-3 text-center">
              <div class="px-3 py-1 rounded-xl bg-emerald-500 text-white font-semibold text-sm shadow-lg border border-emerald-400/30">
                  ${score} <span class="text-[0.7rem] opacity-70 ml-0.5 font-medium">PTS</span>
              </div>
          </div>
        ` : ''}
      </div>
    
      <!-- Info Content -->
      <div class="px-6 py-5 grow flex flex-col">
        <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2 overflow-hidden shrink min-w-0">
                <div class="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xs shrink-0">
                    <i class="fas fa-id-card-alt"></i>
                </div>
                <span class="text-[0.8rem] font-semibold uppercase tracking-widest text-slate-400 truncate">${sanitizeInput(p.students?.schools?.name || 'Academia 1Bot')}</span>
            </div>
            
            ${currentUser ? `
              <button onclick="toggleLike(${p.id})" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm">
                  <i class="fas fa-heart text-sm"></i>
                  <span class="text-sm font-bold" data-votes-id="${p.id}">${p.votes || 0}</span>
              </button>
            ` : `
              <div class="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300">
                <i class="fas fa-heart opacity-20"></i>
              </div>
            `}
        </div>

        <h3 class="text-xl font-bold text-slate-800 dark:text-white tracking-tight mb-2 group-hover:text-primary transition-colors line-clamp-1 leading-none uppercase">${sanitizeInput(p.title)}</h3>
        <p class="text-[0.9rem] text-slate-400 italic line-clamp-2 leading-tight mb-6 font-medium">
          "${sanitizeInput(p.description || 'Sin descripción disponible.')}"
        </p>

        <div class="mt-auto pt-4 border-t border-slate-50 dark:border-slate-800/50">
            <button onclick="viewProjectDetails(${p.id})" class="w-full h-11 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-primary shadow-sm hover:text-white text-slate-600 dark:text-slate-300 font-bold text-[0.8rem] uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-2">
                VER PROYECTO <i class="fas fa-chevron-right text-[0.7rem] opacity-50"></i>
            </button>
        </div>
      </div>
    </div>
  `;
}

console.log('✅ feed-ui.js refacturado (Premium Edition)');
