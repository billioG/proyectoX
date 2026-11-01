/**
 * PROYECTOS EN EL NODO ESCOLAR -- el estudiante sube su video o modelo 3D por el Wi-Fi de la
 * escuela y queda guardado en la computadora del nodo; cuando el nodo tenga internet, se
 * publica solo en la nube (js/node-mode.js ya dejó la sesión del estudiante; el servidor es
 * school-node/projects.js). Usa el formulario de la vista "upload" que ya existe.
 *
 * Con internet (nube) nada de esto se usa: project-modals.js solo delega aquí si
 * window.isNodeSession.
 */

const TOKEN_KEY = 'PX_NODE_TOKEN';
// Mismas reglas que la nube y que school-node/project-rules.js (el nodo las vuelve a validar).
const RULES = { titleMin: 5, titleMax: 120, descMin: 40, descMax: 2000, maxBytes: 150 * 1024 * 1024 };
const FILE_EXT = /\.(mp4|mov|m4v|webm|3gp|avi|mkv|stl|obj|glb)$/i;
const MODEL_EXT = /\.(stl|obj|glb)$/i;

const esc = (v) => (window.sanitizeInput ? window.sanitizeInput(String(v ?? '')) : String(v ?? ''));
const byId = (id) => document.getElementById(id);
const toast = (msg, type = 'error') => window.showToast?.(`<i class="fas ${type === 'error' ? 'fa-circle-xmark' : 'fa-circle-check'}"></i> ${esc(msg)}`, type);

// Mismos mensajes que el servidor, para que el estudiante no vea dos textos distintos.
export function checkForm({ title, description, file }) {
  const t = String(title ?? '').trim().length;
  const d = String(description ?? '').trim().length;
  if (t < RULES.titleMin || t > RULES.titleMax) return `El título debe tener entre ${RULES.titleMin} y ${RULES.titleMax} caracteres.`;
  if (d < RULES.descMin || d > RULES.descMax) return `La descripción debe tener entre ${RULES.descMin} y ${RULES.descMax} caracteres (llevas ${d}).`;
  if (!file) return 'Elige un video o un modelo 3D.';
  if (!FILE_EXT.test(file.name)) return 'El archivo debe ser un video (mp4, mov, m4v, webm, 3gp, avi, mkv) o un modelo 3D (stl, obj, glb).';
  if (file.size < 1 || file.size > RULES.maxBytes) return 'El archivo debe pesar entre 1 byte y 150 MB.';
  return null;
}

function ensureLayout() {
  if (byId('node-my-projects')) return;
  const btn = byId('btn-upload-project');
  if (!btn) return;
  btn.insertAdjacentHTML('afterend', `
    <p id="node-upload-note" class="text-xs font-bold text-slate-500 dark:text-slate-400 mt-4 text-center"><i class="fas fa-tree"></i> Tu proyecto se guarda en la escuela y se publica solo cuando la computadora tenga internet.</p>
    <div id="node-upload-progress" class="hidden mt-4" role="progressbar" aria-valuemin="0" aria-valuemax="100">
      <div class="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div id="node-upload-bar" class="h-full bg-primary" style="width:0%"></div></div>
      <p id="node-upload-text" class="text-xs font-bold text-slate-500 mt-2 text-center"></p>
    </div>
    <h3 class="text-[0.7rem] font-black uppercase text-slate-400 tracking-widest mt-10 mb-3">Mis proyectos</h3>
    <div id="node-my-projects" class="space-y-2"></div>`);
}

function setBusy(busy) {
  const btn = byId('btn-upload-project');
  if (btn) btn.disabled = busy;
  if (!busy) setProgress(null);
}

function setProgress(percent) {
  const box = byId('node-upload-progress');
  if (!box) return;
  if (percent == null) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.setAttribute('aria-valuenow', String(percent));
  byId('node-upload-bar').style.width = `${percent}%`;
  byId('node-upload-text').textContent = percent < 100 ? `Subiendo... ${percent} %` : 'Guardando...';
}

