// Exenciones de asistencia: lógica pura (js/waiver-logic.js) + que el historial use solo clases Tailwind ya compiladas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  localDateISO, formatWaiverDate, waiverGroupKey, findDuplicateWaiver, isDuplicateWaiverError, duplicateWaiverMessage,
  waiverStatusInfo, sortWaiversDesc, waiverGroupLabel, renderWaiverHistoryTable,
} from '../js/waiver-logic.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = 'teacher-1';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

test('localDateISO usa la fecha LOCAL, no la UTC', () => {
  assert.equal(localDateISO(new Date(2026, 10, 12, 23, 30)), '2026-11-12'); // 11:30 pm local: toISOString podría dar el día siguiente
  assert.equal(localDateISO(new Date(2026, 0, 5, 0, 5)), '2026-01-05');
});

test('formatWaiverDate no corre el día por zona horaria', () => {
  assert.equal(formatWaiverDate('2026-11-12'), '12/11/2026');
  assert.equal(formatWaiverDate('2026-11-12T00:00:00+00:00'), '12/11/2026');
  assert.equal(formatWaiverDate(null), 'S/F');
  assert.equal(formatWaiverDate('basura'), 'S/F');
});

test('waiverGroupKey: NULL y vacío son lo mismo (igual que el índice de la base)', () => {
  const a = { teacher_id: T, date: '2026-11-12', school_code: 'ESC1', grade: null, section: null };
  const b = { teacher_id: T, date: '2026-11-12', school_code: 'ESC1', grade: '', section: undefined };
  assert.equal(waiverGroupKey(a), waiverGroupKey(b));
  assert.notEqual(waiverGroupKey(a), waiverGroupKey({ ...a, grade: 'Primero', section: 'A' }));
  assert.notEqual(waiverGroupKey(a), waiverGroupKey({ ...a, date: '2026-11-13' }));
  assert.notEqual(waiverGroupKey(a), waiverGroupKey({ ...a, school_code: 'ESC2' }));
});

test('findDuplicateWaiver: bloquea pendiente/aprobada, deja reenviar una rechazada, distingue grupos', () => {
  const payload = { teacher_id: T, date: '2026-11-12', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'pending' };
  const row = (over) => ({ date: '2026-11-12', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'pending', ...over });
  assert.equal(findDuplicateWaiver([], payload), null);
  assert.equal(findDuplicateWaiver(null, payload), null);
  assert.equal(findDuplicateWaiver([row()], payload).status, 'pending', 'la tabla puede no devolver teacher_id: se asume el mismo docente');
  assert.equal(findDuplicateWaiver([row({ status: 'approved' })], payload).status, 'approved');
  assert.equal(findDuplicateWaiver([row({ status: null })], payload).status, null, 'status NULL cuenta como no rechazada');
  assert.equal(findDuplicateWaiver([row({ status: 'rejected' })], payload), null, 'una rechazada se puede reenviar');
  assert.equal(findDuplicateWaiver([row({ section: 'B' })], payload), null, 'otra sección: otra exención');
  assert.equal(findDuplicateWaiver([row({ school_code: 'ESC2' })], payload), null);
  assert.equal(findDuplicateWaiver([row({ date: '2026-11-11' })], payload), null);
  assert.equal(findDuplicateWaiver([row({ teacher_id: 'otro' })], payload), null);
  // «Todo el establecimiento» (grado y sección NULL) también es una sola vez, y distinta de un grupo.
  const school = { teacher_id: T, date: '2026-11-12', school_code: 'ESC1', grade: null, section: null };
  assert.ok(findDuplicateWaiver([row({ grade: null, section: null })], school));
  assert.equal(findDuplicateWaiver([row()], school), null);
});

test('isDuplicateWaiverError reconoce el 23505 del índice y no otros errores', () => {
  assert.equal(isDuplicateWaiverError({ code: '23505', message: 'duplicate key value violates unique constraint "attendance_waivers_unique_group_day"' }), true);
  assert.equal(isDuplicateWaiverError({ message: 'duplicate key value violates unique constraint "attendance_waivers_unique_group_day"' }), true);
  assert.equal(isDuplicateWaiverError({ code: '23505' }), true);
  assert.equal(isDuplicateWaiverError({ code: '42501', message: 'new row violates row-level security policy' }), false);
  assert.equal(isDuplicateWaiverError(new TypeError('Failed to fetch')), false);
  assert.equal(isDuplicateWaiverError(null), false);
});

test('duplicateWaiverMessage: claro y dice el estado cuando se conoce', () => {
  assert.match(duplicateWaiverMessage(), /Ya enviaste esta exención/);
  assert.match(duplicateWaiverMessage({ status: 'pending' }), /pendiente de revisión/);
  assert.match(duplicateWaiverMessage({ status: 'approved' }), /ya fue aprobada/);
});

