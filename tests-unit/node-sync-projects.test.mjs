// Lógica pura de proyectos de la función de la nube node-sync (supabase/functions/node-sync/projects.ts).
// El módulo es TypeScript sin sintaxis no borrable: Node 22 lo importa directo. Con Node 20 se omite.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/projects.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /projects\.ts/.test(String(e.message))) throw e; // falta el archivo: eso SÍ es un fallo
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const MAX = 150 * 1024 * 1024;
const REF = '3f2b8c1e-1d4a-4c52-9a3e-0b6d7c8e9f10';
const DESC = 'Un robot que sigue una línea negra con dos sensores.'.padEnd(40, '.');
const pushed = (patch = {}) => ({ client_ref: REF, student_id: 's1', group_id: null, title: 'Robot seguidor', description: DESC, bimestre: 2, upload_ip: '192.168.3.20', cloud_path: '1730000000000_ab12cd34ef.mp4', created_at: '2026-10-31T12:00:00.000Z', ...patch });
const ctx = (over = {}) => ({
  nodeId: 'node-1',
  studentIds: new Set(['s1', 's2']),
  membersOf: new Map([[7, new Set(['s1'])], [9, new Set(['s2'])]]),
  objectSize: (p) => (p === '1730000000000_ab12cd34ef.mp4' ? 3_000_000 : null),
  ...over,
});
const bad = (patch, c) => { const r = mod.validateProjectPush(pushed(patch), c || ctx()); assert.equal(r.ok, false, JSON.stringify(patch)); return r.error; };

test('el módulo existe y exporta lo acordado', { skip }, () => {
  assert.equal(mod.MAX_PROJECT_BYTES, MAX);
  for (const f of ['validateUploadRequest', 'validateProjectPush', 'nextRoles']) assert.equal(typeof mod[f], 'function', f);
});

test('validateUploadRequest: extensiones permitidas, tamaño de 1 byte a 150 MB y ruta generada', { skip }, () => {
  const deps = { now: () => 1730000000000, rand: () => 'ab12cd34ef' };
  const ok = mod.validateUploadRequest({ client_ref: REF, ext: 'mp4', size: 3_000_000 }, deps);
  assert.deepEqual(ok, { ok: true, path: '1730000000000_ab12cd34ef.mp4' });
  assert.equal(mod.validateUploadRequest({ client_ref: REF, ext: 'glb', size: MAX }, deps).ok, true);
  assert.match(mod.validateUploadRequest({ client_ref: REF, ext: 'stl', size: 1 }).path, /^\d+_[a-z0-9]+\.stl$/);
  for (const [ext, size] of [['exe', 10], ['mp4', 0], ['mp4', MAX + 1], ['mp4', -5], ['mp4', 1.5], ['mp4', '10'], ['../x', 10], ['MP4', 10]]) {
    assert.equal(mod.validateUploadRequest({ client_ref: REF, ext, size }, deps).ok, false, `${ext} ${size}`);
  }
  assert.equal(mod.validateUploadRequest({ client_ref: 'no-es-uuid', ext: 'mp4', size: 10 }, deps).ok, false);
});

test('validateProjectPush: el caso correcto devuelve la fila a insertar', { skip }, () => {
  const r = mod.validateProjectPush(pushed({ group_id: 7 }), ctx());
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.row, {
    user_id: 's1', group_id: 7, title: 'Robot seguidor', description: DESC, bimestre: 2, upload_ip: '192.168.3.20',
    cloud_path: '1730000000000_ab12cd34ef.mp4', created_at: '2026-10-31T12:00:00.000Z',
    client_metadata: { source: 'nodo', node_ref: REF, node_id: 'node-1' },
  });
  assert.equal(mod.validateProjectPush(pushed(), ctx()).row.group_id, null, 'sin equipo = individual');
});

test('validateProjectPush: estudiante de otra escuela, equipo ajeno o sin ser miembro', { skip }, () => {
  assert.match(bad({ student_id: 'otro-colegio' }), /estudiante/i);
  assert.match(bad({ group_id: 9 }), /miembro/i);            // s1 no es miembro del equipo 9
  assert.match(bad({ group_id: 123 }), /miembro/i);          // equipo que no existe en la escuela
  assert.match(bad({ group_id: 'x' }), /equipo/i);
});

test('validateProjectPush: ruta del archivo con forma inválida o inexistente en Storage', { skip }, () => {
  for (const cloud_path of ['../1730000000000_ab12cd34ef.mp4', '1730000000000_ab12cd34ef.exe', 'otra/ruta.mp4', '', 'x_y.mp4', null]) {
    assert.match(bad({ cloud_path }), /archivo/i, String(cloud_path));
  }
  assert.match(bad({ cloud_path: '1730000000001_zzzzzzzzzz.mp4' }), /no está|existe/i); // objectSize → null
  assert.match(bad({}, ctx({ objectSize: () => MAX + 1 })), /150 MB/);
  assert.equal(mod.validateProjectPush(pushed(), ctx({ objectSize: () => MAX })).ok, true);
});

test('validateProjectPush: título, descripción, bimestre y referencia se validan otra vez', { skip }, () => {
  assert.match(bad({ title: 'abcd' }), /título/i);
  assert.match(bad({ title: 'x'.repeat(121) }), /título/i);
  assert.match(bad({ description: 'x'.repeat(39) }), /descripción/i);
  assert.match(bad({ description: 'x'.repeat(2001) }), /descripción/i);
  assert.match(bad({ bimestre: 0 }), /bimestre/i);
  assert.match(bad({ bimestre: 5 }), /bimestre/i);
  assert.match(bad({ client_ref: 'xyz' }), /referencia/i);
  // El HTML se guarda como texto: la app lo escapa al mostrarlo.
  assert.equal(mod.validateProjectPush(pushed({ title: '<img src=x onerror=1>' }), ctx()).row.title, '<img src=x onerror=1>');
});

test('nextRoles: rota planner → maker → speaker → helper → planner', { skip }, () => {
  const members = [{ id: 1, role: 'planner' }, { id: 2, role: 'maker' }, { id: 3, role: 'speaker' }, { id: 4, role: 'helper' }];
  assert.deepEqual(mod.nextRoles(members), [{ id: 1, role: 'maker' }, { id: 2, role: 'speaker' }, { id: 3, role: 'helper' }, { id: 4, role: 'planner' }]);
  assert.deepEqual(mod.nextRoles([{ id: 9, role: 'maker' }, { id: 8, role: 'planner' }]), [{ id: 8, role: 'maker' }, { id: 9, role: 'speaker' }]);
  assert.deepEqual(mod.nextRoles([{ id: 1, role: 'planner' }]), [], 'con menos de 2 miembros no se rota');
  assert.deepEqual(mod.nextRoles([]), []);
});
