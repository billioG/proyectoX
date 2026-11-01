// Prueba de extremo a extremo del servidor del nodo: guardar el token desde el panel
// del docente (sin editar config.json). Arranca school-node/server.js de verdad con una
// configuración temporal. Si la dependencia nativa (better-sqlite3) no está instalada
// para esta versión de Node, la prueba se omite. Correr con: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE_DIR = path.join(ROOT, 'school-node');

let sqliteOk = true;
try { createRequire(path.join(NODE_DIR, 'x.js'))('better-sqlite3'); new (createRequire(path.join(NODE_DIR, 'x.js'))('better-sqlite3'))(':memory:').close(); } catch { sqliteOk = false; }

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const TOKEN = 'ab12cd34'.repeat(8);
const TEACHER_CODE = '48213976';

async function startNode() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-node-'));
  const port = await freePort();
  const configFile = path.join(dir, 'config.json');
  // Con BOM y una llave extra, como la dejaría el Bloc de notas: se debe conservar todo.
  fs.writeFileSync(configFile, '﻿' + JSON.stringify({ cloudUrl: 'http://127.0.0.1:1', nodeToken: 'PEGAR_ACA_EL_TOKEN_QUE_DA_EL_PANEL_ADMIN', teacherCode: TEACHER_CODE, port, hostName: 'quetzal', mdns: false, syncEveryMinutes: 600, dataDir: './data', extra: 'se conserva' }));
  const child = spawn(process.execPath, ['server.js'], { cwd: NODE_DIR, env: { ...process.env, QUETZAL_CONFIG_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/api/node/status')).ok) break; } catch { /* aún arrancando */ }
    await new Promise(r => setTimeout(r, 250));
    if (child.exitCode !== null) throw new Error('el nodo no arrancó:\n' + log);
  }
  const api = async (p, { method = 'GET', body, token } = {}) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  return { api, configFile, stop: () => { child.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } } };
}

test('guardar el token desde el panel del docente', { skip: !sqliteOk && 'better-sqlite3 no está instalado para este Node', timeout: 60000 }, async () => {
  const node = await startNode();
  try {
    // Sin sesión de docente no se puede.
    assert.equal((await node.api('/api/teacher/token', { method: 'POST', body: { token: TOKEN } })).status, 401);
    assert.equal((await node.api('/api/teacher/sync-now', { method: 'POST', body: {} })).status, 401);

    const login = await node.api('/api/teacher/login', { method: 'POST', body: { code: TEACHER_CODE } });
    assert.equal(login.status, 200);
    const t = login.data.token;

    // Al inicio falta el token.
    let ov = await node.api('/api/teacher/overview', { token: t });
    assert.equal(ov.data.node.has_token, false);
    assert.equal((await node.api('/api/teacher/sync-now', { method: 'POST', body: {}, token: t })).status, 400);

    // Tokens inválidos se rechazan sin tocar el archivo.
    for (const bad of ['', 'corto', 'z'.repeat(64), TOKEN + 'a', TOKEN.slice(1)]) {
      const r = await node.api('/api/teacher/token', { method: 'POST', body: { token: bad }, token: t });
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.match(r.data.error, /64 letras y números/);
    }
    assert.match(fs.readFileSync(node.configFile, 'utf8'), /PEGAR_ACA/);

    // Token válido (se aceptan espacios, saltos de línea y comillas del copiar y pegar).
    const ok = await node.api('/api/teacher/token', { method: 'POST', body: { token: `  "${TOKEN}"\n` }, token: t });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.saved, true);

    // El archivo conserva el resto de la configuración y ya tiene el token.
    const saved = JSON.parse(fs.readFileSync(node.configFile, 'utf8'));
    assert.equal(saved.nodeToken, TOKEN);
    assert.equal(saved.extra, 'se conserva');
    assert.equal(saved.teacherCode, TEACHER_CODE);

    // Sin internet (la nube de la prueba no responde): el panel lo explica en español.
    let info;
    for (let i = 0; i < 40; i++) {
      ov = await node.api('/api/teacher/overview', { token: t });
      info = ov.data.node;
      if (!info.syncing && info.last_error) break;
      await new Promise(r => setTimeout(r, 250));
    }
    assert.equal(info.has_token, true);
    assert.equal(info.syncing, false);
    assert.match(info.last_error, /No hay internet en esta computadora/);
  } finally { node.stop(); }
});
