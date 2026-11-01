// Lógica pura de las evaluaciones que hace un docente en un nodo (supabase/functions/node-sync/evaluations.ts).
// TypeScript sin sintaxis no borrable: Node 22 lo importa directo. Con Node 20 se omite.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/evaluations.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /evaluations\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e; // en Node 22 falta el archivo: fallo real
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const REF = '3f2b8c1e-1d4a-4c52-9a3e-0b6d7c8e9f10';
const ctx = (over = {}) => ({ teacherIds: new Set(['t1', 't2']), ...over });
const ev = (patch = {}) => ({
  teacher_id: 't1', project_id: 27, node_ref: null,
  creativity_score: 15, clarity_score: 10, functionality_score: 20, teamwork_score: 0, social_impact_score: 5,
  feedback: 'Muy buen trabajo.', ...patch,
});
const bad = (patch, c) => { const r = mod.validateEvaluationEvent(ev(patch), c || ctx()); assert.equal(r.ok, false, JSON.stringify(patch)); assert.ok(r.error); };

test('constantes acordadas', { skip }, () => {
  assert.deepEqual([...mod.CRITERIA], ['creativity', 'clarity', 'functionality', 'teamwork', 'social_impact']);
  assert.equal(mod.MAX_CRITERION, 20);
  assert.equal(mod.MAX_FEEDBACK, 1000);
});

test('validateEvaluationEvent acepta una evaluación válida y RECALCULA el total (no confía en el del nodo)', { skip }, () => {
  const r = mod.validateEvaluationEvent(ev({ total_score: 999 }), ctx());
  assert.equal(r.ok, true);
  assert.deepEqual(r.event, {
    teacher_id: 't1', project_id: 27, node_ref: null,
    scores: { creativity_score: 15, clarity_score: 10, functionality_score: 20, teamwork_score: 0, social_impact_score: 5 },
    total_score: 50, feedback: 'Muy buen trabajo.',
  });
});

test('un proyecto aún no publicado se identifica por node_ref (uuid) en vez de project_id', { skip }, () => {
  const r = mod.validateEvaluationEvent(ev({ project_id: null, node_ref: REF }), ctx());
  assert.equal(r.ok, true);
  assert.deepEqual([r.event.project_id, r.event.node_ref], [null, REF]);
});

test('exige exactamente uno de project_id o node_ref', { skip }, () => {
  bad({ project_id: null, node_ref: null });
  bad({ project_id: 27, node_ref: REF });
  bad({ project_id: null, node_ref: 'no-es-uuid' });
  bad({ project_id: 0 });
  bad({ project_id: 1.5 });
  bad({ project_id: '27' });
  bad({ project_id: 2147483648 });
});

test('rechaza docente ajeno al nodo y notas fuera de rango, no enteras o de otro tipo', { skip }, () => {
  bad({ teacher_id: 'ajeno' });
  bad({ teacher_id: 7 });
  bad({ creativity_score: 21 });
  bad({ clarity_score: -1 });
  bad({ functionality_score: 10.5 });
  bad({ teamwork_score: '10' });
  bad({ social_impact_score: null });
  bad({ social_impact_score: undefined });
  assert.equal(mod.validateEvaluationEvent(ev({ creativity_score: 0, clarity_score: 0, functionality_score: 0, teamwork_score: 0, social_impact_score: 0 }), ctx()).event.total_score, 0);
  assert.equal(mod.validateEvaluationEvent(ev({ creativity_score: 20, clarity_score: 20, functionality_score: 20, teamwork_score: 20, social_impact_score: 20 }), ctx()).event.total_score, 100);
});

test('la observación se limpia (caracteres de control) y se corta a 1000; vacía o ausente es cadena vacía; otro tipo se rechaza', { skip }, () => {
  assert.equal(mod.validateEvaluationEvent(ev({ feedback: '  Bien\u0000hecho\n  ' }), ctx()).event.feedback, 'Bien hecho');
  assert.equal(mod.validateEvaluationEvent(ev({ feedback: 'x'.repeat(1500) }), ctx()).event.feedback.length, 1000);
  assert.equal(mod.validateEvaluationEvent(ev({ feedback: '' }), ctx()).event.feedback, '');
  assert.equal(mod.validateEvaluationEvent(ev({ feedback: undefined }), ctx()).event.feedback, '');
  bad({ feedback: 12 });
  // El HTML no se toca: la app lo muestra siempre escapado.
  assert.equal(mod.validateEvaluationEvent(ev({ feedback: '<b>hola</b>' }), ctx()).event.feedback, '<b>hola</b>');
});

test('buildTeacherList deja solo docentes con clases asignadas en la escuela, sin datos sensibles', { skip }, () => {
  const out = mod.buildTeacherList(
    [{ id: 't1', full_name: 'Marta', role: 'docente', email: 'm@x.com' }, { id: 't2', full_name: 'Raúl', role: 'docente' }, { id: 't3', full_name: 'Sin clases', role: 'docente' }, { id: 'a1', full_name: 'Admin', role: 'admin' }],
    [
      { teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' },
      { teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'B' },
      { teacher_id: 't1', school_code: 'ESC9', grade: 'Tercero', section: 'A' }, // otra escuela
      { teacher_id: 't2', school_code: 'ESC1', grade: 'Segundo', section: 'A' },
      { teacher_id: 'a1', school_code: 'ESC1', grade: 'Primero', section: 'A' },  // el admin no entra
    ],
    'ESC1',
  );
  assert.deepEqual(out, [
    { id: 't1', full_name: 'Marta', assignments: [{ grade: 'Primero', section: 'A' }, { grade: 'Primero', section: 'B' }] },
    { id: 't2', full_name: 'Raúl', assignments: [{ grade: 'Segundo', section: 'A' }] },
  ]);
  assert.doesNotMatch(JSON.stringify(out), /email|role|ESC9/);
});

test('shapeEvaluations deja solo los campos acordados', { skip }, () => {
  const out = mod.shapeEvaluations([
    { project_id: 27, teacher_id: 't1', total_score: 50, creativity_score: 15, clarity_score: 10, functionality_score: 20, teamwork_score: 0, social_impact_score: 5, feedback: 'Bien', secreto: 'x', id: 9 },
  ]);
  assert.deepEqual(out, [{ project_id: 27, teacher_id: 't1', total_score: 50, creativity_score: 15, clarity_score: 10, functionality_score: 20, teamwork_score: 0, social_impact_score: 5, feedback: 'Bien' }]);
});
