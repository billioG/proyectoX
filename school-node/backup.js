// Respaldo y restauración de la base del nodo escolar (data/node.db).
//
//   node backup.js                      respalda ahora (en data/backups) y deja los 14 más recientes
//   node backup.js --out /media/quetzal-usb/respaldos --keep 30
//   node backup.js --files              además guarda en un .tar.gz lo que NO se puede volver a bajar de la nube
//                                       (proyectos y fotos pendientes de subir, llave de la USB)
//   node backup.js --usb-if-present     copia el respaldo a la memoria USB si hay una conectada (lo usa el respaldo diario)
//   node backup.js --list               muestra los respaldos que hay
//   node backup.js --restore ARCHIVO    restaura (con el servicio DETENIDO: sudo systemctl stop quetzal-node)
//
// El respaldo usa la API de copia de SQLite: es consistente aunque el servidor esté funcionando (no hay que apagarlo).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { loadConfig } from './sync.js';

export const BACKUP_RE = /^node-(\d{8}-\d{6})\.db$/;
export const DEFAULT_KEEP = 14;
// Carpetas de data/ que SOLO existen en este nodo (el resto -cursos, fotos de perfil- se vuelve a bajar al sincronizar).
export const IRREPLACEABLE = ['projects', 'project-uploads', 'photos', 'usb-key.pem'];

const pad = (n) => String(n).padStart(2, '0');
export const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** Revisa que un archivo sea una base del nodo sana. Devuelve { ok, error?, students }. */
export function checkDb(file) {
  let db;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') return { ok: false, error: `la base está dañada (${integrity})` };
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    for (const t of ['meta', 'students', 'completions']) if (!tables.has(t)) return { ok: false, error: `no parece una base del nodo (falta la tabla ${t})` };
    return { ok: true, students: db.prepare('SELECT count(*) n FROM students').get().n };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}

export function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => BACKUP_RE.test(f)).sort().reverse().map((name) => {
    const st = fs.statSync(path.join(dir, name));
    return { name, file: path.join(dir, name), size: st.size, at: st.mtime };
  });
}

/** Deja solo los `keep` respaldos más recientes (solo toca archivos node-*.db y sus .tar.gz). Devuelve los borrados. */
export function pruneBackups(dir, keep = DEFAULT_KEEP) {
  const all = listBackups(dir);
  const old = all.slice(Math.max(1, keep)); // siempre se conserva al menos el último
  for (const b of old) {
    fs.rmSync(b.file, { force: true });
    fs.rmSync(b.file.replace(/\.db$/, '-archivos.tar.gz'), { force: true });
  }
  return old.map((b) => b.name);
}

/**
 * Respalda data/node.db en `outDir`. Escribe a un .tmp y lo renombra solo si pasó la revisión, para no dejar
 * nunca un respaldo a medias con nombre de respaldo bueno.
 */
export async function createBackup({ dataDir, outDir = path.join(dataDir, 'backups'), keep = DEFAULT_KEEP, files = false, now = new Date() }) {
  const source = path.join(dataDir, 'node.db');
  if (!fs.existsSync(source)) throw new Error(`No hay base en ${source}: el nodo todavía no se ha usado.`);
  fs.mkdirSync(outDir, { recursive: true });
  const name = `node-${stamp(now)}.db`;
  const final = path.join(outDir, name);
  const tmp = `${final}.tmp`;
  fs.rmSync(tmp, { force: true });

  const db = new Database(source, { readonly: true, fileMustExist: true });
  try { await db.backup(tmp); } finally { db.close(); }
  const check = checkDb(tmp);
  if (!check.ok) { fs.rmSync(tmp, { force: true }); throw new Error(`El respaldo no pasó la revisión: ${check.error}`); }
  fs.renameSync(tmp, final);

  let archive = null;
  if (files) {
    const present = IRREPLACEABLE.filter((n) => fs.existsSync(path.join(dataDir, n)));
    if (present.length) {
      archive = final.replace(/\.db$/, '-archivos.tar.gz');
      // El archivo va por nombre relativo (cwd = su carpeta): el tar de GNU toma "C:\..." de Windows como un equipo remoto.
      const r = spawnSync('tar', ['-czf', path.basename(archive), '-C', dataDir, ...present], { encoding: 'utf8', cwd: outDir });
      if (r.status !== 0) { fs.rmSync(archive, { force: true }); archive = null; throw new Error(`No se pudo guardar el archivo de proyectos y fotos: ${(r.stderr || r.error?.message || '').trim()}`); }
    }
  }
  const pruned = pruneBackups(outDir, keep);
  return { file: final, size: fs.statSync(final).size, students: check.students, archive, pruned };
}

