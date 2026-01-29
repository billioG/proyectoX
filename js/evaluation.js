/**
 * EVALUACIÓN - Controlador principal (Premium Edition)
 */

window.currentEvalProjectId = null;

window.loadEvaluationProjects = async function loadEvaluationProjects() {
  const container = document.getElementById('eval-projects-container');
  if (!container) return;

  const userRole = window.userRole;
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const fetchWithCache = window.fetchWithCache;

  if (!container.innerHTML || container.innerHTML.includes('fa-circle-notch')) {
    container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-20 text-slate-400">
                <i class="fas fa-circle-notch fa-spin text-4xl mb-4 text-primary"></i>
                <span class="font-black uppercase text-xs tracking-widest text-center">Sincronizando Proyectos por Evaluar...</span>
            </div>
        `;
  }

  try {
    if (userRole === 'docente' && typeof window.loadTeacherNotifications === 'function') await window.loadTeacherNotifications();

    await fetchWithCache('evaluation_projects_list', async () => {
      const { data: allProjects, error } = await _supabase.from('projects')
        .select(`*, students(*, schools(*)), groups(name), evaluations(id, total_score)`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      let finalProjects = allProjects;
      if (userRole === 'docente') {
        const { data: assignments } = await _supabase.from('teacher_assignments').select('school_code, grade, section').eq('teacher_id', currentUser.id);
        finalProjects = allProjects.filter(p => (assignments || []).some(a => p.students?.school_code === a.school_code && p.students?.grade === a.grade && p.students?.section === a.section));
      }
      return finalProjects;
    }, (projects) => {
      window.allEvalProjects = projects;
      window.renderEvaluationDashboard(projects, container);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="p-10 text-rose-500 font-bold glass-card">❌ Error al cargar proyectos</div>';
  }
}

window.renderEvaluationDashboard = function renderEvaluationDashboard(projects, container) {
  const total = projects.length;
  const evaluated = projects.filter(p => (p.evaluations?.length > 0) || p.score > 0).length;
  const pending = total - evaluated;

  container.innerHTML = `
    <div class="glass-card p-6 mb-10 flex flex-col md:flex-row gap-6 items-center">
      <div class="relative grow w-full">
        <i class="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"></i>
        <input type="text" id="eval-search-input" placeholder="Buscar por alumno, escuela o proyecto..." 
               class="input-field-tw pl-14" 
               oninput="window.debouncedFilter(this.value)">
      </div>
      <div class="flex gap-3 shrink-0 items-center">
        <label class="flex items-center gap-2 mr-4 cursor-pointer group">
            <div class="relative w-10 h-6 bg-slate-200 dark:bg-slate-700 rounded-full transition-colors group-has-[:checked]:bg-primary">
                <input type="checkbox" id="eval-toggle-pending" class="sr-only peer" checked onchange="window.filterEvaluationProjects(document.getElementById('eval-search-input').value)">
                <div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
            </div>
            <span class="text-[0.6rem] font-black uppercase tracking-widest text-slate-400">Sólo Pendientes</span>
        </label>

        <div class="bg-primary/10 text-primary px-5 py-3 rounded-2xl font-black flex flex-col items-center min-w-[80px]">
            <span class="text-xl leading-none">${total}</span>
            <span class="text-[0.6rem] uppercase opacity-70">Total</span>
        </div>
        <div class="bg-emerald-500/10 text-emerald-600 px-5 py-3 rounded-2xl font-black flex flex-col items-center min-w-[100px]">
            <span class="text-xl leading-none">${evaluated}</span>
            <span class="text-[0.6rem] uppercase opacity-70">Listos</span>
        </div>
        <div class="bg-rose-500/10 text-rose-600 px-5 py-3 rounded-2xl font-black flex flex-col items-center min-w-[100px]">
            <span class="text-xl leading-none">${pending}</span>
            <span class="text-[0.6rem] uppercase opacity-70">Pendientes</span>
        </div>
      </div>
    </div>

    <div id="eval-grouped-container" class="space-y-6 animate-fadeIn">${window.renderGroupedProjects(projects)}</div>
  `;
}

window.debouncedFilter = typeof window.debounce === 'function' ? window.debounce(val => window.filterEvaluationProjects(val), 300) : val => window.filterEvaluationProjects(val);

window.filterEvaluationProjects = function (val) {
  const query = (val || '').toLowerCase().trim();
  const container = document.getElementById('eval-grouped-container');
  if (!container || !window.allEvalProjects) return;

  const onlyPending = document.getElementById('eval-toggle-pending')?.checked || false;

  let filtered = window.allEvalProjects || [];

  if (query) {
    filtered = filtered.filter(p =>
      (p.title || '').toLowerCase().includes(query) ||
      (p.students?.full_name || '').toLowerCase().includes(query) ||
      (p.students?.schools?.name || '').toLowerCase().includes(query)
    );
  }

  if (onlyPending) {
    filtered = filtered.filter(p => !((p.evaluations?.length > 0) || p.score > 0));
  }

  container.innerHTML = window.renderGroupedProjects(filtered);
};

window.renderGroupedProjects = function renderGroupedProjects(projects) {
  const sanitizeInput = window.sanitizeInput;
  if (projects.length === 0) return `
    <div class="text-center py-20 bg-slate-100 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700">
        <i class="fas fa-folder-open text-5xl text-slate-300 dark:text-slate-700 mb-4 opacity-50"></i>
        <p class="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-sm text-center">No se encontraron proyectos para evaluar</p>
    </div>
  `;

  const grouped = projects.reduce((acc, p) => {
    const school = p.students?.schools?.name || 'Otro';
    if (!acc[school]) acc[school] = [];
    acc[school].push(p);
    return acc;
  }, {});

  return Object.keys(grouped).sort().map(school => {
    const pendings = grouped[school].filter(p => !((p.evaluations?.length > 0) || p.score > 0)).length;
    return `
      <details class="group/school bg-white dark:bg-slate-900 overflow-hidden rounded-[2rem] border border-slate-100 dark:border-slate-800" ${pendings > 0 ? 'open' : ''}>
          <summary class="list-none cursor-pointer p-6 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-lg"><i class="fas fa-school"></i></div>
                  <div>
                      <h3 class="text-lg font-black text-slate-800 dark:text-white leading-none">${sanitizeInput(school)}</h3>
                      <div class="flex items-center gap-2 mt-1">
                          <span class="text-[0.6rem] font-bold text-slate-400 uppercase tracking-widest">${grouped[school].length} PROYECTOS</span>
                          ${pendings > 0 ? `<span class="bg-rose-500 text-white text-[0.5rem] font-black px-2 py-0.5 rounded-full animate-pulse">${pendings} PENDIENTES</span>` : ''}
                      </div>
                  </div>
              </div>
              <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-open/school:rotate-180 transition-transform">
                  <i class="fas fa-chevron-down text-xs text-slate-400"></i>
              </div>
          </summary>
          <div class="p-6 pt-0">
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  ${grouped[school].map(p => window.renderProjectEvalCard(p)).join('')}
              </div>
          </div>
      </details>
    `;
  }).join('');
}

window.renderProjectEvalCard = function renderProjectEvalCard(p) {
  const sanitizeInput = window.sanitizeInput;
  const isEvaluated = (p.evaluations?.length > 0) || p.score > 0;
  return `
    <div class="glass-card p-6 flex flex-col relative overflow-hidden transition-all duration-300 ${isEvaluated ? 'opacity-70 grayscale-[0.5]' : 'border-2 border-primary/20 bg-primary/5 shadow-lg shadow-primary/5'}">
      ${!isEvaluated ? `<div class="absolute -right-4 -top-4 w-12 h-12 bg-primary rotate-45 flex items-end justify-center pb-1"><i class="fas fa-bolt text-white text-[0.6rem] -rotate-45"></i></div>` : ''}
      
      <div class="flex justify-between items-start mb-6">
        <div class="min-w-0 pr-4">
            <h4 class="text-lg font-black text-slate-800 dark:text-white leading-tight mb-1 truncate">${sanitizeInput(p.title)}</h4>
            <div class="text-xs font-bold text-slate-400 dark:text-slate-500 flex items-center gap-2">
                <i class="fas fa-user-graduate"></i> <span class="truncate">${p.students?.full_name}</span>
            </div>
        </div>
        <div class="${isEvaluated ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-rose-500 animate-pulse shadow-rose-500/20'} text-white text-xs font-black px-3 py-1.5 rounded-xl shadow-lg">
            ${isEvaluated ? p.score || p.evaluations[0].total_score : 'PENDIENTE'}
        </div>
      </div>
      
      <div class="mt-auto flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/50">
        <button class="grow btn-primary-tw py-2.5 text-xs uppercase" 
                onclick="window.openEvaluationModal(${p.id})">
            ${isEvaluated ? '<i class="fas fa-edit"></i> ACTUALIZAR' : '<i class="fas fa-clipboard-check"></i> EVALUAR'}
        </button>
        <button class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-primary transition-all flex items-center justify-center" 
                onclick="window.viewProjectDetails(${p.id})">
            <i class="fas fa-eye text-sm"></i>
        </button>
      </div>
    </div>
  `;
}

window.submitEvaluation = async function submitEvaluation() {
  const creativity = parseInt(document.getElementById('creativity_score')?.value) || 0;
  const clarity = parseInt(document.getElementById('clarity_score')?.value) || 0;
  const functionality = parseInt(document.getElementById('functionality_score')?.value) || 0;
  const teamwork = parseInt(document.getElementById('teamwork_score')?.value) || 0;
  const socialImpact = parseInt(document.getElementById('social_impact_score')?.value) || 0;
  const feedback = document.getElementById('eval-feedback')?.value.trim();
  const total = creativity + clarity + functionality + teamwork + socialImpact;

  const evalData = {
    project_id: currentEvalProjectId,
    teacher_id: window.currentUser.id,
    total_score: total,
    creativity_score: creativity,
    clarity_score: clarity,
    functionality_score: functionality,
    teamwork_score: teamwork,
    social_impact_score: socialImpact,
    feedback: feedback
  };

  try {
    // USAR EL GESTOR DE SINCRONIZACIÓN (MODO KOLIBRI / OFFLINE)
    await window._syncManager.enqueue('save_evaluation', evalData);

    window.showToast('✅ Evaluación registrada (Pendiente Sync)', 'success');
    if (typeof window.closeEvaluationModal === 'function') window.closeEvaluationModal();
    window.loadEvaluationProjects();
  } catch (err) {
    console.error(err);
    window.showToast('❌ Error al registrar evaluación', 'error');
  }
}

console.log('✅ evaluation.js refacturado (Premium Edition)');
