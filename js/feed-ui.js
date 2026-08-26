/**
 * FEED UI - Componentes visuales para el feed de proyectos (Premium Edition)
 */

window.renderTeacherPanel = function renderTeacherPanel(hasWeeklyEvidence, showReportBtn, reportAlreadySent) {
  return `
    <div class="glass-card px-6 py-5 border-none bg-slate-900 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 grow mb-8">
      <div class="flex items-center gap-5">
        <div class="w-12 h-12 rounded-[1.25rem] bg-primary/20 text-primary flex items-center justify-center text-xl shrink-0 border border-primary/20 shadow-lg shadow-primary/10">
            <i class="fas fa-chalkboard-teacher"></i>
        </div>
        <div>
          <h3 class="text-base font-bold tracking-tight leading-none mb-1.5 uppercase">Gestión Académica</h3>
          <p class="text-[0.7rem] text-primary font-black uppercase tracking-[0.2em] leading-none opacity-80">Control Docente</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-4 w-full md:w-auto">
        <div id="challenge-indicator-slot" class="w-full md:w-auto"></div>
        <div class="flex gap-3 w-full md:w-auto">
          ${hasWeeklyEvidence ? `
            <div class="bg-emerald-500/10 text-emerald-400 font-bold py-2.5 px-6 rounded-xl flex items-center gap-2 text-[0.7rem] uppercase tracking-widest border border-emerald-500/20 whitespace-nowrap">
                <i class="fas fa-check-circle"></i> EVIDENCIA LISTA
            </div>` : `
            <div class="bg-amber-500/10 text-amber-500 font-bold py-2.5 px-6 rounded-xl flex items-center gap-2 text-[0.7rem] uppercase tracking-widest border border-amber-500/20 whitespace-nowrap">
                <i class="fas fa-clock"></i> EVIDENCIA PENDIENTE
            </div>`}
          ${showReportBtn ? (reportAlreadySent ? `
            <div class="bg-emerald-500/10 text-emerald-400 font-bold py-2.5 px-6 rounded-xl flex items-center gap-2 text-[0.7rem] uppercase tracking-widest border border-emerald-500/20 whitespace-nowrap">
                <i class="fas fa-check-circle"></i> INFORME ENVIADO
            </div>` : `
            <button class="bg-primary hover:bg-primary-dark text-white font-black py-2.5 px-6 rounded-xl transition-all text-[0.7rem] uppercase tracking-widest shadow-lg shadow-primary/20" onclick="window.openMonthlyReportModal && window.openMonthlyReportModal()">INFORME</button>`) : ''}
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
    <div onclick="window.openChallengeEvidenceModal && window.openChallengeEvidenceModal('${activeChallenge.id}')" class="flex items-center gap-3 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl border border-amber-500/20 cursor-pointer transition-all group/challenge relative" title="${window.sanitizeAttr(activeChallenge.description || '')}">
      <div class="w-3 h-3 rounded-full bg-amber-500 animate-ping"></div>
      <span class="text-[0.8rem] font-semibold text-amber-600 uppercase tracking-widest">Reto Activo: ${window.sanitizeInput(activeChallenge.name || '')}</span>
      ${hasCompleted ? '<i class="fas fa-check-circle text-emerald-500 text-sm"></i>' : ''}
    </div>
  `;
}

