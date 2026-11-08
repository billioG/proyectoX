// Asistencia rápida sin cámara y asistente del certificado (js/camera-support.js + js/attendance.js). Entorno del navegador falso: corre con Node, sin internet.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  cameraSupport, cameraErrorKind, cameraIsUnavailable, probeCamera, attendanceMode, isSchoolNode, shouldOfferSetup, markCameraReady,
  nodeCaAvailable, nodeHttpsReachable, buildAttendanceRow, mergePresent, platformOf, CA_GUIDE, CAMERA_READY_KEY, NODE_CA_URL, QUICK_MODE_NOTICE,
} from '../js/camera-support.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const withCam = (getUserMedia) => ({ isSecureContext: true, navigator: { mediaDevices: { getUserMedia } } });

test('cameraSupport: HTTPS con getUserMedia sí; http del nodo o sin API no', () => {
  assert.deepEqual(cameraSupport(withCam(async () => ({}))), { ok: true, reason: 'ok' });
  assert.deepEqual(cameraSupport({ isSecureContext: false, navigator: { mediaDevices: undefined } }), { ok: false, reason: 'insecure' });
  assert.equal(cameraSupport({ isSecureContext: false, navigator: { mediaDevices: { getUserMedia() {} } } }).ok, false, 'http: aunque exista la API, no se usa');
  assert.deepEqual(cameraSupport({ isSecureContext: true, navigator: {} }), { ok: false, reason: 'no-api' });
  assert.equal(cameraSupport({}).ok, false);
});

test('attendanceMode: qr con cámara, quick sin ella (y vuelve solo a qr si el nodo pasa a HTTPS)', () => {
  assert.equal(attendanceMode({ isSecureContext: false, navigator: {} }), 'quick');
  assert.equal(attendanceMode(withCam(async () => ({}))), 'qr');
});

test('cameraErrorKind: separa lo que manda a la lista rápida de lo que se explica con la cámara', () => {
  assert.equal(cameraErrorKind({ name: 'NotAllowedError' }), 'permission');
  assert.equal(cameraErrorKind({ name: 'NotFoundError' }), 'missing');
  assert.equal(cameraErrorKind({ name: 'NotReadableError' }), 'busy');
  assert.equal(cameraErrorKind(new TypeError("Cannot read properties of undefined (reading 'getUserMedia')")), 'insecure');
  assert.equal(cameraErrorKind({ name: 'SecurityError' }), 'insecure');
  assert.equal(cameraErrorKind(new Error('algo raro')), 'unknown');
  assert.deepEqual(['insecure', 'missing', 'permission', 'busy', 'unknown'].map(cameraIsUnavailable), [true, true, false, false, false]);
});

test('probeCamera: nunca lanza, suelta la cámara y clasifica el fallo', async () => {
  let stopped = 0;
  const ok = await probeCamera(withCam(async () => ({ getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] })));
  assert.deepEqual(ok, { ok: true, kind: 'ok' });
  assert.equal(stopped, 2, 'las pistas de la cámara se detienen');
  const denied = await probeCamera(withCam(async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); }));
  assert.deepEqual([denied.ok, denied.kind], [false, 'permission']);
  const http = await probeCamera({ isSecureContext: false, navigator: {} });
  assert.deepEqual(http, { ok: false, kind: 'insecure' }, 'sin contexto seguro ni siquiera se intenta');
});

test('isSchoolNode y shouldOfferSetup: solo en el nodo, sin cámara y mientras no haya funcionado en este dispositivo', () => {
  const node = { location: { hostname: 'quetzal.local' }, isSecureContext: false, navigator: {}, localStorage: store() };
  assert.equal(isSchoolNode(node), true);
  assert.equal(isSchoolNode({ location: { hostname: '192.168.1.20' } }), true);
  assert.equal(isSchoolNode({ location: { hostname: 'clases.yoaprendo.online' } }), false);
  assert.equal(shouldOfferSetup(node), true);
  markCameraReady(node);
  assert.equal(node.localStorage.getItem(CAMERA_READY_KEY), '1');
  assert.equal(CAMERA_READY_KEY, 'node_camera_ready');
  assert.equal(shouldOfferSetup(node), false, 'ya funcionó: no molesta en cada ingreso');
  assert.equal(shouldOfferSetup({ location: { hostname: 'clases.yoaprendo.online' }, isSecureContext: false, navigator: {} }), false, 'en la nube no hay asistente');
  assert.equal(shouldOfferSetup({ ...node, localStorage: store(), isSecureContext: true, navigator: { mediaDevices: { getUserMedia() {} } } }), false, 'con cámara no hace falta');
  assert.doesNotThrow(() => markCameraReady({ localStorage: { setItem() { throw new Error('bloqueado'); } } }));
});

