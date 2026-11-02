// Cursos y recursos que sube un nodo escolar (supabase/functions/node-sync/content.ts): la nube vuelve a validar todo y decide qué
// escribir. TypeScript sin sintaxis no borrable: Node 22 lo importa directo. Con Node 20 se omite.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/content.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /content\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const C1 = '1f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const C2 = '2f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const L1 = '3f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const L2 = '4f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const BASE = 'https://proy.supabase.co/storage/v1/object/public/course-content/';
const CLOUD = 'https://proy.supabase.co';

const ctx = (over = {}) => ({
  schoolCode: 'ESC1', storageBase: BASE, cloudUrl: CLOUD,
  assignments: [{ teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { teacher_id: 't2', school_code: 'ESC1', grade: 'Segundo', section: 'B' }, { teacher_id: 't9', school_code: 'ESC2', grade: 'Primero', section: 'A' }],
  adminIds: new Set(['adm']),
  courses: new Map(), lessons: new Map(), ...over,
});
const course = (patch = {}) => ({ title: 'Robótica', description: null, school_code: 'ESC1', grade: 'Primero', section: 'A', created_by: 't1', is_shared: false, tags: ['a'], weight: 40, bimestre: 1, cnb_area: 'Tec', tinkercad_class_url: null, created_at: '2026-11-02T10:00:00Z', ...patch });
const lesson = (patch = {}) => ({ id: L1, title: 'Guía', content_type: 'pdf', content_url: `${BASE}lessons/${L1}/guia.pdf`, content_path: `lessons/${L1}`, quiz_data: null, course_id: C1,
  order_index: 0, audience: 'estudiante', school_code: 'ESC1', grade: 'Primero', section: 'A', created_by: 't1', is_shared: false, ...patch });
const op = (seq, tbl, kind, pk, row) => ({ seq, tbl, op: kind, pk, row });
const plan = (ops, c = ctx()) => mod.planContentOps(ops, c);

test('rutas de archivo y permiso de subida: igual que el nodo; una lección de otra escuela no se pisa', { skip }, () => {
  assert.equal(mod.validateObjectPath(`lessons/${L1}/a/b.pdf`), `lessons/${L1}/a/b.pdf`);
  for (const bad of [`lessons/${L1}/../x.pdf`, `lessons/${L1}/x.exe`, 'lessons/otro/x.pdf', `lessons/${L1}/.a.pdf`, '', null]) assert.equal(mod.validateObjectPath(bad), null, String(bad));
  const own = { schoolCode: 'ESC1', lessonSchool: () => undefined };
  assert.equal(mod.validateContentUploadRequest({ path: `lessons/${L1}/a.pdf`, size: 10 }, own).ok, true);
  assert.equal(mod.validateContentUploadRequest({ path: `lessons/${L1}/a.pdf`, size: 0 }, own).ok, false);
  assert.equal(mod.validateContentUploadRequest({ path: `lessons/${L1}/a.pdf`, size: 151 * 1024 * 1024 }, own).ok, false);
  assert.equal(mod.validateContentUploadRequest({ path: `lessons/${L1}/a.pdf`, size: 10 }, { ...own, lessonSchool: () => 'ESC2' }).ok, false);
  assert.equal(mod.validateContentUploadRequest({ path: `lessons/${L1}/a.pdf`, size: 10 }, { ...own, lessonSchool: () => 'ESC1' }).ok, true);
});

test('un curso y su recurso, en orden, se aceptan y se escriben con la escuela del nodo', { skip }, () => {
  const { actions, results } = plan([op(1, 'courses', 'insert', C1, course()), op(2, 'lessons', 'insert', L1, lesson())]);
  assert.deepEqual(results, [{ seq: 1, ok: true }, { seq: 2, ok: true }]);
  assert.deepEqual(actions.map((a) => [a.table, a.kind, a.row?.id]), [['courses', 'upsert', C1], ['lessons', 'upsert', L1]]);
  assert.equal(actions[0].row.school_code, 'ESC1');
  assert.equal(actions[0].row.weights_approved_at, undefined, 'las aprobaciones de ponderación no viajan');
});

test('enlace externo https y quiz valen; http, javascript:, rutas de otra lección y tipos raros no', { skip }, () => {
  const c = ctx({ courses: new Map([[C1, { school_code: 'ESC1', created_by: 't1', is_shared: false }]]) });
  const ok = [
    lesson({ content_type: 'video', content_url: 'https://www.youtube.com/watch?v=abc', content_path: null }),
    lesson({ id: L2, content_type: 'quiz', content_url: null, content_path: null, quiz_data: [{ question: 'x' }] }),
    lesson({ content_type: 'scorm', content_url: `${CLOUD}/functions/v1/serve-scorm-entry?path=lessons/${L1}/index.html` }),
  ];
  for (const l of ok) assert.equal(plan([op(1, 'lessons', 'insert', l.id, l)], ctx({ courses: new Map(c.courses) })).results[0].ok, true, JSON.stringify(l).slice(0, 80));
  const bad = [
    lesson({ content_url: 'http://x.com/a', content_path: null }), lesson({ content_url: 'javascript:alert(1)', content_path: null }),
    lesson({ content_url: `${BASE}lessons/${L2}/guia.pdf` }), lesson({ content_type: 'exe' }), lesson({ audience: 'todos' }), lesson({ title: '' }),
    lesson({ content_type: 'quiz', content_url: null, quiz_data: [] }), lesson({ grade: 'Segundo' }), lesson({ course_id: C2 }), lesson({ created_by: 't2' }),
    lesson({ content_path: 'lessons/otra' }), lesson({ order_index: -1 }),
  ];
  for (const l of bad) {
    const r = plan([op(1, 'lessons', 'insert', l.id, l)], ctx({ courses: new Map(c.courses) })).results[0];
    assert.equal(r.ok, false, JSON.stringify(l).slice(0, 90));
    assert.equal(r.permanent, true);
  }
});

test('curso de otra escuela, docente sin esa clase, a nombre de otro y datos raros se rechazan; el administrador puede en cualquier clase de la escuela', { skip }, () => {
  const bad = [course({ school_code: 'ESC2' }), course({ grade: 'Segundo', section: 'B' }), course({ created_by: 't9' }), course({ created_by: 'nadie' }), course({ title: ' ' }),
    course({ weight: 101 }), course({ bimestre: 9 }), course({ tinkercad_class_url: 'http://x' }), course({ is_shared: 'si' })];
  for (const c of bad) assert.equal(plan([op(1, 'courses', 'insert', C1, c)]).results[0].ok, false, JSON.stringify(c).slice(0, 80));
  assert.equal(plan([op(1, 'courses', 'insert', C1, course({ created_by: 'adm', grade: 'Quinto', section: 'Z' }))]).results[0].ok, true);
  assert.equal(plan([op(1, 'courses', 'insert', 'no-uuid', course())]).results[0].ok, false);
  assert.equal(plan([op(1, 'cursos', 'insert', C1, course())]).results[0].ok, false);
});

test('editar y borrar solo lo de la escuela del nodo y de su autor; un curso compartido no se borra; borrar un curso se lleva sus recursos del lote', { skip }, () => {
  const c = () => ctx({
    courses: new Map([[C1, { school_code: 'ESC1', created_by: 't1', is_shared: false }], [C2, { school_code: 'ESC2', created_by: 't9', is_shared: false }], ['5f2b8c1e-5d4a-4e7b-9a10-123456789abc', { school_code: 'ESC1', created_by: 't1', is_shared: true }]]),
    lessons: new Map([[L1, { school_code: 'ESC1', course_id: C1, created_by: 't1' }], [L2, { school_code: 'ESC2', course_id: C2, created_by: 't9' }]]),
  });
  assert.equal(plan([op(1, 'courses', 'update', C1, course({ title: 'Nuevo' }))], c()).results[0].ok, true);
  assert.equal(plan([op(1, 'courses', 'update', C1, course({ created_by: 't2', grade: 'Segundo', section: 'B' }))], c()).results[0].ok, false, 'no cambia de autor');
  assert.equal(plan([op(1, 'courses', 'update', C2, course({ school_code: 'ESC2', created_by: 't9' }))], c()).results[0].ok, false, 'curso de otra escuela');
  assert.equal(plan([op(1, 'courses', 'delete', C2, {})], c()).results[0].ok, false);
  assert.equal(plan([op(1, 'courses', 'delete', '5f2b8c1e-5d4a-4e7b-9a10-123456789abc', {})], c()).results[0].ok, false, 'compartido solo en línea');
  assert.equal(plan([op(1, 'lessons', 'delete', L2, {})], c()).results[0].ok, false, 'recurso de otra escuela');
  const del = plan([op(1, 'lessons', 'delete', L1, {})], c());
  assert.deepEqual(del.actions, [{ seq: 1, table: 'lessons', kind: 'delete', id: L1, removeFiles: `lessons/${L1}` }]);
  const gone = plan([op(1, 'courses', 'delete', C1, {}), op(2, 'lessons', 'update', L1, lesson({ title: 'x' }))], c());
  assert.equal(gone.results[1].ok, false, 'el recurso de un curso ya borrado no se reescribe');
  assert.equal(plan([op(1, 'courses', 'delete', '6f2b8c1e-5d4a-4e7b-9a10-123456789abc', {})], c()).results[0].ok, true, 'borrar lo que ya no existe es éxito');
});

test('un cambio mal armado no frena a los demás y los repetidos no se duplican', { skip }, () => {
  const { results, actions } = plan([{ foo: 1 }, op(1, 'courses', 'insert', C1, course()), op(2, 'courses', 'insert', C1, course()), op(3, 'courses', 'insert', C1, null)]);
  assert.deepEqual(results.map((r) => r.ok), [true, true, false]);
  assert.equal(actions.length, 2, 'repetir el mismo insert es un upsert por id');
});
