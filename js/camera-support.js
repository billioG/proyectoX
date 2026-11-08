/**
 * CÁMARA PARA PASAR LISTA: ¿se puede usar aquí?, lista rápida sin cámara y asistente del certificado del servidor de la escuela.
 *
 * El nodo escolar (http://quetzal.local) no es HTTPS: el navegador NO deja abrir la cámara ahí. En vez de un error, la pantalla de asistencia
 * entra sola en «Asistencia rápida» (lista de estudiantes, un toque por persona) y guarda con la MISMA cola offline del QR (`mark_attendance`).
 * Si algún día el nodo sirve HTTPS y la cámara funciona, vuelve sola al flujo QR.
 *
 * Lógica pura (se prueba con Node, entorno inyectable) arriba; la pantalla del asistente (DOM) abajo, bajo `typeof window`.
 */

export const CAMERA_READY_KEY = 'node_camera_ready';
/** Dónde publica el nodo el certificado público de la CA de la escuela (data/ca/quetzal-ca.crt en la Raspberry). Ver school-node/README.md. */
export const NODE_CA_URL = '/node-ca.crt';

export const QUICK_MODE_NOTICE = 'En este servidor no se puede usar la cámara. Usa la lista rápida. Cuando el nodo tenga HTTPS podrás escanear QR.';

/** Revisión inmediata, sin pedir permiso: contexto seguro (HTTPS o localhost) y que el navegador tenga getUserMedia. */
export function cameraSupport(env = globalThis) {
  if (env.isSecureContext === false) return { ok: false, reason: 'insecure' };
  if (typeof env.navigator?.mediaDevices?.getUserMedia !== 'function') return { ok: false, reason: env.isSecureContext ? 'no-api' : 'insecure' };
  return { ok: true, reason: 'ok' };
}

/** Clasifica el error de getUserMedia. 'insecure' y 'missing' → lista rápida; 'permission' y 'busy' → se queda la cámara y se explica la causa. */
export function cameraErrorKind(err) {
  const t = `${err?.name || ''} ${err?.message || err || ''}`.toLowerCase();
  if (/notallowederror|permissiondenied/.test(t)) return 'permission';
  if (/notfounderror|devicesnotfound|overconstrained/.test(t)) return 'missing';
  if (/notreadableerror|trackstarterror/.test(t)) return 'busy';
  if (/securityerror|secure context|getusermedia|undefined|not a function/.test(t)) return 'insecure';
  return 'unknown';
}

/** ¿El fallo significa que en este dispositivo/servidor la cámara no va a funcionar (y conviene la lista rápida)? */
export const cameraIsUnavailable = (kind) => kind === 'insecure' || kind === 'missing';

/** Intento controlado: abre la cámara un instante y la suelta. Nunca lanza. */
export async function probeCamera(env = globalThis) {
  const pre = cameraSupport(env);
  if (!pre.ok) return { ok: false, kind: pre.reason === 'no-api' ? 'insecure' : pre.reason };
  try {
    const stream = await env.navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true, kind: 'ok' };
  } catch (err) {
    return { ok: false, kind: cameraErrorKind(err), error: err };
  }
}

/** Modo de la pantalla de asistencia: 'qr' (cámara) o 'quick' (lista rápida). */
export const attendanceMode = (env = globalThis) => (cameraSupport(env).ok ? 'qr' : 'quick');

/** ¿La app está abierta desde el servidor de la escuela (nodo) y no desde la nube? */
export function isSchoolNode(env = globalThis) {
  const host = String(env.location?.hostname || '');
  if (env.QUETZAL_NODE) return true;
  return /\.local$/i.test(host) || /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(host);
}

export function platformOf(ua = '') {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  return 'other';
}

