// Sincronización por MEMORIA USB, para escuelas donde el nodo nunca llega
// a tener internet (ni por hotspot).
//
//  1. El docente conecta una USB con una carpeta QUETZAL a la Raspberry.
//     El nodo escribe ahí "de-la-escuela-<id>.json" con lo pendiente de
//     subir (progreso, PIN, ingresos) y qué archivos de cursos ya tiene.
//  2. En cualquier computadora con internet, el docente abre Quetzal LMS →
//     "Sincronizar nodo por USB" y elige esa carpeta. La app sube lo
//     pendiente y deja en la USB "para-la-escuela-<id>.json" y los
//     archivos de cursos que faltan (carpeta archivos/).
//  3. Al volver a conectarla, el nodo aplica todo y avisa en
//     "estado-<id>.txt" cuándo se puede sacar la USB.
//
// Seguridad: la USB nunca lleva el token del nodo (solo su hash, que
// identifica al nodo pero no sirve para autenticarse). Los datos de alumnos
// que vuelven a la escuela vienen CIFRADOS con la llave pública del nodo:
// si la USB se pierde, nadie más los puede leer.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildPush, applyPull } from './sync.js';
import { getMeta, setMeta } from './db.js';

const FOLDER = 'QUETZAL';

// Dónde se montan las USB en Raspberry Pi OS (escritorio: /media/<usuario>/<etiqueta>;
// con la regla udev del README: /media/quetzal-usb).
function findUsbFolders() {
  const roots = ['/media', '/mnt', '/run/media'];
  const found = [];
  const look = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      if (e.name === FOLDER) found.push(full);
      else if (depth > 0) look(full, depth - 1);
    }
  };
  roots.forEach(r => look(r, 2));
  if (process.env.QUETZAL_USB_DIR) found.push(path.join(process.env.QUETZAL_USB_DIR, FOLDER));
  return [...new Set(found)].filter(d => fs.existsSync(d));
}

// Llave del nodo para descifrar lo que llega por USB (se crea una vez).
function nodeKeys(dataDir) {
  const privFile = path.join(dataDir, 'usb-key.pem');
  if (!fs.existsSync(privFile)) {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    fs.writeFileSync(privFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(privFile));
  const publicSpki = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');
  return { privateKey, publicSpki };
}

// Sobre cifrado: AES-256-GCM con la llave cifrada con RSA-OAEP (SHA-256).
function decryptEnvelope(env, privateKey) {
  const aesKey = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(env.key, 'base64'),
  );
  const blob = Buffer.from(env.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.from(env.iv, 'base64'));
  decipher.setAuthTag(blob.subarray(blob.length - 16));
  const plain = Buffer.concat([decipher.update(blob.subarray(0, blob.length - 16)), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

function writeAtomic(file, content) {
  const tmp = file + '.part';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

export function nodeUsbId(config) {
  return crypto.createHash('sha256').update(config.nodeToken || '').digest('hex');
}

// Una pasada: aplica lo que haya llegado y deja lo pendiente para la nube.
// opts.skipIfSame: nada cambió en el nodo desde la última pasada; solo se
// escribe si llegó un paquete nuevo o si la USB todavía no tiene el suyo.
export function runUsbSync(db, config, log = console.log, opts = {}) {
  const folders = findUsbFolders();
  if (!folders.length || !config.nodeToken || config.nodeToken.startsWith('PEGAR')) return false;

  const tokenHash = nodeUsbId(config);
  const shortId = tokenHash.slice(0, 8);
  const { privateKey, publicSpki } = nodeKeys(config.dataDir);
  const contentDir = path.resolve(config.dataDir, 'content');

  for (const dir of folders) {
    const status = [];
    try {
      // 1) Lo que trajo la USB desde la nube.
      const inboxFile = path.join(dir, `para-la-escuela-${shortId}.json`);
      const outboxFile = path.join(dir, `de-la-escuela-${shortId}.json`);
      const inbox = fs.existsSync(inboxFile) ? JSON.parse(fs.readFileSync(inboxFile, 'utf8')) : null;
      const newInbox = !!(inbox?.generated_at && inbox.generated_at !== getMeta(db, 'usb_applied_at'));
      if (opts.skipIfSame && !newInbox && fs.existsSync(outboxFile)) continue;
      if (inbox) {
        if (newInbox) {
          const data = decryptEnvelope(inbox.envelope, privateKey);
          applyPull(db, data, data.pushed || {});

          // Archivos de cursos copiados en la USB.
          const markDone = db.prepare('UPDATE files SET downloaded = 1 WHERE path = ?');
          let copied = 0;
          for (const f of data.files || []) {
            const src = path.resolve(dir, 'archivos', f.path);
            const dest = path.resolve(contentDir, f.path);
            if (!src.startsWith(path.resolve(dir, 'archivos') + path.sep) || !dest.startsWith(contentDir + path.sep)) continue;
            if (!fs.existsSync(src)) continue;
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(src, dest + '.part');
            fs.renameSync(dest + '.part', dest);
            markDone.run(f.path);
            copied++;
          }
          setMeta(db, 'usb_applied_at', inbox.generated_at);
          setMeta(db, 'last_usb_sync_at', new Date().toISOString());
          status.push(`Datos de la nube aplicados (${data.students?.length || 0} alumnos, ${data.courses?.length || 0} cursos, ${copied} archivos).`);
          log(`💾 USB: aplicado paquete del ${inbox.generated_at}, ${copied} archivos copiados.`);
        }
      }

      // 2) Lo pendiente para llevar a la nube.
      const push = buildPush(db);
      const haveFiles = db.prepare('SELECT path, etag FROM files WHERE downloaded = 1').all();
      const outbox = {
        version: 1,
        generated_at: new Date().toISOString(),
        node: { token_hash: tokenHash, name: getMeta(db, 'node_name'), school_code: getMeta(db, 'school_code') },
        public_key: publicSpki,
        push,
        have_files: haveFiles,
      };
      writeAtomic(outboxFile, JSON.stringify(outbox));
      const pending = push.completions.length + push.pins.length + push.sessions.length;
      status.push(`Listo para llevar a la nube: ${push.completions.length} avances, ${push.pins.length} PIN nuevos, ${push.sessions.length} ingresos.`);

      writeAtomic(path.join(dir, `estado-${shortId}.txt`), [
        `Nodo: ${getMeta(db, 'node_name') || 'sin nombre'} (${shortId})`,
        `Fecha: ${new Date().toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}`,
        ...status,
        '',
        '✅ YA PODÉS SACAR LA USB.',
        pending || !getMeta(db, 'usb_applied_at')
          ? 'Llevala a una computadora con internet: Quetzal LMS → "Sincronizar nodo por USB".'
          : 'No hay nada pendiente de subir.',
      ].join('\r\n'));
    } catch (e) {
      log(`⚠️ USB (${dir}): ${e.message}`);
      try {
        writeAtomic(path.join(dir, `estado-${shortId}.txt`),
          `No se pudo sincronizar: ${e.message}\r\nVolvé a generar el paquete desde la computadora con internet.`);
      } catch { /* USB de solo lectura */ }
    }
  }
  return true;
}
