// Analítica de asistencia: una fila por estudiante con la CANTIDAD de asistencias e inasistencias. Quien no tiene registro un día de clase cuenta como inasistencia
// sin que el docente la marque; las fechas van solo en el reporte descargable.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../js/attendance-summary-view.js', import.meta.url), 'utf8');
const code = src.slice(src.indexOf('const dayOf'), src.indexOf('window.renderAnalyticsView = '));
const { buildAttendanceStats } = new Function(`${code}; return { buildAttendanceStats };`)();

const S = (id, name, grade = '1ro', section = 'A') => ({ id, full_name: name, school_code: 'E1', grade, section });
const roster = [S('a', 'Ana'), S('b', 'Billy'), S('c', 'Carla'), S('z', 'Otro grado', '2do')];
const rec = (id, date, status = 'present', teacher = 't1') => ({ student_id: id, teacher_id: teacher, date, status, school_code: 'E1', grade: '1ro', section: 'A', students: { full_name: roster.find((s) => s.id === id)?.full_name } });
const by = (rows) => Object.fromEntries(rows.map((r) => [r.name, [r.present, r.absent]]));

test('quien no tiene registro un día de clase cuenta como inasistencia, sin que el docente la marque', () => {
  const all = [rec('a', '2026-11-05'), rec('b', '2026-11-05'), rec('a', '2026-11-06')]; // Carla nunca vino; Billy faltó el 6
  const rows = buildAttendanceStats(all, all, roster, '2026-11-30');
  assert.deepEqual(by(rows), { Ana: [2, 0], Billy: [1, 1], Carla: [0, 2] });
  assert.ok(!rows.some((r) => r.name === 'Otro grado'), 'otra clase no entra');
});

test('un día sin ningún presente (fin de semana, feriado, suspensión) no cuenta como clase', () => {
  const all = [rec('a', '2026-11-05'), rec('b', '2026-11-05')];
  const rows = buildAttendanceStats(all, all, roster, '2026-11-30');
  assert.equal(rows.find((r) => r.name === 'Carla').absent, 1); // solo el 5
});

test('los días que aún no llegan no cuentan, y las fechas salen para el reporte', () => {
  const all = [rec('a', '2026-11-05'), rec('a', '2026-11-20')];
  const rows = buildAttendanceStats(all, all, roster, '2026-11-10');
  const ana = rows.find((r) => r.name === 'Ana');
  assert.deepEqual(ana.presentDays, ['2026-11-05']);
  assert.deepEqual(rows.find((r) => r.name === 'Billy').absentDays, ['2026-11-05']);
});

test('una inasistencia marcada a mano cuenta aunque nadie más viniera; presente gana si hay las dos', () => {
  const all = [rec('a', '2026-11-05', 'absent')];
  assert.equal(buildAttendanceStats(all, all, roster, '2026-11-30').find((r) => r.name === 'Ana').absent, 1);
  const both = [rec('a', '2026-11-05', 'absent'), rec('a', '2026-11-05', 'present')];
  assert.deepEqual(by(buildAttendanceStats(both, both, roster, '2026-11-30')).Ana, [1, 0]);
});

test('si otro docente marcó presentes a la clase ese día, el día cuenta como clase para este grupo', () => {
  const mine = [rec('a', '2026-11-05')];
  const all = [...mine, rec('b', '2026-11-06', 'present', 't2')];
  assert.deepEqual(by(buildAttendanceStats(mine, all, roster, '2026-11-30')).Ana, [1, 1]);
});

test('estudiante que ya no está en la ficha sigue saliendo con su nombre; sin datos no rompe', () => {
  const all = [rec('x', '2026-11-05')];
  all[0].students = null;
  assert.equal(buildAttendanceStats(all, all, roster, '2026-11-30').find((r) => r.key === 'x').name, 'Estudiante Eliminado');
  assert.deepEqual(buildAttendanceStats([], [], roster), []);
  assert.deepEqual(buildAttendanceStats(undefined, undefined, undefined), []);
});

test('la vista muestra solo cantidades y el reporte lleva las fechas', () => {
  assert.ok(!src.includes('attendanceDayChips'));
  assert.match(src, /Inasistencias<\/th>/);
  assert.match(src, /for \(const d of st\.absentDays\) lines\.push\(\{ d, name: st\.name, status: 'Inasistencia' \}\)/);
});