window.renderProjectCard = function renderProjectCard(p) {
  const currentUser = window.currentUser;
  const userRole = window.userRole;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  // PostgREST embebe la relación como objeto (no array) cuando hay un
  // UNIQUE constraint en evaluations.project_id -- por eso no se puede
  // asumir p.evaluations[0], hay que soportar ambas formas.
  const evalRow = Array.isArray(p.evaluations) ? p.evaluations[0] : p.evaluations;
  const isEvaluated = p.score > 0 || !!evalRow;
  const score = p.score || evalRow?.total_score || 0;
  const feedback = evalRow?.feedback;

  // Privacidad: Estudiantes solo ven sus propios puntajes/votos o los de su grupo
  const isOwner = p.user_id === currentUser?.id;
  const isGroupMember = p.groups?.group_members?.some(m => m.student_id === currentUser?.id);
  const canSeeScore = isOwner || isGroupMember || userRole === 'docente' || userRole === 'admin';
  // El feedback del docente es privado -- solo lo ve quien subió el
  // proyecto/su equipo, o el admin. Otros docentes navegando el feed no.
  const canSeeFeedback = isOwner || isGroupMember || userRole === 'admin';

  return `
    <div class="project-card group bg-white dark:bg-slate-900 rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col border border-slate-100 dark:border-slate-800" data-title="${(p.title || '').toLowerCase()}" data-school="${p.students?.schools?.name || ''}">

      <!-- Media Header -->
      <div class="relative aspect-video bg-slate-950 overflow-hidden">
        ${p.video_url ? `
            <video preload="metadata" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-500">
              <source src="${p.video_url}" type="video/mp4">
            </video>
            <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent group-hover:from-black/20 transition-all"></div>
            <div class="absolute inset-0 flex items-center justify-center">
                <div class="w-10 h-10 bg-white/20 backdrop-blur-2xl rounded-full flex items-center justify-center border border-white/40 text-white text-sm group-hover:scale-110 group-hover:bg-primary transition-all duration-300 shadow-xl">
                    <i class="fas fa-play ml-0.5"></i>
                </div>
            </div>
        ` : `
            <div class="w-full h-full flex flex-col items-center justify-center text-slate-700 bg-slate-900/50">
                <i class="fas fa-cloud-upload-alt text-2xl mb-2 opacity-20"></i>
                <span class="text-[0.6rem] font-black uppercase tracking-[0.2em] opacity-30">Pendiente de Media</span>
            </div>
        `}

        <div class="absolute top-2.5 left-2.5">
            <span class="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[0.55rem] font-black uppercase tracking-widest border border-white/10">
                ${p.bimestre || 1}º Bimestre
            </span>
        </div>

        ${canSeeScore ? `
          <div class="absolute top-2.5 right-2.5">
              <div class="px-3 py-1 rounded-full bg-emerald-500 text-white font-black text-[0.7rem] shadow-lg flex items-center gap-1">
                  ${score} <span class="text-[0.55rem] opacity-70 font-bold uppercase tracking-widest">PTS</span>
              </div>
          </div>
        ` : ''}
      </div>

      <!-- Info Content -->
      <div class="px-4 py-4 grow flex flex-col">
        <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2 overflow-hidden shrink min-w-0">
                <div class="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[0.65rem] shrink-0">
                    <i class="fas fa-school"></i>
                </div>
                <span class="text-[0.6rem] font-black uppercase tracking-widest text-slate-400 truncate">${sanitizeInput(p.students?.schools?.name || 'Academia Quetzal LMS')}</span>
            </div>

            ${currentUser ? `
              <button onclick="window.toggleLike && window.toggleLike(${p.id})" class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/5 text-rose-500 hover:bg-rose-500 hover:text-white transition-all group/like shrink-0">
                  <i class="fas fa-heart text-xs group-hover/like:scale-125 transition-transform"></i>
                  <span class="text-[0.7rem] font-black" data-votes-id="${p.id}">${p.votes || 0}</span>
              </button>
            ` : ''}
        </div>

        <h3 class="text-sm font-black text-slate-800 dark:text-white tracking-tight mb-1.5 group-hover:text-primary transition-colors line-clamp-1 uppercase">${sanitizeInput(p.title)}</h3>
        <p class="text-[0.75rem] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-3 font-medium">
          ${sanitizeInput(p.description || 'Este proyecto tecnológico aún no tiene una descripción detallada.')}
        </p>

        ${canSeeFeedback && feedback ? `
          <div class="mb-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border-l-4 border-indigo-400">
            <div class="text-[0.55rem] font-black uppercase text-indigo-500 tracking-widest mb-1"><i class="fas fa-comment-dots"></i> Feedback del docente</div>
            <p class="text-[0.75rem] text-slate-600 dark:text-slate-300 italic line-clamp-3">"${sanitizeInput(feedback)}"</p>
          </div>
        ` : ''}

        <div class="mt-auto pt-3 border-t border-slate-50 dark:border-slate-800/50">
            <button onclick="window.viewProjectDetails && window.viewProjectDetails(${p.id})" class="w-full h-9 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-primary shadow-sm hover:text-white text-slate-600 dark:text-slate-300 font-black text-[0.65rem] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 group/btn">
                VER PROYECTO <i class="fas fa-arrow-right text-[0.6rem] opacity-30 group-hover/btn:translate-x-1 transition-transform"></i>
            </button>
        </div>
      </div>
    </div>
  `;
}

console.log('✅ feed-ui.js refacturado (Premium Edition)');
