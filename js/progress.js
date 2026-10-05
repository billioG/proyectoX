/**
 * PROGRESO -- "lo que no se mide no se puede mejorar".
 *
 * Estudiante: "Mi progreso" (window.openMyProgress) -- por competencia, semana a
 * semana, con su racha de práctica y qué le conviene reforzar.
 * Docente / coordinador / admin: vista "Progreso" (window.loadProgress) -- resumen
 * por grupo y, dentro de cada grupo, cada alumno por competencia, con tendencia
 * y quién no ha practicado.
 *
 * Mide práctica + retos juntos (funciones SQL de migrations/practice-progress.sql).
 * Los retos se corrigen en el servidor (verificados); la práctica la reporta el
 * propio teléfono del alumno (indicativa) -- se avisa en pantalla.
 */

const COMPETENCIES = {
  lectura: { label: 'Comprensión lectora', short: 'Lectura', icon: 'fa-book-open', color: '#3b82f6', game: 'quiz', gameLabel: 'Comprensión Lectora' },
  matematica: { label: 'Matemática aplicada', short: 'Matemática', icon: 'fa-calculator', color: '#f97316', game: 'timed_math', gameLabel: 'Contrarreloj' },
  pensamiento: { label: 'Pensamiento crítico', short: 'Pensamiento', icon: 'fa-magnifying-glass', color: '#10b981', game: 'debug', gameLabel: 'Encontrá el Error' },
  lenguaje: { label: 'Lenguaje y vocabulario', short: 'Lenguaje', icon: 'fa-spell-check', color: '#a855f7', game: 'spelling', gameLabel: 'Ortografía y Ahorcado' },
};
const COMP_KEYS = Object.keys(COMPETENCIES);

const esc = (v) => (window.sanitizeInput ? window.sanitizeInput(v) : String(v ?? ''));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Color según porcentaje de aciertos (verde / ámbar / rojo suave).
function pctColor(p) {
  if (p === null) return '#94a3b8';
  return p >= 80 ? '#10b981' : p >= 60 ? '#f59e0b' : '#f43f5e';
}

function trendHtml(now, before, dark = false) {
  if (now === null || before === null) return `<span style="color:#94a3b8">—</span>`;
  const d = now - before;
  if (Math.abs(d) < 3) return `<span style="color:#94a3b8" title="Sin cambios">= igual</span>`;
  return d > 0
    ? `<span style="color:#10b981;font-weight:800" title="Mejora respecto al período anterior">▲ +${d}</span>`
    : `<span style="color:#f43f5e;font-weight:800" title="Baja respecto al período anterior">▼ ${d}</span>`;
}

function daysAgoText(iso) {
  if (!iso) return 'Sin actividad';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'Hoy' : d === 1 ? 'Ayer' : `Hace ${d} días`;
}

