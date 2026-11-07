/**
 * REGISTRAR Y ADMINISTRAR NODOS ESCOLARES (solo administradores).
 *
 * Un nodo es la computadora (o Raspberry) que sirve Quetzal en una escuela sin
 * internet. Para sincronizarse con la nube usa un token propio que SOLO da
 * acceso a su escuela. El token lo crea la función register_school_node
 * (migrations/school-nodes.sql), se muestra UNA sola vez y en la base solo
 * queda su hash. Esto reemplaza hacerlo a mano desde la consola del navegador.
 */

// La función devuelve { id, token }; se acepta también una lista de un elemento.
export function extractToken(data) {
  const row = Array.isArray(data) ? data[0] : data;
  const token = row?.token;
  return typeof token === 'string' && /^[0-9a-f]{64}$/i.test(token) ? { id: row.id, token } : null;
}

export function nodeStatus(node, now = Date.now()) {
  if (node.revoked_at) return { key: 'revoked', label: 'Revocado', tone: 'bad' };
  if (!node.last_sync_at) return { key: 'never', label: 'Aún no se ha sincronizado', tone: 'warn' };
  const mins = Math.max(0, Math.round((now - new Date(node.last_sync_at).getTime()) / 60000));
  if (mins < 1) return { key: 'ok', label: 'Sincronizó hace menos de 1 minuto', tone: 'ok' };
  if (mins < 60) return { key: 'ok', label: `Sincronizó hace ${mins} min`, tone: 'ok' };
  const hours = Math.round(mins / 60);
  if (hours < 48) return { key: 'ok', label: `Sincronizó hace ${hours} h`, tone: 'ok' };
  return { key: 'stale', label: `Sincronizó hace ${Math.round(hours / 24)} días`, tone: 'warn' };
}

export function friendlyNodeError(error) {
  const msg = String(error?.message || error || 'Error desconocido');
  if (/school_nodes|register_school_node|revoke_school_node|schema cache|does not exist|42P01|PGRST20/i.test(msg + ' ' + (error?.code || ''))) {
    return 'Falta preparar la base de datos: corre migrations/school-nodes.sql en el SQL Editor de Supabase, espera un minuto y vuelve a intentar.';
  }
  if (/solo un admin/i.test(msg)) return 'Solo un administrador puede registrar o revocar nodos.';
  return msg;
}

// ---------------------------------------------------------------------------
// Interfaz (solo en el navegador)
// ---------------------------------------------------------------------------
// En el navegador W es window; en Node (pruebas) un objeto vacío.
const W = typeof window !== 'undefined' ? window : {};
const esc = (v) => (window.sanitizeInput ? window.sanitizeInput(v) : String(v ?? ''));
const TONE = { ok: 'text-emerald-600', warn: 'text-amber-600', bad: 'text-rose-500' };
let schools = [];

