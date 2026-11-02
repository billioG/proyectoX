// Pantalla de Wi-Fi del nodo con el servidor de verdad y un nmcli de mentira: solo docentes, y lo que escribe el docente no llega a una shell.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqliteAvailable, startNode, stopAllNodes } from './helpers/start-node.mjs';
import { hashClassPassword, emailHash } from '../school-node/rest/auth.js';

after(stopAllNodes);
const skip = !sqliteAvailable() && 'better-sqlite3 no disponible';
const salt = 'ab'.repeat(8);
const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'helpers', 'fake-nmcli.mjs');
const rest = {
  class_verifiers: [{ class_key: 'ESC1|Primero|A', requires_password: true, salt, hash: hashClassPassword('clase123', salt) }],
  teacher_logins: [{ teacher_id: 't1', email_hash: emailHash('marta@escuela.com'), pin_hash: hashClassPassword('654321', salt), pin_salt: salt }],
  tables: {
    students: [{ id: 's1', username: 'ana1', full_name: 'Ana', school_code: 'ESC1', grade: 'Primero', section: 'A', status: 'activo' }],
    teachers: [{ id: 't1', full_name: 'Marta', role: 'docente' }],
    teacher_assignments: [{ id: 1, teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A' }],
  },
};

async function setup() {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmcli-'));
  const state = path.join(stateDir, 'state.json');
  const node = await startNode({ rest, config: { nmcli: [process.execPath, FAKE, state], wifiPlatform: 'linux', cloudUrl: 'http://127.0.0.1:1' } });
  const teacher = (await node.api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: 'marta@escuela.com', password: '654321' } })).data.access_token;
  const l = await node.api('/functions/v1/student-login', { method: 'POST', body: { username: 'ana1', password: 'clase123' } });
  const student = (await node.api('/auth/v1/verify', { method: 'POST', body: { type: 'magiclink', token_hash: l.data.token_hash } })).data.access_token;
  const calls = () => (fs.existsSync(state + '.log') ? fs.readFileSync(state + '.log', 'utf8').trim().split('\n').map((x) => JSON.parse(x)) : []);
  return { node, teacher, student, calls };
}

test('sin sesión o como estudiante no se ve ni se cambia nada de la red; la página en sí abre (pide entrar)', { skip, timeout: 60000 }, async () => {
  const { node, student, calls } = await setup();
  for (const [method, p] of [['GET', '/api/wifi/status'], ['GET', '/api/wifi/scan'], ['POST', '/api/wifi/connect'], ['POST', '/api/wifi/forget']]) {
    assert.equal((await node.api(p, { method })).status, 401, p);
    assert.equal((await node.api(p, { method, token: student })).status, 403, `${p} estudiante`);
  }
  assert.equal(calls().length, 0, 'ni siquiera se ejecutó nmcli');
  const page = await fetch(`${node.base}/wifi`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Wi-Fi/);
});

test('el docente ve el estado y las redes, se conecta, y una clave mala no deja nada guardado', { skip, timeout: 60000 }, async () => {
  const { node, teacher } = await setup();
  const status = (await node.api('/api/wifi/status', { token: teacher })).data;
  assert.equal(status.supported, true);
  assert.equal(status.connected, 'CasaMia');
  assert.equal(status.internet, false, 'sin nube alcanzable no hay internet');
  const scan = (await node.api('/api/wifi/scan', { token: teacher })).data;
  assert.deepEqual(scan.networks.map((n) => n.ssid), ['CasaMia', 'Vecino:5G', 'Abierta']);

  const ok = await node.api('/api/wifi/connect', { method: 'POST', token: teacher, body: { ssid: 'Vecino:5G', password: 'buena-clave-1' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.ok, true);
  assert.ok((await node.api('/api/wifi/status', { token: teacher })).data.saved.includes('Vecino:5G'));

  const bad = await node.api('/api/wifi/connect', { method: 'POST', token: teacher, body: { ssid: 'Otra', password: 'mala-clave-1' } });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /contraseña/i);
  assert.doesNotMatch(JSON.stringify(bad.data), /mala-clave-1/);
  assert.equal((await node.api('/api/wifi/status', { token: teacher })).data.saved.includes('Otra'), false);
});

test('datos raros se rechazan antes de llegar a nmcli; un nombre raro viaja entero; olvidar solo borra una red guardada', { skip, timeout: 60000 }, async () => {
  const { node, teacher, calls } = await setup();
  const before = calls().length;
  for (const body of [{ ssid: '', password: '12345678' }, { ssid: 'x'.repeat(40), password: '12345678' }, { ssid: 'Casa', password: '123' }, { ssid: 'Casa\nX', password: '12345678' }, { ssid: ['a'], password: 'x' }, {}]) {
    assert.equal((await node.api('/api/wifi/connect', { method: 'POST', token: teacher, body })).status, 400, JSON.stringify(body));
  }
  assert.equal(calls().length, before, 'nada llegó a nmcli');
  const evil = '--rm "$(x)"; `y`';
  assert.equal((await node.api('/api/wifi/connect', { method: 'POST', token: teacher, body: { ssid: evil, password: 'buena-clave-1' } })).status, 200);
  assert.ok(calls().find((a) => a[1] === 'add' && a.includes(evil)), 'viajó como un solo argumento');
  assert.equal((await node.api('/api/wifi/forget', { method: 'POST', token: teacher, body: { ssid: 'Wired connection 1' } })).status, 404);
  assert.equal((await node.api('/api/wifi/forget', { method: 'POST', token: teacher, body: { ssid: 'CasaMia' } })).status, 200);
});
