// Portal de padres: el enlace se guarda como huella SHA-256 y no en claro (migrations/guardian-portal-token-hash.sql, guardian-portal, students.js).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgSkip, startTempPostgres } from './helpers/temp-postgres.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const out = (r) => r.stdout.split('\r').join('').trim();

test('tokenHash de la función del portal da el mismo SHA-256 hex que la base', async () => {
  let mod;
  try { mod = await import('../supabase/functions/guardian-portal/portal-guard.ts'); } catch { return; } // Node < 22: no importa TypeScript
  const t = 'a'.repeat(32);
  assert.equal(await mod.tokenHash(t), sha(t));
  assert.match(await mod.tokenHash('0123456789abcdef0123456789abcdef'), /^[0-9a-f]{64}$/);
});

test('la función del portal busca por huella y deja el token en claro solo de respaldo', () => {
  const src = read('supabase/functions/guardian-portal/index.ts');
  assert.match(src, /import \{ isTokenExpired, rateKey, rateState, tokenHash \}/);
  assert.match(src, /\.eq\('portal_token_hash', await tokenHash\(token\)\)/);
  assert.match(src, /if \(!g \|\| hashErr\) \(\{ data: g \} = await admin\.from\('student_guardians'\)\.select\(cols\)\.eq\('portal_token', token\)/);
});

test('el docente: el enlace nuevo se ve una vez (memoria), los anteriores en claro siguen igual y sin enlace no hay botones de envío', () => {
  const src = read('js/students.js');
  assert.match(src, /window\.guardianTokenOf = \(g\) => window\._guardianFreshTokens\[g\.id\] \|\| g\.portal_token \|\| null/);
  assert.match(src, /const tok = window\.guardianTokenOf\(g\);\s*\n\s*const link = tok \? window\.guardianPortalUrl\(tok\) : ''/);
  assert.match(src, /\$\{g\.phone && link \? `<button/);
  assert.match(src, /\$\{link \? `<button[^\n]*Copiar enlace<\/button>` : ''\}/);
  assert.match(src, /if \(!tok\) throw new Error\('Genera un enlace nuevo para poder enviarlo'\)/);
  assert.match(src, /const \{ data: newToken, error \} = await window\._supabase\.rpc\('regenerate_guardian_portal_token'/);
  assert.match(src, /\.select\('id'\)\.maybeSingle\(\)/, 'al agregar un padre se pide su id para generarle el enlace seguro');
  assert.ok(!/g\.portal_token\)/.test(src.replace('g.portal_token || null', '')), 'ningún otro lugar arma el enlace con el token guardado');
});

let pg = null;
after(() => pg?.stop());

test('la migración, en PostgreSQL de verdad: enlaces viejos siguen sirviendo por huella, el nuevo se guarda solo como huella, y es re-ejecutable', { skip: pgSkip, timeout: 120000 }, async () => {
  pg = await startTempPostgres();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-guardian-'));
  const run = (sql) => { const f = path.join(dir, `q${Math.random().toString(36).slice(2)}.sql`); fs.writeFileSync(f, sql); return pg.psql(f); };
  const q = (sql) => { const r = run(sql); assert.equal(r.status, 0, r.stderr); return out(r); };
  const migration = read('migrations/guardian-portal-token-hash.sql');

  const G1 = '00000000-0000-0000-0000-0000000000a1', G2 = '00000000-0000-0000-0000-0000000000a2', S1 = '00000000-0000-0000-0000-0000000000b1';
  const OLD = 'e'.repeat(32);
  const setup = run(`
    do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end $$;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function public.can_manage_student(s uuid) returns boolean language sql as $$ select true $$;
    create table public.student_guardians (id uuid primary key, student_id uuid, portal_token text not null unique default replace(gen_random_uuid()::text, '-', ''), portal_token_expires_at timestamptz);
    insert into public.student_guardians (id, student_id, portal_token) values ('${G1}', '${S1}', '${OLD}');
  `);
  assert.equal(setup.status, 0, setup.stderr);

  for (const pass of [1, 2]) { const m = run(migration); assert.equal(m.status, 0, `migración, pasada ${pass}: ${m.stderr}`); }

  // 1. El enlace que ya se había enviado tiene su huella (y la base la calcula igual que la función del portal).
  assert.equal(q(`select portal_token_hash from public.student_guardians where id = '${G1}';`), sha(OLD));
  assert.equal(q(`select portal_token from public.student_guardians where id = '${G1}';`), OLD, 'el token en claro anterior no se borra (eso es el Paso 2, a mano)');

  // 2. Un token escrito en claro (alta antigua, con el valor por defecto) recibe su huella solo.
  assert.equal(run(`insert into public.student_guardians (id, student_id) values ('${G2}', '${S1}');`).status, 0);
  assert.equal(q(`select (portal_token_hash = encode(sha256(convert_to(portal_token, 'UTF8')), 'hex'))::text from public.student_guardians where id = '${G2}';`), 'true');

  // 3. Regenerar: devuelve el token UNA vez, en la base queda solo la huella, y el anterior deja de servir.
  const token = q(`set test.uid = '${G1}'; select public.regenerate_guardian_portal_token('${G1}');`).split('\n').pop();
  assert.match(token, /^[0-9a-f]{32}$/);
  assert.equal(q(`select coalesce(portal_token, 'NULO') from public.student_guardians where id = '${G1}';`), 'NULO', 'el token nuevo no se guarda en claro');
  assert.equal(q(`select portal_token_hash from public.student_guardians where id = '${G1}';`), sha(token));
  assert.equal(q(`select count(*) from public.student_guardians where portal_token_hash = '${sha(OLD)}';`), '0', 'el enlace anterior ya no sirve');
  assert.equal(q(`select count(*) from public.student_guardians where portal_token is null and portal_token_expires_at > now() + interval '179 days';`), '1', 'vence a los 180 días');

  // 4. Sin sesión no se regenera.
  const noAuth = run(`set test.uid = ''; select public.regenerate_guardian_portal_token('${G2}');`);
  assert.notEqual(noAuth.status, 0);
  assert.match(noAuth.stderr, /No autenticado/);
});
