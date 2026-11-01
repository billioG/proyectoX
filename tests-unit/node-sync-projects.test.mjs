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

// ---- Fichas de proyectos que baja el nodo (Inicio sin internet) ----
const STUDENTS = [
  { id: 's1', full_name: 'Ana Pérez', grade: 'Primero', section: 'A' },
  { id: 's2', full_name: 'Beto Gómez', grade: 'Primero', section: 'A' },
];
const GROUPS = [{ id: 7, name: 'Equipo Sol' }];
const row = (patch = {}) => ({
  id: 'p1', user_id: 's1', group_id: null, title: 'Robot seguidor', description: DESC, bimestre: 2, score: 80, votes: 3,
  created_at: '2026-10-30T10:00:00Z', video_url: 'https://x.supabase.co/storage/v1/object/public/project-videos/1730000000000_ab12cd34ef.mp4',
  evaluations: [], ...patch,
});

test('buildFeedProjects: deja solo campos permitidos y nunca video_url ni rutas de Storage', { skip }, () => {
  const out = mod.buildFeedProjects([row()], STUDENTS, GROUPS);
  assert.equal(out.length, 1);
  assert.equal('video_url' in out[0], false);
  assert.equal('evaluations' in out[0], false);
  assert.doesNotMatch(JSON.stringify(out), /storage|project-videos|1730000000000|ab12cd34ef/);
  assert.deepEqual(Object.keys(out[0]).sort(), ['author_name', 'bimestre', 'created_at', 'description', 'feedback', 'grade', 'group_id', 'group_name', 'id', 'kind', 'score', 'section', 'title', 'user_id', 'votes']);
});

test('buildFeedProjects: kind sale de la extensión (stl/obj/glb = model, el resto = video)', { skip }, () => {
  const url = (ext) => `https://x/storage/v1/object/public/project-videos/1_ab.${ext}`;
  const out = mod.buildFeedProjects([
    row({ id: 'a', video_url: url('glb') }), row({ id: 'b', video_url: url('STL') }), row({ id: 'c', video_url: url('obj') }),
    row({ id: 'd', video_url: url('mp4') }), row({ id: 'e', video_url: null }),
  ], STUDENTS, GROUPS);
  const kinds = Object.fromEntries(out.map(p => [p.id, p.kind]));
  assert.deepEqual(kinds, { a: 'model', b: 'model', c: 'model', d: 'video', e: 'video' });
});

test('buildFeedProjects: autor, clase y equipo salen de los estudiantes y equipos; usuarios ajenos al nodo se descartan', { skip }, () => {
  const out = mod.buildFeedProjects([row({ id: 'a', group_id: 7 }), row({ id: 'b', user_id: 'otro-colegio' })], STUDENTS, GROUPS);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].author_name, out[0].grade, out[0].section, out[0].group_name], ['Ana Pérez', 'Primero', 'A', 'Equipo Sol']);
  assert.equal(out[0].group_id, 7);
});

test('buildFeedProjects: feedback es la última evaluación con texto (máx. 1000) o null', { skip }, () => {
  const out = mod.buildFeedProjects([
    row({ id: 'a', evaluations: [{ total_score: 70, feedback: 'Primera' }, { total_score: 80, feedback: '  Muy bien  ' }, { total_score: 80, feedback: '' }] }),
    row({ id: 'b', evaluations: [] }),
    row({ id: 'c', evaluations: [{ feedback: 'x'.repeat(1500) }] }),
    row({ id: 'd', evaluations: null }),
  ], STUDENTS, GROUPS);
  const by = Object.fromEntries(out.map(p => [p.id, p.feedback]));
  assert.equal(by.a, 'Muy bien');
  assert.equal(by.b, null);
  assert.equal(by.c.length, 1000);
  assert.equal(by.d, null);
});

test('buildFeedProjects: ordena por fecha descendente y corta en FEED_LIMIT', { skip }, () => {
  assert.equal(mod.FEED_LIMIT, 300);
  const rows = Array.from({ length: 301 }, (_, i) => row({ id: `p${i}`, created_at: new Date(Date.UTC(2026, 0, 1) + i * 86400_000).toISOString() }));
  const out = mod.buildFeedProjects(rows, STUDENTS, GROUPS);
  assert.equal(out.length, 300);
  assert.equal(out[0].id, 'p300');
  assert.equal(out[299].id, 'p1');
});
