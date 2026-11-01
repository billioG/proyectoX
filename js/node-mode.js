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
    // Tampoco se muestra lo que necesita la nube: avisos, sync con la nube,
    // asistente con IA (la mascota del header), y los accesos al inicio y
    // al perfil (en el nodo solo existe Cursos).
    const style = document.createElement('style');
    style.textContent = `
      .node-mode [id^="btn-download-course-"], .node-mode [id^="btn-clear-course-"], .node-mode #storage-status,
      .node-mode #announcements-bell, .node-mode #sync-indicator, .node-mode #dev-mode-toggle,
      .node-mode #mascot-widget-container, .node-mode #mascot-ai-modal { display: none !important; }
      .node-mode header .cursor-pointer { pointer-events: none; }
      .node-mode header button { pointer-events: auto; }
      .node-mode header [onclick*="'profile'"], .node-mode header [onclick*="'feed'"] { pointer-events: auto; }
      #node-chip { display: none; }
      .node-mode #node-chip { display: inline-flex; align-items: center; gap: .4rem; padding: .35rem .75rem; border-radius: 9999px;
        background: rgba(16,185,129,.12); color: #059669; font-size: .65rem; font-weight: 900; text-transform: uppercase; letter-spacing: .02em; }`;
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
  // Etiqueta en el header: en qué red está y cuándo se sincronizó.
  const bell = document.getElementById('announcements-bell');
  if (bell && !document.getElementById('node-chip')) {
    const chip = document.createElement('span');
    chip.id = 'node-chip';
    const last = window.QUETZAL_NODE?.last_sync_at;
    chip.title = last ? `Última sincronización: ${new Date(last).toLocaleString('es-GT')}` : 'Todavía no se sincronizó';
    chip.innerHTML = `<i class="fas fa-tree"></i> ${esc(window.QUETZAL_NODE?.name || 'Red de la escuela')}`;
    bell.parentElement.insertBefore(chip, bell);
  }
  // Sin internet funcionan Inicio (proyectos de la clase), Cursos y Subir proyecto (se guarda en el nodo y se publica al sincronizar); el resto se oculta.
  document.querySelectorAll('#nav-estudiante [onclick]').forEach(el => {
    const action = el.getAttribute('onclick') || '';
    if (!/feed|lessons|upload|logout/i.test(action)) el.style.display = 'none';
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

const teacherBtn = `<button data-teacher style="position:fixed;right:1rem;bottom:calc(env(safe-area-inset-bottom, 0px) + 1rem);padding:.55rem 1rem;border-radius:9999px;border:1px solid rgba(255,255,255,.2);background:rgba(15,23,42,.9);color:#cbd5e1;font-weight:800;font-size:.75rem;cursor:pointer"><i class="fas fa-chalkboard-user"></i> Docente</button>`;

async function renderClassPick(box) {
  const { classes } = await window.nodeApi('/api/students');
  box.innerHTML = `
    ${teacherBtn}
    <div style="max-width:40rem;margin:0 auto">
      <h2 style="font-size:1.5rem;font-weight:900;margin:0 0 .25rem;color:#fff">🌳 ${esc(window.QUETZAL_NODE?.name || 'Escuela')}</h2>
      <p style="color:#94a3b8;font-size:.85rem;margin:0 0 1.25rem">¿De qué clase es esta tablet? (queda guardado)</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));gap:.75rem">
        ${classes.map((c, i) => `<button data-i="${i}" style="${cardBtn};font-weight:900;font-size:1rem">${esc(c.grade)} ${esc(c.section)}</button>`).join('')}
      </div>
      ${classes.length ? '' : '<p style="color:#cbd5e1;font-size:1rem;line-height:1.5">El nodo todavía no tiene alumnos: tiene que sincronizarse con internet una vez.</p><p style="color:#94a3b8;font-size:.9rem;line-height:1.5">Toca <b>Docente</b> (abajo a la derecha), escribe el código de docente y conecta el nodo con la nube pegando el token de tu escuela.</p>'}
    </div>`;
  box.querySelectorAll('[data-i]').forEach(btn => btn.onclick = () => {
    const c = classes[Number(btn.dataset.i)];
    localStorage.setItem(NODE_CLASS_KEY, JSON.stringify(c));
    renderStudentPick(box, c);
  });
  box.querySelector('[data-teacher]').onclick = () => renderTeacherChoose(box);
}

async function renderStudentPick(box, cls) {
  const { students } = await window.nodeApi(`/api/students?grade=${encodeURIComponent(cls.grade)}&section=${encodeURIComponent(cls.section)}`);
  // La tablet recordaba una clase que ya no existe en el nodo (cambió el
  // nombre del grado, o se sincronizó otra escuela): volver a elegirla.
  if (!students.length) {
    localStorage.removeItem(NODE_CLASS_KEY);
    return renderClassPick(box);
  }
  const avatar = (s) => s.profile_photo_url
    ? `<img src="${esc(window.nodeContentUrl(s.profile_photo_url))}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()">`
    : esc((s.full_name || '?').trim().charAt(0).toUpperCase());
  box.innerHTML = `
    ${teacherBtn}
    <div style="max-width:40rem;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:.25rem">
        <h2 style="font-size:1.5rem;font-weight:900;margin:0;color:#fff">¿Quién eres?</h2>
        <button id="node-change-class" style="padding:.5rem .9rem;border-radius:9999px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#cbd5e1;font-weight:800;font-size:.75rem;cursor:pointer">${esc(cls.grade)} ${esc(cls.section)} · cambiar</button>
      </div>
      <p style="color:#94a3b8;font-size:.85rem;margin:0 0 1.25rem">Toca tu nombre y escribe tu PIN.</p>
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
  box.querySelector('[data-teacher]').onclick = () => renderTeacherChoose(box);
  box.querySelectorAll('[data-i]').forEach(btn => btn.onclick = () => renderPinPad(box, students[Number(btn.dataset.i)], cls));
}

// Teclado de PIN grande (tablets, niños). Primera vez: crear + confirmar.
function renderPinPad(box, student, cls) {
  const creating = !student.has_pin;
  let step = creating ? 'create' : 'enter';
  let pin = '', firstPin = '';

  const title = () => step === 'create' ? 'Crea tu PIN secreto' : step === 'confirm' ? 'Repite tu PIN' : 'Escribe tu PIN';
  const help = () => step === 'enter' ? '' : 'Son 4 números que solo tú sabes. No se lo digas a nadie.';

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
    if (step === 'confirm' && pin !== firstPin) { pin = ''; firstPin = ''; step = 'create'; return draw('No coincidían. Prueba de nuevo.'); }

    try {
      const res = await window.nodeApi('/api/login', { method: 'POST', body: { student_id: student.id, pin, device: navigator.userAgent } });
      localStorage.setItem(NODE_TOKEN_KEY, res.token);
      box.remove();
      enterNode(res.student);
      if (res.last_entry?.entered_at) {
        const when = new Date(res.last_entry.entered_at).toLocaleString('es-GT', { weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        window.showToast?.(`<i class="fas fa-clock-rotate-left"></i> Última vez que se usó tu cuenta: ${esc(when)}. ¿No fuiste tú? Avísale a tu docente.`, 'info');
      }
    } catch (e) {
      pin = '';
      draw(e.message || 'No se pudo entrar');
    }
  }
  draw();
}

// ---------- Docente con PIN personal: evaluar proyectos (sin internet) ----------
// Cada docente elige su nombre y entra con su PIN de 6 números (la primera vez lo crea con el código de docente del
// nodo). Solo ve y evalúa proyectos de las clases que tiene asignadas; la nube valida y recalcula al sincronizar.
const TEACHER_P_KEY = 'PX_NODE_TEACHER_P';
const criteria = [
  ['creativity', 'Creatividad e innovación'], ['clarity', 'Claridad de presentación'], ['functionality', 'Funcionalidad técnica'],
  ['teamwork', 'Trabajo en equipo'], ['social_impact', 'Impacto social'],
];
const inputStyle = 'width:100%;height:3.2rem;border-radius:1rem;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font-size:1.3rem;text-align:center;letter-spacing:.25em';
const bigBtn = 'width:100%;height:3rem;border-radius:1rem;border:0;background:#10b981;color:#fff;font-weight:900;cursor:pointer';
const ghostBtn = 'background:none;border:0;color:#94a3b8;font-weight:800;cursor:pointer';

async function evalApi(path, body) {
  const token = sessionStorage.getItem(TEACHER_P_KEY);
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/teacher/pin-login') sessionStorage.removeItem(TEACHER_P_KEY);
    throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  }
  return data;
}

async function renderTeacherChoose(box, error = '') {
  if (sessionStorage.getItem(TEACHER_P_KEY) && !error) return renderEvalList(box);
  let teachers = [];
  try { ({ teachers } = await evalApi('/api/teachers')); } catch (e) { error = error || e.message; }
  box.innerHTML = `
    <div style="max-width:24rem;margin:0 auto;text-align:center">
      <button id="tc-back" style="${ghostBtn};margin-bottom:1rem"><i class="fas fa-arrow-left"></i> Volver</button>
      <div style="font-size:1.2rem;font-weight:900"><i class="fas fa-chalkboard-user"></i> Soy docente</div>
      <p style="color:#94a3b8;font-size:.8rem">Elige tu nombre para evaluar los proyectos de tus clases.</p>
      <p style="color:#fb7185;font-size:.85rem;min-height:1.2rem">${esc(error)}</p>
      <div style="display:grid;gap:.5rem;margin-bottom:1rem">
        ${teachers.map(t => `<button data-tid="${esc(t.id)}" style="${cardBtn};flex-direction:row;justify-content:space-between;padding:.9rem 1rem;font-weight:800">
          <span>${esc(t.full_name)}</span>${t.has_pin ? '' : '<span style="font-size:.6rem;color:#fcd34d">Sin PIN</span>'}</button>`).join('')
          || '<p style="color:#94a3b8;font-size:.85rem">Este nodo todavía no conoce a los docentes: sincronízalo con internet o por USB.</p>'}
      </div>
      <button id="tc-admin" style="${ghostBtn};font-size:.8rem"><i class="fas fa-gear"></i> Administrar el nodo (código de docente)</button>
    </div>`;
  box.querySelector('#tc-back').onclick = () => window.openNodeLogin();
  box.querySelector('#tc-admin').onclick = () => renderTeacherLogin(box);
  box.querySelectorAll('[data-tid]').forEach(b => b.onclick = () => renderTeacherPin(box, teachers.find(t => t.id === b.dataset.tid)));
}

function renderTeacherPin(box, teacher, error = '') {
  box.innerHTML = `
    <div style="max-width:22rem;margin:0 auto;text-align:center">
      <button id="tp-back" style="${ghostBtn};margin-bottom:1rem"><i class="fas fa-arrow-left"></i> Volver</button>
      <div style="font-size:1.2rem;font-weight:900">${esc(teacher.full_name)}</div>
      <p style="color:#94a3b8;font-size:.8rem">${teacher.has_pin ? 'Escribe tu PIN de 6 números.' : 'Primera vez: crea un PIN de 6 números. Para confirmar que eres tú, escribe también el código de docente de esta escuela.'}</p>
      <input id="tp-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="PIN" style="${inputStyle}">
      ${teacher.has_pin ? '' : `<input id="tp-code" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="Código de docente" style="${inputStyle};margin-top:.6rem">`}
      <p style="color:#fb7185;font-size:.85rem;min-height:1.2rem">${esc(error)}</p>
      <button id="tp-go" style="${bigBtn}">Entrar</button>
    </div>`;
  const go = async () => {
    try {
      const body = { teacher_id: teacher.id, pin: box.querySelector('#tp-pin').value.trim() };
      if (!teacher.has_pin) body.code = box.querySelector('#tp-code').value.trim();
      const { token } = await evalApi('/api/teacher/pin-login', body);
      sessionStorage.setItem(TEACHER_P_KEY, token);
      renderEvalList(box);
    } catch (e) { renderTeacherPin(box, teacher, e.message); }
  };
  box.querySelector('#tp-go').onclick = go;
  box.querySelector('#tp-pin').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  box.querySelector('#tp-back').onclick = () => renderTeacherChoose(box);
  box.querySelector('#tp-pin').focus();
}

async function renderEvalList(box) {
  let projects;
  try { ({ projects } = await evalApi('/api/teacher/evaluations')); }
  catch (e) { return renderTeacherChoose(box, e.status === 401 ? 'La sesión venció, vuelve a entrar con tu PIN.' : e.message); }
  const chip = (txt, bg, fg) => `<span style="font-size:.6rem;font-weight:900;padding:.15rem .5rem;border-radius:9999px;background:${bg};color:${fg};white-space:nowrap">${txt}</span>`;
  box.innerHTML = `
    <div style="max-width:46rem;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:.25rem">
        <h2 style="font-size:1.3rem;font-weight:900;margin:0;color:#fff"><i class="fas fa-clipboard-check"></i> Evaluar proyectos</h2>
        <button id="ev-exit" style="padding:.5rem .9rem;border-radius:9999px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#cbd5e1;font-weight:800;font-size:.75rem;cursor:pointer">Salir</button>
      </div>
      <p style="color:#94a3b8;font-size:.8rem;margin:0 0 1rem">Lo que evalúes se sube a la nube cuando la escuela tenga internet.</p>
      <div id="ev-list" style="display:grid;gap:.5rem">
        ${projects.map(p => `
          <button data-ev-key="${esc(p.key)}" style="${cardBtn};flex-direction:row;justify-content:space-between;text-align:left;padding:.8rem 1rem;gap:.8rem">
            <span style="min-width:0">
              <span style="display:block;font-weight:800;font-size:.9rem">${esc(p.title)}</span>
              <span style="display:block;font-size:.7rem;color:#94a3b8">${esc(p.author_name)} · ${esc(p.grade)} ${esc(p.section)}${p.source === 'local' ? ' · guardado en la escuela' : ''}</span>
            </span>
            ${p.evaluated ? chip(`Nota ${esc(p.score)}`, 'rgba(16,185,129,.18)', '#6ee7b7') : chip('Por evaluar', 'rgba(251,191,36,.18)', '#fcd34d')}
          </button>`).join('') || '<p style="color:#94a3b8">Todavía no hay proyectos en tus clases.</p>'}
      </div>
    </div>`;
  box.querySelector('#ev-exit').onclick = () => { sessionStorage.removeItem(TEACHER_P_KEY); window.openNodeLogin(); };
  box.querySelectorAll('[data-ev-key]').forEach(b => b.onclick = () => renderEvalForm(box, b.dataset.evKey));
}

async function renderEvalForm(box, key) {
  let d;
  try { d = await evalApi(`/api/teacher/evaluations/${encodeURIComponent(key)}`); }
  catch (e) { window.showToast?.(esc(e.message), 'error'); return renderEvalList(box); }
  const ev = d.evaluation || {};
  const token = encodeURIComponent(sessionStorage.getItem(TEACHER_P_KEY) || '');
  const fileUrl = `/api/teacher/project-file/${encodeURIComponent(d.local_id || '')}?t=${token}`;
  const media = !d.local_id || !d.has_file
    ? '<p style="color:#94a3b8;font-size:.8rem"><i class="fas fa-circle-info"></i> El video de este proyecto no está en esta computadora: se ve con internet.</p>'
    : d.kind === 'model'
      ? `<p style="font-size:.8rem"><a href="${fileUrl}" style="color:#a5b4fc;font-weight:800"><i class="fas fa-cube"></i> Descargar el modelo 3D</a></p>`
      : `<video controls preload="metadata" src="${fileUrl}" style="width:100%;max-height:20rem;border-radius:1rem;background:#000"></video>`;
  box.innerHTML = `
    <div style="max-width:40rem;margin:0 auto">
      <button id="ef-back" style="${ghostBtn};margin-bottom:.75rem"><i class="fas fa-arrow-left"></i> Volver a la lista</button>
      <h2 style="font-size:1.2rem;font-weight:900;margin:0">${esc(d.title)}</h2>
      <p style="color:#94a3b8;font-size:.8rem;margin:.2rem 0 .8rem">${esc(d.author_name)} · ${esc(d.grade)} ${esc(d.section)}${d.bimestre ? ` · Bimestre ${esc(d.bimestre)}` : ''}</p>
      ${media}
      <p style="font-size:.85rem;color:#cbd5e1;white-space:pre-wrap">${esc(d.description)}</p>
      <div style="display:grid;gap:.6rem;margin:1rem 0">
        ${criteria.map(([id, label]) => `
          <label style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.6rem .9rem;border-radius:1rem;background:rgba(255,255,255,.05)">
            <span style="font-weight:800;font-size:.85rem">${label} <span style="color:#64748b">(0 a 20)</span></span>
            <input id="ev-${id}" type="number" min="0" max="20" step="1" value="${Number.isInteger(ev[`${id}_score`]) ? ev[`${id}_score`] : 0}"
              style="width:5rem;height:2.6rem;border-radius:.8rem;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font-size:1.1rem;font-weight:900;text-align:center">
          </label>`).join('')}
      </div>
      <label style="font-weight:800;font-size:.8rem;color:#94a3b8">Observaciones para el estudiante</label>
      <textarea id="ev-feedback" maxlength="1000" rows="4" style="width:100%;margin-top:.3rem;padding:.7rem;border-radius:1rem;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font-family:inherit">${esc(ev.feedback || '')}</textarea>
      <div style="display:flex;align-items:center;justify-content:space-between;margin:1rem 0">
        <div style="font-weight:900">Nota total: <span id="ev-total" style="font-size:1.8rem;color:#6ee7b7">0</span> <span style="color:#64748b">/ 100</span></div>
        <button id="ev-save" style="${bigBtn};width:auto;padding:0 1.5rem">Guardar evaluación</button>
      </div>
      <p id="ev-error" style="color:#fb7185;font-size:.85rem;min-height:1.2rem"></p>
    </div>`;
  const read = () => Object.fromEntries(criteria.map(([id]) => [`${id}_score`, Number(box.querySelector(`#ev-${id}`).value)]));
  const total = () => { const t = Object.values(read()).reduce((a, b) => a + (Number.isInteger(b) && b >= 0 && b <= 20 ? b : 0), 0); box.querySelector('#ev-total').textContent = String(t); };
  criteria.forEach(([id]) => box.querySelector(`#ev-${id}`).addEventListener('input', total));
  total();
  box.querySelector('#ef-back').onclick = () => renderEvalList(box);
  box.querySelector('#ev-save').onclick = async () => {
    const btn = box.querySelector('#ev-save');
    btn.disabled = true;
    try {
      await evalApi('/api/teacher/evaluate', { key, ...read(), feedback: box.querySelector('#ev-feedback').value });
      window.showToast?.('<i class="fas fa-circle-check"></i> Evaluación guardada. Se sube a la nube cuando haya internet.', 'success');
      renderEvalList(box);
    } catch (e) {
      btn.disabled = false;
      box.querySelector('#ev-error').textContent = e.message;
    }
  };
}

// ---------- Panel del docente (sin internet) ----------
// Se entra con el código de docente del nodo (config.json → teacherCode).
const TEACHER_KEY = 'PX_NODE_TEACHER';

async function teacherApi(path, body) {
  const token = sessionStorage.getItem(TEACHER_KEY);
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/teacher/login') sessionStorage.removeItem(TEACHER_KEY);
    throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  }
  return data;
}

function renderTeacherLogin(box, error = '') {
  if (sessionStorage.getItem(TEACHER_KEY) && !error) return renderTeacherPanel(box);
  box.innerHTML = `
    <div style="max-width:22rem;margin:0 auto;text-align:center">
      <button id="t-back" style="background:none;border:0;color:#94a3b8;font-weight:800;cursor:pointer;margin-bottom:1rem"><i class="fas fa-arrow-left"></i> Volver</button>
      <div style="font-size:1.2rem;font-weight:900"><i class="fas fa-chalkboard-user"></i> Panel del docente</div>
      <p style="color:#94a3b8;font-size:.8rem">Escribe el código de docente de este nodo.</p>
      <input id="t-code" type="password" inputmode="numeric" autocomplete="off" maxlength="12"
        style="width:100%;height:3.2rem;border-radius:1rem;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font-size:1.4rem;text-align:center;letter-spacing:.3em">
      <p style="color:#fb7185;font-size:.85rem;min-height:1.2rem">${esc(error)}</p>
      <button id="t-go" style="width:100%;height:3rem;border-radius:1rem;border:0;background:#10b981;color:#fff;font-weight:900;cursor:pointer">Entrar</button>
    </div>`;
  const go = async () => {
    try {
      const { token } = await teacherApi('/api/teacher/login', { code: box.querySelector('#t-code').value.trim() });
      sessionStorage.setItem(TEACHER_KEY, token);
      renderTeacherPanel(box);
    } catch (e) { renderTeacherLogin(box, e.message); }
  };
  box.querySelector('#t-go').onclick = go;
  box.querySelector('#t-code').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  box.querySelector('#t-back').onclick = () => renderTeacherChoose(box);
  box.querySelector('#t-code').focus();
}

// ---- Conexión del nodo con la nube (token de la escuela y "Sincronizar ahora") ----
// Reemplaza editar config.json a mano: el docente pega el token aquí.
const cloudBox = 'padding:1rem;border-radius:1rem;margin-bottom:1.25rem';
const cloudBtn = 'border:0;border-radius:.8rem;padding:.7rem 1.1rem;font-weight:900;font-size:.8rem;cursor:pointer;color:#fff;background:#10b981';

function cloudCardHtml(node, when) {
  const err = node.last_error ? `<p style="margin:.6rem 0 0;color:#fda4af;font-size:.8rem;font-weight:700"><i class="fas fa-circle-exclamation"></i> ${esc(node.last_error)}</p>` : '';
  if (!node.has_token) {
    return `<div style="${cloudBox};background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.35)">
      <div style="font-weight:900;color:#fcd34d;margin-bottom:.35rem"><i class="fas fa-link-slash"></i> Falta conectar este nodo con la nube</div>
      <p style="margin:0 0 .7rem;font-size:.8rem;color:#e2e8f0;line-height:1.45">Pega aquí el <b>token</b> de tu escuela (lo da el administrador de Quetzal). La computadora debe tener internet unos minutos.</p>
      <input id="t-token" type="text" autocomplete="off" spellcheck="false" placeholder="Pega el token aquí"
        style="width:100%;height:2.8rem;border-radius:.8rem;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;padding:0 .8rem;font-family:monospace;font-size:.8rem">
      <p id="t-token-msg" style="margin:.5rem 0 0;min-height:1.1rem;font-size:.8rem;font-weight:700"></p>
      <button id="t-token-save" style="${cloudBtn};margin-top:.4rem"><i class="fas fa-cloud-arrow-up"></i> Guardar y sincronizar</button>
      ${err}
    </div>`;
  }
  return `<div style="${cloudBox};background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3)">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap">
      <div style="font-size:.85rem;color:#e2e8f0"><b style="color:#6ee7b7"><i class="fas fa-cloud"></i> Conectado con la nube</b><br>
        <span style="color:#94a3b8;font-size:.75rem">${node.syncing ? 'Sincronizando...' : `Última sincronización: ${when(node.last_sync_at)}`}</span></div>
      <button id="t-sync-now" style="${cloudBtn}" ${node.syncing ? 'disabled' : ''}><i class="fas fa-rotate"></i> Sincronizar ahora</button>
    </div>
    <p id="t-token-msg" style="margin:.5rem 0 0;font-size:.8rem;font-weight:700"></p>
    ${err}
  </div>`;
}

// Mientras sincroniza, consulta el avance cada 3 s (hasta 2 minutos) y redibuja el panel.
// El nodo marca "syncing" antes de responder, así que no depende de la hora del celular.
async function waitForSync(box) {
  const msg = box.querySelector('#t-token-msg');
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    if (!box.isConnected) return;
    let data;
    try { data = await teacherApi('/api/teacher/overview'); } catch { continue; }
    if (!data.node.syncing) return renderTeacherPanel(box);
    if (msg) msg.textContent = 'Sincronizando... esto puede tardar unos minutos.';
  }
  renderTeacherPanel(box);
}

