// Acceso de la capa local: mismo contrato que usa la app con la nube (student-login -> token_hash -> verifyOtp), pero
// la sesión es del nodo: un JWT HS256 firmado con un secreto que se crea y vive solo en este nodo (no sirve en la
// nube, y la nube no puede fabricar uno para el nodo). La contraseña de la clase se compara contra un verificador con
// sal que baja la sincronización; la contraseña en claro nunca llega al nodo.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';

const PBKDF2_ITERATIONS = 150000;
const ACCESS_MS = 3600_000;
const REFRESH_MS = 30 * 24 * 3600_000;
const LOGIN_TOKEN_MS = 5 * 60_000;
const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 10; // por IP y por usuario, en la ventana (mismo tope que student-login en la nube)
const MAX_TRACKED = 5000; // intentos y enlaces en memoria: tope duro
const MAX_INFLIGHT_PER_IP = 3; // hashes (PBKDF2/bcrypt) simultáneos por IP
const MAX_INFLIGHT_GLOBAL = 32; // hashes simultáneos en todo el nodo (un aula entera entrando a la vez; el pool de hilos de libuv los encola)
const DUMMY_SALT = '00'.repeat(16);
const GENERIC_ERROR = 'Usuario o contraseña incorrectos';
const TOO_MANY = 'Demasiados intentos -- espera unos minutos y vuelve a intentar';
const BUSY = 'El nodo está ocupado -- vuelve a intentar en unos segundos';
// Hash de mentira (mismo costo que los de la nube) para que un correo que no existe tarde lo mismo que uno que sí.
let dummyBcrypt = null;
const DUMMY = () => (dummyBcrypt ||= bcrypt.hash('sin-docente', 10));
const bcryptCompare = async (given, hash) => { try { return await bcrypt.compare(given, hash); } catch { return false; } };
const pbkdf2 = promisify(crypto.pbkdf2);

