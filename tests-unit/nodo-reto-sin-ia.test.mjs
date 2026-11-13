// En el nodo escolar (sin internet) el reto del mes no se muestra: su reflexión la revisa una IA y el premio lo da la nube.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('el banner del reto del mes no se pinta en el nodo', () => {
  const src = read('js/projects.js');
  const start = src.indexOf('window.renderActiveChallengeBanner = async function');
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf('\n}', start));
  const guard = body.indexOf('if (window.QUETZAL_NODE) return');
  assert.ok(guard > 0, 'sale vacío en el nodo');
  assert.ok(guard < body.indexOf('_supabase'), 'antes de consultar la base');
});

test('el tutorial del docente no resalta el espacio del reto en el nodo', () => {
  const src = read('js/onboarding.js');
  assert.match(src, /if \(window\.QUETZAL_NODE\) steps = steps\.filter\(s => s\.element !== '#challenge-indicator-slot'\)/);
});
