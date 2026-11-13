/**
 * AVISO DE SINCRONIZACIÓN -- solo cuando la app corre sobre un nodo escolar con la capa local lista
 * (window.QUETZAL_NODE.rest, ver js/config.js). Muestra cuánto falta por subir a la nube y cuándo fue la última
 * sincronización, y deja pedir una a mano con «Sincronizar ahora». En la nube (GitHub Pages) no existe.
 * Vive DENTRO de la pantalla «Servidor de la escuela» (window.mountNodeSyncPanel, la llama js/school-servers.js): antes era una barra fija en una
 * esquina que tapaba botones y listas en el celular.
 * Solo para docentes, coordinadores y administradores: un estudiante no sincroniza ni cambia la Wi-Fi del servidor.
 */
const STAFF_ROLES = ['docente', 'coordinador', 'admin'];
export const canSeeSyncChip = (user = window.currentUser, role = window.userRole) => !!user && STAFF_ROLES.includes(role);

const POLL_MS = 10_000;
const POLL_BUSY_MS = 2_000; // mientras sincroniza se mira seguido para mostrar el avance

function ago(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

function describe(s) {
  if (s.syncing) {
    // El servidor detectó internet solo (cable al router o Wi-Fi) o se pidió a mano: el docente ve en qué paso va.
    const why = s.sync_cause === 'reconnect' ? 'Se conectó a internet. ' : '';
    return { tone: 'busy', text: `${why}Sincronizando${s.sync_stage ? `: ${s.sync_stage}` : ''}…` };
  }
  if (s.sync_error) {
    // Sin internet es lo normal en una escuela rural: se dice claro. Otro fallo (la nube rechazó algo...) no se disfraza de «sin internet».
    if (s.internet?.online !== true) return { tone: 'warn', text: 'Sin internet por ahora: todo está guardado y se sube solo' };
    return { tone: 'warn', text: `No se pudo sincronizar: ${s.sync_error}. Todo está guardado y se reintenta.` };
  }
  const rejected = s.pending?.uploads_rejected?.length || 0;
  if (rejected > 0) return { tone: 'warn', text: `La nube rechazó ${rejected} ${rejected === 1 ? 'archivo' : 'archivos'} de tus cursos: ${s.pending.uploads_rejected[0].error}` };
  const files = s.pending?.uploads || 0;
  if (s.pending_changes > 0 || files > 0) {
    const parts = [];
    if (s.pending_changes > 0) parts.push(`${s.pending_changes} ${s.pending_changes === 1 ? 'cambio' : 'cambios'}`);
    if (files > 0) parts.push(`${files} ${files === 1 ? 'archivo' : 'archivos'}`);
    return { tone: 'warn', text: `${parts.join(' y ')} por subir` };
  }
  if (s.last_sync_at) return { tone: 'ok', text: `Sincronizado ${ago(s.last_sync_at)}` };
  return { tone: 'warn', text: 'Aún sin sincronizar' };
}

function start() {
  const style = document.createElement('style');
  style.textContent = `
    #node-sync-chip[hidden] { display: none !important; }
    #node-sync-chip { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .75rem; padding: .6rem .9rem; border-radius: 1rem; font-size: .8rem; font-weight: 700; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    #node-sync-chip [data-text] { flex: 1 1 14rem; }
    #node-sync-chip[data-tone="warn"] { background: #fffbeb; color: #b45309; border-color: #fde68a; }
    #node-sync-chip[data-tone="busy"] { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
    #node-sync-chip button { border: 0; border-radius: 9999px; padding: .4rem .9rem; font-size: .7rem; font-weight: 800; background: rgba(0,0,0,.08); color: inherit; cursor: pointer; }
    #node-sync-chip button:disabled { opacity: .5; cursor: default; }
    .dark #node-sync-chip { background: #064e3b; color: #a7f3d0; border-color: #065f46; }
    .dark #node-sync-chip[data-tone="warn"] { background: #78350f; color: #fde68a; border-color: #92400e; }
    .dark #node-sync-chip[data-tone="busy"] { background: #1e3a8a; color: #bfdbfe; border-color: #1e40af; }`;
  document.head.appendChild(style);

  const chip = document.createElement('div');
  chip.id = 'node-sync-chip';
  chip.setAttribute('role', 'status');
  // La barra NO se agrega a la página: solo existe dentro de «Servidor de la escuela», cuando esa pantalla la monta (mountNodeSyncPanel).
  chip.innerHTML = '<span data-text>Revisando el servidor…</span><button type="button" data-sync>Sincronizar ahora</button><a href="/wifi" title="Conectar el servidor a una Wi-Fi (docentes)" style="color:inherit;font-size:.7rem;font-weight:800;text-decoration:underline">Wi-Fi</a>';
  const text = chip.querySelector('[data-text]');
  const button = chip.querySelector('[data-sync]');
  let lastStatus = null;
  // Tocar el texto de la barra (en el celular no hay «pasar el cursor») dice si hay internet y por qué dirección se abre el servidor ahora: cambia al conectarlo a otra red.
  text.style.cursor = 'pointer';
  text.addEventListener('click', () => {
    const urls = Array.isArray(lastStatus?.urls) ? lastStatus.urls : [];
    const net = lastStatus?.internet?.online === true ? 'El servidor tiene internet.' : lastStatus?.internet?.online === false ? `Sin internet. ${lastStatus.internet.detail || ''}` : '';
    window.showToast?.(`<i class="fas fa-wifi"></i> ${[net, urls.length ? `Abre el servidor en: ${urls.join(' o ')}` : ''].filter(Boolean).join(' ')}`, 'info');
  });
  let wasSyncing = false;
  let busy = false;
  let lastCause = null;

  async function refresh() {
    try {
      const res = await fetch('/api/node/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const s = await res.json();
      lastStatus = s;
      const d = describe(s);
      text.textContent = d.text;
      chip.dataset.tone = d.tone;
      button.disabled = !!s.syncing;
      // Al pasar el cursor: si hay internet o por qué no, y las direcciones por las que se abre el servidor ahora (cambian si se conecta a otra red).
      const net = s.internet?.online === true ? 'Internet: sí.' : s.internet?.online === false ? `Internet: no. ${s.internet.detail || ''}` : '';
      chip.title = [net, Array.isArray(s.urls) && s.urls.length ? `Dirección del servidor: ${s.urls.join('  ·  ')}` : ''].filter(Boolean).join('\n');
      // Un aviso cuando termina una sincronización (también las que arrancó el servidor solo al detectar internet).
      if (wasSyncing && !s.syncing) {
        if (!s.sync_error) window.showToast?.('<i class="fas fa-cloud-arrow-up"></i> Listo, se sincronizó con la nube', 'success');
        else if (lastCause !== 'timer') window.showToast?.(`<i class="fas fa-circle-xmark"></i> ${s.sync_error}`, 'error');
      }
      wasSyncing = !!s.syncing;
      if (s.syncing) lastCause = s.sync_cause;
      busy = !!s.syncing;
      return s;
    } catch {
      text.textContent = 'Sin conexión con el nodo';
      chip.dataset.tone = 'warn';
      return null;
    }
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    text.textContent = 'Sincronizando…';
    chip.dataset.tone = 'busy';
    try {
      const { data } = await window._supabase.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch('/api/sync/now', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { window.showToast?.(`<i class="fas fa-circle-xmark"></i> ${body.error || 'No se pudo sincronizar'}`, 'error'); return refresh(); }
      // Espera a que termine (máximo ~2 min) mirando el estado del nodo.
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const s = await refresh();
        if (s && !s.syncing) {
          break; // el aviso de «Listo» lo da refresh() al ver que terminó

        }
      }
    } finally {
      await refresh();
    }
  });

  // «Servidor de la escuela» (nodo): dibuja la tarjeta con el estado, «Sincronizar ahora» y la Wi-Fi. Solo para docentes y administradores.
  window.mountNodeSyncPanel = (container) => {
    if (!container) return false;
    if (!canSeeSyncChip()) {
      container.innerHTML = '<div class="glass-card p-6 text-sm text-slate-500">Esta pantalla es para docentes y administradores.</div>';
      return false;
    }
    container.innerHTML = `
      <div class="glass-card p-5">
        <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight mb-3"><i class="fas fa-server text-primary mr-2"></i>Este servidor</h3>
        <div data-slot></div>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-3">Cuando el servidor tiene internet se sincroniza solo. Lo que hagas sin internet (asistencia, notas, proyectos) queda guardado y sube en ese momento; en la plataforma en línea aparece cuando termina.</p>
      </div>`;
    container.querySelector('[data-slot]').appendChild(chip);
    refresh();
    return true;
  };

  // Revisión periódica: cada 10 s, y cada 2 s mientras sincroniza. Solo si la tarjeta está a la vista (con otra pantalla abierta no se consulta al nodo).
  const visible = () => chip.isConnected && chip.offsetParent !== null;
  const loop = async () => { if (visible()) await refresh(); setTimeout(loop, busy ? POLL_BUSY_MS : POLL_MS); };
  loop();
  window.addEventListener('focus', () => { if (visible()) refresh(); });
}

if (window.QUETZAL_NODE?.rest === true && !/[?&]modo=pin\b/.test(location.search)) {
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}