export const CA_GUIDE = {
  android: {
    title: 'Android',
    steps: [
      'Toca «Descargar certificado» y guarda el archivo.',
      'Abre Ajustes → Seguridad (o «Seguridad y privacidad») → Cifrado y credenciales.',
      'Toca «Instalar un certificado» → «Certificado de CA» y elige el archivo descargado.',
      'Acepta el aviso y vuelve a Quetzal.',
    ],
  },
  ios: {
    title: 'iPhone / iPad',
    steps: [
      'Toca «Descargar certificado» en Safari y permite la descarga del perfil.',
      'Abre Ajustes → «Perfil descargado» e instálalo.',
      'Luego entra a Ajustes → General → Información → Ajustes de confianza de certificados y activa la confianza del certificado de la escuela.',
      'Vuelve a Quetzal.',
    ],
  },
  windows: {
    title: 'Windows (Chrome / Edge)',
    steps: [
      'Descarga el certificado y haz doble clic en el archivo.',
      'Toca «Instalar certificado» y elige «Usuario actual».',
      'Elige «Colocar todos los certificados en el siguiente almacén» → «Entidades de certificación raíz de confianza».',
      'Cierra y vuelve a abrir el navegador.',
    ],
  },
};

/** Al entrar por el nodo sin cámara, ¿hay que ofrecer el asistente? No si ya funcionó en este dispositivo ni si la cámara sí está disponible. */
export function shouldOfferSetup(env = globalThis) {
  if (!isSchoolNode(env) || cameraSupport(env).ok) return false;
  try { return env.localStorage?.getItem(CAMERA_READY_KEY) !== '1'; } catch { return true; }
}

export function markCameraReady(env = globalThis) {
  try { env.localStorage?.setItem(CAMERA_READY_KEY, '1'); } catch { /* sin almacenamiento: solo se vuelve a ofrecer */ }
}

