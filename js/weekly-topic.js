/**
 * TEMA DE LA SEMANA (docente) -- marca un tema de repaso por clase; los
 * duelos de esa semana lo proponen primero a los alumnos (set_weekly_topic,
 * migrations/weekly-topic.sql).
 */

window.openWeeklyTopicModal = async function openWeeklyTopicModal() {
  const _supabase = window._supabase;
  const me = window.currentUser?.id;
  const s = window.sanitizeInput || ((v) => v);
  const a = window.sanitizeAttr || ((v) => v);

  const [{ data: asg }, { data: week }, { data: courses }] = await Promise.all([
    _supabase.from('teacher_assignments').select('school_code, grade, section, schools(name)').eq('teacher_id', me),
    _supabase.rpc('current_week_id'),
    _supabase.from('courses').select('title, school_code, grade, section, lessons(title)').eq('created_by', me),
  ]);
  if (!asg?.length) return window.showToast('<i class="fas fa-circle-info"></i> No tenés clases asignadas', 'info');

  const { data: current } = await _supabase.from('class_weekly_topics')
    .select('school_code, grade, section, topic')
    .eq('week_id', week)
    .in('school_code', [...new Set(asg.map(x => x.school_code))]);

  const key = (x) => `${x.school_code}|${x.grade}|${x.section}`;
  const currentByClass = Object.fromEntries((current || []).map(c => [key(c), c.topic]));
  const suggestionsByClass = {};
  for (const c of courses || []) {
    const list = (suggestionsByClass[key(c)] ||= new Set());
    if (c.title) list.add(c.title.trim());
    for (const l of c.lessons || []) if ((l.title || '').trim().length >= 6) list.add(l.title.trim());
  }

  const rows = asg.map((x, i) => {
    const k = key(x);
    const sugg = [...(suggestionsByClass[k] || [])];
    return `
      <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
        <div class="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">${s(x.schools?.name || x.school_code)} · ${s(x.grade)} ${s(x.section)}</div>
        <div class="flex gap-2">
          <input id="wt-input-${i}" list="wt-list-${i}" maxlength="180" value="${a(currentByClass[k] || '')}"
            placeholder="Ej: Fracciones equivalentes" class="input-field-tw h-11 text-sm flex-1">
          <button class="btn-primary-tw h-11 px-4 text-xs uppercase font-bold shrink-0" onclick="window.saveWeeklyTopic(${i})"><i class="fas fa-check"></i></button>
        </div>
        <datalist id="wt-list-${i}">${sugg.map(t => `<option value="${a(t)}"></option>`).join('')}</datalist>
        ${currentByClass[k] ? `<p class="text-[0.65rem] text-emerald-600 font-bold mt-1.5"><i class="fas fa-circle-check"></i> Activo esta semana</p>` : ''}
      </div>`;
  }).join('');

  window._weeklyTopicClasses = asg;
  document.getElementById('weekly-topic-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'weekly-topic-modal';
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg p-6 shadow-2xl animate-slideUp max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-start mb-2">
        <h2 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">🎯 Tema de la semana</h2>
        <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <p class="text-sm text-slate-500 mb-4">Tus alumnos lo van a ver primero al crear un reto 1v1 esta semana, y el reto rápido lo usa. Es una forma de que jueguen repasando lo que están viendo en clase. Dejalo vacío para quitarlo.</p>
      <div class="space-y-3">${rows}</div>
    </div>`;
  document.body.appendChild(modal);
};

// ---------- REPORTE DE DUELOS ----------
// % de aciertos por tema y por alumno en los 5 juegos 1v1, para saber qué
// reforzar -- y convertir un tema flojo en el tema de la semana con un toque.
const REPORT_GAME_ICONS = { quiz: 'fa-code', hangman: 'fa-spider', spelling: 'fa-spell-check', debug: 'fa-bug', timed_math: 'fa-stopwatch' };

function pctColor(pct) {
  return pct < 50 ? '#e11d48' : pct < 75 ? '#d97706' : '#059669';
}

window.openDuelReportModal = async function openDuelReportModal() {
  const { data: asg } = await window._supabase.from('teacher_assignments')
    .select('school_code, grade, section, schools(name)').eq('teacher_id', window.currentUser?.id);
  if (!asg?.length) return window.showToast('<i class="fas fa-circle-info"></i> No tenés clases asignadas', 'info');
  window._reportClasses = asg;
  const s = window.sanitizeInput || ((v) => v);

  document.getElementById('duel-report-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'duel-report-modal';
  modal.className = 'fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-2xl p-6 shadow-2xl animate-slideUp max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-start mb-2">
        <h2 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">📊 Reporte de duelos</h2>
        <button class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
      </div>
      <p class="text-sm text-slate-500 mb-4">Qué tan bien les va a tus alumnos en los retos 1v1, por tema. Los temas en rojo son buenos candidatos para reforzar en clase.</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        <select id="dr-class" class="input-field-tw h-11 text-sm sm:col-span-2" onchange="window.renderDuelReport()">
          ${asg.map((x, i) => `<option value="${i}">${s(x.schools?.name || x.school_code)} · ${s(x.grade)} ${s(x.section)}</option>`).join('')}
        </select>
        <select id="dr-days" class="input-field-tw h-11 text-sm" onchange="window.renderDuelReport()">
          <option value="7">Últimos 7 días</option>
          <option value="30" selected>Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
        </select>
      </div>
      <div id="dr-body"><div class="text-center text-slate-400 text-xs py-8"><i class="fas fa-spinner fa-spin"></i></div></div>
    </div>`;
  document.body.appendChild(modal);
  window.renderDuelReport();
};

window.renderDuelReport = async function renderDuelReport() {
  const body = document.getElementById('dr-body');
  const x = window._reportClasses?.[parseInt(document.getElementById('dr-class')?.value || '0', 10)];
  const days = parseInt(document.getElementById('dr-days')?.value || '30', 10);
  if (!body || !x) return;
  body.innerHTML = '<div class="text-center text-slate-400 text-xs py-8"><i class="fas fa-spinner fa-spin"></i></div>';

  const { data: r, error } = await window._supabase.rpc('get_class_duel_report', {
    p_school: x.school_code, p_grade: x.grade, p_section: x.section, p_days: days,
  });
  if (error) {
    body.innerHTML = `<p class="text-sm text-rose-500">${(window.sanitizeInput || (v => v))(error.message)}</p>`;
    return;
  }
  const s = window.sanitizeInput || ((v) => v);
  const a = window.sanitizeAttr || ((v) => v);

  if (!r.total_plays) {
    body.innerHTML = `<div class="text-center py-8 text-slate-500 text-sm"><div class="text-4xl mb-2">🎮</div>Todavía no hay duelos jugados en este período.<br>
      <span class="text-xs">Tip: marcá un <b>Tema de la semana</b> para darles un motivo para retarse.</span></div>`;
    return;
  }

  // Candidatos a reforzar: temas con al menos 2 partidas y menos de 60%.
  const weak = r.topics.filter(t => t.plays >= 2 && t.pct < 60 && t.game !== 'timed_math').slice(0, 3);
  window._reportWeak = weak;
  window._reportClass = x;

  const bar = (pct) => `<div class="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden"><div class="h-full rounded-full" style="width:${pct}%;background:${pctColor(pct)}"></div></div>`;

  body.innerHTML = `
    <div class="grid grid-cols-3 gap-2 mb-5 text-center">
      <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60"><div class="text-2xl font-black text-slate-800 dark:text-white">${r.total_plays}</div><div class="text-[0.6rem] font-bold uppercase text-slate-400">Partidas</div></div>
      <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60"><div class="text-2xl font-black text-slate-800 dark:text-white">${r.active_students}/${r.class_size}</div><div class="text-[0.6rem] font-bold uppercase text-slate-400">Alumnos jugando</div></div>
      <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60"><div class="text-2xl font-black text-slate-800 dark:text-white">${r.topics.length}</div><div class="text-[0.6rem] font-bold uppercase text-slate-400">Temas</div></div>
    </div>

    ${weak.length ? `
      <h3 class="text-xs font-black uppercase tracking-widest text-rose-500 mb-2"><i class="fas fa-triangle-exclamation"></i> Para reforzar</h3>
      <div class="space-y-2 mb-5">${weak.map((t, i) => `
        <div class="p-3 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 flex items-center gap-3">
          <div class="text-xl font-black" style="color:${pctColor(t.pct)}">${t.pct}%</div>
          <div class="flex-1 min-w-0"><div class="text-sm font-bold text-slate-800 dark:text-white truncate">${s(t.topic)}</div>
            <div class="text-[0.65rem] text-slate-500">${t.plays} partidas · ${t.students} alumnos</div></div>
          <button class="btn-secondary-tw h-9 px-3 text-[0.6rem] uppercase font-bold shrink-0" onclick="window.useWeakTopicAsWeekly(${i})"><i class="fas fa-bullseye"></i> Tema de la semana</button>
        </div>`).join('')}</div>` : ''}

    <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Todos los temas</h3>
    <div class="space-y-2 mb-5">${r.topics.map(t => `
      <div class="flex items-center gap-3">
        <i class="fas ${REPORT_GAME_ICONS[t.game] || 'fa-gamepad'} text-slate-400 w-4"></i>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between text-xs mb-1"><span class="font-bold text-slate-700 dark:text-slate-200 truncate" title="${a(t.topic)}">${s(t.topic)}</span>
            <span class="font-black shrink-0 ml-2" style="color:${pctColor(t.pct)}">${t.pct}%</span></div>
          ${bar(t.pct)}
        </div>
        <span class="text-[0.6rem] text-slate-400 w-14 text-right shrink-0">${t.plays} part.</span>
      </div>`).join('')}</div>

    <h3 class="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Por alumno <span class="normal-case font-bold">(de menor a mayor)</span></h3>
    <div class="space-y-1.5">${r.students.map(st => `
      <div class="flex items-center gap-3 text-xs">
        <span class="flex-1 min-w-0 truncate font-bold text-slate-700 dark:text-slate-200">${s(st.full_name)}</span>
        <div class="w-24 shrink-0">${bar(st.pct)}</div>
        <span class="w-10 text-right font-black shrink-0" style="color:${pctColor(st.pct)}">${st.pct}%</span>
        <span class="w-14 text-right text-slate-400 shrink-0">${st.plays} part.</span>
      </div>`).join('')}</div>`;
};

window.useWeakTopicAsWeekly = async function useWeakTopicAsWeekly(i) {
  const t = window._reportWeak?.[i];
  const x = window._reportClass;
  if (!t || !x) return;
  // Los temas de lecciones vienen como "Lección (Curso)" -- para el tema de
  // la semana alcanza con la parte de la lección.
  const topic = t.topic.replace(/\s*\([^)]*\)\s*$/, '') || t.topic;
  const { error } = await window._supabase.rpc('set_weekly_topic', {
    p_school: x.school_code, p_grade: x.grade, p_section: x.section, p_topic: topic,
  });
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  window.showToast(`<i class="fas fa-bullseye"></i> "${(window.sanitizeInput || (v => v))(topic)}" es el tema de la semana`, 'success');
};

window.saveWeeklyTopic = async function saveWeeklyTopic(i) {
  const x = window._weeklyTopicClasses?.[i];
  const input = document.getElementById(`wt-input-${i}`);
  if (!x || !input) return;
  const { error } = await window._supabase.rpc('set_weekly_topic', {
    p_school: x.school_code, p_grade: x.grade, p_section: x.section, p_topic: input.value,
  });
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');
  window.showToast(input.value.trim()
    ? '<i class="fas fa-bullseye"></i> Tema de la semana guardado'
    : '<i class="fas fa-circle-check"></i> Tema de la semana quitado', 'success');
  window.openWeeklyTopicModal();
};
