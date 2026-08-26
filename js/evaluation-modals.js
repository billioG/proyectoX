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
        if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> No se pudo cargar el proyecto para evaluar', 'error');
        return;
    }

    let aiEval = null;
    try {
        const { data } = await _supabase.from('ai_evaluations').select('*').eq('project_id', projectId).maybeSingle();
        aiEval = data;
    } catch (e) {
        // Tabla ai_evaluations puede no existir todavía en algunos entornos -- no es bloqueante.
    }

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto';
    modal.id = 'evaluation-modal';

    const criteria = [
        { id: 'creativity', icon: 'fa-lightbulb', text: 'Creatividad e Innovación', desc: 'Qué tan original e innovadora es la idea del proyecto.', val: existingEval?.creativity_score || 0 },
        { id: 'clarity', icon: 'fa-bullseye', text: 'Claridad de Presentación', desc: 'Qué tan bien se explica y se entiende el proyecto.', val: existingEval?.clarity_score || 0 },
        { id: 'functionality', icon: 'fa-gear', text: 'Funcionalidad Técnica', desc: 'Qué tan bien funciona técnicamente lo que construyeron.', val: existingEval?.functionality_score || 0 },
        { id: 'teamwork', icon: 'fa-users', text: 'Trabajo en Equipo', desc: 'Qué tan bien se nota la colaboración entre los integrantes.', val: existingEval?.teamwork_score || 0 },
        { id: 'social_impact', icon: 'fa-earth-americas', text: 'Impacto Social', desc: 'Qué tanto beneficia o resuelve un problema real de la comunidad.', val: existingEval?.social_impact_score || 0 }
    ];

    modal.innerHTML = `
      <button onclick="window.closeEvaluationModal()" class="fixed top-6 right-6 z-[110] w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-xl flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all font-bold text-2xl">×</button>
      <div class="glass-card w-full max-w-4xl p-0 animate-slideUp my-8 bg-white dark:bg-slate-900 border-none shadow-2xl overflow-hidden">
          <div class="flex flex-col h-full">
              <!-- Top Part: Project View -->
              <div class="w-full bg-slate-50 dark:bg-slate-950/50 p-8 border-b border-slate-100 dark:border-slate-800">
                  <div class="flex justify-between items-start mb-6">
                      <div>
                          <h2 class="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">${sanitizeInput(project.title)}</h2>
                          <div class="flex gap-2 mt-2">
                              <span class="text-[0.6rem] font-bold bg-primary/10 text-primary px-2 py-1 rounded-md uppercase tracking-widest">${project.bimestre || 1}º Bimestre</span>
                              <span class="text-[0.6rem] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500 px-2 py-1 rounded-md uppercase tracking-widest"><i class="fas fa-user"></i> ${sanitizeInput(project.students?.full_name)}</span>
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
                  <div class="flex justify-between items-center mb-4">
                      <h3 class="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Rúbrica de Evaluación Oficial</h3>
                  </div>

                  <div id="ai-eval-panel" class="mb-6 p-5 rounded-2xl border ${aiEval ? 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20' : 'border-dashed border-slate-200 dark:border-slate-700'}">
                    ${aiEval ? `
                      <div class="flex justify-between items-start gap-4">
                        <div>
                          <div class="text-[0.6rem] font-black uppercase text-indigo-500 tracking-widest mb-1"><i class="fas fa-robot"></i> Segunda opinión (IA) -- ${aiEval.total_score}/100</div>
                          <p class="text-xs text-slate-600 dark:text-slate-300 italic">"${sanitizeInput(aiEval.feedback || '')}"</p>
                        </div>
                        <button onclick="window.runAiEvaluation('${projectId}')" class="shrink-0 h-8 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-500 text-[0.6rem] font-bold uppercase" id="btn-ai-evaluate"><i class="fas fa-rotate"></i> Volver a evaluar</button>
                      </div>
                    ` : `
                      <div class="flex items-center justify-between gap-4">
                        <p class="text-xs text-slate-400"><i class="fas fa-robot mr-1"></i> La IA puede dar una segunda opinión basada en el título y la descripción (no ve el video).</p>
                        <button onclick="window.runAiEvaluation('${projectId}')" class="shrink-0 btn-secondary-tw h-9 px-4 text-[0.65rem] uppercase font-bold" id="btn-ai-evaluate"><i class="fas fa-robot"></i> Evaluar con IA</button>
                      </div>
                    `}
                  </div>

                  <div id="ai-code-eval-panel" class="mb-6 p-5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                    <div class="flex items-center justify-between gap-4">
                      <p class="text-xs text-slate-400"><i class="fas fa-code mr-1"></i> Si el equipo compartió capturas o un archivo .mblock de su código en bloques, la IA puede darte una nota y feedback según tu rúbrica.</p>
                      <button onclick="window.openAiCodeEvalModal('${projectId}')" class="shrink-0 btn-secondary-tw h-9 px-4 text-[0.65rem] uppercase font-bold"><i class="fas fa-laptop-code"></i> Evaluar Código IA</button>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                      ${criteria.map(c => `
                          <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 cursor-help" title="${window.sanitizeAttr ? window.sanitizeAttr(c.desc) : c.desc}">
                              <label class="flex justify-between items-center mb-2 px-1">
                                  <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest"><i class="fas ${c.icon}"></i></span>
                                  <span class="text-[0.55rem] font-bold text-primary bg-primary/5 px-2 py-1 rounded-lg">20</span>
                              </label>
                              <input type="number" id="${c.id}_score" min="0" max="20" value="${c.val}"
                                     class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl h-11 text-lg font-black text-center text-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                     onchange="window.updateEvaluationTotal()">
                               <div class="text-[0.5rem] text-center mt-1 text-slate-400 font-bold uppercase">${c.text}</div>
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

