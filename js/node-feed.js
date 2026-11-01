/**
 * INICIO EN EL NODO ESCOLAR -- los proyectos de la clase del estudiante, sin internet.
 * Salen de las fichas que baja la sincronización (sin videos ni modelos: eso solo se ve con internet)
 * más los proyectos propios guardados en el nodo (school-node/feed.js, GET /api/feed). Con internet
 * (nube) nada de esto se usa: main.js elige js/projects.js; aquí solo se llega si window.isNodeSession.
 */

const esc = (v) => (window.sanitizeInput ? window.sanitizeInput(String(v ?? '')) : String(v ?? ''));

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
      <div>${badge(p)}</div>
    </article>`;
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
    // Cofre diario (sin internet lo sortea el nodo): si hoy no se abrió, ofrece el cofre.
    window.checkDailyChest?.();
  } catch (e) {
    box.innerHTML = `<div class="glass-card p-8 text-center text-sm text-slate-500">No se pudieron cargar los proyectos: ${esc(e.message)}</div>`;
  }
};
