// Medios privados: reconocer las direcciones públicas de los buckets privados y cambiarlas por direcciones firmadas (js/private-media-core.js). Sin navegador ni Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRIVATE_BUCKETS, SIGNED_TTL_SECONDS, createMediaResolver, parsePrivateUrl } from '../js/private-media-core.js';

const BASE = 'https://abc.supabase.co';
const pub = (bucket, path) => `${BASE}/storage/v1/object/public/${bucket}/${path}`;

test('solo reconoce direcciones públicas de los buckets privados de este proyecto', () => {
  assert.deepEqual(parsePrivateUrl(pub('profile-photos', 'u1_123.png'), BASE), { bucket: 'profile-photos', path: 'u1_123.png', download: null });
  assert.deepEqual(parsePrivateUrl(pub('project-videos', 'evidence/u1/17_a%20b.jpg'), BASE), { bucket: 'project-videos', path: 'evidence/u1/17_a b.jpg', download: null });
  assert.equal(parsePrivateUrl(pub('comment-attachments', 'u1/1_x.png') + '?t=1', BASE)?.path, 'u1/1_x.png');
  assert.equal(parsePrivateUrl(pub('teacher-evidence', 'rocks/u1/1_x.png') + '?download=modelo.stl', BASE)?.download, 'modelo.stl');
  // No son privados / no son de este proyecto / no son públicas.
  assert.equal(parsePrivateUrl(pub('course-content', 'lessons/a/b.mp4'), BASE), null, 'el bucket de cursos sigue público');
  assert.equal(parsePrivateUrl('https://otro.supabase.co/storage/v1/object/public/profile-photos/x.png', BASE), null);
  assert.equal(parsePrivateUrl(`${BASE}/storage/v1/object/sign/profile-photos/x.png?token=abc`, BASE), null, 'una dirección ya firmada no se vuelve a firmar');
  assert.equal(parsePrivateUrl('https://example.com/x.png', BASE), null);
  assert.equal(parsePrivateUrl(pub('profile-photos', '../secret'), BASE), null, 'sin salirse de la carpeta');
  assert.equal(parsePrivateUrl(null, BASE), null);
  assert.equal(parsePrivateUrl(pub('profile-photos', 'a.png'), ''), null);
  assert.deepEqual(PRIVATE_BUCKETS, ['profile-photos', 'project-videos', 'comment-attachments', 'teacher-evidence']);
});

function setup({ failFor = [], throwAll = false } = {}) {
  const calls = [];
  let t = 1_000_000;
  const r = createMediaResolver({
    supabaseUrl: BASE, batchMs: 0, now: () => t, schedule: (fn) => setTimeout(fn, 0),
    sign: async (bucket, paths, opts) => {
      calls.push({ bucket, paths: [...paths], opts });
      if (throwAll) throw new Error('sin red');
      return paths.map((p) => ({ path: p, signedUrl: failFor.includes(p) ? null : `${BASE}/storage/v1/object/sign/${bucket}/${p}?token=T${calls.length}` }));
    },
  });
  return { r, calls, advance: (ms) => { t += ms; } };
}

