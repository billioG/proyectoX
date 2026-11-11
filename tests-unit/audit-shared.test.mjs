// supabase/functions/_shared/audit.ts y su uso en las Edge Functions privilegiadas (bitácora de seguridad).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auditParams, logAudit } from '../supabase/functions/_shared/audit.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fakeAdmin = (reply) => ({ calls: [], rpc(fn, args) { this.calls.push([fn, args]); return Promise.resolve(typeof reply === 'function' ? reply(args) : reply); } });

test('auditParams: los nombres de parámetros que espera log_security_event y valores por defecto', () => {
  assert.deepEqual(auditParams({ actor: 'u1', action: 'students_deleted', targetType: 'student', school: 'ESC1', details: { count: 3 }, source: 'edge:x' }),
    { p_actor: 'u1', p_action: 'students_deleted', p_target_type: 'student', p_target_id: null, p_school: 'ESC1', p_details: { count: 3 }, p_source: 'edge:x' });
  const bare = auditParams({ actor: undefined, action: 'abc', source: 's' });
  assert.equal(bare.p_actor, null);
  assert.deepEqual(bare.p_details, {});
});

test('logAudit: registra por RPC y devuelve true; NUNCA lanza (falta la migración, error de la base, excepción)', async () => {
  const warn = console.warn, err = console.error; const logs = []; console.warn = (...a) => logs.push(a.join(' ')); console.error = (...a) => logs.push(a.join(' '));
  try {
    const ok = fakeAdmin({ data: null, error: null });
    assert.equal(await logAudit(ok, { actor: 'u1', action: 'teacher_created', source: 'edge:x' }), true);
    assert.equal(ok.calls[0][0], 'log_security_event');
    const missing = fakeAdmin({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.log_security_event' } });
    assert.equal(await logAudit(missing, { actor: 'u1', action: 'teacher_created', source: 'edge:x' }), false);
    assert.ok(logs.some((l) => /corre migrations\/security-audit-log\.sql/.test(l)), 'avisa qué migración falta');
    const down = fakeAdmin({ data: null, error: { code: '57014', message: 'timeout' } });
    assert.equal(await logAudit(down, { actor: 'u1', action: 'teacher_created', source: 'edge:x' }), false);
    const boom = { rpc() { throw new Error('red caída'); } };
    assert.equal(await logAudit(boom, { actor: 'u1', action: 'teacher_created', source: 'edge:x' }), false);
    const rejected = { rpc: () => Promise.reject(new Error('rechazado')) };
    assert.equal(await logAudit(rejected, { actor: 'u1', action: 'teacher_created', source: 'edge:x' }), false);
  } finally { console.warn = warn; console.error = err; }
});

test('las 6 funciones privilegiadas registran su acción con quién la pidió, justo antes de responder', () => {
  const cases = {
    'admin-create-teacher': ['teacher_created', 'caller.id'],
    'admin-delete-students': ['students_deleted', 'caller.id'],
    'admin-force-delete-school': ['school_deleted', 'caller.id'],
    'admin-set-class-password': ['class_password_changed', 'caller.id'],
    'admin-bulk-import-students': ['students_imported', 'caller.id'],
    'staff-student-passwords': ['student_passwords_revealed', 'user.id'],
  };
  for (const [name, [action, actor]] of Object.entries(cases)) {
    const src = read(`supabase/functions/${name}/index.ts`);
    assert.match(src, /from '\.\.\/_shared\/audit\.ts'/, `${name} importa el módulo`);
    assert.ok(src.includes(`action: '${action}'`), `${name} registra ${action}`);
    assert.ok(src.includes(`actor: ${actor}`), `${name}: el actor es quien llamó (${actor})`);
    assert.match(src, new RegExp(`source: 'edge:${name}'`), `${name}: source`);
  }
  assert.ok(read('supabase/functions/staff-student-passwords/index.ts').includes("action: 'student_passwords_backfill'"));
});

test('nada que sea secreto ni dato de menores entra a la bitácora desde las funciones', () => {
  for (const name of ['admin-create-teacher', 'admin-delete-students', 'admin-force-delete-school', 'admin-set-class-password', 'admin-bulk-import-students', 'staff-student-passwords']) {
    const src = read(`supabase/functions/${name}/index.ts`);
    // Solo el bloque `details: { ... }` (la acción y el source pueden llevar la palabra «password»: no es un dato).
    for (const call of (src.match(/logAudit\([\s\S]*?source: '[^']+' \}\);/g) || []).map((c) => (c.match(/details: \{[^}]*\}/) || [''])[0])) {
      // El nombre de un COLEGIO (school.name) sí se registra; el de una persona, su correo o su usuario, no.
      assert.doesNotMatch(call, /\bpassword\b(?!s_)|full_name|\bfullName\b|\bemail\b|\busername\b/, `${name}: la llamada a logAudit no debe llevar contraseñas, nombres de personas ni correos:\n${call}`);
    }
  }
});
