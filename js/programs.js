// ================================================
// GESTIÓN DE PROGRAMAS/PROYECTOS (ADMIN)
// ================================================
window.openManagePrograms = async function openManagePrograms() {
  document.getElementById('manage-programs-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'manage-programs-modal';
  modal.className = 'fixed inset-0 z-[260] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-md max-h-[80vh] flex flex-col p-8 animate-slideUp bg-white dark:bg-slate-900">
      <div class="flex justify-between items-center mb-2">
        <h2 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight m-0"><i class="fas fa-layer-group text-primary mr-2"></i> Programas</h2>
        <button class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center font-bold" onclick="this.closest('.fixed').remove()">
            <i class="fas fa-times"></i>
        </button>
      </div>
      <p class="text-xs text-slate-400 mb-4">Los programas/proyectos que agregues acá aparecen como opción al asignarle programa a un establecimiento.</p>
      <div class="flex gap-2 mb-4">
        <input type="text" id="new-program-name" class="input-field-tw h-11 text-sm" placeholder="Ej: STEAM">
        <button class="btn-primary-tw h-11 px-5 shrink-0" onclick="window.addProgram()"><i class="fas fa-plus"></i></button>
      </div>
      <div id="programs-list" class="flex-1 overflow-y-auto custom-scrollbar space-y-1.5"></div>
    </div>
  `;
  document.body.appendChild(modal);
  window.renderProgramsList();
}

window.renderProgramsList = async function renderProgramsList() {
  const container = document.getElementById('programs-list');
  if (!container) return;
  const sanitizeInput = window.sanitizeInput || ((v) => v);

  const { data: programs } = await window._supabase.from('programs').select('id, name').order('name');

  if (!programs || programs.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Todavía no hay programas creados.</p>';
    return;
  }

  container.innerHTML = programs.map(p => `
    <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
      <span class="text-sm font-bold text-slate-700 dark:text-slate-300">${sanitizeInput(p.name)}</span>
      <button onclick="window.deleteProgram('${p.id}', '${window.sanitizeAttr(p.name)}')" class="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-700 transition-all flex items-center justify-center">
        <i class="fas fa-trash text-xs"></i>
      </button>
    </div>
  `).join('');
}

window.addProgram = async function addProgram() {
  const input = document.getElementById('new-program-name');
  const name = input?.value.trim();
  if (!name) return window.showToast('<i class="fas fa-circle-xmark"></i> Escribí un nombre', 'error');

  const { error } = await window._supabase.from('programs').insert({ name });
  if (error) {
    const msg = error.message?.includes('duplicate') ? 'Ese programa ya existe' : error.message;
    return window.showToast('<i class="fas fa-circle-xmark"></i> ' + msg, 'error');
  }

  input.value = '';
  window.renderProgramsList();
  if (typeof window.loadSchools === 'function') window.loadSchools();
}

window.deleteProgram = async function deleteProgram(programId, programName) {
  if (!confirm(`¿Eliminar el programa "${programName}"? Se quita de todos los establecimientos que lo tenían asignado.`)) return;

  const { error } = await window._supabase.from('programs').delete().eq('id', programId);
  if (error) return window.showToast('<i class="fas fa-circle-xmark"></i> ' + error.message, 'error');

  window.showToast('<i class="fas fa-circle-check"></i> Programa eliminado', 'success');
  window.renderProgramsList();
  if (typeof window.loadTeachers === 'function') window.loadTeachers();
  if (typeof window.loadSchools === 'function') window.loadSchools();
}

console.log('✅ programs.js cargado');
