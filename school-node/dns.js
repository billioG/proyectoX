// Servidor de nombres (DNS) del nodo, para el «kit» de router + Raspberry.
//
// Para qué: el nombre http://quetzal.local se anuncia por mDNS (avahi), y los Android anteriores a la versión 12 no lo entienden: preguntan
// el nombre al servidor de nombres que les dio el router. Si el router del kit entrega como DNS la IP de la Raspberry (se prepara una sola
// vez, ver docs/NODO_KIT_ROUTER.md), este servidor contesta y quetzal.local abre en cualquier dispositivo, sin escribir la IP.
//
// Qué hace con cada pregunta:
//  * quetzal.local (y el nombre de config.hostName): responde la IP de este equipo en la red de quien pregunta.
//  * cualquier otro nombre: lo reenvía al router (o a los DNS públicos) y devuelve su respuesta tal cual; con internet todo sigue igual.
//  * sin internet, las direcciones con que los dispositivos comprueban si la red «tiene internet» (PROBE_HOSTS): responde la IP del nodo, y
//    el nodo contesta lo que esperan (probeResponse). Es para que no abandonen el Wi-Fi de la escuela; no está medido en todos los modelos.
//
// Si el router no entrega esta IP como DNS, nadie le pregunta y no cambia nada: es inofensivo en la casa del docente.
// Solo UDP (lo normal en una red local). No escucha en la red propia de la Raspberry (--hotspot, 10.42.x.1): ahí el DNS es de NetworkManager.
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import dnsPacket from 'dns-packet';
import { normalizeHostName } from './mdns.js';

export const PUBLIC_RESOLVERS = ['1.1.1.1', '8.8.8.8'];

// Direcciones que usan Android, iPhone/Mac, Windows y Firefox para saber si la red tiene internet.
export const PROBE_HOSTS = new Set([
  'connectivitycheck.gstatic.com', 'connectivitycheck.android.com', 'clients3.google.com', 'clients1.google.com', 'play.googleapis.com',
  'captive.apple.com', 'www.apple.com', 'www.msftconnecttest.com', 'www.msftncsi.com', 'detectportal.firefox.com',
]);

const cleanName = (n) => String(n || '').toLowerCase().replace(/\.$/, '');
const cleanHost = (h) => cleanName(String(h || '').replace(/:\d+$/, ''));
const toInt = (ip) => ip.split('.').reduce((acc, o) => ((acc << 8) | Number(o)) >>> 0, 0);

/** Los nombres que son este nodo: quetzal.local siempre, y el de config.hostName. */
export function localNames(hostName) {
  const name = normalizeHostName(hostName);
  return new Set(['quetzal.local', `${name}.local`]);
}

/** IPv4 de este equipo en la red local (sin las internas ni las 169.254 de «sin red»). */
export function lanAddresses(interfaces = os.networkInterfaces()) {
  return Object.values(interfaces).flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'))
    .map((n) => ({ address: n.address, netmask: n.netmask }));
}

/** La red propia de la Raspberry (NetworkManager en modo compartido usa 10.42.x.1 y pone su propio DNS ahí): no se toca. */
export const isHotspotAddress = (ip) => /^10\.42\.\d+\.1$/.test(ip);

/** La IP de este equipo que está en la misma red que quien pregunta. */
export function addressFor(remote, nets) {
  if (remote) {
    const hit = nets.find((n) => (toInt(n.address) & toInt(n.netmask)) === (toInt(remote) & toInt(n.netmask)));
    if (hit) return hit.address;
  }
  return nets[0]?.address || null;
}

/** Servidores de /etc/resolv.conf. */
export function parseResolvConf(text) {
  return String(text || '').split(/\r?\n/)
    .map((l) => /^\s*nameserver\s+(\d+\.\d+\.\d+\.\d+)\s*$/.exec(l)?.[1])
    .filter(Boolean);
}

/** La puerta de enlace de «ip route» (el router). */
export function parseDefaultGateways(text) {
  return [...String(text || '').matchAll(/^default via (\d+\.\d+\.\d+\.\d+)/gm)].map((m) => m[1]);
}