function wireCloudCard(box, node) {
  const msg = box.querySelector('#t-token-msg');
  const say = (text, ok = true) => { if (msg) { msg.textContent = text; msg.style.color = ok ? '#6ee7b7' : '#fda4af'; } };

  box.querySelector('#t-token-save')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const token = box.querySelector('#t-token').value;
    if (!token.trim()) return say('Pega primero el token.', false);
    btn.disabled = true;
    say('Guardando...');
    try {
      await teacherApi('/api/teacher/token', { token });
      say('Token guardado. Sincronizando... esto puede tardar unos minutos.');
      waitForSync(box);
    } catch (e) {
      btn.disabled = false;
      say(e.message, false);
    }
  });

  box.querySelector('#t-sync-now')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    say('Sincronizando...');
    try {
      await teacherApi('/api/teacher/sync-now', {});
      waitForSync(box);
    } catch (e) {
      btn.disabled = false;
      say(e.message, false);
    }
  });
}

async function renderTeacherPanel(box) {
  let data;
  try { data = await teacherApi('/api/teacher/overview'); }
  catch (e) { return renderTeacherLogin(box, e.status === 401 ? 'La sesión venció, vuelve a entrar.' : e.message); }

  const when = (iso) => iso ? new Date(iso).toLocaleString('es-GT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'nunca';
  const byClass = {};
  data.students.forEach(s => { (byClass[`${s.grade} ${s.section}`] ||= []).push(s); });
  const p = data.pending;
  const chip = (txt, bg, fg) => `<span style="font-size:.6rem;font-weight:900;padding:.15rem .5rem;border-radius:9999px;background:${bg};color:${fg};white-space:nowrap">${txt}</span>`;

  box.innerHTML = `
    <div style="max-width:46rem;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1rem">
        <h2 style="font-size:1.3rem;font-weight:900;margin:0;color:#fff"><i class="fas fa-chalkboard-user"></i> Panel del docente</h2>
        <button id="t-exit" style="padding:.5rem .9rem;border-radius:9999px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#cbd5e1;font-weight:800;font-size:.75rem;cursor:pointer">Salir</button>
      </div>

      <div id="t-cloud">${cloudCardHtml(data.node, when)}</div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.6rem;margin-bottom:1.25rem">
        <div style="padding:.8rem;border-radius:1rem;background:rgba(255,255,255,.06)"><div style="font-size:.6rem;color:#94a3b8;font-weight:800;text-transform:uppercase">Sync por internet</div><b>${when(data.node.last_sync_at)}</b></div>
        <div style="padding:.8rem;border-radius:1rem;background:rgba(255,255,255,.06)"><div style="font-size:.6rem;color:#94a3b8;font-weight:800;text-transform:uppercase">Sync por USB</div><b>${when(data.node.last_usb_sync_at)}</b></div>
        <div style="padding:.8rem;border-radius:1rem;background:rgba(255,255,255,.06)"><div style="font-size:.6rem;color:#94a3b8;font-weight:800;text-transform:uppercase">Pendiente de subir</div><b>${p.completions} avances · ${p.pins} PIN · ${p.sessions} ingresos</b></div>
        <div style="padding:.8rem;border-radius:1rem;background:rgba(255,255,255,.06)"><div style="font-size:.6rem;color:#94a3b8;font-weight:800;text-transform:uppercase">Archivos por bajar</div><b>${p.files}</b></div>
        <div id="t-projects" style="padding:.8rem;border-radius:1rem;background:rgba(255,255,255,.06)"><div style="font-size:.6rem;color:#94a3b8;font-weight:800;text-transform:uppercase">Proyectos de estudiantes</div><b>${data.projects?.pending ?? 0} por subir · ${data.projects?.synced ?? 0} subidos</b>${data.projects?.failed ? `<div style="color:#fda4af;font-size:.7rem;font-weight:800;margin-top:.2rem">${data.projects.failed} con error: revisa que haya internet</div>` : ''}</div>
      </div>

      ${Object.entries(byClass).map(([cls, list]) => `
        <h3 style="font-size:.85rem;font-weight:900;color:#a5b4fc;margin:1rem 0 .5rem">${esc(cls)} · ${list.length} ${list.length === 1 ? 'alumno' : 'alumnos'}</h3>
        <div style="display:grid;gap:.4rem">
          ${list.map(s => `
            <div style="display:flex;align-items:center;gap:.6rem;padding:.6rem .8rem;border-radius:.9rem;background:rgba(255,255,255,.05)">
              <div style="flex:1;min-width:0">
                <div style="font-weight:800;font-size:.85rem">${esc(s.full_name)}</div>
                <div style="font-size:.7rem;color:#94a3b8">Último ingreso: ${when(s.last_entry)} · ${s.completed} ${s.completed === 1 ? 'lección' : 'lecciones'}</div>
              </div>
              ${s.locked ? chip('Bloqueado', 'rgba(244,63,94,.2)', '#fda4af') : s.has_pin ? chip('Con PIN', 'rgba(16,185,129,.18)', '#6ee7b7') : chip('Sin PIN', 'rgba(251,191,36,.18)', '#fcd34d')}
              ${s.locked ? `<button data-unlock="${esc(s.id)}" style="border:0;border-radius:.6rem;padding:.4rem .6rem;background:rgba(255,255,255,.1);color:#fff;font-size:.7rem;font-weight:800;cursor:pointer">Desbloquear</button>` : ''}
              ${s.has_pin ? `<button data-reset="${esc(s.id)}" data-name="${esc(s.full_name)}" style="border:0;border-radius:.6rem;padding:.4rem .6rem;background:rgba(255,255,255,.1);color:#fff;font-size:.7rem;font-weight:800;cursor:pointer">Restablecer PIN</button>` : ''}
            </div>`).join('')}
        </div>`).join('') || '<p style="color:#94a3b8">El nodo todavía no tiene alumnos: sincronízalo por internet o por USB.</p>'}

      <h3 style="font-size:.85rem;font-weight:900;color:#a5b4fc;margin:1.5rem 0 .5rem">Docentes</h3>
      <div id="t-teachers" style="display:grid;gap:.4rem">${(data.teachers || []).map(t => `
        <div style="display:flex;align-items:center;gap:.6rem;padding:.6rem .8rem;border-radius:.9rem;background:rgba(255,255,255,.05)">
          <div style="flex:1;font-weight:800;font-size:.85rem">${esc(t.full_name)}</div>
          ${t.has_pin ? chip('Con PIN', 'rgba(16,185,129,.18)', '#6ee7b7') : chip('Sin PIN', 'rgba(251,191,36,.18)', '#fcd34d')}
          ${t.has_pin ? `<button data-treset="${esc(t.id)}" data-name="${esc(t.full_name)}" style="border:0;border-radius:.6rem;padding:.4rem .6rem;background:rgba(255,255,255,.1);color:#fff;font-size:.7rem;font-weight:800;cursor:pointer">Restablecer PIN</button>` : ''}
        </div>`).join('') || '<p style="color:#94a3b8">El nodo todavía no conoce a los docentes: sincronízalo.</p>'}</div>

      <h3 style="font-size:.85rem;font-weight:900;color:#a5b4fc;margin:1.5rem 0 .5rem">Ingresos recientes</h3>
      <div style="display:grid;gap:.3rem;font-size:.75rem">
        ${data.logs.map(l => `<div style="display:flex;gap:.6rem;padding:.4rem .6rem;border-radius:.6rem;background:rgba(255,255,255,.03)">
          <span style="color:#94a3b8;white-space:nowrap">${when(l.entered_at)}</span>
          <span style="flex:1">${esc(l.full_name || 'Alumno')} <span style="color:#64748b">· ${esc(l.grade || '')} ${esc(l.section || '')}</span></span>
          <span style="color:#64748b;max-width:9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.device || '')}">${esc(/Android/i.test(l.device || '') ? 'Android' : /iPhone|iPad/i.test(l.device || '') ? 'iPhone/iPad' : /Windows/i.test(l.device || '') ? 'Windows' : 'Otro')}</span>
        </div>`).join('') || '<p style="color:#94a3b8">Todavía no hay ingresos.</p>'}
      </div>
    </div>`;

  box.querySelector('#t-exit').onclick = () => { sessionStorage.removeItem(TEACHER_KEY); window.openNodeLogin(); };
  wireCloudCard(box, data.node);
  box.querySelectorAll('[data-treset]').forEach(b => b.onclick = async () => {
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '¿Seguro? Toca otra vez'; b.style.background = '#f59e0b'; return; }
    try {
      await teacherApi('/api/teacher/reset-teacher-pin', { teacher_id: b.dataset.treset });
      window.showToast?.(`<i class="fas fa-key"></i> ${esc(b.dataset.name)} va a crear un PIN nuevo la próxima vez que entre.`, 'success');
    } catch (e) { window.showToast?.(esc(e.message), 'error'); }
    renderTeacherPanel(box);
  });
  box.querySelectorAll('[data-unlock]').forEach(b => b.onclick = async () => {
    await teacherApi('/api/teacher/unlock', { student_id: b.dataset.unlock }).catch(() => {});
    renderTeacherPanel(box);
  });
  box.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => {
    // Confirmación en el mismo botón (dos toques), sin ventanas emergentes.
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '¿Seguro? Toca otra vez'; b.style.background = '#f59e0b'; return; }
    try {
      await teacherApi('/api/teacher/reset-pin', { student_id: b.dataset.reset });
      window.showToast?.(`<i class="fas fa-key"></i> ${esc(b.dataset.name)} va a crear un PIN nuevo la próxima vez que entre.`, 'success');
    } catch (e) { window.showToast?.(esc(e.message), 'error'); }
    renderTeacherPanel(box);
  });
}

window.nodeLogout = async function nodeLogout() {
  try { await window.nodeApi('/api/logout', { method: 'POST' }); } catch { /* sin sesión */ }
  localStorage.removeItem(NODE_TOKEN_KEY);
};
