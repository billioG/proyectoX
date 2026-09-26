/**
 * MODO NODO ESCOLAR -- cuando la app se abre desde una Raspberry de la
 * escuela (school-node/), usa la API local del nodo en vez de Supabase:
 * login con PIN personal, cursos, archivos y progreso, todo sin internet.
 * En los dominios de la nube ni siquiera se pregunta: los colegios con
 * internet funcionan exactamente igual que antes.
 */

const CLOUD_HOSTS = ['clases.yoaprendo.online', 'billiog.github.io'];
const NODE_TOKEN_KEY = 'PX_NODE_TOKEN';
const NODE_CLASS_KEY = 'PX_NODE_CLASS';

window.detectQuetzalNode = async function detectQuetzalNode() {
  if (CLOUD_HOSTS.includes(location.hostname)) return null;
  try {
    const res = await fetch('/api/node/status', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.node) return null;
    window.QUETZAL_NODE = data;
    document.documentElement.classList.add('node-mode');
    // En el nodo los archivos ya vienen de la Raspberry: no hay nada que
    // descargar ni espacio que administrar en la tablet.
    const style = document.createElement('style');
    style.textContent = '.node-mode [id^="btn-download-course-"], .node-mode [id^="btn-clear-course-"], .node-mode #storage-status { display: none !important; }';
    document.head.appendChild(style);
    return data;
  } catch {
    return null;
  }
};

window.nodeApi = async function nodeApi(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem(NODE_TOKEN_KEY);
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
};

