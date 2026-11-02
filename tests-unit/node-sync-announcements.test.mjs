// Avisos que sube un nodo escolar (supabase/functions/node-sync/announcements.ts): mismas reglas que can_send_announcement
// (el docente solo avisa a estudiantes de SUS grupos de la escuela del nodo) y qué avisos bajan al nodo.
// TypeScript sin sintaxis no borrable: Node 22 lo importa directo. Con Node 20 se omite.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/announcements.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /announcements\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const NOW = Date.parse('2026-11-02T12:00:00Z');
const ID = '123e4567-e89b-42d3-a456-426614174000';
const ctx = () => ({
  schoolCode: 'ESC1', now: NOW,
  assignments: [{ teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { teacher_id: 't1', school_code: 'ESC1', grade: 'Segundo', section: 'B' }, { teacher_id: 't2', school_code: 'ESC1', grade: 'Tercero', section: 'C' }],
});
const own = (patch = {}) => ({ id: ID, sender_id: 't1', sender_role: 'docente', audience: 'students', school_code: 'ESC1', grade: 'Primero', section: 'A', target_groups: null, target_schools: null, title: 'Tarea', message: 'Traer el robot', created_at: '2026-11-02T11:00:00Z', ...patch });
const bad = (ev, c) => { const r = mod.validateAnnouncementEvent(ev, c || ctx()); assert.equal(r.ok, false, JSON.stringify(ev).slice(0, 100)); assert.ok(r.error); };

test('un aviso válido a una clase suya o a varios grupos suyos se convierte en la fila de announcements', { skip }, () => {
  const a = mod.validateAnnouncementEvent(own(), ctx());
  assert.equal(a.ok, true);
  assert.deepEqual(a.row, { id: ID, sender_id: 't1', sender_role: 'docente', audience: 'students', school_code: 'ESC1', grade: 'Primero', section: 'A', target_groups: null, target_schools: null, title: 'Tarea', message: 'Traer el robot', created_at: '2026-11-02T11:00:00.000Z' });
  const g = mod.validateAnnouncementEvent(own({ school_code: null, grade: null, section: null, target_groups: [{ school_code: 'ESC1', grade: 'Primero', section: 'A' }, { school_code: 'ESC1', grade: 'Segundo', section: 'B' }] }), ctx());
  assert.equal(g.ok, true);
  assert.equal(g.row.target_groups.length, 2);
  assert.equal(g.row.school_code, null);
});

test('rechaza lo que la nube rechaza: docente ajeno, grupo que no es suyo, de otra escuela, docentes/todos, por escuela, administrador, id o textos inválidos', { skip }, () => {
  bad(own({ sender_id: 'otro' }));
  bad(own({ sender_id: 't2' }));                                  // t2 no está asignado a Primero A
  bad(own({ grade: 'Segundo', section: 'B', sender_id: 't2' }));
  bad(own({ school_code: 'ESC2' }));                              // otra escuela
  bad(own({ audience: 'teachers' })); bad(own({ audience: 'all' }));
  bad(own({ target_schools: ['ESC1'] }));
  bad(own({ sender_role: 'admin' }));
  bad(own({ target_groups: [{ school_code: 'ESC1', grade: 'Primero', section: 'A' }] }));        // clase y grupos a la vez
  bad(own({ school_code: null, grade: null, section: null, target_groups: [{ school_code: 'ESC1', grade: 'Tercero', section: 'C' }] }));
  bad(own({ school_code: null, grade: null, section: null, target_groups: [{ school_code: 'ESC2', grade: 'Primero', section: 'A' }] }));
  bad(own({ school_code: null, grade: null, section: null, target_groups: [] }));
  bad(own({ school_code: null, grade: null, section: null, target_groups: 'texto' }));
  bad(own({ id: 'no-uuid' })); bad(own({ id: undefined }));
  bad(own({ title: '' })); bad(own({ title: 'x'.repeat(151) })); bad(own({ message: '  ' })); bad(own({ message: 'x'.repeat(2001) })); bad(own({ title: 5 }));
  bad(null); bad('basura');
});

test('los textos se limpian de caracteres de control y la fecha solo vale si es razonable', { skip }, () => {
  const t = mod.validateAnnouncementEvent(own({ title: ' Hola\u0000\u0007  mundo ', message: 'a\u0001b' }), ctx());
  assert.deepEqual([t.row.title, t.row.message], ['Hola mundo', 'a b']);
  const when = (iso) => mod.validateAnnouncementEvent(own({ created_at: iso }), ctx()).row.created_at;
  assert.equal(when('2026-11-02T13:00:00Z'), '2026-11-02T12:00:00.000Z', 'del futuro: ahora');
  assert.equal(when('2026-08-01T00:00:00Z'), '2026-11-02T12:00:00.000Z', 'de hace más de 30 días: ahora');
  assert.equal(when(undefined), '2026-11-02T12:00:00.000Z');
});

test('una lectura vale si el usuario es de la escuela y el aviso tiene id válido', { skip }, () => {
  const c = { userIds: new Set(['s1', 't1']), now: NOW };
  const ok = mod.validateReadEvent({ announcement_id: ID, user_id: 's1', read_at: '2026-11-02T11:00:00Z' }, c);
  assert.deepEqual(ok, { ok: true, row: { announcement_id: ID, user_id: 's1', read_at: '2026-11-02T11:00:00.000Z' } });
  for (const b of [{ announcement_id: 'x', user_id: 's1' }, { announcement_id: ID, user_id: 'otra-escuela' }, { announcement_id: ID }, null]) {
    assert.equal(mod.validateReadEvent(b, c).ok, false, JSON.stringify(b));
  }
  assert.equal(mod.validateReadEvent({ announcement_id: ID, user_id: 's1', read_at: 'basura' }, c).row.read_at, '2026-11-02T12:00:00.000Z');
});

test('a un nodo solo bajan los avisos que alcanzan a su escuela (de su clase, grupos, escuela o generales)', { skip }, () => {
  const v = (a) => mod.announcementVisibleToSchool(a, 'ESC1');
  assert.equal(v({ school_code: 'ESC1' }), true);
  assert.equal(v({ school_code: 'ESC2' }), false);
  assert.equal(v({ target_groups: [{ school_code: 'ESC2' }, { school_code: 'ESC1' }] }), true);
  assert.equal(v({ target_groups: [{ school_code: 'ESC2' }] }), false);
  assert.equal(v({ target_schools: ['ESC1', 'ESC3'] }), true);
  assert.equal(v({ target_schools: ['ESC3'] }), false);
  assert.equal(v({ school_code: null, target_groups: null, target_schools: null, audience: 'all' }), true, 'general del administrador');
});

test('lo que baja usa solo las columnas permitidas', { skip }, () => {
  const out = mod.shapeAnnouncements([{ id: ID, sender_id: 'a', sender_role: 'admin', audience: 'all', title: 'T', message: 'M', created_at: 'x', secreto: 'no', school_code: null }]);
  assert.equal('secreto' in out[0], false);
  assert.equal(out[0].title, 'T');
});

test('una lectura se aplica si su aviso existe y alcanza a la escuela; si no, se rechaza para siempre, salvo que el aviso falló ahora por un error pasajero', { skip }, () => {
  const c = (a, failedNow = false) => mod.classifyRead(a, 'ESC1', failedNow).action;
  assert.equal(c({ id: ID, school_code: 'ESC1' }), 'apply');
  assert.equal(c({ id: ID, school_code: null, target_groups: null, target_schools: null }), 'apply', 'aviso general');
  assert.equal(c({ id: ID, school_code: 'ESC2' }), 'reject', 'aviso de otra escuela');
  assert.equal(c({ id: ID, target_groups: [{ school_code: 'ESC2' }] }), 'reject');
  assert.equal(c(undefined), 'reject', 'el aviso ya no existe (se borró o la nube lo rechazó): no se reintenta para siempre');
  assert.equal(c(undefined, true), 'defer', 'su aviso falló hace un momento por un error pasajero: se reintenta junto con él');
});

test('a un nodo solo bajan los grupos y escuelas de SU escuela, nunca los de otras escuelas del mismo aviso', { skip }, () => {
  const out = mod.restrictToSchool({ id: ID, title: 'T', target_groups: [{ school_code: 'ESC1', grade: 'Primero', section: 'A' }, { school_code: 'ESC2', grade: 'Segundo', section: 'B' }], target_schools: ['ESC1', 'ESC3'] }, 'ESC1');
  assert.deepEqual(out.target_groups, [{ school_code: 'ESC1', grade: 'Primero', section: 'A' }]);
  assert.deepEqual(out.target_schools, ['ESC1']);
  assert.equal(mod.restrictToSchool({ id: ID, target_groups: null, target_schools: null }, 'ESC1').target_groups, null);
  assert.equal(mod.isUuid(ID), true);
  assert.equal(mod.isUuid('no-es'), false);
});
