/**
 * TABLERO DE IMPACTO (admin) -- los números que piden los aliados
 * (MINEDUC, SENACYT, UNICEF, fundaciones): uso real, aprendizaje,
 * asistencia y participación de las familias, por establecimiento y sin
 * nombres de estudiantes. Datos: get_impact_metrics / get_impact_trend
 * (migrations/impact-metrics.sql). Exporta CSV y copia un resumen listo
 * para pegar en una postulación.
 */

function impactToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const fmt = (n) => Number(n || 0).toLocaleString('es-GT');

window.openImpactDashboard = async function openImpactDashboard() {
  document.getElementById('impact-modal')?.remove();
  const year = impactToday().slice(0, 4);
  const modal = document.createElement('div');
  modal.id = 'impact-modal';
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-5xl max-h-[92vh] overflow-y-auto custom-scrollbar p-0 bg-white dark:bg-slate-900 shadow-2xl animate-slideUp">
      <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-4 justify-between items-end sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur z-10">
        <div>
          <h2 class="text-xl font-black uppercase tracking-tight text-slate-800 dark:text-white"><i class="fas fa-seedling text-emerald-500 mr-2"></i> Impacto</h2>
          <p class="text-xs text-slate-400 mt-1">Datos agregados por establecimiento, sin nombres. Para reportes, aliados y postulaciones.</p>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <label class="flex flex-col gap-1 text-[0.6rem] font-bold uppercase text-slate-400">Desde<input type="date" id="imp-from" value="${year}-01-01" class="input-field-tw h-10 text-sm"></label>
          <label class="flex flex-col gap-1 text-[0.6rem] font-bold uppercase text-slate-400">Hasta<input type="date" id="imp-to" value="${impactToday()}" class="input-field-tw h-10 text-sm"></label>
          <button class="btn-primary-tw h-10 px-4 text-xs uppercase font-bold" onclick="window.loadImpactData()"><i class="fas fa-rotate"></i> Actualizar</button>
          <button class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500" onclick="this.closest('.fixed').remove()"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div id="impact-body" class="p-6"><div class="text-center text-slate-400 py-10"><i class="fas fa-spinner fa-spin"></i></div></div>
    </div>`;
  document.body.appendChild(modal);
  window.loadImpactData();
};

window.loadImpactData = async function loadImpactData() {
  const body = document.getElementById('impact-body');
  const from = document.getElementById('imp-from').value;
  const to = document.getElementById('imp-to').value;
  body.innerHTML = '<div class="text-center text-slate-400 py-10"><i class="fas fa-spinner fa-spin"></i></div>';

  const [{ data: rows, error }, { data: trend }] = await Promise.all([
    window._supabase.rpc('get_impact_metrics', { p_from: from, p_to: to }),
    window._supabase.rpc('get_impact_trend', { p_months: 6 }),
  ]);
  if (error) {
    body.innerHTML = `<p class="text-rose-500 text-sm">${/get_impact_metrics/.test(error.message) ? 'Falta correr migrations/impact-metrics.sql' : window.sanitizeInput(error.message)}</p>`;
    return;
  }
  const data = rows || [];
  window._impact = { data, trend: trend || [], from, to };

  const sum = (k) => data.reduce((s, r) => s + Number(r[k] || 0), 0);
  const enrolled = sum('enrolled');
  const active = sum('active_students');
  const lessons = sum('lessons_completed');
  const completing = sum('students_completing');
  const duels = sum('duels_played');
  const family = sum('students_with_family');
  const attRows = data.filter(r => r.attendance_pct !== null && r.attendance_pct !== undefined);
  const attAvg = attRows.length ? Math.round(attRows.reduce((s, r) => s + Number(r.attendance_pct), 0) / attRows.length) : null;
  const minutes = active ? Math.round(data.reduce((s, r) => s + Number(r.minutes_per_active || 0) * Number(r.active_students || 0), 0) / active) : 0;

  const tile = (value, label, sub) => `
    <div class="rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
      <div class="text-2xl font-black text-slate-800 dark:text-white tabular-nums">${value}</div>
      <div class="text-[0.65rem] font-bold uppercase tracking-widest text-slate-400 mt-1">${label}</div>
      ${sub ? `<div class="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-1">${sub}</div>` : ''}
    </div>`;

  const maxActive = Math.max(1, ...(window._impact.trend.map(t => Number(t.active_students))));
  const bars = window._impact.trend.map(t => `
    <div class="flex flex-col items-center gap-1 flex-1 min-w-0">
      <span class="text-[0.65rem] font-bold text-slate-500 tabular-nums">${fmt(t.active_students)}</span>
      <div class="w-full rounded-t-lg bg-emerald-500/80" style="height:${Math.max(4, Math.round(100 * Number(t.active_students) / maxActive))}px"></div>
      <span class="text-[0.6rem] text-slate-400">${new Date(t.month + '-15').toLocaleDateString('es-GT', { month: 'short' })}</span>
    </div>`).join('');

  body.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${tile(fmt(enrolled), 'Estudiantes inscritos', `${data.length} establecimientos`)}
      ${tile(fmt(active), 'Estudiantes activos', `${pct(active, enrolled)}% de los inscritos`)}
      ${tile(fmt(minutes) + ' min', 'Uso por estudiante activo', 'en el período')}
      ${tile(fmt(lessons), 'Lecciones completadas', `${fmt(completing)} estudiantes`)}
      ${tile(fmt(duels), 'Duelos de conocimiento', 'jugados y terminados')}
      ${tile(attAvg === null ? '--' : attAvg + '%', 'Asistencia promedio', attAvg === null ? 'sin registros' : `${attRows.length} establecimientos con datos`)}
      ${tile(fmt(family), 'Estudiantes con familia registrada', `${pct(family, enrolled)}% de los inscritos`)}
      ${tile(enrolled ? (lessons / Math.max(completing, 1)).toFixed(1) : '0', 'Lecciones por estudiante', 'entre quienes completaron')}
    </div>

    <div class="mt-6 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
      <p class="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 mb-3">Estudiantes activos por mes (toda la red)</p>
      <div class="flex items-end gap-2" style="height:140px">${bars}</div>
    </div>

    <div class="mt-6 overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
      <table class="w-full text-sm" style="min-width:52rem">
        <thead class="bg-slate-50 dark:bg-slate-800/50 text-[0.6rem] uppercase tracking-widest text-slate-400">
          <tr>${['Establecimiento', 'Inscritos', 'Activos', '% activos', 'Min/activo', 'Lecciones', 'Duelos', 'Asistencia', 'Con familia'].map((h, i) => `<th class="p-3 ${i ? 'text-right' : 'text-left'}">${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${data.map(r => `<tr class="border-t border-slate-100 dark:border-slate-800">
            <td class="p-3 font-bold text-slate-700 dark:text-slate-200">${window.sanitizeInput(r.school_name)}</td>
            <td class="p-3 text-right tabular-nums">${fmt(r.enrolled)}</td>
            <td class="p-3 text-right tabular-nums">${fmt(r.active_students)}</td>
            <td class="p-3 text-right tabular-nums">${pct(r.active_students, r.enrolled)}%</td>
            <td class="p-3 text-right tabular-nums">${r.minutes_per_active ?? '--'}</td>
            <td class="p-3 text-right tabular-nums">${fmt(r.lessons_completed)}</td>
            <td class="p-3 text-right tabular-nums">${fmt(r.duels_played)}</td>
            <td class="p-3 text-right tabular-nums">${r.attendance_pct === null || r.attendance_pct === undefined ? '--' : r.attendance_pct + '%'}</td>
            <td class="p-3 text-right tabular-nums">${fmt(r.students_with_family)}</td>
          </tr>`).join('') || '<tr><td colspan="9" class="p-6 text-center text-slate-400">Sin datos en este período.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="flex flex-wrap gap-2 mt-6">
      <button class="btn-secondary-tw h-10 px-4 text-xs uppercase font-bold" onclick="window.exportImpactCsv()"><i class="fas fa-file-csv"></i> Exportar CSV</button>
      <button class="btn-secondary-tw h-10 px-4 text-xs uppercase font-bold" onclick="window.copyImpactSummary(this)"><i class="fas fa-copy"></i> Copiar resumen para postulaciones</button>
    </div>
    <p class="text-[0.7rem] text-slate-400 mt-3">"Activo" = entró a la plataforma al menos una vez en el período. La asistencia sale de los registros con QR. Para medir aprendizaje, complementar con la prueba de entrada y salida (docs/MEDICION_IMPACTO.md).</p>`;

  window._impact.summary = { enrolled, active, minutes, lessons, completing, duels, attAvg, family, schools: data.length };
};

window.exportImpactCsv = function exportImpactCsv() {
  const { data, from, to } = window._impact || {};
  if (!data) return;
  const cols = ['school_code', 'school_name', 'enrolled', 'active_students', 'minutes_per_active', 'lessons_completed', 'students_completing', 'duels_played', 'attendance_pct', 'students_with_family'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...data.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `impacto-quetzal-${from}_${to}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

window.copyImpactSummary = async function copyImpactSummary(btn) {
  const s = window._impact?.summary;
  if (!s) return;
  const { from, to } = window._impact;
  const text = `Entre el ${from} y el ${to}, Quetzal LMS acompañó a ${fmt(s.enrolled)} estudiantes en ${s.schools} establecimientos de Guatemala. `
    + `${fmt(s.active)} estudiantes (${pct(s.active, s.enrolled)}%) usaron la plataforma, con un promedio de ${fmt(s.minutes)} minutos por estudiante activo. `
    + `Se completaron ${fmt(s.lessons)} lecciones (${fmt(s.completing)} estudiantes) y se jugaron ${fmt(s.duels)} duelos de conocimiento. `
    + (s.attAvg !== null ? `La asistencia promedio registrada fue de ${s.attAvg}%. ` : '')
    + `${fmt(s.family)} estudiantes (${pct(s.family, s.enrolled)}%) tienen a su familia registrada para recibir avisos.`;
  try {
    await navigator.clipboard.writeText(text);
    window.showToast('<i class="fas fa-copy"></i> Resumen copiado', 'success');
  } catch {
    prompt('Copiá el resumen:', text);
  }
};
