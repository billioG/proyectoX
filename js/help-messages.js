/**
 * AYUDA Y MENSAJES CLAROS DENTRO DE LA APP (docs/soporte/).
 *
 * Una sola fuente para tres cosas, para que el texto no se repita ni se contradiga entre pantallas:
 *   1. friendlyError(error, contexto)  -- convierte un error técnico (Supabase, red, cámara) en una frase en español con lo que la persona puede HACER.
 *   2. validateProjectForm(datos)      -- dice exactamente QUÉ falta al subir un proyecto (antes: «Completa todos los campos»).
 *   3. HELP_TOPICS + window.openHelp(tema) -- ayuda de 3 a 6 pasos dentro de la pantalla (ingreso, asistencia, proyecto, indicador de sincronización).
 *
 * Los mismos textos están en docs/soporte/ (guía para quien atiende dudas); una prueba (tests-unit/help-messages.test.mjs) revisa que lo
 * que la guía promete exista aquí. Lógica pura: se prueba con Node. Sin dependencias.
 */

// Límites del formulario de proyectos (los mismos que usa js/project-modals.js y el nodo: school-node/project-rules.js).
export const PROJECT_LIMITS = { titleMin: 5, descMin: 40, maxBytes: 150 * 1024 * 1024, modelExts: ['stl', 'obj', 'glb'] };

// Errores técnicos (Postgres/Supabase/red) -> mensaje claro + qué hacer. Un
// docente que ve "violates row-level security policy" piensa que rompió algo y
// no vuelve a tocar nada. Los mensajes que ya están en español normal no
// coinciden con ningún patrón y se muestran tal cual. (showToast de js/utils.js la aplica a TODOS los avisos de error.)
const FRIENDLY_ERRORS = [
    [/failed to fetch|networkerror|network request failed|load failed|fetch failed|timed out|timeout/i,
        'Parece que no hay conexión. Revisa tu internet y vuelve a intentarlo.'],
    [/jwt expired|invalid jwt|invalid token|refresh token|not authenticated|no autenticado|status 401/i,
        'Tu sesión venció. Cierra sesión, vuelve a entrar e inténtalo otra vez.'],
    [/row-level security|permission denied|permiso denegado|not authorized|forbidden|status 403|\b42501\b/i,
        'No tienes permiso para hacer esto. Si crees que sí deberías, avisa al administrador.'],
    [/could not find the function|\bPGRST20[24]\b|schema cache|does not exist|no existe la (columna|funci|relaci)/i,
        'Esta función todavía no está lista en el sistema. Avisa al administrador.'],
    [/duplicate key|unique constraint|\b23505\b|already exists/i,
        'Eso ya existe (está repetido). Revisa que no lo hayas creado antes.'],
    [/foreign key|\b23503\b/i,
        'No se puede hacer porque hay otros datos que dependen de esto.'],
    [/payload too large|entity too large|exceeded the maximum allowed size|file size|status 413/i,
        'El archivo es demasiado pesado. Prueba con uno más pequeño.'],
    [/mime type|invalid mime|unsupported media/i,
        'Ese tipo de archivo no está permitido.'],
    [/too many requests|rate limit|status 429/i,
        'Hiciste muchas acciones seguidas. Espera un momento y vuelve a intentar.'],
    [/invalid input syntax|violates check constraint|null value in column|\b2(2P02|3502|3514)\b/i,
        'Falta algún dato o tiene un formato incorrecto. Revisa el formulario.'],
    [/internal server error|bad gateway|service unavailable|non-2xx|infinite recursion|status 5[0-9][0-9]/i,
        'Hubo un problema en el servidor. Espera un minuto y vuelve a intentar.'],
];

export function friendlyErrorText(raw) {
    const text = String(raw ?? '');
    const hit = FRIENDLY_ERRORS.find(([re]) => re.test(text));
    return hit ? hit[1] : null;
}

