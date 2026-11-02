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
  const evaluations = [];
  const announcements = [];
  const reads = new Map(); // 'aviso|usuario' -> lectura (una sola por par: la última)
  for (const e of store.pending()) {
    // Funciones de la app (Práctica): la nube confirma cada una por su seq; mientras no, siguen en la bandeja.
    // Evaluaciones de proyectos: viajan en el formato que la nube ya valida (push.evaluations), con su seq como clave.
    if (e.table === '_rpc' && e.op === 'sync_save_evaluation') {
      evaluations.push({ key: `rest:${e.seq}`, teacher_id: e.row.teacher_id, project_id: e.row.args.project_id, node_ref: null, ...Object.fromEntries(Object.entries(e.row.args).filter(([k]) => k.endsWith('_score'))), feedback: e.row.args.feedback });
      continue;
    }
    if (e.table === '_rpc') { rpc.push({ seq: e.seq, fn: e.op, student_id: e.row.student_id, args: e.row.args }); continue; }
    // Avisos y lecturas: la nube confirma cada uno (por id, o por aviso|usuario); mientras no, siguen en la bandeja.
    if (e.table === 'announcements') { announcements.push({ ...e.row, seq: e.seq }); continue; }
    if (e.table === 'announcement_reads') {
      const k = `${e.row.announcement_id}|${e.row.user_id}`;
      reads.set(k, { announcement_id: e.row.announcement_id, user_id: e.row.user_id, read_at: e.row.read_at, seqs: [...(reads.get(k)?.seqs || []), e.seq] });
      continue;
    }
    seqs.push(e.seq);
    // El borrado de un avance no viaja a la nube (el progreso solo sube): se da por atendido.
    if (e.table === 'lesson_completions' && e.op !== 'delete' && e.row.lesson_id && e.row.student_id) {
      completions.push({ lesson_id: e.row.lesson_id, student_id: e.row.student_id, score: e.row.score ?? null, status: e.row.status ?? 'completed' });
    }
  }
  return { completions, seqs, rpc, evaluations, announcements, announcement_reads: [...reads.values()] };
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
  // Avisos y lecturas: se confirman por id / por aviso|usuario, o se rechazan para siempre.
  const doneAnn = new Set(Array.isArray(data.applied?.announcements) ? data.applied.announcements : []);
  for (const e of Array.isArray(data.announcement_errors) ? data.announcement_errors : []) if (e && e.permanent === true) doneAnn.add(e.id);
  const doneRead = new Set(Array.isArray(data.applied?.announcement_reads) ? data.applied.announcement_reads : []);
  for (const e of Array.isArray(data.announcement_read_errors) ? data.announcement_read_errors : []) if (e && e.permanent === true) doneRead.add(e.key);
  store.ack([
    ...(pushed.announcements || []).filter((a) => doneAnn.has(a.id)).map((a) => a.seq),
    ...(pushed.announcement_reads || []).filter((r) => doneRead.has(`${r.announcement_id}|${r.user_id}`)).flatMap((r) => r.seqs),
  ]);
  // Evaluaciones: la nube confirma cada una por su clave (applied.evaluations) o la rechaza para siempre (evaluation_errors).
  const sentEvals = (pushed.evaluations || []).map((e) => e?.key).filter((k) => typeof k === 'string' && /^rest:\d+$/.test(k));
  if (sentEvals.length) {
    const done = new Set(Array.isArray(data.applied?.evaluations) ? data.applied.evaluations : []);
    for (const e of Array.isArray(data.evaluation_errors) ? data.evaluation_errors : []) if (e && e.permanent === true) done.add(e.key);
    store.ack(sentEvals.filter((k) => done.has(k)).map((k) => Number(k.slice(5))));
  }
  if (data.tables && typeof data.tables === 'object') {
    // Mientras una evaluación siga pendiente de subir, la bajada no la pisa.
    const pendingEvals = store.pendingRpcRefs('sync_save_evaluation');
    const keepFor = { evaluations: (row) => pendingEvals.has(String(row.project_id)) };
    store.transaction(() => {
      for (const [table, rows] of Object.entries(data.tables)) {
        if (SCHEMA[table] && Array.isArray(rows)) store.replaceBase(table, rows, { keep: keepFor[table] });
      }
    });
  }
  if (Array.isArray(data.class_verifiers)) store.setClassVerifiers(data.class_verifiers);
  if (Array.isArray(data.teacher_logins)) store.setTeacherLogins(data.teacher_logins);
}
