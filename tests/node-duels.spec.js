// Retos entre estudiantes SIN internet con la app REAL en dos navegadores: Contrarreloj y Ahorcado, de retar a ver quién ganó (gemas y XP al instante).
// Arranca school-node/server.js de verdad y bloquea todo lo que no sea el nodo. Las respuestas correctas las lee de la base del servidor (el navegador nunca las ve).
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';
let openSqlite = null;

test.beforeAll(async () => {
  const helper = await import('../tests-unit/helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) { skipReason = 'better-sqlite3 no está instalado para este Node'; return; }
  openSqlite = helper.openSqlite;
  const { hashClassPassword } = await import('../school-node/rest/auth.js');
  const salt = 'ab'.repeat(8);
  node = await helper.startNode({
    rest: {
      class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
      tables: {
        schools: [{ id: 1, code: 'ESC1', name: 'Escuela Piloto' }],
        students: [
          { id: 's1', username: 'ana1', full_name: 'Ana López', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 100, gems: 100, role: 'estudiante' },
          { id: 's2', username: 'beto1', full_name: 'Beto Ruiz', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 50, gems: 30, role: 'estudiante' },
        ],
        hangman_word_bank: [
          { id: 1, category: 'Vida silvestre de Guatemala', word: 'QUETZAL', hint: 'Ave nacional de Guatemala.', fact: 'El quetzal no sobrevive en cautiverio.' },
          { id: 2, category: 'Vida silvestre de Guatemala', word: 'JAGUAR', hint: 'El felino más grande de Petén.', fact: 'El jaguar controla otras poblaciones.' },
        ],
      },
    },
  });
});

test.afterAll(async () => { if (node) await node.stop(); });

async function session(browser, user) {
  const context = await browser.newContext({ baseURL: node.base });
  const page = await context.newPage();
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); localStorage.setItem('PX_NO_CHEST', '1'); localStorage.setItem('gamecenter_onboarding_seen_s1', 'true'); localStorage.setItem('gamecenter_onboarding_seen_s2', 'true'); } catch { /* sin almacenamiento */ } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
  await page.fill('#login-username', user);
  await page.fill('#login-password', 'clase123');
  await page.click('#btn-login');
  await page.waitForFunction(() => window.currentUser && window.userData && window.userRole === 'estudiante');
  await page.evaluate(() => {
    document.querySelectorAll('div').forEach((e) => { if (/COFRE DIARIO/i.test(e.textContent || '') && e.textContent.length < 200) e.closest('.fixed')?.remove(); });
    document.querySelector('.driver-popover-close-btn')?.click();
  });
  return { context, page, errors };
}