/**
 * A quién reenviar: primero lo configurado, luego el router y los DNS del sistema, y al final los públicos. Nunca a sí mismo (en el kit el
 * router también le entrega a la Raspberry su propia IP como DNS: reenviarse a sí misma sería un círculo).
 */
export function pickUpstreams({ configured = [], resolvConf = [], gateways = [], own = [] } = {}) {
  const mine = new Set(own);
  const out = [];
  for (const ip of [...configured, ...gateways, ...resolvConf, ...PUBLIC_RESOLVERS]) {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || mine.has(ip) || ip.startsWith('127.') || out.includes(ip)) continue;
    out.push(ip);
  }
  return out;
}

/**
 * Qué responder a una pregunta sin salir a internet.
 * @returns { kind: 'answer', buffer } | { kind: 'forward', probe: boolean } | { kind: 'drop' }
 */
export function decide(buffer, { names, ip, offline }) {
  let query;
  try { query = dnsPacket.decode(buffer); } catch { return { kind: 'drop' }; }
  if (query.type !== 'query' || !query.questions?.length) return { kind: 'drop' };
  const q = query.questions[0];
  const name = cleanName(q.name);
  const local = names.has(name);
  const probe = PROBE_HOSTS.has(name);
  if (!local && !(probe && offline)) return { kind: 'forward', probe };
  const answers = (q.type === 'A' || q.type === 'ANY') && ip
    ? [{ name: q.name, type: 'A', class: 'IN', ttl: local ? 60 : 10, data: ip }]
    : [];
  return { kind: 'answer', buffer: reply(query, answers) };
}

function reply(query, answers, rcode = 0) {
  return dnsPacket.encode({
    type: 'response', id: query.id,
    flags: dnsPacket.AUTHORITATIVE_ANSWER | dnsPacket.RECURSION_AVAILABLE | (query.flags & dnsPacket.RECURSION_DESIRED) | rcode,
    questions: query.questions, answers,
  });
}

/** «No se pudo resolver» (SERVFAIL): el dispositivo lo sabe de inmediato en vez de esperar. */
export function failure(buffer) {
  try { return reply(dnsPacket.decode(buffer), [], 2); } catch { return null; }
}

/**
 * Lo que esperan recibir los dispositivos cuando comprueban si hay internet. Solo se usa sin internet (con internet esas direcciones no
 * llegan al nodo). @returns { status, headers, body } o null si la petición no es una de esas comprobaciones.
 */
export function probeResponse(host) {
  const h = cleanHost(host);
  if (!PROBE_HOSTS.has(h)) return null;
  const text = (body, type = 'text/plain') => ({ status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'no-store' }, body });
  if (h === 'captive.apple.com' || h === 'www.apple.com') return text('<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>', 'text/html');
  if (h === 'www.msftconnecttest.com') return text('Microsoft Connect Test');
  if (h === 'www.msftncsi.com') return text('Microsoft NCSI');
  if (h === 'detectportal.firefox.com') return text('success\n');
  return { status: 204, headers: { 'Cache-Control': 'no-store' }, body: '' };
}

/** Pregunta a un servidor de nombres y devuelve su respuesta tal cual (o null si no contesta a tiempo). */
function askUpstream(buffer, server, timeoutMs) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    let done = false;
    const finish = (value) => { if (done) return; done = true; clearTimeout(timer); try { sock.close(); } catch { } resolve(value); };
    const timer = setTimeout(() => finish(null), timeoutMs);
    sock.on('error', () => finish(null));
    sock.on('message', (msg) => finish(msg));
    sock.send(buffer, 53, server, (e) => { if (e) finish(null); });
  });
}

const gatewaysFromSystem = () => new Promise((resolve) => {
  if (process.platform !== 'linux') return resolve([]);
  execFile('ip', ['-4', 'route', 'show', 'default'], { timeout: 3000 }, (e, out) => resolve(e ? [] : parseDefaultGateways(out)));
});
const resolvConfFromSystem = () => { try { return parseResolvConf(fs.readFileSync('/etc/resolv.conf', 'utf8')); } catch { return []; } };

/**
 * Arranca el servidor. Escucha en cada IP de la red local (no en 0.0.0.0, para no chocar con el DNS de la red propia de la Raspberry) y
 * vuelve a mirar las IP cada pocos segundos: al arrancar puede que el router todavía no le haya dado dirección.
 */
