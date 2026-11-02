// Conectar la Raspberry a una Wi-Fi desde el navegador (school-node/wifi.js): lectura de lo que dice nmcli, validación de lo que escribe
// el docente y los comandos que se ejecutan (siempre como lista de argumentos, nunca por una shell). Con un nmcli de mentira.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWifi, parseScan, parseTerse, validateConnect } from '../school-node/wifi.js';

test('nmcli -t escapa los dos puntos y las barras: se lee bien', () => {
  assert.deepEqual(parseTerse('*:Casa\\:5G:80:WPA2'), ['*', 'Casa:5G', '80', 'WPA2']);
  assert.deepEqual(parseTerse('a\\\\b:c'), ['a\\b', 'c']);
  const nets = parseScan('*:CasaMia:80:WPA2\n :Vecino\\:5G:45:WPA1 WPA2\n :Abierta:30:\n :CasaMia:60:WPA2\n ::10:WPA2\n');
  assert.deepEqual(nets, [
    { ssid: 'CasaMia', signal: 80, secured: true, connected: true },
    { ssid: 'Vecino:5G', signal: 45, secured: true, connected: false },
    { ssid: 'Abierta', signal: 30, secured: false, connected: false },
  ], 'sin nombres vacíos ni repetidos (gana la señal más fuerte), de más fuerte a más débil');
});

test('lo que escribe el docente: nombre de la red de 1 a 32 bytes, clave WPA de 8 a 63 (o ninguna en redes abiertas), sin caracteres de control', () => {
  assert.deepEqual(validateConnect({ ssid: 'CasaMia', password: '12345678' }), { ok: true, ssid: 'CasaMia', password: '12345678' });
  assert.deepEqual(validateConnect({ ssid: 'Abierta', password: '' }), { ok: true, ssid: 'Abierta', password: '' });
  for (const bad of [
    { ssid: '', password: '12345678' }, { ssid: 'a'.repeat(33), password: '12345678' }, { ssid: 'ñ'.repeat(17), password: '12345678' }, { ssid: 'Casa\nX', password: '12345678' },
    { ssid: 'Casa', password: '1234567' }, { ssid: 'Casa', password: 'x'.repeat(64) }, { ssid: 'Casa', password: 'clave\u0000mala1' }, { ssid: 42, password: 'x' }, null,
  ]) assert.equal(validateConnect(bad).ok, false, JSON.stringify(bad));
  assert.equal(validateConnect({ ssid: 'Mi Casa 5G (sala)', password: 'clave con espacios' }).ok, true);
});

