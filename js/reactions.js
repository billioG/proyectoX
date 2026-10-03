/**
 * REACCIONES A PROYECTOS (selector + conteos). Módulo eager: lo usan el feed
 * (tarjetas) y el Ranking. El Ranking solo cuenta los "Me gusta"; las demás
 * reacciones son para el autor y no mueven el puesto.
 */
// Reacciones a un proyecto. Cada usuario tiene UNA por proyecto (cambiarla la
// reemplaza, tocar la misma la quita) y projects.votes es el total de
// reacciones. El conteo lo recalcula el SERVIDOR (react_to_project): antes el
// cliente mandaba el número a mano y el dueño del proyecto podía inflarlo.
window.PROJECT_REACTIONS = [
  { key: 'like', emoji: '❤️', label: 'Me gusta' },
  { key: 'excelente', emoji: '⭐', label: '¡Excelente, A+!' },
  { key: 'wow', emoji: '🤩', label: '¡WOW!' },
  { key: 'destacar', emoji: '🏅', label: 'Merece destacarse' },
  { key: 'animo', emoji: '💪', label: '¡Sigue adelante!' },
];

function closeReactionPicker() {
  document.getElementById('reaction-picker')?.remove();
  document.removeEventListener('keydown', onReactionPickerKey);
  document.removeEventListener('pointerdown', onReactionPickerOutside, true);
}
function onReactionPickerKey(e) { if (e.key === 'Escape') closeReactionPicker(); }
function onReactionPickerOutside(e) {
  const picker = document.getElementById('reaction-picker');
  if (picker && !picker.contains(e.target)) closeReactionPicker();
}

function renderReactionRows(picker, projectId, counts, mine) {
  picker.innerHTML = window.PROJECT_REACTIONS.map(r => `
    <button type="button" data-reaction="${r.key}" class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${mine === r.key ? 'bg-primary/10 text-primary' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
      <span class="text-xl leading-none w-7 text-center">${r.emoji}</span>
      <span class="grow text-xs font-bold">${r.label}</span>
      <span class="text-[0.7rem] font-black text-slate-400">${counts?.[r.key] || 0}</span>
    </button>`).join('') + '<p class="px-3 pt-2 pb-1 text-[0.6rem] font-bold text-slate-400 leading-snug">❤️ y ⭐ suman votos para el Ranking.</p>';
  picker.querySelectorAll('[data-reaction]').forEach(btn => {
    btn.onclick = () => window.reactToProject(projectId, btn.dataset.reaction);
  });
}

window.openReactionPicker = async function openReactionPicker(projectId, anchorEl) {
  if (!window.currentUser) {
    window.showToast?.('<i class="fas fa-circle-xmark"></i> Inicia sesión para reaccionar', 'error');
    return;
  }
  const wasOpenFor = document.getElementById('reaction-picker')?.dataset.projectId;
  closeReactionPicker();
  if (wasOpenFor === String(projectId)) return;

  const picker = document.createElement('div');
  picker.id = 'reaction-picker';
  picker.dataset.projectId = projectId;
  picker.className = 'fixed z-[300] w-60 p-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl animate-fadeIn';
  renderReactionRows(picker, projectId, {}, null);
  document.body.appendChild(picker);

  const rect = anchorEl.getBoundingClientRect();
  const height = picker.offsetHeight;
  const top = rect.bottom + 8 + height > window.innerHeight ? rect.top - height - 8 : rect.bottom + 8;
  picker.style.top = `${Math.max(8, top)}px`;
  picker.style.left = `${Math.max(8, Math.min(rect.right - 240, window.innerWidth - 248))}px`;

  document.addEventListener('keydown', onReactionPickerKey);
  document.addEventListener('pointerdown', onReactionPickerOutside, true);

  const { data } = await window._supabase.rpc('get_project_reactions', { p_project_id: projectId });
  if (data && document.getElementById('reaction-picker') === picker) {
    renderReactionRows(picker, projectId, data.counts, data.mine);
  }
};

window.reactToProject = async function reactToProject(projectId, reaction) {
  const showToast = window.showToast;
  closeReactionPicker();
  try {
    const { data: result, error } = await window._supabase.rpc('react_to_project', { p_project_id: projectId, p_reaction: reaction });
    if (error) throw error;

    const info = window.PROJECT_REACTIONS.find(r => r.key === result.mine);
    if (typeof showToast === 'function') {
      showToast(info ? `${info.emoji} ${info.label}` : '<i class="fas fa-heart-crack"></i> Reacción removida', info ? 'success' : 'default');
    }

    // El mismo proyecto puede estar en el feed y en el Ranking a la vez.
    document.querySelectorAll(`[data-votes-id="${projectId}"]`).forEach(el => { el.innerText = result.votes; });
    document.querySelectorAll(`[data-react-icon="${projectId}"]`).forEach(el => {
      el.innerHTML = info ? info.emoji : '<i class="fas fa-heart"></i>';
    });
  } catch (err) {
    console.error(err);
    if (typeof showToast === 'function') showToast('<i class="fas fa-circle-xmark"></i> Error al procesar la reacción', 'error');
  }
}


// El botón de cada tarjeta muestra la reacción propia (en vez del corazón) si
// ya reaccionó. Una sola consulta con todas las del usuario; si la columna
// reaction todavía no existe (migración sin correr) queda el corazón.
window.applyMyReactionIcons = async function applyMyReactionIcons() {
  const userId = window.currentUser?.id;
  if (!userId) return;
  const { data, error } = await window._supabase.from('project_likes').select('project_id, reaction').eq('user_id', userId);
  if (error || !data) return;
  data.forEach(({ project_id, reaction }) => {
    const info = window.PROJECT_REACTIONS.find(r => r.key === reaction);
    if (!info) return;
    document.querySelectorAll(`[data-react-icon="${project_id}"]`).forEach(el => { el.innerHTML = info.emoji; });
  });
};
