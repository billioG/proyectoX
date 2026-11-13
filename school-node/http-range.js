// Rangos HTTP (cabecera Range: bytes=...) de forma segura, y envío de archivos por flujo sin dejar descriptores abiertos.
//
// Antes, serveFile pasaba start/end sin validar a fs.createReadStream: una sola petición con «Range: bytes=200-300» sobre un archivo de 100 bytes lanzaba
// ERR_OUT_OF_RANGE DESPUÉS de enviar las cabeceras, y el error caía en el catch general (ERR_HTTP_HEADERS_SENT) y tumbaba el proceso del nodo.

/**
 * @returns null si no hay rango utilizable (se sirve el archivo completo, como indica la norma para rangos mal formados o múltiples),
 *          { ok: false } si el rango es válido pero no se puede satisfacer (416), o { ok: true, start, end } (ambos incluidos, dentro del archivo).
 */
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (!Number.isSafeInteger(size) || size <= 0) return { ok: false };
  let start, end;
  if (m[1] === '') { // «-20»: los últimos 20 bytes
    const n = Number(m[2]);
    if (!Number.isSafeInteger(n) || n <= 0) return { ok: false };
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Number(m[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    if (m[2] !== '' && start > end) return null; // sintaxis inválida: se ignora
    if (start >= size) return { ok: false };
    end = Math.min(end, size - 1);
  }
  return { ok: true, start, end };
}

/** Manda un flujo de lectura a la respuesta; si el cliente corta o el archivo falla, cierra todo (sin fugas ni excepciones sueltas). */
export function pipeFile(res, stream) {
  stream.on('error', () => { if (!res.writableEnded) res.destroy(); });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