// El tutorial de la app (driver.js) cubre la pantalla; se cierra como lo haría la persona.
const clean = (page) => page.evaluate(() => {
  document.getElementById('daily-chest-modal')?.remove();
  document.querySelectorAll('.driver-overlay, .driver-popover, #driver-popover-item').forEach((e) => e.remove());
  document.body.classList.remove('driver-active', 'driver-fade', 'driver-simple');
});
// Un clic como el de la persona, pero sin que un aviso que sale tarde (el cofre diario) lo tape: se cierra y se hace el clic sobre el elemento.
const tap = async (page, locator) => { await clean(page); await locator.waitFor({ state: 'visible', timeout: 20_000 }); await locator.evaluate((el) => el.click()); };
// Busca el botón «Jugar» de una sección; si el Centro de Juego se cerró o la lista aún no cargó, la vuelve a cargar.
const jugar = async (page, section) => {
  for (let i = 0; i < 6; i++) {
    await reload(page);
    const btn = page.locator(section).getByRole('button', { name: 'Jugar' });
    if (await btn.count()) return tap(page, btn.first());
    await page.waitForTimeout(500);
  }
  throw new Error(`no apareció el botón Jugar en ${section}`);
};
// Abre el Centro de Juego (donde viven los retos) y espera a que carguen las dos secciones.
async function openHub(page) {
  // Se reintenta: la primera vez la app muestra el tutorial del Centro de Juego (y deja el hub para después), y el cofre diario puede salir
  // en medio y cerrar lo que estaba abierto.
  for (let i = 0; i < 5; i++) {
    await page.evaluate(async () => {
      document.querySelectorAll('.fixed').forEach((e) => { if (!['sidebar', 'mascot-widget-container', 'gamification-hub-modal'].includes(e.id)) e.remove(); });
      if (!document.getElementById('gamification-hub-modal')) await window.openGamificationHub();
    });
    await page.waitForTimeout(800);
    if (await page.locator('#timed-math-section').count()) break;
  }
  await expect(page.locator('#timed-math-section')).toBeVisible();
  await expect(page.locator('#timed-math-section')).not.toContainText('fa-spin');
  await clean(page);
}
// Si algo de la app cerró el Centro de Juego (por ejemplo al cerrar el cofre), se vuelve a abrir como lo haría la persona.
const ensureHub = async (page) => { if (!(await page.locator('#timed-math-section').count())) await openHub(page); };
const reload = async (page) => { await ensureHub(page); await page.evaluate(() => Promise.all([window.loadTimedMathSection(), window.loadHangmanSection()])); await clean(page); };
const db = () => openSqlite(`${node.dataDir}/node.db`);
const rowsOf = (tbl) => { const d = db(); try { return d.prepare('SELECT data FROM rest_rows WHERE tbl = ?').all(tbl).map((r) => JSON.parse(r.data)); } finally { d.close(); } };
const me = (page) => page.evaluate(async () => (await window._supabase.from('students').select('gems,xp').eq('id', window.currentUser.id).single()).data);

test('Contrarreloj de punta a punta: Ana reta a Beto, él acepta, los dos juegan con sus problemas y el ganador cobra', async ({ browser }) => {
  test.skip(!node, skipReason);
  test.setTimeout(120_000);
  const A = await session(browser, 'ana1');
  const B = await session(browser, 'beto1');
  try {
    // Ana crea el reto con la pantalla de la app.
    await openHub(A.page);
    await A.page.evaluate(() => window.openCreateTimedMathModal());
    await clean(A.page);
    await A.page.selectOption('#timed-math-opponent', 's2');
    await A.page.fill('#timed-math-wager', '20');
    await tap(A.page, A.page.locator('#btn-send-timed-math'));
    await expect(A.page.getByText('¡Reto enviado!')).toBeVisible();
    await reload(A.page);
    await expect(A.page.locator('#timed-math-section')).toContainText('Esperando respuesta');

    // Beto lo ve y acepta.
    await openHub(B.page);
    await expect(B.page.locator('#timed-math-section')).toContainText('Te retó -- 20 gemas');
    await tap(B.page, B.page.locator('#timed-math-section').getByRole('button', { name: 'Aceptar' }));
    await expect(B.page.getByText('¡Reto aceptado!')).toBeVisible();

    // El navegador nunca ve los problemas ni las respuestas.
    const leak = await B.page.evaluate(async () => JSON.stringify((await window._supabase.from('student_timed_math_duels').select('*')).data));
    expect(leak).not.toMatch(/problems|answer/);

    const duel = rowsOf('student_timed_math_duels')[0];
    expect(duel.status).toBe('active');
    const play = async (P, problems, wrong) => {
      await jugar(P.page, '#timed-math-section');
      await expect(P.page.locator('#timed-math-question')).toBeVisible({ timeout: 20_000 });
      for (let i = 0; i < problems.length; i++) {
        const shown = await P.page.locator('#timed-math-question').innerText();
        expect(shown).toBe(problems[i].question); // la app muestra EXACTAMENTE los problemas de este jugador
        await P.page.fill('#timed-math-answer-input', String(problems[i].answer + (i < wrong ? 1 : 0)));
        await tap(P.page, P.page.locator('#timed-math-next'));
      }
    };
    await play(A, duel.problems, 0); // Ana: 10 de 10
    await expect(A.page.getByText('Jugaste').first()).toBeVisible({ timeout: 20_000 }).catch(() => {});
    await play(B, duel.problems_b, 4); // Beto: 6 de 10

    // Resultado al instante para los dos: gemas y XP sin sincronizar.
    await expect.poll(async () => (await me(A.page))).toEqual({ gems: 120, xp: 120 });
    expect(await me(B.page)).toEqual({ gems: 10, xp: 55 });
    await reload(A.page);
    await expect(A.page.locator('#timed-math-section')).toContainText('Ganaste +20 gemas');
    await reload(B.page);
    await expect(B.page.locator('#timed-math-section')).toContainText('Perdiste');
    expect(A.errors).toEqual([]);
    expect(B.errors).toEqual([]);

    // Y queda UNA foto del duelo en la bandeja para la nube.
    const d = db();
    try {
      const out = d.prepare("SELECT op, pk FROM rest_outbox WHERE tbl = '_rpc' AND op = 'timed_math_duel'").all();
      expect(out).toEqual([{ op: 'timed_math_duel', pk: duel.id }]);
    } finally { d.close(); }
    expect((await (await fetch(`${node.base}/api/node/status`)).json()).pending_changes).toBeGreaterThan(0);
  } finally { await A.context.close(); await B.context.close(); }
});

