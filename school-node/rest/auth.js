// Acceso de la capa local: mismo contrato que usa la app con la nube (student-login -> token_hash -> verifyOtp), pero
// la sesión es del nodo: un JWT HS256 firmado con un secreto que se crea y vive solo en este nodo (no sirve en la
// nube, y la nube no puede fabricar uno para el nodo). La contraseña de la clase se compara contra un verificador con
// sal que baja la sincronización; la contraseña en claro nunca llega al nodo.
import crypto from 'node:crypto';

const PBKDF2_ITERATIONS = 150000;
const ACCESS_MS = 3600_000;
const REFRESH_MS = 30 * 24 * 3600_000;
const LOGIN_TOKEN_MS = 5 * 60_000;
const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10; // por IP y por usuario, en la ventana (mismo tope que student-login en la nube)
const GENERIC_ERROR = 'Usuario o contraseña incorrectos';

export class AuthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const hashClassPassword = (password, saltHex) =>
  crypto.pbkdf2Sync(String(password), Buffer.from(saltHex, 'hex'), PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const equal = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const classKeyOf = (s) => `${s.school_code}|${s.grade}|${s.section}`;
const active = (s) => !!s && s.status !== 'egresado' && s.status !== 'baja';

export function createAuth({ store, now = Date.now }) {
  let secret = store.getMeta('jwt_secret');
  if (!secret) { secret = crypto.randomBytes(32).toString('hex'); store.setMeta('jwt_secret', secret); }

  const sign = (claims) => {
    const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`;
    return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
  };
  function decode(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    try {
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      if (header.alg !== 'HS256') return null;
      const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
      if (!equal(parts[2], expected)) return null;
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (claims.iss !== 'quetzal-node' || typeof claims.exp !== 'number' || claims.exp * 1000 <= now()) return null;
      return claims;
    } catch { return null; }
  }

  const studentRow = (id) => store.all('students').find((s) => s.id === id);

  // ---- límites de intentos (en memoria: un reinicio del nodo los borra, igual que la ventana de 5 min) ----
  const attempts = new Map(); // 'ip:..' | 'user:..' -> { n, start }
  const hits = (key) => { const a = attempts.get(key); return a && now() - a.start < WINDOW_MS ? a.n : 0; };
  const miss = (key) => {
    const a = attempts.get(key);
    if (a && now() - a.start < WINDOW_MS) a.n++; else attempts.set(key, { n: 1, start: now() });
  };
  if (attempts.size > 5000) attempts.clear();

  const loginTokens = new Map(); // huella -> { uid, exp }

  function studentLogin({ username, password, ip }) {
    const user = String(username || '').trim().toLowerCase();
    const ipKey = `ip:${ip || 'unknown'}`, userKey = `user:${user}`;
    if (hits(ipKey) >= MAX_ATTEMPTS || hits(userKey) >= MAX_ATTEMPTS) {
      throw new AuthError(429, 'Demasiados intentos -- espera unos minutos y vuelve a intentar');
    }
    const fail = () => { miss(ipKey); miss(userKey); throw new AuthError(401, GENERIC_ERROR); };

    const student = user ? store.all('students').find((s) => s.username === user) : null;
    if (!active(student)) return fail();
    const v = store.classVerifier(classKeyOf(student));
    if (!v) return fail(); // clase que el nodo no conoce: nunca se entra sin contraseña por omisión
    if (v.requires_password) {
      if (!password || !equal(hashClassPassword(password, v.salt), v.hash)) return fail();
    }
    const token = crypto.randomBytes(32).toString('hex');
    loginTokens.set(sha256(token), { uid: student.id, exp: now() + LOGIN_TOKEN_MS });
    attempts.delete(ipKey); attempts.delete(userKey);
    return { ok: true, email: `${student.id}@nodo.local`, token_hash: token };
  }

  function session(uid) {
    const t = Math.floor(now() / 1000);
    const exp = t + ACCESS_MS / 1000;
    const student = studentRow(uid);
    const access_token = sign({ iss: 'quetzal-node', aud: 'authenticated', role: 'authenticated', sub: uid, iat: t, exp });
    const refresh_token = crypto.randomBytes(32).toString('hex');
    store.saveRefresh(sha256(refresh_token), uid, now());
    return {
      access_token, token_type: 'bearer', expires_in: ACCESS_MS / 1000, expires_at: exp, refresh_token,
      user: { id: uid, aud: 'authenticated', role: 'authenticated', email: `${uid}@nodo.local`, app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString(), full_name: student?.full_name },
    };
  }

  function verify({ token_hash, type }) {
    const key = sha256(String(token_hash || ''));
    const entry = loginTokens.get(key);
    loginTokens.delete(key); // sirve una sola vez, haya salido bien o no
    if (type !== 'magiclink' || !entry || entry.exp <= now() || !active(studentRow(entry.uid))) throw new AuthError(401, 'Enlace inválido o vencido');
    return session(entry.uid);
  }

  function refresh(refreshToken) {
    const r = store.takeRefresh(sha256(String(refreshToken || '')));
    if (!r || now() - r.created_at > REFRESH_MS || !active(studentRow(r.uid))) throw new AuthError(401, 'Sesión vencida');
    return session(r.uid);
  }

  function logout(refreshToken) { if (refreshToken) store.takeRefresh(sha256(String(refreshToken))); }

  function userFromAccessToken(token) {
    const claims = decode(token);
    if (!claims || claims.role !== 'authenticated') return null;
    const s = studentRow(claims.sub);
    if (!active(s)) return null;
    return { uid: s.id, role: 'student', classKey: classKeyOf(s) };
  }

  // RPC públicas del login. Un usuario que no existe responde igual que uno que sí pide contraseña.
  function loginModeByUsername(username) {
    const s = store.all('students').find((x) => x.username === String(username || '').trim().toLowerCase());
    if (!active(s)) return true;
    const v = store.classVerifier(classKeyOf(s));
    return v ? v.requires_password : true;
  }
  function classLoginMode({ school_code, grade, section }) {
    const v = store.classVerifier(`${school_code}|${grade}|${section}`);
    return v ? v.requires_password : true;
  }

  return { studentLogin, verify, refresh, logout, userFromAccessToken, loginModeByUsername, classLoginMode };
}