test('waiverStatusInfo: español con color, y lo desconocido o NULL es Pendiente', () => {
  assert.equal(waiverStatusInfo('pending').label, 'Pendiente');
  assert.equal(waiverStatusInfo('approved').label, 'Aprobada');
  assert.equal(waiverStatusInfo('REJECTED').label, 'Rechazada');
  assert.equal(waiverStatusInfo(null).label, 'Pendiente');
  assert.equal(waiverStatusInfo('lo-que-sea').label, 'Pendiente');
  assert.match(waiverStatusInfo('approved').cls, /emerald/);
  assert.match(waiverStatusInfo('rejected').cls, /rose/);
  assert.match(waiverStatusInfo('pending').cls, /amber/);
});

test('sortWaiversDesc: fecha desc, luego creación desc; no muta la entrada', () => {
  const input = [
    { id: 'a', date: '2026-11-10', created_at: '2026-11-10T08:00:00Z' },
    { id: 'b', date: '2026-11-12', created_at: '2026-11-12T08:00:00Z' },
    { id: 'c', date: '2026-11-12', created_at: '2026-11-12T09:00:00Z' },
    { id: 'd', date: null, created_at: null },
  ];
  const copy = JSON.stringify(input);
  assert.deepEqual(sortWaiversDesc(input).map((w) => w.id), ['c', 'b', 'a', 'd']);
  assert.equal(JSON.stringify(input), copy);
  assert.deepEqual(sortWaiversDesc(null), []);
});

test('waiverGroupLabel', () => {
  assert.equal(waiverGroupLabel({ grade: 'Primero', section: 'A' }), 'Primero A');
  assert.equal(waiverGroupLabel({ grade: null, section: null }), 'Todos los grupos');
});

test('el historial: encabezados, español, orden, una sola tabla y todo texto de usuario saneado', () => {
  const html = renderWaiverHistoryTable([
    { date: '2026-11-10', created_at: '2026-11-10T10:00:00Z', status: 'rejected', reason: 'Viejo', school_code: 'E1', grade: 'Primero', section: 'A', teachers: { full_name: 'Ana' }, schools: { name: 'Escuela Uno' } },
    { date: '2026-11-12', created_at: '2026-11-12T10:00:00Z', status: 'approved', reason: '<img src=x onerror=alert(1)>', school_code: 'E1', grade: null, section: null, teachers: { full_name: '<b>Beto</b>' }, schools: { name: 'Escuela <script>' } },
    { date: '2026-11-11', created_at: '2026-11-11T10:00:00Z', status: 'pending', reason: 'Feriado', school_code: 'E2', grade: 'Segundo', section: 'B', teachers: null, schools: null },
  ], esc);
  for (const h of ['Docente', 'Fecha', 'Establecimiento', 'Grupo', 'Motivo', 'Estado']) assert.ok(html.includes(`>${h}</th>`), `falta el encabezado ${h}`);
  for (const s of ['Pendiente', 'Aprobada', 'Rechazada']) assert.ok(html.includes(`>${s}</span>`), s);
  assert.doesNotMatch(html, /PENDING|APPROVED|REJECTED/);
  assert.equal(html.split('<table').length - 1, 1);
  assert.equal(html.split('<tr class=').length - 1, 3, 'una fila por exención');
  assert.ok(html.indexOf('12/11/2026') < html.indexOf('11/11/2026') && html.indexOf('11/11/2026') < html.indexOf('10/11/2026'), 'más reciente primero');
  assert.ok(html.includes('Todos los grupos') && html.includes('Segundo B'));
  assert.ok(html.includes('Docente</td>'), 'sin docente: texto de respaldo');
  assert.doesNotMatch(html, /<img |<script|<b>Beto/, 'nada de HTML de usuario sin sanear');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;') && html.includes('&lt;b&gt;Beto&lt;/b&gt;'));
  assert.match(renderWaiverHistoryTable([], esc), /Todavía no hay solicitudes/);
});

