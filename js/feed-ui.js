/**
 * FEED UI - Componentes visuales para el feed de proyectos (Premium Edition)
 */

window.renderTeacherPanel = function renderTeacherPanel(hasWeeklyEvidence, showReportBtn) {
  return `
    <div class="glass-card px-6 py-5 border-none bg-slate-900 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 grow mb-8">
      <div class="flex items-center gap-5">
        <div class="w-12 h-12 rounded-[1.25rem] bg-primary/20 text-primary flex items-center justify-center text-xl shrink-0 border border-primary/20 shadow-lg shadow-primary/10">
            <i class="fas fa-chalkboard-teacher"></i>
        </div>
        <div>
          <h3 class="text-base font-bold tracking-tight leading-none mb-1.5 uppercase">Gestión Académica</h3>
          <p class="text-[0.7rem] text-primary font-black uppercase tracking-[0.2em] leading-none opacity-80">Control Docente 1Bot</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-4 w-full md:w-auto">
        <div id="challenge-indicator-slot" class="w-full md:w-auto"></div>
        <div class="flex gap-3 w-full md:w-auto">
          ${hasWeeklyEvidence ? `
            <div class="bg-emerald-500/10 text-emerald-400 font-bold py-2.5 px-6 rounded-xl flex items-center gap-2 text-[0.7rem] uppercase tracking-widest border border-emerald-500/20 whitespace-nowrap">
                <i class="fas fa-check-circle"></i> EVIDENCIA LISTA
            </div>` : `
            <div class="bg-amber-500/10 text-amber-500 font-bold py-2.5 px-6 rounded-xl flex items-center gap-2 text-[0.7rem] uppercase tracking-widest border border-amber-500/20 animate-pulse whitespace-nowrap">
                <i class="fas fa-clock"></i> EVIDENCIA PENDIENTE
            </div>`}
          ${showReportBtn ? `
            <button class="bg-primary hover:bg-primary-dark text-white font-black py-2.5 px-6 rounded-xl transition-all text-[0.7rem] uppercase tracking-widest shadow-lg shadow-primary/20" onclick="window.openMonthlyReportModal && window.openMonthlyReportModal()">INFORME</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

window.renderAdminPanel = function renderAdminPanel() {
  return `
    <div class="glass-card px-4 py-3 mb-6 bg-indigo-600 text-white border-none shadow-md flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="w-7 h-7 rounded-lg bg-white/20 text-white flex items-center justify-center text-xs shrink-0"><i class="fas fa-shield-alt"></i></div>
        <div>
          <h3 class="text-[0.65rem] font-semibold tracking-tight leading-none mb-1">PANEL MAESTRO</h3>
          <p class="text-indigo-100/50 text-[0.55rem] font-medium uppercase tracking-widest leading-none">Gestión Técnica Global</p>
        </div>
      </div>
      <button class="bg-white text-indigo-600 font-semibold py-1.5 px-3 rounded-lg transition-all text-[0.55rem] uppercase tracking-widest" onclick="window.nav && window.nav('admin-dashboard')">ADMIN</button>
    </div>
  `;
}

window.renderChallengeBanner = function renderChallengeBanner(activeChallenge, hasCompleted) {
  if (!activeChallenge) return '';
  return `
    <div onclick="window.openChallengeEvidenceModal && window.openChallengeEvidenceModal('${activeChallenge.id}')" class="flex items-center gap-3 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl border border-amber-500/20 animate-pulse cursor-pointer transition-all group/challenge relative" title="${activeChallenge.description}">
      <div class="w-3 h-3 rounded-full bg-amber-500 animate-ping"></div>
      <span class="text-[0.8rem] font-semibold text-amber-600 uppercase tracking-widest">Reto Activo: ${activeChallenge.name}</span>
      ${hasCompleted ? '<i class="fas fa-check-circle text-emerald-500 text-sm"></i>' : ''}
    </div>
  `;
}

window.renderProjectCard = function renderProjectCard(p) {
  const currentUser = window.currentUser;
  const userRole = window.userRole;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const isEvaluated = p.score > 0 || (p.evaluations && p.evaluations.length > 0);
  const score = p.score || (p.evaluations?.[0]?.total_score || 0);

  // Privacidad: Estudiantes solo ven sus propios puntajes/votos o los de su grupo
  const isOwner = p.user_id === currentUser?.id;
  const isGroupMember = p.groups?.group_members?.some(m => m.student_id === currentUser?.id);
  const canSeeScore = isOwner || isGroupMember || userRole === 'docente' || userRole === 'admin';

  return `
    <div class="project-card group bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 flex flex-col border border-slate-100 dark:border-slate-800" data-title="${(p.title || '').toLowerCase()}" data-school="${p.students?.schools?.name || ''}">
      
      <!-- Media Header -->
      <div class="relative aspect-video bg-slate-950 overflow-hidden m-3 rounded-[2rem] shadow-inner">
        ${p.video_url ? `
            <video preload="metadata" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700">
              <source src="${p.video_url}" type="video/mp4">
            </video>
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent group-hover:from-black/20 transition-all"></div>
            <div class="absolute inset-0 flex items-center justify-center">
                <div class="w-14 h-14 bg-white/20 backdrop-blur-2xl rounded-full flex items-center justify-center border border-white/40 text-white text-xl group-hover:scale-125 group-hover:bg-primary transition-all duration-500 shadow-2xl">
                    <i class="fas fa-play ml-1"></i>
                </div>
            </div>
        ` : `
            <div class="w-full h-full flex flex-col items-center justify-center text-slate-700 bg-slate-900/50">
                <i class="fas fa-cloud-upload-alt text-3xl mb-3 opacity-20"></i>
                <span class="text-[0.7rem] font-black uppercase tracking-[0.2em] opacity-30">Pendiente de Media</span>
            </div>
        `}
        
        <div class="absolute top-4 left-4">
            <span class="px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[0.65rem] font-black uppercase tracking-widest border border-white/10 shadow-xl">
                ${p.bimestre || 1}º Bimestre
            </span>
        </div>
        
        ${canSeeScore ? `
          <div class="absolute top-4 right-4">
              <div class="px-4 py-1.5 rounded-full bg-emerald-500 text-white font-black text-xs shadow-xl border border-emerald-400/30 flex items-center gap-1.5">
                  ${score} <span class="text-[0.6rem] opacity-70 font-bold uppercase tracking-widest">PTS</span>
              </div>
          </div>
        ` : ''}
      </div>
    
      <!-- Info Content -->
      <div class="px-7 py-6 grow flex flex-col">
        <div class="flex items-center justify-between mb-5">
            <div class="flex items-center gap-3 overflow-hidden shrink min-w-0">
                <div class="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-sm shrink-0 shadow-sm border border-primary/5">
                    <i class="fas fa-school"></i>
                </div>
                <span class="text-[0.7rem] font-black uppercase tracking-[0.15em] text-slate-400 truncate tracking-tight">${sanitizeInput(p.students?.schools?.name || 'Academia 1Bot')}</span>
            </div>
            
            ${currentUser ? `
              <button onclick="window.toggleLike && window.toggleLike(${p.id})" class="flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/5 text-rose-500 hover:bg-rose-500 hover:text-white transition-all shadow-sm border border-rose-500/10 group/like">
                  <i class="fas fa-heart text-sm group-hover/like:scale-125 transition-transform"></i>
                  <span class="text-xs font-black" data-votes-id="${p.id}">${p.votes || 0}</span>
              </button>
            ` : ''}
        </div>

        <h3 class="text-xl font-black text-slate-800 dark:text-white tracking-tight mb-3 group-hover:text-primary transition-colors line-clamp-1 leading-none uppercase">${sanitizeInput(p.title)}</h3>
        <p class="text-[0.85rem] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-6 font-medium">
          ${sanitizeInput(p.description || 'Este proyecto tecnológico aún no tiene una descripción detallada.')}
        </p>

        <div class="mt-auto pt-6 border-t border-slate-50 dark:border-slate-800/50">
            <button onclick="window.viewProjectDetails && window.viewProjectDetails(${p.id})" class="w-full h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-primary shadow-sm hover:text-white text-slate-600 dark:text-slate-300 font-black text-[0.75rem] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 group/btn">
                VER PROYECTO <i class="fas fa-arrow-right text-[0.7rem] opacity-30 group-hover/btn:translate-x-1 transition-transform"></i>
            </button>
        </div>
      </div>
    </div>
  `;
}

console.log('✅ feed-ui.js refacturado (Premium Edition)');
