// Base local del nodo (SQLite). WAL + synchronous=NORMAL: aguanta cortes
// de luz sin corromperse (a lo sumo se pierde la última escritura).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'node.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      username TEXT, full_name TEXT, grade TEXT, section TEXT,
      profile_photo_url TEXT, status TEXT, extra TEXT,
      pin_hash TEXT, pin_salt TEXT, pin_updated_at TEXT,
      pin_dirty INTEGER NOT NULL DEFAULT 0,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY, grade TEXT, section TEXT, data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS completions (
      lesson_id TEXT NOT NULL, student_id TEXT NOT NULL,
      score REAL, status TEXT, updated_at TEXT,
      dirty INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (lesson_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, student_id TEXT NOT NULL,
      device TEXT, created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL, device TEXT, entered_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY, etag TEXT, size INTEGER, downloaded INTEGER NOT NULL DEFAULT 0
    );

    -- Proyectos que suben los estudiantes al nodo (video o modelo 3D). El archivo vive en
    -- dataDir/projects/<id>.<ext>. status: uploading -> pending -> synced (ya está en la nube).
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, student_id TEXT NOT NULL, group_id INTEGER,
      title TEXT NOT NULL, description TEXT NOT NULL, bimestre INTEGER NOT NULL,
      kind TEXT NOT NULL, ext TEXT NOT NULL, mime TEXT NOT NULL, file_size INTEGER,
      upload_ip TEXT, user_agent TEXT,
      status TEXT NOT NULL DEFAULT 'uploading',
      cloud_path TEXT, cloud_project_id TEXT,
      attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
      created_at TEXT NOT NULL, synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS projects_student_idx ON projects (student_id);
    CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (status);

    -- Equipos de la escuela y sus miembros (los baja la sincronización).
    CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY, name TEXT, grade TEXT, section TEXT);
    CREATE TABLE IF NOT EXISTS group_members (id INTEGER PRIMARY KEY, group_id INTEGER, student_id TEXT, role TEXT);
    CREATE INDEX IF NOT EXISTS group_members_student_idx ON group_members (student_id);

    -- Docentes de la escuela (los baja el pull, sin PIN) y su PIN PERSONAL, que vive solo en este nodo.
    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY, full_name TEXT, assignments TEXT NOT NULL DEFAULT '[]',
      pin_hash TEXT, pin_salt TEXT, pin_updated_at TEXT,
      failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0
    );
    -- Evaluaciones de los proyectos del Inicio que bajó el pull, y la evaluación FINAL pendiente de cada proyecto
    -- hecha en este nodo (project_key = 'c:<id nube>' o 'l:<uuid del nodo>').
    CREATE TABLE IF NOT EXISTS cloud_evaluations (
      project_id INTEGER PRIMARY KEY, teacher_id TEXT, total_score INTEGER,
      creativity_score INTEGER, clarity_score INTEGER, functionality_score INTEGER, teamwork_score INTEGER, social_impact_score INTEGER,
      feedback TEXT
    );
    CREATE TABLE IF NOT EXISTS evaluations_local (
      project_key TEXT PRIMARY KEY, project_id INTEGER, node_ref TEXT, teacher_id TEXT NOT NULL, total_score INTEGER NOT NULL,
      creativity_score INTEGER NOT NULL, clarity_score INTEGER NOT NULL, functionality_score INTEGER NOT NULL,
      teamwork_score INTEGER NOT NULL, social_impact_score INTEGER NOT NULL, feedback TEXT, updated_at TEXT NOT NULL
    );

    -- Reacciones a proyectos: la base que baja el pull (la reacción de cada estudiante) y la reacción FINAL pendiente
    -- de cada par estudiante-proyecto (reaction NULL = la quitó).
    CREATE TABLE IF NOT EXISTS cloud_reactions (
      student_id TEXT NOT NULL, project_id INTEGER NOT NULL, reaction TEXT NOT NULL,
      PRIMARY KEY (student_id, project_id)
    );
    CREATE TABLE IF NOT EXISTS reactions_local (
      student_id TEXT NOT NULL, project_id INTEGER NOT NULL, reaction TEXT, updated_at TEXT NOT NULL,
      PRIMARY KEY (student_id, project_id)
    );

    -- XP que el estudiante ganó en este nodo y la nube todavía no confirmó (lección completada, cofre diario).
    CREATE TABLE IF NOT EXISTS xp_events_local (
      id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0, gems INTEGER NOT NULL DEFAULT 0, created_at TEXT,
      UNIQUE (student_id, kind, ref)
    );

    -- Fichas de proyectos de la clase que baja el pull (sin videos): alimentan el Inicio sin internet.
    CREATE TABLE IF NOT EXISTS cloud_projects (
      id TEXT PRIMARY KEY, user_id TEXT, group_id INTEGER, title TEXT, description TEXT, bimestre INTEGER,
      score REAL, votes INTEGER, created_at TEXT, author_name TEXT, group_name TEXT, grade TEXT, section TEXT,
      kind TEXT, feedback TEXT
    );
  `);
  return db;
}

export const getMeta = (db, key) => db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
export const setMeta = (db, key, value) =>
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
