// Servidor de nombres del nodo (school-node/dns.js): quetzal.local para cualquier dispositivo cuando el router del kit entrega la IP de la
// Raspberry como DNS. Las decisiones son funciones puras; al final se levanta el servidor de verdad en 127.0.0.1 con un puerto libre.
import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import dnsPacket from '../school-node/node_modules/dns-packet/index.js';
import {
  addressFor, decide, failure, isHotspotAddress, lanAddresses, localNames, parseDefaultGateways, parseResolvConf, pickUpstreams,
  probeResponse, startDns, PROBE_HOSTS,
} from '../school-node/dns.js';

const query = (name, type = 'A', id = 7) => dnsPacket.encode({ type: 'query', id, flags: dnsPacket.RECURSION_DESIRED, questions: [{ type, name }] });
const names = localNames('quetzal');

test('quetzal.local se responde con la IP del nodo, sin importar mayúsculas ni el punto final', () => {
  for (const name of ['quetzal.local', 'QUETZAL.local', 'quetzal.local.']) {
    const v = decide(query(name), { names, ip: '192.168.0.50', offline: false });
    assert.equal(v.kind, 'answer');
    const r = dnsPacket.decode(v.buffer);
    assert.equal(r.id, 7);
    assert.equal(r.type, 'response');
    assert.deepEqual(r.answers.map((a) => [a.type, a.data]), [['A', '192.168.0.50']]);
  }
});

test('el nombre configurado (ada.local) también es el nodo, y quetzal.local sigue valiendo', () => {
  const custom = localNames('Ada.local');
  assert.deepEqual([...custom].sort(), ['ada.local', 'quetzal.local']);
  assert.equal(decide(query('ada.local'), { names: custom, ip: '10.0.0.5', offline: false }).kind, 'answer');
  assert.deepEqual([...localNames('nombre con espacios')], ['quetzal.local'], 'un nombre inválido cae en quetzal');
});

test('la pregunta por IPv6 (AAAA) de quetzal.local se responde vacía en vez de reenviarla: el dispositivo no se queda esperando', () => {
  const v = decide(query('quetzal.local', 'AAAA'), { names, ip: '192.168.0.50', offline: false });
  assert.equal(v.kind, 'answer');
  const r = dnsPacket.decode(v.buffer);
  assert.equal(r.answers.length, 0);
  assert.equal(r.flags & 0xf, 0, 'sin error');
});

test('los demás nombres se reenvían; lo que no es una pregunta válida se ignora', () => {
  assert.deepEqual(decide(query('clases.yoaprendo.online'), { names, ip: '192.168.0.50', offline: false }), { kind: 'forward', probe: false });
  assert.deepEqual(decide(query('clases.yoaprendo.online'), { names, ip: '192.168.0.50', offline: true }), { kind: 'forward', probe: false });
  assert.deepEqual(decide(Buffer.from('basura'), { names, ip: '192.168.0.50', offline: false }), { kind: 'drop' });
  const response = dnsPacket.encode({ type: 'response', id: 1, questions: [{ type: 'A', name: 'quetzal.local' }] });
  assert.deepEqual(decide(response, { names, ip: '192.168.0.50', offline: false }), { kind: 'drop' });
});

test('la comprobación de internet de Android: con internet se reenvía; sin internet se responde con el nodo y poca duración', () => {
  const name = 'connectivitycheck.gstatic.com';
  assert.ok(PROBE_HOSTS.has(name));
  assert.deepEqual(decide(query(name), { names, ip: '192.168.0.50', offline: false }), { kind: 'forward', probe: true });
  const v = decide(query(name), { names, ip: '192.168.0.50', offline: true });
  const r = dnsPacket.decode(v.buffer);
  assert.equal(r.answers[0].data, '192.168.0.50');
  assert.ok(r.answers[0].ttl <= 10, 'al volver el internet deja de valer en segundos');
});

test('lo que el nodo contesta a esas comprobaciones es lo que cada sistema espera', () => {
  assert.equal(probeResponse('connectivitycheck.gstatic.com').status, 204);
  assert.equal(probeResponse('CONNECTIVITYCHECK.gstatic.com:80').status, 204);
  assert.match(probeResponse('captive.apple.com').body, /Success/);
  assert.equal(probeResponse('www.msftconnecttest.com').body, 'Microsoft Connect Test');
  assert.equal(probeResponse('quetzal.local'), null, 'la app normal no se toca');
  assert.equal(probeResponse('192.168.0.50'), null);
  assert.equal(probeResponse(undefined), null);
});

