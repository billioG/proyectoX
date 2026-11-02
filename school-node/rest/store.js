// Almacén de la capa local compatible con Supabase: réplica de las tablas de la nube (una fila = un JSON) y bandeja
// de salida con lo que se escribió en el nodo y la nube aún no confirmó. Las filas se guardan tal cual las sirve la
// nube; la lectura va por una caché en memoria que se escribe a la par que SQLite.
//
// Interfaz que usa el motor: all(tabla), put(tabla, fila), remove(tabla, llave).

export function createStore({ db, schema }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rest_rows (
      tbl TEXT NOT NULL, pk TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY (tbl, pk)
    );
    CREATE TABLE IF NOT EXISTS rest_outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, op TEXT NOT NULL, pk TEXT NOT NULL, row TEXT NOT NULL,
      created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS rest_meta (key TEXT PRIMARY KEY, value TEXT);
    -- Verificadores de la contraseña de cada clase (hash con sal; la contraseña en claro nunca llega al nodo).
    CREATE TABLE IF NOT EXISTS rest_class_verifiers (
      class_key TEXT PRIMARY KEY, requires_password INTEGER NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL
    );
    -- Entrada de los docentes: huella del correo + PIN (hash con sal) que fijaron EN LÍNEA. Nunca se sirve a la app.
    CREATE TABLE IF NOT EXISTS rest_teacher_logins (
      email_hash TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, pin_hash TEXT NOT NULL, pin_salt TEXT NOT NULL
    );
    -- Desde v1.0.199 la entrada del docente es su contraseña normal (bcrypt de la nube); las bases anteriores ganan la columna abajo.
    -- Tokens de renovación de las sesiones del nodo (se guarda solo su huella).
    CREATE TABLE IF NOT EXISTS rest_refresh (
      token_hash TEXT PRIMARY KEY, uid TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  if (!db.prepare('PRAGMA table_info(rest_teacher_logins)').all().some((c) => c.name === 'bcrypt')) {
    db.exec('ALTER TABLE rest_teacher_logins ADD COLUMN bcrypt TEXT');
  }

  const pkOf = (tbl) => {
    const def = schema[tbl];
    if (!def) throw new Error(`Tabla desconocida: ${tbl}`);
    return def.pk;
  };
  const key = (v) => String(v);

  const q = {
    rows: db.prepare('SELECT data FROM rest_rows WHERE tbl = ?'),
    upsert: db.prepare('INSERT INTO rest_rows (tbl, pk, data) VALUES (?, ?, ?) ON CONFLICT(tbl, pk) DO UPDATE SET data = excluded.data'),
    del: db.prepare('DELETE FROM rest_rows WHERE tbl = ? AND pk = ?'),
    delTable: db.prepare('DELETE FROM rest_rows WHERE tbl = ?'),
    enqueue: db.prepare('INSERT INTO rest_outbox (tbl, op, pk, row, created_at) VALUES (?, ?, ?, ?, ?)'),
    pending: db.prepare('SELECT seq, tbl, op, pk, row, created_at, attempts, last_error FROM rest_outbox ORDER BY seq'),
    delRpc: db.prepare("DELETE FROM rest_outbox WHERE tbl = '_rpc' AND op = ? AND pk = ?"),
    rpcRefs: db.prepare("SELECT pk FROM rest_outbox WHERE tbl = '_rpc' AND op = ?"),
    hasRpc: db.prepare("SELECT 1 FROM rest_outbox WHERE tbl = '_rpc' AND op = ? AND pk = ?"),
    pendingPks: db.prepare('SELECT DISTINCT pk FROM rest_outbox WHERE tbl = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM rest_outbox'),
    ack: db.prepare('DELETE FROM rest_outbox WHERE seq = ?'),
    fail: db.prepare('UPDATE rest_outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?'),
    getMeta: db.prepare('SELECT value FROM rest_meta WHERE key = ?'),
    verifier: db.prepare('SELECT class_key, requires_password, salt, hash FROM rest_class_verifiers WHERE class_key = ?'),
    delTeacherLogins: db.prepare('DELETE FROM rest_teacher_logins'),
    putTeacherLogin: db.prepare('INSERT OR REPLACE INTO rest_teacher_logins (email_hash, teacher_id, pin_hash, pin_salt, bcrypt) VALUES (?, ?, ?, ?, ?)'),
    getTeacherLogin: db.prepare('SELECT teacher_id, pin_hash, pin_salt, bcrypt FROM rest_teacher_logins WHERE email_hash = ?'),
    countVerifiers: db.prepare('SELECT COUNT(*) AS n FROM rest_class_verifiers'),
    delVerifiers: db.prepare('DELETE FROM rest_class_verifiers'),
    putVerifier: db.prepare('INSERT INTO rest_class_verifiers (class_key, requires_password, salt, hash) VALUES (?, ?, ?, ?)'),
    putRefresh: db.prepare('INSERT OR REPLACE INTO rest_refresh (token_hash, uid, created_at) VALUES (?, ?, ?)'),
    getRefresh: db.prepare('SELECT uid, created_at FROM rest_refresh WHERE token_hash = ?'),
    pruneRefresh: db.prepare('DELETE FROM rest_refresh WHERE created_at < ?'),
    countRefresh: db.prepare('SELECT COUNT(*) AS n FROM rest_refresh'),
    countRpc: db.prepare("SELECT COUNT(*) AS n FROM rest_outbox WHERE tbl = '_rpc' AND op = ? AND json_extract(row, '$.student_id') = ?"),
    delRefresh: db.prepare('DELETE FROM rest_refresh WHERE token_hash = ?'),
    setMeta: db.prepare('INSERT INTO rest_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  };

  // tabla -> filas (arreglo estable; el motor lo recorre y lo filtra, nunca lo modifica)
  let cache = new Map();
  // Vistas de lectura (tabla -> función que devuelve un mapeador de filas): lo pendiente de subir se suma a la base.
  const views = new Map();
  const load = (tbl) => {
    let rows = cache.get(tbl);
    if (!rows) { rows = q.rows.all(tbl).map((r) => JSON.parse(r.data)); cache.set(tbl, rows); }
    return rows;
  };

  function put(tbl, row) {
    const pk = pkOf(tbl);
    q.upsert.run(tbl, key(row[pk]), JSON.stringify(row));
    const rows = load(tbl);
    const i = rows.findIndex((r) => key(r[pk]) === key(row[pk]));
    // copia nueva: quien esté recorriendo el arreglo anterior no ve cambios a medias
    const next = rows.slice();
    if (i >= 0) next[i] = row; else next.push(row);
    cache.set(tbl, next);
  }

  function remove(tbl, value) {
    const pk = pkOf(tbl);
    q.del.run(tbl, key(value));
    cache.set(tbl, load(tbl).filter((r) => key(r[pk]) !== key(value)));
  }

  // Las llamadas a funciones (RPC) van a la bandeja como tabla '_rpc': op = nombre de la función, row = { ref, student_id, args }.
  const RPC = '_rpc';
  function enqueue(changes) {
    const now = new Date().toISOString();
    for (const c of changes || []) {
      const pk = c.table === RPC ? c.row.ref : c.row[pkOf(c.table)];
      q.enqueue.run(c.table, c.op, key(pk), JSON.stringify(c.row), now);
    }
  }

  const transaction = (fn) => {
    try {
      return db.transaction(fn)();
    } catch (e) {
      cache = new Map(); // SQLite deshizo la escritura; la caché se vuelve a leer de la base
      throw e;
    }
  };

  return {
    all: (tbl) => {
      const rows = load(tbl);
      const view = views.get(tbl);
      if (!view) return rows;
      const m = view();
      return typeof m === 'function' ? rows.map(m) : rows.map(m.map).concat(m.extra()); // la vista puede devolver { map, extra } para sumar filas
    },
    /** Las filas SIN la vista (lo que realmente guarda la réplica): para cuentas que ya aplican su propia corrección. */
    raw: (tbl) => load(tbl),
    /** Registra cómo ver una tabla: `makeMapper()` se llama en cada lectura y devuelve (fila) => fila vista. */
    setView: (tbl, makeMapper) => { views.set(tbl, makeMapper); },
    put,
    remove,
    transaction,
    enqueue,
    pending: () => q.pending.all().map((r) => ({ seq: r.seq, table: r.tbl, op: r.op, pk: r.pk, row: JSON.parse(r.row), created_at: r.created_at, attempts: r.attempts, last_error: r.last_error })),
    pendingCount: () => q.count.get().n,
    /** ¿Ya hay en la bandeja esta función con esta referencia? (para no anotar dos veces un reintento de la app) */
    /** Pone una llamada a función en la bandeja reemplazando la pendiente con la misma referencia (la última gana). */
    replacePendingRpc: (fn, ref, row) => transaction(() => { q.delRpc.run(fn, key(ref)); enqueue([{ op: fn, table: RPC, row: { ref, ...row } }]); }),
    pendingRpcRefs: (fn) => new Set(q.rpcRefs.all(fn).map((r) => r.pk)),
    hasPendingRpc: (fn, ref) => !!q.hasRpc.get(fn, key(ref)),
    ack: (seqs) => transaction(() => { for (const s of seqs) q.ack.run(s); }),
    fail: (seq, message) => { q.fail.run(String(message).slice(0, 500), seq); },

    /** Reemplaza la base de una tabla con lo que bajó de la nube, respetando las filas con cambios pendientes de subir. */
    replaceBase(tbl, incoming, { keep = () => false } = {}) {
      const pk = pkOf(tbl);
      transaction(() => {
        const pendingKeys = new Set(q.pendingPks.all(tbl).map((p) => p.pk));
        const kept = new Map(load(tbl).filter((r) => pendingKeys.has(key(r[pk])) || keep(r)).map((r) => [key(r[pk]), r]));
        q.delTable.run(tbl);
        cache.delete(tbl);
        for (const row of incoming) put(tbl, kept.get(key(row[pk])) || row);
        for (const [k, row] of kept) if (!incoming.some((r) => key(r[pk]) === k)) put(tbl, row);
      });
    },

    /** Reemplaza los verificadores de contraseña de clase con los que bajó de la nube. */
    setClassVerifiers: (list) => transaction(() => {
      q.delVerifiers.run();
      for (const v of list) q.putVerifier.run(v.class_key, v.requires_password ? 1 : 0, v.salt || '', v.hash || '');
    }),
    /** Reemplaza las entradas de docentes con las que bajó de la nube: [{ teacher_id, email_hash, bcrypt }] (o el PIN anterior: pin_hash + pin_salt). */
    setTeacherLogins: (list) => transaction(() => {
      q.delTeacherLogins.run();
      for (const t of list) q.putTeacherLogin.run(t.email_hash, t.teacher_id, t.pin_hash || '', t.pin_salt || '', t.bcrypt || null);
    }),
    teacherLoginByEmailHash: (h) => q.getTeacherLogin.get(String(h)) || null,
    verifierCount: () => q.countVerifiers.get().n,
    classVerifier: (classKey) => { const r = q.verifier.get(classKey); return r ? { ...r, requires_password: !!r.requires_password } : null; },
    /** Borra los tokens de renovación creados antes de `before` (ms). */
    pruneRefresh: (before) => { q.pruneRefresh.run(before); },
    refreshCount: () => q.countRefresh.get().n,
    /** Cuántas llamadas pendientes de esta función tiene un estudiante en la bandeja. */
    pendingRpcCount: (fn, studentId) => q.countRpc.get(fn, studentId).n,
    saveRefresh: (tokenHash, uid, at) => { q.putRefresh.run(tokenHash, uid, at); },
    /** Consume un token de renovación (sirve una sola vez): devuelve { uid, created_at } o null. */
    takeRefresh: (tokenHash) => transaction(() => { const r = q.getRefresh.get(tokenHash); if (r) q.delRefresh.run(tokenHash); return r || null; }),

    getMeta: (k) => q.getMeta.get(k)?.value ?? null,
    setMeta: (k, v) => { q.setMeta.run(k, String(v)); },
  };
}

// Un solo almacén por base de datos: la caché en memoria no puede estar duplicada entre el servidor y la sincronización.
const stores = new WeakMap();
export function restStoreFor(db, schema) {
  let store = stores.get(db);
  if (!store) { store = createStore({ db, schema }); stores.set(db, store); }
  return store;
}
