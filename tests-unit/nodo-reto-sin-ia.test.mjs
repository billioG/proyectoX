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

test('el resto de lo que usa IA tampoco se ofrece en el nodo (evaluación, mascota, práctica y juegos que crean contenido con IA)', () => {
  const evalSrc = read('js/evaluation-modals.js');
  assert.equal((evalSrc.match(/id="ai-(code-)?eval-panel" \$\{window\.IS_NODE_REST \?/g) || []).length, 2, 'los dos paneles de evaluación con IA se ocultan');
  const mascot = read('js/mascot-widget.js');
  assert.match(mascot, /async openAIChat\(\) \{\s*\n\s*if \(window\.IS_NODE_REST\) return;/);
  assert.match(mascot, /!isMoodGreeting && !window\.IS_NODE_REST/);
  assert.match(read('js/practice.js'), /if \(window\.IS_NODE_REST\) \{\s*\n\s*const out = bank\(\);/);
  const arena = read('js/game-arena.js');
  assert.match(arena, /if \(window\.IS_NODE_REST\) \{\s*\n\s*for \(const k of \['quiz', 'debug', 'spelling'\]\)/);
  const hub = read('js/gamification.js');
  const hidden = [...hub.matchAll(/\$\{window\.IS_NODE_REST \? '' : `([\s\S]*?)`\}/g)].map((m) => m[1]).join('\n');
  for (const id of ['duels-section', 'debug-section', 'spelling-section']) assert.ok(hidden.includes(`id="${id}"`), `${id} no se dibuja en el nodo`);
  assert.ok(!hidden.includes('id="hangman-section"') && !hidden.includes('id="timed-math-section"'), 'Ahorcado y Contrarreloj sí quedan');
  assert.match(hub, /!window\.IS_NODE_REST && typeof window\.loadDuelsSection/);
});
