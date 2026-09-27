/**
 * SINCRONIZAR NODO POR USB (docente o admin, en una computadora con
 * internet). Lee de la carpeta QUETZAL de la memoria el paquete que dejó
 * la Raspberry (school-node/usb-sync.js), lo sube con node-sync y deja en
 * la misma memoria la respuesta CIFRADA para ese nodo más los archivos de
 * cursos que le faltan. Necesita Chrome o Edge en computadora (acceso a
 * carpetas); sin eso, se puede al menos bajar la respuesta como archivo.
 */

const USB_FOLDER = 'QUETZAL';

function usbModal(inner) {
  document.getElementById('node-usb-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'node-usb-modal';
  modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn';
  modal.innerHTML = `
    <div class="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar p-6 bg-white dark:bg-slate-900 shadow-2xl animate-slideUp">
      <div class="flex justify-between items-start mb-4">
        <h2 class="text-lg font-black uppercase tracking-tight text-slate-800 dark:text-white"><i class="fab fa-usb text-primary mr-2"></i> Sincronizar nodo por USB</h2>
        <button onclick="this.closest('.fixed').remove()" class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500"><i class="fas fa-times"></i></button>
      </div>
      <div id="node-usb-body">${inner}</div>
    </div>`;
  document.body.appendChild(modal);
  return modal.querySelector('#node-usb-body');
}

window.openNodeUsbSync = function openNodeUsbSync() {
  const canPickFolder = typeof window.showDirectoryPicker === 'function';
  usbModal(`
    <ol class="text-sm text-slate-600 dark:text-slate-300 space-y-2 list-decimal pl-5">
      <li>En la escuela, conectá la memoria USB a la Raspberry. Tiene que tener una carpeta llamada <b>QUETZAL</b>. Esperá a que aparezca el archivo <code>estado-….txt</code> que dice <i>"Ya podés sacar la USB"</i>.</li>
      <li>En esta computadora (con internet), conectá la USB y tocá el botón de abajo. Elegí la carpeta <b>QUETZAL</b>.</li>
      <li>Cuando termine, volvé a conectar la USB a la Raspberry: aplica todo sola en menos de un minuto.</li>
    </ol>
    ${canPickFolder ? `
      <button class="btn-primary-tw w-full h-12 mt-5 text-xs uppercase font-bold" onclick="window.runNodeUsbSync()"><i class="fas fa-folder-open"></i> Elegir la carpeta QUETZAL</button>
    ` : `
      <div class="mt-5 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-xs text-amber-700 dark:text-amber-300">
        Este navegador no puede escribir en la USB. Usá <b>Chrome o Edge en una computadora</b> para copiar también los archivos de los cursos.
        Mientras tanto podés subir el avance de los alumnos: elegí el archivo <code>de-la-escuela-….json</code> de la USB.
      </div>
      <input type="file" accept=".json,application/json" class="mt-3 text-sm" onchange="window.runNodeUsbSyncFromFile(this.files[0])">
    `}
    <div id="node-usb-log" class="mt-5 space-y-1 text-xs"></div>`);
};

function logLine(html, tone = 'slate') {
  const box = document.getElementById('node-usb-log');
  if (!box) return null;
  const colors = { slate: 'text-slate-500', ok: 'text-emerald-600', bad: 'text-rose-500' };
  const line = document.createElement('div');
  line.className = colors[tone] || colors.slate;
  line.innerHTML = html;
  box.appendChild(line);
  return line;
}

async function callNodeSync(outbox) {
  const { data: { session } } = await window._supabase.auth.getSession();
  const res = await fetch(`${window.SUPABASE_URL}/functions/v1/node-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}`, apikey: window.SUPABASE_ANON_KEY },
    body: JSON.stringify({ usb: outbox }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `El servidor respondió ${res.status}`);
  return data;
}

async function writeFile(dirHandle, relPath, blobOrText) {
  const parts = relPath.split('/').filter(Boolean);
  let dir = dirHandle;
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
  const fh = await dir.getFileHandle(parts.at(-1), { create: true });
  const w = await fh.createWritable();
  await w.write(blobOrText);
  await w.close();
}

async function existingSize(dirHandle, relPath) {
  try {
    const parts = relPath.split('/').filter(Boolean);
    let dir = dirHandle;
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
    return (await (await dir.getFileHandle(parts.at(-1))).getFile()).size;
  } catch { return -1; }
}

window.runNodeUsbSync = async function runNodeUsbSync() {
  let root;
  try {
    root = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch { return; }
  if (root.name !== USB_FOLDER) {
    try { root = await root.getDirectoryHandle(USB_FOLDER); }
    catch { return logLine(`<i class="fas fa-circle-xmark"></i> Elegí la carpeta <b>${USB_FOLDER}</b> de la USB (o la USB que la contiene).`, 'bad'); }
  }

  const outboxes = [];
  for await (const [name, handle] of root.entries()) {
    if (handle.kind === 'file' && /^de-la-escuela-[0-9a-f]{8}\.json$/.test(name)) outboxes.push({ name, handle });
  }
  if (!outboxes.length) return logLine('<i class="fas fa-circle-xmark"></i> No hay paquetes de la escuela en esta USB. Conectala primero a la Raspberry.', 'bad');

  for (const { name, handle } of outboxes) {
    const id = name.match(/([0-9a-f]{8})\.json$/)[1];
    try {
      const outbox = JSON.parse(await (await handle.getFile()).text());
      logLine(`<i class="fas fa-school"></i> Nodo <b>${window.sanitizeInput(outbox.node?.name || id)}</b>: subiendo ${outbox.push?.completions?.length || 0} avances, ${outbox.push?.pins?.length || 0} PIN y ${outbox.push?.sessions?.length || 0} ingresos...`);
      const reply = await callNodeSync(outbox);
      await writeFile(root, `para-la-escuela-${id}.json`, JSON.stringify({ generated_at: reply.generated_at, node: reply.node, envelope: reply.envelope }));
      logLine(`<i class="fas fa-circle-check"></i> Subido. Nube: ${reply.applied?.completions || 0} avances, ${reply.applied?.pins || 0} PIN, ${reply.applied?.sessions || 0} ingresos.`, 'ok');

      const files = reply.files_to_copy || [];
      const progress = logLine(`<i class="fas fa-download"></i> Archivos de cursos: 0 de ${files.length}`);
      let done = 0, failed = 0;
      for (const f of files) {
        try {
          if (f.size && await existingSize(root, `archivos/${f.path}`) === f.size) { done++; continue; }
          const res = await fetch(reply.storage_base + f.path.split('/').map(encodeURIComponent).join('/'));
          if (!res.ok) throw new Error(String(res.status));
          await writeFile(root, `archivos/${f.path}`, await res.blob());
          done++;
        } catch { failed++; }
        if (progress) progress.innerHTML = `<i class="fas fa-download"></i> Archivos de cursos: ${done} de ${files.length}${failed ? ` (${failed} con error)` : ''}`;
      }
      logLine(failed
        ? `<i class="fas fa-triangle-exclamation"></i> ${failed} archivo(s) no se copiaron. Volvé a sincronizar para reintentar.`
        : '<i class="fas fa-circle-check"></i> Archivos listos.', failed ? 'bad' : 'ok');
    } catch (e) {
      logLine(`<i class="fas fa-circle-xmark"></i> ${window.sanitizeInput(e.message)}`, 'bad');
    }
  }
  logLine('<b>✅ Terminado.</b> Ahora conectá la USB a la Raspberry de la escuela.', 'ok');
};

// Sin acceso a carpetas: sube el avance y descarga la respuesta como archivo
// (hay que copiarla a mano a la carpeta QUETZAL; los archivos de cursos no).
window.runNodeUsbSyncFromFile = async function runNodeUsbSyncFromFile(file) {
  if (!file) return;
  try {
    const outbox = JSON.parse(await file.text());
    const id = (file.name.match(/([0-9a-f]{8})\.json$/) || [])[1] || String(outbox.node?.token_hash || '').slice(0, 8);
    const reply = await callNodeSync(outbox);
    const blob = new Blob([JSON.stringify({ generated_at: reply.generated_at, node: reply.node, envelope: reply.envelope })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `para-la-escuela-${id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    logLine(`<i class="fas fa-circle-check"></i> Avance subido. Copiá el archivo descargado <b>para-la-escuela-${id}.json</b> a la carpeta QUETZAL de la USB.`, 'ok');
  } catch (e) {
    logLine(`<i class="fas fa-circle-xmark"></i> ${window.sanitizeInput(e.message)}`, 'bad');
  }
};
