/**
 * BITÁCORA DE SEGURIDAD -- pantalla del administrador (ver migrations/security-audit-log.sql y docs/SEGURIDAD_2026-11.md §12).
 * Muestra quién hizo qué en las acciones sensibles (eliminar alumnos o colegios, crear docentes, cambiar roles o contraseñas de clase,
 * enlaces del portal de padres, servidores escolares, ver contraseñas de alumnos). Solo lectura: el registro no se puede modificar ni borrar.
 * Los datos vienen de la función get_security_audit_log (solo la ejecuta un administrador); aquí todo texto se escapa antes de dibujarlo.
 */
const PAGE_SIZE = 50;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Acción -> [texto, ícono, color]. Lo que no esté aquí se muestra con su nombre técnico. */
export const ACTIONS = {
  teacher_created: ['Docente creado', 'fa-user-plus', 'emerald'],
  teacher_deleted: ['Docente eliminado', 'fa-user-minus', 'rose'],
  teacher_role_changed: ['Cambio de rol de un docente', 'fa-user-shield', 'amber'],
  students_deleted: ['Alumnos eliminados', 'fa-user-slash', 'rose'],
  students_imported: ['Alumnos importados', 'fa-file-import', 'emerald'],
  school_deleted: ['Establecimiento eliminado', 'fa-school-circle-xmark', 'rose'],
  school_node_registered: ['Servidor escolar registrado', 'fa-server', 'emerald'],
  school_node_revoked: ['Servidor escolar revocado', 'fa-ban', 'amber'],
  school_node_deleted: ['Servidor escolar eliminado', 'fa-trash', 'rose'],
  guardian_portal_link_regenerated: ['Enlace del portal de padres regenerado', 'fa-link', 'amber'],
  class_password_changed: ['Contraseña de clase cambiada', 'fa-key', 'amber'],
  user_password_reset: ['Contraseña de una cuenta reiniciada', 'fa-lock-open', 'amber'],
  student_passwords_revealed: ['Contraseñas de alumnos consultadas', 'fa-eye', 'sky'],
  student_passwords_backfill: ['Contraseñas de alumnos cifradas', 'fa-shield-halved', 'sky'],
};

/** Color -> clases de Tailwind COMPLETAS (el compilador no ve clases armadas con variables, como bg-${color}-500). */
const TONE = {
  emerald: 'bg-emerald-500/10 text-emerald-500',
  rose: 'bg-rose-500/10 text-rose-500',
  amber: 'bg-amber-500/10 text-amber-500',
  sky: 'bg-sky-500/10 text-sky-500',
  slate: 'bg-slate-500/10 text-slate-500',
};

export function actionLabel(action) {
  return ACTIONS[action]?.[0] || String(action || 'Acción');
}

const plural = (n, uno, varios) => `${n} ${Number(n) === 1 ? uno : varios}`;

/** Una línea en español con lo importante de `details` (nunca trae contraseñas ni nombres de menores: la base los quita). */
export function detailsText(action, d) {
  const x = d && typeof d === 'object' ? d : {};
  const schools = Array.isArray(x.schools) ? x.schools.filter(Boolean) : [];
  switch (action) {
    case 'students_deleted': {
      const n = Number(x.count);
      return [Number.isFinite(n) ? plural(n, 'alumno', 'alumnos') : '', schools.length ? `de ${schools.join(', ')}` : '', x.errors ? `${plural(Number(x.errors), 'error', 'errores')}` : ''].filter(Boolean).join(' · ');
    }
    case 'students_imported':
      return [plural(Number(x.created) || 0, 'creado', 'creados'), Number(x.errors) ? plural(Number(x.errors), 'con error', 'con error') : '', Number(x.classes_with_new_password) ? `${plural(Number(x.classes_with_new_password), 'clase con contraseña nueva', 'clases con contraseña nueva')}` : ''].filter(Boolean).join(' · ');
    case 'teacher_role_changed':
      return x.from || x.to ? `de «${x.from ?? '?'}» a «${x.to ?? '?'}»` : '';
    case 'teacher_created':
    case 'teacher_deleted':
      return x.role ? `rol: ${x.role}` : '';
    case 'class_password_changed': {
      const where = x.whole_school ? plural(Number(x.classes) || 0, 'clase', 'clases') : [x.grade, x.section].filter(Boolean).join(' ');
      return [where, x.protegida === false ? 'sin contraseña' : x.protegida === true ? 'con contraseña' : ''].filter(Boolean).join(' · ');
    }
    case 'school_deleted':
    case 'school_node_registered':
    case 'school_node_revoked':
    case 'school_node_deleted':
      return x.name ? String(x.name) : '';
    case 'student_passwords_revealed':
      return `${Number(x.requested) || 0} pedidas · ${Number(x.delivered) || 0} entregadas`;
    case 'student_passwords_backfill':
      return `${Number(x.encrypted) || 0} cifradas · ${Number(x.pending) || 0} pendientes`;
    default:
      return '';
  }
}

