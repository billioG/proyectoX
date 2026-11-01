// Pruebas de las partes puras de js/node-admin.js (registrar nodo escolar).
// Correr con: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractToken, nodeStatus, friendlyNodeError } from '../js/node-admin.js';

const TOKEN = 'a'.repeat(32) + 'B1'.repeat(16); // 64 caracteres hexadecimales

test('extractToken: acepta el objeto o una lista de un elemento', () => {
  assert.deepEqual(extractToken({ id: 'n1', token: TOKEN }), { id: 'n1', token: TOKEN });
  assert.deepEqual(extractToken([{ id: 'n1', token: TOKEN }]), { id: 'n1', token: TOKEN });
});

test('extractToken: rechaza respuestas sin un token válido (no lo inventa)', () => {
  for (const bad of [null, undefined, {}, [], { token: 'corto' }, { token: 123 }, { token: 'z'.repeat(64) }, { token: TOKEN + 'a' }]) {
    assert.equal(extractToken(bad), null, JSON.stringify(bad));
  }
});

test('nodeStatus: revocado, sin sincronizar y tiempos', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const ago = (min) => new Date(now - min * 60000).toISOString();
  assert.equal(nodeStatus({ revoked_at: ago(5), last_sync_at: ago(1) }, now).key, 'revoked');
  assert.deepEqual(nodeStatus({ last_sync_at: null }, now), { key: 'never', label: 'Aún no se ha sincronizado', tone: 'warn' });
  assert.equal(nodeStatus({ last_sync_at: ago(0) }, now).label, 'Sincronizó hace menos de 1 minuto');
  assert.equal(nodeStatus({ last_sync_at: ago(12) }, now).label, 'Sincronizó hace 12 min');
  assert.equal(nodeStatus({ last_sync_at: ago(180) }, now).label, 'Sincronizó hace 3 h');
  const old = nodeStatus({ last_sync_at: ago(60 * 24 * 5) }, now);
  assert.equal(old.label, 'Sincronizó hace 5 días');
  assert.equal(old.tone, 'warn');
  assert.equal(nodeStatus({ last_sync_at: ago(30) }, now).tone, 'ok');
});

test('friendlyNodeError: migración faltante, permisos y mensajes normales', () => {
  assert.match(friendlyNodeError({ message: 'relation "public.school_nodes" does not exist', code: '42P01' }), /migrations\/school-nodes\.sql/);
  assert.match(friendlyNodeError({ message: 'Could not find the function public.register_school_node in the schema cache' }), /migrations\/school-nodes\.sql/);
  assert.match(friendlyNodeError({ message: 'Solo un admin puede registrar nodos' }), /Solo un administrador/);
  assert.equal(friendlyNodeError({ message: 'Establecimiento no encontrado' }), 'Establecimiento no encontrado');
  assert.equal(friendlyNodeError(null), 'Error desconocido');
});
