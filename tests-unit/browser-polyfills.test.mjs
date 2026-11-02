// El nodo se abre por http://<IP> (no es un contexto seguro): ahí el navegador NO trae crypto.randomUUID y la app fallaba al crear
// recursos («crypto.randomUUID is not a function»). El nodo entrega un reemplazo antes que la app.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { POLYFILLS } from '../school-node/browser-polyfills.js';

const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('sin crypto.randomUUID (contexto no seguro) lo reemplaza con UUID v4 válidos y distintos', () => {
  const win = { crypto: { getRandomValues: (a) => crypto.webcrypto.getRandomValues(a) } };
  win.window = win;
  vm.runInNewContext(POLYFILLS, win);
  const ids = new Set(Array.from({ length: 500 }, () => win.crypto.randomUUID()));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, UUID4);
});

test('si el navegador ya la trae no la toca', () => {
  const original = () => 'original';
  const win = { crypto: { randomUUID: original, getRandomValues: (a) => a } };
  win.window = win;
  vm.runInNewContext(POLYFILLS, win);
  assert.equal(win.crypto.randomUUID, original);
});
