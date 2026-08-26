/**
 * ENCUESTAS -- solo el admin las crea (varias preguntas: opción múltiple,
 * texto libre, escala 1-5), dirigidas a estudiantes/docentes/todos.
 * Se muestran junto a los avisos en la misma bandeja (campana del header).
 */

const SURVEY_QUESTION_TYPE_LABEL = { multiple_choice: 'Opción múltiple', text: 'Respuesta abierta', scale: 'Escala 1-5' };
const SCALE_FACE_EMOJI = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };

window.getPendingSurveys = async function getPendingSurveys() {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  if (!currentUser) return [];

  const { data: surveys } = await _supabase.from('surveys')
    .select('id, title, description, created_at').eq('status', 'active')
    .order('created_at', { ascending: false });
  if (!surveys?.length) return [];

  const { data: myResponses } = await _supabase.from('survey_responses')
    .select('survey_id').eq('user_id', currentUser.id);
  const answeredIds = new Set((myResponses || []).map(r => r.survey_id));

  return surveys.filter(s => !answeredIds.has(s.id));
}

// ================================================
// RESPONDER (estudiante/docente)
// ================================================
window.openAnswerSurveyModal = async function openAnswerSurveyModal(surveyId) {
  const _supabase = window._supabase;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const [{ data: survey }, { data: questions }] = await Promise.all([
    _supabase.from('surveys').select('title, description').eq('id', surveyId).single(),
    _supabase.from('survey_questions').select('*').eq('survey_id', surveyId).order('order_index', { ascending: true }),
  ]);
  if (!survey || !questions?.length) return window.showToast('<i class="fas fa-circle-xmark"></i> No se pudo cargar la encuesta', 'error');

  document.getElementById('answer-survey-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'answer-survey-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn overflow-y-auto';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-8 shadow-2xl animate-slideUp bg-white dark:bg-slate-900 my-6">
      <h2 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight mb-1"><i class="fas fa-clipboard-list text-primary mr-2"></i> ${sanitizeInput(survey.title)}</h2>
      ${survey.description ? `<p class="text-xs text-slate-400 mb-6">${sanitizeInput(survey.description)}</p>` : '<div class="mb-6"></div>'}
      <div id="survey-answer-form" class="space-y-5">
        ${questions.map((q, i) => `
          <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <p class="font-bold text-sm text-slate-800 dark:text-white mb-3">${i + 1}. ${sanitizeInput(q.question)}</p>
            ${q.type === 'multiple_choice' ? (q.options || []).map((opt, oi) => `
              <label class="flex items-center gap-2 py-1.5 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                <input type="radio" name="survey-q-${q.id}" value="${oi}"> ${sanitizeInput(opt)}
              </label>
            `).join('') : ''}
            ${q.type === 'text' ? `<textarea class="input-field-tw text-sm" id="survey-q-${q.id}" rows="3" placeholder="Tu respuesta"></textarea>` : ''}
            ${q.type === 'scale' ? `
              <div class="flex items-center justify-between gap-2">
                ${Array.from({ length: (q.scale_max || 5) - (q.scale_min || 1) + 1 }, (_, k) => (q.scale_min || 1) + k).map(n => `
                  <label class="flex flex-col items-center gap-1 cursor-pointer p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                    <input type="radio" name="survey-q-${q.id}" value="${n}" class="hidden peer">
                    <span class="text-3xl grayscale peer-checked:grayscale-0 opacity-40 peer-checked:opacity-100 transition-all">${SCALE_FACE_EMOJI[n] || '😐'}</span>
                    <span class="text-[0.55rem] text-slate-400">${n}</span>
                  </label>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
      <button class="btn-primary-tw w-full h-12 text-xs uppercase font-black mt-6" id="btn-submit-survey" onclick="window.submitSurveyAnswers('${surveyId}', ${JSON.stringify(questions).replace(/"/g, '&quot;')})">
        <i class="fas fa-paper-plane"></i> Enviar Respuestas
      </button>
    </div>
  `;
  document.body.appendChild(modal);
}

window.submitSurveyAnswers = async function submitSurveyAnswers(surveyId, questions) {
  const _supabase = window._supabase;
  const currentUser = window.currentUser;
  const btn = document.getElementById('btn-submit-survey');

  for (const q of questions) {
    if (q.type === 'text') continue; // texto libre es opcional
    const answered = document.querySelector(`input[name="survey-q-${q.id}"]:checked`);
    if (!answered) return window.showToast('<i class="fas fa-circle-xmark"></i> Respondé todas las preguntas de opción/escala', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const { data: response, error: respErr } = await _supabase.from('survey_responses')
    .insert({ survey_id: surveyId, user_id: currentUser.id }).select().single();
  if (respErr) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + respErr.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Respuestas';
    return;
  }

  const answers = questions.map(q => {
    if (q.type === 'text') {
      const val = document.getElementById(`survey-q-${q.id}`)?.value.trim();
      return val ? { response_id: response.id, question_id: q.id, answer_text: val } : null;
    }
    const checked = document.querySelector(`input[name="survey-q-${q.id}"]:checked`)?.value;
    if (checked == null) return null;
    return q.type === 'multiple_choice'
      ? { response_id: response.id, question_id: q.id, answer_choice: parseInt(checked) }
      : { response_id: response.id, question_id: q.id, answer_scale: parseInt(checked) };
  }).filter(Boolean);

  if (answers.length) await _supabase.from('survey_answers').insert(answers);

  window.showToast('<i class="fas fa-circle-check"></i> ¡Gracias por responder!', 'success');
  document.getElementById('answer-survey-modal')?.remove();
  if (typeof window.loadAnnouncementsUnreadCount === 'function') window.loadAnnouncementsUnreadCount();
  document.getElementById('announcements-inbox-modal')?.remove();
  if (typeof window.openAnnouncementsInbox === 'function') window.openAnnouncementsInbox();
}

// ================================================
// CREAR (solo admin)
// ================================================
window._surveyBuilderQuestions = [];

window.openCreateSurveyModal = function openCreateSurveyModal() {
  window._surveyBuilderQuestions = [];
  document.getElementById('create-survey-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'create-survey-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn overflow-y-auto';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-8 shadow-2xl animate-slideUp bg-white dark:bg-slate-900 my-6">
      <h2 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight mb-6"><i class="fas fa-clipboard-list text-primary mr-2"></i> Nueva Encuesta</h2>
      <div class="space-y-4 mb-6">
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Título *</label>
          <input type="text" id="survey-title" class="input-field-tw h-11 text-sm">
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Descripción</label>
          <textarea id="survey-description" class="input-field-tw text-sm" rows="2"></textarea>
        </div>
        <div>
          <label class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Destinatarios</label>
          <select id="survey-audience" class="input-field-tw h-11 text-sm">
            <option value="all">Todos (estudiantes y docentes)</option>
            <option value="students">Todos los estudiantes</option>
            <option value="teachers">Todos los docentes</option>
          </select>
        </div>
      </div>

      <div id="survey-builder-list" class="space-y-3 mb-4"></div>
      <div class="grid grid-cols-3 gap-2 mb-6">
        <button type="button" class="btn-secondary-tw h-10 text-[0.6rem] uppercase font-bold" onclick="window.addSurveyQuestion('multiple_choice')"><i class="fas fa-plus"></i> Opción múltiple</button>
        <button type="button" class="btn-secondary-tw h-10 text-[0.6rem] uppercase font-bold" onclick="window.addSurveyQuestion('text')"><i class="fas fa-plus"></i> Texto</button>
        <button type="button" class="btn-secondary-tw h-10 text-[0.6rem] uppercase font-bold" onclick="window.addSurveyQuestion('scale')"><i class="fas fa-plus"></i> Escala</button>
      </div>

      <div class="flex gap-3">
        <button class="btn-secondary-tw flex-1 h-11 text-xs uppercase font-bold" onclick="this.closest('.fixed').remove()">Cancelar</button>
        <button class="btn-primary-tw flex-1 h-11 text-xs uppercase font-bold" id="btn-publish-survey" onclick="window.publishSurvey()"><i class="fas fa-rocket"></i> Publicar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window.renderSurveyBuilder();
}

window.addSurveyQuestion = function addSurveyQuestion(type) {
  const q = { _id: crypto.randomUUID(), type, question: '' };
  if (type === 'multiple_choice') { q.options = ['', '']; }
  if (type === 'scale') { q.scale_min = 1; q.scale_max = 5; }
  window._surveyBuilderQuestions.push(q);
  window.renderSurveyBuilder();
}

window.removeSurveyQuestion = function removeSurveyQuestion(id) {
  window._surveyBuilderQuestions = window._surveyBuilderQuestions.filter(q => q._id !== id);
  window.renderSurveyBuilder();
}

window.updateSurveyQuestionField = function updateSurveyQuestionField(id, field, value) {
  const q = window._surveyBuilderQuestions.find(q => q._id === id);
  if (q) q[field] = value;
}

window.updateSurveyOption = function updateSurveyOption(id, optIndex, value) {
  const q = window._surveyBuilderQuestions.find(q => q._id === id);
  if (q) q.options[optIndex] = value;
}

window.addSurveyOption = function addSurveyOption(id) {
  const q = window._surveyBuilderQuestions.find(q => q._id === id);
  if (q) { q.options.push(''); window.renderSurveyBuilder(); }
}

window.renderSurveyBuilder = function renderSurveyBuilder() {
  const list = document.getElementById('survey-builder-list');
  if (!list) return;
  const sanitizeAttr = window.sanitizeAttr || ((v) => v);

  list.innerHTML = (window._surveyBuilderQuestions || []).map((q, i) => `
    <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-2">
      <div class="flex justify-between items-center">
        <span class="text-[0.6rem] font-black uppercase text-slate-400 tracking-widest">${i + 1}. ${SURVEY_QUESTION_TYPE_LABEL[q.type]}</span>
        <button type="button" class="text-rose-500 hover:text-rose-600" onclick="window.removeSurveyQuestion('${q._id}')"><i class="fas fa-trash-alt text-xs"></i></button>
      </div>
      <input type="text" class="input-field-tw h-10 text-sm" placeholder="Pregunta" value="${sanitizeAttr(q.question || '')}" onchange="window.updateSurveyQuestionField('${q._id}', 'question', this.value)">
      ${q.type === 'multiple_choice' ? `
        <div class="space-y-1.5">
          ${q.options.map((opt, oi) => `
            <input type="text" class="input-field-tw h-9 text-xs" placeholder="Opción ${oi + 1}" value="${sanitizeAttr(opt)}" onchange="window.updateSurveyOption('${q._id}', ${oi}, this.value)">
          `).join('')}
          <button type="button" class="text-[0.6rem] font-bold text-primary uppercase" onclick="window.addSurveyOption('${q._id}')"><i class="fas fa-plus"></i> Agregar opción</button>
        </div>
      ` : ''}
      ${q.type === 'scale' ? `<p class="text-[0.6rem] text-slate-400"><i class="fas fa-circle-info"></i> Escala fija de 1 a 5.</p>` : ''}
      ${q.type === 'text' ? `<p class="text-[0.6rem] text-slate-400"><i class="fas fa-circle-info"></i> Respuesta abierta, opcional para quien responde.</p>` : ''}
    </div>
  `).join('') || '<p class="text-[0.65rem] text-slate-400 text-center py-4">Agregá al menos una pregunta.</p>';
}

window.publishSurvey = async function publishSurvey() {
  const title = document.getElementById('survey-title')?.value.trim();
  const description = document.getElementById('survey-description')?.value.trim();
  const audience = document.getElementById('survey-audience')?.value || 'all';
  const questions = window._surveyBuilderQuestions || [];
  const btn = document.getElementById('btn-publish-survey');

  if (!title) return window.showToast('<i class="fas fa-circle-xmark"></i> Ponele un título', 'error');
  if (!questions.length) return window.showToast('<i class="fas fa-circle-xmark"></i> Agregá al menos una pregunta', 'error');
  for (const q of questions) {
    if (!q.question?.trim()) return window.showToast('<i class="fas fa-circle-xmark"></i> Todas las preguntas necesitan un enunciado', 'error');
    if (q.type === 'multiple_choice' && q.options.filter(o => o.trim()).length < 2) return window.showToast('<i class="fas fa-circle-xmark"></i> Las preguntas de opción múltiple necesitan al menos 2 opciones', 'error');
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  const { data: survey, error: surveyErr } = await window._supabase.from('surveys')
    .insert({ created_by: window.currentUser.id, title, description: description || null, audience, status: 'active' })
    .select().single();
  if (surveyErr) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + surveyErr.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-rocket"></i> Publicar';
    return;
  }

  const { error: qErr } = await window._supabase.from('survey_questions').insert(
    questions.map((q, i) => ({
      survey_id: survey.id, order_index: i, type: q.type, question: q.question,
      options: q.type === 'multiple_choice' ? q.options.filter(o => o.trim()) : null,
      scale_min: q.type === 'scale' ? 1 : null, scale_max: q.type === 'scale' ? 5 : null,
    }))
  );
  if (qErr) {
    window.showToast('<i class="fas fa-circle-xmark"></i> ' + qErr.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-rocket"></i> Publicar';
    return;
  }

  window.showToast('<i class="fas fa-circle-check"></i> Encuesta publicada', 'success');
  document.getElementById('create-survey-modal')?.remove();
}

// ================================================
// RESULTADOS (solo admin/staff)
// ================================================
window.openSurveyResultsModal = async function openSurveyResultsModal(surveyId) {
  const _supabase = window._supabase;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const [{ data: survey }, { data: questions }, { data: responses }] = await Promise.all([
    _supabase.from('surveys').select('title').eq('id', surveyId).single(),
    _supabase.from('survey_questions').select('*').eq('survey_id', surveyId).order('order_index', { ascending: true }),
    _supabase.from('survey_responses').select('id').eq('survey_id', surveyId),
  ]);

  const responseIds = (responses || []).map(r => r.id);
  const { data: answers } = responseIds.length
    ? await _supabase.from('survey_answers').select('*').in('response_id', responseIds)
    : { data: [] };

  document.getElementById('survey-results-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'survey-results-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl animate-slideUp bg-white dark:bg-slate-900">
      <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
        <div>
          <h3 class="text-sm font-black text-slate-800 dark:text-white">${sanitizeInput(survey?.title || '')}</h3>
          <p class="text-[0.6rem] text-slate-400 uppercase">${responses?.length || 0} respuesta(s)</p>
        </div>
        <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 flex items-center justify-center" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
        ${(questions || []).map((q, i) => {
    const qAnswers = (answers || []).filter(a => a.question_id === q.id);
    let body = '';
    if (q.type === 'multiple_choice') {
      const counts = (q.options || []).map((opt, oi) => qAnswers.filter(a => a.answer_choice === oi).length);
      const max = Math.max(1, ...counts);
      body = (q.options || []).map((opt, oi) => `
              <div class="mb-1.5">
                <div class="flex justify-between text-[0.65rem] text-slate-500 mb-0.5"><span>${sanitizeInput(opt)}</span><span>${counts[oi]}</span></div>
                <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-primary" style="width:${(counts[oi] / max) * 100}%"></div></div>
              </div>
            `).join('');
    } else if (q.type === 'scale') {
      const vals = qAnswers.map(a => a.answer_scale).filter(v => v != null);
      const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      const face = avg != null ? SCALE_FACE_EMOJI[Math.round(avg)] || '😐' : '';
      body = `<div class="flex items-center gap-2"><span class="text-3xl">${face}</span><div class="text-2xl font-black text-primary">${avg != null ? avg.toFixed(1) : '--'} <span class="text-xs text-slate-400 font-bold">/ 5 promedio (${vals.length} resp.)</span></div></div>`;
    } else {
      const texts = qAnswers.map(a => a.answer_text).filter(Boolean);
      body = texts.length
        ? `<div class="space-y-1.5">${texts.map(t => `<p class="text-xs p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">"${sanitizeInput(t)}"</p>`).join('')}</div>`
        : '<p class="text-xs text-slate-400">Sin respuestas de texto.</p>';
    }
    return `
            <div>
              <p class="text-sm font-bold text-slate-800 dark:text-white mb-2">${i + 1}. ${sanitizeInput(q.question)}</p>
              ${body}
            </div>
          `;
  }).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

console.log('✅ surveys.js cargado correctamente');
