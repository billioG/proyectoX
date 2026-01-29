/**
 * RANKING - Hall de la Fama 1Bot (Premium Edition)
 */

window.loadRanking = async function loadRanking() {
  const container = document.getElementById('ranking-container');
  if (!container) return;

  const _supabase = window._supabase;
  const fetchWithCache = window.fetchWithCache;

  if (!container.innerHTML || container.innerHTML.includes('fa-circle-notch')) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center p-20 text-slate-400">
          <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
          <span class="font-black uppercase text-xs tracking-widest text-center">Analizando el Top Global del Año...</span>
      </div>
    `;
  }

  try {
    await fetchWithCache('global_ranking_top_20', async () => {
      // Para el ranking, mostramos los top 20 más innovadores (combinación de likes y puntaje)
      return await _supabase.from('projects')
        .select(`*, students(id, full_name, school_code, grade, section, schools(name)), groups(name)`)
        .not('score', 'is', null)
        .order('votes', { ascending: false })
        .order('score', { ascending: false })
        .limit(20);
    }, (projects) => {
      window.allRankingProjects = projects;
      window.renderRankingInterface(container);
      window.renderRankingRows(projects);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="glass-card p-10 text-rose-500 font-bold text-center">❌ Error sincronizando el Hall de la Fama</div>';
  }
}

window.renderRankingInterface = function renderRankingInterface(container) {
  const userRole = window.userRole;
  const sanitizeInput = window.sanitizeInput;
  container.innerHTML = `
    <div class="glass-card p-6 md:p-8 mb-8 overflow-hidden relative border-none bg-slate-900 text-white shadow-xl">
        <div class="absolute -right-10 -top-10 text-[10rem] opacity-[0.05] rotate-12 text-blue-400 pointer-events-none transition-transform group-hover:rotate-45"><i class="fas fa-award"></i></div>
        <div class="relative z-10">
            <h3 class="text-2xl font-bold mb-1 tracking-tight uppercase">HALL DE LA FAMA 1BOT</h3>
            <p class="text-white/60 font-medium max-w-2xl leading-relaxed text-[0.7rem] uppercase tracking-widest">Excelencia técnica y validación de la comunidad.</p>
        </div>
    </div>

    <!-- Filtros -->
    ${userRole !== 'estudiante' ? `
    <div class="flex flex-col md:flex-row gap-4 mb-8 animate-fadeIn">
        <div class="grow flex flex-col md:flex-row gap-4">
            <div class="w-full md:w-64">
                <label class="text-[0.8rem] font-bold uppercase text-slate-400 tracking-wider ml-1 mb-2 block">Establecimiento</label>
                <select id="rank-school" class="input-field-tw border-slate-100 dark:border-slate-800 text-sm h-11" onchange="window.filterRanking()">
                    <option value="">Planteles (Todos)</option>
                </select>
            </div>
            <div class="w-full md:w-40">
                <label class="text-[0.8rem] font-bold uppercase text-slate-400 tracking-wider ml-1 mb-2 block">Grado</label>
                <select id="rank-grade" class="input-field-tw border-slate-100 dark:border-slate-800 text-sm h-11" onchange="window.filterRanking()">
                    <option value="">Grados</option>
                </select>
            </div>
            <div class="w-full md:w-40">
                <label class="text-[0.8rem] font-bold uppercase text-slate-400 tracking-wider ml-1 mb-2 block">Bimestre</label>
                <select id="rank-bimestre" class="input-field-tw border-slate-100 dark:border-slate-800 text-sm h-11" onchange="window.filterRanking()">
                    <option value="">Año Completo</option>
                    <option value="1">1º Bimestre</option>
                    <option value="2">2º Bimestre</option>
                    <option value="3">3º Bimestre</option>
                    <option value="4">4º Bimestre</option>
                </select>
            </div>
        </div>
        <div class="shrink-0 flex items-end">
            <button onclick="window.loadRanking()" class="btn-secondary-tw h-11 px-6 uppercase tracking-widest text-xs font-bold"><i class="fas fa-sync-alt shadow-none mb-0"></i></button>
        </div>
    </div>
    ` : ''}

    <div id="ranking-list" class="space-y-4 animate-fadeIn" style="animation-delay: 100ms"></div>
  `;

  const schools = [...new Set(window.allRankingProjects.map(p => p.students?.schools?.name))].filter(Boolean).sort();
  const grades = [...new Set(window.allRankingProjects.map(p => p.students?.grade))].filter(Boolean).sort();

  const schSelect = document.getElementById('rank-school');
  const grdSelect = document.getElementById('rank-grade');
  if (schSelect) schSelect.innerHTML += schools.map(s => `<option value="${s}">${sanitizeInput(s)}</option>`).join('');
  if (grdSelect) grdSelect.innerHTML += grades.map(g => `<option value="${g}">${sanitizeInput(g)}</option>`).join('');
}

window.renderRankingRows = function renderRankingRows(projects) {
  const list = document.getElementById('ranking-list');
  if (!list) return;

  if (projects.length === 0) {
    list.innerHTML = `<div class="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No hay datos para esta selección</div>`;
    return;
  }

  list.innerHTML = projects.map((p, index) => {
    const isTop3 = index < 3;
    const medals = ['🥇', '🥈', '🥉'];
    const colors = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-800', 'bg-orange-500 text-orange-50'];

    // Privacidad: Solo dueño/equipo/docente ve puntajes reales en ranking ajeno
    const isOwner = p.user_id === currentUser?.id;
    const isGroupMember = p.groups?.group_members?.some(m => m.student_id === currentUser?.id);
    const canSeeScore = isOwner || isGroupMember || userRole === 'docente' || userRole === 'admin';

    return `
      <div class="glass-card p-5 md:p-6 flex flex-col md:flex-row items-center gap-6 group hover:translate-x-2 transition-all duration-300 border-none bg-white dark:bg-slate-900 shadow-lg relative overflow-hidden">
        ${isTop3 ? `<div class="absolute left-0 top-0 bottom-0 w-1.5 ${index === 0 ? 'bg-amber-400' : (index === 1 ? 'bg-slate-300' : 'bg-orange-600')}"></div>` : ''}
        
        <div class="w-12 h-12 shrink-0 flex items-center justify-center font-bold text-xl rounded-2xl ${isTop3 ? colors[index] : 'bg-slate-50 dark:bg-slate-800 text-slate-400 shadow-inner'}">
          ${isTop3 ? medals[index] : (index + 1)}
        </div>
        
        <div class="grow min-w-0 text-center md:text-left">
          <div class="flex flex-wrap justify-center md:justify-start gap-1.5 mb-2">
              <span class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 text-[0.65rem] font-bold uppercase tracking-widest leading-none">${sanitizeInput(p.students?.schools?.name || 'ENTIDAD')}</span>
              <span class="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-[0.65rem] font-bold uppercase tracking-widest leading-none">${sanitizeInput(p.students?.grade)}</span>
              <span class="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 text-[0.65rem] font-bold uppercase tracking-widest leading-none">${p.bimestre}º Bimestre</span>
          </div>
          <h3 class="text-xl font-bold text-slate-800 dark:text-white leading-tight truncate uppercase tracking-tight mb-1">${sanitizeInput(p.title)}</h3>
          <p class="text-[0.7rem] font-semibold text-slate-400 uppercase tracking-widest ml-0.5">Líder: ${sanitizeInput(p.students?.full_name)}</p>
        </div>

        <div class="flex items-center gap-6 md:gap-8 shrink-0 bg-slate-50/50 dark:bg-slate-800/50 p-4 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 shadow-inner">
          <div class="text-center min-w-[50px]">
              <div class="text-[0.5rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Score</div>
              <div class="text-2xl font-bold ${canSeeScore ? 'text-primary' : 'text-slate-200 dark:text-slate-700'} leading-none">
                ${canSeeScore ? (p.score || 0) : '—'}
              </div>
          </div>
          
          <div class="text-center min-w-[50px]">
              <div class="text-[0.5rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5">Votos</div>
              <div class="text-2xl font-bold ${canSeeScore ? 'text-rose-500' : 'text-slate-200 dark:text-slate-700'} leading-none flex items-center justify-center gap-1.5">
                  ${canSeeScore ? `<i class="fas fa-heart text-xs opacity-50"></i> ${p.votes || 0}` : '—'}
              </div>
          </div>

          <button onclick="viewProjectDetails(${p.id})" class="w-11 h-11 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-primary hover:border-primary transition-all rounded-xl flex items-center justify-center shadow-sm">
              <i class="fas fa-expand-alt text-sm"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function filterRanking() {
  const school = document.getElementById('rank-school')?.value;
  const grade = document.getElementById('rank-grade')?.value;
  const bimestre = document.getElementById('rank-bimestre')?.value;

  const filtered = (window.allRankingProjects || []).filter(p => {
    return (!school || p.students?.schools?.name === school) &&
      (!grade || p.students?.grade === grade) &&
      (!bimestre || String(p.bimestre) === bimestre);
  });

  renderRankingRows(filtered);
}

console.log('✅ ranking.js refacturado (Top 20 Hall of Fame)');
