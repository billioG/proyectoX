// Sincronización del nodo con la nube (edge function node-sync).
// Sube: progreso, PIN creados en la escuela y sesiones. Baja: alumnos,
// cursos, progreso y archivos de la escuela (solo los que cambiaron).
// Se puede correr a mano:  node sync.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, setMeta, getMeta } from './db.js';

export async function runSync(db, config, log = console.log) {
  const pushCompletions = db.prepare('SELECT lesson_id, student_id, score, status, updated_at FROM completions WHERE dirty = 1').all();
  const pushPins = db.prepare('SELECT id AS student_id, pin_hash, pin_salt, pin_updated_at FROM students WHERE pin_dirty = 1').all();
  const pushSessions = db.prepare('SELECT id, student_id, device, entered_at FROM session_logs WHERE dirty = 1').all();

  const res = await fetch(`${config.cloudUrl}/functions/v1/node-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-node-token': config.nodeToken },
    body: JSON.stringify({ push: { completions: pushCompletions, pins: pushPins, sessions: pushSessions } }),
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `node-sync respondió ${res.status}`);

  const apply = db.transaction(() => {
    // Lo que se subió deja de estar pendiente (salvo que haya cambiado
    // mientras tanto: se compara updated_at).
    const clearCompletion = db.prepare('UPDATE completions SET dirty = 0 WHERE lesson_id = ? AND student_id = ? AND IFNULL(updated_at, \'\') = IFNULL(?, \'\')');
    for (const c of pushCompletions) clearCompletion.run(c.lesson_id, c.student_id, c.updated_at);
    const clearPin = db.prepare('UPDATE students SET pin_dirty = 0 WHERE id = ? AND pin_updated_at = ?');
    for (const p of pushPins) clearPin.run(p.student_id, p.pin_updated_at);
    const clearSession = db.prepare('UPDATE session_logs SET dirty = 0 WHERE id = ?');
    for (const s of pushSessions) clearSession.run(s.id);

    // Alumnos: un PIN creado acá y todavía sin subir no se pisa.
    const upsertStudent = db.prepare(`
      INSERT INTO students (id, username, full_name, grade, section, profile_photo_url, status, extra, pin_hash, pin_salt, pin_updated_at)
      VALUES (@id, @username, @full_name, @grade, @section, @profile_photo_url, @status, @extra, @pin_hash, @pin_salt, @pin_updated_at)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username, full_name = excluded.full_name, grade = excluded.grade, section = excluded.section,
        profile_photo_url = excluded.profile_photo_url, status = excluded.status, extra = excluded.extra,
        pin_hash = CASE WHEN students.pin_dirty = 1 THEN students.pin_hash ELSE excluded.pin_hash END,
        pin_salt = CASE WHEN students.pin_dirty = 1 THEN students.pin_salt ELSE excluded.pin_salt END,
        pin_updated_at = CASE WHEN students.pin_dirty = 1 THEN students.pin_updated_at ELSE excluded.pin_updated_at END
    `);
    const cloudIds = new Set();
    for (const s of data.students || []) {
      cloudIds.add(s.id);
      upsertStudent.run({
        id: s.id, username: s.username, full_name: s.full_name, grade: s.grade, section: s.section,
        profile_photo_url: s.profile_photo_url, status: s.status,
        extra: JSON.stringify({ companion_species: s.companion_species, gems_earned_total: s.gems_earned_total, companion_equipped: s.companion_equipped }),
        pin_hash: s.pin_hash, pin_salt: s.pin_salt, pin_updated_at: s.pin_updated_at,
      });
    }
    // Alumnos que ya no están en la escuela (egresados/trasladados): fuera.
    for (const { id } of db.prepare('SELECT id FROM students').all()) {
      if (!cloudIds.has(id)) db.prepare('DELETE FROM students WHERE id = ?').run(id);
    }

    db.prepare('DELETE FROM courses').run();
    const insertCourse = db.prepare('INSERT INTO courses (id, grade, section, data) VALUES (?, ?, ?, ?)');
    for (const c of data.courses || []) insertCourse.run(c.id, c.grade, c.section, JSON.stringify(c));

    // Progreso de la nube: se combina con el local (mejor nota gana).
    const mergeCompletion = db.prepare(`
      INSERT INTO completions (lesson_id, student_id, score, status, updated_at, dirty)
      VALUES (@lesson_id, @student_id, @score, @status, @completed_at, 0)
      ON CONFLICT(lesson_id, student_id) DO UPDATE SET
        score = CASE WHEN excluded.score IS NULL THEN completions.score
                     WHEN completions.score IS NULL THEN excluded.score
                     ELSE MAX(completions.score, excluded.score) END,
        status = CASE WHEN completions.status = 'completed' OR excluded.status = 'completed' THEN 'completed' ELSE excluded.status END
    `);
    for (const c of data.completions || []) mergeCompletion.run({ ...c, score: c.score ?? null, status: c.status ?? 'completed', completed_at: c.completed_at ?? null });

    const upsertFile = db.prepare(`
      INSERT INTO files (path, etag, size, downloaded) VALUES (@path, @etag, @size, 0)
      ON CONFLICT(path) DO UPDATE SET
        downloaded = CASE WHEN files.etag = excluded.etag AND excluded.etag != '' THEN files.downloaded ELSE 0 END,
        etag = excluded.etag, size = excluded.size
    `);
    for (const f of data.files || []) upsertFile.run({ path: f.path, etag: f.etag || '', size: f.size || 0 });

    setMeta(db, 'node_name', data.node?.name || '');
    setMeta(db, 'school_code', data.node?.school_code || '');
    setMeta(db, 'storage_base', data.storage_base || '');
    setMeta(db, 'last_sync_at', data.server_time || new Date().toISOString());
  });
  apply();

  log(`✅ Sync: ${data.students?.length || 0} alumnos, ${data.courses?.length || 0} cursos. Subido: ${JSON.stringify(data.applied)}`);
  await downloadFiles(db, config, log);
  return data.applied;
}

// Descarga los archivos que faltan o cambiaron (6 en paralelo).
async function downloadFiles(db, config, log) {
  const base = getMeta(db, 'storage_base');
  const pending = db.prepare('SELECT path FROM files WHERE downloaded = 0').all();
  if (!pending.length || !base) return;
  log(`⬇️  Descargando ${pending.length} archivo(s)...`);

  const contentDir = path.resolve(config.dataDir, 'content');
  const markDone = db.prepare('UPDATE files SET downloaded = 1 WHERE path = ?');
  let cursor = 0, ok = 0, failed = 0;

  async function worker() {
    while (cursor < pending.length) {
      const { path: rel } = pending[cursor++];
      const dest = path.resolve(contentDir, rel);
      if (!dest.startsWith(contentDir + path.sep)) { failed++; continue; }
      try {
        const res = await fetch(base + rel.split('/').map(encodeURIComponent).join('/'), { signal: AbortSignal.timeout(120000) });
        if (!res.ok) throw new Error(String(res.status));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const tmp = dest + '.part';
        fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
        fs.renameSync(tmp, dest);
        markDone.run(rel);
        ok++;
      } catch {
        failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  log(`⬇️  Archivos: ${ok} descargados, ${failed} con error (se reintentan en el próximo sync).`);
}

export function loadConfig(dir) {
  const file = path.join(dir, 'config.json');
  if (!fs.existsSync(file)) throw new Error(`Falta ${file} -- copiá config.example.json y completalo.`);
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  config.dataDir = path.resolve(dir, config.dataDir || './data');
  return config;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const config = loadConfig(dir);
  const db = openDb(config.dataDir);
  runSync(db, config).catch(e => { console.error('❌ Sync falló:', e.message); process.exit(1); });
}
