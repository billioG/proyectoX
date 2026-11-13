/**
 * LÓGICA PURA DE «AVISOS LEÍDOS» (sin DOM ni Supabase: se prueba con Node, tests-unit/announcements-logic.test.mjs).
 * La usa js/announcements.js al abrir la bandeja: decide qué avisos hay que marcar y cuál es el conjunto de leídos después.
 */

/** Ids de los avisos aún no leídos (sin repetir, en el orden recibido). */
export function announcementIdsToMark(announcements, readIds) {
  const read = readIds instanceof Set ? readIds : new Set(readIds || []);
  const out = [];
  const seen = new Set();
  for (const a of announcements || []) {
    const id = a && a.id;
    if (id == null || read.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Filas para el upsert de announcement_reads. */
export function announcementReadRows(ids, userId) {
  return (ids || []).map((id) => ({ announcement_id: id, user_id: userId }));
}

/**
 * Nuevo conjunto de leídos tras intentar guardar. Si el guardado falló (error), el conjunto NO cambia:
 * no se da por leído algo que el servidor no guardó. Nunca modifica el Set recibido.
 */
export function readIdsAfterMark(readIds, markedIds, error) {
  const next = new Set(readIds || []);
  if (error) return next;
  for (const id of markedIds || []) next.add(id);
  return next;
}
