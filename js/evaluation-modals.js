/**
 * EVALUATION MODALS - Modales para el proceso de evaluación de proyectos (Premium Edition)
 */

async function openEvaluationModal(projectId) {
  currentEvalProjectId = projectId;

  // Intentar cargar datos existentes si es una actualización
  let existingEval = null;
  try {
    const { data } = await _supabase.from('evaluations').select('*').eq('project_id', projectId).maybeSingle();
    existingEval = data;
  } catch (e) { }

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-fadeIn overflow-y-auto';
  modal.id = 'evaluation-modal';

  const criteria = [
    { id: 'creativity', label: '💡 Creatividad e Innovación', val: existingEval?.creativity_score || 0 },
    { id: 'clarity', label: '🎯 Claridad de Presentación', val: existingEval?.clarity_score || 0 },
    { id: 'functionality', label: '⚙️ Funcionalidad Técnica', val: existingEval?.functionality_score || 0 },
    { id: 'teamwork', label: '👥 Trabajo en Equipo', val: existingEval?.teamwork_score || 0 },
    { id: 'social_impact', label: '🌍 Impacto Social', val: existingEval?.social_impact_score || 0 }
  ];

  modal.innerHTML = `
      <div class="glass-card w-full max-w-2xl p-10 animate-slideUp my-auto">
          <div class="flex justify-between items-center mb-10 border-b border-slate-100 dark:border-slate-800 pb-6">
              <div>
                  <h3 class="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Panel de Evaluación</h3>
                  <p class="text-sm font-bold text-slate-400 mt-1">Asigna el puntaje oficial basado en la rúbrica ATT.</p>
              </div>
              <button onclick="closeEvaluationModal()" class="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all font-bold text-2xl">×</button>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 mb-10">
              <div class="space-y-6">
                  ${criteria.map(c => `
                      <div>
                          <label class="flex justify-between items-center mb-2 px-1">
                              <span class="text-[0.65rem] font-black uppercase text-slate-500 tracking-widest">${c.label}</span>
                              <span class="text-[0.6rem] font-bold text-slate-400">Máx 20 pts</span>
                          </label>
                          <input type="number" id="${c.id}_score" min="0" max="20" value="${c.val}" 
                                 class="input-field-tw h-14 text-xl text-center"
                                 onchange="updateEvaluationTotal()">
                      </div>
                  `).join('')}
              </div>
              
              <div class="flex flex-col justify-between">
                  <div class="bg-slate-50 dark:bg-slate-800/50 rounded-[2.5rem] p-10 border border-slate-100 dark:border-slate-800 text-center shadow-inner">
                      <p class="text-[0.65rem] font-black uppercase text-slate-400 tracking-[0.2em] mb-4">Puntuación Final</p>
                      <div class="flex items-end justify-center gap-1">
                        <span id="eval-total-score" class="text-7xl font-black text-primary leading-none">${existingEval?.total_score || 0}</span>
                        <span class="text-2xl font-black text-slate-300 mb-2">/100</span>
                      </div>
                      <div id="eval-status-label" class="mt-6 text-[0.6rem] font-black uppercase tracking-widest px-4 py-2 rounded-full inline-block">Calificando...</div>
                  </div>
                  
                  <div class="mt-8">
                      <label class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest mb-3 block ml-1">Retroalimentación Holística</label>
                      <textarea id="eval-feedback" class="input-field-tw h-40 resize-none py-4 text-sm font-medium" placeholder="Escribe consejos constructivos para el crecimiento del estudiante...">${existingEval?.feedback || ''}</textarea>
                  </div>
              </div>
          </div>

          <button onclick="submitEvaluation()" id="btn-submit-eval" class="btn-primary-tw w-full h-16 text-lg uppercase tracking-[0.2em] shadow-2xl shadow-primary/40"><i class="fas fa-save"></i> GUARDAR EVALUACIÓN OFICIAL</button>
      </div>
    `;

  document.body.appendChild(modal);
  updateEvaluationTotal();
}

function updateEvaluationTotal() {
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
    if (total >= 90) { el.className = 'text-7xl font-black text-emerald-500 leading-none'; label.className = 'mt-6 text-[0.6rem] font-black uppercase tracking-widest px-4 py-2 rounded-full inline-block bg-emerald-500/10 text-emerald-500'; label.innerText = 'Excelente Nivel'; }
    else if (total >= 70) { el.className = 'text-7xl font-black text-amber-500 leading-none'; label.className = 'mt-6 text-[0.6rem] font-black uppercase tracking-widest px-4 py-2 rounded-full inline-block bg-amber-500/10 text-amber-500'; label.innerText = 'Nivel Satisfactorio'; }
    else { el.className = 'text-7xl font-black text-rose-500 leading-none'; label.className = 'mt-6 text-[0.6rem] font-black uppercase tracking-widest px-4 py-2 rounded-full inline-block bg-rose-500/10 text-rose-500'; label.innerText = 'Necesita Refuerzo'; }
  }
}

function closeEvaluationModal() {
  const modal = document.getElementById('evaluation-modal');
  if (modal) modal.remove();
}

// RESTO DE FUNCIONES (Detail view) se mantienen con lógica pero UI mejorada
async function viewEvaluationDetails(projectId) {
  // Esta función ya existe de forma similar en evaluation.js o project-modals.js
  // Pero la haremos coincidir con el estilo premium
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
