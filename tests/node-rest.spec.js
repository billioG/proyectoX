// La app REAL sobre el nodo sin internet (capa local compatible con Supabase): login de verdad sin lista de usuarios,
// Inicio, Cursos, avance de lección, cofre diario, Práctica del Centro de Juego y aviso de sincronización.
// Arranca school-node/server.js de verdad (helper de tests-unit) y bloquea todo lo que no sea el nodo, como una
// escuela sin internet. Se omite si better-sqlite3 no está compilado para este Node.
const { test, expect } = require('@playwright/test');

let node = null;
let skipReason = '';

test.beforeAll(async () => {
  const helper = await import('../tests-unit/helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) { skipReason = 'better-sqlite3 no está instalado para este Node'; return; }
  const { hashClassPassword, emailHash } = await import('../school-node/rest/auth.js');
  const salt = 'ab'.repeat(8);
  node = await helper.startNode({
    rest: {
      teacher_logins: [{ teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt }],
      class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
      tables: {
        schools: [{ id: 1, code: 'ESC1', name: 'Escuela Piloto' }],
        teachers: [{ id: 't1', full_name: 'Marta Gómez', role: 'docente' }],
        teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
        groups: [{ id: 7, name: 'Equipo Sol', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
        group_members: [{ id: 1, group_id: 7, student_id: 's1' }, { id: 2, group_id: 7, student_id: 's2' }],
        students: [
          { id: 's1', username: 'ana1', full_name: 'Ana López', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 1240, gems: 30, streak: 6, role: 'estudiante' },
          { id: 's2', username: 'beto1', full_name: 'Beto Ruiz', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo', xp: 800, gems: 10, streak: 2, role: 'estudiante' },
        ],
        courses: [{ id: 'c1', title: 'Robótica básica', description: 'Primeros pasos', school_code: 'ESC1', grade: 'Primero', section: 'A', created_at: '2026-10-01T00:00:00Z' }],
        lessons: [
          { id: 'l1', course_id: 'c1', title: 'Qué es un robot', content_type: 'text', audience: 'estudiante', order_index: 1, school_code: 'ESC1', grade: 'Primero', section: 'A' },
          { id: 'l2', course_id: 'c1', title: 'Sensores', content_type: 'text', audience: 'estudiante', order_index: 2, school_code: 'ESC1', grade: 'Primero', section: 'A' },
        ],
        lesson_completions: [{ id: 'lc1', lesson_id: 'l1', student_id: 's1', score: 100, status: 'completed' }],
        projects: [{ id: 101, user_id: 's2', title: 'Semáforo con Arduino', description: 'Un semáforo', score: 85, votes: 3, bimestre: 2, created_at: '2026-10-30T10:00:00Z' }],
      },
    },
  });
});

test.afterAll(async () => { if (node) await node.stop(); });

async function open(page) {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.addInitScript(() => { try { localStorage.setItem('PX_TOUR_DONE', '1'); } catch { /* sin almacenamiento */ } });
  await page.goto(node.base);
  await page.waitForSelector('#login-username');
}

async function login(page, user = 'ana1', pass = 'clase123') {
  await page.fill('#login-username', user);
  await page.fill('#login-password', pass);
  await page.click('#btn-login');
}

const closeOverlays = (page) => page.evaluate(() => {
  document.querySelectorAll('div').forEach((e) => { if (/COFRE DIARIO/i.test(e.textContent || '') && e.textContent.length < 200) e.closest('.fixed')?.remove(); });
  document.querySelector('.driver-popover-close-btn')?.click();
});

test('el login es el de la app (sin lista de usuarios) y una contraseña mala no entra', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  expect(await page.evaluate(() => window.SUPABASE_URL)).toBe(node.base);
  await expect(page.locator('#node-login')).toHaveCount(0);
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/Beto|Ana López|beto1/);

  await login(page, 'ana1', 'mala');
  await expect(page.getByText('Usuario o contraseña incorrectos').first()).toBeVisible();
  await expect(page.locator('#login-username')).toBeVisible();
  expect(errors).toEqual([]);
});

test('entra y ve Inicio, Cursos con su avance, el cofre, la Práctica y el aviso de sincronización', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  await login(page);

  await expect(page.getByText('Ana López').first()).toBeVisible();
  await closeOverlays(page);
  await expect(page.getByText('TU RANGO')).toBeVisible();
  await expect(page.getByText('1240 XP TOTAL')).toBeVisible();
  await expect(page.getByText('Semáforo con Arduino')).toBeVisible();

  await page.evaluate(() => window.nav('lessons'));
  const lessons = page.locator('#view-lessons');
  await expect(lessons.getByRole('heading', { name: 'Robótica básica' })).toBeVisible();
  await expect(lessons.getByText('50%')).toBeVisible();

  // Aviso de sincronización: sin sincronizar y sin cambios; al completar una lección cuenta 1 cambio por subir.
  const chip = page.locator('#node-sync-chip');
  await expect(chip).toContainText('Aún sin sincronizar');
  const xp = await page.evaluate(async () => {
    await window._supabase.from('lesson_completions').upsert({ lesson_id: 'l2', student_id: 's1', score: 90, status: 'completed' }, { onConflict: 'lesson_id,student_id' });
    window.dispatchEvent(new Event('focus'));
    return (await window._supabase.from('students').select('xp').eq('id', 's1').single()).data.xp;
  });
  expect(xp).toBe(1250); // 10 XP por la lección, al instante
  await expect(chip).toContainText('1 cambio por subir');

  // Cofre diario sin internet: el premio llega y el XP sube.
  const chest = await page.evaluate(async () => (await window._supabase.rpc('claim_daily_chest')).data);
  expect([20, 50, 100]).toContain(chest.xp);
  const again = await page.evaluate(async () => (await window._supabase.rpc('claim_daily_chest')).error?.message);
  expect(again).toMatch(/Ya reclamaste/);

  // Práctica (sin IA): el tema de la clase sale de la réplica.
  await page.evaluate(() => window.PracticeMode.start('hangman'));
  await expect(page.getByText('PRÁCTICA: AHORCADO', { exact: false })).toBeVisible();
  await expect(page.locator('#practice-topic-modal option', { hasText: 'Sensores' })).toHaveCount(1);

  expect(errors).toEqual([]);
});

test('un estudiante no puede leer columnas secretas ni a otros salones por la capa local', async ({ page }) => {
  test.skip(!node, skipReason);
  await open(page);
  await login(page);
  await expect(page.getByText('Ana López').first()).toBeVisible();
  const out = await page.evaluate(async () => {
    const pin = await window._supabase.from('students').select('pin_hash').limit(1);
    const secret = await window._supabase.from('xp_events').select('*');
    const write = await window._supabase.from('students').update({ xp: 99999 }).eq('id', 's1');
    return { pin: pin.error?.code, secret: secret.error?.code, write: write.error?.code };
  });
  expect(out).toEqual({ pin: '42703', secret: '42P01', write: '42501' });
});

test('con ?modo=pin el nodo abre su modo anterior (pantalla con PIN y panel del docente)', async ({ page }) => {
  test.skip(!node, skipReason);
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort('failed'));
  await page.goto(`${node.base}/?modo=pin`);
  await page.waitForSelector('#node-login');
  expect(await page.evaluate(() => window.SUPABASE_URL)).not.toBe(node.base);
  await expect(page.locator('#node-sync-chip')).toHaveCount(0);
});

