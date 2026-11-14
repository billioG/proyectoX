// Motivo de la inasistencia (attendance.absence_reason): de la lista del docente a la nube, por el cliente y por el nodo, y hasta el reporte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAttendanceRow, ABSENCE_REASONS } from '../js/camera-support.js';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('los motivos son los de la base y «Sin aviso» va primero', () => {
  assert.deepEqual(ABSENCE_REASONS.map((r) => r.id), ['sin_aviso', 'enfermedad', 'permiso', 'otro']);
  const sql = read('migrations/attendance-absence-reason.sql');
  for (const r of ABSENCE_REASONS) assert.ok(sql.includes(`'${r.id}'`), r.id);
});

test('la fila lleva el motivo solo si es inasistencia y el motivo es conocido (una «presente» no lo lleva: la nube sin migración sigue sirviendo)', () => {
  const base = { studentId: 's1', teacherId: 't1', school: 'E', grade: '1ro', section: 'A', date: '2026-11-08' };
  assert.equal(buildAttendanceRow({ ...base, status: 'absent', absenceReason: 'enfermedad' }).absence_reason, 'enfermedad');
  assert.ok(!('absence_reason' in buildAttendanceRow({ ...base, status: 'present', absenceReason: 'enfermedad' })));
  assert.ok(!('absence_reason' in buildAttendanceRow({ ...base, status: 'absent' })));
  assert.ok(!('absence_reason' in buildAttendanceRow({ ...base, status: 'absent', absenceReason: 'inventado' })));
});

test('la lista del docente: selector de motivo solo para quien no está presente, borrador que se guarda con «Guardar lista», y sin romper si la nube no tiene la columna', () => {
  const src = read('js/attendance.js');
  assert.match(src, /const reasonHtml = isP \? ''/);
  assert.match(src, /onchange="window\.setAbsenceReason\(this\.dataset\.studentId, this\.value\)"/);
  assert.match(src, /const unsavedCount = \(\) => draftChanges\(\)\.length \+ reasonChanges\(\)\.length/);
  assert.match(src, /att\.error \? \(await _supabase\.from\('attendance'\)\.select\('student_id, status'\)/, 'sin la migración, la lista carga igual');
  assert.match(read('js/handler-allowlist.js'), /'setAbsenceReason'/);
});

test('la nube valida el motivo: solo en inasistencias y de la lista; sin motivo sigue igual', async () => {
  let mod;
  try { mod = await import('../supabase/functions/node-sync/attendance.ts'); } catch { return; } // Node < 22: no importa TypeScript
  const NOW = Date.parse('2026-11-02T15:00:00Z');
  const ctx = { schoolCode: 'E1', now: NOW, students: new Map([['s1', { grade: '1ro', section: 'A' }]]), assignments: [{ teacher_id: 't1', school_code: 'E1', grade: '1ro', section: 'A' }], adminIds: new Set() };
  const row = (p = {}) => ({ student_id: 's1', teacher_id: 't1', school_code: 'E1', grade: '1ro', section: 'A', date: '2026-11-02', time: '08:00:00', status: 'absent', ...p });
  const op = (seq, r) => ({ seq, tbl: 'attendance', op: 'insert', pk: 's1:2026-11-02', row: r });
  const plan = (r) => mod.planAttendanceOps([op(1, r)], ctx);
  assert.equal(plan(row({ absence_reason: 'permiso' })).actions[0].row.absence_reason, 'permiso');
  assert.ok(!('absence_reason' in plan(row()).actions[0].row));
  assert.equal(plan(row({ absence_reason: 'volando' })).results[0].ok, false);
  assert.equal(plan(row({ status: 'present', absence_reason: 'otro' })).results[0].ok, false, 'una presente no lleva motivo');
});

test('el nodo acepta el mismo motivo y lo deja en la bandeja', async () => {
  const { SCHEMA } = await import('../school-node/rest/schema.js');
  assert.ok(SCHEMA.attendance.columns.includes('absence_reason') && SCHEMA.attendance.writable.includes('absence_reason'));
  assert.match(read('school-node/rest/policies.js'), /a\.absence_reason != null && !\(a\.status === 'absent' && \['sin_aviso', 'enfermedad', 'permiso', 'otro'\]\.includes\(a\.absence_reason\)\)/);
});

test('la analítica toma el motivo (con respaldo sin él) y el reporte descargable lo trae; lo no marcado es «Sin aviso»', () => {
  const src = read('js/attendance-summary-view.js');
  assert.match(src, /fetchAllRows\(\(\) => buildAttendance\(true\)\)\.catch\(\(\) => window\.fetchAllRows\(\(\) => buildAttendance\(false\)\)\)/);
  assert.match(src, /Fecha,Establecimiento,Docente,Estudiante,Estado,Motivo/);
  const code = src.slice(src.indexOf('const dayOf'), src.indexOf('window.renderAnalyticsView = '));
  const { buildAttendanceStats, absenceReasonLabel } = new Function(`${code}; return { buildAttendanceStats, absenceReasonLabel };`)();
  const roster = [{ id: 'a', full_name: 'Ana', school_code: 'E1', grade: '1ro', section: 'A' }, { id: 'b', full_name: 'Billy', school_code: 'E1', grade: '1ro', section: 'A' }];
  const rec = (id, date, status, extra = {}) => ({ student_id: id, date, status, school_code: 'E1', grade: '1ro', section: 'A', students: { full_name: id }, ...extra });
  const all = [rec('a', '2026-11-05', 'present'), rec('b', '2026-11-05', 'absent', { absence_reason: 'enfermedad' }), rec('a', '2026-11-06', 'present')];
  const rows = buildAttendanceStats(all, all, roster, '2026-11-30');
  const billy = rows.find((r) => r.name === 'Billy');
  assert.deepEqual(billy.absentDays, ['2026-11-05', '2026-11-06']);
  assert.equal(absenceReasonLabel(billy.absentReasons['2026-11-05']), 'Enfermedad');
  assert.equal(absenceReasonLabel(billy.absentReasons['2026-11-06']), 'Sin aviso', 'sin motivo guardado = sin aviso');
});
