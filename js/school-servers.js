/**
 * SERVIDOR DE LA ESCUELA (Raspberry) -- el docente o el administrador ve desde la plataforma en línea el estado de los servidores escolares y los manda a sincronizar,
 * sin saber su dirección IP: conecta la Raspberry por cable al router con internet y toca «Sincronizar ahora» desde su computadora.
 * El servidor avisa a la nube cada ~30 s (node_ping) y atiende la petición en su siguiente aviso (migrations/node-remote-sync.sql).
 */
const ONLINE_MS = 90_000; // visto hace menos de esto = «en línea»
let refreshTimer = null;
let fastUntil = 0;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ago(iso) {
  if (!iso) return null;
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'hace unos segundos';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** Estado en palabras sencillas para el docente. */
export function describeNode(n, now = Date.now()) {
  const seen = n.last_seen_at ? new Date(n.last_seen_at).getTime() : null;
  const online = seen !== null && now - seen < ONLINE_MS;
  const st = n.status || {};
  if (!online) {
    return {
      tone: 'off', badge: seen === null ? 'Nunca se ha conectado' : 'Sin conexión',
      detail: seen === null ? 'Conéctalo por cable al router con internet (o a una Wi-Fi) y aparecerá aquí.' : `Se vio ${ago(n.last_seen_at)}. Conéctalo por cable al router con internet.`,
    };
  }
  if (st.syncing) return { tone: 'busy', badge: 'Sincronizando…', detail: st.stage ? `${st.stage}…` : 'Trabajando…' };
  const pending = Number.isInteger(st.pending_changes) ? st.pending_changes : 0;
  const last = n.last_sync_at ? `Última sincronización ${ago(n.last_sync_at)}.` : 'Todavía no ha sincronizado.';
  return { tone: pending > 0 ? 'warn' : 'ok', badge: 'En línea', detail: `${pending > 0 ? `${pending} ${pending === 1 ? 'cambio' : 'cambios'} por subir. ` : 'Todo está al día. '}${last}` };
}

const TONE = { ok: 'text-emerald-500', busy: 'text-blue-500', warn: 'text-amber-500', off: 'text-slate-400' };

function render(container, nodes) {
  if (!nodes.length) {
    container.innerHTML = `
      <div class="glass-card p-8 text-center text-slate-500 dark:text-slate-400">
        <i class="fas fa-server text-3xl mb-3 text-slate-300"></i>
        <p class="font-bold text-sm">Tu escuela todavía no tiene un servidor (Raspberry) registrado.</p>
        <p class="text-xs mt-1">Pídele al administrador que lo registre en «Servidores escolares».</p>
      </div>`;
    return;
  }
  const bySchool = new Map();
  for (const n of nodes) { if (!bySchool.has(n.school_code)) bySchool.set(n.school_code, { name: n.school_name, nodes: [] }); bySchool.get(n.school_code).nodes.push(n); }
  container.innerHTML = [...bySchool.entries()].map(([code, g]) => `
    <section class="glass-card p-5 mb-5">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight"><i class="fas fa-school text-primary mr-2"></i>${esc(g.name)}</h3>
        <button type="button" class="btn-primary-tw h-10 px-5 text-xs uppercase font-bold" data-sync-school="${esc(code)}"><i class="fas fa-rotate"></i> Sincronizar ahora</button>
      </div>
      <div class="space-y-3">
        ${g.nodes.map((n) => {
          const d = describeNode(n);
          const st = n.status || {};
          return `
            <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-bold text-slate-800 dark:text-white truncate"><i class="fas fa-server mr-2 text-slate-400"></i>${esc(n.name)}</p>
                  <p class="text-[0.7rem] font-bold ${TONE[d.tone]}" data-badge>${esc(d.badge)}</p>
                </div>
                ${st.version ? `<span class="text-[0.6rem] font-bold text-slate-400 shrink-0">${esc(st.version)}</span>` : ''}
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-2" data-detail>${esc(d.detail)}</p>
            </div>`;
        }).join('')}
      </div>
    </section>`).join('');
}

async function fetchNodes() {
  const sb = window._supabase;
  if (window.userRole === 'admin') return sb.rpc('get_school_nodes', { p_school: null });
  const { data: assignments, error } = await sb.from('teacher_assignments').select('school_code').eq('teacher_id', window.currentUser.id);
  if (error) return { data: null, error };
  const codes = [...new Set((assignments || []).map((a) => a.school_code))];
  const all = [];
  for (const code of codes) {
    const r = await sb.rpc('get_school_nodes', { p_school: code });
    if (r.error) return r;
    all.push(...(r.data || []));
  }
  return { data: all, error: null };
}

const friendly = (error) => (/get_school_nodes|request_node_sync|schema cache|does not exist|42883|PGRST20|disponible sin internet|fetch/i.test(`${error?.message || ''} ${error?.code || ''}`)
  ? 'Esto se ve desde la plataforma en línea (necesita internet). Si ya estás en línea, pídele al administrador que ejecute la migración «node-remote-sync».'
  : (error?.message || 'No se pudo cargar'));

async function refresh(container) {
  if (!document.body.contains(container)) { clearInterval(refreshTimer); refreshTimer = null; return; }
  const { data, error } = await fetchNodes();
  if (error) { container.innerHTML = `<div class="glass-card p-6 text-sm text-slate-500"><i class="fas fa-cloud-slash mr-2"></i>${esc(friendly(error))}</div>`; return; }
  render(container, data || []);
  container.querySelectorAll('[data-sync-school]').forEach((b) => { b.onclick = () => window.requestSchoolSync(b.dataset.syncSchool, b); });
}

window.requestSchoolSync = async function requestSchoolSync(code, btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Pidiendo…'; }
  try {
    const { data, error } = await window._supabase.rpc('request_node_sync', { p_school: code });
    if (error) throw error;
    window.showToast?.(data > 0
      ? '<i class="fas fa-cloud-arrow-up"></i> Listo: el servidor recibe el pedido en menos de 30 segundos y empieza a sincronizar. Verás el avance aquí.'
      : '<i class="fas fa-circle-info"></i> El pedido ya estaba hecho hace unos segundos. Espera a que el servidor empiece.', 'success');
    fastUntil = Date.now() + 2 * 60_000; // mientras tanto se mira seguido
  } catch (e) {
    window.showToast?.(`<i class="fas fa-circle-xmark"></i> ${esc(friendly(e))}`, 'error');
  } finally {
    const container = document.getElementById('school-servers-container');
    if (container) await refresh(container);
  }
};

window.loadSchoolServers = async function loadSchoolServers() {
  const container = document.getElementById('school-servers-container');
  if (!container) return;
  container.innerHTML = '<div class="text-center text-slate-400 text-xs py-10"><i class="fas fa-spinner fa-spin"></i></div>';
  await refresh(container);
  clearInterval(refreshTimer);
  // Se actualiza solo: cada 10 s, y cada 3 s después de pedir una sincronización.
  let last = 0;
  refreshTimer = setInterval(() => { const gap = Date.now() < fastUntil ? 3000 : 10_000; if (Date.now() - last >= gap) { last = Date.now(); refresh(container); } }, 1000);
};
