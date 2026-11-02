// Comentarios, «me gusta» y notas que sube un nodo escolar (supabase/functions/node-sync/social.ts): la nube vuelve a validar con las
// reglas de sus políticas y el mismo filtro de groserías. TypeScript sin sintaxis no borrable: Node 22 lo importa; con Node 20 se omite.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/social.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /social\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const K1 = '1f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const K2 = '2f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const N1 = '3f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const LESSON = '4f2b8c1e-5d4a-4e7b-9a10-123456789abc';
const ctx = (over = {}) => ({
  schoolCode: 'ESC1', studentIds: new Set(['s1', 's2', 's3']),
  assignments: [{ teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }, { teacher_id: 't9', school_code: 'ESC2', grade: 'Primero', section: 'A' }],
  adminIds: new Set(['adm']), groups: new Set([7, 8]), groupMembers: new Set(['7:s1', '7:s2', '8:s3']), lessons: new Set([LESSON]), comments: new Map(), ...over,
});
const comment = (patch = {}) => ({ lesson_id: LESSON, group_id: 7, parent_id: null, author_id: 's1', author_name: 'Ana', author_role: 'estudiante', content: 'Muy buena guía', attachment_url: null, created_at: '2026-11-02T10:00:00Z', ...patch });
const op = (seq, tbl, kind, pk, row) => ({ seq, tbl, op: kind, pk, row });
const plan = (ops, c = ctx()) => mod.planSocialOps(ops, c);
const okOf = (ops, c) => plan(ops, c).results.map((r) => r.ok);

test('un comentario de un estudiante de su equipo se acepta y se escribe; con la hora que puso el nodo', { skip }, () => {
  const { actions, results } = plan([op(1, 'resource_comments', 'insert', K1, comment())]);
  assert.deepEqual(results, [{ seq: 1, ok: true }]);
  assert.deepEqual(actions[0], { seq: 1, table: 'resource_comments', kind: 'upsert', onConflict: 'id', row: { id: K1, lesson_id: LESSON, group_id: 7, parent_id: null, author_id: 's1', author_name: 'Ana', author_role: 'estudiante', content: 'Muy buena guía', created_at: '2026-11-02T10:00:00Z' } });
});

test('rechaza: equipo ajeno, autor que no es del equipo, rol falso, groserías, adjuntos, texto vacío o enorme, recurso de otra escuela', { skip }, () => {
  const bad = [comment({ group_id: 99 }), comment({ group_id: 8 }), comment({ author_id: 'otro' }), comment({ author_role: 'docente' }), comment({ author_id: 's3', group_id: 7 }),
    comment({ content: 'eres un idiota' }), comment({ content: 'x'.repeat(2001) }), comment({ content: '  ' }), comment({ attachment_url: 'http://x/y.png' }),
    comment({ lesson_id: K2 }), comment({ author_name: '' }), comment({ parent_id: K2 })];
  for (const b of bad) {
    const r = plan([op(1, 'resource_comments', 'insert', K1, b)]).results[0];
    assert.equal(r.ok, false, JSON.stringify(b).slice(0, 80));
    assert.equal(r.permanent, true);
  }
  assert.match(plan([op(1, 'resource_comments', 'insert', K1, comment({ content: 'eres un idiota' }))]).results[0].error, /CONTENIDO_INAPROPIADO/);
  assert.equal(okOf([op(1, 'resource_comments', 'insert', 'no-uuid', comment())])[0], false);
});

test('el docente de la escuela y el administrador comentan en cualquier equipo; uno de otra escuela no', { skip }, () => {
  const t = (id, role = 'docente') => comment({ author_id: id, author_name: 'X', author_role: role, group_id: 8 });
  assert.deepEqual(okOf([op(1, 'resource_comments', 'insert', K1, t('t1')), op(2, 'resource_comments', 'insert', K2, t('adm', 'admin'))]), [true, true]);
  assert.equal(okOf([op(1, 'resource_comments', 'insert', K1, t('t9'))])[0], false);
  assert.equal(okOf([op(1, 'resource_comments', 'insert', K1, t('t1', 'estudiante'))])[0], false, 'un docente no se hace pasar por estudiante');
});

test('respuestas: al comentario de la misma lección y equipo, aunque sea del mismo lote; «me gusta» solo de alguien del equipo; una sola fila por par', { skip }, () => {
  const c = ctx();
  assert.deepEqual(okOf([
    op(1, 'resource_comments', 'insert', K1, comment()),
    op(2, 'resource_comments', 'insert', K2, comment({ author_id: 's2', parent_id: K1 })),
    op(3, 'resource_comments', 'insert', N1, comment({ author_id: 's3', group_id: 8, parent_id: K1 })),
    op(4, 'resource_comment_likes', 'insert', `${K1}:s2`, { comment_id: K1, user_id: 's2' }),
    op(5, 'resource_comment_likes', 'insert', `${K1}:s3`, { comment_id: K1, user_id: 's3' }),
    op(6, 'resource_comment_likes', 'insert', `${K1}:s1`, { comment_id: K1, user_id: 's2' }),
  ], c), [true, true, false, true, false, false]);
  const { actions } = plan([op(1, 'resource_comments', 'insert', K1, comment()), op(2, 'resource_comment_likes', 'insert', `${K1}:s2`, { comment_id: K1, user_id: 's2' })]);
  assert.deepEqual(actions[1], { seq: 2, table: 'resource_comment_likes', kind: 'upsert', onConflict: 'comment_id,user_id', row: { comment_id: K1, user_id: 's2' } });
});

test('borrar: comentario, «me gusta» y nota; borrar lo que ya no existe es éxito', { skip }, () => {
  const { actions, results } = plan([
    op(1, 'resource_comments', 'delete', K1, comment()), op(2, 'resource_comment_likes', 'delete', `${K1}:s2`, { comment_id: K1, user_id: 's2' }), op(3, 'resource_notes', 'delete', N1, { student_id: 's1' }),
  ]);
  assert.deepEqual(results.map((r) => r.ok), [true, true, true]);
  assert.deepEqual(actions.map((a) => a.match), [{ id: K1 }, { comment_id: K1, user_id: 's2' }, { id: N1, student_id: 's1' }]);
});

test('notas: solo de estudiantes de la escuela, de un recurso de la escuela, sin groserías', { skip }, () => {
  const note = (patch = {}) => ({ lesson_id: LESSON, student_id: 's1', content: 'Repasar', ...patch });
  assert.deepEqual(okOf([op(1, 'resource_notes', 'insert', N1, note())]), [true]);
  for (const b of [note({ student_id: 'otro' }), note({ lesson_id: K2 }), note({ content: '' }), note({ content: 'x'.repeat(5001) }), note({ content: 'qué estúpido' })]) {
    assert.equal(okOf([op(1, 'resource_notes', 'insert', N1, b)])[0], false, JSON.stringify(b).slice(0, 60));
  }
});

test('operaciones o tablas raras no frenan al resto', { skip }, () => {
  const r = okOf([{ foo: 1 }, op(1, 'otra_tabla', 'insert', K1, {}), op(2, 'resource_notes', 'update', N1, {}), op(3, 'resource_comments', 'insert', K1, comment())]);
  assert.deepEqual(r, [false, false, true]);
});