/**
 * Restaura `file` como data/node.db. La base actual NO se borra: queda junto a ella como node.db.antes-de-restaurar-<fecha>.
 * Con el servicio detenido (si no, el servidor tiene la base abierta).
 */
export function restoreBackup({ file, dataDir, now = new Date() }) {
  if (!fs.existsSync(file)) throw new Error(`No existe el archivo ${file}`);
  const check = checkDb(file);
  if (!check.ok) throw new Error(`Ese archivo no sirve para restaurar: ${check.error}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const target = path.join(dataDir, 'node.db');
  let kept = null;
  if (fs.existsSync(target)) {
    kept = `${target}.antes-de-restaurar-${stamp(now)}`;
    fs.renameSync(target, kept);
  }
  // Los -wal / -shm de la base vieja ya no corresponden a la nueva: si quedaran, SQLite los aplicaría encima.
  for (const ext of ['-wal', '-shm']) fs.rmSync(target + ext, { force: true });
  fs.copyFileSync(file, target);
  const after = checkDb(target);
  if (!after.ok) {
    fs.rmSync(target, { force: true });
    if (kept) fs.renameSync(kept, target);
    throw new Error(`La restauración falló y se dejó la base como estaba: ${after.error}`);
  }
  return { restored: target, students: after.students, kept };
}

/** ¿Hay una memoria USB montada en `mount`? (un directorio en otro disco que el padre; si no, escribiríamos en la microSD). */
export function usbMounted(mount = '/media/quetzal-usb') {
  try { return fs.statSync(mount).dev !== fs.statSync(path.dirname(mount)).dev; } catch { return false; }
}

function serviceActive(name = 'quetzal-node') {
  if (process.platform !== 'linux') return false;
  const r = spawnSync('systemctl', ['is-active', '--quiet', name]);
  return r.status === 0;
}

const human = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function main(argv) {
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const has = (k) => argv.includes(k);
  const config = loadConfig(path.dirname(fileURLToPath(import.meta.url)));
  const dataDir = config.dataDir;
  const outDir = path.resolve(opt('--out') || path.join(dataDir, 'backups'));
  const keep = Number(opt('--keep')) || DEFAULT_KEEP;

  if (has('--list')) {
    const list = listBackups(outDir);
    console.log(list.length ? list.map((b) => `${b.name}  ${human(b.size)}  ${b.at.toLocaleString('es-GT')}`).join('\n') : `No hay respaldos en ${outDir}`);
    return 0;
  }
  if (has('--restore')) {
    const file = opt('--restore');
    if (!file) { console.error('Indica el archivo: node backup.js --restore RUTA/node-AAAAMMDD-HHMMSS.db'); return 1; }
    if (serviceActive()) { console.error('Detén primero el servicio (si no, la base está abierta):\n  sudo systemctl stop quetzal-node\nDespués de restaurar:\n  sudo systemctl start quetzal-node'); return 1; }
    const r = restoreBackup({ file: path.resolve(file), dataDir });
    console.log(`Restaurado (${r.students} estudiantes).${r.kept ? `\nLa base anterior quedó en: ${r.kept}` : ''}\nAhora: sudo systemctl start quetzal-node`);
    return 0;
  }

  const r = await createBackup({ dataDir, outDir, keep, files: has('--files') });
  console.log(`Respaldo listo: ${r.file} (${human(r.size)}, ${r.students} estudiantes)${r.archive ? `\nArchivos: ${r.archive}` : ''}${r.pruned.length ? `\nBorrados por antiguos: ${r.pruned.length}` : ''}`);
  if (has('--usb-if-present')) {
    const usb = '/media/quetzal-usb';
    if (usbMounted(usb)) {
      const copy = await createBackup({ dataDir, outDir: path.join(usb, 'quetzal-respaldos'), keep, files: has('--files') });
      console.log(`Copia en la memoria USB: ${copy.file}`);
    } else console.log('No hay memoria USB conectada: el respaldo quedó solo en la microSD.');
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`Error: ${e.message}`); process.exit(1); });
}