// Escapado de Tailwind para buscar una clase en el CSS minificado: `dark:bg-slate-800/50` -> `.dark\:bg-slate-800\/50`.
const cssClass = (c) => '.' + c.replace(/[:/[\]().%#,'"]/g, (m) => '\\' + m);
test('el historial solo usa clases Tailwind ya compiladas (si agregas una nueva, recompila css/tailwind.css)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'tailwind.css'), 'utf8');
  const sources = [
    renderWaiverHistoryTable([{ date: '2026-11-12', status: 'approved', reason: 'x', teachers: { full_name: 'A' } }, { date: '2026-11-11', status: 'pending', reason: 'x' }, { date: '2026-11-10', status: 'rejected', reason: 'x' }]),
    fs.readFileSync(path.join(ROOT, 'js', 'admin-waivers.js'), 'utf8').split('const REPORTS_MODAL_ID')[1],
  ];
  const tokens = new Set();
  for (const src of sources) for (const m of src.matchAll(/class(?:Name)?(?:="|\s*=\s*')([^"'`$]+)["']/g)) m[1].split(/\s+/).filter(Boolean).forEach((t) => tokens.add(t));
  assert.ok(tokens.size > 40, `${tokens.size} clases revisadas`);
  const ignore = new Set(['fas', 'fa-spinner', 'fa-spin', 'fa-clipboard-list', 'fa-circle-xmark']); // Font Awesome
  const missing = [...tokens].filter((t) => !ignore.has(t) && !t.startsWith('fa-') && !css.includes(cssClass(t)));
  assert.deepEqual(missing, [], 'clases que no están en css/tailwind.css');
});

test('admin-waivers.js: modal fijo con fondo oscuro, sin las clases inexistentes .modal/.modal-content y sin duplicar ventanas', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'admin-waivers.js'), 'utf8');
  const reports = src.slice(src.indexOf('const REPORTS_MODAL_ID'));
  assert.match(reports, /fixed inset-0 z-\[100\]/);
  assert.match(reports, /bg-slate-950\/80/);
  assert.doesNotMatch(reports, /class(Name)?\s*=\s*['"`]modal|modal-content/);
  assert.match(reports, /closeWaiverReports\(\); \/\/ nunca dos ventanas/);
  assert.match(reports, /Escape/);
});

test('isGroupSuspendedToday: solo suspende una exención de HOY, no rechazada, de esa clase o de todo el establecimiento', async () => {
  const { isGroupSuspendedToday } = await import('../js/waiver-logic.js');
  const clase = { school_code: 'ESC1', grade: 'Primero', section: 'A' };
  const HOY = '2026-11-14';
  const w = (o) => ({ school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'approved', date: HOY, ...o });
  assert.equal(isGroupSuspendedToday([w()], clase, HOY), true);
  assert.equal(isGroupSuspendedToday([w({ status: 'pending' })], clase, HOY), true, 'pendiente también bloquea (como el candado de la base)');
  assert.equal(isGroupSuspendedToday([w({ status: 'rejected' })], clase, HOY), false, 'rechazada no bloquea');
  assert.equal(isGroupSuspendedToday([w({ date: '2026-11-13' })], clase, HOY), false, 'la suspensión de AYER no bloquea hoy');
  assert.equal(isGroupSuspendedToday([w({ date: '2026-11-14T00:00:00+00:00' })], clase, HOY), true);
  assert.equal(isGroupSuspendedToday([w({ date: undefined })], clase, HOY), true, 'sin fecha (consulta ya filtrada por día)');
  assert.equal(isGroupSuspendedToday([w({ grade: null, section: null })], clase, HOY), true, 'todo el establecimiento');
  assert.equal(isGroupSuspendedToday([w({ grade: '', section: '' })], clase, HOY), true);
  assert.equal(isGroupSuspendedToday([w({ school_code: 'ESC2', grade: null })], clase, HOY), false, 'otro establecimiento');
  assert.equal(isGroupSuspendedToday([w({ section: 'B' })], clase, HOY), false, 'otra sección');
  assert.equal(isGroupSuspendedToday([w({ grade: 'Segundo' })], clase, HOY), false, 'otro grado');
  assert.equal(isGroupSuspendedToday([], clase, HOY), false);
  assert.equal(isGroupSuspendedToday(undefined, clase, HOY), false);
});

test('attendance.js: la foto guardada lleva la fecha en la clave y la suspensión usa isGroupSuspendedToday', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'attendance.js'), 'utf8');
  assert.match(src, /attendance_init_\$\{currentUser\.id\}_\$\{today\}/);
  assert.match(src, /isGroupSuspendedToday\(todayWaivers, a\)/);
});

test('node-sync-chip.js: la barra ya no es fija en pantalla y se monta dentro de «Servidor de la escuela»', () => {
  const chip = fs.readFileSync(path.join(ROOT, 'js', 'node-sync-chip.js'), 'utf8');
  assert.doesNotMatch(chip, /position:\s*fixed/);
  assert.doesNotMatch(chip, /document\.body\.appendChild\(chip\)/);
  assert.match(chip, /window\.mountNodeSyncPanel\s*=/);
  const servers = fs.readFileSync(path.join(ROOT, 'js', 'school-servers.js'), 'utf8');
  assert.match(servers, /QUETZAL_NODE\?\.rest === true && window\.mountNodeSyncPanel/);
});