test('el docente entra con su correo y PIN, evalúa un proyecto y avisa a su clase; la estudiante ve el aviso', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  await login(page, 'marta@escuela.com', '654321');
  await expect(page.getByText('Marta Gómez').first()).toBeVisible();
  await expect(page.locator('#btn-offline-entry')).toHaveCount(0);

  // Evaluar: solo ve los proyectos de su clase y los guarda con el total recalculado por el nodo.
  await page.evaluate(() => window.nav('evaluate'));
  await expect(page.locator('#eval-projects-container')).toContainText('1 PROYECTOS');
  const saved = await page.evaluate(async () => {
    const { error } = await window._supabase.rpc('sync_save_evaluation', { p_evaluation: { project_id: 101, teacher_id: 't1', total_score: 5, creativity_score: 18, clarity_score: 17, functionality_score: 16, teamwork_score: 15, social_impact_score: 14, feedback: 'Muy bien' } });
    const { data } = await window._supabase.from('evaluations').select('total_score').eq('project_id', 101).single();
    return { error: error?.message ?? null, total: data?.total_score };
  });
  expect(saved).toEqual({ error: null, total: 80 });
  const other = await page.evaluate(async () => (await window._supabase.rpc('sync_save_evaluation', { p_evaluation: { project_id: 999, teacher_id: 't1', creativity_score: 1, clarity_score: 1, functionality_score: 1, teamwork_score: 1, social_impact_score: 1 } })).error?.message);
  expect(other).toMatch(/Proyecto/);

  // Avisos con el formulario real.
  // El formulario se vuelve a dibujar mientras carga: todo se hace dentro de la página, buscando cada campo justo antes de usarlo.
  await page.evaluate(async () => {
    const until = async (fn) => { for (let i = 0; i < 80; i++) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); } throw new Error('el formulario de avisos no cargó'); };
    await window.openAnnouncementsInbox();
    await new Promise((r) => setTimeout(r, 1500)); // la bandeja termina de dibujarse antes de abrir el formulario
    await window.openSendAnnouncementModal();
    await until(() => document.querySelectorAll('#send-announcement-modal input[type=checkbox]').length >= 2 && document.getElementById('ann-title'));
    await new Promise((r) => setTimeout(r, 1500));
    (await until(() => document.querySelectorAll('#send-announcement-modal input[type=checkbox]')[1])).click();
    (await until(() => document.getElementById('ann-title'))).value = 'Traer el robot el lunes';
    (await until(() => document.getElementById('ann-message'))).value = 'Recuerden traer el robot armado.';
    await window.sendAnnouncement();
  });
  await expect(page.getByText('Aviso enviado').first()).toBeVisible();
  await expect(page.locator('#node-sync-chip')).toContainText(/por subir/);

  // La estudiante de esa clase lo ve; un docente no puede entrar con un PIN equivocado.
  // Al cerrar sesión la app recarga sola: no se espera la respuesta, se espera a que vuelva el formulario.
  const reloaded = page.waitForEvent('load');
  await page.evaluate(() => { localStorage.clear(); window._supabase.auth.signOut(); });
  await reloaded;
  await page.waitForSelector('#login-username');
  await login(page, 'marta@escuela.com', '000000');
  await expect(page.getByText('Invalid login credentials').first()).toBeVisible();
  await login(page, 'ana1', 'clase123');
  await expect(page.getByText('Ana López').first()).toBeVisible();
  await closeOverlays(page);
  const inbox = await page.evaluate(async () => { await window.openAnnouncementsInbox(); return document.getElementById('announcements-inbox-modal')?.innerText || ''; });
  expect(inbox).toContain('Traer el robot el lunes');
  expect(errors).toEqual([]);
});