/** Fecha y hora de Guatemala. */
export function whenGt(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return t.toLocaleString('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ROLE_LABEL = { admin: 'Administrador', docente: 'Docente', coordinador: 'Coordinador', estudiante: 'Estudiante' };

export function rowHtml(r) {
  const [label, icon, color] = ACTIONS[r.action] || [actionLabel(r.action), 'fa-clipboard-list', 'slate'];
  const who = r.actor_name || (r.actor_id ? 'Cuenta sin nombre' : 'Sin sesión (proceso del servidor)');
  const role = ROLE_LABEL[r.actor_role] || r.actor_role || '';
  const detail = detailsText(r.action, r.details);
  const target = [r.school_code, r.target_type && r.target_id && r.target_type !== 'school' ? `${r.target_type}: ${String(r.target_id).slice(0, 36)}` : ''].filter(Boolean).join(' · ');
  return `
    <div class="glass-card p-4 flex items-start gap-3" data-audit-id="${esc(r.id)}">
      <div class="w-9 h-9 rounded-xl ${TONE[color] || TONE.slate} flex items-center justify-center shrink-0"><i class="fas ${esc(icon)}"></i></div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center justify-between gap-x-3">
          <p class="text-sm font-black text-slate-800 dark:text-white">${esc(label)}</p>
          <span class="text-[0.65rem] font-bold text-slate-400">${esc(whenGt(r.created_at))}</span>
        </div>
        <p class="text-xs text-slate-600 dark:text-slate-300 mt-0.5"><i class="fas fa-user text-slate-400 mr-1"></i>${esc(who)}${role ? ` <span class="text-slate-400">· ${esc(role)}</span>` : ''}</p>
        ${detail ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${esc(detail)}</p>` : ''}
        ${target ? `<p class="text-[0.65rem] text-slate-400 mt-1 break-all">${esc(target)}</p>` : ''}
      </div>
    </div>`;
}

function filterOptions(selected) {
  return `<option value="">Todas las acciones</option>${Object.entries(ACTIONS).map(([k, v]) => `<option value="${esc(k)}"${k === selected ? ' selected' : ''}>${esc(v[0])}</option>`).join('')}`;
}

function shell(container, action) {
  container.innerHTML = `
    <div class="glass-card p-4 mb-5 text-xs text-slate-500 dark:text-slate-400">
      <i class="fas fa-shield-halved text-primary mr-2"></i>
      Registro permanente de las acciones sensibles. <b>No se puede modificar ni borrar.</b> Nunca guarda contraseñas ni nombres de alumnos.
      Lo que se hace directamente en el panel de Supabase no aparece aquí.
    </div>
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <select id="audit-action" class="input-field-tw h-10 text-xs font-bold max-w-xs">${filterOptions(action)}</select>
      <button type="button" id="audit-refresh" class="btn-secondary-tw h-10 px-4 text-xs uppercase font-bold"><i class="fas fa-rotate mr-1"></i> Actualizar</button>
    </div>
    <div id="audit-list" class="space-y-3"></div>
    <div id="audit-more" class="text-center mt-5"></div>`;
  container.querySelector('#audit-action').onchange = (e) => window.loadAuditLog(e.target.value || null);
  container.querySelector('#audit-refresh').onclick = () => window.loadAuditLog(container.querySelector('#audit-action').value || null);
}

async function fetchPage(action, before) {
  return window._supabase.rpc('get_security_audit_log', { p_limit: PAGE_SIZE, p_action: action || null, p_before: before || null });
}

function errorHtml(error) {
  const old = /get_security_audit_log|schema cache|does not exist|42883|PGRST20/i.test(`${error.message} ${error.code}`);
  const denied = /Solo un administrador/i.test(error.message || '');
  const msg = denied ? 'Solo un administrador puede ver la bitácora.'
    : old ? 'La bitácora todavía no está activa en la base de datos. Pídele a quien administra el proyecto que corra la migración security-audit-log.sql.'
      : 'No se pudo cargar la bitácora. Intenta de nuevo en un momento.';
  return `<div class="glass-card p-6 text-sm text-slate-500"><i class="fas fa-circle-info mr-2"></i>${esc(msg)}</div>`;
}

export async function loadAuditLog(action = null) {
  const container = document.getElementById('audit-log-container');
  if (!container) return;
  shell(container, action);
  const list = container.querySelector('#audit-list');
  const more = container.querySelector('#audit-more');
  list.innerHTML = '<div class="text-center text-slate-400 text-xs py-10"><i class="fas fa-spinner fa-spin"></i></div>';
  const seen = new Set();

  const load = async (before) => {
    const { data, error } = await fetchPage(action, before);
    if (error) { list.innerHTML = errorHtml(error); more.innerHTML = ''; return; }
    const rows = (Array.isArray(data) ? data : []).filter((r) => !seen.has(String(r.id)));
    rows.forEach((r) => seen.add(String(r.id)));
    if (!before) list.innerHTML = '';
    if (!rows.length && !before) { list.innerHTML = '<p class="text-sm text-slate-400">Todavía no hay acciones registradas con ese filtro.</p>'; more.innerHTML = ''; return; }
    list.insertAdjacentHTML('beforeend', rows.map(rowHtml).join(''));
    // Si la página vino llena, puede haber más: «Ver más» pide las anteriores a la última fecha mostrada.
    const last = Array.isArray(data) && data.length ? data[data.length - 1] : null;
    if (last && data.length >= PAGE_SIZE) {
      more.innerHTML = '<button type="button" id="audit-more-btn" class="btn-secondary-tw h-10 px-5 text-xs uppercase font-bold">Ver más antiguas</button>';
      more.querySelector('#audit-more-btn').onclick = () => { more.innerHTML = '<i class="fas fa-spinner fa-spin text-slate-400"></i>'; load(last.created_at); };
    } else {
      more.innerHTML = rows.length || before ? '<p class="text-[0.65rem] text-slate-400">Fin del registro.</p>' : '';
    }
  };
  await load(null);
}

if (typeof window !== 'undefined') window.loadAuditLog = loadAuditLog;
