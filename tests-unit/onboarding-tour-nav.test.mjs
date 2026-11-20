// Tutorial con driver.js (js/onboarding.js): «Atrás» vuelve a la vista del paso, un solo avance a la vez, y el tour no se queda bloqueado si falla.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../js/onboarding.js', import.meta.url), 'utf8');

/** Carga onboarding.js en un contexto aislado y devuelve buildDriverSteps junto con lo que hace falta para observarlo. */
function load() {
  const timers = [];
  const ctx = {
    console: { log() { }, warn() { }, error() { } },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    document: { querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
  };
  ctx.window = Object.assign(ctx, { innerWidth: 1200 });
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, timers };
}

/** Un driver de mentira con el mismo contrato que usa el tour (getActiveIndex, moveNext, movePrevious, isActive, refresh). */
function fakeDriver() {
  const d = { index: 0, active: true, refreshed: 0, moves: [] };
  d.getActiveIndex = () => d.index;
  d.isActive = () => d.active;
  d.moveNext = () => { d.index++; d.moves.push('next'); };
  d.movePrevious = () => { d.index--; d.moves.push('prev'); };
  d.refresh = () => { d.refreshed++; };
  return d;
}

const raw = (calls) => [
  { before: () => calls.push('nav:feed'), title: 'Bienvenida' },
  { element: undefined, title: 'Menú' },
  { before: () => calls.push('nav:lessons'), element: undefined, title: 'Cursos' },
  { element: undefined, title: 'Subir' },
  { before: () => calls.push('nav:upload'), element: undefined, title: 'Título' },
];

test('hacia adelante cada vista se abre una sola vez, en el paso que la necesita', async () => {
  const { ctx } = load();
  const calls = [];
  const drv = fakeDriver();
  const steps = ctx.buildDriverSteps(raw(calls), () => drv);
  for (let i = 0; i < 4; i++) await steps[drv.index].popover.onNextClick();
  assert.equal(drv.index, 4);
  assert.deepEqual(calls, ['nav:lessons', 'nav:upload'], 'el paso 0 ya lo abrió runGuidedTour; los pasos 1 y 3 no cambian de vista');
});

test('«Atrás» vuelve a la vista que el paso anterior necesita (antes el resaltado caía en un elemento oculto)', async () => {
  const { ctx } = load();
  const calls = [];
  const drv = fakeDriver();
  const steps = ctx.buildDriverSteps(raw(calls), () => drv);
  for (let i = 0; i < 4; i++) await steps[drv.index].popover.onNextClick(); // llega al paso 4, vista «upload»
  calls.length = 0;

  await steps[4].popover.onPrevClick(); // 4 -> 3: sigue siendo la vista de «lessons», que no es la actual
  assert.equal(drv.index, 3);
  assert.deepEqual(calls, ['nav:lessons']);

  await steps[3].popover.onPrevClick(); // 3 -> 2: misma vista, no se vuelve a navegar
  assert.equal(drv.index, 2);
  assert.deepEqual(calls, ['nav:lessons']);

  await steps[2].popover.onPrevClick(); // 2 -> 1: la vista del paso 1 es la del paso 0 («feed»)
  assert.equal(drv.index, 1);
  assert.deepEqual(calls, ['nav:lessons', 'nav:feed']);
});

test('el primer paso no tiene «Atrás» y el último no tiene «Siguiente» propio', () => {
  const { ctx } = load();
  const steps = ctx.buildDriverSteps(raw([]), () => fakeDriver());
  assert.equal(steps[0].popover.onPrevClick, undefined);
  assert.equal(steps[4].popover.onNextClick, undefined, 'en el último paso driver.js cierra el tour por su cuenta');
  assert.equal(typeof steps[4].popover.onPrevClick, 'function');
});

test('toques seguidos en «Siguiente» avanzan un solo paso (el resto se ignora mientras se prepara)', async () => {
  const { ctx } = load();
  const drv = fakeDriver();
  const steps = ctx.buildDriverSteps(raw([]), () => drv);
  const onNext = steps[0].popover.onNextClick;
  await Promise.all([onNext(), onNext(), onNext()]);
  assert.equal(drv.index, 1);
  assert.deepEqual(drv.moves, ['next']);
  // y al terminar se puede volver a avanzar
  await steps[1].popover.onNextClick();
  assert.equal(drv.index, 2);
});

test('si cierran el tour mientras se prepara el paso, no se intenta mover un tour ya destruido', async () => {
  const { ctx } = load();
  const drv = fakeDriver();
  const steps = ctx.buildDriverSteps(raw([]), () => drv);
  const pending = steps[0].popover.onNextClick();
  drv.active = false; // la X se tocó antes de que terminara la espera
  await pending;
  assert.deepEqual(drv.moves, []);
});

test('tras mover se vuelve a medir el resaltado (la vista termina de pintarse después de abrirse)', async () => {
  const { ctx, timers } = load();
  const drv = fakeDriver();
  const steps = ctx.buildDriverSteps(raw([]), () => drv);
  await steps[0].popover.onNextClick();
  assert.equal(timers.length, 1);
  timers[0]();
  assert.equal(drv.refreshed, 1);
});

test('la espera de un elemento que no aparece es corta (2,5 s, no 5 s) y el arranque libera el candado si falla', () => {
  assert.match(SRC, /function waitForSelector\(selector, timeout = 2500\)/);
  assert.match(SRC, /catch \(e\) \{[^}]*window\._onboardingTourActive = false;/);
  assert.match(SRC, /animate: window\.innerWidth > 768/);
});
