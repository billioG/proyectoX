/**
 * AVISO DE SINCRONIZACIÓN -- solo cuando la app corre sobre un nodo escolar con la capa local lista
 * (window.QUETZAL_NODE.rest, ver js/config.js). Muestra cuánto falta por subir a la nube y cuándo fue la última
 * sincronización, y deja pedir una a mano con «Sincronizar ahora». En la nube (GitHub Pages) no existe.
 */
const POLL_MS = 10_000;

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
  if (s.syncing) return { tone: 'busy', text: 'Sincronizando…' };
  if (s.sync_error) return { tone: 'warn', text: 'Sin internet por ahora: todo está guardado y se sube solo' };
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
    #node-sync-chip { position: fixed; left: .75rem; bottom: calc(env(safe-area-inset-bottom, 0px) + .75rem); z-index: 90; display: flex; align-items: center; gap: .5rem;
      padding: .35rem .5rem .35rem .75rem; border-radius: 9999px; font-size: .7rem; font-weight: 700; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
    #node-sync-chip[data-tone="warn"] { background: #fffbeb; color: #b45309; border-color: #fde68a; }
    #node-sync-chip[data-tone="busy"] { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
    #node-sync-chip button { border: 0; border-radius: 9999px; padding: .25rem .6rem; font-size: .65rem; font-weight: 800; background: rgba(0,0,0,.08); color: inherit; cursor: pointer; }
    #node-sync-chip button:disabled { opacity: .5; cursor: default; }
    .dark #node-sync-chip { background: #064e3b; color: #a7f3d0; border-color: #065f46; }
    .dark #node-sync-chip[data-tone="warn"] { background: #78350f; color: #fde68a; border-color: #92400e; }
    .dark #node-sync-chip[data-tone="busy"] { background: #1e3a8a; color: #bfdbfe; border-color: #1e40af; }`;
  document.head.appendChild(style);

  const chip = document.createElement('div');
  chip.id = 'node-sync-chip';
  chip.setAttribute('role', 'status');
  chip.innerHTML = '<span data-text></span><button type="button" data-sync>Sincronizar ahora</button><a href="/wifi" title="Conectar el servidor a una Wi-Fi (docentes)" style="color:inherit;font-size:.65rem;font-weight:800;text-decoration:underline">Wi-Fi</a>';
  document.body.appendChild(chip);
  const text = chip.querySelector('[data-text]');
  const button = chip.querySelector('[data-sync]');

  async function refresh() {
    try {
      const res = await fetch('/api/node/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const s = await res.json();
      const d = describe(s);
      text.textContent = d.text;
      chip.dataset.tone = d.tone;
      button.disabled = !!s.syncing;
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
          if (!s.sync_error) window.showToast?.('<i class="fas fa-cloud-arrow-up"></i> Listo, se sincronizó con la nube', 'success');
          break;
        }
      }
    } finally {
      await refresh();
    }
  });

  refresh();
  setInterval(refresh, POLL_MS);
  window.addEventListener('focus', refresh);
}

if (window.QUETZAL_NODE?.rest === true && !/[?&]modo=pin\b/.test(location.search)) {
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}
