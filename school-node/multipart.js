// Lee UN archivo de un cuerpo multipart/form-data (lo que manda supabase-js al subir un Blob a Storage) en streaming:
// nunca junta el archivo en memoria, solo guarda la cola necesaria para reconocer el borde entre trozos.
// El cuerpo trae un campo `cacheControl` y el archivo (parte con `filename=`); lo demás se ignora.

const fail = (status, message) => Object.assign(new Error(message), { status });
const MAX_FIELD_BYTES = 4096;
const MAX_HEADER_BYTES = 8192;

/**
 * @param stream async iterable de Buffers (el pedido HTTP)
 * @param contentType cabecera Content-Type completa (lleva el borde)
 * @param opts { maxBytes, sink: { write(chunk): void | Promise } }
 * @returns { size } bytes del archivo
 */
export async function readMultipartFile(stream, contentType, { maxBytes, sink }) {
  const m = /^multipart\/form-data\s*;.*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(String(contentType || ''));
  if (!m) throw fail(400, 'Se esperaba un cuerpo multipart/form-data.');
  const delim = Buffer.from(`\r\n--${m[1] || m[2]}`);
  let buf = Buffer.from('\r\n'); // el primer borde no lleva salto de línea delante: se lo ponemos
  let state = 'preamble'; // preamble -> after -> headers -> body -> after ... -> done
  let size = 0, sawFile = false, isFile = false, fieldBytes = 0;

  const emit = async (chunk) => {
    if (!chunk.length) return;
    if (isFile) {
      size += chunk.length;
      if (size > maxBytes) throw fail(413, 'El archivo es más grande de lo permitido.');
      await sink.write(chunk);
    } else {
      fieldBytes += chunk.length;
      if (fieldBytes > MAX_FIELD_BYTES) throw fail(400, 'Cuerpo multipart dañado.');
    }
  };

  for await (const chunk of stream) {
    if (state === 'done') continue; // se sigue leyendo hasta el final para poder contestar
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (state === 'preamble') {
        const i = buf.indexOf(delim);
        if (i < 0) { buf = buf.subarray(Math.max(0, buf.length - delim.length + 1)); break; }
        buf = buf.subarray(i + delim.length);
        state = 'after';
      } else if (state === 'after') {
        if (buf.length < 2) break;
        if (buf[0] === 45 && buf[1] === 45) { state = 'done'; buf = Buffer.alloc(0); break; }
        if (buf[0] !== 13 || buf[1] !== 10) throw fail(400, 'Cuerpo multipart dañado.');
        buf = buf.subarray(2);
        state = 'headers';
      } else if (state === 'headers') {
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) { if (buf.length > MAX_HEADER_BYTES) throw fail(400, 'Cuerpo multipart dañado.'); break; }
        isFile = /filename=/i.test(buf.subarray(0, i).toString('latin1'));
        fieldBytes = 0;
        buf = buf.subarray(i + 4);
        if (isFile) {
          if (sawFile) throw fail(400, 'Solo se acepta un archivo por subida.');
          sawFile = true;
        }
        state = 'body';
      } else { // body
        const i = buf.indexOf(delim);
        if (i >= 0) {
          await emit(buf.subarray(0, i));
          buf = buf.subarray(i + delim.length);
          state = 'after';
        } else {
          const keep = delim.length - 1; // lo último podría ser el comienzo de un borde partido entre trozos
          if (buf.length > keep) { await emit(buf.subarray(0, buf.length - keep)); buf = buf.subarray(buf.length - keep); }
          break;
        }
      }
    }
  }
  if (state !== 'done') throw fail(400, 'El archivo llegó incompleto.');
  if (!sawFile || size === 0) throw fail(400, 'El archivo está vacío.');
  return { size };
}
