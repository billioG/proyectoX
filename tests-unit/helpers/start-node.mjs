// Arranca school-node/server.js DE VERDAD con una configuración y una base temporales.
// Lo usan las pruebas de extremo a extremo del nodo (node-api, node-projects-api, ...).
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const NODE_DIR = path.join(ROOT, 'school-node');
export const TEACHER_CODE = '48213976';

const nodeRequire = createRequire(path.join(NODE_DIR, 'x.js'));

// better-sqlite3 está compilado para una versión de Node; con otra no carga y la prueba se omite.
export function sqliteAvailable() {
  try { const D = nodeRequire('better-sqlite3'); new D(':memory:').close(); return true; } catch { return false; }
}
export function openSqlite(file) {
  const D = nodeRequire('better-sqlite3');
  return new D(file);
}

// Servidores vivos de esta corrida: si una prueba falla o se queda sin tiempo, el hijo seguiría vivo y el
// proceso de pruebas no terminaría. stopAllNodes() (se engancha con after()) los cierra siempre.
const live = new Set();
export async function stopAllNodes() { await Promise.all([...live].map(fn => fn())); }

// Espera a que se cumpla una condición (las limpiezas del servidor son asíncronas y la máquina puede ir lenta).
export async function waitFor(check, { timeout = 8000, every = 50 } = {}) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    try { last = await check(); if (last) return last; } catch (e) { last = e; }
    if (Date.now() > end) throw new Error('no se cumplió a tiempo' + (last instanceof Error ? ': ' + last.message : ''));
    await new Promise(r => setTimeout(r, every));
  }
}

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

/**
 * @param opts {
 *   students?: Array<{ id, full_name?, grade?, section? }>,
 *   groups?: Array<{ id, name, grade?, section? }>,
 *   members?: Array<{ id, group_id, student_id, role? }>,
 *   config?: object,   // se mezcla sobre la configuración por defecto
 *   bom?: boolean,     // escribe config.json con BOM, como el Bloc de notas
 * }
 */
export async function startNode(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-node-'));
  const dataDir = path.join(dir, 'data');
  const configFile = path.join(dir, 'config.json');
  const port = await freePort();

  const config = {
    cloudUrl: 'http://127.0.0.1:1', nodeToken: 'PEGAR_ACA_EL_TOKEN_QUE_DA_EL_PANEL_ADMIN', teacherCode: TEACHER_CODE,
    port, hostName: 'quetzal', mdns: false, syncEveryMinutes: 600, dataDir: './data', ...(opts.config || {}),
  };
  fs.writeFileSync(configFile, (opts.bom ? '﻿' : '') + JSON.stringify(config));

  // Siembra la base antes de arrancar (la misma que abre el servidor).
  const { openDb } = await import('../../school-node/db.js');
  const seed = openDb(dataDir);
  for (const s of opts.students || []) {
    seed.prepare("INSERT INTO students (id, username, full_name, grade, section, status) VALUES (?, ?, ?, ?, ?, 'activo')")
      .run(s.id, s.username || s.id, s.full_name || s.id, s.grade || 'Primero', s.section || 'A');
  }
  for (const [id, x] of Object.entries(opts.xp || {})) seed.prepare('UPDATE students SET extra = ? WHERE id = ?').run(JSON.stringify(x), id);
  for (const g of opts.groups || []) seed.prepare('INSERT INTO groups (id, name, grade, section) VALUES (?, ?, ?, ?)').run(g.id, g.name, g.grade ?? null, g.section ?? null);
  for (const m of opts.members || []) seed.prepare('INSERT INTO group_members (id, group_id, student_id, role) VALUES (?, ?, ?, ?)').run(m.id, m.group_id, m.student_id, m.role ?? 'planner');
  for (const c of opts.courses || []) seed.prepare('INSERT INTO courses (id, grade, section, data) VALUES (?, ?, ?, ?)').run(c.id, c.grade || 'Primero', c.section || 'A', JSON.stringify(c));
  for (const k of opts.completions || []) seed.prepare("INSERT INTO completions (lesson_id, student_id, score, status, updated_at, dirty) VALUES (?, ?, ?, 'completed', ?, 0)").run(k.lesson_id, k.student_id, k.score ?? 100, new Date().toISOString());
  for (const p of opts.cloudProjects || []) {
    seed.prepare(`INSERT INTO cloud_projects (id, user_id, group_id, title, description, bimestre, score, votes, created_at, author_name, group_name, grade, section, kind, feedback)
      VALUES (@id, @user_id, @group_id, @title, @description, @bimestre, @score, @votes, @created_at, @author_name, @group_name, @grade, @section, @kind, @feedback)`)
      .run({ group_id: null, description: 'Un robot.', bimestre: 1, score: 0, votes: 0, created_at: '2026-10-30T10:00:00Z', author_name: p.user_id, group_name: null, grade: 'Primero', section: 'A', kind: 'video', feedback: null, ...p });
  }
  seed.close();

  const base = `http://127.0.0.1:${port}`;
  let child = null;
  let log = '';

  async function start() {
    child = spawn(process.execPath, ['server.js'], { cwd: NODE_DIR, env: { ...process.env, QUETZAL_CONFIG_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', d => { log += d; });
    child.stderr.on('data', d => { log += d; });
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(base + '/api/node/status')).ok) return; } catch { /* aún arrancando */ }
      await new Promise(r => setTimeout(r, 250));
      if (child.exitCode !== null) throw new Error('el nodo no arrancó:\n' + log);
    }
    throw new Error('el nodo tardó demasiado en arrancar:\n' + log);
  }
  const kill = () => new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill();
  });

  await start();
  live.add(kill);

  const api = async (p, { method = 'GET', body, token } = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  return {
    api, port, base, dir, dataDir, configFile,
    log: () => log,
    // Entra como estudiante (la primera vez crea el PIN) y devuelve la sesión.
    async login(studentId, pin = '1234') {
      const r = await api('/api/login', { method: 'POST', body: { student_id: studentId, pin, device: 'prueba' } });
      if (r.status !== 200) throw new Error(`login ${studentId}: ${r.status} ${JSON.stringify(r.data)}`);
      return r.data.token;
    },
    async teacherLogin() {
      return (await api('/api/teacher/login', { method: 'POST', body: { code: TEACHER_CODE } })).data.token;
    },
    // Reinicia el servidor con la misma carpeta (para probar qué queda tras un corte).
    async restart() { await kill(); await start(); },
    // Para sembrar o inspeccionar la base mientras el servidor está detenido.
    async stopServer() { await kill(); },
    async startServer() { await start(); },
    stop: async () => { await kill(); live.delete(kill); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows aún lo tiene abierto */ } },
  };
}
