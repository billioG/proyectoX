// Rutas HTTP de la capa local: el nodo habla el «idioma» de Supabase para que la app real corra encima sin cambios.
//   /rest/v1/<tabla>, /rest/v1/rpc/<función>   (PostgREST)
//   /auth/v1/verify | token | user | logout    (GoTrue, solo lo que usa la app)
//   /functions/v1/student-login                (el login de estudiantes)
// `handle(req, res, url)` devuelve true si la ruta era suya.
import { parseRequest, RestError } from './query.js';
import { createEngine } from './engine.js';
import { createPolicy } from './policies.js';
import { SCHEMA } from './schema.js';
import { AuthError } from './auth.js';

const MAX_BODY = 200_000;

class BodyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer, accept, accept-profile, content-profile, range, x-client-info',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'content-range',
};

function send(res, status, body, headers = {}) {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { ...CORS, 'Cache-Control': 'no-store', ...(text ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers });
  res.end(text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      raw += c;
      if (raw.length > MAX_BODY) { done = true; reject(new BodyError(413, 'Petición demasiado grande')); req.resume(); }
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      if (!raw) return resolve(undefined);
      try { resolve(JSON.parse(raw)); } catch { reject(new BodyError(400, 'JSON inválido')); }
    });
    req.on('error', () => { if (!done) { done = true; reject(new BodyError(400, 'Petición interrumpida')); } });
  });
}

const tokenOf = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const clientIp = (req) => req.socket?.remoteAddress || 'unknown';

export function createRestRoutes({ store, auth, rpcs = {}, onChange = () => {} }) {
  const engine = createEngine({ schema: SCHEMA, store, policy: createPolicy({ store }) });

  // Funciones públicas del login (no necesitan sesión). Un usuario inexistente responde como uno que sí pide contraseña.
  const publicRpcs = {
    resolve_login_mode_by_username: (args) => auth.loginModeByUsername(args?.p_username),
    get_class_login_mode: (args) => auth.classLoginMode({ school_code: args?.p_school_code, grade: args?.p_grade, section: args?.p_section }),
  };

  const authError = (res, e) => {
    const status = e.status || 400;
    send(res, status, { code: status, error_code: status === 429 ? 'over_request_rate_limit' : 'invalid_credentials', msg: e.message, message: e.message, error: e.message });
  };

  async function rest(req, res, url) {
    if (req.method === 'OPTIONS') return send(res, 204, undefined);
    const method = req.method;
    if (!['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'].includes(method)) return send(res, 405, { code: 'PGRST117', message: 'Método no permitido' });

    const rpcName = /^\/rest\/v1\/rpc\/([^/?]+)$/.exec(url.pathname)?.[1];
    const ctx = auth.userFromAccessToken(tokenOf(req));
    if (!ctx && !(rpcName && Object.hasOwn(publicRpcs, rpcName))) return send(res, 401, { code: 'PGRST301', message: 'No autenticado o sesión vencida', details: null, hint: null });

    const body = method === 'POST' || method === 'PATCH' ? await readJson(req) : undefined;
    try {
      if (rpcName) {
        const args = body && typeof body === 'object' ? body : {};
        const fn = Object.hasOwn(publicRpcs, rpcName) ? publicRpcs[rpcName] : Object.hasOwn(rpcs, rpcName) ? rpcs[rpcName] : null;
        if (!fn) return send(res, 404, { code: 'PGRST202', message: `No se encontró la función ${rpcName}`, details: null, hint: null });
        const result = store.transaction(() => fn(args, ctx));
        return send(res, 200, result === undefined ? null : result);
      }

      const parsed = parseRequest({ method, url: req.url, headers: req.headers, body });
      const out = store.transaction(() => {
        const r = engine.execute(parsed, ctx);
        store.enqueue(r.changes);
        return r;
      });
      if (out.changes?.length) onChange(out.changes, ctx);

      const headers = {};
      if (out.count != null) {
        const n = Array.isArray(out.rows) ? out.rows.length : (out.rows ? 1 : 0);
        headers['Content-Range'] = `${n ? `0-${n - 1}` : '*'}/${out.count}`;
      }
      if (parsed.kind === 'select') {
        if (method === 'HEAD') { res.writeHead(200, { ...CORS, ...headers }); return res.end(); }
        return send(res, 200, out.rows, headers);
      }
      if (parsed.returnRep) return send(res, parsed.kind === 'insert' || parsed.kind === 'upsert' ? 201 : 200, out.rows, headers);
      return send(res, parsed.kind === 'insert' || parsed.kind === 'upsert' ? 201 : 204, undefined, headers);
    } catch (e) {
      if (e instanceof RestError) return send(res, e.status, { code: e.code, message: e.message, details: null, hint: null });
      throw e;
    }
  }

  async function authApi(req, res, url) {
    if (req.method === 'OPTIONS') return send(res, 204, undefined);
    const route = `${req.method} ${url.pathname}`;
    try {
      if (route === 'POST /auth/v1/verify') {
        const body = (await readJson(req)) || {};
        return send(res, 200, auth.verify({ token_hash: body.token_hash, type: body.type }));
      }
      if (route === 'POST /auth/v1/token') {
        const grant = url.searchParams.get('grant_type');
        if (grant === 'refresh_token') return send(res, 200, auth.refresh(((await readJson(req)) || {}).refresh_token));
        // Docentes (correo + clave personal del nodo): todavía no.
        return send(res, 400, { code: 400, error_code: 'unsupported_grant_type', msg: 'Este tipo de ingreso aún no está disponible sin internet', message: 'Este tipo de ingreso aún no está disponible sin internet', error: 'unsupported_grant_type', error_description: 'Este tipo de ingreso aún no está disponible sin internet' });
      }
      if (route === 'GET /auth/v1/user') {
        const ctx = auth.userFromAccessToken(tokenOf(req));
        if (!ctx) return send(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'Sesión vencida', message: 'Sesión vencida' });
        return send(res, 200, { id: ctx.uid, aud: 'authenticated', role: 'authenticated', email: `${ctx.uid}@nodo.local`, app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() });
      }
      if (route === 'POST /auth/v1/logout') {
        const body = await readJson(req).catch(() => undefined);
        auth.logout(body?.refresh_token);
        return send(res, 204, undefined);
      }
    } catch (e) {
      if (e instanceof AuthError) return authError(res, e);
      throw e;
    }
    return send(res, 404, { code: 404, msg: 'Ruta no encontrada', message: 'Ruta no encontrada' });
  }

  async function studentLogin(req, res) {
    if (req.method === 'OPTIONS') return send(res, 204, undefined);
    if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido' });
    try {
      const body = (await readJson(req)) || {};
      return send(res, 200, auth.studentLogin({ username: body.username, password: body.password, ip: clientIp(req) }));
    } catch (e) {
      if (e instanceof AuthError) return send(res, e.status, { error: e.message });
      throw e;
    }
  }

  return {
    async handle(req, res, url) {
      const p = url.pathname;
      const inRest = p.startsWith('/rest/v1/');
      const inAuth = p.startsWith('/auth/v1/');
      const isLogin = p === '/functions/v1/student-login';
      if (!inRest && !inAuth && !isLogin) return false;
      try {
        if (inRest) await rest(req, res, url);
        else if (inAuth) await authApi(req, res, url);
        else await studentLogin(req, res);
      } catch (e) {
        if (e instanceof BodyError) { if (!res.headersSent) send(res, e.status, { code: 'PGRST102', message: e.message, error: e.message }); }
        else { console.error(e); if (!res.headersSent) send(res, 500, { message: 'Error interno del nodo' }); }
      }
      return true;
    },
  };
}
