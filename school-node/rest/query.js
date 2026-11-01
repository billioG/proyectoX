// Analizador de consultas PostgREST: convierte lo que manda el cliente de Supabase (`supabase-js`) al nodo en una
// estructura que entiende el motor (engine.js). Es lógica pura: no toca la base ni la red.
//
// Cubre lo que usa la app: select con relaciones anidadas (alias, !inner, pista de clave foránea), filtros
// eq/neq/gt/gte/lt/lte/like/ilike/in/is/cs/cd con `not`, or=(...) y and=(...) anidados, order, limit/offset,
// single / count / head, y las escrituras (insert, upsert con on_conflict, update, delete) y las RPC.

export class RestError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.name = 'RestError';
    this.status = status;
    this.code = code;
  }
}
const bad = (msg) => new RestError(400, msg);

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is', 'cs', 'cd']);

/** Parte `texto` por comas de primer nivel (fuera de paréntesis, llaves y comillas). */
function splitTop(text) {
  const out = [];
  let depth = 0, quote = false, cur = '';
  for (const ch of text) {
    if (ch === '"') quote = !quote;
    if (!quote) {
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
      else if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

/** "a,b" o `"a,b","c d"` → ['a','b'] / ['a,b','c d'] */
function parseList(inner) {
  return splitTop(inner).map((v) => {
    const t = v.trim();
    return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/\\"/g, '"') : t;
  });
}

/** select=... → árbol: { type:'star' } | { type:'col', name, alias } | { type:'rel', name, alias, inner, hint, select } */
export function parseSelect(text) {
  const clean = String(text ?? '').replace(/\s+/g, '');
  if (clean === '') return [{ type: 'star' }];
  return splitTop(clean).map((item) => {
    if (item === '*') return { type: 'star' };
    const open = item.indexOf('(');
    if (open === -1) {
      const [alias, name] = item.includes(':') ? item.split(':') : [item, item];
      if (!NAME.test(name) || !NAME.test(alias)) throw bad(`Columna inválida: ${item}`);
      return { type: 'col', name, alias };
    }
    if (!item.endsWith(')')) throw bad(`Relación mal cerrada: ${item}`);
    let head = item.slice(0, open);
    const inside = item.slice(open + 1, -1);
    let alias = null;
    if (head.includes(':')) [alias, head] = head.split(':');
    const [name, ...mods] = head.split('!');
    if (!NAME.test(name)) throw bad(`Relación inválida: ${item}`);
    let inner = false, hint = null;
    for (const m of mods) { if (m === 'inner') inner = true; else if (m !== 'left' && m !== '') hint = m; }
    return { type: 'rel', name, alias: alias || name, inner, hint, select: parseSelect(inside) };
  });
}

/** `op.valor` (o `not.op.valor`) de una columna → filtro. */
export function parseFilterValue(col, raw) {
  let rest = String(raw);
  let negate = false;
  if (rest.startsWith('not.')) { negate = true; rest = rest.slice(4); }
  const dot = rest.indexOf('.');
  if (dot === -1) throw bad(`Filtro inválido para ${col}: ${raw}`);
  const op = rest.slice(0, dot);
  const val = rest.slice(dot + 1);
  if (!OPS.has(op)) throw bad(`Operador no soportado: ${op}`);
  let value = val;
  if (op === 'in') {
    if (!(val.startsWith('(') && val.endsWith(')'))) throw bad(`El filtro in de ${col} necesita paréntesis`);
    value = parseList(val.slice(1, -1));
  } else if (op === 'is') {
    value = val === 'null' ? null : val === 'true' ? true : val === 'false' ? false : val;
  } else if (op === 'cs' || op === 'cd') {
    if (val.startsWith('{') && val.endsWith('}')) value = parseList(val.slice(1, -1));
    else { try { value = JSON.parse(val); } catch { throw bad(`Valor inválido para ${op}: ${val}`); } }
  } else if (op === 'like' || op === 'ilike') {
    value = val.replace(/\*/g, '%');
  }
  return { col, op, value, negate };
}

/** `(a.eq.1,b.in.(1,2),and(c.gt.2,d.lt.3))` → lista de filtros (y grupos anidados). */
function parseGroup(text) {
  const t = text.trim();
  if (!(t.startsWith('(') && t.endsWith(')'))) throw bad(`Grupo mal formado: ${text}`);
  return splitTop(t.slice(1, -1)).map((part) => {
    const p = part.trim();
    const g = /^(and|or)\(/.exec(p);
    if (g) return { [g[1]]: parseGroup(p.slice(g[1].length)) };
    const dot = p.indexOf('.');
    if (dot === -1) throw bad(`Filtro inválido: ${p}`);
    return parseFilterValue(p.slice(0, dot), p.slice(dot + 1));
  });
}

function parseOrder(text) {
  return String(text).split(',').filter(Boolean).map((part) => {
    const [col, ...mods] = part.split('.');
    const dir = mods.includes('desc') ? 'desc' : 'asc';
    const nulls = mods.includes('nullsfirst') ? 'first' : mods.includes('nullslast') ? 'last' : null;
    return { col, dir, nulls };
  });
}

const int = (v, name) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw bad(`${name} debe ser un entero positivo`);
  return n;
};
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and']);

/**
 * @param { method, url, headers, body } url = ruta + consulta (p. ej. "/rest/v1/projects?select=*")
 * @returns { kind: 'select'|'insert'|'upsert'|'update'|'delete'|'rpc', table|fn, ... }
 */
export function parseRequest({ method, url, headers = {}, body }) {
  const u = new URL(url, 'http://nodo.local');
  const m = /^\/rest\/v1\/([^/]*)(?:\/([^/]*))?$/.exec(u.pathname);
  if (!m) throw bad('Ruta no válida');
  const isRpc = m[1] === 'rpc';
  const target = isRpc ? m[2] : m[1];
  let name = '';
  try { name = decodeURIComponent(target ?? ''); } catch { throw bad('Nombre inválido'); }
  if (!NAME.test(name)) throw bad('Nombre de tabla o función inválido');

  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const prefer = new Set(String(h.prefer || '').split(',').map((x) => x.trim()).filter(Boolean));
  const countToken = [...prefer].find((x) => x.startsWith('count='));
  const meta = {
    returnRep: prefer.has('return=representation'),
    count: countToken ? countToken.slice(6) : null,
  };

  if (isRpc) {
    const args = method === 'GET' ? Object.fromEntries(u.searchParams.entries()) : (body ?? {});
    return { kind: 'rpc', fn: name, args, ...meta };
  }

  const filters = [];
  for (const [key, value] of u.searchParams.entries()) {
    if (key === 'or' || key === 'and') filters.push({ [key]: parseGroup(value) });
    else if (!RESERVED.has(key)) filters.push(parseFilterValue(key, value));
  }

  const out = { table: name, filters, ...meta };
  const M = String(method).toUpperCase();
  if (M === 'GET' || M === 'HEAD') {
    out.kind = 'select';
    out.head = M === 'HEAD';
    out.select = parseSelect(u.searchParams.get('select'));
    out.order = u.searchParams.has('order') ? parseOrder(u.searchParams.get('order')) : [];
    out.limit = u.searchParams.has('limit') ? int(u.searchParams.get('limit'), 'limit') : null;
    out.offset = u.searchParams.has('offset') ? int(u.searchParams.get('offset'), 'offset') : 0;
    out.single = String(h.accept || '').includes('application/vnd.pgrst.object+json') ? 'object' : null;
    const range = /^(\d+)-(\d+)$/.exec(h.range || '');
    if (range) { out.offset = Number(range[1]); out.limit = Number(range[2]) - Number(range[1]) + 1; }
    return out;
  }
  if (M === 'POST') {
    out.rows = Array.isArray(body) ? body : [body ?? {}];
    const merge = prefer.has('resolution=merge-duplicates');
    const ignore = prefer.has('resolution=ignore-duplicates');
    out.kind = merge || ignore ? 'upsert' : 'insert';
    out.onConflict = u.searchParams.has('on_conflict') ? u.searchParams.get('on_conflict').split(',').filter(Boolean) : null;
    out.ignoreDuplicates = ignore;
    out.select = parseSelect(u.searchParams.get('select'));
    return out;
  }
  if (M === 'PATCH') { out.kind = 'update'; out.patch = body ?? {}; out.select = parseSelect(u.searchParams.get('select')); return out; }
  if (M === 'DELETE') { out.kind = 'delete'; out.select = parseSelect(u.searchParams.get('select')); return out; }
  throw bad(`Método no soportado: ${M}`);
}
