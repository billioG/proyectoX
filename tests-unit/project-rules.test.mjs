// Reglas de validación de un proyecto subido desde el nodo (school-node/project-rules.js).
// Son las mismas de la nube: título 5-120, descripción 40-2000, bimestre 1-4, un archivo de hasta 150 MB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT_LIMITS, classifyFile, validateProjectDraft } from '../school-node/project-rules.js';

const MAX = 150 * 1024 * 1024;
const DESC = 'Un robot que sigue una línea negra con dos sensores.'.padEnd(40, '.');
const base = { title: 'Robot seguidor', description: DESC, bimestre: 2, filename: 'robot.mp4', size: 3_000_000 };
const ctx = { memberGroupIds: [7, 9] };
const bad = (patch, c = ctx) => {
  const r = validateProjectDraft({ ...base, ...patch }, c);
  assert.equal(r.ok, false, JSON.stringify(patch));
  return r.error;
};
const good = (patch = {}, c = ctx) => {
  const r = validateProjectDraft({ ...base, ...patch }, c);
  assert.equal(r.ok, true, r.error);
  return r.value;
};

test('los límites son los de la nube', () => {
  assert.deepEqual(PROJECT_LIMITS, { titleMin: 5, titleMax: 120, descMin: 40, descMax: 2000, maxBytes: MAX, maxPendingPerStudent: 5, minFreeDiskMB: 2048, keepSyncedDays: 7 });
});

test('classifyFile: videos y modelos 3D permitidos (sin importar mayúsculas)', () => {
  assert.deepEqual(classifyFile('Robot.MP4'), { kind: 'video', ext: 'mp4', mime: 'video/mp4' });
  assert.equal(classifyFile('a.mov').mime, 'video/quicktime');
  assert.deepEqual(classifyFile('pieza.GLB'), { kind: 'model3d', ext: 'glb', mime: 'model/gltf-binary' });
  for (const f of ['m4v', 'webm', '3gp', 'avi', 'mkv']) assert.equal(classifyFile('x.' + f).kind, 'video', f);
  for (const f of ['stl', 'obj']) assert.equal(classifyFile('x.' + f).kind, 'model3d', f);
});

test('classifyFile: lo no permitido devuelve null', () => {
  for (const f of ['virus.exe', 'video', 'a.mp4.exe', 'foto.jpg', '.mp4x', '', null, undefined]) assert.equal(classifyFile(f), null, String(f));
});

test('título: entre 5 y 120 caracteres', () => {
  const msg = 'El título debe tener entre 5 y 120 caracteres.';
  assert.equal(bad({ title: 'abcd' }), msg);
  assert.equal(bad({ title: 'x'.repeat(121) }), msg);
  assert.equal(bad({ title: '     ' }), msg);
  assert.equal(good({ title: 'abcde' }).title, 'abcde');
  assert.equal(good({ title: 'x'.repeat(120) }).title.length, 120);
});

test('descripción: entre 40 y 2000 caracteres', () => {
  const msg = 'La descripción debe tener entre 40 y 2000 caracteres.';
  assert.equal(bad({ description: 'x'.repeat(39) }), msg);
  assert.equal(bad({ description: 'x'.repeat(2001) }), msg);
  assert.equal(good({ description: 'x'.repeat(40) }).description.length, 40);
  assert.equal(good({ description: 'x'.repeat(2000) }).description.length, 2000);
});

test('bimestre: entero de 1 a 4 (acepta texto numérico)', () => {
  const msg = 'El bimestre debe ser de 1 a 4.';
  for (const b of [0, 5, 'x', null, 2.5]) assert.equal(bad({ bimestre: b }), msg, String(b));
  assert.equal(good({ bimestre: '3' }).bimestre, 3);
});

test('archivo: extensión permitida y tamaño de 1 byte a 150 MB', () => {
  assert.equal(bad({ filename: 'virus.exe' }), 'El archivo debe ser un video (mp4, mov, m4v, webm, 3gp, avi, mkv) o un modelo 3D (stl, obj, glb).');
  const msg = 'El archivo debe pesar entre 1 byte y 150 MB.';
  for (const s of [0, -1, MAX + 1, 'x', 1.5]) assert.equal(bad({ size: s }), msg, String(s));
  assert.equal(good({ size: MAX }).size, MAX);
  assert.equal(good({ size: 1 }).size, 1);
  assert.equal(bad({ size: 2_000_000 }, { memberGroupIds: [], maxBytes: 1_000_000 }), msg); // el contexto puede bajar el máximo
});

test('equipo: solo uno al que pertenece; sin equipo = null', () => {
  assert.equal(bad({ group_id: 99 }), 'Ese equipo no es tuyo.');
  assert.equal(good({ group_id: 7 }).group_id, 7);
  assert.equal(good({ group_id: '9' }).group_id, 9);
  assert.equal(good().group_id, null);
  assert.equal(good({ group_id: '' }).group_id, null);
});

test('el HTML del título se conserva como texto y los caracteres de control pasan a espacio', () => {
  assert.equal(good({ title: '  <img onerror=x>  ' }).title, '<img onerror=x>');
  assert.equal(good({ title: 'Robot\u0000\nseguidor' }).title, 'Robot seguidor');
  assert.equal(good({ description: 'a'.repeat(30) + '\n\n' + 'b'.repeat(20) }).description, 'a'.repeat(30) + ' ' + 'b'.repeat(20));
});

test('el valor devuelto trae el tipo de archivo', () => {
  assert.deepEqual(good({ filename: 'Pieza.STL', group_id: 7 }), { title: 'Robot seguidor', description: DESC, bimestre: 2, group_id: 7, kind: 'model3d', ext: 'stl', mime: 'model/stl', size: 3_000_000 });
});