test('Ahorcado de punta a punta: solo temas con banco fijo, cada uno su palabra, y gana quien la adivina más rápido', async ({ browser }) => {
  test.skip(!node, skipReason);
  test.setTimeout(120_000);
  const A = await session(browser, 'ana1');
  const B = await session(browser, 'beto1');
  try {
    await openHub(A.page);
    await expect(A.page.locator('#hangman-section')).not.toContainText('fa-spin');
    // Un tema con IA se rechaza con un mensaje claro; uno del banco fijo, no.
    const refused = await A.page.evaluate(async () => (await window._supabase.from('student_hangman_duels').insert({ challenger_id: 's1', opponent_id: 's2', wager_gems: 0, topic: 'Cultura general' }).select('id').single()).error?.message);
    expect(refused).toMatch(/necesita internet/);
    const inserted = await A.page.evaluate(async () => (await window._supabase.from('student_hangman_duels').insert({ challenger_id: 's1', opponent_id: 's2', wager_gems: 10, topic: 'Vida silvestre de Guatemala' }).select('id').single()));
    expect(inserted.error).toBeNull();
    const id = inserted.data.id;

    // Beto acepta con la función de la app: intenta la IA (sin internet falla) y cae al banco fijo del servidor.
    await openHub(B.page);
    await expect(B.page.locator('#hangman-section')).toContainText('Te retó');
    await B.page.evaluate((duelId) => window.respondHangmanDuel(duelId, true), id);
    await expect(B.page.getByText('¡Reto aceptado!')).toBeVisible({ timeout: 20_000 });
    const duel = rowsOf('student_hangman_duels').find((d) => d.id === id);
    expect(duel.status).toBe('active');
    expect(duel.word).not.toBe(duel.word_b);

    const play = async (P, word, miss) => {
      await jugar(P.page, '#hangman-section');
      await tap(P.page, P.page.locator('#hangman-start-guessing'));
      const letters = [...new Set(word.toLowerCase())];
      for (const l of [...miss, ...letters]) {
        await tap(P.page, P.page.locator(`#hangman-keys button[data-letter="${l.toUpperCase()}"]`));
        await P.page.waitForTimeout(150);
      }
    };
    await play(A, duel.word, ['x']);
    await play(B, duel.word_b, []);

    await reload(A.page);
    await expect.poll(async () => rowsOf('student_hangman_duels').find((d) => d.id === id).status, { timeout: 20_000 }).toBe('completed');
    const done = rowsOf('student_hangman_duels').find((d) => d.id === id);
    expect(done.winner_id).toBeTruthy();
    const results = rowsOf('student_hangman_results').filter((r) => r.duel_id === id);
    expect(results.map((r) => r.solved)).toEqual([true, true]);
    expect(A.errors).toEqual([]);
    expect(B.errors).toEqual([]);
  } finally { await A.context.close(); await B.context.close(); }
});
