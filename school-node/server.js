// Servidor del nodo escolar (Raspberry Pi). Sirve la app de Quetzal y los
// archivos de los cursos a las tablets de la red local, y una API mínima
// para funcionar sin internet: login con PIN personal, cursos y progreso.
// Se sincroniza con la nube cada vez que detecta internet (sync.js).
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb, getMeta, setMeta } from './db.js';
import { runSync, loadConfig } from './sync.js';
import { runUsbSync } from './usb-sync.js';
import { startMdns } from './mdns.js';
import { startDns, probeResponse } from './dns.js';
import { parseRange, pipeFile } from './http-range.js';
import { localizeIndexHtml, localizeBootScript } from './offline-assets.js';
import { createProjectStore, ProjectError } from './projects.js';
import { PROJECT_LIMITS } from './project-rules.js';
import { buildStudentFeed } from './feed.js';
import { createXpStore, XP_PER_LESSON } from './xp.js';
import { createReactionStore, ReactionError } from './reactions.js';
import { createEvaluationStore, EvaluationError } from './evaluations.js';
import { createTeacherStore, TeacherAuthError } from './teachers.js';
import { friendlySyncError } from './sync-errors.js';
import { createRestLayer } from './rest/index.js';
import { createPhotos } from './rest/photos.js';
import { createContentStore, createStorageHandler } from './content-upload.js';
import { createProfilePhotoStore, createProfilePhotoHandler } from './profile-photos.js';
import { createProjectFiles, createProjectFilesHandler, projectFileKind } from './project-files.js';
import { POLYFILLS } from './browser-polyfills.js';
import { createWifi, createNmcliRunner } from './wifi.js';
import { checkInternet, createConnectivity } from './connectivity.js';
import { createRemoteSync } from './remote-sync.js';
import { createSelfUpdate } from './self-update.js';
import { createMediaSigner, isPrivateCloudUrl } from './media-sign.js';
import { createProjectMirror } from './project-mirror.js';
import { wifiPageHtml } from './wifi-page.js';

const NODE_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(NODE_DIR, '..');
const config = loadConfig(NODE_DIR);
const db = openDb(config.dataDir);
const CONTENT_DIR = path.resolve(config.dataDir, 'content');

// Proyectos que suben los estudiantes (video o modelo 3D). Las opciones se pueden bajar en config.json.
const projectLimits = {
  ...PROJECT_LIMITS,
  maxBytes: config.projectMaxBytes ?? PROJECT_LIMITS.maxBytes,
  maxPendingPerStudent: config.maxPendingProjects ?? PROJECT_LIMITS.maxPendingPerStudent,
  minFreeDiskMB: config.minFreeDiskMB ?? PROJECT_LIMITS.minFreeDiskMB,
  keepSyncedDays: config.keepSyncedProjectDays ?? PROJECT_LIMITS.keepSyncedDays,
};
const projectStore = createProjectStore(db, { dataDir: config.dataDir, limits: projectLimits });
const xpStore = createXpStore(db);
const reactionStore = createReactionStore(db);
const evaluationStore = createEvaluationStore(db);
// Código de docente del nodo (config.teacherCode): crea el PIN personal de cada docente. Comparte el bloqueo de
// intentos del panel de administración.
function verifyTeacherCode(code) {
  if (!config.teacherCode || String(config.teacherCode).length < 6) return false;
  if (teacherLockedUntil > Date.now()) return false;
  if (code === undefined || code === null || !safeEqual(code, config.teacherCode)) {
    teacherFails++;
    if (teacherFails >= 5) { teacherFails = 0; teacherLockedUntil = Date.now() + LOCK_MS; }
    return false;
  }
  teacherFails = 0;
  return true;
}
// hashPin y safeEqual se declaran más abajo: se llaman a través de funciones para no leerlos antes de tiempo.
// Capa local compatible con Supabase (/rest/v1, /auth/v1, /functions/v1/student-login): réplica de la nube en SQLite.
// Proyectos que el estudiante sube con la app real: el archivo llega por el Storage emulado (project-files.js) y al insertar la fila pasa al
// almacén de proyectos, que lo sube a la nube. La capa local solo necesita saber qué se subió, cuántos esperan y cómo registrarlo.
const projectFiles = createProjectFiles({ db, dir: path.resolve(config.dataDir, 'project-uploads') });
const uploadNameOf = (url) => { try { return /^\/storage\/v1\/object\/public\/project-videos\/([^/]+)$/.exec(new URL(url, 'http://nodo.local').pathname)?.[1] ?? ''; } catch { return ''; } };
let restLayer = null;
const restProjects = {
  upload: (name) => projectFiles.record(name),
  pendingCount: (uid) => db.prepare("SELECT COUNT(*) n FROM projects WHERE student_id = ? AND status IN ('uploading', 'pending')").get(uid).n,
  register: (row) => {
    const name = uploadNameOf(row.video_url);
    try {
      const rec = projectFiles.record(name);
      const { ext } = projectFileKind(name, rec.mime);
      projectStore.registerUploaded(row.user_id, { title: row.title, description: row.description, bimestre: row.bimestre, group_id: row.group_id, ext, size: rec.size }, projectFiles.filePath(name));
      projectFiles.markUsed(name);
    } catch (e) {
      console.error('No se pudo registrar el proyecto subido con la app:', e.message);
      restLayer?.store.remove('projects', row.id); // sin archivo registrado no hay proyecto que mostrar
    }
  },
};
const profilePhotoStore = createProfilePhotoStore({ db, dir: path.resolve(config.dataDir, 'profile-photos') });
restLayer = createRestLayer(db, { projects: restProjects, profilePhotos: profilePhotoStore });
const restStore = restLayer.store;
// La app real solo se monta sobre la capa local cuando la réplica ya tiene a los estudiantes y las contraseñas de
// clase; mientras tanto el nodo se comporta como antes (pantalla propia con PIN).
const restReady = () => restLayer.ready();
const restRoutes = restLayer.routes;
// Archivos de cursos que el docente sube en el nodo (Storage de Supabase emulado); suben a la nube al sincronizar.
// Wi-Fi del servidor (solo Raspberry Pi / Linux con NetworkManager): el docente la conecta desde /wifi sin SSH.
const wifi = createWifi({ run: createNmcliRunner({ command: Array.isArray(config.nmcli) && config.nmcli.length ? config.nmcli : ['nmcli'] }), platform: config.wifiPlatform || process.platform });
// ¿Llega a la nube? (con el motivo en español si no): lo usan la pantalla de Wi-Fi y el vigilante de conexión de más abajo.
const internetCheck = () => checkInternet(config.cloudUrl);
const internetReachable = async () => (await internetCheck())?.online ?? null;
// Solo docentes y administradores (sesión de la app, o el panel del docente con su código).
function networkUser(req, res) {
  if (teacherFromRequest(req)) return true;
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const who = token ? restLayer.auth.userFromAccessToken(token) : null;
  if (!who) { sendJson(res, 401, { error: 'Entra con tu correo y contraseña de docente.' }); return false; }
  if (who.role !== 'teacher' && who.role !== 'admin') { sendJson(res, 403, { error: 'Solo los docentes pueden cambiar la Wi-Fi.' }); return false; }
  return true;
}
const wifiRoute = (fn) => async (req, res, url) => {
  if (!networkUser(req, res)) return;
  try { sendJson(res, 200, await fn(req, url)); } catch (e) { sendJson(res, e.status || 500, { error: e.status ? e.message : 'No se pudo completar la acción.' }); }
};
const contentStore = createContentStore({ db, dir: CONTENT_DIR });
const storageHandler = createStorageHandler({ store: contentStore, auth: restLayer.auth });
const profilePhotoHandler = createProfilePhotoHandler({ store: profilePhotoStore, auth: restLayer.auth });
const projectFilesHandler = createProjectFilesHandler({ store: projectFiles, auth: restLayer.auth, reserveBytes: (projectLimits.minFreeDiskMB ?? 2048) * 1024 * 1024 });
// Fotos, videos y adjuntos de la nube en buckets privados: se piden firmados a node-sync (ver media-sign.js).
const mediaSigner = createMediaSigner({ cloudUrl: config.cloudUrl, nodeToken: config.nodeToken });
const photosStore = createPhotos({ db, dir: path.resolve(config.dataDir, 'photos') });
const projectMirror = createProjectMirror({ db, dir: path.resolve(config.dataDir, 'project-mirror') });
const teacherStore = createTeacherStore(db, { hashPin: (pin, salt) => hashPin(pin, salt), verifySetupCode: (code) => verifyTeacherCode(code) });
projectStore.cleanup(); // borradores huérfanos de una subida cortada por un reinicio o un apagón
setInterval(() => projectStore.cleanup(), 3600_000).unref();
setInterval(() => projectFiles.cleanup(), 3600_000).unref();

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
  '.crt': 'application/x-x509-ca-cert',
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

