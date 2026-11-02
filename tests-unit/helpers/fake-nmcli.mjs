// nmcli de mentira para probar la pantalla de Wi-Fi con el servidor de verdad: node fake-nmcli.mjs <archivo de estado> <argumentos de nmcli...>
// Anota cada llamada (una línea JSON) y contesta como nmcli. La contraseña «mala-clave-1» falla al activar la red.
import fs from 'node:fs';
const [state, ...args] = process.argv.slice(2);
fs.appendFileSync(state + '.log', JSON.stringify(args) + '\n');
const saved = () => (fs.existsSync(state) ? JSON.parse(fs.readFileSync(state, 'utf8')) : { CasaMia: 'ok' });
const key = args.join(' ');
const out = (s = '') => { process.stdout.write(s); process.exit(0); };
if (key.startsWith('-t -f DEVICE,TYPE,STATE,CONNECTION device')) out('wlan0:wifi:connected:CasaMia\neth0:ethernet:connected:Wired connection 1\n');
if (key.startsWith('-t -f NAME,TYPE connection show')) out(Object.keys(saved()).map((n) => `${n.replace(/:/g, '\\:')}:802-11-wireless`).join('\n') + '\nWired connection 1:802-3-ethernet\n');
if (key.startsWith('-t -f IN-USE,SSID,SIGNAL,SECURITY')) out('*:CasaMia:80:WPA2\n :Vecino\\:5G:45:WPA2\n :Abierta:30:\n');
if (args[0] === 'connection' && args[1] === 'add') {
  const s = saved();
  s[args[args.indexOf('con-name') + 1]] = args[args.indexOf('wifi-sec.psk') + 1] ?? '';
  fs.writeFileSync(state, JSON.stringify(s));
  out();
}
if (args[0] === 'connection' && args[1] === 'delete') {
  const s = saved();
  delete s[args[3]];
  fs.writeFileSync(state, JSON.stringify(s));
  out();
}
if (key.startsWith('-w 30 connection up')) {
  if (saved()[args[5]] === 'mala-clave-1') { process.stderr.write('Error: Connection activation failed: (7) Secrets were required, but not provided.\n'); process.exit(4); }
  out();
}
process.exit(0);