const text = (err) => {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  const parts = [err.name, err.code, err.status != null ? `status ${err.status}` : '', err.statusCode != null ? `status ${err.statusCode}` : '', err.error_code, err.message, err.error_description, err.details, err.hint];
  return parts.filter((p) => p !== undefined && p !== null && p !== '').join(' ');
};

const SPANISH_HINT = /[áéíóúñ¿¡]|^(Ingresa|Usuario|Demasiados|Completa|Selecciona|Indica|Escribe|Elige|Falta|El |La |Los |Las |Esta |Este |No |Solo |Sin )/i;

/**
 * Mensaje en español para una persona (no técnica). `ctx`: 'login' | 'password' | 'attendance' | 'camera' | 'upload' | 'sync' | 'generic'.
 * Devuelve { message, kind, technical }: `message` se muestra; `technical` es el texto original recortado, para que quien dé soporte lo pida.
 */
export function friendlyError(err, ctx = 'generic', { online = true } = {}) {
  const raw = text(err);
  const t = raw.toLowerCase();
  const technical = raw.replace(/\s+/g, ' ').trim().slice(0, 140);
  const out = (kind, message) => ({ kind, message, technical });

  // --- cámara (el navegador la nombra con estos errores) ---
  if (ctx === 'camera' || /notallowederror|permissiondeniederror|notfounderror|devicesnotfound|notreadableerror|trackstarterror|overconstrained|securityerror|getusermedia|secure context/.test(t)) {
    if (/notallowederror|permissiondenied/.test(t)) return out('camera-permission', 'No se pudo usar la cámara porque falta el permiso. Toca el candado junto a la dirección de la página, permite la cámara y recarga.');
    if (/notfounderror|devicesnotfound|overconstrained/.test(t)) return out('camera-missing', 'Este dispositivo no tiene una cámara que se pueda usar. Prueba con otro celular o tablet.');
    if (/notreadableerror|trackstarterror/.test(t)) return out('camera-busy', 'La cámara está en uso por otra aplicación. Ciérrala (o reinicia el navegador) y vuelve a intentar.');
    if (/securityerror|secure context|getusermedia/.test(t)) {
      return out('camera-insecure', 'El navegador no deja usar la cámara en esta dirección (el servidor de la escuela usa «http», sin candado). Usa la lista rápida de Asistencia, o entra a Quetzal en línea con internet para escanear QR; para usar la cámara en el servidor de la escuela hace falta HTTPS (pide al administrador).');
    }
    if (ctx === 'camera') return out('camera-unknown', 'No se pudo abrir la cámara. Cierra otras aplicaciones que la usen y vuelve a intentar; si sigue igual, avisa a soporte.');
  }

  // --- sin conexión: en asistencia y proyectos NO se pierde lo hecho, y se dice ---
  const isOffline = !online || /failed to fetch|networkerror|network request failed|load failed|err_internet|err_network|fetch failed|timed out|econn|enotfound/.test(t) || (err instanceof TypeError && /fetch/.test(t));
  if (isOffline) {
    if (ctx === 'attendance' || ctx === 'upload') return out('offline', 'No hay conexión con el servidor. Lo que hiciste quedó guardado en este dispositivo y se subirá solo cuando vuelva el internet (mira el indicador de abajo: SIN CONEXIÓN → PENDIENTE → CONECTADO).');
    return out('offline', 'No hay conexión con el servidor. Revisa tu internet o el Wi-Fi de la escuela y vuelve a intentar.');
  }

  // --- ingreso: lo que realmente puede hacer quien no puede entrar ---
  if (ctx === 'login' || ctx === 'password' || ctx === 'reset') {
    if (/email not confirmed|email_not_confirmed/.test(t)) return out('email-unconfirmed', 'Tu correo todavía no está confirmado. Revisa tu bandeja (y la de correo no deseado) y toca el enlace que te enviamos.');
    if (/rate limit|too many|demasiados intentos|status 429|over_request_rate_limit|over_email_send_rate_limit/.test(t)) return out('rate-limit', 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentar.');
    if (/invalid login|invalid_credentials|invalid credentials|usuario o contraseña|login fallido/.test(t)) {
      return out('bad-credentials', 'Usuario o contraseña incorrectos. Docentes: escribe tu correo completo y tu contraseña. Estudiantes: tu usuario (sin @) y la contraseña de tu clase, que te da tu docente. Si olvidaste la tuya, toca «¿Olvidaste tu contraseña?».');
    }
  }

  // --- datos, según la pantalla ---
  if (ctx === 'attendance' && /duplicate key|23505|already exists/.test(t)) return out('duplicate', 'Esa asistencia ya estaba registrada hoy. No hace falta repetirla.');
  if (ctx === 'upload' && /payload too large|entity too large|status 413|exceeded the maximum allowed size|file size/.test(t)) {
    return out('too-large', `El archivo es demasiado pesado (máximo ${PROJECT_LIMITS.maxBytes / 1048576} MB). Graba un video más corto o comprímelo e inténtalo otra vez.`);
  }

  // --- el resto de errores técnicos: la tabla general ---
  const general = friendlyErrorText(raw);
  if (general) return out('technical', general);

  // --- un mensaje que ya viene en español y pensado para personas se respeta ---
  if (raw && raw.length <= 160 && SPANISH_HINT.test(raw) && !/[{}]|Error:|TypeError|undefined|null\b/.test(raw)) return out('as-is', raw);

  const generic = {
    upload: 'No se pudo guardar el proyecto. Revisa el título, la descripción y el archivo, y vuelve a intentar.',
    attendance: 'No se pudo registrar la asistencia. Vuelve a intentar; si sigue igual, avisa a soporte.',
    login: 'No se pudo iniciar sesión. Revisa tus datos y vuelve a intentar.',
    password: 'No se pudo cambiar la contraseña. Vuelve a intentar.',
    reset: 'No se pudo enviar el correo. Revisa que esté bien escrito y vuelve a intentar.',
    sync: 'No se pudo sincronizar todavía. Se reintentará solo; no pierdes lo que hiciste.',
  }[ctx] || 'Algo no salió bien. Vuelve a intentar; si sigue igual, avisa a soporte.';
  return out('unknown', generic);
}

/** Texto para pegar en un aviso a soporte: qué pasó y dónde, sin datos personales. */
export function supportNote(err, ctx = 'generic') {
  const f = friendlyError(err, ctx);
  return f.technical ? `Detalle para soporte: ${f.technical}` : '';
}

/**
 * Valida el formulario de «Subir proyecto» y devuelve el PRIMER problema, diciendo qué hacer (o null si está bien).
 * @param {{title?: string, description?: string, file?: {name?: string, size?: number, type?: string} | null}} form
 */
export function validateProjectForm({ title, description, file } = {}) {
  const t = String(title ?? '').trim();
  const d = String(description ?? '').trim();
  if (!t) return `Escribe el título de tu proyecto (mínimo ${PROJECT_LIMITS.titleMin} letras).`;
  if (t.length < PROJECT_LIMITS.titleMin) return `El título es muy corto: tiene ${t.length} y necesita al menos ${PROJECT_LIMITS.titleMin} caracteres.`;
  if (!d) return `Cuéntanos de qué trata tu proyecto: escribe la descripción (mínimo ${PROJECT_LIMITS.descMin} caracteres).`;
  if (d.length < PROJECT_LIMITS.descMin) return `Explica un poco más tu proyecto: la descripción tiene ${d.length} caracteres y necesita al menos ${PROJECT_LIMITS.descMin} (te faltan ${PROJECT_LIMITS.descMin - d.length}).`;
  if (!file) return 'Falta el archivo: elige un video de tu proyecto o un modelo 3D (STL, OBJ o GLB).';
  const ext = String(file.name ?? '').split('.').pop().toLowerCase();
  const isVideo = /^video\//.test(file.type || '') || ['mp4', 'mov', 'm4v', 'webm', '3gp', 'avi', 'mkv'].includes(ext);
  if (!isVideo && !PROJECT_LIMITS.modelExts.includes(ext)) return 'Ese archivo no es un video ni un modelo 3D. Elige un video (MP4, MOV…) o un modelo STL, OBJ o GLB.';
  if (Number(file.size) > PROJECT_LIMITS.maxBytes) return `El archivo pesa ${(file.size / 1048576).toFixed(0)} MB y el máximo es ${PROJECT_LIMITS.maxBytes / 1048576} MB. Graba un video más corto o comprímelo.`;
  return null;
}

/** Ayuda dentro de la pantalla. Cada tema: pasos numerados, consejos y los 2 o 3 problemas más comunes con su solución. */
export const HELP_TOPICS = {
  ingreso: {
    title: 'Ayuda para entrar',
    icon: 'fa-right-to-bracket',
    steps: [
      'Docentes y administradores: escribe tu correo completo y tu contraseña.',
      'Estudiantes: escribe tu usuario (sin @) y la contraseña de tu clase, que te da tu docente.',
      'Si olvidaste tu contraseña de docente, toca «¿Olvidaste tu contraseña?»: te llega un enlace al correo.',
    ],
    problems: [
      ['Dice «Usuario o contraseña incorrectos»', 'Revisa que no haya espacios de más y que el teclado no esté en mayúsculas. Un estudiante necesita la contraseña de SU clase: pídesela a tu docente.'],
      ['Dice que la cuenta egresó o fue dada de baja', 'La cuenta se conserva pero ya no tiene acceso. Habla con tu establecimiento si crees que es un error.'],
      ['No hay internet', 'Si tu escuela tiene servidor, abre la dirección del cartel (por ejemplo quetzal.local). Si ya entraste antes en este dispositivo, elige tu cuenta guardada.'],
    ],
  },
  asistencia: {
    title: 'Cómo pasar lista',
    icon: 'fa-qrcode',
    steps: [
      'En el menú toca «Tomar Asistencia».',
      'En «Equipo en Aula» elige tu clase.',
      'Toca «Activar cámara» y acepta el permiso.',
      'Muestra a la cámara el QR de la credencial de cada estudiante: aparece ✓ y suben los «presentes».',
      'Al terminar toca «Detener».',
      'Si la pantalla dice que no se puede usar la cámara, usa la lista rápida: toca a cada estudiante para marcarlo presente (otra vez para quitarlo) o «Marcar todos presentes».',
    ],
    tips: [
      'Imprime las credenciales en «Impresión · Credenciales QR».',
      'Si lees dos veces el mismo QR el mismo día, no se duplica.',
      'Sin internet también funciona: queda guardada y se sube sola.',
      'Si ese día no hubo clase, usa «Suspensiones» (lo aprueba el administrador).',
    ],
    problems: [
      ['La cámara no abre', 'Permite la cámara (candado junto a la dirección) y cierra otras apps que la usen. En el servidor de la escuela (dirección «http») el navegador no deja usarla: la pantalla cambia sola a la lista rápida, que guarda igual y se sube sola cuando hay internet.'],
      ['Quiero usar la cámara en el servidor de la escuela', 'Toca «Configurar este dispositivo para usar la cámara» y sigue los pasos: el dispositivo debe confiar en el certificado de la escuela y el servidor debe tener HTTPS. Si el servidor aún no lo tiene, usa la lista rápida.'],
      ['No aparece mi clase en «Equipo en Aula»', 'Tu administrador debe asignártela. Avísale tu nombre, establecimiento, grado y sección.'],
      ['El QR no se lee', 'Acércalo, con buena luz y sin brillo. Si la credencial está dañada, reimprímela.'],
    ],
  },
  proyecto: {
    title: 'Cómo subir un proyecto',
    icon: 'fa-rocket',
    steps: [
      'En el menú toca «Subir Proyecto».',
      `Escribe el título (mínimo ${PROJECT_LIMITS.titleMin} letras) y la descripción (mínimo ${PROJECT_LIMITS.descMin} caracteres).`,
      'Elige el bimestre y, si es de equipo, el equipo.',
      `Elige un video o un modelo 3D (STL, OBJ o GLB) de hasta ${PROJECT_LIMITS.maxBytes / 1048576} MB.`,
      'Toca «Publicar proyecto ahora». Aparece en Inicio cuando termine de sincronizar.',
    ],
    tips: [
      'El docente lo evalúa en «Evaluar Proyectos».',
      'Sin internet se guarda en el dispositivo y se publica solo cuando vuelva.',
    ],
    problems: [
      ['No me deja publicar', 'El mensaje dice qué falta: título, descripción, archivo o tamaño. Corrígelo y vuelve a tocar el botón.'],
      ['El video pesa demasiado', 'Graba menos tiempo o baja la calidad de la cámara. Un video corto de 1 a 2 minutos suele caber.'],
      ['No lo veo en Inicio', 'Mira el indicador de abajo: PENDIENTE significa que todavía se está subiendo. Espera a CONECTADO.'],
    ],
  },
  sincronizacion: {
    title: 'Qué significa el indicador de abajo',
    icon: 'fa-cloud-arrow-up',
    steps: [
      'CONECTADO: todo lo que hiciste ya está en la nube.',
      'PENDIENTE: hay cosas por subir (asistencia, proyectos…). Se suben solas; no cierres la sesión.',
      'SIN CONEXIÓN: no hay internet. Puedes seguir trabajando; se sube cuando vuelva.',
    ],
    problems: [
      ['Sigue en PENDIENTE mucho tiempo', 'Revisa que haya internet de verdad (abre otra página). Si sigue igual, no borres los datos del navegador y avisa a soporte.'],
    ],
  },
};

const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** HTML de un tema (todo el texto pasa por escape). */
export function renderHelpHtml(topicKey, esc = escHtml) {
  const t = HELP_TOPICS[topicKey];
  if (!t) return '';
  return `
    <div class="flex justify-between items-center mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
      <h3 class="text-lg font-black text-slate-800 dark:text-white tracking-tight"><i class="fas ${esc(t.icon)} text-primary mr-2"></i>${esc(t.title)}</h3>
      <button type="button" data-help-close class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 flex items-center justify-center" aria-label="Cerrar"><i class="fas fa-times"></i></button>
    </div>
    <ol class="space-y-2 mb-5 list-decimal pl-5 text-sm text-slate-600 dark:text-slate-300">${t.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    ${t.tips?.length ? `<div class="mb-5 p-3 rounded-xl bg-emerald-500/10 text-xs text-slate-600 dark:text-slate-300 space-y-1">${t.tips.map((s) => `<p><i class="fas fa-lightbulb text-emerald-500 mr-1"></i>${esc(s)}</p>`).join('')}</div>` : ''}
    <p class="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 mb-2">Si algo falla</p>
    <div class="space-y-3">${t.problems.map(([q, a]) => `<div><p class="text-sm font-bold text-slate-700 dark:text-slate-200">${esc(q)}</p><p class="text-xs text-slate-500 dark:text-slate-400">${esc(a)}</p></div>`).join('')}</div>`;
}

if (typeof window !== 'undefined') {
  window.friendlyError = friendlyError;
  window.supportNote = supportNote;
  window.validateProjectForm = validateProjectForm;
  window.HELP_TOPICS = HELP_TOPICS;
  /** Abre la ayuda de un tema en una ventana (se cierra con la X, tocando fuera o con Escape). */
  window.openHelp = function openHelp(topicKey) {
    if (!HELP_TOPICS[topicKey]) return;
    document.getElementById('help-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'help-modal';
    modal.className = 'fixed inset-0 z-[260] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `<div class="glass-card w-full max-w-md max-h-[88vh] overflow-y-auto p-6 shadow-2xl bg-white dark:bg-slate-900">${renderHelpHtml(topicKey, window.sanitizeInput || escHtml)}</div>`;
    const close = () => { modal.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-help-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(modal);
  };
}
