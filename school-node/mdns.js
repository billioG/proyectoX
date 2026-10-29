// Nombre fácil en la red local: el nodo se anuncia por mDNS como
// http://<hostName>.local (por defecto http://quetzal.local), sin tocar el
// router ni renombrar la computadora. Funciona en iPhone y en la mayoría de
// Android recientes; la IP sigue funcionando siempre.
//
// Para cambiar el nombre (por ejemplo a http://ada.local), editar
// "hostName": "ada" en config.json y reiniciar el nodo.
import os from 'node:os';
import createMdns from 'multicast-dns';

export const DEFAULT_HOST_NAME = 'quetzal';

// Solo letras minúsculas, números y guion (formato válido de nombre de red).
export function normalizeHostName(raw) {
  const name = String(raw ?? DEFAULT_HOST_NAME).trim().toLowerCase().replace(/\.local\.?$/, '');
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(name) ? name : DEFAULT_HOST_NAME;
}

function ipv4Interfaces() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'));
}

const toInt = ip => ip.split('.').reduce((acc, o) => ((acc << 8) | Number(o)) >>> 0, 0);

// La IP de este equipo que está en la misma red que quien pregunta
// (si hay cable y Wi-Fi a la vez, cada uno recibe la que puede alcanzar).
function addressFor(remote) {
  const nets = ipv4Interfaces();
  if (remote) {
    const hit = nets.find(n => (toInt(n.address) & toInt(n.netmask)) === (toInt(remote) & toInt(n.netmask)));
    if (hit) return hit.address;
  }
  return nets[0]?.address || null;
}

export function startMdns(hostName) {
  const name = normalizeHostName(hostName);
  const fqdn = `${name}.local`;
  let mdns;
  try {
    mdns = createMdns();
  } catch (e) {
    console.warn(`⚠️  No se pudo publicar ${fqdn}: ${e.message}. Se puede usar la IP.`);
    return null;
  }
  mdns.on('error', e => console.warn(`⚠️  mDNS (${fqdn}): ${e.message}`));
  mdns.on('query', (query, rinfo) => {
    const asked = (query.questions || []).some(q => (q.type === 'A' || q.type === 'ANY') && String(q.name).toLowerCase() === fqdn);
    if (!asked) return;
    const ip = addressFor(rinfo?.address);
    if (!ip) return;
    mdns.respond({ answers: [{ name: fqdn, type: 'A', ttl: 120, flush: true, data: ip }] });
  });
  return { name, fqdn, close: () => { try { mdns.destroy(); } catch { } } };
}