test('el docente crea un curso con un PDF sin internet con el cliente real de la app; la estudiante lo ve y el nodo lo deja por subir', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  await login(page, 'marta@escuela.com', '654321');
  await page.waitForFunction(() => window.currentUser?.id === 't1');

  const made = await page.evaluate(async () => {
    const sb = window._supabase;
    const { data: course, error: ce } = await sb.from('courses').insert({ title: 'Curso sin internet', description: 'Hecho en el aula', tags: [], bimestre: 1, weight: 20, cnb_area: 'Tecnología',
      school_code: 'ESC1', grade: 'Primero', section: 'A', created_by: window.currentUser.id }).select().single();
    if (ce) return { step: 'curso', error: ce.message };
    const id = crypto.randomUUID();
    const bytes = new Uint8Array(150000).fill(7);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const { error: ue } = await sb.storage.from('course-content').upload(`lessons/${id}/Guia-clase.pdf`, blob, { upsert: true, contentType: 'application/pdf' });
    if (ue) return { step: 'subida', error: ue.message };
    const { data: { publicUrl } } = sb.storage.from('course-content').getPublicUrl(`lessons/${id}/Guia-clase.pdf`);
    const { error: le } = await sb.from('lessons').insert({ id, title: 'Guía de la clase', content_type: 'pdf', content_url: publicUrl, content_path: `lessons/${id}`, quiz_data: null, course_id: course.id,
      order_index: 0, audience: 'estudiante', school_code: 'ESC1', grade: 'Primero', section: 'A', created_by: window.currentUser.id });
    if (le) return { step: 'recurso', error: le.message };
    const served = await fetch(publicUrl);
    return { id, publicUrl, status: served.status, size: (await served.arrayBuffer()).byteLength };
  });
  expect(made.error).toBeUndefined();
  expect(made.status).toBe(200);
  expect(made.size).toBe(150000);
  expect(made.publicUrl).toContain(node.base);

  const reloaded = page.waitForEvent('load');
  await page.evaluate(() => { localStorage.clear(); window._supabase.auth.signOut(); });
  await reloaded;
  await page.waitForSelector('#login-username');
  await login(page, 'ana1', 'clase123');
  await page.waitForFunction(() => window.currentUser?.id === 's1');
  const seen = await page.evaluate(async () => { const { data } = await window._supabase.from('lessons').select('title, content_url').eq('title', 'Guía de la clase'); return data; });
  expect(seen).toHaveLength(1);
  expect(seen[0].content_url).toMatch(/^\/content\/lessons\/[0-9a-f-]{36}\/Guia-clase\.pdf$/);
  const status = await (await fetch(node.base + '/api/node/status')).json();
  expect(status.pending.uploads).toBe(1);
  expect(status.pending_changes).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('la estudiante comenta, da me gusta y guarda una nota sin internet con el cliente real de la app; las groserías se rechazan con el aviso de la app', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  await login(page, 'ana1', 'clase123');
  await page.waitForFunction(() => window.currentUser?.id === 's1');
  const r = await page.evaluate(async () => {
    const sb = window._supabase;
    const base = { lesson_id: 'l1', group_id: '7', parent_id: null, author_id: window.currentUser.id, author_name: 'Ana López', author_role: 'estudiante' };
    const { data: c, error: ce } = await sb.from('resource_comments').insert({ ...base, content: 'Muy buena clase' }).select().single();
    const bad = await sb.from('resource_comments').insert({ ...base, content: 'eres un idiota' });
    const { error: le } = await sb.from('resource_comment_likes').insert({ comment_id: c?.id, user_id: window.currentUser.id });
    const { error: ne } = await sb.from('resource_notes').insert({ lesson_id: 'l1', student_id: window.currentUser.id, content: 'Repasar' });
    const { data: listed } = await sb.from('resource_comments').select('*').eq('lesson_id', 'l1').eq('group_id', '7').order('created_at', { ascending: true });
    const { data: likes } = await sb.from('resource_comment_likes').select('comment_id, user_id').in('comment_id', [c?.id]);
    return { ce: ce?.message ?? null, badMessage: bad.error?.message ?? null, le: le?.message ?? null, ne: ne?.message ?? null, listed: listed?.length, likes: likes?.length, group: c?.group_id };
  });
  expect(r).toEqual({ ce: null, badMessage: expect.stringContaining('CONTENIDO_INAPROPIADO'), le: null, ne: null, listed: 1, likes: 1, group: 7 });
  const status = await (await fetch(node.base + '/api/node/status')).json();
  expect(status.pending_changes).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
});

