// Vestidor de la mascota: sus botones (pestañas, «comprar», «Ninguno») tienen que funcionar con el intérprete seguro de manejadores en línea
// (js/safe-handlers.js). Antes los onclick asignaban window._wardrobe.slot / .confirming y el intérprete lo bloqueaba («no se puede asignar a «slot»»):
// no se podía cambiar de pestaña ni confirmar una compra.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { audit } from '../scripts/handlers-audit.mjs';

const require = createRequire(import.meta.url);
const SH = require('../js/safe-handlers.js');
const src = fs.readFileSync(new URL('../js/companion.js', import.meta.url), 'utf8');

/** Recorre el árbol y junta las asignaciones a una propiedad que el intérprete no deja tocar. */
function badAssignments(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n) => badAssignments(n, out)); return out; }
  if (node.type === 'Assign' && node.target?.type === 'Member' && !node.target.computed) {
    const t = node.target;
    const viaStyle = t.obj?.type === 'Member' && t.obj.prop === 'style';
    const viaDataset = t.obj?.type === 'Member' && t.obj.prop === 'dataset';
    if (!viaStyle && !viaDataset && !SH.ASSIGNABLE[t.prop]) out.push(t.prop);
  }
  for (const k of Object.keys(node)) badAssignments(node[k], out);
  return out;
}

test('ningún manejador en línea de la app asigna a una propiedad que el intérprete bloquea (como window._wardrobe.slot)', () => {
  const bad = [];
  for (const h of audit().handlers) {
    let ast;
    try { ast = SH.parse(h.code); } catch { continue; } // lo que no se entiende ya lo reporta csp-handlers.test.mjs
    const props = badAssignments(ast);
    if (props.length) bad.push(`${h.where}: asigna a «${[...new Set(props)].join('», «')}» -> ${h.code}`);
  }
  assert.deepEqual(bad, [], 'usar una función con nombre (window.algo(...)) en vez de asignar en el onclick');
});

test('las pestañas, «comprar» y «Ninguno» del vestidor llaman funciones, no asignan', () => {
  assert.match(src, /onclick="window\.wardrobeSetSlot\('\$\{sl\.id\}'\)"/);
  assert.match(src, /onclick="window\.wardrobeAskBuy\('\$\{item\.id\}'\)"/);
  assert.doesNotMatch(src, /onclick="window\._wardrobe\./);
  assert.match(src, /equipCosmetic\('\$\{w\.slot\}', null\)/, 'opción «Ninguno»');
});

test('wardrobeSetSlot y wardrobeAskBuy se pueden llamar desde un manejador y cambian el estado', () => {
  // Se carga solo el trozo de las dos funciones con un window de mentira.
  const start = src.indexOf('window.wardrobeSetSlot = ');
  const end = src.indexOf('window.equipCosmetic = ');
  assert.ok(start > 0 && end > start);
  let renders = 0;
  const win = { _wardrobe: { slot: 'head', confirming: 'x' }, renderWardrobe() { renders++; } };
  new Function('window', src.slice(start, end))(win);
  const run = (code) => SH.run(code, { this: {}, event: { preventDefault() {}, stopPropagation() {} }, win, doc: { getElementById: () => null }, allowCalls: { wardrobeSetSlot: 1, wardrobeAskBuy: 1 }, allowReads: {} });
  run("window.wardrobeSetSlot('face')");
  assert.equal(win._wardrobe.slot, 'face');
  assert.equal(win._wardrobe.confirming, null, 'cambiar de pestaña cancela la confirmación');
  run("window.wardrobeAskBuy('gorra')");
  assert.equal(win._wardrobe.confirming, 'gorra');
  assert.equal(renders, 2);
});
