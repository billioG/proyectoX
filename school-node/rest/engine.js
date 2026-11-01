// Motor de consultas PostgREST sobre las filas de la réplica local. Recibe lo que analiza query.js y devuelve lo que
// el cliente de Supabase espera. No sabe de HTTP ni de SQLite: usa un `store` (all / put / remove), un `schema` con
// la LISTA PERMITIDA de tablas y columnas y sus relaciones, y una `policy` con las reglas de acceso por fila (RLS en
// código). Lo que no está en el schema ni en la política no se sirve: una política que falta DENIEGA.
//
// schema[tabla] = {
//   pk, columns: [columnas visibles], relations: { nombre: { type: 'one'|'many', unique?, table, fk, ref } },
//   writable?: [columnas escribibles] (si falta, la tabla es de solo lectura), defaults?: { col: () => valor },
//   unique?: [[col, col], ...]
// }
// policy = { canRead(ctx, tabla, fila), canInsert(ctx, tabla, fila), canUpdate(ctx, tabla, vieja, nueva), canDelete(ctx, tabla, fila) }

import { RestError } from './query.js';

const err = (status, code, message) => new RestError(status, message, code);
const denied = (table) => err(403, '42501', `permission denied for table ${table}`);

// ---- Comparaciones (tres valores: true / false / null como en SQL) ----
const sameValue = (rowValue, text) => {
  if (rowValue === null || rowValue === undefined) return null;
  if (typeof rowValue === 'number') return Number(text) === rowValue;
  if (typeof rowValue === 'boolean') return String(rowValue) === String(text);
  return String(rowValue) === String(text);
};
const order = (a, b) => {
  if (typeof a === 'number' && !Number.isNaN(Number(b))) return a - Number(b);
  const x = String(a), y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
};
const likeRegex = (pattern, insensitive) => new RegExp(
  `^${String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, insensitive ? 'is' : 's');
const asArray = (v) => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') { try { const p = JSON.parse(v); if (Array.isArray(p)) return p.map(String); } catch { /* texto */ } }
  return null;
};

function leaf(row, f) {
  const v = row[f.col];
  let r;
  switch (f.op) {
    case 'eq': r = sameValue(v, f.value); break;
    case 'neq': { const e = sameValue(v, f.value); r = e === null ? null : !e; break; }
    case 'gt': r = v == null ? null : order(v, f.value) > 0; break;
    case 'gte': r = v == null ? null : order(v, f.value) >= 0; break;
    case 'lt': r = v == null ? null : order(v, f.value) < 0; break;
    case 'lte': r = v == null ? null : order(v, f.value) <= 0; break;
    case 'like': r = v == null ? null : likeRegex(f.value, false).test(String(v)); break;
    case 'ilike': r = v == null ? null : likeRegex(f.value, true).test(String(v)); break;
    case 'in': r = v == null ? null : f.value.some((x) => sameValue(v, x) === true); break;
    case 'is': r = f.value === null ? v == null : (v === f.value || (v != null && String(v) === String(f.value))); break;
    case 'cs': { const a = asArray(v); r = a ? f.value.every((x) => a.includes(String(x))) : null; break; }
    case 'cd': { const a = asArray(v); r = a ? a.every((x) => f.value.map(String).includes(x)) : null; break; }
    default: throw err(400, 'PGRST100', `Operador no soportado: ${f.op}`);
  }
  return f.negate && r !== null ? !r : r;
}
function matches(row, f) {
  if (f.or) return f.or.some((g) => matches(row, g) === true);
  if (f.and) return f.and.every((g) => matches(row, g) === true);
  return leaf(row, f) === true;
}

export function createEngine({ schema, store, policy = {} }) {
  const tableDef = (name) => {
    const t = schema[name];
    if (!t) throw err(404, '42P01', `relation "public.${name}" does not exist`);
    return t;
  };
  const checkCol = (t, name) => { if (!t.columns.includes(name)) throw err(400, '42703', `column ${name} does not exist`); };
  const canRead = (ctx, table, row) => (policy.canRead ? policy.canRead(ctx, table, row) === true : false);
  const visible = (ctx, table) => store.all(table).filter((r) => canRead(ctx, table, r));

  function checkFilters(t, filters) {
    for (const f of filters) {
      if (f.or || f.and) checkFilters(t, f.or || f.and);
      else {
        if (f.col.includes('.')) throw err(400, 'PGRST100', `Filtros sobre relaciones anidadas no soportados: ${f.col}`);
        checkCol(t, f.col);
      }
    }
  }

  /** Valor de una relación para una fila: objeto, lista o null. Solo mira filas que la política deja leer. */
  function related(ctx, t, row, node) {
    const rel = t.relations?.[node.name];
    if (!rel) throw err(400, 'PGRST200', `Could not find a relationship between the tables for ${node.name}`);
    const targets = visible(ctx, rel.table);
    if (rel.type === 'one') {
      if (row[rel.fk] == null) return null;
      return targets.find((x) => sameValue(x[rel.ref], row[rel.fk]) === true || x[rel.ref] === row[rel.fk]) || null;
    }
    const list = targets.filter((x) => x[rel.fk] != null && (x[rel.fk] === row[rel.ref] || String(x[rel.fk]) === String(row[rel.ref])));
    return rel.unique ? (list[0] || null) : list;
  }

  function project(ctx, tableName, row, tree) {
    const t = tableDef(tableName);
    const out = {};
    for (const node of tree) {
      if (node.type === 'star') { for (const c of t.columns) out[c] = row[c] === undefined ? null : row[c]; }
      else if (node.type === 'col') { checkCol(t, node.name); out[node.alias] = row[node.name] === undefined ? null : row[node.name]; }
      else {
        const rel = t.relations?.[node.name];
        const value = related(ctx, t, row, node);
        out[node.alias] = Array.isArray(value)
          ? value.map((v) => project(ctx, rel.table, v, node.select))
          : value ? project(ctx, rel.table, value, node.select) : null;
      }
    }
    return out;
  }

  function sorter(t, orderBy) {
    for (const o of orderBy) { if (o.col.includes('.')) throw err(400, 'PGRST100', 'Orden por relaciones no soportado'); checkCol(t, o.col); }
    return (a, b) => {
      for (const o of orderBy) {
        const x = a[o.col], y = b[o.col];
        if (x == null || y == null) {
          if (x == null && y == null) continue;
          // Postgres: ASC deja los nulos al final, DESC al principio, salvo nullsfirst / nullslast.
          const nullsFirst = o.nulls ? o.nulls === 'first' : o.dir === 'desc';
          return (x == null) === nullsFirst ? -1 : 1;
        }
        let c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es');
        if (c !== 0) return o.dir === 'desc' ? -c : c;
      }
      return 0;
    };
  }

  function select(p, ctx) {
    const t = tableDef(p.table);
    if (!policy.canRead) throw denied(p.table);
    checkFilters(t, p.filters);
    let rows = visible(ctx, p.table).filter((r) => p.filters.every((f) => matches(r, f)));
    // Relaciones !inner: se descartan las filas sin relación visible (antes de ordenar y limitar).
    for (const node of p.select.filter((n) => n.type === 'rel' && n.inner)) {
      rows = rows.filter((r) => { const v = related(ctx, t, r, node); return Array.isArray(v) ? v.length > 0 : v !== null; });
    }
    if (p.order?.length) rows = rows.slice().sort(sorter(t, p.order));
    const count = rows.length;
    if (p.offset) rows = rows.slice(p.offset);
    if (p.limit !== null && p.limit !== undefined) rows = rows.slice(0, p.limit);
    const projected = p.head ? [] : rows.map((r) => project(ctx, p.table, r, p.select));
    if (p.single === 'object') {
      if (rows.length !== 1) throw err(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
      return { rows: projected[0], count: p.count ? count : null, changes: [] };
    }
    return { rows: projected, count: p.count ? count : null, changes: [] };
  }

  // ---- Escrituras ----
  function checkWritable(t, name, row) {
    for (const c of Object.keys(row)) {
      checkCol(t, c);
      if (!t.writable.includes(c)) throw denied(name);
    }
  }
  const uniqueClash = (t, rows, candidate, except) => {
    const sets = [[t.pk], ...(t.unique || [])];
    return rows.find((r) => r !== except && sets.some((cols) => cols.every((c) => candidate[c] !== undefined && candidate[c] !== null && r[c] === candidate[c])));
  };
  function insertRow(ctx, name, t, input, changes) {
    checkWritable(t, name, input);
    const row = { ...input };
    for (const [c, fn] of Object.entries(t.defaults || {})) if (row[c] === undefined) row[c] = fn();
    for (const c of t.columns) if (row[c] === undefined) row[c] = null;
    if (!policy.canInsert || policy.canInsert(ctx, name, row) !== true) throw denied(name);
    if (uniqueClash(t, store.all(name), row, null)) throw err(409, '23505', 'duplicate key value violates unique constraint');
    store.put(name, row);
    changes.push({ op: 'insert', table: name, row });
    return row;
  }
  function updateRow(ctx, name, t, old, patch, changes) {
    checkWritable(t, name, patch);
    const next = { ...old, ...patch };
    if (!policy.canUpdate || policy.canUpdate(ctx, name, old, next) !== true) return null; // RLS: la fila no se ve afectada
    store.put(name, next);
    changes.push({ op: 'update', table: name, row: next, old });
    return next;
  }
  const represent = (p, ctx, name, rows) => (p.returnRep ? rows.map((r) => project(ctx, name, r, p.select || [{ type: 'star' }])) : []);

  function insert(p, ctx) {
    const name = p.table, t = tableDef(name);
    if (!t.writable) throw denied(name);
    const changes = [];
    const rows = p.rows.map((input) => insertRow(ctx, name, t, input, changes));
    return { rows: represent(p, ctx, name, rows), count: null, changes };
  }
  function upsert(p, ctx) {
    const name = p.table, t = tableDef(name);
    if (!t.writable) throw denied(name);
    const target = p.onConflict || [t.pk];
    for (const c of target) checkCol(t, c);
    const changes = [];
    const out = [];
    for (const input of p.rows) {
      checkWritable(t, name, input);
      const existing = store.all(name).find((r) => target.every((c) => input[c] !== undefined && r[c] === input[c]));
      if (!existing) out.push(insertRow(ctx, name, t, input, changes));
      else if (!p.ignoreDuplicates) { const n = updateRow(ctx, name, t, existing, input, changes); if (n) out.push(n); else throw denied(name); }
    }
    return { rows: represent(p, ctx, name, out), count: null, changes };
  }
  function update(p, ctx) {
    const name = p.table, t = tableDef(name);
    if (!t.writable) throw denied(name);
    checkFilters(t, p.filters);
    checkWritable(t, name, p.patch);
    const changes = [];
    const done = [];
    for (const old of visible(ctx, name).filter((r) => p.filters.every((f) => matches(r, f)))) {
      const n = updateRow(ctx, name, t, old, p.patch, changes);
      if (n) done.push(n);
    }
    return { rows: represent(p, ctx, name, done), count: null, changes };
  }
  function remove(p, ctx) {
    const name = p.table, t = tableDef(name);
    if (!t.writable) throw denied(name);
    checkFilters(t, p.filters);
    const changes = [];
    const done = [];
    for (const row of visible(ctx, name).filter((r) => p.filters.every((f) => matches(r, f)))) {
      if (!policy.canDelete || policy.canDelete(ctx, name, row) !== true) continue;
      store.remove(name, row[t.pk]);
      changes.push({ op: 'delete', table: name, row });
      done.push(row);
    }
    return { rows: represent(p, ctx, name, done), count: null, changes };
  }

  return {
    /** @returns { rows, count, changes } (changes = lo que se escribió, para la bandeja de salida) */
    execute(parsed, ctx) {
      switch (parsed.kind) {
        case 'select': return select(parsed, ctx);
        case 'insert': return insert(parsed, ctx);
        case 'upsert': return upsert(parsed, ctx);
        case 'update': return update(parsed, ctx);
        case 'delete': return remove(parsed, ctx);
        default: throw err(400, 'PGRST100', `Tipo de petición no soportado: ${parsed.kind}`);
      }
    },
  };
}
