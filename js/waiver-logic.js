/**
 * LÓGICA PURA DE EXENCIONES DE ASISTENCIA (sin DOM ni Supabase: se prueba con Node, tests-unit/waiver-logic.test.mjs).
 * La usan js/attendance.js (envío del docente) y js/admin-waivers.js / js/admin-dashboard.js (panel del administrador).
 */

/** Fecha local (la del reloj del docente) como YYYY-MM-DD. toISOString() daba la fecha UTC: pasadas las 6 pm en Guatemala ya era «mañana». */
export function localDateISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 'YYYY-MM-DD' (columna date) -> 'DD/MM/YYYY' sin pasar por Date (new Date('2026-11-12') es UTC y en Guatemala mostraba el día anterior). */
export function formatWaiverDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'S/F';
}

/** Clave de «la misma exención»: docente + día + establecimiento + grado + sección (NULL = vacío, igual que el índice de la base). */
export function waiverGroupKey(w) {
  return [w?.teacher_id, w?.date, w?.school_code, w?.grade, w?.section].map((v) => (v == null ? '' : String(v))).join('|');
}

/** Primera exención NO rechazada de `existing` que repite a `payload` (misma clave), o null. Una rechazada se puede reenviar. */
export function findDuplicateWaiver(existing, payload) {
  const key = waiverGroupKey(payload);
  return (existing || []).find((w) => w && w.status !== 'rejected' && waiverGroupKey({ ...w, teacher_id: w.teacher_id ?? payload.teacher_id }) === key) || null;
}

/**
 * ¿La clase `a` (school_code, grade, section) está suspendida HOY? Cuenta una exención de ese día (`today`, YYYY-MM-DD) que no esté rechazada y que sea
 * de todo el establecimiento (grado vacío) o de esa clase exacta. Una exención de otro día NO suspende (la lista de ayer no puede bloquear hoy), y una
 * rechazada tampoco. Si la exención no trae `date` (consulta ya filtrada por día) se da por válida.
 */
export function isGroupSuspendedToday(waivers, a, today = localDateISO()) {
  const empty = (v) => v == null || v === '';
  return (waivers || []).some((w) => {
    if (!w || w.status === 'rejected') return false;
    if (w.date != null && String(w.date).slice(0, 10) !== today) return false;
    if (w.school_code !== a?.school_code) return false;
    if (empty(w.grade)) return true; // todo el establecimiento
    return w.grade === a?.grade && (empty(w.section) ? empty(a?.section) : w.section === a?.section);
  });
}

/** ¿El error de Supabase/Postgres es el índice único de exenciones (23505)? */
export function isDuplicateWaiverError(err) {
  if (!err) return false;
  const t = `${err.code ?? ''} ${err.message ?? ''} ${err.details ?? ''}`;
  return /\b23505\b|duplicate key|attendance_waivers_unique_group_day/i.test(t);
}

/** Mensaje claro para el docente cuando la exención ya existe. `dup` (opcional) es la fila repetida, para decir en qué estado está. */
export function duplicateWaiverMessage(dup) {
  const estado = dup?.status === 'approved' ? ' y ya fue aprobada' : dup?.status === 'pending' ? ' y está pendiente de revisión' : '';
  return `Ya enviaste esta exención para hoy y ese grupo${estado}. No hace falta repetirla.`;
}

const STATUS = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: 'Aprobada', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  rejected: { label: 'Rechazada', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
};
/** { label, cls } en español para pending/approved/rejected (cualquier otro valor o NULL cuenta como Pendiente, como en la base). */
export function waiverStatusInfo(status) {
  return STATUS[String(status || 'pending').toLowerCase()] || STATUS.pending;
}

/** Más reciente primero: por fecha de la exención y, a igual fecha, por fecha de creación. No modifica el arreglo recibido. */
export function sortWaiversDesc(waivers) {
  const ts = (v) => { const n = Date.parse(v); return Number.isFinite(n) ? n : 0; };
  return [...(waivers || [])].sort((a, b) => ts(b.date) - ts(a.date) || ts(b.created_at) - ts(a.created_at));
}

/** «5to Primaria B» o, si no hay grado/sección, que cubre todo el establecimiento. */
export function waiverGroupLabel(w) {
  const label = [w?.grade, w?.section].filter(Boolean).join(' ');
  return label || 'Todos los grupos';
}

/**
 * HTML de la tabla del historial. `esc` es el saneador de texto de usuario (window.sanitizeInput): todo lo que escribió una persona
 * (nombre, establecimiento, grado, sección, motivo) pasa por él. Devuelve el bloque completo (tabla o aviso de «sin exenciones»).
 */
export function renderWaiverHistoryTable(waivers, esc = (s) => String(s ?? '')) {
  const rows = sortWaiversDesc(waivers);
  if (!rows.length) {
    return '<p class="text-center py-10 text-sm font-bold text-slate-400">Todavía no hay solicitudes de exención.</p>';
  }
  const th = 'px-3 py-3 text-left text-[0.65rem] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
  const td = 'px-3 py-3 align-top text-sm text-slate-700 dark:text-slate-200';
  const body = rows.map((w) => {
    const st = waiverStatusInfo(w.status);
    return `<tr class="border-b border-slate-100 dark:border-slate-800">
        <td class="${td} font-bold">${esc(w.teachers?.full_name || 'Docente')}</td>
        <td class="${td} whitespace-nowrap">${esc(formatWaiverDate(w.date))}</td>
        <td class="${td}">${esc(w.schools?.name || w.school_code || 'N/A')}</td>
        <td class="${td}">${esc(waiverGroupLabel(w))}</td>
        <td class="${td} break-words">${esc(w.reason || '')}</td>
        <td class="${td}"><span class="inline-flex px-2.5 py-0.5 rounded-full text-[0.65rem] font-black uppercase tracking-wider ${st.cls}">${st.label}</span></td>
      </tr>`;
  }).join('');
  return `<div class="overflow-x-auto"><table class="w-full text-left border-collapse">
      <thead class="sticky top-0 bg-slate-50 dark:bg-slate-800">
        <tr>
          <th class="${th}">Docente</th><th class="${th}">Fecha</th><th class="${th}">Establecimiento</th>
          <th class="${th}">Grupo</th><th class="${th}">Motivo</th><th class="${th}">Estado</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table></div>`;
}
