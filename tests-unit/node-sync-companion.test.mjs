// Acciones de mascota que sube un nodo (supabase/functions/node-sync/companion.ts): solo se valida la forma; las reglas las aplica la función SQL.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/companion.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /companion\.ts/.test(String(e.message))) {
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}
const ctx = { studentIds: new Set(['s1']) };
const ev = (fn, args, sid = 's1') => ({ seq: 1, fn, student_id: sid, args });

test('acepta cada acción con sus argumentos y arma la llamada a la función SQL', { skip }, () => {
  assert.deepEqual(mod.validateCompanionEvent(ev('choose_companion', { p_species: 'jaguar' }), ctx), { ok: true, call: { p_student_id: 's1', p_fn: 'choose_companion', p_species: 'jaguar', p_item: null, p_slot: null } });
  assert.equal(mod.validateCompanionEvent(ev('buy_companion_egg', { p_species: 'manati' }), ctx).ok, true);
  assert.equal(mod.validateCompanionEvent(ev('set_active_companion', { p_species: 'quetzal' }), ctx).ok, true);
  assert.deepEqual(mod.validateCompanionEvent(ev('buy_cosmetic', { p_item: 'skin_oro' }), ctx).call.p_item, 'skin_oro');
  assert.deepEqual(mod.validateCompanionEvent(ev('equip_cosmetic', { p_slot: 'head', p_item: null }), ctx).call, { p_student_id: 's1', p_fn: 'equip_cosmetic', p_species: null, p_item: null, p_slot: 'head' });
});

test('rechaza funciones raras, estudiantes ajenos y argumentos fuera de lista (nada llega a la base)', { skip }, () => {
  for (const bad of [ev('drop_table', {}), ev('choose_companion', { p_species: 'dragon' }), ev('choose_companion', {}), ev('buy_cosmetic', { p_item: 'A; drop' }), ev('buy_cosmetic', { p_item: 5 }), ev('buy_cosmetic', {}),
    ev('equip_cosmetic', { p_slot: 'oreja', p_item: null }), ev('equip_cosmetic', { p_slot: 'head', p_item: 'x y' }), ev('choose_companion', { p_species: 'jaguar' }, 'otro'), null, { fn: 'choose_companion' }]) {
    assert.equal(mod.validateCompanionEvent(bad, ctx).ok, false, JSON.stringify(bad));
  }
  assert.equal(mod.isCompanionFn('choose_companion'), true);
  assert.equal(mod.isCompanionFn('log_practice'), false);
});