export class AuthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const hashClassPassword = (password, saltHex) =>
  crypto.pbkdf2Sync(String(password), Buffer.from(saltHex, 'hex'), PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
// Misma cuenta, pero sin bloquear el event loop (el login del nodo usa esta).
export const hashClassPasswordAsync = async (password, saltHex) =>
  (await pbkdf2(String(password), Buffer.from(saltHex, 'hex'), PBKDF2_ITERATIONS, 32, 'sha256')).toString('hex');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const equal = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
export const emailHash = (email) => sha256(String(email || '').trim().toLowerCase());
const classKeyOf = (s) => `${s.school_code}|${s.grade}|${s.section}`;
const active = (s) => !!s && s.status !== 'egresado' && s.status !== 'baja';

// `hash`, `compare`, `maxTracked` y `limits` se pueden cambiar solo para probar (PBKDF2 real tarda ~100 ms por intento).
// `hash` y `compare` pueden devolver el valor o una promesa.
export function createAuth({
  store, now = Date.now, hash: hashFn = hashClassPasswordAsync, maxTracked = MAX_TRACKED, compare = bcryptCompare,
  limits: { maxInflightPerIp = MAX_INFLIGHT_PER_IP, maxInflightGlobal = MAX_INFLIGHT_GLOBAL } = {},
}) {
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
  const teacherRow = (id) => store.all('teachers').find((t) => t.id === id);
  // Quién es un uid de este nodo: un estudiante activo, o un docente (o admin) de la escuela. Si ya no está, su sesión no vale.
  const principalOf = (uid) => {
    const s = studentRow(uid);
    if (active(s)) return { uid: s.id, role: 'student', classKey: classKeyOf(s), name: s.full_name };
    const t = teacherRow(uid);
    return t ? { uid: t.id, role: t.role === 'admin' ? 'admin' : 'teacher', classKey: null, name: t.full_name } : null;
  };

  // ---- límites de intentos (en memoria: un reinicio del nodo los borra, igual que la ventana de 5 min) ----
  const attempts = new Map(); // 'ip:..' | 'user:..' -> { n, start }
  const hits = (key) => { const a = attempts.get(key); return a && now() - a.start < WINDOW_MS ? a.n : 0; };
  const miss = (key) => {
    const a = attempts.get(key);
    if (a && now() - a.start < WINDOW_MS) { a.n++; return; }
    if (attempts.size >= maxTracked) {
      for (const [k, v] of attempts) if (now() - v.start >= WINDOW_MS) attempts.delete(k);
      if (attempts.size >= maxTracked) attempts.clear(); // bajo ataque: se olvida todo, pero la memoria no crece
    }
    attempts.set(key, { n: 1, start: now() });
  };

  // ---- hashes en vuelo: tope por IP y global. Se ocupa el cupo ANTES de hashear y se libera siempre (finally). ----
  // El mapa solo guarda IP con hashes en curso (se borra al llegar a 0) y nunca pasa de maxInflightGlobal entradas.
  const inflight = new Map(); // ipKey -> n
  let inflightTotal = 0;
  async function withHashSlot(ipKey, work) {
    const mine = inflight.get(ipKey) || 0;
    if (mine >= maxInflightPerIp) throw new AuthError(429, TOO_MANY);
    if (inflightTotal >= maxInflightGlobal) throw new AuthError(429, BUSY);
    inflight.set(ipKey, mine + 1); inflightTotal++;
    try { return await work(); }
    finally {
      inflightTotal--;
      const left = (inflight.get(ipKey) || 1) - 1;
      if (left <= 0) inflight.delete(ipKey); else inflight.set(ipKey, left);
    }
  }

  const loginTokens = new Map(); // huella -> { uid, exp }

  async function studentLogin({ username, password, ip }) {
    const user = String(username || '').trim().toLowerCase().slice(0, 64);
    const ipKey = `ip:${ip || 'unknown'}`, userKey = `user:${user}`;
    if (hits(ipKey) >= MAX_ATTEMPTS || hits(userKey) >= MAX_ATTEMPTS) {
      throw new AuthError(429, TOO_MANY);
    }
    const fail = () => { miss(ipKey); miss(userKey); throw new AuthError(401, GENERIC_ERROR); };

    const student = user ? store.all('students').find((s) => s.username === user) : null;
    const v = active(student) ? store.classVerifier(classKeyOf(student)) : null;
    // Un usuario que no existe, o de una clase sin verificador, hace el mismo trabajo (PBKDF2) que uno que sí existe:
    // el tiempo de respuesta no dice quién existe. Una clase sin contraseña es pública (resolve_login_mode_by_username).
    if (!v || v.requires_password) {
      const given = String(password || '').slice(0, 200);
      const hash = await withHashSlot(ipKey, () => hashFn(given, v ? v.salt : DUMMY_SALT));
      if (!v || !given || !equal(hash, v.hash)) return fail();
    }
    const token = crypto.randomBytes(32).toString('hex');
    if (loginTokens.size >= maxTracked) {
      for (const [k, e] of loginTokens) if (e.exp <= now()) loginTokens.delete(k);
      for (const k of loginTokens.keys()) { if (loginTokens.size < maxTracked) break; loginTokens.delete(k); } // los más viejos primero
    }
    loginTokens.set(sha256(token), { uid: student.id, exp: now() + LOGIN_TOKEN_MS });
    attempts.delete(ipKey); attempts.delete(userKey);
    return { ok: true, email: `${student.id}@nodo.local`, token_hash: token };
  }

  // Docentes: correo + la MISMA contraseña de su cuenta. La nube manda al nodo, en cada sincronización, solo la huella bcrypt de los
  // docentes de esa escuela (nunca la contraseña), así que entran sin internet con lo mismo que usan en línea. Un correo que no
  // existe, una contraseña mala y un hash dañado hacen el mismo trabajo y dan el mismo error. (Sigue valiendo el PIN anterior si
  // la nube aún lo manda y no hay huella bcrypt.)
  async function teacherLogin({ email, password, ip }) {
    const eh = emailHash(email);
    const ipKey = `ip:${ip || 'unknown'}`, userKey = `mail:${eh.slice(0, 32)}`;
    if (hits(ipKey) >= MAX_ATTEMPTS || hits(userKey) >= MAX_ATTEMPTS) {
      throw new AuthError(429, TOO_MANY);
    }
    const login = String(email || '').trim() ? store.teacherLoginByEmailHash(eh) : null;
    const given = String(password || '').slice(0, 200);
    const ok = await withHashSlot(ipKey, async () => {
      if (login?.bcrypt) return (await compare(given, login.bcrypt)) === true;
      if (login?.pin_hash) return equal(await hashFn(given, login.pin_salt), login.pin_hash);
      await compare(given, await DUMMY());
      return false;
    });
    if (!login || !given || !ok || !teacherRow(login.teacher_id)) {
      miss(ipKey); miss(userKey);
      throw new AuthError(400, 'Invalid login credentials');
    }
    attempts.delete(ipKey); attempts.delete(userKey);
    return session(login.teacher_id);
  }

  function session(uid) {
    const t = Math.floor(now() / 1000);
    const exp = t + ACCESS_MS / 1000;
    const who = principalOf(uid);
    const access_token = sign({ iss: 'quetzal-node', aud: 'authenticated', role: 'authenticated', sub: uid, iat: t, exp });
    const refresh_token = crypto.randomBytes(32).toString('hex');
    store.pruneRefresh(now() - REFRESH_MS); // los de más de 30 días ya no sirven
    store.saveRefresh(sha256(refresh_token), uid, now());
    return {
      access_token, token_type: 'bearer', expires_in: ACCESS_MS / 1000, expires_at: exp, refresh_token,
      user: { id: uid, aud: 'authenticated', role: 'authenticated', email: `${uid}@nodo.local`, app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString(), full_name: who?.name },
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
    if (!r || now() - r.created_at > REFRESH_MS || !principalOf(r.uid)) throw new AuthError(401, 'Sesión vencida');
    return session(r.uid);
  }

  function logout(refreshToken) { if (refreshToken) store.takeRefresh(sha256(String(refreshToken))); }

  function userFromAccessToken(token) {
    const claims = decode(token);
    if (!claims || claims.role !== 'authenticated') return null;
    const who = principalOf(claims.sub);
    return who ? { uid: who.uid, role: who.role, classKey: who.classKey } : null;
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

  const stats = () => ({ inflight: inflightTotal, inflightIps: inflight.size, attempts: attempts.size, loginTokens: loginTokens.size, maxKeyLength: Math.max(0, ...[...attempts.keys()].map((k) => k.length)) });

  return { stats, studentLogin, teacherLogin, verify, refresh, logout, userFromAccessToken, loginModeByUsername, classLoginMode };
}
