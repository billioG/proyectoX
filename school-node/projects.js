// Almacén de proyectos del nodo: guarda el borrador y el archivo que sube un estudiante
// y lleva su estado hasta que se sincroniza con la nube. Solo este módulo toca la tabla
// `projects` y los archivos de dataDir/projects (la API HTTP vive en server.js).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PROJECT_LIMITS, validateProjectDraft } from './project-rules.js';

export class ProjectError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ProjectError';
    this.status = status;
  }
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const ACTIVE = "('uploading', 'pending')";

/**
 * @param db   base SQLite del nodo (db.js)
 * @param opts { dataDir, limits?, freeDiskMB?: () => number, now?: () => number }
 */
export function createProjectStore(db, { dataDir, limits = PROJECT_LIMITS, freeDiskMB, now = Date.now } = {}) {
  const dir = path.resolve(dataDir, 'projects');
  fs.mkdirSync(dir, { recursive: true });
  const freeMB = freeDiskMB || (() => { const s = fs.statfsSync(dir); return (s.bavail * s.bsize) / (1024 * 1024); });
  const iso = () => new Date(now()).toISOString();

  // La ruta sale SOLO del id (un UUID que genera este módulo) y de la extensión ya validada.
  const safe = (name) => {
    const p = path.resolve(dir, name);
    if (!p.startsWith(dir + path.sep)) throw new ProjectError(400, 'Ruta no permitida.');
    return p;
  };
  const rmFile = (p) => { try { fs.rmSync(p, { force: true }); } catch { /* ya no estaba */ } };
  const row = (id) => db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  const filePathOf = (r) => safe(`${r.id}.${r.ext}`);

  return {
    createDraft(studentId, input, meta = {}) {
      const memberGroupIds = db.prepare('SELECT group_id FROM group_members WHERE student_id = ?').all(studentId).map(m => m.group_id);
      const v = validateProjectDraft(input, { memberGroupIds, maxBytes: limits.maxBytes });
      if (!v.ok) throw new ProjectError(400, v.error);

      const waiting = db.prepare(`SELECT COUNT(*) n FROM projects WHERE student_id = ? AND status IN ${ACTIVE}`).get(studentId).n;
      if (waiting >= limits.maxPendingPerStudent) {
        throw new ProjectError(409, `Ya tienes ${limits.maxPendingPerStudent} proyectos esperando para subirse. Espera a que se sincronicen o cancela alguno.`);
      }
      // Los borradores que aún suben ya tienen reservado su tamaño aunque el disco no lo refleje todavía.
      const reserved = db.prepare("SELECT IFNULL(SUM(file_size), 0) n FROM projects WHERE status = 'uploading'").get().n;
      if (freeMB() - (reserved + v.value.size) / (1024 * 1024) < limits.minFreeDiskMB) {
        throw new ProjectError(507, 'No hay espacio suficiente en la computadora de la escuela. Avisa a tu docente.');
      }

      const id = crypto.randomUUID();
      const { value } = v;
      // file_size guarda el tamaño ANUNCIADO mientras sube; finishUpload lo reemplaza por los bytes recibidos.
      db.prepare(`INSERT INTO projects (id, student_id, group_id, title, description, bimestre, kind, ext, mime, file_size, upload_ip, user_agent, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?)`)
        .run(id, studentId, value.group_id, value.title, value.description, value.bimestre, value.kind, value.ext, value.mime, value.size,
          String(meta.ip ?? '').slice(0, 64), String(meta.userAgent ?? '').slice(0, 200), iso());
      return { id, max_bytes: limits.maxBytes };
    },

    tmpPath: (id) => safe(`${id}.part`),
    finalPath: (id) => { const r = row(id); return safe(`${id}.${r ? r.ext : 'bin'}`); },

    getDraft(id, studentId) {
      const r = row(id);
      return r && r.student_id === studentId && r.status === 'uploading' ? r : null;
    },

    finishUpload(id, bytes) {
      const r = row(id);
      if (!r) throw new ProjectError(404, 'Proyecto no encontrado.');
      fs.renameSync(safe(`${id}.part`), filePathOf(r));
      db.prepare("UPDATE projects SET status = 'pending', file_size = ? WHERE id = ?").run(bytes, id);
    },

    abortUpload(id) {
      rmFile(safe(`${id}.part`));
      db.prepare("DELETE FROM projects WHERE id = ? AND status = 'uploading'").run(id);
    },

    listMine: (studentId) => db.prepare(
      'SELECT id, title, status, kind, file_size, created_at, last_error FROM projects WHERE student_id = ? ORDER BY created_at DESC, rowid DESC',
    ).all(studentId).map(r => ({ ...r })),

    cancel(id, studentId) {
      const r = row(id);
      if (!r || r.student_id !== studentId || r.status === 'synced') return false;
      // Con el archivo ya en Storage la nube puede haberlo publicado: quitarlo aquí no lo despublica.
      if (r.cloud_path) throw new ProjectError(409, 'Este proyecto ya se está publicando en la nube. Pide a tu docente que lo revise.');
      rmFile(safe(`${id}.part`));
      rmFile(filePathOf(r));
      db.prepare('DELETE FROM projects WHERE id = ?').run(id);
      return true;
    },

    // ---- Para la sincronización con la nube (projects-sync.js) ----
    listPending: () => db.prepare("SELECT * FROM projects WHERE status = 'pending' ORDER BY created_at, rowid").all().map(r => ({ ...r })),

    setCloudPath: (id, cloudPath) => { db.prepare('UPDATE projects SET cloud_path = ? WHERE id = ?').run(cloudPath, id); },

    markFailed: (id, message) => {
      db.prepare('UPDATE projects SET last_error = ?, attempts = attempts + 1 WHERE id = ?').run(String(message).slice(0, 300), id);
    },

    markSynced: (id, cloudProjectId) => {
      db.prepare("UPDATE projects SET status = 'synced', cloud_project_id = ?, last_error = NULL, synced_at = ? WHERE id = ?")
        .run(String(cloudProjectId), iso(), id);
    },

    // Lo que el Inicio necesita de los proyectos propios guardados en este nodo.
    feedRows: (studentId) => db.prepare(
      'SELECT id, title, description, bimestre, kind, status, created_at, cloud_project_id, group_id FROM projects WHERE student_id = ? ORDER BY created_at DESC, rowid DESC',
    ).all(studentId).map(r => ({ ...r })),

    groupsFor: (studentId) => db.prepare(
      'SELECT g.id, g.name FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.student_id = ? ORDER BY g.name',
    ).all(studentId).map(g => ({ ...g })),

    // Borradores huérfanos (> 1 h) y archivos ya subidos hace más de keepSyncedDays: se libera el disco,
    // pero el proyecto ya subido sigue en "Mis proyectos". Un proyecto pendiente nunca se borra solo.
    cleanup() {
      let removed = 0;
      const stuckBefore = new Date(now() - HOUR).toISOString();
      for (const r of db.prepare("SELECT * FROM projects WHERE status = 'uploading' AND created_at < ?").all(stuckBefore)) {
        rmFile(safe(`${r.id}.part`));
        db.prepare('DELETE FROM projects WHERE id = ?').run(r.id);
        removed++;
      }
      const oldBefore = new Date(now() - limits.keepSyncedDays * DAY).toISOString();
      for (const r of db.prepare("SELECT * FROM projects WHERE status = 'synced' AND synced_at IS NOT NULL AND synced_at < ?").all(oldBefore)) {
        const p = filePathOf(r);
        if (fs.existsSync(p)) { rmFile(p); removed++; }
      }
      return { removed };
    },

    counts() {
      const n = (sql) => db.prepare(sql).get().n;
      return {
        pending: n("SELECT COUNT(*) n FROM projects WHERE status = 'pending'"),
        synced: n("SELECT COUNT(*) n FROM projects WHERE status = 'synced'"),
        failed: n("SELECT COUNT(*) n FROM projects WHERE status = 'pending' AND last_error IS NOT NULL"),
        bytes: n("SELECT IFNULL(SUM(file_size), 0) n FROM projects WHERE status = 'pending'"),
      };
    },
  };
}
