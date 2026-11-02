// Mascota sin internet con la app real: elegir la primera, comprar huevos con gemas, cambiar de compañero, comprar y ponerse accesorios. Mismas
// reglas y mensajes que la nube; lo hecho aquí se ve al instante (gemas incluidas) y se anota para que la nube lo aplique al sincronizar. Node 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../school-node/db.js';
import { createRestLayer } from '../school-node/rest/index.js';
import { applyPull, buildPush } from '../school-node/sync.js';
import { hashClassPassword } from '../school-node/rest/auth.js';
import { applyAction, baseState, stageOf } from '../school-node/rest/companion.js';

const cleanups = [];
test.after(async () => { for (const c of cleanups.reverse()) await c(); });
const salt = 'ab'.repeat(8);
const CATALOG = [
  { id: 'lentes_nerd', slot: 'face', name: 'Lentes de estudio', price: 0, min_stage: 1, sort: 10 },
  { id: 'gorra', slot: 'head', name: 'Gorra', price: 150, min_stage: 1, sort: 20 },
  { id: 'sombrero', slot: 'head', name: 'Sombrero vaquero', price: 320, min_stage: 3, sort: 40 },
  { id: 'skin_neon', slot: 'skin', name: 'Traje neón', price: 500, min_stage: 3, sort: 10 },
];