test('cada dispositivo recibe la IP del nodo que está en su misma red (cable y Wi-Fi a la vez)', () => {
  const nets = [{ address: '192.168.0.50', netmask: '255.255.255.0' }, { address: '10.0.5.9', netmask: '255.255.0.0' }];
  assert.equal(addressFor('10.0.77.3', nets), '10.0.5.9');
  assert.equal(addressFor('192.168.0.7', nets), '192.168.0.50');
  assert.equal(addressFor('172.16.0.1', nets), '192.168.0.50', 'desconocido: la primera');
  assert.equal(addressFor('192.168.0.7', []), null);
});

test('las direcciones de la red local: sin las internas ni las de «sin red»; la red propia de la Raspberry se reconoce', () => {
  const ifs = {
    lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1', netmask: '255.0.0.0' }],
    eth0: [{ family: 'IPv4', internal: false, address: '192.168.0.50', netmask: '255.255.255.0' }, { family: 'IPv6', internal: false, address: 'fe80::1', netmask: 'ffff::' }],
    wlan0: [{ family: 'IPv4', internal: false, address: '10.42.0.1', netmask: '255.255.255.0' }],
    usb0: [{ family: 'IPv4', internal: false, address: '169.254.3.4', netmask: '255.255.0.0' }],
  };
  assert.deepEqual(lanAddresses(ifs).map((n) => n.address), ['192.168.0.50', '10.42.0.1']);
  assert.equal(isHotspotAddress('10.42.0.1'), true);
  assert.equal(isHotspotAddress('192.168.0.50'), false);
});

test('a quién se reenvía: el router primero, nunca a sí mismo (en el kit el router le da a la Raspberry su propia IP como DNS)', () => {
  assert.deepEqual(parseResolvConf('# hecho por NetworkManager\nnameserver 192.168.0.50\nnameserver 192.168.0.1\nsearch lan\nnameserver ::1\n'), ['192.168.0.50', '192.168.0.1']);
  assert.deepEqual(parseDefaultGateways('default via 192.168.0.1 dev eth0 proto dhcp metric 100\ndefault via 10.0.0.1 dev wlan0 metric 600\n192.168.0.0/24 dev eth0\n'), ['192.168.0.1', '10.0.0.1']);
  assert.deepEqual(
    pickUpstreams({ resolvConf: ['192.168.0.50', '192.168.0.1'], gateways: ['192.168.0.1'], own: ['192.168.0.50'] }),
    ['192.168.0.1', '1.1.1.1', '8.8.8.8'],
  );
  assert.deepEqual(pickUpstreams({ configured: ['9.9.9.9', 'no-es-ip', '127.0.0.1'] }), ['9.9.9.9', '1.1.1.1', '8.8.8.8']);
});

test('«no se pudo resolver» conserva el número de la pregunta', () => {
  const r = dnsPacket.decode(failure(query('algo.com', 'A', 99)));
  assert.equal(r.id, 99);
  assert.equal(r.flags & 0xf, 2);
  assert.equal(failure(Buffer.from('x')), null);
});

