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
    -- Tokens de renovación de las sesiones del nodo (se guarda solo su huella).
    CREATE TABLE IF NOT EXISTS rest_refresh (
      token_hash TEXT PRIMARY KEY, uid TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);

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
    pendingPks: db.prepare('SELECT DISTINCT pk FROM rest_outbox WHERE tbl = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM rest_outbox'),
    ack: db.prepare('DELETE FROM rest_outbox WHERE seq = ?'),
    fail: db.prepare('UPDATE rest_outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ?'),
    getMeta: db.prepare('SELECT value FROM rest_meta WHERE key = ?'),
    verifier: db.prepare('SELECT class_key, requires_password, salt, hash FROM rest_class_verifiers WHERE class_key = ?'),
    countVerifiers: db.prepare('SELECT COUNT(*) AS n FROM rest_class_verifiers'),
    delVerifiers: db.prepare('DELETE FROM rest_class_verifiers'),
    putVerifier: db.prepare('INSERT INTO rest_class_verifiers (class_key, requires_password, salt, hash) VALUES (?, ?, ?, ?)'),
    putRefresh: db.prepare('INSERT OR REPLACE INTO rest_refresh (token_hash, uid, created_at) VALUES (?, ?, ?)'),
    getRefresh: db.prepare('SELECT uid, created_at FROM rest_refresh WHERE token_hash = ?'),
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

  function enqueue(changes) {
    const now = new Date().toISOString();
    for (const c of changes || []) {
      q.enqueue.run(c.table, c.op, key(c.row[pkOf(c.table)]), JSON.stringify(c.row), now);
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
      return view ? rows.map(view()) : rows;
    },
    /** Registra cómo ver una tabla: `makeMapper()` se llama en cada lectura y devuelve (fila) => fila vista. */
    setView: (tbl, makeMapper) => { views.set(tbl, makeMapper); },
    put,
    remove,
    transaction,
    enqueue,
    pending: () => q.pending.all().map((r) => ({ seq: r.seq, table: r.tbl, op: r.op, pk: r.pk, row: JSON.parse(r.row), created_at: r.created_at, attempts: r.attempts, last_error: r.last_error })),
    pendingCount: () => q.count.get().n,
    ack: (seqs) => transaction(() => { for (const s of seqs) q.ack.run(s); }),
    fail: (seq, message) => { q.fail.run(String(message).slice(0, 500), seq); },

    /** Reemplaza la base de una tabla con lo que bajó de la nube, respetando las filas con cambios pendientes de subir. */
    replaceBase(tbl, incoming) {
      const pk = pkOf(tbl);
      transaction(() => {
        const pendingKeys = new Set(q.pendingPks.all(tbl).map((p) => p.pk));
        const keep = new Map(load(tbl).filter((r) => pendingKeys.has(key(r[pk]))).map((r) => [key(r[pk]), r]));
        q.delTable.run(tbl);
        cache.delete(tbl);
        for (const row of incoming) put(tbl, keep.get(key(row[pk])) || row);
        for (const [k, row] of keep) if (!incoming.some((r) => key(r[pk]) === k)) put(tbl, row);
      });
    },

    /** Reemplaza los verificadores de contraseña de clase con los que bajó de la nube. */
    setClassVerifiers: (list) => transaction(() => {
      q.delVerifiers.run();
      for (const v of list) q.putVerifier.run(v.class_key, v.requires_password ? 1 : 0, v.salt || '', v.hash || '');
    }),
    verifierCount: () => q.countVerifiers.get().n,
    classVerifier: (classKey) => { const r = q.verifier.get(classKey); return r ? { ...r, requires_password: !!r.requires_password } : null; },
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