export function startDns({
  hostName, port = 53, upstream = [], isOffline = () => false, rescanMs = 10000, timeoutMs = 2000,
  interfaces = () => os.networkInterfaces(), ask = askUpstream, log = console.log,
  systemGateways = gatewaysFromSystem, systemResolvers = resolvConfFromSystem,
} = {}) {
  const names = localNames(hostName);
  const sockets = new Map(); // ip -> socket
  const failed = new Set(); // ip donde no se pudo escuchar (se avisa una sola vez)
  const state = { listening: [], upstreams: [], queries: 0, local_answers: 0, clients: 0, last_client_at: null, error: null };
  const clients = new Set();
  let upstreams = pickUpstreams({ configured: upstream });
  let closed = false;

  async function handle(sock, msg, rinfo, nets) {
    state.queries++;
    const own = nets.map((n) => n.address);
    if (!own.includes(rinfo.address) && !rinfo.address.startsWith('127.')) {
      if (clients.size < 500) clients.add(rinfo.address);
      state.clients = clients.size;
      state.last_client_at = new Date().toISOString();
    }
    const send = (buf) => { if (buf && !closed) sock.send(buf, rinfo.port, rinfo.address, () => { }); };
    const ip = addressFor(rinfo.address, nets);
    const verdict = decide(msg, { names, ip, offline: isOffline() });
    if (verdict.kind === 'drop') return;
    if (verdict.kind === 'answer') { state.local_answers++; return send(verdict.buffer); }
    for (const server of upstreams) {
      const answer = await ask(msg, server, timeoutMs);
      if (answer) return send(answer);
    }
    // Nadie contestó: no hay internet. Las comprobaciones de «¿hay internet?» se responden con el nodo; lo demás, «no se pudo».
    if (verdict.probe) {
      const local = decide(msg, { names, ip, offline: true });
      if (local.kind === 'answer') { state.local_answers++; return send(local.buffer); }
    }
    send(failure(msg));
  }

  async function rescan() {
    if (closed) return;
    const nets = lanAddresses(interfaces()).filter((n) => !isHotspotAddress(n.address));
    const wanted = new Set(nets.map((n) => n.address));
    for (const [ip, sock] of sockets) {
      if (!wanted.has(ip)) { try { sock.close(); } catch { } sockets.delete(ip); }
    }
    for (const ip of [...failed]) if (!wanted.has(ip)) failed.delete(ip);
    for (const ip of wanted) {
      if (sockets.has(ip) || failed.has(ip)) continue;
      const sock = dgram.createSocket('udp4');
      sock.on('error', (e) => {
        if (sockets.get(ip) === sock) sockets.delete(ip);
        failed.add(ip);
        state.listening = [...sockets.keys()];
        state.error = `No se pudo abrir el servidor de nombres en ${ip}: ${e.code || e.message}`;
        log(`⚠️  ${state.error}. quetzal.local sigue funcionando por mDNS.`);
        try { sock.close(); } catch { }
      });
      sock.on('message', (msg, rinfo) => { handle(sock, msg, rinfo, lanAddresses(interfaces())).catch(() => { }); });
      sock.on('listening', () => { state.error = null; state.listening = [...sockets.keys()]; log(`🧭 Servidor de nombres activo en ${ip}:${port} (quetzal.local para todos los dispositivos)`); });
      sockets.set(ip, sock);
      sock.bind(port, ip);
    }
    state.listening = [...sockets.keys()];
    const [gateways, resolvConf] = await Promise.all([systemGateways(), systemResolvers()]);
    upstreams = pickUpstreams({ configured: upstream, gateways, resolvConf, own: lanAddresses(interfaces()).map((n) => n.address) });
    state.upstreams = upstreams;
  }

  const timer = setInterval(() => { rescan().catch(() => { }); }, rescanMs);
  timer.unref?.();
  const ready = rescan().catch(() => { });
  return {
    state, ready, rescan,
    close() { closed = true; clearInterval(timer); for (const s of sockets.values()) { try { s.close(); } catch { } } sockets.clear(); },
  };
}