test('el docente pasa lista sin internet con el cliente real de la app (upsert por estudiante y día) y el reporte trae el nombre del alumno', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  await login(page, 'marta@escuela.com', '654321');
  await page.waitForFunction(() => window.currentUser?.id === 't1');
  const r = await page.evaluate(async () => {
    const sb = window._supabase;
    const today = new Date().toISOString().split('T')[0];
    const mk = (id) => ({ student_id: id, teacher_id: window.currentUser.id, school_code: 'ESC1', grade: 'Primero', section: 'A', date: today, status: 'present' });
    const a = await sb.from('attendance').upsert(mk('s1'), { onConflict: 'student_id,date' });
    const b = await sb.from('attendance').upsert(mk('s1'), { onConflict: 'student_id,date' });
    const c = await sb.from('attendance').upsert(mk('s2'), { onConflict: 'student_id,date' });
    const { data: present } = await sb.from('attendance').select('student_id').eq('date', today);
    const { data: report } = await sb.from('attendance').select('*, students(full_name)').eq('school_code', 'ESC1').eq('grade', 'Primero').eq('section', 'A');
    return { errs: [a.error?.message, b.error?.message, c.error?.message].filter(Boolean), present: present.map((x) => x.student_id).sort(), names: report.map((x) => x.students.full_name).sort(), hasTime: report.every((x) => /^\d\d:\d\d/.test(x.time)) };
  });
  expect(r).toEqual({ errs: [], present: ['s1', 's2'], names: ['Ana López', 'Beto Ruiz'], hasTime: true });
  expect(errors).toEqual([]);
});