async function boot(over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-comp-'));
  const db = openDb(dir);
  const layer = createRestLayer(db);
  applyPull(db, {
    server_time: '2026-11-02T00:00:00Z', node: { name: 'N', school_code: 'ESC1' }, students: [], courses: [], completions: [], files: [],
    class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
    tables: {
      students: [
        { id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', gems: 200, gems_earned_total: 650, companion_species: 'quetzal', companion_equipped: {}, ...over },
        { id: 's2', username: 'beto1', full_name: 'Beto', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', gems: 0, gems_earned_total: 0, companion_species: null, companion_equipped: {} },
      ],
      cosmetic_items: CATALOG,
      student_companions: [{ id: 's1:quetzal', student_id: 's1', species: 'quetzal', obtained_at: '2026-10-01' }],
    },
  });
  const server = http.createServer(async (req, res) => { if (!(await layer.routes.handle(req, res, new URL(req.url, 'http://node')))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanups.push(() => new Promise((r) => server.close(r)), () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, { token, body } = {}) => fetch(base + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const student = async (user = 'ana1') => {
    const { token_hash } = await (await call('POST', '/functions/v1/student-login', { body: { username: user, password: 'clase123' } })).json();
    return (await (await call('POST', '/auth/v1/verify', { body: { type: 'magiclink', token_hash } })).json()).access_token;
  };
  const rpc = async (token, fn, args = {}) => { const r = await call('POST', `/rest/v1/rpc/${fn}`, { token, body: args }); return { status: r.status, data: await r.json().catch(() => null) }; };
  const me = async (token) => (await (await call('GET', '/rest/v1/students?select=gems,companion_species,companion_equipped&id=eq.s1', { token })).json())[0];
  return { db, layer, call, student, rpc, me };
}

test('las reglas puras: etapas, primera mascota, huevo, cambio de compañero, accesorios', () => {
  assert.deepEqual([0, 99, 100, 299, 300, 599, 600, 999, 1000, 1599, 1600].map(stageOf), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
  const cat = new Map(CATALOG.map((i) => [i.id, i]));
  const s0 = baseState({ companion_species: null, gems: 160, gems_earned_total: 650 });
  const a = (s, fn, args) => applyAction(s, { fn, args }, cat);
  const s1 = a(s0, 'choose_companion', { p_species: 'jaguar' });
  assert.deepEqual([s1.species, s1.owned.has('jaguar'), s1.result], ['jaguar', true, 'jaguar']);
  assert.throws(() => a(s1, 'choose_companion', { p_species: 'quetzal' }), /Ya elegiste tu primera mascota/);
  assert.throws(() => a(s0, 'choose_companion', { p_species: 'dragon' }), /Mascota inválida/);
  assert.throws(() => a(s0, 'buy_companion_egg', { p_species: 'tucan' }), /Primero elegí tu mascota inicial/);
  const s2 = a(s1, 'buy_companion_egg', { p_species: 'tucan' });
  assert.deepEqual([s2.species, s2.gems, s2.result], ['tucan', 10, { species: 'tucan', gems: 10 }]);
  assert.throws(() => a(s2, 'buy_companion_egg', { p_species: 'tucan' }), /Ya tenés esta mascota/);
  assert.throws(() => a(s2, 'buy_companion_egg', { p_species: 'manati' }), /Te faltan 140 gemas/);
  assert.equal(a(s2, 'set_active_companion', { p_species: 'jaguar' }).species, 'jaguar');
  assert.throws(() => a(s2, 'set_active_companion', { p_species: 'manati' }), /Todavía no tenés esa mascota/);
  assert.throws(() => a(s0, 'buy_cosmetic', { p_item: 'lentes_nerd' }), /gratis/);
  assert.throws(() => a(s0, 'buy_cosmetic', { p_item: 'nada' }), /no existe/);
  assert.throws(() => a(s0, 'buy_cosmetic', { p_item: 'skin_neon' }), /no tenés suficientes gemas|no evolucionó/i);
  const s3 = a(s1, 'buy_cosmetic', { p_item: 'gorra' });
  assert.equal(s3.gems, 10);
  assert.throws(() => a(s3, 'buy_cosmetic', { p_item: 'gorra' }), /Ya lo tenés/);
  assert.deepEqual(a(s3, 'equip_cosmetic', { p_slot: 'head', p_item: 'gorra' }).result, { head: 'gorra' });
  assert.throws(() => a(s1, 'equip_cosmetic', { p_slot: 'head', p_item: 'gorra' }), /Todavía no lo compraste/);
  assert.throws(() => a(s1, 'equip_cosmetic', { p_slot: 'face', p_item: 'gorra' }), /Accesorio inválido/);
  assert.throws(() => a(s1, 'equip_cosmetic', { p_slot: 'oreja', p_item: null }), /Slot inválido/);
  assert.throws(() => a(baseState({ companion_species: 'quetzal', gems: 900, gems_earned_total: 50 }), 'equip_cosmetic', { p_slot: 'face', p_item: 'lentes_nerd' }), /no evolucionó/);
  assert.deepEqual(a(a(s3, 'equip_cosmetic', { p_slot: 'head', p_item: 'gorra' }), 'equip_cosmetic', { p_slot: 'head', p_item: null }).result, {});
});

test('la primera mascota gratis: se ve al instante, queda en la bandeja y no se repite; las demás reglas dan los mismos mensajes', async () => {
  const h = await boot();
  const s2 = await h.student('beto1');
  assert.equal((await h.rpc(s2, 'choose_companion', { p_species: 'dragon' })).status, 400);
  const ok = await h.rpc(s2, 'choose_companion', { p_species: 'jaguar' });
  assert.deepEqual([ok.status, ok.data], [200, 'jaguar']);
  const again = await h.rpc(s2, 'choose_companion', { p_species: 'tortuga' });
  assert.equal(again.status, 400);
  assert.match(again.data.message, /Ya elegiste tu primera mascota/);
  const row = (await (await h.call('GET', '/rest/v1/students?select=companion_species&id=eq.s2', { token: s2 })).json())[0];
  assert.equal(row.companion_species, 'jaguar');
  const owned = await (await h.call('GET', '/rest/v1/student_companions?select=species', { token: s2 })).json();
  assert.deepEqual(owned, [{ species: 'jaguar' }], 'su colección ya la incluye');
  const push = buildPush(h.db, { cloudUrl: 'https://x.supabase.co' });
  assert.deepEqual(push.rpc.map((r) => [r.fn, r.student_id, r.args]), [['choose_companion', 's2', { p_species: 'jaguar' }]]);
});

test('comprar un huevo gasta las gemas al instante (y no se puede gastar lo que no hay); cambiar de compañero solo entre los que tiene', async () => {
  const h = await boot();
  const s1 = await h.student();
  const egg = await h.rpc(s1, 'buy_companion_egg', { p_species: 'tucan' });
  assert.deepEqual([egg.status, egg.data], [200, { species: 'tucan', gems: 50 }]);
  assert.deepEqual(await h.me(s1), { gems: 50, companion_species: 'tucan', companion_equipped: {} });
  const poor = await h.rpc(s1, 'buy_companion_egg', { p_species: 'manati' });
  assert.equal(poor.status, 400);
  assert.match(poor.data.message, /Te faltan 100 gemas/);
  assert.equal((await h.rpc(s1, 'set_active_companion', { p_species: 'quetzal' })).data, 'quetzal');
  assert.equal((await h.me(s1)).companion_species, 'quetzal');
  assert.equal((await h.rpc(s1, 'set_active_companion', { p_species: 'manati' })).status, 400);
  const owned = (await (await h.call('GET', '/rest/v1/student_companions?select=species&order=species.asc', { token: s1 })).json()).map((r) => r.species);
  assert.deepEqual(owned, ['quetzal', 'tucan']);
  assert.deepEqual(buildPush(h.db, { cloudUrl: 'x' }).rpc.map((r) => r.fn), ['buy_companion_egg', 'set_active_companion']);
});

test('accesorios: el catálogo se lee, comprar gasta gemas, ponerse y quitarse; los de precio 0 se ponen al llegar a su etapa; no hay forma de escribir las tablas directo', async () => {
  const h = await boot();
  const s1 = await h.student();
  const items = await (await h.call('GET', '/rest/v1/cosmetic_items?select=id,price&order=sort.asc', { token: s1 })).json();
  assert.equal(items.length, 4);
  assert.deepEqual((await h.rpc(s1, 'buy_cosmetic', { p_item: 'gorra' })).data, { gems: 50 });
  assert.equal((await h.rpc(s1, 'buy_cosmetic', { p_item: 'gorra' })).status, 400, 'Ya lo tenés');
  assert.deepEqual((await h.rpc(s1, 'equip_cosmetic', { p_slot: 'head', p_item: 'gorra' })).data, { head: 'gorra' });
  assert.deepEqual((await h.rpc(s1, 'equip_cosmetic', { p_slot: 'face', p_item: 'lentes_nerd' })).data, { head: 'gorra', face: 'lentes_nerd' }, 'gratis al llegar a su etapa');
  assert.deepEqual((await h.me(s1)).companion_equipped, { head: 'gorra', face: 'lentes_nerd' });
  assert.deepEqual((await h.rpc(s1, 'equip_cosmetic', { p_slot: 'head', p_item: null })).data, { face: 'lentes_nerd' });
  assert.equal((await h.rpc(s1, 'buy_cosmetic', { p_item: 'sombrero' })).status, 400, 'no le alcanzan las gemas');
  const mine = await (await h.call('GET', '/rest/v1/student_cosmetics?select=item_id', { token: s1 })).json();
  assert.deepEqual(mine, [{ item_id: 'gorra' }]);
  assert.equal((await h.call('POST', '/rest/v1/student_cosmetics', { token: s1, body: { student_id: 's1', item_id: 'skin_neon' } })).status, 403);
  assert.equal((await h.call('POST', '/rest/v1/student_companions', { token: s1, body: { student_id: 's1', species: 'manati' } })).status, 403);
  assert.equal((await h.call('PATCH', '/rest/v1/students?id=eq.s1', { token: s1, body: { gems: 99999 } })).status, 403);
  const other = await h.student('beto1');
  assert.deepEqual(await (await h.call('GET', '/rest/v1/student_cosmetics?select=item_id', { token: other })).json(), [], 'cada quien ve lo suyo');
});

test('cuando la nube confirma, lo pendiente sale de la bandeja y su base nueva manda; un docente o un visitante no usan estas funciones', async () => {
  const h = await boot();
  const s1 = await h.student();
  await h.rpc(s1, 'buy_cosmetic', { p_item: 'gorra' });
  const push = buildPush(h.db, { cloudUrl: 'x' });
  const [item] = push.rpc;
  applyPull(h.db, {
    server_time: '2026-11-02T01:00:00Z', applied: { rpc: [item.seq] }, rpc_errors: [], students: [], courses: [], completions: [], files: [],
    tables: { students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', gems: 50, gems_earned_total: 650, companion_species: 'quetzal', companion_equipped: {} }], student_cosmetics: [{ id: 's1:gorra', student_id: 's1', item_id: 'gorra', acquired_at: '2026-11-02' }], student_companions: [{ id: 's1:quetzal', student_id: 's1', species: 'quetzal', obtained_at: '2026-10-01' }], cosmetic_items: CATALOG },
  }, push);
  assert.equal(buildPush(h.db, { cloudUrl: 'x' }).rpc.length, 0);
  assert.equal((await h.me(s1)).gems, 50, 'ya no se descuenta dos veces');
  assert.equal((await h.rpc(s1, 'buy_cosmetic', { p_item: 'gorra' })).status, 400, 'Ya lo tenés, ahora por lo que bajó de la nube');
  assert.equal((await h.call('POST', '/rest/v1/rpc/choose_companion', { body: { p_species: 'jaguar' } })).status, 401);
});
