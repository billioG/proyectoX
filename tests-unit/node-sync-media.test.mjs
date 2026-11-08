// Reglas de la acción sign_media de node-sync (supabase/functions/node-sync/media.ts): qué direcciones puede pedir firmadas un nodo. Importa TypeScript: Node 22.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/media.ts');
} catch (e) {
  if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const BASE = 'https://abc.supabase.co';
const pub = (b, p) => `${BASE}/storage/v1/object/public/${b}/${p}`;
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('foto de perfil: el dueño sale del nombre <id>_<hora>.<ext>', { skip }, () => {
  const r = mod.parseMediaUrl(pub('profile-photos', `${A}_1730000000000.jpg`), BASE);
  assert.deepEqual(r.owner, { kind: 'user', id: A });
  assert.equal(r.bucket, 'profile-photos');
  assert.equal(mod.parseMediaUrl(pub('profile-photos', `${A.toUpperCase()}_1730000000000.PNG`), BASE).owner.id, A, 'el id se normaliza a minúsculas');
  assert.equal(mod.parseMediaUrl(pub('profile-photos', 'cualquiera.jpg'), BASE), null, 'sin dueño en el nombre no se firma');
  assert.equal(mod.parseMediaUrl(pub('profile-photos', `${A}_1730000000000.svg`), BASE), null);
  assert.equal(mod.parseMediaUrl(pub('profile-photos', `${A}/../x_1730000000000.jpg`), BASE), null);
});

test('adjunto de comentario y evidencia: el dueño es la primera carpeta; video de proyecto: dueño por la tabla projects', { skip }, () => {
  assert.deepEqual(mod.parseMediaUrl(pub('comment-attachments', `${A}/1730_foto.png`), BASE).owner, { kind: 'user', id: A });
  assert.equal(mod.parseMediaUrl(pub('comment-attachments', 'sin-dueno.png'), BASE), null);
  assert.deepEqual(mod.parseMediaUrl(pub('project-videos', `evidence/${A}/1730_a.jpg`), BASE).owner, { kind: 'user', id: A });
  assert.deepEqual(mod.parseMediaUrl(pub('project-videos', '1730000000000_ab12c'), BASE).owner, { kind: 'project' });
  assert.equal(mod.parseMediaUrl(pub('project-videos', 'otra/carpeta/x.mp4'), BASE), null, 'carpetas que no son evidencia no se aceptan');
});

test('lo que un nodo NO puede pedir: cursos, evidencias de docentes, otra nube, rutas raras, direcciones ya firmadas', { skip }, () => {
  for (const bad of [
    pub('course-content', 'lessons/a.mp4'), pub('teacher-evidence', `rocks/${A}/1.png`), 'https://otro.supabase.co/storage/v1/object/public/profile-photos/x',
    `${BASE}/storage/v1/object/sign/profile-photos/${A}_1730000000000.jpg?token=t`, pub('project-videos', '../secreto'), pub('project-videos', ''), 'javascript:alert(1)', 5, null,
    pub('project-videos', 'x'.repeat(700)),
  ]) assert.equal(mod.parseMediaUrl(bad, BASE), null, `debe rechazar ${String(bad).slice(0, 60)}`);
});

test('el pedido: lista no vacía, tope de 40, sin repetidas, y una sola dirección mala lo rechaza todo', { skip }, () => {
  const good = pub('project-videos', '1730000000000_ab12c');
  assert.equal(mod.validateSignRequest({ urls: [good, good] }, BASE).refs.length, 1);
  assert.equal(mod.validateSignRequest({ urls: [] }, BASE).ok, false);
  assert.equal(mod.validateSignRequest({}, BASE).ok, false);
  assert.equal(mod.validateSignRequest({ urls: 'x' }, BASE).ok, false);
  assert.equal(mod.validateSignRequest({ urls: Array.from({ length: 41 }, (_, i) => pub('project-videos', `173000000000${i}_ab12c`)) }, BASE).ok, false);
  assert.equal(mod.validateSignRequest({ urls: Array.from({ length: 40 }, (_, i) => pub('project-videos', `17300000000${String(i).padStart(2, '0')}_ab12c`)) }, BASE).ok, true);
  assert.equal(mod.validateSignRequest({ urls: [good, pub('course-content', 'a')] }, BASE).ok, false);
});
