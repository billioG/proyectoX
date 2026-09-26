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
