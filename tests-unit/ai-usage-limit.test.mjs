// Límite diario de IA en ai-proxy: la lógica pura (quota.ts, Node 22), el contador atómico de la base (migrations/ai-usage-limit.sql,
// PostgreSQL de verdad) y que ai-proxy lo use ANTES de llamar al modelo.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sql');

let q = null;
let skip = false;
try { q = await import('../supabase/functions/ai-proxy/quota.ts'); } catch (e) {
  if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

test('topes por rol y tipo: los de fábrica, y la variable de entorno los cambia solo si es un entero válido', { skip }, () => {
  const none = () => undefined;
  assert.equal(q.limitFor('student', 'chat', none), 30);
  assert.equal(q.limitFor('student', 'short', none), 60);
  assert.equal(q.limitFor('docente', 'chat', none), 100);
  assert.equal(q.limitFor('admin', 'chat', none), 300);
  assert.equal(q.limitFor('unknown', 'chat', none), 10);
  assert.equal(q.limitFor('student', 'chat', (n) => (n === 'AI_DAILY_STUDENT_CHAT' ? '12' : undefined)), 12);
  assert.equal(q.limitFor('student', 'chat', (n) => (n === 'AI_DAILY_STUDENT_CHAT' ? '0' : undefined)), 0, '0 = sin acceso');
  for (const bad of ['abc', '-5', '1.5', ' ', '', 'NaN', '1e3x']) assert.equal(q.parseLimit(bad, 30), 30, JSON.stringify(bad));
  assert.equal(q.parseLimit(undefined, 7), 7);
  assert.equal(q.parseLimit('99999999', 30), q.MAX_CONFIGURED_LIMIT, 'un descuido no apaga el límite');
  assert.equal(q.parseLimit(' 25 ', 30), 25);
});

test('rol del tope: estudiante gana; admin/coordinador/docente por teachers; cualquier otra cosa = unknown (tope bajo, no ilimitado)', { skip }, () => {
  assert.equal(q.quotaRole(true, 'admin'), 'student');
  assert.equal(q.quotaRole(false, 'admin'), 'admin');
  assert.equal(q.quotaRole(false, 'coordinador'), 'coordinador');
  assert.equal(q.quotaRole(false, 'docente'), 'docente');
  for (const x of [null, undefined, '', 'superadmin', 'ADMIN']) assert.equal(q.quotaRole(false, x), 'unknown');
  assert.equal(q.bucketFor(true), 'short');
  assert.equal(q.bucketFor(false), 'chat');
});

test('respuesta de la base: se normaliza y lo raro se rechaza; los errores se clasifican (falta la función vs. fallo)', { skip }, () => {
  assert.deepEqual(q.parseTake([{ allowed: true, used: 3, remaining: 27 }]), { allowed: true, used: 3, remaining: 27 });
  assert.deepEqual(q.parseTake({ allowed: false, used: '30', remaining: 0 }), { allowed: false, used: 30, remaining: 0 });
  for (const bad of [null, undefined, [], 5, 'x', {}, { allowed: 'si' }, [{ used: 1 }]]) assert.equal(q.parseTake(bad), null, JSON.stringify(bad));
  assert.equal(q.classifyRpcError(null), 'ok');
  assert.equal(q.classifyRpcError({ code: 'PGRST202', message: 'x' }), 'missing');
  assert.equal(q.classifyRpcError({ code: '42883', message: 'function public.ai_usage_take does not exist' }), 'missing');
  assert.equal(q.classifyRpcError({ code: '57014', message: 'canceling statement due to statement timeout' }), 'fatal');
  assert.equal(q.classifyRpcError({ message: 'connection refused' }), 'fatal');
});

test('mensajes de tope: claros, en español y distintos para estudiante, personal y mensajes automáticos', { skip }, () => {
  assert.match(q.limitMessage('student', 'chat'), /Ya usaste todas tus preguntas de hoy/);
  assert.match(q.limitMessage('docente', 'chat'), /límite diario/);
  assert.match(q.limitMessage('student', 'short'), /automáticos/);
});

test('ai-proxy descuenta el uso ANTES de llamar al modelo, con la llave de servicio, y devuelve 429/503 según el caso', () => {
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/ai-proxy/index.ts'), 'utf8');
  const take = src.indexOf("rpc('ai_usage_take'");
  const model = src.indexOf('api.groq.com');
  assert.ok(take > 0 && model > 0 && take < model, 'el contador debe ir antes de la llamada al modelo');
  assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(src, /code: 'daily_limit'[^)]*429\)/);
  assert.match(src, /quota_unavailable'[^)]*503\)/);
  // El rol del tope sale de la base, no de lo que manda el cliente.
  assert.match(src, /from\('teachers'\)\.select\('role'\)\.eq\('id', user\.id\)/);
  assert.doesNotMatch(src, /quotaRole\([^)]*\brole\b/);
});

let pg = null;
after(() => pg?.stop());

test('ai-usage-limit.sql: contador atómico por usuario, día y tipo; tope; costo; permisos solo para service_role', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const stub = pg.psql(path.join(SQL, 'aiquota.stub.sql'));
  assert.equal(stub.status, 0, stub.stderr);
  const result = pg.psql(path.join(SQL, 'aiquota.assert.sql'));
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /AIQUOTA_SQL_OK/);
});