test('lo que no es un medio privado se devuelve tal cual, sin pedir firmas', async () => {
  const h = setup();
  assert.equal(await h.r.resolve('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(await h.r.resolve(pub('course-content', 'lessons/a.mp4')), pub('course-content', 'lessons/a.mp4'));
  assert.equal(await h.r.resolve(''), '');
  assert.equal(h.calls.length, 0);
});

test('un medio privado se cambia por su dirección firmada; las peticiones del mismo bucket viajan juntas', async () => {
  const h = setup();
  const [a, b, c] = await Promise.all([
    h.r.resolve(pub('profile-photos', 'a.png')), h.r.resolve(pub('profile-photos', 'b.png')), h.r.resolve(pub('project-videos', 'v.mp4')),
  ]);
  assert.match(a, /\/object\/sign\/profile-photos\/a\.png\?token=/);
  assert.match(b, /\/object\/sign\/profile-photos\/b\.png\?token=/);
  assert.match(c, /\/object\/sign\/project-videos\/v\.mp4\?token=/);
  assert.equal(h.calls.length, 2, 'una llamada por bucket, no una por foto');
  assert.deepEqual(h.calls.find((x) => x.bucket === 'profile-photos').paths.sort(), ['a.png', 'b.png']);
});

test('se guarda en memoria mientras la firma no esté por vencer; después se firma de nuevo', async () => {
  const h = setup();
  const url = pub('profile-photos', 'a.png');
  const first = await h.r.resolve(url);
  assert.equal(await h.r.resolve(url), first);
  assert.equal(h.calls.length, 1, 'segunda vez sale de la memoria');
  h.advance((SIGNED_TTL_SECONDS - 60) * 1000); // faltan 60 s: dentro del margen de renovación
  const renewed = await h.r.resolve(url);
  assert.equal(h.calls.length, 2);
  assert.notEqual(renewed, first);
});

test('si firmar falla (sin red, o el archivo no existe) se deja la dirección original: sigue sirviendo mientras el bucket sea público', async () => {
  const bad = setup({ throwAll: true });
  const url = pub('profile-photos', 'a.png');
  assert.equal(await bad.r.resolve(url), url);
  const missing = setup({ failFor: ['gone.png'] });
  assert.equal(await missing.r.resolve(pub('profile-photos', 'gone.png')), pub('profile-photos', 'gone.png'));
});

test('descargar con nombre pide la firma con la opción download, aparte de las demás', async () => {
  const h = setup();
  await h.r.resolve(pub('project-videos', 'm.stl') + '?download=modelo-3d.stl');
  await h.r.resolve(pub('project-videos', 'n.stl'));
  const withDl = h.calls.find((c) => c.opts.download);
  assert.deepEqual(withDl.paths, ['m.stl']);
  assert.equal(withDl.opts.download, 'modelo-3d.stl');
});

test('las migraciones de almacenamiento: paso 1 cierra el listado sin sesión; paso 2 hace privados solo los 4 buckets de personas', () => {
  const read = (f) => fs.readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');
  const one = read('storage-hardening.sql');
  assert.match(one, /private_media_select_authenticated/);
  assert.match(one, /for select to authenticated/);
  assert.match(one, /r\.cmd = 'SELECT' and \(r\.roles::text ~\* '\(public\|anon\)'\)/, 'solo borra lecturas sin sesión');
  assert.match(one, /REVISAR A MANO/, 'avisa de las políticas ALL en vez de tocarlas');
  assert.doesNotMatch(one, /drop policy[^;]*for insert|storage\.objects[^;]*delete/i, 'no toca escrituras ni borrados');
  assert.doesNotMatch(one, /image\/svg|text\/html|javascript/i, 'SVG, HTML y scripts no están entre los tipos permitidos');
  const two = read('storage-private-buckets.sql');
  assert.match(two, /set public = false/);
  assert.doesNotMatch(two.split('-- ---------- Deshacer')[0].replace(/--.*$/gm, ''), /course-content/, 'el bucket de cursos no se hace privado');
  for (const b of PRIVATE_BUCKETS) { assert.ok(one.includes(`'${b}'`) && two.includes(`'${b}'`), `${b} en ambos pasos`); }
});

test('la app carga el módulo, el service worker lo guarda y no cachea direcciones firmadas', () => {
  const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const sw = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.match(app, /import '\.\/private-media\.js'/);
  assert.match(sw, /'js\/private-media\.js'/);
  assert.match(sw, /'js\/private-media-core\.js'/);
  assert.match(sw, /if \(isSignedStorageGet\(request\.url\)\) return;/);
});

test('el service worker es JavaScript válido y reconoce las direcciones firmadas (un error aquí lo deja sin instalar)', async () => {
  const vm = await import('node:vm');
  const sw = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new vm.Script(sw, { filename: 'service-worker.js' }));
  const fn = /function isSignedStorageGet\(url\) \{[\s\S]*?\n\}/.exec(sw)[0];
  const isSigned = new Function(`${fn}; return isSignedStorageGet;`)();
  assert.equal(isSigned('https://abc.supabase.co/storage/v1/object/sign/profile-photos/a.png?token=t'), true);
  assert.equal(isSigned('https://abc.supabase.co/storage/v1/object/authenticated/profile-photos/a.png'), true);
  assert.equal(isSigned('https://abc.supabase.co/storage/v1/object/public/course-content/lessons/a.mp4'), false);
});