function modalBody() {
  document.getElementById('node-admin-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'node-admin-modal';
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-xl max-h-[90vh] overflow-y-auto custom-scrollbar p-6 bg-white dark:bg-slate-900 shadow-2xl animate-slideUp">
      <div class="flex justify-between items-start mb-4">
        <h2 class="text-lg font-black uppercase tracking-tight text-slate-800 dark:text-white"><i class="fas fa-server text-primary mr-2"></i> Nodos escolares</h2>
        <button type="button" onclick="this.closest('.fixed').remove()" class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500" aria-label="Cerrar"><i class="fas fa-times"></i></button>
      </div>
      <div id="node-admin-body"></div>
    </div>`;
  document.body.appendChild(modal);
  return modal.querySelector('#node-admin-body');
}

function showError(message) {
  const box = document.getElementById('node-admin-error');
  if (box) box.innerHTML = message ? `<div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-xs font-bold text-rose-600 dark:text-rose-300"><i class="fas fa-circle-xmark mr-1"></i> ${esc(message)}</div>` : '';
}

W.openNodeAdmin = async function openNodeAdmin() {
  if (window.userRole !== 'admin') return window.showToast?.('<i class="fas fa-circle-xmark"></i> Solo un administrador puede registrar nodos', 'error');
  const body = modalBody();
  body.innerHTML = '<p class="text-sm text-slate-400 text-center py-8"><i class="fas fa-spinner fa-spin"></i> Cargando...</p>';

  const { data, error } = await window._supabase.from('schools').select('code, name').order('name');
  if (error) { body.innerHTML = `<div id="node-admin-error"></div>`; return showError(friendlyNodeError(error)); }
  schools = data || [];

  body.innerHTML = `
    <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">Un <b>nodo</b> es la computadora (o Raspberry) que sirve Quetzal en una escuela sin internet. Al registrarlo se crea su <b>token</b>, que se pega una sola vez en el instalador.</p>
    <div id="node-admin-token"></div>
    <div class="space-y-3">
      <div>
        <label for="node-admin-school" class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Establecimiento *</label>
        <select id="node-admin-school" class="input-field-tw h-11 text-sm" onchange="window.nodeAdminSuggestName()">
          <option value="">Elige un establecimiento</option>
          ${schools.map(s => `<option value="${window.sanitizeAttr ? window.sanitizeAttr(s.code) : esc(s.code)}">${esc(s.name)} (${esc(s.code)})</option>`).join('')}
        </select>
      </div>
      <div>
        <label for="node-admin-name" class="text-[0.6rem] font-bold uppercase text-slate-400 tracking-widest mb-1.5 block">Nombre del nodo</label>
        <input type="text" id="node-admin-name" maxlength="80" class="input-field-tw h-11 text-sm" placeholder="Ej. Nodo de la dirección" oninput="this.dataset.touched='1'">
      </div>
      <div id="node-admin-error" aria-live="polite"></div>
      <button type="button" id="node-admin-register" class="btn-primary-tw w-full h-12 text-xs uppercase font-bold" onclick="window.registerSchoolNode()"><i class="fas fa-plus"></i> Registrar nodo escolar</button>
    </div>
    <h3 class="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 mt-6 mb-2">Nodos registrados</h3>
    <div id="node-admin-list" class="space-y-2"></div>`;
  await renderNodeList();
};

W.nodeAdminSuggestName = function nodeAdminSuggestName() {
  const code = document.getElementById('node-admin-school')?.value;
  const nameInput = document.getElementById('node-admin-name');
  const school = schools.find(s => s.code === code);
  if (nameInput && school && !nameInput.dataset.touched) nameInput.value = `Nodo ${school.name}`.slice(0, 80);
};

async function renderNodeList() {
  const list = document.getElementById('node-admin-list');
  if (!list) return;
  const { data, error } = await window._supabase.from('school_nodes')
    .select('id, school_code, name, created_at, last_sync_at, revoked_at').order('created_at', { ascending: false });
  if (error) { list.innerHTML = `<p class="text-xs text-rose-500">${esc(friendlyNodeError(error))}</p>`; return; }
  if (!data?.length) { list.innerHTML = '<p class="text-xs text-slate-400">Todavía no hay nodos registrados.</p>'; return; }
  const schoolName = (code) => schools.find(s => s.code === code)?.name || code;
  const when = (iso) => (window.formatDateTime ? window.formatDateTime(iso) : new Date(iso).toLocaleString('es-GT'));
  list.innerHTML = data.map(n => {
    const st = nodeStatus(n);
    return `
      <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-bold text-slate-800 dark:text-white truncate">${esc(n.name)}</p>
          <p class="text-[0.65rem] text-slate-400 truncate">${esc(schoolName(n.school_code))} · creado ${esc(when(n.created_at))}</p>
          <p class="text-[0.7rem] font-bold ${TONE[st.tone]}">${esc(st.label)}</p>
        </div>
        ${n.revoked_at
          ? `<button type="button" class="shrink-0 text-[0.6rem] font-black uppercase text-rose-500 hover:text-rose-600" data-delete="${esc(n.id)}" onclick="window.deleteSchoolNode(this)">Eliminar</button>`
          : `<button type="button" class="shrink-0 text-[0.6rem] font-black uppercase text-rose-500 hover:text-rose-600" data-revoke="${esc(n.id)}" onclick="window.revokeSchoolNode(this)">Revocar</button>`}
      </div>`;
  }).join('');
}

W.registerSchoolNode = async function registerSchoolNode() {
  showError('');
  const code = document.getElementById('node-admin-school')?.value;
  const name = document.getElementById('node-admin-name')?.value.trim();
  if (!code) return showError('Elige el establecimiento del nodo.');
  const btn = document.getElementById('node-admin-register');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
  try {
    const { data, error } = await window._supabase.rpc('register_school_node', { p_school: code, p_name: name || 'Nodo' });
    if (error) return showError(friendlyNodeError(error));
    const result = extractToken(data);
    if (!result) return showError('El servidor respondió, pero sin un token válido. Revisa que migrations/school-nodes.sql esté corrida completa.');
    showToken(result.token, schools.find(s => s.code === code)?.name || code);
    await renderNodeList();
  } catch (e) {
    showError(friendlyNodeError(e));
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus"></i> Registrar nodo escolar';
  }
};

function showToken(token, schoolName) {
  const box = document.getElementById('node-admin-token');
  if (!box) return;
  box.innerHTML = `
    <div class="p-4 mb-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 space-y-3">
      <p class="text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300"><i class="fas fa-key mr-1"></i> Token de ${esc(schoolName)} · se muestra una sola vez</p>
      <code id="node-admin-token-text" class="block break-all select-all font-mono text-sm p-3 rounded-xl bg-white dark:bg-slate-950 text-slate-800 dark:text-white">${esc(token)}</code>
      <div class="flex gap-2">
        <button type="button" class="btn-primary-tw flex-1 h-10 text-[0.65rem] uppercase font-bold" onclick="window.copyNodeToken()"><i class="fas fa-copy"></i> Copiar token</button>
        <button type="button" class="btn-secondary-tw flex-1 h-10 text-[0.65rem] uppercase font-bold" onclick="window.hideNodeToken()">Ya lo guardé</button>
      </div>
      <p class="text-[0.7rem] text-slate-500 dark:text-slate-400">Pégalo cuando el instalador pida <b>Token:</b>. No lo compartas por mensajes que otras personas puedan ver. Si lo pierdes, registra otro nodo y revoca este.</p>
    </div>`;
  box.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}

W.copyNodeToken = async function copyNodeToken() {
  const el = document.getElementById('node-admin-token-text');
  const text = el?.textContent || '';
  const ok = () => window.showToast?.('<i class="fas fa-circle-check"></i> Token copiado', 'success');
  try { await navigator.clipboard.writeText(text); return ok(); } catch { /* sin permiso: método clásico */ }
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    if (document.execCommand('copy')) return ok();
  } catch { }
  window.showToast?.('<i class="fas fa-circle-xmark"></i> No se pudo copiar solo: el token quedó seleccionado, cópialo con Ctrl+C', 'error');
};

