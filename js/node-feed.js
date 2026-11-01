/**
 * INICIO EN EL NODO ESCOLAR -- los proyectos de la clase del estudiante, sin internet.
 * Salen de las fichas que baja la sincronización (sin videos ni modelos: eso solo se ve con internet)
 * más los proyectos propios guardados en el nodo (school-node/feed.js, GET /api/feed). Con internet
 * (nube) nada de esto se usa: main.js elige js/projects.js; aquí solo se llega si window.isNodeSession.
 */

const esc = (v) => (window.sanitizeInput ? window.sanitizeInput(String(v ?? '')) : String(v ?? ''));

// Las mismas cinco reacciones de la app con internet (js/reactions.js); solo ❤️ y ⭐ cuentan como voto.
const REACTIONS = [
  { key: 'like', emoji: '❤️', label: 'Me gusta' },
  { key: 'excelente', emoji: '⭐', label: '¡Excelente, A+!' },
  { key: 'wow', emoji: '🤩', label: '¡WOW!' },
  { key: 'destacar', emoji: '🏅', label: 'Merece destacarse' },
  { key: 'animo', emoji: '💪', label: '¡Sigue adelante!' },
];
const reactionIcon = (key) => REACTIONS.find(r => r.key === key)?.emoji || '<i class="fas fa-heart"></i>';

const STATE = {
  uploading: 'Subiendo...',
  pending: 'Guardado en la escuela',
  synced: 'Subido a la nube',
};

function badge(p) {
  if (p.state !== 'cloud') return `<span class="text-[0.65rem] font-black uppercase text-slate-500">${STATE[p.state] || esc(p.state)}</span>`;
  if (p.score > 0) return `<span class="text-[0.65rem] font-black uppercase text-emerald-600">Nota ${esc(Math.round(p.score))}</span>`;
  return '<span class="text-[0.65rem] font-black uppercase text-amber-600">En revisión</span>';
}

function card(p) {
  const icon = p.kind === 'model' ? 'fa-cube' : 'fa-video';
  const who = p.mine ? 'Tú' : (p.group_name ? `Equipo ${p.group_name}` : p.author_name);
  const bim = p.bimestre ? ` · Bimestre ${esc(p.bimestre)}` : '';
  return `
    <article data-feed-project="${esc(p.id)}" class="glass-card p-5 flex flex-col gap-3">
      <div class="h-28 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-4xl"><i class="fas ${icon}"></i></div>
      <div class="min-w-0">
        <h3 class="text-sm font-black text-slate-800 dark:text-white break-words">${esc(p.title)}</h3>
        <p class="text-[0.7rem] font-bold text-slate-500 dark:text-slate-400">${esc(who)}${bim}</p>
      </div>
      <p class="text-xs text-slate-600 dark:text-slate-300 break-words">${esc(p.description)}</p>
      ${p.feedback ? `<p class="text-[0.7rem] font-bold text-slate-500 border-l-4 border-primary/40 pl-2">Comentario de tu docente: ${esc(p.feedback)}</p>` : ''}
      <div class="flex items-center justify-between gap-3">
        <div>${badge(p)}</div>
        ${p.state === 'cloud' ? `
        <div class="flex items-center gap-2">
          <button type="button" data-react-btn class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg" title="Reaccionar" aria-label="Reaccionar a este proyecto"><span data-react-icon>${reactionIcon(p.my_reaction)}</span></button>
          <span class="text-xs font-black text-slate-600 dark:text-slate-300 min-w-[1.5rem] text-center" title="Votos"><span data-votes>${esc(p.votes ?? 0)}</span></span>
        </div>` : ''}
      </div>
      ${p.state === 'cloud' ? `
      <div data-react-picker class="hidden flex flex-wrap gap-2">
        ${REACTIONS.map(r => `<button type="button" data-react-pick="${r.key}" class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-xl" title="${esc(r.label)}" aria-label="${esc(r.label)}">${r.emoji}</button>`).join('')}
      </div>` : ''}
    </article>`;
}

// Reaccionar: se guarda en el nodo y la nube lo cuenta al sincronizar. Un clic en el botón abre las cinco
// reacciones; elegir la que ya tienes la quita.
async function onReactClick(e) {
  const card = e.target.closest('[data-feed-project]');
  if (!card) return;
  if (e.target.closest('[data-react-btn]')) {
    const picker = card.querySelector('[data-react-picker]');
    document.querySelectorAll('#feed-container [data-react-picker]').forEach(el => { if (el !== picker) el.classList.add('hidden'); });
    picker?.classList.toggle('hidden');
    return;
  }
  const pick = e.target.closest('[data-react-pick]');
  if (!pick) return;
  pick.disabled = true;
  try {
    const r = await window.nodeApi(`/api/projects/${encodeURIComponent(card.dataset.feedProject)}/react`, { method: 'POST', body: { reaction: pick.dataset.reactPick } });
    card.querySelector('[data-react-icon]').innerHTML = reactionIcon(r.mine);
    card.querySelector('[data-votes]').textContent = String(r.votes);
    card.querySelector('[data-react-picker]')?.classList.add('hidden');
    const info = REACTIONS.find(x => x.key === r.mine);
    window.showToast?.(info ? `${info.emoji} ${info.label}` : '<i class="fas fa-heart-crack"></i> Reacción removida', info ? 'success' : 'default');
  } catch (err) {
    window.showToast?.(`<i class="fas fa-circle-xmark"></i> ${esc(err.message)}`, 'error');
  } finally {
    pick.disabled = false;
  }
}

window.loadNodeFeed = async function loadNodeFeed() {
  const box = document.getElementById('feed-container');
  if (!box) return;
  box.innerHTML = '<div class="p-10 text-center text-slate-400"><i class="fas fa-circle-notch fa-spin text-3xl text-primary"></i></div>';
  try {
    const { projects } = await window.nodeApi('/api/feed');
    if (!projects.length) {
      box.innerHTML = `
        <div class="glass-card p-10 text-center text-slate-400 text-sm">
          Todavía no hay proyectos aprobados en tu clase.
          <button type="button" id="node-feed-upload" class="block mx-auto mt-4 text-[0.65rem] font-black uppercase text-primary">Subir un proyecto</button>
        </div>`;
    } else {
      box.innerHTML = `
        <p class="text-xs font-bold text-slate-500 dark:text-slate-400 mb-4"><i class="fas fa-tree"></i> Proyectos de tu clase. Los videos se ven cuando entras a Quetzal con internet.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">${projects.map(card).join('')}</div>`;
    }
    document.getElementById('node-feed-upload')?.addEventListener('click', () => window.nav('upload'));
    box.onclick = onReactClick; // una sola vez por carga (reemplaza el anterior)
    // Cofre diario (sin internet lo sortea el nodo): si hoy no se abrió, ofrece el cofre.
    window.checkDailyChest?.();
  } catch (e) {
    box.innerHTML = `<div class="glass-card p-8 text-center text-sm text-slate-500">No se pudieron cargar los proyectos: ${esc(e.message)}</div>`;
  }
};