// Compresión gzip de lo que es texto (la app son ~2 MB de JavaScript: comprimidos bajan a ~0.6 MB, y por el Wi-Fi de la escuela
// eso es lo que más pesa cuando muchas tablets abren la app a la vez). Se comprime UNA vez por archivo y se guarda en memoria.
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.xml', '.vtt']);
const GZIP_MAX_BYTES = 5 * 1024 * 1024;
const gzipCache = new Map(); // archivo -> { mtimeMs, size, buf }
const acceptsGzip = (req) => { const h = String(req.headers['accept-encoding'] || ''); return /gzip/i.test(h) && !/gzip\s*;\s*q=0(\.0*)?\s*(,|$)/i.test(h); };
function gzippedFile(file, st) {
  const hit = gzipCache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.buf;
  if (gzipCache.size > 600) gzipCache.clear();
  const buf = zlib.gzipSync(fs.readFileSync(file), { level: 6 });
  gzipCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, buf });
  return buf;
}

// Sirve un archivo con soporte de Range (videos) y sin salir de baseDir.
function serveFile(req, res, baseDir, rel) {
  const file = path.resolve(baseDir, rel);
  if (!file.startsWith(baseDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end('No encontrado');
  }
  const size = fs.statSync(file).size;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = parseRange(req.headers.range, size);
  if (range && !range.ok) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
  if (range) {
    const { start, end } = range;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return pipeFile(res, fs.createReadStream(file, { start, end }));
  }
  if (COMPRESSIBLE.has(path.extname(file).toLowerCase()) && size <= GZIP_MAX_BYTES && acceptsGzip(req)) {
    const gz = gzippedFile(file, fs.statSync(file));
    res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip', 'Content-Length': gz.length, Vary: 'Accept-Encoding' });
    return res.end(gz);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', Vary: 'Accept-Encoding' });
  pipeFile(res, fs.createReadStream(file));
}

// Punto de entrada de un paquete SCORM/HTML5: como la función serve-scorm-entry de la nube, entrega el HTML con un <base href> hacia la carpeta del paquete
// (la app lo mete en un iframe con srcdoc, y sin el <base> sus css/js relativos se buscarían en la raíz del servidor).
const SCORM_ENTRY_MAX_BYTES = 2 * 1024 * 1024; // un HTML de entrada pesa KB; esto evita leer a memoria un video si alguien apunta ?path= a un .mp4
// Host válido: nombre o IPv4 con puerto opcional, o IPv6 entre corchetes. Se interpola en <base href>, así que no puede traer comillas ni etiquetas.
const SAFE_HOST = /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::\d{1,5})?$/i;
function serveScormEntry(res, rel, host, proto = 'http') {
  const file = path.resolve(CONTENT_DIR, rel);
  if (!file.startsWith(CONTENT_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('No encontrado'); }
  if (!/\.html?$/i.test(file)) { res.writeHead(404); return res.end('No encontrado'); }
  if (fs.statSync(file).size > SCORM_ENTRY_MAX_BYTES) { res.writeHead(413); return res.end('Archivo demasiado grande'); }
  if (!SAFE_HOST.test(String(host || ''))) { res.writeHead(400); return res.end('Host no válido'); }
  const folder = rel.slice(0, rel.lastIndexOf('/') + 1).split('/').map((x) => encodeURIComponent(x)).join('/');
  const baseTag = `<base href="${proto}://${host}/storage/v1/object/public/course-content/${folder}">`;
  let html = fs.readFileSync(file, 'utf8');
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + baseTag) : baseTag + html;
  const body = Buffer.from(html, 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
  res.end(body);
}

// index.html se entrega con las librerías de CDN cambiadas por las copias locales
// (vendor/cdn/), para que la app arranque sin internet. Ver offline-assets.js.
let indexCache = { mtimeMs: 0, html: '', gz: null };
// js/boot.js lleva el cargador de librerías: se entrega con las copias locales de vendor/cdn/ igual que index.html.
function serveBoot(req, res) {
  const body = Buffer.from(localizeBootScript(fs.readFileSync(path.join(APP_DIR, 'js', 'boot.js'), 'utf8')), 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
  res.end(body);
}
function serveIndex(req, res) {
  const file = path.join(APP_DIR, 'index.html');
  const { mtimeMs } = fs.statSync(file);
  if (indexCache.mtimeMs !== mtimeMs) indexCache = { mtimeMs, html: localizeIndexHtml(fs.readFileSync(file, 'utf8')), gz: null };
  // /node-config.js define window.QUETZAL_NODE antes que cualquier módulo: config.js decide con él a quién le habla.
  const body = Buffer.from(indexCache.html.replace(/<head[^>]*>/i, (m) => `${m}
<script src="/node-config.js"></script>`), 'utf8');
  if (acceptsGzip(req)) {
    indexCache.gz ||= zlib.gzipSync(body, { level: 6 });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Encoding': 'gzip', 'Content-Length': indexCache.gz.length, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' });
    return res.end(indexCache.gz);
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-cache', Vary: 'Accept-Encoding' });
  res.end(body);
}

// ---- Rutas con id: PUT /api/projects/:id/file y DELETE /api/projects/:id ----
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function projectRoute(method, pathname) {
  let m;
  if (method === 'PUT' && (m = /^\/api\/projects\/([^/]+)\/file$/.exec(pathname))) return (req, res) => putProjectFile(req, res, m[1]);
  if (method === 'DELETE' && (m = /^\/api\/projects\/([^/]+)$/.exec(pathname))) return (req, res) => deleteProject(req, res, m[1]);
  if (method === 'POST' && (m = /^\/api\/projects\/([^/]+)\/react$/.exec(pathname))) return (req, res) => reactToProject(req, res, m[1]);
  if (method === 'GET' && (m = /^\/api\/teacher\/evaluations\/([^/]+)$/.exec(pathname))) return (req, res) => teacherProjectDetail(req, res, m[1]);
  if (method === 'GET' && (m = /^\/api\/teacher\/project-file\/([^/]+)$/.exec(pathname))) return (req, res) => teacherProjectFile(req, res, m[1]);
  return null;
}

// ---- Docente con PIN personal: evaluar proyectos de sus clases ----
const TEACHER_PERSONAL_MS = 8 * 3600 * 1000;
const personalTeacherSessions = new Map(); // token -> { id, exp }

// El video se pide con <video src>, que no puede mandar cabeceras: solo esa ruta acepta el token en ?t=.
function personalTeacherFromRequest(req, { allowQuery = false } = {}) {
  let token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token && allowQuery) token = new URL(req.url, 'http://x').searchParams.get('t') || '';
  const s = personalTeacherSessions.get(token);
  if (!s || s.exp < Date.now()) { personalTeacherSessions.delete(token); return null; }
  return teacherStore.get(s.id);
}

function evaluationErrorResponse(res, e) {
  if (e instanceof EvaluationError) return sendJson(res, e.status, { error: e.message });
  console.error('Error en evaluaciones del docente:', e.message);
  return sendJson(res, 500, { error: 'No se pudo completar la acción.' });
}

function teacherProjectDetail(req, res, rawKey) {
  const t = personalTeacherFromRequest(req);
  if (!t) return sendJson(res, 401, { error: 'Entra con tu PIN de docente.' });
  try {
    let key = rawKey;
    try { key = decodeURIComponent(rawKey); } catch { /* clave inválida: 404 abajo */ }
    const detail = evaluationStore.get(t, key);
    const hasFile = !!detail.local_id && fs.existsSync(projectStore.finalPath(detail.local_id));
    sendJson(res, 200, { ...detail, has_file: hasFile });
  } catch (e) { evaluationErrorResponse(res, e); }
}

// Sirve el video o modelo guardado en el nodo, con Range para poder adelantar el video.
function teacherProjectFile(req, res, id) {
  const t = personalTeacherFromRequest(req, { allowQuery: true });
  if (!t) return sendJson(res, 401, { error: 'Entra con tu PIN de docente.' });
  if (!UUID.test(id)) return sendJson(res, 404, { error: 'Archivo no encontrado.' });
  try {
    evaluationStore.get(t, `l:${id}`); // 404 si no existe, 403 si no es de una de sus clases
    const file = projectStore.finalPath(id);
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'El archivo ya no está en esta computadora.' });
    const mime = db.prepare('SELECT mime FROM projects WHERE id = ?').get(id)?.mime || 'application/octet-stream';
    const size = fs.statSync(file).size;
    const headers = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    let start = 0, end = size - 1, status = 200;
    if (range && (range[1] !== '' || range[2] !== '')) {
      if (range[1] === '') { start = Math.max(0, size - Number(range[2])); } else { start = Number(range[1]); if (range[2] !== '') end = Math.min(end, Number(range[2])); }
      if (start >= size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return res.end();
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    const stream = fs.createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (e) { evaluationErrorResponse(res, e); }
}

// Reacción a un proyecto del Inicio (id = id del proyecto en la nube). Solo se puede reaccionar a lo que el estudiante
// ve en su Inicio (aprobados de su clase, los suyos y los de su equipo); la nube cuenta los votos al sincronizar.
async function reactToProject(req, res, id) {
  const s = studentFromSession(req);
  if (!s) return sendJson(res, 401, { error: 'Sesión vencida' });
  const { reaction } = await readBody(req);
  const visible = /^\d{1,10}$/.test(id) && buildStudentFeed(db, s, []).some(p => p.id === id && p.state === 'cloud');
  if (!visible) return sendJson(res, 404, { error: 'Proyecto no encontrado.' });
  try {
    const { mine } = reactionStore.react(s.id, id, reaction);
    const cloudVotes = db.prepare('SELECT votes FROM cloud_projects WHERE id = ?').get(id)?.votes ?? 0;
    sendJson(res, 200, { mine, votes: reactionStore.adjustVotes(id, cloudVotes) });
  } catch (e) {
    if (e instanceof ReactionError) return sendJson(res, e.status, { error: e.message });
    throw e;
  }
}

// Subidas en curso (id -> aborta esa subida y resuelve cuando ya limpió). Evita que un DELETE o un
// segundo PUT toquen por debajo el archivo que otra conexión está escribiendo.
const activeUploads = new Map();

async function deleteProject(req, res, id) {
  const s = studentFromSession(req);
  if (!s) return sendJson(res, 401, { error: 'Sesión vencida' });
  if (!UUID.test(id)) return sendJson(res, 404, { error: 'Proyecto no encontrado.' });
  try {
    if (activeUploads.has(id) && projectStore.getDraft(id, s.id)) {
      await activeUploads.get(id)();
      return sendJson(res, 200, { ok: true });
    }
    if (!projectStore.cancel(id, s.id)) return sendJson(res, 404, { error: 'Proyecto no encontrado.' });
  } catch (e) {
    if (e instanceof ProjectError) return sendJson(res, e.status, { error: e.message });
    console.error('No se pudo quitar un proyecto:', e.message);
    return sendJson(res, 500, { error: 'No se pudo quitar el proyecto.' });
  }
  sendJson(res, 200, { ok: true });
}

// Recibe el archivo en streaming: cuenta los bytes mientras llegan, corta si se pasa de lo
// anunciado y, si la conexión se cae a mitad, no deja nada a medias.
function putProjectFile(req, res, id) {
  const s = studentFromSession(req);
  if (!s) { req.resume(); return sendJson(res, 401, { error: 'Sesión vencida' }); }
  const draft = UUID.test(id) ? projectStore.getDraft(id, s.id) : null;
  if (!draft) { req.resume(); return sendJson(res, 404, { error: 'Proyecto no encontrado.' }); }
  if (activeUploads.has(id)) { req.resume(); return sendJson(res, 409, { error: 'Este archivo ya se está subiendo desde otro lugar.' }); }

  let finished = false;
  let out = null;
  let cleaned = Promise.resolve();
  const abandon = (status, message) => {
    if (finished) return;
    finished = true;
    activeUploads.delete(id);
    // El archivo se abre de forma asíncrona: se borra recién cuando el flujo cerró, si no el .part reaparece.
    if (out) {
      cleaned = new Promise((resolve) => out.once('close', () => { projectStore.abortUpload(id); resolve(); }));
      out.destroy();
    } else projectStore.abortUpload(id);
    if (status && !res.headersSent) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', Connection: 'close' });
      res.end(JSON.stringify({ error: message }));
    }
    req.destroy();
  };

  activeUploads.set(id, () => { abandon(0); return cleaned; });

  const declared = draft.file_size;
  if (Number(req.headers['content-length']) !== declared) return abandon(400, 'El tamaño del archivo no coincide con lo que anunciaste.');

  out = fs.createWriteStream(projectStore.tmpPath(id));
  out.on('error', () => abandon(507, 'No se pudo guardar el archivo en la computadora de la escuela.'));

  let received = 0;
  req.on('data', (chunk) => {
    received += chunk.length;
    if (received > declared) return abandon(413, 'El archivo es más grande de lo que anunciaste.');
    if (!out.write(chunk)) { req.pause(); out.once('drain', () => req.resume()); }
  });
  req.on('end', () => {
    if (finished) return;
    out.end(() => {
      if (finished) return;
      if (received !== declared) return abandon(400, 'El archivo llegó incompleto.');
      out = null; // ya cerró: si algo falla ahora, abandon limpia al momento
      try {
        projectStore.finishUpload(id, received);
      } catch (e) {
        // Un error aquí (antivirus que retiene el .part, proyecto borrado) no debe tumbar el nodo de toda la escuela.
        console.error('No se pudo terminar la subida de un proyecto:', e.message);
        return abandon(500, 'No se pudo guardar el proyecto. Intenta de nuevo.');
      }
      finished = true;
      activeUploads.delete(id);
      sendJson(res, 200, { ok: true });
    });
  });
  req.on('close', () => { if (!req.complete) abandon(0); });
  req.on('error', () => abandon(0));
}

function studentFromSession(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const s = db.prepare('SELECT student_id, created_at FROM sessions WHERE token = ?').get(token);
  if (!s || Date.now() - s.created_at > SESSION_MS) return null;
  return db.prepare('SELECT * FROM students WHERE id = ?').get(s.student_id) || null;
}

// ---- Panel del docente (sin internet: código de docente del config.json) ----
const TEACHER_SESSION_MS = 8 * 3600 * 1000;
const teacherSessions = new Map(); // token -> vence
let teacherFails = 0, teacherLockedUntil = 0;

function teacherFromRequest(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const exp = teacherSessions.get(token);
  if (!exp || exp < Date.now()) { teacherSessions.delete(token); return false; }
  return true;
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const publicStudent = (s) => ({
  id: s.id, username: s.username, full_name: s.full_name, grade: s.grade, section: s.section,
  school_code: getMeta(db, 'school_code'), profile_photo_url: s.profile_photo_url, ...JSON.parse(s.extra || '{}'),
});

// Cambios de la app que faltan por subir a la nube (lo ve el docente en la barra y la plataforma en línea).
const pendingChanges = () => restStore.pendingCount()
  + db.prepare('SELECT COUNT(*) n FROM completions WHERE dirty = 1').get().n
  + db.prepare("SELECT COUNT(*) n FROM xp_events_local WHERE kind = 'chest'").get().n;

const api = {
  // Estado del nodo (lo usa la app para saber que está en modo nodo).
  'GET /api/node/status': (req, res) => sendJson(res, 200, {
    node: true,
    rest: restReady(),
    // Cuando la app real no se puede activar: qué clases no tienen contraseña (solo grado y sección, nada más).
    rest_missing: restReady() ? [] : restLayer.missingClasses(),
    name: getMeta(db, 'node_name'),
    school_code: getMeta(db, 'school_code'),
    storage_base: getMeta(db, 'storage_base'),
    last_sync_at: getMeta(db, 'last_sync_at'),
    // Lo que falta por subir a la nube (cambios de la app real + lo del modo anterior) y cómo va la sincronización.
    pending_changes: pendingChanges(),
    syncing,
    sync_stage: syncing ? syncStage : null,
    sync_cause: syncing ? syncCause : null,
    // Si el servidor llega a la nube (revisado cada 15 s) y, si no, por qué; y las direcciones por las que se abre ahora (cambian al cambiar de red).
    internet: { online: connectivity.state.online, detail: connectivity.state.detail, checked_at: connectivity.state.checked_at },
    urls: lanUrls(),
    // Servidor de nombres del kit (dns.js): en qué IP escucha y cuántos dispositivos le han preguntado (si es 0, el router no entrega esta IP como DNS).
    dns: dns ? dns.state : null,
    sync_error: lastSyncError ? lastSyncError.message : null,
    pending: {
      completions: db.prepare('SELECT COUNT(*) n FROM completions WHERE dirty = 1').get().n,
      files: db.prepare('SELECT COUNT(*) n FROM files WHERE downloaded = 0').get().n,
      // Archivos de cursos que el docente subió aquí y faltan por llegar a la nube, y los que la nube rechazó (con el motivo).
      uploads: contentStore.pendingCount() + profilePhotoStore.pendingCount(),
      uploads_rejected: contentStore.rejected().map((r) => ({ path: r.path, error: r.error })),
    },
  }),

  // «Sincronizar ahora»: no pide sesión (el botón también está en la pantalla de entrada; sincronizar no expone ni cambia datos
  // de nadie). No martilla a la nube: si ya se está sincronizando, o se pidió hace menos de 15 s, no arranca otra.
  'GET /api/wifi/status': wifiRoute(async () => { const s = await wifi.status(); if (!s.supported) return s; const c = await internetCheck(); return { ...s, internet: c?.online ?? null, internet_detail: c?.detail ?? null }; }),
  'GET /api/wifi/scan': wifiRoute(async () => ({ networks: await wifi.scan() })),
  'POST /api/wifi/connect': wifiRoute(async (req) => { const r = await wifi.connect(await readBody(req)); const c = await internetCheck(); connectivity.tick(); return { ...r, internet: c?.online ?? null, internet_detail: c?.detail ?? null }; }),
  'POST /api/wifi/forget': wifiRoute(async (req) => wifi.forget(await readBody(req))),

  'POST /api/sync/now': (req, res) => {
    if (!hasToken()) return sendJson(res, 400, { error: 'Esta escuela todavía no está conectada a la nube.' });
    if (syncing) return sendJson(res, 200, { started: false, syncing: true });
    if (Date.now() - lastSyncRequestAt < 15_000) return sendJson(res, 200, { started: false, throttled: true });
    lastSyncRequestAt = Date.now();
    lastSyncError = null;
    trySync('button');
    sendJson(res, 200, { started: true });
  },

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
      return sendJson(res, 429, { error: `Demasiados intentos. Espera ${mins} minuto(s) o pídele ayuda a tu docente.` });
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

  // ---- Proyectos (video o modelo 3D) que sube el estudiante; se publican en la nube al sincronizar ----
  'GET /api/projects/groups': (req, res) => {
    const s = studentFromSession(req);
    if (!s) return sendJson(res, 401, { error: 'Sesión vencida' });
    sendJson(res, 200, { groups: projectStore.groupsFor(s.id) });
  },
  // ---- Docentes: lista pública, PIN personal y evaluar proyectos de sus clases ----
  'GET /api/teachers': (req, res) => sendJson(res, 200, { teachers: teacherStore.list() }),
  // Entra con el PIN personal; la primera vez lo crea, con el código de docente del nodo.
  'POST /api/teacher/pin-login': async (req, res) => {
    const { teacher_id, pin, code } = await readBody(req);
    try {
      const { teacher, created } = teacherStore.login(String(teacher_id ?? ''), pin, code);
      const token = crypto.randomBytes(32).toString('hex');
      personalTeacherSessions.set(token, { id: teacher.id, exp: Date.now() + TEACHER_PERSONAL_MS });
      sendJson(res, 200, { token, created, teacher: { id: teacher.id, full_name: teacher.full_name, assignments: teacher.assignments } });
    } catch (e) {
      if (e instanceof TeacherAuthError) return sendJson(res, e.status, { error: e.message });
      throw e;
    }
  },
  'GET /api/teacher/evaluations': (req, res) => {
    const t = personalTeacherFromRequest(req);
    if (!t) return sendJson(res, 401, { error: 'Entra con tu PIN de docente.' });
    sendJson(res, 200, { projects: evaluationStore.listForTeacher(t) });
  },
  'POST /api/teacher/evaluate': async (req, res) => {
    const t = personalTeacherFromRequest(req);
    if (!t) return sendJson(res, 401, { error: 'Entra con tu PIN de docente.' });
    const { key, ...input } = (await readBody(req)) || {};
    try {
      const r = evaluationStore.save(t, String(key ?? ''), input);
      sendJson(res, 200, { ok: true, total_score: r.total_score });
    } catch (e) { evaluationErrorResponse(res, e); }
  },
  // Quien administra el nodo (código compartido) restablece el PIN de un docente que lo olvidó.
  'POST /api/teacher/reset-teacher-pin': async (req, res) => {
    if (!teacherFromRequest(req)) return sendJson(res, 401, { error: 'Sesión de docente vencida' });
    const { teacher_id } = (await readBody(req)) || {};
    if (!teacherStore.resetPin(String(teacher_id ?? ''))) return sendJson(res, 404, { error: 'Docente no encontrado.' });
    sendJson(res, 200, { ok: true });
  },

  // XP del estudiante: base de la última sincronización + lo ganado aquí que la nube aún no confirmó.
  'GET /api/xp': (req, res) => {
    const s = studentFromSession(req);
    if (!s) return sendJson(res, 401, { error: 'Sesión vencida' });
    sendJson(res, 200, xpStore.summary(s));
  },
  // Cofre diario: el nodo sortea el premio; la nube lo valida y lo suma al sincronizar.
  'POST /api/chest': (req, res) => {
    const s = studentFromSession(req);
    if (!s) return sendJson(res, 401, { error: 'Sesión vencida' });
    try {
      sendJson(res, 200, xpStore.claimChest(s));
    } catch (e) {
      if (e.name === 'XpError') return sendJson(res, e.status, { error: e.message });
      throw e;
    }
  },
  // Inicio del estudiante: proyectos de su clase (fichas de la nube, sin videos) + los suyos guardados aquí.
  'GET /api/feed': (req, res) => {
    const s = studentFromSession(req);
    if (!s) return sendJson(res, 401, { error: 'Sesión vencida' });
    sendJson(res, 200, { projects: buildStudentFeed(db, s, projectStore.feedRows(s.id)) });
  },
  'GET /api/projects/mine': (req, res) => {
    const s = studentFromSession(req);
    if (!s) return sendJson(res, 401, { error: 'Sesión vencida' });
    sendJson(res, 200, { projects: projectStore.listMine(s.id) });
  },
  'POST /api/projects': async (req, res) => {
    const s = studentFromSession(req);
    if (!s) return sendJson(res, 401, { error: 'Sesión vencida' });
    try {
      const body = await readBody(req);
      const meta = { ip: String(req.socket.remoteAddress || '').replace(/^::ffff:/, ''), userAgent: req.headers['user-agent'] || '' };
      sendJson(res, 200, projectStore.createDraft(s.id, body, meta));
    } catch (e) {
      if (e instanceof ProjectError) return sendJson(res, e.status, { error: e.message });
      throw e;
    }
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

  'POST /api/teacher/login': async (req, res) => {
    const { code } = await readBody(req);
    if (!config.teacherCode || String(config.teacherCode).length < 6) {
      return sendJson(res, 400, { error: 'Este nodo no tiene código de docente. Agrega "teacherCode" en config.json.' });
    }
    if (teacherLockedUntil > Date.now()) return sendJson(res, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    if (!safeEqual(code, config.teacherCode)) {
      teacherFails++;
      if (teacherFails >= 5) { teacherFails = 0; teacherLockedUntil = Date.now() + LOCK_MS; }
      return sendJson(res, 401, { error: 'Código incorrecto' });
    }
    teacherFails = 0;
    const token = crypto.randomBytes(32).toString('hex');
    teacherSessions.set(token, Date.now() + TEACHER_SESSION_MS);
    sendJson(res, 200, { token });
  },

  // Resumen para el docente: alumnos por clase, estado del PIN, último
  // ingreso y cuánto avanzaron; y el estado de la sincronización.
  'GET /api/teacher/overview': (req, res) => {
    if (!teacherFromRequest(req)) return sendJson(res, 401, { error: 'Sesión de docente vencida' });
    const students = db.prepare(`
      SELECT s.id, s.full_name, s.grade, s.section, s.pin_hash IS NOT NULL AS has_pin, s.locked_until,
        (SELECT MAX(entered_at) FROM session_logs l WHERE l.student_id = s.id) AS last_entry,
        (SELECT COUNT(*) FROM completions c WHERE c.student_id = s.id AND c.status = 'completed') AS completed
      FROM students s WHERE IFNULL(s.status,'activo') NOT IN ('egresado','baja')
      ORDER BY s.grade, s.section, s.full_name`).all()
      .map(s => ({ ...s, has_pin: !!s.has_pin, locked: s.locked_until > Date.now() }));
    const logs = db.prepare(`
      SELECT l.entered_at, l.device, s.full_name, s.grade, s.section
      FROM session_logs l LEFT JOIN students s ON s.id = l.student_id
      ORDER BY l.id DESC LIMIT 60`).all();
    sendJson(res, 200, {
      node: { name: getMeta(db, 'node_name'), last_sync_at: getMeta(db, 'last_sync_at'), last_usb_sync_at: getMeta(db, 'last_usb_sync_at'), has_token: hasToken(), syncing, last_error: lastSyncError?.message || null },
      pending: {
        completions: db.prepare('SELECT COUNT(*) n FROM completions WHERE dirty = 1').get().n,
        pins: db.prepare('SELECT COUNT(*) n FROM students WHERE pin_dirty = 1').get().n,
        sessions: db.prepare('SELECT COUNT(*) n FROM session_logs WHERE dirty = 1').get().n,
        files: db.prepare('SELECT COUNT(*) n FROM files WHERE downloaded = 0').get().n,
      },
      students,
      logs,
      projects: projectStore.counts(),
      teachers: teacherStore.list(),
    });
  },

  // El alumno olvidó su PIN: se borra y crea uno nuevo en su próximo
  // ingreso. Se sincroniza con la nube (el borrado también viaja).
  // Guarda el token de la escuela (lo da el administrador) y sincroniza ya, para que
  // un docente no tenga que editar config.json. Solo con sesión de docente.
  'POST /api/teacher/token': async (req, res) => {
    if (!teacherFromRequest(req)) return sendJson(res, 401, { error: 'Sesión de docente vencida' });
    const body = await readBody(req);
    const token = String(body.token ?? '').replace(/["'\s]/g, '');
    if (!/^[0-9a-fA-F]{64}$/.test(token)) {
      return sendJson(res, 400, { error: 'El token debe tener 64 letras y números. Cópialo completo, tal como lo dio el administrador.' });
    }
    try {
      // Se escribe en el mismo archivo (no uno nuevo) para conservar sus permisos.
      const raw = JSON.parse(fs.readFileSync(config.configFile, 'utf8').replace(/^﻿/, ''));
      raw.nodeToken = token;
      fs.writeFileSync(config.configFile, JSON.stringify(raw, null, 2));
    } catch (e) {
      console.error('No se pudo guardar el token:', e.message);
      return sendJson(res, 500, { error: 'No se pudo guardar el token en esta computadora.' });
    }
    config.nodeToken = token;
    lastSyncError = null;
    trySync(); // sin esperar: puede tardar (descarga de archivos); el panel consulta el avance
    sendJson(res, 200, { saved: true });
  },

  'POST /api/teacher/sync-now': (req, res) => {
    if (!teacherFromRequest(req)) return sendJson(res, 401, { error: 'Sesión de docente vencida' });
    if (!hasToken()) return sendJson(res, 400, { error: 'Falta el token de la escuela.' });
    if (syncing) return sendJson(res, 200, { started: false, syncing: true });
    lastSyncError = null;
    trySync();
    sendJson(res, 200, { started: true });
  },

  'POST /api/teacher/reset-pin': async (req, res) => {
    if (!teacherFromRequest(req)) return sendJson(res, 401, { error: 'Sesión de docente vencida' });
    const { student_id } = await readBody(req);
    const r = db.prepare(`UPDATE students SET pin_hash = NULL, pin_salt = NULL, pin_updated_at = ?, pin_dirty = 1,
      failed_attempts = 0, locked_until = 0 WHERE id = ?`).run(new Date().toISOString(), student_id);
    if (!r.changes) return sendJson(res, 404, { error: 'Alumno no encontrado' });
    db.prepare('DELETE FROM sessions WHERE student_id = ?').run(student_id);
    sendJson(res, 200, { ok: true });
  },

  'POST /api/teacher/unlock': async (req, res) => {
    if (!teacherFromRequest(req)) return sendJson(res, 401, { error: 'Sesión de docente vencida' });
    const { student_id } = await readBody(req);
    db.prepare('UPDATE students SET failed_attempts = 0, locked_until = 0 WHERE id = ?').run(student_id);
    sendJson(res, 200, { ok: true });
  },

  // Progreso: la mejor nota gana y "completado" no vuelve atrás.
  'POST /api/completions': async (req, res) => {
    const s = studentFromSession(req);
    if (!s) return sendJson(res, 401, { error: 'Sesión vencida' });
    const { lesson_id, score, status } = await readBody(req);
    if (!lesson_id) return sendJson(res, 400, { error: 'Falta lesson_id' });
    // Solo lecciones de los cursos de la clase del estudiante: un id inventado o ajeno no es progreso (y la
    // nube rechazaría la sincronización completa con una lección inexistente).
    const lessonIds = new Set(db.prepare('SELECT data FROM courses WHERE grade = ? AND section = ?').all(s.grade, s.section)
      .flatMap(r => { try { return (JSON.parse(r.data).lessons || []).map(l => String(l.id)); } catch { return []; } }));
    if (!lessonIds.has(String(lesson_id))) return sendJson(res, 404, { error: 'Esa lección no existe en tu clase.' });
    const clean = score == null || score === '' ? null : Math.min(100, Math.max(0, Number(score)));
    const prev = db.prepare('SELECT status FROM completions WHERE lesson_id = ? AND student_id = ?').get(lesson_id, s.id);
    db.prepare(`
      INSERT INTO completions (lesson_id, student_id, score, status, updated_at, dirty) VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(lesson_id, student_id) DO UPDATE SET
        score = CASE WHEN excluded.score IS NULL THEN completions.score
                     WHEN completions.score IS NULL THEN excluded.score
                     ELSE MAX(completions.score, excluded.score) END,
        status = CASE WHEN completions.status = 'completed' OR excluded.status = 'completed' THEN 'completed' ELSE excluded.status END,
        updated_at = excluded.updated_at, dirty = 1
    `).run(lesson_id, s.id, clean, status || 'completed', new Date().toISOString());
    // +10 XP la primera vez que la lección pasa a completada (la nube la paga sola al recibir el progreso).
    const firstTime = (status || 'completed') === 'completed' && prev?.status !== 'completed' && xpStore.recordLesson(s.id, lesson_id);
    sendJson(res, 200, firstTime ? { ok: true, xp: XP_PER_LESSON } : { ok: true });
  },
};

// En la Raspberry el nombre lo publica avahi (install.sh); en Windows lo publica el propio nodo.
const mdns = (config.mdns ?? process.platform === 'win32') ? startMdns(config.hostName) : null;
const portSuffix = () => ((config.port || 8080) === 80 ? '' : ':' + (config.port || 8080));
// Nombre fácil (http://quetzal.local), o null si no se pudo publicar.
// En la Raspberry el nombre lo anuncia avahi (no el nodo): se arma con el nombre del equipo. Si HTTPS ya está activo, el nombre fácil es https.
const friendlyHost = () => mdns?.fqdn ?? (process.platform === 'linux' && /^[a-z0-9-]+$/i.test(os.hostname()) ? `${os.hostname().toLowerCase()}.local` : null);
const friendlyUrl = () => {
  const host = friendlyHost();
  if (!host) return null;
  if (httpsPortListening && httpsRedirectOn()) return `https://${host}${httpsPortListening === 443 ? '' : ':' + httpsPortListening}`;
  return `http://${host}${portSuffix()}`;
};

// Direcciones de este equipo en la red local (las que escriben los celulares).
function lanUrls() {
  const port = config.port || 8080;
  return Object.values(os.networkInterfaces()).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'))
    .map(n => `http://${n.address}${port === 80 ? '' : ':' + port}`);
}

const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Cartel para imprimir y pegar en el aula: dirección + QR para entrar desde el celular.
function cartelHtml() {
  const urls = lanUrls();
  const named = friendlyUrl();
  const main = named || urls[0] || `http://localhost:${config.port || 8080}`;
  const others = named ? urls : urls.slice(1);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cartel Quetzal</title><style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:32px 16px;text-align:center;color:#111}
h1{font-size:40px;margin:0 0 8px}p{font-size:22px;margin:8px 0}.url{font-size:44px;font-weight:800;margin:18px 0;word-break:break-all}
#qr{display:inline-block;padding:16px;border:2px solid #111;border-radius:12px;margin:12px 0}.otras{color:#555;font-size:18px}
.steps{max-width:640px;margin:20px auto;text-align:left;font-size:22px;line-height:1.5}
button{font-size:18px;padding:10px 22px;margin-top:16px;cursor:pointer}@media print{button{display:none}}
</style></head><body>
<h1>Entra a Quetzal desde tu celular</h1>
<p>1. Conéctate al Wi-Fi de la escuela.</p>
<p>2. Escanea el código o escribe en el navegador:</p>
<div class="url">${escHtml(main)}</div>
<div id="qr"></div>
${others.length ? `<p class="otras">Si no abre, prueba con: ${others.map(escHtml).join(' · ')}</p>` : ''}
<div class="steps">3. Elige tu nombre y escribe tu PIN.<br>No necesitas internet ni datos.</div>
${httpsPortListening && httpsRedirectOn() ? `<p class="otras">¿Te sale un aviso de seguridad? Entra por <b>http://${escHtml(friendlyHost() || 'quetzal.local')}/acceso</b></p>` : ''}
<button onclick="print()">Imprimir</button>
<script src="/js/qrcode.min.js"></script>
<script>new QRCode(document.getElementById('qr'), { text: ${JSON.stringify(main)}, width: 260, height: 260 });</script>
</body></html>`;
}

function accesoHtml() {
  const host = friendlyHost() || 'quetzal.local';
  const secure = `https://${host}${httpsPortListening && httpsPortListening !== 443 ? ':' + httpsPortListening : ''}/`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrar a Quetzal</title><style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:24px 16px;color:#111;background:#f8fafc}main{max-width:560px;margin:0 auto}
h1{font-size:26px}p{font-size:17px;line-height:1.5}.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin:16px 0}
a.btn{display:block;text-align:center;padding:14px;border-radius:12px;font-weight:800;text-decoration:none;margin-top:10px;color:#fff;background:#10b981}a.btn.alt{background:#475569}
</style></head><body><main><h1>¿Cómo quieres entrar?</h1>
<div class="card"><b>Con cámara (escanear QR)</b><p>Este dispositivo debe confiar en el certificado de la escuela. Se instala una sola vez.</p>
<a class="btn" href="/node-ca.crt">1. Descargar el certificado</a>
<p style="font-size:15px;color:#475569">Instálalo en Ajustes (Android: Seguridad → Instalar un certificado → Certificado de CA; iPhone: Ajustes → Perfil descargado, y luego Información → Ajustes de confianza de certificados). Después entra a:</p>
<a class="btn" href="${escHtml(secure)}">2. Abrir ${escHtml(host)} con candado</a></div>
<div class="card"><b>Sin certificado</b><p>Funciona todo, pero sin cámara: la asistencia se pasa con la lista (tocas a cada estudiante). Este dispositivo lo recordará.</p>
<a class="btn alt" href="/?http=1">Entrar sin cámara</a></div></main></body></html>`;
}

// Script que la app carga para saber que está en un nodo escolar.
// Marca del colegio de este nodo (nombre, logo, color) para la pantalla de entrada: ahí todavía no hay sesión y la API de datos la exige.
// Solo esos tres campos, del colegio del nodo (o el único que tenga).
function nodeBrand() {
  try {
    const rows = restStore.raw('schools');
    const code = getMeta(db, 'school_code');
    const row = rows.find((s) => s.code === code) || (rows.length === 1 ? rows[0] : null);
    if (!row || (!row.brand_name && !row.logo_data && !row.brand_color && !row.brand_color2 && !row.brand_color3)) return null;
    return { code: row.code, brand_name: row.brand_name ?? null, logo_data: row.logo_data ?? null, brand_color: row.brand_color ?? null, brand_color2: row.brand_color2 ?? null, brand_color3: row.brand_color3 ?? null };
  } catch { return null; }
}

function nodeConfigScript() {
  return `${POLYFILLS}window.QUETZAL_NODE = ${JSON.stringify({
    name: getMeta(db, 'node_name'), school_code: getMeta(db, 'school_code'),
    storage_base: getMeta(db, 'storage_base'), last_sync_at: getMeta(db, 'last_sync_at'), rest: restReady(),
    brand: nodeBrand(),
  })};`;
}

const requestHandler = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://node');
    if (await restRoutes.handle(req, res, url)) return;
    if (await projectFilesHandler.handle(req, res, url)) return;
    if (await storageHandler.handle(req, res, url)) return;
    if (await profilePhotoHandler.handle(req, res, url)) return; // foto de perfil: subir y ver (profile-photos.js)
    // Subidas a otros depósitos de Supabase (foto de perfil, adjuntos de comentarios...): sin internet no se pueden guardar. El aviso de la app muestra este texto.
    if (/^\/storage\/v1\/object\/(?!public\/|list\/|course-content\/|project-videos\/|profile-photos\/)[^/]+\//.test(url.pathname) && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
      req.resume();
      return sendJson(res, 400, { statusCode: '400', error: 'sin_internet', message: 'Esto necesita internet: hazlo cuando el servidor de la escuela tenga conexión a la nube.' });
    }
    const route = projectRoute(req.method, url.pathname) || api[`${req.method} ${url.pathname}`];
    if (route) return await route(req, res, url);

    if (url.pathname === '/wifi') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(wifiPageHtml());
    }
    // Para quien no tiene (o no quiere instalar) el certificado: dos caminos claros. Por http, sin redirección.
    if (url.pathname === '/acceso') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(accesoHtml());
    }
    if (url.pathname === '/cartel') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(cartelHtml());
    }
    if (url.pathname === '/node-config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(nodeConfigScript());
    }
    // La app arma las direcciones de los archivos con las rutas de Storage de Supabase (getPublicUrl) y el paquete SCORM/H5P con
    // la función serve-scorm-entry: sobre el nodo se sirven desde el espejo local de los cursos (solo el bucket de cursos).
    const storageFile = /^\/storage\/v1\/object\/public\/course-content\/(.+)$/.exec(url.pathname);
    if (storageFile || url.pathname === '/functions/v1/serve-scorm-entry') {
      let rel = null;
      try { rel = storageFile ? decodeURIComponent(storageFile[1]) : url.searchParams.get('path'); } catch { rel = null; }
      if (!rel) { res.writeHead(404); return res.end('No encontrado'); }
      if (!storageFile) return serveScormEntry(res, rel, req.headers.host, req.socket.encrypted ? 'https' : 'http');
      return serveFile(req, res, CONTENT_DIR, rel);
    }
    // Certificado PÚBLICO de la CA de la escuela (data/ca/quetzal-ca.crt), para que los dispositivos confíen en el HTTPS del nodo y la cámara pueda pasar lista.
    // Solo se entrega ese archivo y solo si existe: el nodo NO genera certificados ni activa HTTPS por sí solo (ver school-node/README.md, «HTTPS y cámara»).
    if (url.pathname === '/node-ca.crt' && (req.method === 'GET' || req.method === 'HEAD')) {
      return serveFile(req, res, path.resolve(config.dataDir, 'ca'), 'quetzal-ca.crt');
    }
    // Videos y modelos 3D de los proyectos de esta escuela, guardados en el nodo (project-mirror.js): se sirven con rangos, sin internet.
    const mirrorName = /^\/project-mirror\/([^/]+)$/.exec(url.pathname)?.[1];
    if (mirrorName && (req.method === 'GET' || req.method === 'HEAD')) return projectMirror.serve(req, res, mirrorName);
    // Un video o una foto de la nube que se ve en el nodo: el navegador pide /node-media?u=<dirección pública>; si hay internet, el nodo consigue la dirección firmada y lo redirige.
    if (url.pathname === '/node-media') {
      const target = url.searchParams.get('u') || '';
      if (!isPrivateCloudUrl(target, config.cloudUrl)) { res.writeHead(404); return res.end('No encontrado'); }
      const signed = hasToken() ? await mediaSigner.signOne(target) : null;
      if (!signed) { res.writeHead(502, { 'Cache-Control': 'no-store' }); return res.end('Sin conexión con la nube'); }
      res.writeHead(302, { Location: signed, 'Cache-Control': 'no-store' });
      return res.end();
    }
    const photoName = /^\/photos\/([^/]+)$/.exec(url.pathname)?.[1];
    if (photoName) {
      if (!photosStore.isServableName(photoName)) { res.writeHead(404); return res.end('No encontrado'); }
      return serveFile(req, res, path.resolve(config.dataDir, 'photos'), photoName);
    }
    if (url.pathname.startsWith('/content/')) {
      return serveFile(req, res, CONTENT_DIR, decodeURIComponent(url.pathname.slice('/content/'.length)));
    }

    const rel = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'index.html';
    if (!APP_ALLOWED.some(rx => rx.test(rel))) { res.writeHead(404); return res.end('No encontrado'); }
    if (rel === 'index.html') return serveIndex(req, res);
    if (rel === 'js/boot.js') return serveBoot(req, res);
    serveFile(req, res, APP_DIR, rel);
  } catch (e) {
    console.error(e);
    if (res.headersSent) { try { res.destroy(); } catch { /* ya cerrada */ } return; } // con las cabeceras ya enviadas no se puede responder otro error
    sendJson(res, 500, { error: 'Error interno del nodo' });
  }
};
// Con HTTPS activo, quien entra por el NOMBRE (quetzal.local) pasa a https://quetzal.local: es el que sirve aunque cambie la IP. Quien entra por una IP
// se queda en http (el certificado se hizo para el nombre; la IP puede cambiar). /node-ca.crt siempre por http: es lo que se descarga para instalar el certificado.
// Por defecto NO se redirige (v1.0.267): un dispositivo sin el certificado instalado vería un aviso de seguridad, y el docente no debe configurar nada para que
// los estudiantes entren. La cámara del docente se activa a propósito desde la app (js/camera-support.js) o desde /acceso. "httpsRedirect": true en config.json lo enciende.
const httpsRedirectOn = () => config.httpsRedirect === true;
let httpsPortListening = null;
const httpsRedirectTarget = (req, forceHttp = null) => {
  if (!httpsPortListening || !httpsRedirectOn() || (req.method !== 'GET' && req.method !== 'HEAD')) return null;
  const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  if (!host.endsWith('.local')) return null;
  const pathOnly = String(req.url).split('?')[0];
  if (pathOnly === '/node-ca.crt' || pathOnly === '/acceso') return null;
  // «Entrar sin certificado»: la cookie px_http=1 (la pone /?http=1, la quita /?http=0) deja ese dispositivo en http, con la lista rápida de asistencia.
  if (forceHttp === '1' || (forceHttp !== '0' && /(?:^|;\s*)px_http=1(?:;|$)/.test(String(req.headers.cookie || '')))) return null;
  return `https://${host}${httpsPortListening === 443 ? '' : ':' + httpsPortListening}${req.url}`;
};
const server = http.createServer((req, res) => {
  const choice = /^\/(?:\?|$)/.test(String(req.url)) && /[?&]http=([01])/.exec(String(req.url))?.[1];
  if (choice) {
    res.setHeader('Set-Cookie', choice === '1' ? 'px_http=1; Path=/; Max-Age=31536000; SameSite=Lax' : 'px_http=; Path=/; Max-Age=0; SameSite=Lax');
  }
  // Sin internet, las comprobaciones de «¿esta red tiene internet?» de los dispositivos llegan aquí (dns.js): se les contesta lo que esperan.
  const probe = dns && connectivity.state.online !== true ? probeResponse(req.headers.host) : null;
  if (probe) { res.writeHead(probe.status, probe.headers); return res.end(probe.body); }
  const to = httpsRedirectTarget(req, choice || null);
  if (to) { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' }); return res.end(); }
  return requestHandler(req, res);
});

server.requestTimeout = 30 * 60 * 1000; // un video grande por Wi-Fi tarda más que los 5 minutos que trae Node
server.listen(config.port || 8080, () => {
  const port = config.port || 8080;
  console.log(`🌳 Nodo Quetzal escuchando en el puerto ${port}`);
  if (friendlyUrl()) console.log(`   📱 Nombre fácil:        ${friendlyUrl()}   (si no abre, usa la IP)`);
  lanUrls().forEach(u => console.log(`   📱 Desde los celulares: ${u}   (cartel para imprimir: ${u}/cartel)`));
});

// HTTPS opcional (para que la cámara de los celulares pueda pasar lista): solo si existen data/ca/server.crt y data/ca/server.key
// (los crea school-node/https-setup.sh). Sin esos archivos el nodo sigue igual, solo con http. El puerto es config.httpsPort (443 por defecto).
const httpsDir = path.resolve(config.dataDir, 'ca');
if (fs.existsSync(path.join(httpsDir, 'server.crt')) && fs.existsSync(path.join(httpsDir, 'server.key'))) {
  try {
    const httpsServer = https.createServer({ cert: fs.readFileSync(path.join(httpsDir, 'server.crt')), key: fs.readFileSync(path.join(httpsDir, 'server.key')) }, requestHandler);
    httpsServer.requestTimeout = 30 * 60 * 1000;
    httpsServer.on('error', (e) => console.error(`⚠️ HTTPS no arrancó (${e.code || e.message}); el nodo sigue con http.`));
    httpsServer.listen(config.httpsPort || 443, () => { httpsPortListening = config.httpsPort || 443; console.log(`🔒 HTTPS activo en el puerto ${httpsPortListening} (certificado de la escuela)${httpsRedirectOn() ? '; quetzal.local pasa solo a https' : '; quetzal.local se queda en http (la cámara se activa desde la app o /acceso)'}`); });
  } catch (e) { console.error(`⚠️ No se pudo leer el certificado HTTPS (${e.message}); el nodo sigue con http.`); }
}

// Sync automático: cada N minutos, si hay internet.
let syncing = false;
let lastSyncRequestAt = 0;
let lastSyncError = null; // { message, at } del último intento que falló
let syncStage = null; // qué está haciendo la sincronización ahora (para el aviso del docente)
let syncCause = null; // 'reconnect' | 'first' | 'timer' | 'button'

function hasToken() {
  return !!config.nodeToken && !String(config.nodeToken).startsWith('PEGAR');
}

async function trySync(cause = 'timer') {
  if (syncing || !hasToken()) return { started: false };
  syncing = true;
  syncCause = cause;
  syncStage = 'Empezando';
  try {
    await runSync(db, config, console.log, (stage) => { syncStage = stage; });
    lastSyncError = null;
    return { started: true, ok: true };
  } catch (e) {
    console.log('⏸️  Sin sync ahora:', e.message);
    lastSyncError = { message: friendlySyncError(e.message), at: new Date().toISOString() };
    return { started: true, ok: false };
  } finally { syncing = false; syncStage = null; syncCause = null; if (typeof remoteSync !== 'undefined' && hasToken()) remoteSync.ping(); } // la plataforma ve el resultado enseguida
}
setTimeout(() => trySync('first'), 5000);
setInterval(() => trySync('timer'), (config.syncEveryMinutes || 10) * 60 * 1000);

// Vigilante de conexión: cada 15 s mira si el servidor llega a la nube; en cuanto la tiene (se conectó el cable al router con internet, o la Wi-Fi) sincroniza solo, sin que el docente pulse nada.
const connectivity = createConnectivity({ intervalMs: (config.connectivitySeconds || 15) * 1000, minGapMs: (config.connectivityMinGapSeconds || 60) * 1000, check: internetCheck, onOnline: (why) => { if (hasToken()) { lastSyncError = null; return trySync(why); } } });
if (hasToken()) connectivity.start();
// Servidor de nombres para el kit de router + Raspberry (dns.js). Por defecto solo en una instalación real de Linux (puerto 80); "dns": true/false en config.json lo fuerza.
const dns = (config.dns ?? (process.platform === 'linux' && (config.port || 8080) === 80))
  ? startDns({ hostName: config.hostName ?? (process.platform === 'linux' ? os.hostname() : undefined), port: config.dnsPort || 53, upstream: config.dnsUpstream || [], isOffline: () => connectivity.state.online === false })
  : null;

// Sincronizar desde la plataforma en línea: cada 30 s (con internet) el servidor avisa a la nube con su estado y atiende el «Sincronizar ahora» que el docente tocó allá (remote-sync.js).
const APP_VERSION = (() => { try { return /APP_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(APP_DIR, 'js', 'version.js'), 'utf8'))?.[1] ?? null; } catch { return null; } })();
// Actualizar desde la plataforma («Actualizar servidores»): git pull + dependencias si cambiaron, y reinicio (systemd lo levanta). Ver self-update.js.
const selfUpdate = createSelfUpdate({ appDir: APP_DIR });
let updating = false;
let updateError = null;
function startSelfUpdate() {
  if (updating) return { started: false };
  updating = true; updateError = null;
  selfUpdate.update().then((r) => {
    updating = false;
    if (!r.ok) { updateError = r.error || 'No se pudo actualizar'; console.error('Actualización desde la plataforma:', updateError); return; }
    if (r.changed) { console.log(`Actualizado ${String(r.from).slice(0, 7)} -> ${String(r.to).slice(0, 7)}: reiniciando.`); setTimeout(() => process.exit(0), 1500); }
  }).catch((e) => { updating = false; updateError = String(e?.message || e).slice(0, 180); });
  return { started: true };
}
const remoteSync = createRemoteSync({
  cloudUrl: config.cloudUrl, nodeToken: config.nodeToken,
  getStatus: () => ({ version: APP_VERSION, pending_changes: pendingChanges(), syncing, stage: syncing ? syncStage : null, last_sync_at: getMeta(db, 'last_sync_at'), internet: connectivity.state.online, urls: lanUrls(), updating, update_error: updateError }),
  getHandled: () => getMeta(db, 'remote_sync_handled'), setHandled: (v) => setMeta(db, 'remote_sync_handled', v),
  trySync: (why) => trySync(why), isOnline: () => connectivity.state.online,
  updater: startSelfUpdate, isBusy: () => syncing || updating,
  getHandledUpdate: () => getMeta(db, 'remote_update_handled'), setHandledUpdate: (v) => setMeta(db, 'remote_update_handled', v),
});
if (hasToken()) setInterval(() => remoteSync.tick(), (config.remotePingSeconds || 30) * 1000).unref();

// Sync por USB: revisa cada 20 s si hay una memoria con carpeta QUETZAL.
// Solo reescribe la USB si cambió algo desde la última vez, para no
// escribir sin parar mientras la memoria queda conectada.
let lastUsbSignature = '';
setInterval(() => {
  if (syncing) return;
  try {
    const sig = JSON.stringify([
      db.prepare('SELECT COUNT(*) n, MAX(updated_at) m FROM completions WHERE dirty = 1').get(),
      db.prepare('SELECT COUNT(*) n FROM students WHERE pin_dirty = 1').get(),
      db.prepare('SELECT COUNT(*) n FROM session_logs WHERE dirty = 1').get(),
    ]);
    const found = runUsbSync(db, config, (m) => console.log(m), { skipIfSame: sig === lastUsbSignature });
    lastUsbSignature = found ? sig : '';
  } catch (e) {
    console.log('⚠️ USB:', e.message);
  }
}, 20000);
