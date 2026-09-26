// Servidor del nodo escolar (Raspberry Pi). Sirve la app de Quetzal y los
// archivos de los cursos a las tablets de la red local, y una API mínima
// para funcionar sin internet: login con PIN personal, cursos y progreso.
// Se sincroniza con la nube cada vez que detecta internet (sync.js).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb, getMeta } from './db.js';
import { runSync, loadConfig } from './sync.js';

const NODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(NODE_DIR, '..');
const config = loadConfig(NODE_DIR);
const db = openDb(config.dataDir);
const CONTENT_DIR = path.resolve(config.dataDir, 'content');

// Mismos parámetros que js/offline-kit.js: el hash del PIN sirve igual en
// el nodo, en la nube y en las tablets.
const PBKDF2_ITERATIONS = 150000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;
const SESSION_MS = 30 * 24 * 3600 * 1000;

// Solo se sirven archivos de la app (nunca migraciones, config ni la base).
const APP_ALLOWED = [/^index\.html$/, /^manifest\.json$/, /^service-worker\.js$/, /^icon-\d+\.png$/, /^robots\.txt$/,
  /^css\//, /^js\//, /^vendor\//, /^assets\//, /^img\//, /^images\//];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.pdf': 'application/pdf', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.vtt': 'text/vtt',
};

const hashPin = (pin, saltHex) =>
  crypto.pbkdf2Sync(pin, Buffer.from(saltHex, 'hex'), PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
  });
}

