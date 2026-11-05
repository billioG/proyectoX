/**
 * BUZÓN -- aquí leen las sugerencias y las evaluaciones de la clase que dejaron los estudiantes (ver migrations/feedback-inbox.sql).
 *   * Administrador: ve todo, con el nombre de quien lo escribió y el docente evaluado.
 *   * Docente: ve solo el CONTENIDO, anónimo: las evaluaciones que recibió y las sugerencias de los estudiantes de sus clases.
 * Funciona igual con internet y sin internet (la misma función existe en el servidor de la escuela).
 */
const CRITERIA = [
  ['q_interest', 'Dinámica de clase'], ['q_practice', 'Aprendizaje práctico'], ['q_resources', 'Uso de recursos'], ['q_respect', 'Ambiente respetuoso'], ['q_clarity', 'Claridad en la guía'],
];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** Resumen de las evaluaciones: promedio general y por criterio (un criterio en 0 = sin responder, no cuenta). */
export function summarizeRatings(ratings) {
  const list = Array.isArray(ratings) ? ratings : [];
  return {
    count: list.length,
    average: avg(list.map((r) => Number(r.rating)).filter((n) => Number.isFinite(n))),
    criteria: CRITERIA.map(([key, label]) => ({ key, label, average: avg(list.map((r) => Number(r[key])).filter((n) => Number.isFinite(n) && n > 0)) })),
  };
}

const when = (iso) => { const t = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(iso)) ? iso : `${iso}Z`); return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' }); };
const place = (x) => [x.school_name, [x.grade, x.section].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

function ratingCard(r, admin) {
  const note = Number(r.rating);
  const comments = [r.best_moment, r.message].filter((t, i, a) => t && a.indexOf(t) === i);
  return `
    <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
      <div class="flex items-center justify-between gap-3 mb-2">
        <span class="text-sm font-black text-amber-500"><i class="fas fa-star"></i> ${Number.isFinite(note) ? note.toFixed(1) : '-'} / 5</span>
        <span class="text-[0.65rem] font-bold text-slate-400">${esc(when(r.created_at))}</span>
      </div>
      ${comments.map((c) => `<p class="text-sm italic text-slate-600 dark:text-slate-300">"${esc(c)}"</p>`).join('') || '<p class="text-xs text-slate-400">Sin comentario.</p>'}
      <p class="text-[0.65rem] font-bold uppercase text-slate-400 tracking-wide mt-3">
        ${admin ? `${esc(r.student_name || 'Estudiante')} → ${esc(r.teacher_name || 'Docente')} · ` : 'Anónimo · '}${esc(place(r))}
      </p>
    </div>`;
}

function suggestionCard(s, admin) {
  return `
    <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
      <p class="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line">${esc(s.message)}</p>
      <p class="text-[0.65rem] font-bold uppercase text-slate-400 tracking-wide mt-3">
        ${admin ? `${esc(s.student_name || 'Estudiante')} · ` : 'Anónimo · '}${esc(place(s))} · ${esc(when(s.created_at))}
      </p>
    </div>`;
}

function render(container, data, schoolFilter) {
  const admin = data.role === 'admin';
  const sum = summarizeRatings(data.ratings);
  const schools = new Map();
  for (const x of [...data.ratings, ...data.suggestions]) if (x.school_code) schools.set(x.school_code, x.school_name || x.school_code);
  container.innerHTML = `
    <div class="glass-card p-4 mb-5 text-xs text-slate-500 dark:text-slate-400">
      <i class="fas ${admin ? 'fa-eye' : 'fa-user-secret'} text-primary mr-2"></i>
      ${admin ? 'Como administrador ves quién escribió cada mensaje.' : 'Los mensajes son <b>anónimos</b>: ves lo que escribieron, pero no quién fue.'}
    </div>
    ${admin ? `<div class="mb-5"><select id="inbox-school" class="input-field-tw h-10 text-xs font-bold max-w-xs"><option value="">Todos los establecimientos</option>${[...schools.entries()].map(([c, n]) => `<option value="${esc(c)}" ${c === schoolFilter ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>` : ''}

    <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight mb-3"><i class="fas fa-star text-amber-400 mr-2"></i>Evaluaciones de la clase</h3>
    ${sum.count ? `
      <div class="glass-card p-5 mb-4">
        <div class="flex items-end gap-4 mb-4"><span class="text-4xl font-black text-slate-800 dark:text-white">${sum.average ?? '-'}</span><span class="text-xs text-slate-400 pb-1">de 5 · ${sum.count} ${sum.count === 1 ? 'evaluación' : 'evaluaciones'}</span></div>
        <div class="space-y-2">
          ${sum.criteria.map((c) => `
            <div class="flex items-center gap-3 text-[0.7rem]"><span class="w-40 shrink-0 font-bold text-slate-500">${esc(c.label)}</span>
              <div class="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div class="h-full bg-primary" style="width:${c.average ? (c.average / 5) * 100 : 0}%"></div></div>
              <span class="w-8 text-right font-black text-slate-600 dark:text-slate-300">${c.average ?? '-'}</span></div>`).join('')}
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">${data.ratings.map((r) => ratingCard(r, admin)).join('')}</div>`
      : '<p class="text-sm text-slate-400 mb-8">Todavía no hay evaluaciones.</p>'}

    <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight mb-3"><i class="fas fa-lightbulb text-primary mr-2"></i>Sugerencias</h3>
    ${data.suggestions.length
      ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${data.suggestions.map((s) => suggestionCard(s, admin)).join('')}</div>`
      : '<p class="text-sm text-slate-400">Todavía no hay sugerencias.</p>'}`;
  const select = container.querySelector('#inbox-school');
  if (select) select.onchange = () => window.loadInbox(select.value || null);
}

window.loadInbox = async function loadInbox(school = null) {
  const container = document.getElementById('inbox-container');
  if (!container) return;
  container.innerHTML = '<div class="text-center text-slate-400 text-xs py-10"><i class="fas fa-spinner fa-spin"></i></div>';
  const { data, error } = await window._supabase.rpc('get_feedback_inbox', { p_school: school, p_days: 365 });
  if (error) {
    const old = /get_feedback_inbox|schema cache|does not exist|42883|PGRST20/i.test(`${error.message} ${error.code}`);
    container.innerHTML = `<div class="glass-card p-6 text-sm text-slate-500"><i class="fas fa-circle-info mr-2"></i>${old ? 'El buzón todavía no está activo: pídele al administrador que ejecute la migración «feedback-inbox».' : esc(error.message)}</div>`;
    return;
  }
  render(container, { role: data?.role || 'teacher', suggestions: data?.suggestions || [], ratings: data?.ratings || [] }, school);
};
