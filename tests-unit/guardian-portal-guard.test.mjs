// Reglas del Portal de padres: vencimiento del enlace y límite de intentos con enlaces inválidos (supabase/functions/guardian-portal/portal-guard.ts).
// Lógica pura: necesita importar TypeScript (Node 22); con otra versión se omite.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/guardian-portal/portal-guard.ts');
} catch (e) {
  if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const NOW = new Date('2026-11-07T12:00:00Z');

test('un enlace vence en su fecha; sin fecha no vence (migración pendiente o enlace anterior)', { skip }, () => {
  assert.equal(mod.isTokenExpired('2026-11-07T11:59:59Z', NOW), true);
  assert.equal(mod.isTokenExpired('2026-11-07T12:00:00Z', NOW), true);
  assert.equal(mod.isTokenExpired('2026-11-07T12:00:01Z', NOW), false);
  assert.equal(mod.isTokenExpired(null, NOW), false);
  assert.equal(mod.isTokenExpired(undefined, NOW), false);
  assert.equal(mod.isTokenExpired('no es una fecha', NOW), false, 'una fecha rota no deja a un padre fuera');
});

test('límite de fallos por IP: se bloquea al llegar al tope dentro de la ventana y se libera al pasar la ventana', { skip }, () => {
  const start = (minAgo) => new Date(NOW.getTime() - minAgo * 60000).toISOString();
  assert.deepEqual(mod.rateState(null, NOW), { withinWindow: false, blocked: false });
  assert.deepEqual(mod.rateState({ attempts: 29, window_start: start(1) }, NOW), { withinWindow: true, blocked: false });
  assert.deepEqual(mod.rateState({ attempts: 30, window_start: start(1) }, NOW), { withinWindow: true, blocked: true });
  assert.deepEqual(mod.rateState({ attempts: 99, window_start: start(mod.TOKEN_RATE_WINDOW_MIN + 1) }, NOW), { withinWindow: false, blocked: false });
  assert.equal(mod.rateState({ attempts: 99, window_start: 'basura' }, NOW).blocked, false);
});

test('la clave del contador no choca con la del login y se acota', { skip }, () => {
  assert.equal(mod.rateKey('10.0.0.1'), 'gp:10.0.0.1');
  assert.equal(mod.rateKey(''), 'gp:unknown');
  assert.equal(mod.rateKey('x'.repeat(500)).length, 3 + 64);
});

test('guardian-portal.sql: la migración crea la columna, la función solo para quien administra al alumno, y es re-ejecutable', async () => {
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../migrations/guardian-portal-token.sql', import.meta.url), 'utf8');
  assert.match(sql, /add column if not exists portal_token_expires_at/);
  assert.match(sql, /can_manage_student\(v_student\)/);
  assert.match(sql, /revoke all on function public\.regenerate_guardian_portal_token\(uuid\) from public, anon/);
  assert.match(sql, /where portal_token_expires_at is null/, 'los enlaces existentes reciben fecha sin pisar los que ya la tienen');
});