// ===================================================================
// ESTUDIANTE: MI PROGRESO
// ===================================================================
function sparkline(weekly, color) {
  const w = 120, h = 34, pad = 3;
  const pts = (weekly || []).map((x, i, arr) => ({ i, n: x.n || 0, pct: num(x.pct), len: arr.length }));
  if (!pts.length) return '';
  const xs = (i) => pad + (i * (w - pad * 2)) / Math.max(1, pts.length - 1);
  const ys = (p) => h - pad - (p / 100) * (h - pad * 2);
  const line = pts.filter(p => p.pct !== null).map(p => `${xs(p.i).toFixed(1)},${ys(p.pct).toFixed(1)}`).join(' ');
  const bars = pts.map(p => p.n > 0 ? `<rect x="${(xs(p.i) - 3).toFixed(1)}" y="${h - 3}" width="6" height="3" rx="1" fill="${color}" opacity=".35"/>` : '').join('');
  const dots = pts.filter(p => p.pct !== null).map(p => `<circle cx="${xs(p.i).toFixed(1)}" cy="${ys(p.pct).toFixed(1)}" r="2.4" fill="${color}"/>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${bars}<polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>${dots}</svg>`;
}

function renderMyProgress(modal, data) {
  const comps = data?.competencies || [];
  const total = (data?.practice_total || 0) + (data?.reto_total || 0);
  const weakest = data?.weakest && COMPETENCIES[data.weakest] ? data.weakest : null;
  const weakPct = weakest ? num(comps.find(c => c.competency === weakest)?.pct) : null;
  const streak = data?.streak_days || 0;

  const cards = COMP_KEYS.map((k) => {
    const meta = COMPETENCIES[k];
    const c = comps.find(x => x.competency === k) || {};
    const pct = num(c.pct);
    const n = (c.practice_n || 0) + (c.reto_n || 0);
    return `
      <div style="padding:1rem;border-radius:1.1rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)">
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.6rem">
          <span style="width:2.2rem;height:2.2rem;border-radius:.7rem;display:flex;align-items:center;justify-content:center;background:${meta.color};color:#fff"><i class="fas ${meta.icon}"></i></span>
          <div style="min-width:0"><div style="font-weight:900;font-size:.85rem">${meta.label}</div>
            <div style="font-size:.65rem;color:#94a3b8">${meta.gameLabel}</div></div>
          <div style="margin-left:auto;text-align:right">
            <div style="font-size:1.5rem;font-weight:900;color:${pctColor(pct)};line-height:1">${pct === null ? '—' : pct + '%'}</div>
            <div style="font-size:.65rem">${trendHtml(num(c.pct_recent), num(c.pct_prev))}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem">
          <div style="font-size:.7rem;color:#cbd5e1">${n ? `${c.practice_n || 0} práctica${(c.practice_n || 0) === 1 ? '' : 's'} · ${c.reto_n || 0} reto${(c.reto_n || 0) === 1 ? '' : 's'}` : 'Todavía sin actividad'}</div>
          ${sparkline(c.weekly, meta.color)}
        </div>
      </div>`;
  }).join('');

  const tip = !total
    ? '¡Empieza a practicar! Cada práctica suma a tu progreso.'
    : weakest
      ? `Lo que más puedes mejorar ahora: <b>${COMPETENCIES[weakest].label}</b> (${weakPct}% de aciertos). ¡Unas prácticas te ayudan!`
      : '¡Buen ritmo! Sigue practicando para ver tu avance en cada competencia.';

  const bodyEl = modal.querySelector('[data-body]');
  bodyEl.style.cssText = 'text-align:left;color:#f1f5f9;padding:0';
  bodyEl.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin-bottom:1rem">
      <div style="padding:.8rem;border-radius:1rem;background:rgba(249,115,22,.12);text-align:center"><div style="font-size:1.4rem;font-weight:900">🔥 ${streak}</div><div style="font-size:.62rem;color:#fdba74;font-weight:800">${streak === 1 ? 'día seguido' : 'días seguidos'}</div></div>
      <div style="padding:.8rem;border-radius:1rem;background:rgba(16,185,129,.12);text-align:center"><div style="font-size:1.4rem;font-weight:900">${data?.practice_7d || 0}</div><div style="font-size:.62rem;color:#6ee7b7;font-weight:800">prácticas en 7 días</div></div>
      <div style="padding:.8rem;border-radius:1rem;background:rgba(99,102,241,.14);text-align:center"><div style="font-size:1.4rem;font-weight:900">${total}</div><div style="font-size:.62rem;color:#a5b4fc;font-weight:800">actividades (8 sem.)</div></div>
    </div>
    <div style="padding:.8rem 1rem;border-radius:1rem;background:rgba(250,204,21,.08);border:1px solid rgba(250,204,21,.3);font-size:.82rem;line-height:1.45;margin-bottom:1rem">
      💡 ${tip}
      ${weakest ? `<button type="button" data-practice="${COMPETENCIES[weakest].game}" style="display:block;margin-top:.6rem;padding:.45rem .9rem;border-radius:9999px;border:0;background:#facc15;color:#1e293b;font-weight:900;font-size:.72rem;cursor:pointer"><i class="fas fa-dumbbell"></i> Practicar ${COMPETENCIES[weakest].gameLabel}</button>` : ''}
    </div>
    <div style="display:grid;gap:.7rem">${cards}</div>
    <p style="font-size:.62rem;color:#64748b;margin-top:1rem;line-height:1.4">Cuenta tu práctica y tus retos de las últimas 8 semanas. El porcentaje es la proporción de respuestas correctas. La línea muestra cómo vas semana a semana.</p>`;

  modal.querySelectorAll('[data-practice]').forEach((b) => {
    b.onclick = () => { modal.remove(); window.PracticeMode?.start(b.dataset.practice); };
  });
}

window.openMyProgress = async function openMyProgress() {
  document.getElementById('my-progress-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'my-progress-modal';
  modal.className = 'fixed inset-0 z-[220] flex items-start justify-center p-4 bg-slate-950/90 backdrop-blur-sm overflow-y-auto';
  modal.innerHTML = `
    <div style="width:100%;max-width:34rem;margin:auto;padding:1.25rem;border-radius:1.5rem;background:#0f172a;border:1px solid rgba(255,255,255,.1);color:#fff">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <h2 style="font-size:1.05rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:#fff;margin:0"><i class="fas fa-chart-line" style="color:#34d399"></i> Mi progreso</h2>
        <button type="button" data-close style="width:2.2rem;height:2.2rem;border-radius:.7rem;border:0;background:rgba(255,255,255,.08);color:#cbd5e1;cursor:pointer"><i class="fas fa-times"></i></button>
      </div>
      <div data-body style="text-align:center;color:#94a3b8;padding:2rem 0"><i class="fas fa-circle-notch fa-spin"></i></div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  try {
    await window.fetchWithCache(`my_progress_${window.currentUser.id}`, async () => {
      const { data, error } = await window._supabase.rpc('get_my_progress', { p_weeks: 8 });
      if (error) throw error;
      return data;
    }, (data) => { if (document.body.contains(modal) && data) renderMyProgress(modal, data); });
  } catch (err) {
    modal.querySelector('[data-body]').textContent = 'No se pudo cargar tu progreso. Intenta de nuevo con conexión.';
  }
};

// ===================================================================
// DOCENTE / COORDINADOR / ADMIN: PROGRESO POR GRUPO
// ===================================================================
const S = { days: 30, groups: [], detail: null, sort: 'help', current: null };

function pctCell(p) {
  return p === null
    ? '<span class="text-slate-300 dark:text-slate-600">—</span>'
    : `<span style="color:${pctColor(p)};font-weight:900">${p}%</span>`;
}

function periodSelectHtml() {
  return `<select id="progress-days" class="input-field-tw h-10 text-xs w-auto" onchange="window.setProgressDays(this.value)">
    ${[[7, 'Últimos 7 días'], [30, 'Últimos 30 días'], [90, 'Últimos 90 días']].map(([v, l]) => `<option value="${v}" ${S.days === v ? 'selected' : ''}>${l}</option>`).join('')}
  </select>`;
}

function header(title, subtitle, extra = '') {
  return `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
      <div>
        <h1 class="text-2xl md:text-3xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-2"><i class="fas fa-chart-line text-primary"></i> ${title}</h1>
        <p class="text-slate-500 dark:text-slate-400 font-medium text-sm">${subtitle}</p>
      </div>
      <div class="flex items-center gap-2">${extra}</div>
    </div>`;
}

const NOTE = `<p class="text-[0.7rem] text-slate-400 mt-6 leading-relaxed">
  <b>Cómo leerlo:</b> el porcentaje es la proporción de respuestas correctas. Cuenta la <b>práctica</b> (se corrige en el teléfono del estudiante, es indicativa) y los <b>retos</b> (se corrigen en el servidor, verificados).
  La tendencia compara contra el período anterior de la misma duración.</p>`;

async function fetchGroups() {
  const key = `progress_groups_${window.currentUser.id}_${S.days}`;
  await window.fetchWithCache(key, async () => {
    const { data, error } = await window._supabase.rpc('get_groups_progress', { p_days: S.days });
    if (error) throw error;
    return data || [];
  }, (data) => { S.groups = data || []; });
}

function renderOverview() {
  const box = document.getElementById('progress-container');
  if (!box) return;
  const g = S.groups;
  const students = g.reduce((a, x) => a + x.students, 0);
  const practicing = g.reduce((a, x) => a + x.practicing, 0);
  const practice = g.reduce((a, x) => a + x.practice_n, 0);
  const retos = g.reduce((a, x) => a + x.reto_n, 0);

  const kpi = (label, value, sub, color) => `
    <div class="glass-card p-5 border-l-4" style="border-color:${color}">
      <div class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">${label}</div>
      <div class="text-3xl font-black text-slate-800 dark:text-white my-1">${value}</div>
      <div class="text-[0.65rem] font-bold text-slate-400 uppercase tracking-wide">${sub}</div>
    </div>`;

  box.innerHTML = `
    ${header('Progreso de los estudiantes', 'Práctica y retos por competencia, por grupo.', periodSelectHtml())}
    ${g.length ? `
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
      ${kpi('Estudiantes que practican', students ? Math.round((practicing / students) * 100) + '%' : '—', `${practicing} de ${students}`, '#10b981')}
      ${kpi('Prácticas', practice, 'en el período', '#3b82f6')}
      ${kpi('Retos jugados', retos, 'en el período', '#f97316')}
      ${kpi('Grupos', g.length, 'que puedes ver', '#a855f7')}
    </div>
    <div class="glass-card p-0 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-sm">
          <thead>
            <tr class="text-[0.65rem] font-bold uppercase text-slate-400 tracking-widest bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
              <th class="px-4 py-3">Centro educativo</th><th class="px-3 py-3">Grupo</th><th class="px-3 py-3 text-center">Practican</th>
              <th class="px-3 py-3 text-center">Prácticas</th><th class="px-3 py-3 text-center">Retos</th>
              ${COMP_KEYS.map(k => `<th class="px-3 py-3 text-center">${COMPETENCIES[k].short}</th>`).join('')}
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            ${g.map((x, i) => `
              <tr class="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" onclick="window.openProgressGroup(${i})">
                <td class="px-4 py-3 font-bold text-slate-800 dark:text-white">${esc(x.school_name)}</td>
                <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${esc(x.grade)} · ${esc(x.section)}</td>
                <td class="px-3 py-3 text-center"><b>${x.practicing}</b><span class="text-slate-400"> / ${x.students}</span></td>
                <td class="px-3 py-3 text-center">${x.practice_n}</td>
                <td class="px-3 py-3 text-center">${x.reto_n}</td>
                ${COMP_KEYS.map(k => `<td class="px-3 py-3 text-center">${pctCell(num(x[k]))}</td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <p class="text-xs text-slate-400 mt-3"><i class="fas fa-hand-pointer"></i> Toca un grupo para ver a cada estudiante.</p>`
    : `<div class="glass-card p-10 text-center text-slate-400">Todavía no tienes grupos con estudiantes para mostrar.</div>`}
    ${NOTE}`;
}

window.setProgressDays = async function setProgressDays(v) {
  S.days = Number(v) || 30;
  if (S.detail) { await loadDetail(S.detail); renderDetail(); } else { await fetchGroups(); renderOverview(); }
};

window.openProgressGroup = async function openProgressGroup(i) {
  const g = S.groups[i];
  if (!g) return;
  S.detail = g;
  await loadDetail(g);
  renderDetail();
};

async function loadDetail(g) {
  const box = document.getElementById('progress-container');
  if (box && !S.current) box.innerHTML = '<div class="glass-card p-10 text-center text-slate-400"><i class="fas fa-circle-notch fa-spin"></i></div>';
  const key = `progress_group_${g.school_code}_${g.grade}_${g.section}_${S.days}`;
  await window.fetchWithCache(key, async () => {
    const { data, error } = await window._supabase.rpc('get_group_progress', {
      p_school: g.school_code, p_grade: g.grade, p_section: g.section, p_days: S.days,
    });
    if (error) throw error;
    return data;
  }, (data) => { S.current = data; });
}

function sortedStudents(list) {
  const arr = [...list];
  if (S.sort === 'name') return arr.sort((a, b) => a.full_name.localeCompare(b.full_name));
  if (S.sort === 'nopractice') return arr.sort((a, b) => (a.practice_n - b.practice_n) || a.full_name.localeCompare(b.full_name));
  // "necesitan apoyo": menor porcentaje primero; los que no tienen datos, al final de ese grupo
  return arr.sort((a, b) => {
    const pa = num(a.pct), pb = num(b.pct);
    if (pa === null && pb === null) return a.full_name.localeCompare(b.full_name);
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pa - pb;
  });
}

window.setProgressSort = function setProgressSort(v) { S.sort = v; renderDetail(); };

function renderDetail() {
  const box = document.getElementById('progress-container');
  const d = S.current, g = S.detail;
  if (!box || !d || !g) return;
  const single = S.groups.length <= 1;

  const compCards = (d.competencies || []).map((c) => {
    const meta = COMPETENCIES[c.competency];
    const pct = num(c.pct);
    return `
      <div class="glass-card p-5">
        <div class="flex items-center gap-3 mb-2">
          <span class="w-9 h-9 rounded-xl flex items-center justify-center text-white" style="background:${meta.color}"><i class="fas ${meta.icon}"></i></span>
          <div class="min-w-0"><div class="text-sm font-black text-slate-800 dark:text-white leading-tight">${meta.label}</div>
            <div class="text-[0.65rem] text-slate-400">${meta.gameLabel}</div></div>
        </div>
        <div class="flex items-end justify-between">
          <div class="text-3xl font-black" style="color:${pctColor(pct)}">${pct === null ? '—' : pct + '%'}</div>
          <div class="text-right text-[0.65rem] text-slate-400">${trendHtml(pct, num(c.pct_prev))}<br>${c.students} de ${d.class_size} estudiantes</div>
        </div>
      </div>`;
  }).join('');

  const rows = sortedStudents(d.students || []).map((s) => {
    const noPractice = !s.practice_n;
    return `
      <tr class="${noPractice ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}">
        <td class="px-4 py-3 font-bold text-slate-800 dark:text-white">${esc(s.full_name)}${noPractice ? ' <span class="ml-1 px-2 py-0.5 rounded-full text-[0.55rem] font-black uppercase bg-amber-100 text-amber-700">sin práctica</span>' : ''}</td>
        <td class="px-3 py-3 text-center">${s.practice_n}</td>
        <td class="px-3 py-3 text-center">${s.reto_n}</td>
        ${COMP_KEYS.map(k => `<td class="px-3 py-3 text-center">${pctCell(num(s[k]))}</td>`).join('')}
        <td class="px-3 py-3 text-center text-xs">${trendHtml(num(s.pct), num(s.pct_prev))}</td>
        <td class="px-3 py-3 text-xs text-slate-500">${daysAgoText(s.last_activity)}</td>
      </tr>`;
  }).join('');

  const part = d.class_size ? Math.round((d.practicing_students / d.class_size) * 100) : 0;
  box.innerHTML = `
    ${single ? '' : `<button onclick="window.backToProgressOverview()" class="text-slate-400 hover:text-primary font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2 transition-colors"><i class="fas fa-arrow-left"></i> Volver a todos los grupos</button>`}
    ${header(`${esc(g.school_name)} · ${esc(g.grade)} ${esc(g.section)}`, `Práctica y retos de los últimos ${d.days} días.`,
      `${periodSelectHtml()}<button class="btn-secondary-tw h-10 px-4 text-xs uppercase font-bold" onclick="window.exportProgressCsv()"><i class="fas fa-file-csv"></i> Exportar</button>`)}
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div class="glass-card p-5 border-l-4 border-emerald-500"><div class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Practican</div>
        <div class="text-3xl font-black text-slate-800 dark:text-white my-1">${part}%</div><div class="text-[0.65rem] font-bold text-slate-400 uppercase">${d.practicing_students} de ${d.class_size} estudiantes</div></div>
      <div class="glass-card p-5 border-l-4 border-blue-500"><div class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Prácticas</div>
        <div class="text-3xl font-black text-slate-800 dark:text-white my-1">${d.practice_n}</div><div class="text-[0.65rem] font-bold text-slate-400 uppercase">en el período</div></div>
      <div class="glass-card p-5 border-l-4 border-orange-500"><div class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Retos jugados</div>
        <div class="text-3xl font-black text-slate-800 dark:text-white my-1">${d.reto_n}</div><div class="text-[0.65rem] font-bold text-slate-400 uppercase">en el período</div></div>
      <div class="glass-card p-5 border-l-4 border-violet-500"><div class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">Con actividad</div>
        <div class="text-3xl font-black text-slate-800 dark:text-white my-1">${d.active_students}</div><div class="text-[0.65rem] font-bold text-slate-400 uppercase">de ${d.class_size} estudiantes</div></div>
    </div>
    <h3 class="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-white mb-3">Por competencia</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">${compCards}</div>
    <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <h3 class="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-white">Cada estudiante</h3>
      <select class="input-field-tw h-10 text-xs w-auto" onchange="window.setProgressSort(this.value)">
        <option value="help" ${S.sort === 'help' ? 'selected' : ''}>Quienes necesitan apoyo primero</option>
        <option value="nopractice" ${S.sort === 'nopractice' ? 'selected' : ''}>Menos práctica primero</option>
        <option value="name" ${S.sort === 'name' ? 'selected' : ''}>Por nombre</option>
      </select>
    </div>
    <div class="glass-card p-0 overflow-hidden"><div class="overflow-x-auto">
      <table class="w-full text-left border-collapse text-sm">
        <thead><tr class="text-[0.65rem] font-bold uppercase text-slate-400 tracking-widest bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
          <th class="px-4 py-3">Estudiante</th><th class="px-3 py-3 text-center">Prácticas</th><th class="px-3 py-3 text-center">Retos</th>
          ${COMP_KEYS.map(k => `<th class="px-3 py-3 text-center">${COMPETENCIES[k].short}</th>`).join('')}
          <th class="px-3 py-3 text-center">Tendencia</th><th class="px-3 py-3">Última actividad</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">${rows || '<tr><td colspan="9" class="p-6 text-center text-slate-400">Este grupo no tiene estudiantes.</td></tr>'}</tbody>
      </table></div></div>
    ${NOTE}`;
}

window.backToProgressOverview = async function backToProgressOverview() {
  S.detail = null; S.current = null;
  await fetchGroups();
  renderOverview();
};

window.exportProgressCsv = function exportProgressCsv() {
  const d = S.current, g = S.detail;
  if (!d || !g) return;
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Estudiante', 'Prácticas', 'Retos', 'Lectura %', 'Matemática %', 'Pensamiento %', 'Lenguaje %', 'General %', 'Período anterior %', 'Última actividad'].map(q).join(',')];
  sortedStudents(d.students || []).forEach((s) => lines.push([
    s.full_name, s.practice_n, s.reto_n, s.lectura ?? '', s.matematica ?? '', s.pensamiento ?? '', s.lenguaje ?? '', s.pct ?? '', s.pct_prev ?? '',
    s.last_activity ? new Date(s.last_activity).toLocaleDateString('es-GT') : '',
  ].map(q).join(',')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `progreso-${g.grade}-${g.section}`.replace(/[^\w.-]+/g, '_') + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

window.loadProgress = async function loadProgress() {
  const box = document.getElementById('progress-container');
  if (!box) return;
  S.detail = null; S.current = null;
  box.innerHTML = '<div class="glass-card p-10 text-center text-slate-400"><i class="fas fa-circle-notch fa-spin"></i></div>';
  try {
    await fetchGroups();
  } catch (err) {
    box.innerHTML = `<div class="glass-card p-10 text-center text-rose-500 font-bold">No se pudo cargar el progreso. ${esc(window.friendlyErrorText ? window.friendlyErrorText(err.message) : err.message)}</div>`;
    return;
  }
  // Un docente con un solo grupo va directo a su detalle.
  if (S.groups.length === 1) return window.openProgressGroup(0);
  renderOverview();
};
