// Prueba de extremo a extremo del servidor del nodo: guardar el token desde el panel
// del docente (sin editar config.json). Arranca school-node/server.js de verdad con una
// configuración temporal. Si la dependencia nativa (better-sqlite3) no está instalada
// para esta versión de Node, la prueba se omite. Correr con: npm run test:unit
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startNode, sqliteAvailable, TEACHER_CODE, stopAllNodes } from './helpers/start-node.mjs';

after(() => stopAllNodes());

const TOKEN = 'ab12cd34'.repeat(8);

test('guardar el token desde el panel del docente', { skip: !sqliteAvailable() && 'better-sqlite3 no está instalado para este Node', timeout: 60000 }, async () => {
  // Con BOM y una llave extra, como la dejaría el Bloc de notas: se debe conservar todo.
  const node = await startNode({ bom: true, config: { extra: 'se conserva' } });
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
    assert.match(info.last_error, /Sin internet por ahora/);
  } finally { await node.stop(); }
});
