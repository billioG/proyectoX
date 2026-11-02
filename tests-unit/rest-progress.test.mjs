// Progreso de práctica calculado en el nodo (school-node/rest/progress.js): las mismas cuentas que get_group_progress, get_groups_progress y
// get_my_progress de la nube, con la práctica bajada de la nube y la que sigue pendiente de subir. Lógica pura: corre con cualquier Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../school-node/rest/progress.js';

const NOW = Date.parse('2026-11-04T15:00:00Z'); // miércoles
const iso = (daysAgo, hour = 10) => new Date(NOW - daysAgo * 86400_000 + (hour - 15) * 3600_000).toISOString();
const play = (student, competency, score, daysAgo) => ({ id: `${student}${competency}${daysAgo}${score}`, student_id: student, competency, score, played_at: iso(daysAgo) });

function setup({ results = [], pending = [] } = {}) {
  const data = {
    students: [
      { id: 's1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
      { id: 's2', full_name: 'Beto', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' },
      { id: 's3', full_name: 'Carla', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'baja' },
      { id: 's4', full_name: 'Dani', school_code: 'ESC1', grade: 'Segundo', section: 'B', status: 'activo' },
    ],
    teacher_assignments: [{ teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { teacher_id: 't2', school_code: 'ESC1', grade: 'Segundo', section: 'B' }],
    schools: [{ code: 'ESC1', name: 'Escuela Uno' }],
    practice_results: results,
  };
  return createProgress({ store: { all: (t) => data[t] || [], pending: () => pending }, now: () => NOW });
}
const T1 = { uid: 't1', role: 'teacher' };

test('progreso del grupo: por estudiante y por competencia, con el período anterior para comparar; los dados de baja no cuentan', () => {
  const p = setup({ results: [
    play('s1', 'lectura', 0.8, 2), play('s1', 'lectura', 1, 3), play('s1', 'matematica', 0.5, 4), play('s2', 'lenguaje', 0.25, 1),
    play('s1', 'lectura', 0.4, 40), play('s3', 'lectura', 1, 1), play('s4', 'lectura', 1, 1),
  ] });
  const r = p.getGroupProgress({ p_school: 'ESC1', p_grade: 'Primero', p_section: 'A', p_days: 30 }, T1);
  assert.equal(r.days, 30);
  assert.equal(r.class_size, 2);
  assert.equal(r.active_students, 2);
  assert.equal(r.practice_n, 4);
  assert.equal(r.reto_n, 0);
  assert.deepEqual(r.competencies.map((c) => [c.competency, c.plays, c.pct, c.pct_prev, c.students]), [['lectura', 2, 90, 40, 1], ['matematica', 1, 50, null, 1], ['pensamiento', 0, null, null, 0], ['lenguaje', 1, 25, null, 1]]);
  const [first, second] = r.students;
  assert.deepEqual([first.full_name, first.practice_n, first.pct, first.lectura, first.matematica, first.pct_prev], ['Beto', 1, 25, null, null, null], 'el más reciente primero');
  assert.deepEqual([second.full_name, second.practice_n, second.pct, second.lectura, second.pct_prev], ['Ana', 3, 77, 90, 40]);
  assert.equal(second.last_practice, iso(2));
});

test('suma la práctica que se hizo aquí y aún no sube; sin datos todo queda en null o 0, no en error', () => {
  const pending = [{ table: '_rpc', op: 'log_practice', created_at: NOW - 3600_000, row: { student_id: 's2', args: { p_game: 'spelling', p_correct: 3, p_total: 4, p_played_at: null } } },
    { table: 'otra', op: 'x', row: {} }];
  const p = setup({ pending });
  const r = p.getGroupProgress({ p_school: 'ESC1', p_grade: 'Primero', p_section: 'A' }, T1);
  assert.deepEqual([r.practice_n, r.students.find((s) => s.student_id === 's2').lenguaje], [1, 75]);
  const empty = setup().getGroupProgress({ p_school: 'ESC1', p_grade: 'Primero', p_section: 'A' }, T1);
  assert.deepEqual([empty.practice_n, empty.active_students, empty.students.map((s) => s.pct)], [0, 0, [null, null]]);
});

test('solo ve los grupos que puede: el docente de otra clase, un estudiante o nadie reciben el mismo error; el administrador ve todo', () => {
  const p = setup();
  const args = { p_school: 'ESC1', p_grade: 'Primero', p_section: 'A' };
  for (const who of [{ uid: 't2', role: 'teacher' }, { uid: 's1', role: 'student' }, undefined]) assert.throws(() => p.getGroupProgress(args, who), (e) => e.status === 400 && /acceso/.test(e.message));
  assert.equal(p.getGroupProgress(args, { uid: 'adm', role: 'admin' }).class_size, 2);
  assert.throws(() => p.getGroupsProgress({}, { uid: 's1', role: 'student' }));
});

test('resumen de grupos: solo los del docente, con el nombre de la escuela y los promedios por competencia', () => {
  const p = setup({ results: [play('s1', 'lectura', 1, 1), play('s2', 'lectura', 0.5, 2), play('s2', 'lenguaje', 0, 2), play('s4', 'lectura', 1, 1)] });
  assert.deepEqual(p.getGroupsProgress({ p_days: 30 }, T1), [{ school_code: 'ESC1', school_name: 'Escuela Uno', grade: 'Primero', section: 'A', students: 2, active: 2, practicing: 2, practice_n: 3, reto_n: 0, lectura: 75, matematica: null, pensamiento: null, lenguaje: 0 }]);
  assert.equal(p.getGroupsProgress({}, { uid: 'adm', role: 'admin' }).length, 2);
  assert.equal(p.getGroupsProgress({ p_days: 1 }, T1)[0].practice_n, 3, 'la ventana mínima es de 7 días');
});

test('mi progreso: por competencia con su serie semanal, racha de días seguidos y la competencia más débil (con al menos 3 jugadas)', () => {
  const results = [
    play('s1', 'lectura', 1, 0), play('s1', 'lectura', 0.5, 1), play('s1', 'lectura', 0.5, 2), play('s1', 'matematica', 0.2, 1), play('s1', 'matematica', 0.2, 2), play('s1', 'matematica', 0.2, 3),
    play('s1', 'lenguaje', 1, 20), play('s2', 'lectura', 1, 0),
  ];
  const r = setup({ results }).getMyProgress({ p_weeks: 4 }, { uid: 's1', role: 'student' });
  assert.equal(r.streak_days, 4, 'hoy, ayer, anteayer y hace 3 días');
  assert.equal(r.practice_total, 8 - 1);
  assert.equal(r.practice_7d, 6);
  assert.equal(r.weakest, 'matematica');
  assert.equal(r.last_practice_at, iso(0));
  const lectura = r.competencies.find((c) => c.competency === 'lectura');
  assert.deepEqual([lectura.practice_n, lectura.pct, lectura.pct_recent], [3, 67, 67]);
  assert.equal(lectura.weekly.length, 4);
  assert.equal(lectura.weekly.at(-1).week, '2026-11-02', 'semanas desde el lunes');
  assert.equal(lectura.weekly.at(-1).n, 3);
  assert.equal(setup().getMyProgress({}, { uid: 's1', role: 'student' }).streak_days, 0);
});
