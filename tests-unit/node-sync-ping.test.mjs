// Aviso del servidor escolar a la nube (acción node_ping): el estado que manda se limpia a pocos campos acotados antes de guardarse (supabase/functions/node-sync/validators.ts).
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/validators.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /validators\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

test('el estado válido pasa tal cual, con la fecha normalizada', { skip }, () => {
  const out = mod.sanitizeNodeStatus({ version: 'v1.0.223', pending_changes: 3, syncing: true, stage: 'Subiendo archivos de cursos', last_sync_at: '2026-11-05T15:00:00.000Z', internet: true, urls: ['http://192.168.1.50:8080', 'http://quetzal.local:8080'] });
  assert.deepEqual(out, { version: 'v1.0.223', pending_changes: 3, syncing: true, stage: 'Subiendo archivos de cursos', last_sync_at: '2026-11-05T15:00:00.000Z', internet: true, urls: ['http://192.168.1.50:8080', 'http://quetzal.local:8080'], updating: false, update_error: null });
});

test('lo raro se descarta o se acota: campos desconocidos, textos enormes, números absurdos, fechas malas y direcciones que no son http(s)', { skip }, () => {
  const out = mod.sanitizeNodeStatus({
    version: 'x'.repeat(100), pending_changes: -5, syncing: 'si', stage: 'y'.repeat(500), last_sync_at: 'ayer', internet: 'quizá',
    urls: ['javascript:alert(1)', 'http://ok.local', 'http://' + 'a'.repeat(200), 5, 'http://b', 'http://c', 'http://d', 'http://e', 'http://f'], token: 'secreto', admin: true,
  });
  assert.equal(out.version.length, 40);
  assert.equal(out.pending_changes, null);
  assert.equal(out.syncing, false);
  assert.equal(out.stage.length, 120);
  assert.equal(out.last_sync_at, null);
  assert.equal(out.internet, null);
  assert.deepEqual(out.urls, ['http://ok.local', 'http://b', 'http://c', 'http://d', 'http://e']);
  assert.deepEqual(Object.keys(out).sort(), ['internet', 'last_sync_at', 'pending_changes', 'stage', 'syncing', 'update_error', 'updating', 'urls', 'version']);
  assert.equal(mod.sanitizeNodeStatus({ pending_changes: 9_999_999 }).pending_changes, 1_000_000);
  for (const junk of [null, undefined, 5, 'x', []]) assert.deepEqual(Object.keys(mod.sanitizeNodeStatus(junk)).sort(), ['internet', 'last_sync_at', 'pending_changes', 'stage', 'syncing', 'update_error', 'updating', 'urls', 'version']);
});

test('el estado de actualización: «updating» solo si es true y el error se acota a 200 caracteres', { skip }, () => {
  assert.equal(mod.sanitizeNodeStatus({ updating: true }).updating, true);
  assert.equal(mod.sanitizeNodeStatus({ updating: 'si' }).updating, false);
  assert.equal(mod.sanitizeNodeStatus({ update_error: 'e'.repeat(500) }).update_error.length, 200);
  assert.equal(mod.sanitizeNodeStatus({ update_error: '' }).update_error, null);
});
