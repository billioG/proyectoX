// PIN personal del docente en el nodo: crear con el código del nodo, verificar, bloqueo y restablecer
// (school-node/teachers.js). Usa SQLite de verdad; se omite si better-sqlite3 no está compilado.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sqliteAvailable } from './helpers/start-node.mjs';

const skip = !sqliteAvailable() && 'better-sqlite3 no está instalado para esta versión de Node';
const hashPin = (pin, salt) => crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');
const CODE = '48213976';

async function setup() {
  const { openDb } = await import('../school-node/db.js');
  const sync = await import('../school-node/sync.js');
  const { createTeacherStore } = await import('../school-node/teachers.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-teach-'));
  const db = openDb(dir);
  const clock = { t: Date.parse('2026-11-01T15:00:00Z') };
  const codeAttempts = [];
  const store = createTeacherStore(db, { now: () => clock.t, hashPin, verifySetupCode: (c) => { codeAttempts.push(c); return c === CODE; } });
  sync.applyPull(db, {
    students: [], courses: [], completions: [], files: [], node: { name: 'Nodo', school_code: 'ESC1' }, server_time: '2026-11-01T00:00:00Z',
    teachers: [
      { id: 't1', full_name: 'Marta', assignments: [{ grade: 'Primero', section: 'A' }] },
      { id: 't2', full_name: 'Raúl', assignments: [{ grade: 'Segundo', section: 'B' }] },
    ],
  });
  const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
  return { db, store, clock, codeAttempts, err, done: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('list: nombres y si ya tienen PIN, sin datos sensibles', { skip }, async () => {
  const s = await setup();
  try {
    assert.deepEqual(s.store.list(), [{ id: 't1', full_name: 'Marta', has_pin: false }, { id: 't2', full_name: 'Raúl', has_pin: false }]);
    assert.doesNotMatch(JSON.stringify(s.store.list()), /pin_hash|pin_salt|assignments/);
  } finally { s.done(); }
});

test('la primera vez crea el PIN solo con el código de docente del nodo; después basta el PIN', { skip }, async () => {
  const s = await setup();
  try {
    assert.equal(s.err(() => s.store.login('t1', '123456', 'mal-codigo')).status, 403);
    assert.equal(s.store.list()[0].has_pin, false, 'un código incorrecto no crea nada');
    const first = s.store.login('t1', '123456', CODE);
    assert.deepEqual([first.created, first.teacher.id], [true, 't1']);
    assert.equal(s.store.list()[0].has_pin, true);
    const again = s.store.login('t1', '123456');
    assert.deepEqual([again.created, again.teacher.id], [false, 't1']);
    assert.equal(s.err(() => s.store.login('t1', '654321')).status, 401);
    // Con PIN ya creado, mandar el código no permite cambiarlo.
    assert.equal(s.err(() => s.store.login('t1', '999999', CODE)).status, 401);
  } finally { s.done(); }
});

test('el PIN son 6 números; docente inexistente es 404; el PIN se guarda con hash y sal', { skip }, async () => {
  const s = await setup();
  try {
    for (const bad of ['12345', '1234567', 'abcdef', '12 456', '', null, undefined]) assert.equal(s.err(() => s.store.login('t1', bad, CODE)).status, 400, String(bad));
    assert.equal(s.err(() => s.store.login('nadie', '123456', CODE)).status, 404);
    s.store.login('t1', '123456', CODE);
    const row = s.db.prepare('SELECT pin_hash, pin_salt FROM teachers WHERE id = ?').get('t1');
    assert.ok(row.pin_hash && row.pin_salt);
    assert.doesNotMatch(JSON.stringify(row), /123456/);
  } finally { s.done(); }
});

test('5 PIN incorrectos bloquean 5 minutos; luego vuelve a funcionar y un acierto reinicia el conteo', { skip }, async () => {
  const s = await setup();
  try {
    s.store.login('t1', '123456', CODE);
    for (let i = 0; i < 5; i++) assert.equal(s.err(() => s.store.login('t1', '000000')).status, 401);
    const locked = s.err(() => s.store.login('t1', '123456'));
    assert.equal(locked.status, 429, 'bloqueado aunque ahora acierte');
    assert.match(locked.message, /5 minuto/);
    s.clock.t += 5 * 60_000 + 1;
    assert.equal(s.store.login('t1', '123456').created, false);
    // Un acierto reinicia el conteo: 4 fallos + acierto + 4 fallos no bloquean.
    for (let i = 0; i < 4; i++) s.err(() => s.store.login('t1', '000000'));
    s.store.login('t1', '123456');
    for (let i = 0; i < 4; i++) s.err(() => s.store.login('t1', '000000'));
    assert.equal(s.store.login('t1', '123456').teacher.id, 't1');
  } finally { s.done(); }
});

test('intentar adivinar el código del nodo desde un docente sin PIN también bloquea', { skip }, async () => {
  const s = await setup();
  try {
    for (let i = 0; i < 5; i++) assert.equal(s.err(() => s.store.login('t2', '123456', `mal${i}`)).status, 403);
    assert.equal(s.err(() => s.store.login('t2', '123456', CODE)).status, 429, 'ya bloqueado, ni el código correcto sirve');
  } finally { s.done(); }
});

test('resetPin borra el PIN y desbloquea: el docente vuelve a crear uno con el código', { skip }, async () => {
  const s = await setup();
  try {
    s.store.login('t1', '123456', CODE);
    for (let i = 0; i < 5; i++) s.err(() => s.store.login('t1', '000000'));
    assert.equal(s.store.resetPin('t1'), true);
    assert.equal(s.store.resetPin('nadie'), false);
    assert.equal(s.store.list()[0].has_pin, false);
    assert.equal(s.store.login('t1', '654321', CODE).created, true);
  } finally { s.done(); }
});

test('assignments: la clase del docente sale parseada para comprobar permisos', { skip }, async () => {
  const s = await setup();
  try {
    assert.deepEqual(s.store.get('t1').assignments, [{ grade: 'Primero', section: 'A' }]);
    assert.equal(s.store.get('nadie'), null);
  } finally { s.done(); }
});
