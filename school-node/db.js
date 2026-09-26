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
  `);
  return db;
}

export const getMeta = (db, key) => db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
export const setMeta = (db, key, value) =>
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