// ---- El servidor de verdad, en 127.0.0.1 con un puerto libre ----
const freePort = () => new Promise((resolve) => { const s = dgram.createSocket('udp4'); s.bind(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const askServer = (port, buf) => new Promise((resolve, reject) => {
  const s = dgram.createSocket('udp4');
  const t = setTimeout(() => { s.close(); reject(new Error('sin respuesta')); }, 3000);
  s.on('message', (m) => { clearTimeout(t); s.close(); resolve(dnsPacket.decode(m)); });
  s.send(buf, port, '127.0.0.1');
});
const fakeInterfaces = () => ({ eth0: [{ family: 'IPv4', internal: false, address: '127.0.0.1', netmask: '255.0.0.0' }] });

test('servidor real: responde quetzal.local, reenvía lo demás, y sin internet contesta la comprobación de Android y falla rápido el resto', async () => {
  const port = await freePort();
  let internet = true;
  const asked = [];
  const ask = async (msg, server) => {
    asked.push(server);
    if (!internet) return null;
    const q = dnsPacket.decode(msg);
    return dnsPacket.encode({ type: 'response', id: q.id, questions: q.questions, answers: [{ type: 'A', name: q.questions[0].name, ttl: 30, data: '93.184.216.34' }] });
  };
  const logs = [];
  const dns = startDns({
    hostName: 'quetzal', port, interfaces: fakeInterfaces, ask, log: (m) => logs.push(m), rescanMs: 60_000,
    systemGateways: async () => ['192.168.0.1'], systemResolvers: () => ['127.0.0.1'], isOffline: () => !internet,
  });
  try {
    await dns.ready;
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(dns.state.listening, ['127.0.0.1']);
    assert.deepEqual(dns.state.upstreams, ['192.168.0.1', '1.1.1.1', '8.8.8.8'], 'su propia IP no está entre los destinos');

    const local = await askServer(port, query('quetzal.local', 'A', 11));
    assert.equal(local.id, 11);
    assert.equal(local.answers[0].data, '127.0.0.1');
    assert.equal(asked.length, 0, 'quetzal.local no sale a internet');

    const other = await askServer(port, query('ejemplo.com', 'A', 12));
    assert.equal(other.answers[0].data, '93.184.216.34');
    assert.equal(asked[0], '192.168.0.1', 'primero al router');

    internet = false;
    const probe = await askServer(port, query('connectivitycheck.gstatic.com', 'A', 13));
    assert.equal(probe.answers[0].data, '127.0.0.1');
    const dead = await askServer(port, query('ejemplo.com', 'A', 14));
    assert.equal(dead.id, 14);
    assert.equal(dead.flags & 0xf, 2, 'sin internet: «no se pudo», de inmediato');
    assert.ok(dns.state.queries >= 4);
    assert.ok(dns.state.local_answers >= 2);
  } finally { dns.close(); }
});

test('servidor real: si el puerto está ocupado avisa una vez y el nodo sigue; no escucha en la red propia de la Raspberry', async () => {
  const port = await freePort();
  const blocker = dgram.createSocket('udp4');
  await new Promise((r) => blocker.bind(port, '127.0.0.1', r));
  const logs = [];
  const dns = startDns({
    port, log: (m) => logs.push(m), rescanMs: 60_000, systemGateways: async () => [], systemResolvers: () => [],
    interfaces: () => ({ eth0: [{ family: 'IPv4', internal: false, address: '127.0.0.1', netmask: '255.0.0.0' }], wlan0: [{ family: 'IPv4', internal: false, address: '10.42.0.1', netmask: '255.255.255.0' }] }),
  });
  try {
    await dns.ready;
    await new Promise((r) => setTimeout(r, 200));
    await dns.rescan();
    assert.deepEqual(dns.state.listening, []);
    assert.match(dns.state.error, /127\.0\.0\.1/);
    assert.equal(logs.filter((l) => /No se pudo abrir/.test(l)).length, 1, 'no repite el aviso en cada revisión');
    assert.ok(!logs.some((l) => l.includes('10.42.0.1')), 'la red propia de la Raspberry no se toca');
  } finally { dns.close(); blocker.close(); }
});

// ---- Dentro del nodo de verdad (school-node/server.js) ----
test('nodo real con "dns": true: resuelve quetzal.local en la IP de la red, lo cuenta en /api/node/status y contesta la comprobación de internet de Android', async (t) => {
  const helper = await import('./helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) return t.skip('better-sqlite3 no está instalado para este Node');
  const lan = lanAddresses().filter((n) => !isHotspotAddress(n.address));
  if (!lan.length) return t.skip('esta máquina no tiene red local');
  const dnsPort = await freePort();
  const node = await helper.startNode({ config: { dns: true, dnsPort } });
  try {
    const status = await helper.waitFor(async () => {
      const s = await (await fetch(node.base + '/api/node/status')).json();
      return s.dns?.listening?.length ? s : null;
    });
    const ip = status.dns.listening[0];
    const answer = await new Promise((resolve, reject) => {
      const s = dgram.createSocket('udp4');
      const timer = setTimeout(() => { s.close(); reject(new Error('el nodo no respondió la pregunta de nombres')); }, 4000);
      s.on('message', (m) => { clearTimeout(timer); s.close(); resolve(dnsPacket.decode(m)); });
      s.send(query('quetzal.local', 'A', 21), dnsPort, ip);
    });
    assert.equal(answer.answers[0].data, ip);

    const http = await import('node:http');
    const probe = await new Promise((resolve, reject) => {
      const u = new URL(node.base);
      http.get({ host: u.hostname, port: u.port, path: '/generate_204', headers: { Host: 'connectivitycheck.gstatic.com' } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(probe, 204);
    const app = await fetch(node.base + '/');
    assert.equal(app.status, 200, 'la app normal sigue abriendo');
    const after = await (await fetch(node.base + '/api/node/status')).json();
    assert.ok(after.dns.local_answers >= 1);
  } finally { await node.stop(); }
});

test('nodo real sin "dns" en la configuración (pruebas, Windows, Chromebook): no abre servidor de nombres ni toca las comprobaciones', async (t) => {
  const helper = await import('./helpers/start-node.mjs');
  if (!helper.sqliteAvailable()) return t.skip('better-sqlite3 no está instalado para este Node');
  const node = await helper.startNode({});
  try {
    const s = await (await fetch(node.base + '/api/node/status')).json();
    assert.equal(s.dns, null);
  } finally { await node.stop(); }
});