// PUT en streaming con progreso (fetch todavía no reporta lo que se va subiendo).
function putFile(id, file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/projects/${encodeURIComponent(id)}/file`);
    xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem(TOKEN_KEY) || ''}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.min(100, Math.round((e.loaded / e.total) * 100))); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `El servidor respondió ${xhr.status}.`;
      try { message = JSON.parse(xhr.responseText).error || message; } catch { /* sin cuerpo */ }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Se perdió la conexión con la escuela. Revisa tu Wi-Fi y vuelve a intentar.'));
    xhr.send(file);
  });
}

const STATUS = {
  uploading: 'Subiendo...',
  pending: 'Guardado en la escuela',
  synced: 'Subido a la nube',
};
const mb = (bytes) => `${(Math.max(bytes || 0, 0) / (1024 * 1024)).toFixed(1)} MB`;

async function renderMine() {
  const box = byId('node-my-projects');
  if (!box) return;
  let projects = [];
  try { ({ projects } = await window.nodeApi('/api/projects/mine')); } catch { box.innerHTML = ''; return; }
  if (!projects.length) { box.innerHTML = '<p class="text-xs text-slate-400">Todavía no has subido proyectos aquí.</p>'; return; }
  box.innerHTML = projects.map(p => `
    <div data-project-id="${esc(p.id)}" class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-bold text-slate-800 dark:text-white truncate">${esc(p.title)}</p>
        <p class="text-[0.7rem] font-bold ${p.status === 'synced' ? 'text-emerald-600' : 'text-slate-500'}">${STATUS[p.status] || esc(p.status)} · ${mb(p.file_size)}</p>
        ${p.last_error ? `<p class="text-[0.7rem] text-amber-600">La última vez no se pudo subir a la nube: ${esc(p.last_error)}</p>` : ''}
      </div>
      ${p.status === 'synced' ? '' : '<button type="button" data-cancel class="shrink-0 text-[0.6rem] font-black uppercase text-rose-500">Quitar</button>'}
    </div>`).join('');
  box.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', () => cancelProject(btn)));
}

// Quitar un proyecto que todavía no está en la nube: confirmación en el mismo botón (sin ventanas emergentes).
async function cancelProject(btn) {
  if (btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn.textContent = '¿Seguro? Toca otra vez';
    setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = 'Quitar'; } }, 4000);
    return;
  }
  btn.disabled = true;
  const id = btn.closest('[data-project-id]').dataset.projectId;
  try {
    await window.nodeApi(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (e) {
    toast(`No se pudo quitar: ${e.message}`);
  }
  await renderMine();
}

async function initUploadView() {
  ensureLayout();
  const select = byId('project-group');
  const individual = '<option value="">Individual</option>';
  if (select) {
    try {
      const { groups } = await window.nodeApi('/api/projects/groups');
      select.innerHTML = individual + groups.map(g => `<option value="${esc(String(g.id))}">${esc(g.name)}</option>`).join('');
    } catch {
      select.innerHTML = individual;
    }
  }
  const btn = byId('btn-upload-project');
  if (btn && !btn.dataset.nodeLabel) { btn.dataset.nodeLabel = '1'; btn.innerHTML = '<i class="fas fa-floppy-disk text-xl"></i> GUARDAR PROYECTO EN LA ESCUELA'; }
  await renderMine();
}

async function uploadProject() {
  const file = byId('project-video')?.files?.[0];
  const form = {
    title: byId('project-title')?.value ?? '',
    description: byId('project-description')?.value ?? '',
    bimestre: byId('project-bimestre')?.value || '1',
    group: byId('project-group')?.value || '',
    file,
  };
  const problem = checkForm(form);
  if (problem) return toast(problem);

  setBusy(true);
  let draftId = null;
  try {
    const body = { title: form.title, description: form.description, bimestre: Number(form.bimestre), filename: file.name, size: file.size };
    if (form.group) body.group_id = Number(form.group);
    draftId = (await window.nodeApi('/api/projects', { method: 'POST', body })).id;
    setProgress(0);
    await putFile(draftId, file);
    draftId = null;
    toast('Proyecto guardado en la escuela. Se publicará solo cuando haya internet.', 'success');
    byId('project-title').value = '';
    byId('project-description').value = '';
    window.clearVideoPreview?.();
  } catch (e) {
    // Si el archivo no llegó, se libera el cupo del borrador (el servidor ya lo hace si se cortó la conexión).
    if (draftId) window.nodeApi(`/api/projects/${encodeURIComponent(draftId)}`, { method: 'DELETE' }).catch(() => { });
    toast(`No se pudo subir: ${e.message}`);
  } finally {
    setBusy(false);
    await renderMine();
  }
}

// La vista previa de modelos 3D necesita three.js (internet): en el nodo solo se muestra el nombre.
const previewWithCloud = window.previewUploadVideo;
window.previewUploadVideo = function previewUploadVideo(input) {
  const name = input?.files?.[0]?.name || '';
  if (!window.isNodeSession || !MODEL_EXT.test(name)) return previewWithCloud?.call(this, input);
  const container = byId('video-preview-container');
  const player = byId('video-preview-player');
  const slot = byId('model-preview-slot');
  player?.classList.add('hidden');
  player?.removeAttribute('src');
  if (slot) {
    slot.innerHTML = `<p class="p-5 text-sm font-bold text-slate-600 dark:text-slate-300"><i class="fas fa-cube text-primary"></i> Modelo 3D: ${esc(name)}. La vista previa aparece cuando se publique en la nube.</p>`;
    slot.classList.remove('hidden');
  }
  container?.classList.remove('hidden');
};

window.nodeProjects = { initUploadView, uploadProject, renderMine };