// nmcli de mentira que anota cada llamada.
function fakeRunner(replies = {}) {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    const key = args.join(' ');
    for (const [prefix, r] of Object.entries(replies)) if (key.startsWith(prefix)) return typeof r === 'function' ? r(args) : r;
    return { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}
const DEVICES = { code: 0, stdout: 'wlan0:wifi:connected:CasaMia\neth0:ethernet:connected:Wired connection 1\nlo:loopback:unmanaged:\n', stderr: '' };
const SAVED = { code: 0, stdout: 'CasaMia:802-11-wireless\nWired connection 1:802-3-ethernet\n', stderr: '' };

test('en una computadora sin nmcli (Windows) dice que no está disponible, sin ejecutar nada', async () => {
  const f = fakeRunner();
  const wifi = createWifi({ run: f.run, platform: 'win32' });
  assert.deepEqual(await wifi.status(), { supported: false, reason: 'Esta computadora no es una Raspberry Pi: conecta el Wi-Fi desde la configuración de Windows.' });
  await assert.rejects(wifi.connect({ ssid: 'Casa', password: '12345678' }), /no está disponible/i);
  assert.equal(f.calls.length, 0);
});

test('estado: la red actual y las guardadas; sin tarjeta Wi-Fi lo dice', async () => {
  const f = fakeRunner({ '-t -f DEVICE,TYPE,STATE,CONNECTION device': DEVICES, '-t -f NAME,TYPE connection show': SAVED });
  const s = await createWifi({ run: f.run, platform: 'linux' }).status();
  assert.deepEqual(s, { supported: true, device: 'wlan0', connected: 'CasaMia', saved: ['CasaMia'] });
  const none = await createWifi({ run: fakeRunner({ '-t -f DEVICE,TYPE,STATE,CONNECTION device': { code: 0, stdout: 'eth0:ethernet:connected:x\n', stderr: '' } }).run, platform: 'linux' }).status();
  assert.deepEqual(none, { supported: false, reason: 'Esta computadora no tiene tarjeta Wi-Fi.' });
});

test('conectar: crea la conexión con la clave y la activa; una red guardada se reemplaza para no dejar la clave vieja', async () => {
  const f = fakeRunner({ '-t -f DEVICE,TYPE,STATE,CONNECTION device': DEVICES, '-t -f NAME,TYPE connection show': SAVED });
  const wifi = createWifi({ run: f.run, platform: 'linux' });
  assert.deepEqual(await wifi.connect({ ssid: 'CasaMia', password: 'nueva-clave-1' }), { ok: true, ssid: 'CasaMia' });
  const cmds = f.calls.map((a) => a.join(' '));
  assert.ok(cmds.includes('connection delete id CasaMia'), 'se borra la guardada con ese nombre');
  const add = f.calls.find((a) => a[0] === 'connection' && a[1] === 'add');
  assert.deepEqual(add, ['connection', 'add', 'type', 'wifi', 'ifname', 'wlan0', 'con-name', 'CasaMia', 'ssid', 'CasaMia', 'wifi-sec.key-mgmt', 'wpa-psk', 'wifi-sec.psk', 'nueva-clave-1']);
  assert.deepEqual(f.calls.at(-1), ['-w', '30', 'connection', 'up', 'id', 'CasaMia']);
  const open = fakeRunner({ '-t -f DEVICE,TYPE,STATE,CONNECTION device': DEVICES, '-t -f NAME,TYPE connection show': { code: 0, stdout: '', stderr: '' } });
  await createWifi({ run: open.run, platform: 'linux' }).connect({ ssid: 'Abierta', password: '' });
  assert.deepEqual(open.calls.find((a) => a[1] === 'add'), ['connection', 'add', 'type', 'wifi', 'ifname', 'wlan0', 'con-name', 'Abierta', 'ssid', 'Abierta']);
});

test('si no conecta (clave mala), se borra la conexión nueva y se explica en español; nunca se muestra la clave', async () => {
  const f = fakeRunner({
    '-t -f DEVICE,TYPE,STATE,CONNECTION device': DEVICES, '-t -f NAME,TYPE connection show': { code: 0, stdout: '', stderr: '' },
    '-w 30 connection up': { code: 4, stdout: '', stderr: 'Error: Connection activation failed: (7) Secrets were required, but not provided. clave-secreta-123' },
  });
  const wifi = createWifi({ run: f.run, platform: 'linux' });
  await assert.rejects(wifi.connect({ ssid: 'Casa', password: 'clave-secreta-123' }), (e) => /contraseña/i.test(e.message) && !/clave-secreta-123/.test(e.message) && e.status === 400);
  assert.ok(f.calls.some((a) => a.join(' ') === 'connection delete id Casa'), 'no queda una conexión rota guardada');
});

test('los nombres raros viajan como UN argumento (sin shell): ni comillas ni guiones ni espacios los rompen', async () => {
  const f = fakeRunner({ '-t -f DEVICE,TYPE,STATE,CONNECTION device': DEVICES, '-t -f NAME,TYPE connection show': { code: 0, stdout: '', stderr: '' } });
  const ssid = '--rm -rf "$(x)"; `y`';
  await createWifi({ run: f.run, platform: 'linux' }).connect({ ssid, password: 'a b c d e f g h' });
  const add = f.calls.find((a) => a[1] === 'add');
  assert.equal(add[add.indexOf('ssid') + 1], ssid);
  assert.equal(add[add.indexOf('con-name') + 1], ssid);
  assert.equal(add[add.indexOf('wifi-sec.psk') + 1], 'a b c d e f g h');
});

test('olvidar una red: solo una guardada; las demás (el cable) no se tocan', async () => {
  const f = fakeRunner({ '-t -f NAME,TYPE connection show': SAVED, '-t -f DEVICE,TYPE,STATE,CONNECTION device': DEVICES });
  const wifi = createWifi({ run: f.run, platform: 'linux' });
  assert.deepEqual(await wifi.forget({ ssid: 'CasaMia' }), { ok: true });
  assert.ok(f.calls.some((a) => a.join(' ') === 'connection delete id CasaMia'));
  await assert.rejects(wifi.forget({ ssid: 'Wired connection 1' }), /no está guardada/i);
  assert.ok(!f.calls.some((a) => a.join(' ') === 'connection delete id Wired connection 1'));
});
