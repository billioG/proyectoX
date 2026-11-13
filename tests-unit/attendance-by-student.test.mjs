// Analítica de asistencia: una fila por estudiante con sus días de asistencia y de ausencia (antes una fila por cada día).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../js/attendance-summary-view.js', import.meta.url), 'utf8');
const code = src.slice(src.indexOf('function groupAttendanceByStudent'), src.indexOf('window.renderAnalyticsView = '));
const { groupAttendanceByStudent, attendanceDayChips } = new Function(`${code}; return { groupAttendanceByStudent, attendanceDayChips };`)();

const rec = (id, name, date, status) => ({ student_id: id, date, status, students: { full_name: name } });

test('junta los días de cada estudiante en una sola fila, ordenados, y los separa en asistencias y ausencias', () => {
  const rows = groupAttendanceByStudent([
    rec('b', 'Billy', '2026-11-12', 'present'), rec('a', 'Ana', '2026-11-07', 'present'), rec('b', 'Billy', '2026-11-07', 'present'),
    rec('b', 'Billy', '2026-11-08', 'absent'), rec('a', 'Ana', '2026-11-07', 'present'), // repetido el mismo día: cuenta una vez
  ]);
  assert.deepEqual(rows.map((r) => r.name), ['Ana', 'Billy']);
  assert.deepEqual(rows[0].present, ['2026-11-07']);
  assert.deepEqual(rows[1].present, ['2026-11-07', '2026-11-12']);
  assert.deepEqual(rows[1].absent, ['2026-11-08']);
});

test('estudiante eliminado y lista vacía no rompen', () => {
  assert.equal(groupAttendanceByStudent([{ student_id: 'x', date: '2026-11-01', status: 'present', students: null }])[0].name, 'Estudiante Eliminado');
  assert.deepEqual(groupAttendanceByStudent([]), []);
  assert.deepEqual(groupAttendanceByStudent(undefined), []);
});

test('los días se muestran sin correrse de fecha (no pasan por Date/UTC) y con el total', () => {
  const html = attendanceDayChips(['2026-11-07', '2026-11-12'], 'present');
  assert.match(html, /title="07\/11\/2026"[^>]*>7</);
  assert.match(html, /title="12\/11\/2026"[^>]*>12</);
  assert.match(html, /font-black[^>]*>2</);
  assert.match(attendanceDayChips([], 'absent'), /—/);
});