/** ¿El nodo publica el certificado? (HEAD a /node-ca.crt). Si no existe, el asistente lo dice sin dramatizar. */
export async function nodeCaAvailable(fetchFn = globalThis.fetch) {
  try {
    const res = await fetchFn(NODE_CA_URL, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch { return false; }
}

/** ¿Responde este mismo servidor por HTTPS? (el nodo todavía no lo hace salvo que se haya configurado). Con certificado sin confiar, falla: eso es lo esperado. */
export async function nodeHttpsReachable(env = globalThis, fetchFn = globalThis.fetch) {
  if (!env.location?.host) return false;
  try {
    await fetchFn(`https://${env.location.host}/api/node/status`, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(3500) });
    return true;
  } catch { return false; }
}

/** Fila que se encola igual que la del QR (`mark_attendance`). `opt` es el <option> del equipo elegido. */
export function buildAttendanceRow({ studentId, teacherId, school, grade, section, status = 'present', date = new Date().toISOString().split('T')[0] }) {
  return { student_id: studentId, teacher_id: teacherId, school_code: school, grade: grade || '', section: section || '', date, status };
}

/** Une lo que dijo la nube con lo marcado en este dispositivo (que aún puede estar en la cola sin subir). → Set de presentes. */
export function mergePresent(serverPresentIds, localMarks = new Map()) {
  const out = new Set(serverPresentIds || []);
  for (const [id, status] of localMarks) { if (status === 'present') out.add(id); else out.delete(id); }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pantalla del asistente (solo en el navegador)
// ---------------------------------------------------------------------------------------------------------------------------------
if (typeof window !== 'undefined') {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  window.cameraSupport = () => cameraSupport(window);
  window.attendanceMode = () => attendanceMode(window);
  window.probeCamera = () => probeCamera(window);
  window.markCameraReady = () => markCameraReady(window);
  window.cameraIsUnavailable = cameraIsUnavailable;
  window.cameraErrorKind = cameraErrorKind;
  window.QUICK_MODE_NOTICE = QUICK_MODE_NOTICE;

  /** Aviso fijo de la lista rápida + botón del asistente (si corresponde). */
  window.quickModeNoticeHtml = function quickModeNoticeHtml() {
    const setup = shouldOfferSetup(window)
      ? `<button type="button" onclick="window.openCameraSetup()" class="btn-secondary-tw h-10 mt-3 text-[0.6rem] font-black uppercase tracking-widest"><i class="fas fa-shield-halved"></i> Configurar este dispositivo para usar la cámara</button>`
      : '';
    return `<div class="w-full p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left">
      <p class="text-[0.7rem] font-bold text-amber-700 dark:text-amber-300 leading-snug"><i class="fas fa-circle-info mr-1"></i>${esc(QUICK_MODE_NOTICE)}</p>${setup}</div>`;
  };

  /** Asistente de primera vez: explica, ofrece el certificado y deja probar la cámara. No bloquea nada: se cierra y sigue la lista rápida. */
  window.openCameraSetup = async function openCameraSetup() {
    document.getElementById('camera-setup-modal')?.remove();
    const mine = platformOf(navigator.userAgent);
    const hasCa = await nodeCaAvailable();
    const modal = document.createElement('div');
    modal.id = 'camera-setup-modal';
    modal.className = 'fixed inset-0 z-[260] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const guide = (key) => `<details class="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3" ${key === mine || (mine === 'other' && key === 'android') ? 'open' : ''}>
        <summary class="text-sm font-black text-slate-700 dark:text-slate-200 cursor-pointer">${esc(CA_GUIDE[key].title)}</summary>
        <ol class="mt-2 pl-5 list-decimal space-y-1 text-xs text-slate-600 dark:text-slate-300">${CA_GUIDE[key].steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>`;
    modal.innerHTML = `<div class="glass-card w-full max-w-md max-h-[88vh] overflow-y-auto p-6 shadow-2xl bg-white dark:bg-slate-900">
      <div class="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <h3 class="text-lg font-black text-slate-800 dark:text-white tracking-tight"><i class="fas fa-shield-halved text-primary mr-2"></i>Pasar lista con cámara</h3>
        <button type="button" data-cs-close class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 flex items-center justify-center" aria-label="Cerrar"><i class="fas fa-times"></i></button>
      </div>
      <p class="text-sm text-slate-600 dark:text-slate-300 mb-4">Para escanear QR sin internet, este dispositivo debe confiar en el certificado del servidor de la escuela. Mientras tanto puedes seguir con la lista rápida.</p>
      ${hasCa
        ? `<a href="${NODE_CA_URL}" download class="btn-primary-tw bg-emerald-500 hover:bg-emerald-600 h-11 w-full flex items-center justify-center text-xs font-black uppercase tracking-widest mb-4"><i class="fas fa-download mr-2"></i>Descargar certificado</a>`
        : `<p class="p-3 rounded-xl bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300 mb-4"><i class="fas fa-circle-info mr-1"></i>Este servidor todavía no tiene certificado para descargar. Pide a quien administra el nodo que active el HTTPS (en el nodo: bash ~/quetzal/school-node/https-setup.sh). Sigue con la lista rápida.</p>`}
      <div class="space-y-2 mb-4">${['android', 'ios', 'windows'].map(guide).join('')}</div>
      <button type="button" data-cs-test class="btn-secondary-tw h-11 w-full text-xs font-black uppercase tracking-widest"><i class="fas fa-camera mr-2"></i>Ya lo instalé, probar cámara</button>
      <p data-cs-msg class="mt-3 min-h-[1.2rem] text-xs font-bold text-slate-500 dark:text-slate-400"></p>
    </div>`;
    const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const msg = (t, ok) => { const p = modal.querySelector('[data-cs-msg]'); p.textContent = t; p.className = `mt-3 min-h-[1.2rem] text-xs font-bold ${ok ? 'text-emerald-600' : 'text-slate-500 dark:text-slate-400'}`; };
    modal.addEventListener('click', async (e) => {
      if (e.target === modal || e.target.closest('[data-cs-close]')) return close();
      if (!e.target.closest('[data-cs-test]')) return;
      msg('Probando...', false);
      try {
      if (!window.isSecureContext) {
        // En «http» la prueba no puede funcionar: hay que entrar por HTTPS. Si el nodo no lo sirve todavía, se dice con honestidad.
        if (await nodeHttpsReachable(window)) { location.href = `https://${location.host}${location.pathname}`; return; }
        return msg('Todavía no se puede probar: este servidor no ofrece HTTPS (o el certificado aún no es de confianza en este dispositivo). Repite la guía o sigue con la lista rápida.', false);
      }
      const r = await probeCamera(window);
      if (r.ok) {
        markCameraReady(window);
        msg('¡Listo! La cámara funciona en este dispositivo.', true);
        window.setAttendanceMode?.('qr');
        return;
      }
      const f = window.friendlyError ? window.friendlyError(r.error || 'getUserMedia', 'camera') : { message: 'No se pudo abrir la cámara.' };
      msg(`${f.message} Repite la guía o sigue con la lista rápida.`, false);
      } catch (err) {
        console.warn('Prueba de cámara:', err);
        msg(`No se pudo hacer la prueba (${String(err?.message || err).slice(0, 80)}). Sigue con la lista rápida.`, false);
      }
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(modal);
  };
}