test('buildAttendanceRow: la misma fila que arma el QR (mark_attendance)', () => {
  assert.deepEqual(buildAttendanceRow({ studentId: 's1', teacherId: 't1', school: 'ESC1', grade: 'Primero', section: 'A', date: '2026-11-08' }),
    { student_id: 's1', teacher_id: 't1', school_code: 'ESC1', grade: 'Primero', section: 'A', date: '2026-11-08', status: 'present' });
  assert.equal(buildAttendanceRow({ studentId: 's1', teacherId: 't1', school: 'E', status: 'absent' }).status, 'absent');
  assert.match(buildAttendanceRow({ studentId: 's1', teacherId: 't1', school: 'E' }).date, /^\d{4}-\d{2}-\d{2}$/);
});

test('mergePresent: lo marcado en este dispositivo manda sobre la nube (marcar y quitar)', () => {
  const server = new Set(['a', 'b']);
  const merged = mergePresent(server, new Map([['c', 'present'], ['a', 'absent']]));
  assert.deepEqual([...merged].sort(), ['b', 'c']);
  assert.deepEqual([...server].sort(), ['a', 'b'], 'no modifica el conjunto original');
  assert.equal(mergePresent(undefined).size, 0);
});

test('nodeCaAvailable / nodeHttpsReachable: honestos cuando no hay nada', async () => {
  assert.equal(await nodeCaAvailable(async (u, o) => { assert.equal(u, NODE_CA_URL); assert.equal(o.method, 'HEAD'); return { ok: true }; }), true);
  assert.equal(await nodeCaAvailable(async () => ({ ok: false })), false);
  assert.equal(await nodeCaAvailable(async () => { throw new Error('red'); }), false);
  assert.equal(await nodeHttpsReachable({ location: { host: 'quetzal.local' } }, async (u) => { assert.equal(u, 'https://quetzal.local/api/node/status'); return {}; }), true);
  assert.equal(await nodeHttpsReachable({ location: { host: 'quetzal.local' } }, async () => { throw new Error('refused'); }), false);
});

test('guía por plataforma y texto del aviso', () => {
  assert.deepEqual(Object.keys(CA_GUIDE), ['android', 'ios', 'windows']);
  for (const g of Object.values(CA_GUIDE)) assert.ok(g.title && g.steps.length >= 4);
  assert.equal(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), 'ios');
  assert.equal(platformOf('Mozilla/5.0 (Linux; Android 14)'), 'android');
  assert.equal(platformOf('Mozilla/5.0 (Windows NT 10.0)'), 'windows');
  assert.equal(QUICK_MODE_NOTICE, 'En este servidor no se puede usar la cámara. Usa la lista rápida. Cuando el nodo tenga HTTPS podrás escanear QR.');
});

// ---------- la pantalla usa el módulo sin romper el flujo QR ----------
test('attendance.js: lista rápida por la cola de siempre; el flujo QR, la ayuda y friendlyError siguen', () => {
  const att = read('js/attendance.js');
  assert.match(att, /import \{[^}]*attendanceMode[^}]*\} from '\.\/camera-support\.js'/);
  assert.match(att, /_syncManager\.enqueue\('mark_attendance', buildAttendanceRow/, 'la lista rápida usa la misma cola');
  assert.match(att, /_syncManager\.enqueue\('mark_attendance', attendanceData\)/, 'el QR no cambió');
  assert.match(att, /markAllQuickAttendance/); assert.match(att, /Marcar todos presentes/);
  assert.match(att, /toggleQuickAttendance/);
  assert.match(att, /openHelp\('asistencia'\)/);
  assert.match(att, /friendlyError\(err, 'camera'\)/);
  assert.match(att, /cameraIsUnavailable\(cameraErrorKind\(err\)\)\) return window\.setAttendanceMode\('quick'\)/, 'si la cámara no abre por http, lista rápida sin avisos rojos');
  assert.match(att, /id="btn-start-scanner"/); assert.match(att, /qr-video/);
  assert.match(att, /status === 'present'/, 'solo «present» cuenta como presente');
});

test('el nodo publica el certificado solo si existe, el service worker cachea el módulo y la ayuda lo explica', () => {
  const srv = read('school-node/server.js');
  assert.match(srv, /url\.pathname === '\/node-ca\.crt'/);
  assert.match(srv, /path\.resolve\(config\.dataDir, 'ca'\), 'quetzal-ca\.crt'/);
  assert.doesNotMatch(srv, /createServer\([^)]*key/i, 'no se inventó HTTPS en el nodo');
  assert.match(read('service-worker.js'), /'js\/camera-support\.js'/);
  assert.match(read('js/help-messages.js'), /lista rápida/);
  assert.match(read('school-node/README.md'), /HTTPS y cámara para pasar lista/);
});
