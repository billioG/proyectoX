// Subida de archivos de cursos al nodo (school-node/content-upload.js, multipart.js): validación de rutas y lectura del
// multipart que manda supabase-js, sin cargar el archivo en memoria. Lógica pura: corre con cualquier Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { validateObjectPath } from '../school-node/content-upload.js';
import { readMultipartFile } from '../school-node/multipart.js';

const ID = '3f2b8c1e-5d4a-4e7b-9a10-123456789abc';

test('rutas válidas: lessons/<uuid>/archivo y subcarpetas de un paquete', () => {
  for (const ok of [`lessons/${ID}/video.mp4`, `lessons/${ID}/Guia-1_v2.pdf`, `lessons/${ID}/assets/img/logo.PNG`, `lessons/${ID}/index.html`,
    `lessons/${ID}/Guía de clase 1 (final).pdf`, `lessons/${ID}/H5P.Foo-1.2/css/estilo.css`, `lessons/${ID}/libs/jquery.min.js`]) {
    assert.equal(validateObjectPath(ok), ok, ok);
  }
});

test('rutas peligrosas o raras se rechazan', () => {
  const bad = [
    '', '/lessons/' + ID + '/a.pdf', `lessons/${ID}/../x.pdf`, `lessons/${ID}/./x.pdf`, `lessons/${ID}//x.pdf`, `lessons\\${ID}\\x.pdf`,
    `lessons/otro/x.pdf`, `lessons/${ID}`, `lessons/${ID}/`, `projects/${ID}/x.pdf`, `lessons/${ID}/.oculto.pdf`, `lessons/${ID}/x.exe`,
    `lessons/${ID}/x.php`, `lessons/${ID}/sin-extension`, `lessons/${ID}/a:b.pdf`, `lessons/${ID}/a*b.pdf`, `lessons/${ID}/nombre.pdf.`, `lessons/${ID}/trailing .pdf `, `lessons/${ID}/%2e%2e/x.pdf`, `lessons/${ID}/x\u0000.pdf`,
    `lessons/${ID}/${'a'.repeat(300)}.pdf`, `lessons/${ID}/` + Array(14).fill('d').join('/') + '/x.pdf',
  ];
  for (const b of bad) assert.equal(validateObjectPath(b), null, JSON.stringify(b));
  assert.equal(validateObjectPath(null), null);
  assert.equal(validateObjectPath(42), null);
});

// Arma el cuerpo EXACTO que manda supabase-js (FormData: cacheControl + archivo) y lo entrega en trozos del tamaño pedido.
async function multipart(bytes, filename = 'blob') {
  const fd = new FormData();
  fd.append('cacheControl', '3600');
  fd.append('', new File([bytes], filename, { type: 'application/pdf' }));
  const res = new Response(fd);
  return { contentType: res.headers.get('content-type'), body: Buffer.from(await res.arrayBuffer()) };
}
const chunked = (buf, n) => Readable.from((function* () { for (let i = 0; i < buf.length; i += n) yield buf.subarray(i, i + n); })());
const collect = () => { const parts = []; return { parts, sink: { write: (c) => { parts.push(Buffer.from(c)); } } }; };

test('lee el archivo del multipart igual sin importar cómo lleguen los trozos, aunque el contenido imite un borde', async () => {
  const tricky = Buffer.concat([Buffer.from('%PDF-1.4\r\n--no-es-el-borde\r\n--\r\n'), Buffer.alloc(5000, 7), Buffer.from('\r\n--'), Buffer.from([0, 255, 13, 10, 45, 45])]);
  const { contentType, body } = await multipart(tricky, 'doc.pdf');
  for (const n of [1, 2, 7, 64, 1000, body.length]) {
    const { parts, sink } = collect();
    const r = await readMultipartFile(chunked(body, n), contentType, { maxBytes: 1e6, sink });
    assert.equal(Buffer.concat(parts).equals(tricky), true, `trozos de ${n}`);
    assert.equal(r.size, tricky.length);
  }
});

test('un archivo vacío, un cuerpo cortado y uno que pasa del tope se rechazan con un error claro', async () => {
  const empty = await multipart(Buffer.alloc(0));
  await assert.rejects(readMultipartFile(chunked(empty.body, 50), empty.contentType, { maxBytes: 100, sink: collect().sink }), /vac/i);
  const big = await multipart(Buffer.alloc(2000, 1));
  await assert.rejects(readMultipartFile(chunked(big.body, 300), big.contentType, { maxBytes: 1000, sink: collect().sink }), (e) => e.status === 413);
  await assert.rejects(readMultipartFile(chunked(big.body.subarray(0, big.body.length - 40), 300), big.contentType, { maxBytes: 1e6, sink: collect().sink }), /incompleto/i);
  await assert.rejects(readMultipartFile(chunked(Buffer.from('hola'), 2), 'text/plain', { maxBytes: 10, sink: collect().sink }), /multipart/i);
});