W.hideNodeToken = function hideNodeToken() {
  const box = document.getElementById('node-admin-token');
  if (box) box.innerHTML = '';
};

// Eliminar un nodo ya revocado (el registro se borra de verdad; el servidor físico no vuelve a poder sincronizar).
W.deleteSchoolNode = async function deleteSchoolNode(btn) {
  if (btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn.textContent = '¿Seguro? Toca de nuevo';
    setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = 'Eliminar'; } }, 4000);
    return;
  }
  btn.disabled = true;
  const { error } = await window._supabase.rpc('delete_school_node', { p_id: btn.dataset.delete });
  if (error) { btn.disabled = false; return showError(/delete_school_node|schema cache|does not exist|42883|PGRST20/i.test(error.message || '') ? 'Falta ejecutar la migración «node-manage» en Supabase.' : (error.message || 'No se pudo eliminar')); }
  window.showToast?.('<i class="fas fa-circle-check"></i> Nodo eliminado', 'success');
  await renderNodeList();
};

W.revokeSchoolNode = async function revokeSchoolNode(btn) {
  // Confirmación en la misma pantalla (la app no usa confirm()).
  if (btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn.textContent = '¿Seguro? Toca de nuevo';
    setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = 'Revocar'; } }, 4000);
    return;
  }
  btn.disabled = true;
  const { error } = await window._supabase.rpc('revoke_school_node', { p_id: btn.dataset.revoke });
  if (error) { btn.disabled = false; return showError(friendlyNodeError(error)); }
  window.showToast?.('<i class="fas fa-circle-check"></i> Nodo revocado: ya no puede sincronizar', 'success');
  await renderNodeList();
};
