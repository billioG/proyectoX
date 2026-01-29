/**
 * EVALUATION MODALS - Modales para el proceso de evaluación de proyectos (Premium Edition)
 */

window.openEvaluationModal = async function openEvaluationModal(projectId) {
    window.currentEvalProjectId = projectId;
    const _supabase = window._supabase;
    const showToast = window.showToast;
    const sanitizeInput = window.sanitizeInput || ((v) => v);

    // Cargar datos del proyecto y evaluación existente
    let project = null;
    let existingEval = null;
    try {
        const { data: projData, error: projError } = await _supabase
            .from('projects')
            .select(`
        *,
        students(id, full_name, school_code, grade, section, schools(name)),
        groups(id, name)
      `)
            .eq('id', projectId)
            .single();

        if (projError) throw projError;
        project = projData;

        const { data: evalData } = await _supabase.from('evaluations').select('*').eq('project_id', projectId).maybeSingle();
        existingEval = evalData;
    } catch (e) {
        console.error("Error cargando contexto de evaluación:", e);
        if (typeof showToast === 'function') showToast('❌ No se pudo cargar el proyecto para evaluar', 'error');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto';
    modal.id = 'evaluation-modal';

    const criteria = [
        { id: 'creativity', label: '💡 Creatividad e Innovación', val: existingEval?.creativity_score || 0 },
        { id: 'clarity', label: '🎯 Claridad de Presentación', val: existingEval?.clarity_score || 0 },
        { id: 'functionality', label: '⚙️ Funcionalidad Técnica', val: existingEval?.functionality_score || 0 },
        { id: 'teamwork', label: '👥 Trabajo en Equipo', val: existingEval?.teamwork_score || 0 },
        { id: 'social_impact', label: '🌍 Impacto Social', val: existingEval?.social_impact_score || 0 }
    ];

    modal.innerHTML = `
      <div class="glass-card w-full max-w-4xl p-0 animate-slideUp my-8 bg-white dark:bg-slate-900 border-none shadow-2xl overflow-hidden">
          <div class="flex flex-col h-full">
              <!-- Top Part: Project View -->
              <div class="w-full bg-slate-50 dark:bg-slate-950/50 p-8 border-b border-slate-100 dark:border-slate-800">
                  <div class="flex justify-between items-start mb-6">
                      <div>
                          <h2 class="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">${sanitizeInput(project.title)}</h2>
                          <div class="flex gap-2 mt-2">
                              <span class="text-[0.6rem] font-bold bg-primary/10 text-primary px-2 py-1 rounded-md uppercase tracking-widest">${project.bimestre || 1}º Bimestre</span>
                              <span class="text-[0.6rem] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500 px-2 py-1 rounded-md uppercase tracking-widest">👤 ${sanitizeInput(project.students?.full_name)}</span>
                          </div>
                      </div>
                      <button onclick="window.closeEvaluationModal()" class="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all font-bold text-2xl">×</button>
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div class="rounded-3xl overflow-hidden bg-black shadow-2xl ring-1 ring-slate-800">
                        <video controls class="w-full aspect-video">
                            <source src="${project.video_url}" type="video/mp4">
                        </video>
                    </div>

                    <div class="bg-white dark:bg-slate-800/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 flex flex-col">
                        <h4 class="text-xs font-bold uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-2">
                            <i class="fas fa-align-left text-primary"></i> Resumen del Proyecto
                        </h4>
                        <p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed overflow-y-auto custom-scrollbar italic flex-grow">
                            "${sanitizeInput(project.description)}"
                        </p>
                    </div>
                  </div>
              </div>

              <!-- Bottom Part: Evaluation Form -->
              <div class="w-full p-8 flex flex-col relative">
                  <div class="flex justify-between items-center mb-8">
                      <h3 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Rúbrica de Evaluación Oficial</h3>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                      ${criteria.map(c => `
                          <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                              <label class="flex justify-between items-center mb-2 px-1">
                                  <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest">${c.label.split(' ')[0]}</span>
                                  <span class="text-[0.55rem] font-bold text-primary bg-primary/5 px-2 py-1 rounded-lg">20</span>
                              </label>
                              <input type="number" id="${c.id}_score" min="0" max="20" value="${c.val}" 
                                     class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl h-11 text-lg font-black text-center text-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                     onchange="window.updateEvaluationTotal()">
                               <div class="text-[0.5rem] text-center mt-1 text-slate-400 font-bold uppercase">${c.label.split(' ').slice(1).join(' ')}</div>
                          </div>
                      `).join('')}
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
                      <div class="md:col-span-2">
                        <label class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest mb-2 block ml-1">Observaciones / Feedback constructivo</label>
                        <textarea id="eval-feedback" class="w-full h-32 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium resize-none focus:ring-2 focus:ring-primary/20 transition-all font-sans" placeholder="Escribe aquí los consejos para el equipo...">${existingEval?.feedback || ''}</textarea>
                      </div>

                      <div class="flex flex-col gap-4">
                        <div class="bg-primary/5 dark:bg-primary/10 p-4 rounded-2xl border border-primary/10 text-center">
                            <div class="text-[0.55rem] font-black uppercase text-primary tracking-[0.2em] mb-1">Puntuación Final</div>
                            <div class="flex items-end justify-center gap-1 leading-none">
                                <span id="eval-total-score" class="text-4xl font-black text-primary">${existingEval?.total_score || 0}</span>
                                <span class="text-sm font-black text-slate-400 mb-1">/100</span>
                            </div>
                            <div id="eval-status-label" class="mt-2 text-[0.5rem] font-black uppercase tracking-widest px-2 py-1 rounded-full inline-block">Calificando...</div>
                        </div>
                        <button onclick="window.submitEvaluation && window.submitEvaluation()" id="btn-submit-eval" class="btn-primary-tw w-full h-14 text-sm font-black uppercase tracking-widest shadow-xl shadow-primary/30 transform hover:scale-[1.02] active:scale-95 transition-all"><i class="fas fa-save mr-2"></i> GUARDAR NOTA</button>
                      </div>
                  </div>
              </div>
          </div>
      </div>
    `;

    document.body.appendChild(modal);
    window.updateEvaluationTotal();
}

window.updateEvaluationTotal = function updateEvaluationTotal() {
    const fields = ['creativity', 'clarity', 'functionality', 'teamwork', 'social_impact'];
    let total = 0;

    fields.forEach(f => {
        const input = document.getElementById(`${f}_score`);
        let val = parseInt(input?.value) || 0;
        if (val > 20) { val = 20; if (input) input.value = 20; }
        if (val < 0) { val = 0; if (input) input.value = 0; }
        total += val;
    });

    const el = document.getElementById('eval-total-score');
    const label = document.getElementById('eval-status-label');
    if (el) {
        el.textContent = total;
        if (total >= 90) { el.className = 'text-7xl font-black text-emerald-500 leading-none'; if (label) { label.className = 'mt-6 text-[0.6rem] font-black uppercase tracking-widest px-4 py-2 rounded-full inline-block bg-emerald-500/10 text-emerald-500'; label.innerText = 'Excelente Nivel'; } }
        else if (total >= 70) { el.className = 'text-7xl font-black text-amber-500 leading-none'; if (label) { label.className = 'mt-6 text-[0.6rem] font-black uppercase tracking-widest px-4 py-2 rounded-full inline-block bg-amber-500/10 text-amber-500'; label.innerText = 'Nivel Satisfactorio'; } }
        else { el.className = 'text-7xl font-black text-rose-500 leading-none'; if (label) { label.className = 'mt-6 text-[0.6rem] font-black uppercase tracking-widest px-4 py-2 rounded-full inline-block bg-rose-500/10 text-rose-500'; label.innerText = 'Necesita Refuerzo'; } }
    }
}

window.closeEvaluationModal = function closeEvaluationModal() {
    const modal = document.getElementById('evaluation-modal');
    if (modal) modal.remove();
}

// RESTO DE FUNCIONES (Detail view) se mantienen con lógica pero UI mejorada
window.viewEvaluationDetails = async function viewEvaluationDetails(projectId) {
    const _supabase = window._supabase;
    const sanitizeInput = window.sanitizeInput || ((v) => v);

    const { data: e } = await _supabase.from('evaluations').select('*').eq('project_id', projectId).single();
    if (!e) return;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
      <div class="glass-card w-full max-w-lg p-10 animate-slideUp">
          <div class="flex justify-between items-center mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 class="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Resumen de Calificación</h3>
              <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-rose-500 font-bold text-2xl">×</button>
          </div>
          <div class="flex items-center justify-center gap-4 mb-10 bg-slate-50 dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-800">
              <div class="text-center">
                  <div class="text-[0.6rem] font-black text-slate-400 tracking-widest mb-1 uppercase">Puntuación Total</div>
                  <div class="text-6xl font-black text-primary">${e.total_score}<span class="text-xl text-slate-300">/100</span></div>
              </div>
          </div>
          <div class="grid grid-cols-2 gap-4 mb-8">
              <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 flex justify-between items-center">
                  <span class="text-[0.6rem] font-black text-slate-400 uppercase tracking-widest">Creatividad</span>
                  <span class="font-black text-slate-700 dark:text-slate-200">${e.creativity_score}</span>
              </div>
              <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 flex justify-between items-center">
                  <span class="text-[0.6rem] font-black text-slate-400 uppercase tracking-widest">Claridad</span>
                  <span class="font-black text-slate-700 dark:text-slate-200">${e.clarity_score}</span>
              </div>
              <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 flex justify-between items-center">
                  <span class="text-[0.6rem] font-black text-slate-400 uppercase tracking-widest">Técnica</span>
                  <span class="font-black text-slate-700 dark:text-slate-200">${e.functionality_score}</span>
              </div>
              <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 flex justify-between items-center">
                  <span class="text-[0.6rem] font-black text-slate-400 uppercase tracking-widest">Equipo</span>
                  <span class="font-black text-slate-700 dark:text-slate-200">${e.teamwork_score}</span>
              </div>
          </div>
          <p class="text-sm font-medium italic text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border-l-4 border-primary">
              "${sanitizeInput(e.feedback || 'Sin comentarios adicionales')}"
          </p>
      </div>
    `;
    document.body.appendChild(modal);
}

console.log('✅ evaluation-modals.js refacturado (Premium Edition)');