// Las lecciones apuntan a Supabase Storage; en el nodo los mismos archivos
// están espejados en /content/.
window.nodeContentUrl = function nodeContentUrl(url) {
  const base = window.QUETZAL_NODE?.storage_base;
  if (!base || typeof url !== 'string' || !url.startsWith(base)) return url;
  return `${location.origin}/content/${url.slice(base.length)}`;
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Arranque en modo nodo: sesión guardada o pantalla de login con PIN.
window.startNodeMode = async function startNodeMode() {
  if (localStorage.getItem(NODE_TOKEN_KEY)) {
    try {
      const { student } = await window.nodeApi('/api/me');
      return enterNode(student);
    } catch {
      localStorage.removeItem(NODE_TOKEN_KEY);
    }
  }
  window.openNodeLogin();
};

function enterNode(student) {
  window.isNodeSession = true;
  window.enterOfflineSession({ id: student.id }, student, 'estudiante', { node: true });
  // Sin internet solo funciona Cursos: se ocultan las demás secciones.
  document.querySelectorAll('#nav-estudiante [onclick]').forEach(el => {
    const action = el.getAttribute('onclick') || '';
    if (!/lessons|logout/i.test(action)) el.style.display = 'none';
  });
}

const overlayStyle = 'position:fixed;inset:0;z-index:300;background:#0f172a;color:#fff;overflow-y:auto;padding:1.5rem;font-family:inherit';
const cardBtn = 'display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:1rem .5rem;border-radius:1.25rem;border:2px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);color:#fff;cursor:pointer';

window.openNodeLogin = async function openNodeLogin(forceClassPick = false) {
  document.getElementById('node-login')?.remove();
  const box = document.createElement('div');
  box.id = 'node-login';
  box.style.cssText = overlayStyle;
  document.body.appendChild(box);

  const saved = JSON.parse(localStorage.getItem(NODE_CLASS_KEY) || 'null');
  if (!saved || forceClassPick) return renderClassPick(box);
  renderStudentPick(box, saved);
};

async function renderClassPick(box) {
  const { classes } = await window.nodeApi('/api/students');
  box.innerHTML = `
    <div style="max-width:40rem;margin:0 auto">
      <h2 style="font-size:1.5rem;font-weight:900;margin:0 0 .25rem;color:#fff">🌳 ${esc(window.QUETZAL_NODE?.name || 'Escuela')}</h2>
      <p style="color:#94a3b8;font-size:.85rem;margin:0 0 1.25rem">¿De qué clase es esta tablet? (queda guardado)</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));gap:.75rem">
        ${classes.map((c, i) => `<button data-i="${i}" style="${cardBtn};font-weight:900;font-size:1rem">${esc(c.grade)} ${esc(c.section)}</button>`).join('')}
      </div>
      ${classes.length ? '' : '<p style="color:#94a3b8">El nodo todavía no tiene alumnos: tiene que sincronizarse con internet una vez.</p>'}
    </div>`;
  box.querySelectorAll('[data-i]').forEach(btn => btn.onclick = () => {
    const c = classes[Number(btn.dataset.i)];
    localStorage.setItem(NODE_CLASS_KEY, JSON.stringify(c));
    renderStudentPick(box, c);
  });
}

async function renderStudentPick(box, cls) {
  const { students } = await window.nodeApi(`/api/students?grade=${encodeURIComponent(cls.grade)}&section=${encodeURIComponent(cls.section)}`);
  const avatar = (s) => s.profile_photo_url
    ? `<img src="${esc(window.nodeContentUrl(s.profile_photo_url))}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()">`
    : esc((s.full_name || '?').trim().charAt(0).toUpperCase());
  box.innerHTML = `
    <div style="max-width:40rem;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:.25rem">
        <h2 style="font-size:1.5rem;font-weight:900;margin:0;color:#fff">¿Quién sos?</h2>
        <button id="node-change-class" style="padding:.5rem .9rem;border-radius:9999px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#cbd5e1;font-weight:800;font-size:.75rem;cursor:pointer">${esc(cls.grade)} ${esc(cls.section)} · cambiar</button>
      </div>
      <p style="color:#94a3b8;font-size:.85rem;margin:0 0 1.25rem">Tocá tu nombre y escribí tu PIN.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(7.5rem,1fr));gap:.75rem">
        ${students.map((s, i) => `
          <button data-i="${i}" style="${cardBtn}">
            <span style="width:4rem;height:4rem;border-radius:9999px;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:1.6rem;font-weight:900;background:linear-gradient(135deg,#6366f1,#ec4899)">${avatar(s)}</span>
            <span style="font-size:.8rem;font-weight:800;line-height:1.2;text-align:center">${esc(s.full_name)}</span>
            ${s.has_pin ? '' : '<span style="font-size:.6rem;color:#fbbf24">primera vez</span>'}
          </button>`).join('')}
      </div>
    </div>`;
  box.querySelector('#node-change-class').onclick = () => window.openNodeLogin(true);
  box.querySelectorAll('[data-i]').forEach(btn => btn.onclick = () => renderPinPad(box, students[Number(btn.dataset.i)], cls));
}

// Teclado de PIN grande (tablets, niños). Primera vez: crear + confirmar.
function renderPinPad(box, student, cls) {
  const creating = !student.has_pin;
  let step = creating ? 'create' : 'enter';
  let pin = '', firstPin = '';

  const title = () => step === 'create' ? 'Creá tu PIN secreto' : step === 'confirm' ? 'Repetí tu PIN' : 'Escribí tu PIN';
  const help = () => step === 'enter' ? '' : 'Son 4 números que solo vos sabés. No se lo digas a nadie.';

  function draw(error = '') {
    box.innerHTML = `
      <div style="max-width:22rem;margin:0 auto;text-align:center">
        <button id="pin-back" style="background:none;border:0;color:#94a3b8;font-weight:800;cursor:pointer;margin-bottom:1rem"><i class="fas fa-arrow-left"></i> Volver</button>
        <div style="font-size:1.2rem;font-weight:900">${esc(student.full_name)}</div>
        <div style="font-size:1rem;font-weight:800;color:#a5b4fc;margin:.5rem 0 .25rem">${title()}</div>
        <p style="color:#94a3b8;font-size:.75rem;min-height:1rem;margin:0 0 1rem">${help()}</p>
        <div style="display:flex;justify-content:center;gap:.9rem;margin-bottom:.75rem">
          ${[0, 1, 2, 3].map(i => `<span style="width:1.1rem;height:1.1rem;border-radius:9999px;${i < pin.length ? 'background:#facc15' : 'border:2px solid rgba(255,255,255,.35)'}"></span>`).join('')}
        </div>
        <p style="color:#fb7185;font-size:.85rem;min-height:1.2rem;margin:0 0 .75rem">${esc(error)}</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k
            ? `<button data-k="${k}" style="height:4rem;border-radius:1rem;border:0;background:rgba(255,255,255,.08);color:#fff;font-size:1.5rem;font-weight:900;cursor:pointer">${k}</button>`
            : '<span></span>').join('')}
        </div>
      </div>`;
    box.querySelector('#pin-back').onclick = () => renderStudentPick(box, cls);
    box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => press(b.dataset.k));
  }

  async function press(k) {
    if (k === '⌫') { pin = pin.slice(0, -1); return draw(); }
    if (pin.length >= 4) return;
    pin += k;
    draw();
    if (pin.length < 4) return;

    if (step === 'create') { firstPin = pin; pin = ''; step = 'confirm'; return draw(); }
    if (step === 'confirm' && pin !== firstPin) { pin = ''; firstPin = ''; step = 'create'; return draw('No coincidían. Probá de nuevo.'); }

    try {
      const res = await window.nodeApi('/api/login', { method: 'POST', body: { student_id: student.id, pin, device: navigator.userAgent } });
      localStorage.setItem(NODE_TOKEN_KEY, res.token);
      box.remove();
      enterNode(res.student);
      if (res.last_entry?.entered_at) {
        const when = new Date(res.last_entry.entered_at).toLocaleString('es-GT', { weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        window.showToast?.(`<i class="fas fa-clock-rotate-left"></i> Última vez que se usó tu cuenta: ${esc(when)}. ¿No fuiste vos? Avisale a tu docente.`, 'info');
      }
    } catch (e) {
      pin = '';
      draw(e.message || 'No se pudo entrar');
    }
  }
  draw();
}

window.nodeLogout = async function nodeLogout() {
  try { await window.nodeApi('/api/logout', { method: 'POST' }); } catch { /* sin sesión */ }
  localStorage.removeItem(NODE_TOKEN_KEY);
};
