/**
 * PERFIL EN EL NODO ESCOLAR -- versión sencilla que sale solo de lo que el nodo tiene en la
 * computadora de la escuela: datos del estudiante, avance por curso y proyectos guardados.
 * Funciona sin internet. El perfil completo (gemas, insignias, mascota, certificados) depende de
 * la nube y solo se usa con internet (js/profile.js); main.js elige cuál según window.isNodeSession.
 */

const esc = (v) => (window.sanitizeInput ? window.sanitizeInput(String(v ?? '')) : String(v ?? ''));

const STATUS = {
  uploading: 'Subiendo...',
  pending: 'Guardado en la escuela',
  synced: 'Subido a la nube',
};

function courseProgress(courses, completions) {
  const done = new Set((completions || []).filter(c => c.status === 'completed').map(c => c.lesson_id));
  return (courses || []).map(c => {
    const total = (c.lessons || []).length;
    const completed = (c.lessons || []).filter(l => done.has(l.id)).length;
    return { id: c.id, title: c.title || c.name || 'Curso', total, completed, percent: total ? Math.round((completed / total) * 100) : 0 };
  });
}

// Mismos rangos que js/gamification.js (con internet).
const RANK_TITLES = [[1, 'Novato'], [3, 'Aprendiz'], [5, 'Explorador'], [8, 'Innovador'], [11, 'Ingeniero'], [15, 'Maestro'], [20, 'Leyenda']];
const rankOf = (level) => RANK_TITLES.reduce((title, [min, name]) => (level >= min ? name : title), RANK_TITLES[0][1]);

function renderXp(x) {
  const pct = Math.round(((x.level_xp || 0) / (x.xp_per_level || 500)) * 100);
  const note = x.xp_pending > 0 || x.gems_pending > 0
    ? `Incluye ${esc(x.xp_pending)} XP ganados aquí que se confirman cuando la escuela se conecte a internet.`
    : (x.has_base ? '' : 'Tu XP se actualiza cuando la escuela se conecte a internet.');
  return `
    <div id="node-profile-xp" class="glass-card p-5">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div>
          <p class="text-[0.65rem] font-black uppercase text-slate-400 tracking-widest">Nivel ${esc(x.level)} · ${esc(rankOf(x.level))}</p>
          <p class="text-2xl font-black text-slate-800 dark:text-white">${esc(x.xp)} XP</p>
        </div>
        <p class="text-lg font-black text-cyan-500"><i class="fas fa-gem"></i> ${esc(x.gems_total)}</p>
      </div>
      <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <div class="h-full bg-primary" style="width:${pct}%"></div>
      </div>
      ${note ? `<p class="text-[0.7rem] font-bold text-slate-400 mt-3">${note}</p>` : ''}
    </div>`;
}

function renderHeader(student) {
  const initial = esc(String(student.full_name || '?').trim().charAt(0).toUpperCase() || '?');
  const klass = [student.grade, student.section].filter(Boolean).join(' ');
  return `
    <div class="glass-card p-6 flex items-center gap-4">
      <div class="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-3xl font-black border border-primary/20">${initial}</div>
      <div class="min-w-0">
        <h2 class="text-xl font-black text-slate-800 dark:text-white truncate">${esc(student.full_name)}</h2>
        <p class="text-xs font-bold text-slate-500 dark:text-slate-400">${esc(klass)}${klass ? ' · ' : ''}Estudiante</p>
        <p class="text-[0.7rem] font-bold text-slate-400 mt-1"><i class="fas fa-tree"></i> Conectado a la red de la escuela</p>
      </div>
    </div>`;
}

function renderProgress(progress) {
  if (!progress.length) return '<p class="text-xs text-slate-400">Tu docente todavía no publicó cursos.</p>';
  return progress.map(p => `
    <div data-course-progress="${esc(p.id)}" class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
      <div class="flex items-center justify-between gap-3 mb-2">
        <p class="text-sm font-bold text-slate-800 dark:text-white truncate">${esc(p.title)}</p>
        <p class="text-[0.7rem] font-black text-slate-500 shrink-0">${p.completed} de ${p.total} lecciones</p>
      </div>
      <div class="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.percent}">
        <div class="h-full bg-primary" style="width:${p.percent}%"></div>
      </div>
    </div>`).join('');
}

function renderProjects(projects) {
  if (!projects.length) return '<p class="text-xs text-slate-400">Todavía no has subido proyectos aquí.</p>';
  return projects.map(p => `
    <div data-profile-project="${esc(p.id)}" class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
      <p class="text-sm font-bold text-slate-800 dark:text-white truncate">${esc(p.title)}</p>
      <p class="text-[0.7rem] font-bold ${p.status === 'synced' ? 'text-emerald-600' : 'text-slate-500'}">${STATUS[p.status] || esc(p.status)}</p>
    </div>`).join('');
}

window.loadNodeProfile = async function loadNodeProfile() {
  const box = document.getElementById('profile-content');
  if (!box) return;
  box.innerHTML = '<div class="p-10 text-center text-slate-400"><i class="fas fa-circle-notch fa-spin text-3xl text-primary"></i></div>';
  try {
    const [{ student }, { courses, completions }, { projects }, xp] = await Promise.all([
      window.nodeApi('/api/me'),
      window.nodeApi('/api/courses'),
      window.nodeApi('/api/projects/mine'),
      window.nodeApi('/api/xp'),
    ]);
    box.innerHTML = `
      <div class="space-y-6 max-w-2xl">
        ${renderHeader(student)}
        ${renderXp(xp)}
        <div>
          <h3 class="text-[0.7rem] font-black uppercase text-slate-400 tracking-widest mb-3">Mi avance</h3>
          <div id="node-profile-progress" class="space-y-2">${renderProgress(courseProgress(courses, completions))}</div>
        </div>
        <div>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-[0.7rem] font-black uppercase text-slate-400 tracking-widest">Mis proyectos</h3>
            <button type="button" id="node-profile-upload" class="text-[0.65rem] font-black uppercase text-primary">Subir un proyecto</button>
          </div>
          <div id="node-profile-projects" class="space-y-2">${renderProjects(projects)}</div>
        </div>
        <p class="text-[0.7rem] font-bold text-slate-400"><i class="fas fa-circle-info"></i> Insignias, tienda y certificados se ven cuando entras a Quetzal con internet.</p>
      </div>`;
    document.getElementById('node-profile-upload')?.addEventListener('click', () => window.nav('upload'));
  } catch (e) {
    box.innerHTML = `<div class="glass-card p-8 text-center text-sm text-slate-500">No se pudo cargar tu perfil: ${esc(e.message)}</div>`;
  }
};

export { courseProgress };
