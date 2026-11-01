// Sincronización de la capa local compatible con Supabase.
//   Sube: lo que la app escribió en el nodo (la bandeja). En esta etapa la app solo escribe avances de lecciones, que
//         viajan por el mismo camino que ya valida la nube (push.completions: solo estudiantes de la escuela, mejor nota).
//   Baja: `tables` reemplaza la réplica, sin pisar lo que sigue pendiente de subir, y `class_verifiers` trae los
//         verificadores de contraseña de clase del login.
import { SCHEMA } from './schema.js';

/** Lo pendiente de la bandeja, listo para el push. `seqs` = todo lo que este push cubre (incluso lo que no viaja). */
export function restPush(store) {
  const completions = [];
  const seqs = [];
  const rpc = [];
  for (const e of store.pending()) {
    // Funciones de la app (Práctica): la nube confirma cada una por su seq; mientras no, siguen en la bandeja.
    if (e.table === '_rpc') { rpc.push({ seq: e.seq, fn: e.op, student_id: e.row.student_id, args: e.row.args }); continue; }
    seqs.push(e.seq);
    // El borrado de un avance no viaja a la nube (el progreso solo sube): se da por atendido.
    if (e.table === 'lesson_completions' && e.op !== 'delete' && e.row.lesson_id && e.row.student_id) {
      completions.push({ lesson_id: e.row.lesson_id, student_id: e.row.student_id, score: e.row.score ?? null, status: e.row.status ?? 'completed' });
    }
  }
  return { completions, seqs, rpc };
}

/** Confirma lo que se subió y reemplaza la réplica con lo que bajó. Una nube anterior que no manda `tables` no borra nada. */
export function applyRestPull(store, data, pushed = {}) {
  if (Array.isArray(pushed.rest_seqs) && pushed.rest_seqs.length) store.ack(pushed.rest_seqs);
  // Funciones: solo lo que la nube aplicó, o rechazó de forma definitiva. Un error pasajero, o una nube anterior que no
  // responde applied.rpc, lo deja para el próximo sync.
  if (Array.isArray(pushed.rpc) && pushed.rpc.length) {
    const sent = new Set(pushed.rpc.map((e) => e.seq));
    const done = new Set(Array.isArray(data.applied?.rpc) ? data.applied.rpc : []);
    for (const e of Array.isArray(data.rpc_errors) ? data.rpc_errors : []) if (e && e.permanent === true) done.add(e.seq);
    store.ack([...done].filter((seq) => sent.has(seq)));
  }
  if (data.tables && typeof data.tables === 'object') {
    store.transaction(() => {
      for (const [table, rows] of Object.entries(data.tables)) {
        if (SCHEMA[table] && Array.isArray(rows)) store.replaceBase(table, rows);
      }
    });
  }
  if (Array.isArray(data.class_verifiers)) store.setClassVerifiers(data.class_verifiers);
}