window.runAiEvaluation = async function runAiEvaluation(projectId) {
    const btn = document.getElementById('btn-ai-evaluate');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    try {
        const { data: { session } } = await window._supabase.auth.getSession();
        const res = await fetch(`${window.SUPABASE_URL}/functions/v1/ai-evaluate-project`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: JSON.stringify({ project_id: projectId }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Error evaluando con IA');

        const panel = document.getElementById('ai-eval-panel');
        if (panel) {
            panel.className = 'mb-6 p-5 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20';
            panel.innerHTML = `
              <div class="flex justify-between items-start gap-4">
                <div>
                  <div class="text-[0.6rem] font-black uppercase text-indigo-500 tracking-widest mb-1"><i class="fas fa-robot"></i> Segunda opinión (IA) -- ${result.total_score}/100</div>
                  <p class="text-xs text-slate-600 dark:text-slate-300 italic">"${window.sanitizeInput ? window.sanitizeInput(result.feedback || '') : (result.feedback || '')}"</p>
                </div>
                <button onclick="window.runAiEvaluation('${projectId}')" class="shrink-0 h-8 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-500 text-[0.6rem] font-bold uppercase" id="btn-ai-evaluate"><i class="fas fa-rotate"></i> Volver a evaluar</button>
              </div>
            `;
        }
        window.showToast('<i class="fas fa-circle-check"></i> Evaluación de IA lista', 'success');
    } catch (err) {
        window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-robot"></i> Evaluar con IA'; }
    }
}

window.closeEvaluationModal = function closeEvaluationModal() {
    const modal = document.getElementById('evaluation-modal');
    if (modal) modal.remove();
}

// ================================================
// EVALUACIÓN IA DE CÓDIGO EN BLOQUES (mBlock) -- capturas o archivo .mblock
// ================================================
window.openAiCodeEvalModal = function openAiCodeEvalModal(projectId) {
    const modal = document.createElement('div');
    modal.id = 'ai-code-eval-modal';
    modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md animate-fadeIn';
    modal.innerHTML = `
      <div class="glass-card w-full max-w-lg p-8 shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
        <h3 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight mb-4"><i class="fas fa-laptop-code text-primary mr-2"></i> Evaluar Código con IA</h3>
        <div class="space-y-4">
          <div>
            <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Rúbrica (un criterio por línea)</label>
            <textarea id="ai-code-rubric" class="input-field-tw text-sm" rows="4" placeholder="Ej:&#10;Usa bloques de repetición (loops)&#10;Usa variables&#10;Lógica correcta y sin bloques sueltos"></textarea>
          </div>
          <div>
            <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Captura o archivo .mblock *</label>
            <input type="file" id="ai-code-file" accept="image/*,.mblock" class="input-field-tw text-sm py-2.5">
          </div>
          <div id="ai-code-eval-result" class="hidden"></div>
        </div>
        <div class="flex gap-3 mt-6">
          <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cerrar</button>
          <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-ai-code-eval" onclick="window.submitAiCodeEval('${projectId}')"><i class="fas fa-robot"></i> Evaluar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

window.submitAiCodeEval = async function submitAiCodeEval(projectId) {
    const file = document.getElementById('ai-code-file')?.files?.[0];
    const rubricRaw = document.getElementById('ai-code-rubric')?.value.trim() || '';
    const rubric = rubricRaw.split('\n').map(l => l.trim()).filter(Boolean);
    if (!file) return window.showToast('<i class="fas fa-circle-xmark"></i> Elegí una captura o archivo .mblock', 'error');

    const btn = document.getElementById('btn-ai-code-eval');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analizando...';

    try {
        const isMblock = file.name.toLowerCase().endsWith('.mblock');
        const base64 = await fileToBase64(file);
        const { data: { session } } = await window._supabase.auth.getSession();

        const res = await fetch(`${window.SUPABASE_URL}/functions/v1/ai-evaluate-mblock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
            body: JSON.stringify({
                rubric,
                input_type: isMblock ? 'mblock_file' : 'screenshot',
                image_base64: isMblock ? null : base64,
                mblock_base64: isMblock ? base64 : null,
            }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Error evaluando el código');

        await window._supabase.from('ai_code_evaluations').insert({
            project_id: parseInt(projectId, 10),
            teacher_id: window.currentUser.id,
            input_type: isMblock ? 'mblock_file' : 'screenshot',
            rubric,
            score: result.score,
            feedback: result.feedback,
            criteria_feedback: result.criteria_feedback,
        });

        const sanitizeInput = window.sanitizeInput || ((v) => v);
        const resultEl = document.getElementById('ai-code-eval-result');
        if (resultEl) {
            resultEl.classList.remove('hidden');
            resultEl.innerHTML = `
              <div class="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900">
                <div class="text-[0.6rem] font-black uppercase text-indigo-500 tracking-widest mb-1">Nota IA: ${result.score}/100</div>
                <p class="text-xs text-slate-600 dark:text-slate-300 italic mb-2">"${sanitizeInput(result.feedback || '')}"</p>
                ${(result.criteria_feedback || []).map(c => `
                  <div class="text-[0.65rem] flex items-start gap-2 py-1">
                    <i class="fas ${c.met ? 'fa-circle-check text-emerald-500' : 'fa-circle-xmark text-rose-500'} mt-0.5"></i>
                    <span><strong>${sanitizeInput(c.criterion)}:</strong> ${sanitizeInput(c.comment || '')}</span>
                  </div>
                `).join('')}
              </div>
            `;
        }
        window.showToast('<i class="fas fa-circle-check"></i> Evaluación de código lista', 'success');
    } catch (err) {
        window.showToast('<i class="fas fa-circle-xmark"></i> ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-robot"></i> Evaluar';
    }
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