// Sirve un archivo con soporte de Range (videos) y sin salir de baseDir.
function serveFile(req, res, baseDir, rel) {
  const file = path.resolve(baseDir, rel);
  if (!file.startsWith(baseDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end('No encontrado');
  }
  const size = fs.statSync(file).size;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
  if (range) {
    const start = range[1] ? parseInt(range[1], 10) : 0;
    const end = range[2] ? Math.min(parseInt(range[2], 10), size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(file).pipe(res);
}

function studentFromSession(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const s = db.prepare('SELECT student_id, created_at FROM sessions WHERE token = ?').get(token);
  if (!s || Date.now() - s.created_at > SESSION_MS) return null;
  return db.prepare('SELECT * FROM students WHERE id = ?').get(s.student_id) || null;
}

const publicStudent = (s) => ({
  id: s.id, username: s.username, full_name: s.full_name, grade: s.grade, section: s.section,
  school_code: getMeta(db, 'school_code'), profile_photo_url: s.profile_photo_url, ...JSON.parse(s.extra || '{}'),
});

const api = {
  // Estado del nodo (lo usa la app para saber que está en modo nodo).
  'GET /api/node/status': (req, res) => sendJson(res, 200, {
    node: true,
    name: getMeta(db, 'node_name'),
    school_code: getMeta(db, 'school_code'),
    storage_base: getMeta(db, 'storage_base'),
    last_sync_at: getMeta(db, 'last_sync_at'),
    pending: {
      completions: db.prepare('SELECT COUNT(*) n FROM completions WHERE dirty = 1').get().n,
      files: db.prepare('SELECT COUNT(*) n FROM files WHERE downloaded = 0').get().n,
    },
  }),

  // Lista para "¿Quién sos?": por grado y sección, sin datos sensibles.
  'GET /api/students': (req, res, url) => {
    const grade = url.searchParams.get('grade');
    const section = url.searchParams.get('section');
    const rows = grade
      ? db.prepare("SELECT * FROM students WHERE grade = ? AND section = ? AND IFNULL(status,'activo') NOT IN ('egresado','baja') ORDER BY full_name").all(grade, section || '')
      : [];
    const classes = db.prepare("SELECT DISTINCT grade, section FROM students WHERE IFNULL(status,'activo') NOT IN ('egresado','baja') ORDER BY grade, section").all();
    sendJson(res, 200, { classes, students: rows.map(s => ({ ...publicStudent(s), has_pin: !!s.pin_hash })) });
  },

  // Login con PIN. Si el alumno todavía no tiene PIN, este mismo pedido
  // lo crea (primera vez en la escuela, sin internet).
  'POST /api/login': async (req, res) => {
    const { student_id, pin, device } = await readBody(req);
    const s = db.prepare('SELECT * FROM students WHERE id = ?').get(student_id);
    if (!s || ['egresado', 'baja'].includes(s.status)) return sendJson(res, 404, { error: 'Alumno no encontrado' });
    if (!/^\d{4}$/.test(String(pin || ''))) return sendJson(res, 400, { error: 'El PIN son 4 números' });
    if (s.locked_until > Date.now()) {
      const mins = Math.ceil((s.locked_until - Date.now()) / 60000);
      return sendJson(res, 429, { error: `Demasiados intentos. Esperá ${mins} minuto(s) o pedile ayuda a tu docente.` });
    }

    let created = false;
    if (!s.pin_hash) {
      const salt = crypto.randomBytes(16).toString('hex');
      db.prepare('UPDATE students SET pin_hash = ?, pin_salt = ?, pin_updated_at = ?, pin_dirty = 1 WHERE id = ?')
        .run(hashPin(String(pin), salt), salt, new Date().toISOString(), s.id);
      created = true;
    } else if (hashPin(String(pin), s.pin_salt) !== s.pin_hash) {
      const attempts = s.failed_attempts + 1;
      db.prepare('UPDATE students SET failed_attempts = ?, locked_until = ? WHERE id = ?')
        .run(attempts >= MAX_ATTEMPTS ? 0 : attempts, attempts >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : 0, s.id);
      return sendJson(res, 401, { error: 'PIN incorrecto' });
    }

    db.prepare('UPDATE students SET failed_attempts = 0, locked_until = 0 WHERE id = ?').run(s.id);
    const token = crypto.randomBytes(32).toString('hex');
    const dev = String(device || req.headers['user-agent'] || '').slice(0, 120);
    const lastEntry = db.prepare('SELECT entered_at, device FROM session_logs WHERE student_id = ? ORDER BY id DESC LIMIT 1').get(s.id) || null;
    db.prepare('INSERT INTO sessions (token, student_id, device, created_at) VALUES (?, ?, ?, ?)').run(token, s.id, dev, Date.now());
    db.prepare('INSERT INTO session_logs (student_id, device, entered_at) VALUES (?, ?, ?)').run(s.id, dev, new Date().toISOString());
    sendJson(res, 200, { token, created, last_entry: lastEntry, student: publicStudent(s) });
  },

  'POST /api/logout': (req, res) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    sendJson(res, 200, { ok: true });
  },

  'GET /api/me': (req, res) => {
    const s = studentFromSession(req);
    if (!s) return sendJson(res, 401, { error: 'Sesión vencida' });
    sendJson(res, 200, { student: publicStudent(s) });
  },

  // Cursos de la clase del alumno + su progreso.
  'GET /api/courses': (req, res) => {
    const s = studentFromSession(req);
    if (!s) return sendJson(res, 401, { error: 'Sesión vencida' });
    const courses = db.prepare('SELECT data FROM courses WHERE grade = ? AND section = ?').all(s.grade, s.section)
      .map(r => JSON.parse(r.data))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const completions = db.prepare('SELECT lesson_id, score, status FROM completions WHERE student_id = ?').all(s.id);
    sendJson(res, 200, { courses, completions });
  },

  // Progreso: la mejor nota gana y "completado" no vuelve atrás.
  'POST /api/completions': async (req, res) => {
    const s = studentFromSession(req);
    if (!s) return sendJson(res, 401, { error: 'Sesión vencida' });
    const { lesson_id, score, status } = await readBody(req);
    if (!lesson_id) return sendJson(res, 400, { error: 'Falta lesson_id' });
    const clean = score == null || score === '' ? null : Math.min(100, Math.max(0, Number(score)));
    db.prepare(`
      INSERT INTO completions (lesson_id, student_id, score, status, updated_at, dirty) VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(lesson_id, student_id) DO UPDATE SET
        score = CASE WHEN excluded.score IS NULL THEN completions.score
                     WHEN completions.score IS NULL THEN excluded.score
                     ELSE MAX(completions.score, excluded.score) END,
        status = CASE WHEN completions.status = 'completed' OR excluded.status = 'completed' THEN 'completed' ELSE excluded.status END,
        updated_at = excluded.updated_at, dirty = 1
    `).run(lesson_id, s.id, clean, status || 'completed', new Date().toISOString());
    sendJson(res, 200, { ok: true });
  },
};

// Script que la app carga para saber que está en un nodo escolar.
function nodeConfigScript() {
  return `window.QUETZAL_NODE = ${JSON.stringify({
    name: getMeta(db, 'node_name'), school_code: getMeta(db, 'school_code'),
    storage_base: getMeta(db, 'storage_base'), last_sync_at: getMeta(db, 'last_sync_at'),
  })};`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://node');
    const route = api[`${req.method} ${url.pathname}`];
    if (route) return await route(req, res, url);

    if (url.pathname === '/node-config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(nodeConfigScript());
    }
    if (url.pathname.startsWith('/content/')) {
      return serveFile(req, res, CONTENT_DIR, decodeURIComponent(url.pathname.slice('/content/'.length)));
    }

    const rel = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'index.html';
    if (!APP_ALLOWED.some(rx => rx.test(rel))) { res.writeHead(404); return res.end('No encontrado'); }
    serveFile(req, res, APP_DIR, rel);
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'Error interno del nodo' });
  }
});

server.listen(config.port || 8080, () => {
  console.log(`🌳 Nodo Quetzal escuchando en el puerto ${config.port || 8080}`);
});

// Sync automático: cada N minutos, si hay internet.
let syncing = false;
async function trySync() {
  if (syncing || !config.nodeToken || config.nodeToken.startsWith('PEGAR')) return;
  syncing = true;
  try { await runSync(db, config); } catch (e) { console.log('⏸️  Sin sync ahora:', e.message); }
  finally { syncing = false; }
}
setTimeout(trySync, 5000);
setInterval(trySync, (config.syncEveryMinutes || 10) * 60 * 1000);
