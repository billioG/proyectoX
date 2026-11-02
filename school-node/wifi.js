// Conectar el nodo (Raspberry Pi) a una red Wi-Fi desde el navegador, sin SSH: el docente la lleva a su casa y elige su red.
// Usa NetworkManager (`nmcli`), que ya trae Raspberry Pi OS. Todo se ejecuta como LISTA de argumentos (nunca por una shell), así que
// un nombre de red con comillas, guiones o espacios no puede inyectar comandos. Solo Linux; en Windows se usa la configuración del sistema.
import { spawn } from 'node:child_process';

const fail = (status, message) => Object.assign(new Error(message), { status });
const CONTROL = /[\u0000-\u001F\u007F]/;

/** Un renglón de `nmcli -t`: los campos van separados por «:» y un «:» o «\» dentro de un campo viene con «\» delante. */
export function parseTerse(line) {
  const fields = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && i + 1 < line.length) { cur += line[++i]; continue; }
    if (c === ':') { fields.push(cur); cur = ''; continue; }
    cur += c;
  }
  fields.push(cur);
  return fields;
}

/** Redes visibles: sin nombres vacíos ni repetidos (se queda la de más señal), de la más fuerte a la más débil. */
export function parseScan(out) {
  const best = new Map();
  for (const line of String(out || '').split('\n')) {
    if (!line.trim()) continue;
    const [inUse, ssid, signal, security] = parseTerse(line);
    if (!ssid) continue;
    const net = { ssid, signal: Number(signal) || 0, secured: !!security && security !== '--', connected: inUse.trim() === '*' };
    const prev = best.get(ssid);
    if (!prev) best.set(ssid, net);
    else best.set(ssid, { ...(net.signal > prev.signal ? net : prev), connected: prev.connected || net.connected });
  }
  return [...best.values()].sort((a, b) => b.signal - a.signal);
}

/** Nombre de la red (1 a 32 bytes) y clave WPA (8 a 63, o ninguna en una red abierta), sin caracteres de control. */
export function validateConnect(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Datos inválidos.' };
  const { ssid, password = '' } = input;
  if (typeof ssid !== 'string' || !ssid || Buffer.byteLength(ssid) > 32 || CONTROL.test(ssid)) return { ok: false, error: 'El nombre de la red no es válido.' };
  if (typeof password !== 'string' || CONTROL.test(password)) return { ok: false, error: 'La contraseña no es válida.' };
  const n = Buffer.byteLength(password);
  if (n !== 0 && (n < 8 || n > 63)) return { ok: false, error: 'La contraseña de una Wi-Fi tiene entre 8 y 63 caracteres.' };
  return { ok: true, ssid, password };
}

/** Ejecuta nmcli. Si el servicio no tiene permiso para cambiar redes, reintenta con `sudo -n` (la Raspberry de fábrica no pide clave). */
export function createNmcliRunner({ command = ['nmcli'], timeoutMs = 60_000, spawnImpl = spawn } = {}) {
  const once = (cmd, args) => new Promise((resolve) => {
    let out = '', err = '', done = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    let child;
    try { child = spawnImpl(cmd[0], [...cmd.slice(1), ...args], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return resolve({ code: 127, stdout: '', stderr: e.message }); }
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ya terminó */ } finish({ code: 124, stdout: out, stderr: `${err}\ntiempo agotado` }); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => finish({ code: 127, stdout: out, stderr: e.message }));
    child.on('close', (code) => finish({ code: code ?? 1, stdout: out, stderr: err }));
  });
  return async (args) => {
    const r = await once(command, args);
    if (r.code !== 0 && command.length === 1 && /not authorized|permission denied|insufficient privileges|access denied/i.test(r.stderr)) return once(['sudo', '-n', ...command], args);
    return r;
  };
}

export function createWifi({ run, platform = process.platform }) {
  let busy = false;
  const unavailable = () => fail(400, 'Conectar Wi-Fi no está disponible en esta computadora.');

  async function wifiDevice() {
    const r = await run(['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device']);
    if (r.code !== 0) return { reason: 'No se pudo consultar la red (¿falta NetworkManager?).' };
    const devs = r.stdout.split('\n').filter(Boolean).map(parseTerse).filter((f) => f[1] === 'wifi');
    if (!devs.length) return { reason: 'Esta computadora no tiene tarjeta Wi-Fi.' };
    const d = devs.find((f) => f[2] === 'connected') || devs[0];
    return { device: d[0], connected: d[2] === 'connected' && d[3] ? d[3] : null };
  }
  async function saved() {
    const r = await run(['-t', '-f', 'NAME,TYPE', 'connection', 'show']);
    return r.stdout.split('\n').filter(Boolean).map(parseTerse).filter((f) => f[1] === '802-11-wireless').map((f) => f[0]);
  }
  async function exclusive(fn) {
    if (busy) throw fail(429, 'Ya hay una conexión en curso. Espera un momento.');
    busy = true;
    try { return await fn(); } finally { busy = false; }
  }

  return {
    async status() {
      if (platform !== 'linux') return { supported: false, reason: 'Esta computadora no es una Raspberry Pi: conecta el Wi-Fi desde la configuración de Windows.' };
      const d = await wifiDevice();
      if (d.reason) return { supported: false, reason: d.reason };
      return { supported: true, device: d.device, connected: d.connected, saved: await saved() };
    },
    async scan() {
      if (platform !== 'linux') throw unavailable();
      const r = await run(['-t', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list', '--rescan', 'yes']);
      if (r.code !== 0) throw fail(500, 'No se pudieron buscar redes.');
      return parseScan(r.stdout);
    },
    connect(input) {
      if (platform !== 'linux') return Promise.reject(unavailable());
      const v = validateConnect(input);
      if (!v.ok) return Promise.reject(fail(400, v.error));
      return exclusive(async () => {
        const d = await wifiDevice();
        if (d.reason) throw fail(400, d.reason);
        // Una red ya guardada con ese nombre se reemplaza: así no queda la contraseña vieja.
        if ((await saved()).includes(v.ssid)) await run(['connection', 'delete', 'id', v.ssid]);
        const add = ['connection', 'add', 'type', 'wifi', 'ifname', d.device, 'con-name', v.ssid, 'ssid', v.ssid];
        if (v.password) add.push('wifi-sec.key-mgmt', 'wpa-psk', 'wifi-sec.psk', v.password);
        if ((await run(add)).code !== 0) throw fail(500, 'No se pudo guardar la red.');
        const up = await run(['-w', '30', 'connection', 'up', 'id', v.ssid]);
        if (up.code !== 0) {
          await run(['connection', 'delete', 'id', v.ssid]); // no se deja una conexión rota guardada
          throw fail(400, /secrets|password|psk|key/i.test(up.stderr)
            ? 'No se pudo conectar: revisa la contraseña de la red.'
            : 'No se pudo conectar a esa red. Acércate al router y vuelve a intentar.');
        }
        return { ok: true, ssid: v.ssid };
      });
    },
    forget(input) {
      if (platform !== 'linux') return Promise.reject(unavailable());
      const ssid = input?.ssid;
      if (typeof ssid !== 'string' || !ssid || CONTROL.test(ssid)) return Promise.reject(fail(400, 'El nombre de la red no es válido.'));
      return exclusive(async () => {
        if (!(await saved()).includes(ssid)) throw fail(404, 'Esa red no está guardada.');
        await run(['connection', 'delete', 'id', ssid]);
        return { ok: true };
      });
    },
  };
}