test('el docente arma un equipo y ve el progreso de su clase sin internet con el cliente real de la app', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  await login(page, 'marta@escuela.com', '654321');
  await page.waitForFunction(() => window.currentUser?.id === 't1');
  const r = await page.evaluate(async () => {
    const sb = window._supabase;
    const { data: g, error: ge } = await sb.from('groups').insert({ name: 'Cometas', school_code: 'ESC1', grade: 'Primero', section: 'A' }).select().single();
    const { error: me } = await sb.from('group_members').insert([{ group_id: g?.id, student_id: 's1', role: 'planner' }, { group_id: g?.id, student_id: 's2', role: 'builder' }]);
    const { data: list } = await sb.from('groups').select('*, group_members(id, role, students(id, full_name))').eq('id', g?.id);
    const { data: groups, error: pe } = await sb.rpc('get_groups_progress', { p_days: 30 });
    const { data: one, error: oe } = await sb.rpc('get_group_progress', { p_school: 'ESC1', p_grade: 'Primero', p_section: 'A', p_days: 30 });
    const { error: bad } = await sb.rpc('get_group_progress', { p_school: 'ESC1', p_grade: 'Quinto', p_section: 'Z' });
    return { ge: ge?.message ?? null, me: me?.message ?? null, members: list[0].group_members.map((m) => m.students.full_name).sort(), groups: groups?.map((x) => [x.grade, x.section, x.students]), pe: pe?.message ?? null, oe: oe?.message ?? null, size: one?.class_size, denied: !!bad };
  });
  expect(r).toEqual({ ge: null, me: null, members: ['Ana López', 'Beto Ruiz'], groups: [['Primero', 'A', 2]], pe: null, oe: null, size: 2, denied: true });
  expect(errors).toEqual([]);
});

test('la estudiante sube un proyecto (como la cola de la app: archivo a Storage y luego la fila) y reacciona a otro, sin internet', async ({ page }) => {
  test.skip(!node, skipReason);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  await login(page, 'ana1', 'clase123');
  await page.waitForFunction(() => window.currentUser?.id === 's1');
  const r = await page.evaluate(async () => {
    const sb = window._supabase;
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}`;   // igual que js/sync-manager.js
    const blob = new Blob([new Uint8Array(120000).fill(3)], { type: 'video/mp4' });
    const up = await sb.storage.from('project-videos').upload(fileName, blob, undefined);
    const { data: { publicUrl } } = sb.storage.from('project-videos').getPublicUrl(fileName);
    const ins = await sb.from('projects').insert({
      user_id: window.currentUser.id, group_id: null, title: 'Proyecto sin internet', bimestre: 2,
      description: 'Un video que se grabó en el aula y se sube al servidor de la escuela sin necesidad de internet.',
      video_url: publicUrl, upload_ip: '10.0.0.7',
    });
    const served = await fetch(publicUrl);
    const mine = await sb.from('projects').select('id, title').eq('user_id', window.currentUser.id);
    const react = await sb.rpc('react_to_project', { p_project_id: 101, p_reaction: 'like' });
    const info = await sb.rpc('get_project_reactions', { p_project_id: 101 });
    return { up: up.error?.message ?? null, ins: ins.error?.message ?? null, served: served.status, mine: mine.data.map((p) => p.title), reacted: react.data?.mine, votes: react.data?.votes, counts: info.data?.counts?.like, err: react.error?.message ?? null };
  });
  expect(r).toEqual({ up: null, ins: null, served: 200, mine: ['Proyecto sin internet'], reacted: 'like', votes: 4, counts: 1, err: null });
  expect(errors).toEqual([]);
});
