// ¿El servidor tiene salida a internet (a la NUBE de Quetzal)? y sincronizar solo en cuanto la tiene: al conectar el cable al router, o la Wi-Fi, el docente no tiene que pulsar nada.
//  * checkInternet: pide la dirección de la nube (cualquier respuesta HTTP cuenta: se quiere saber si llega), con varios intentos y tiempo suficiente para una Wi-Fi lenta, y si no llega
//    explica por qué en español (sin DNS, sin respuesta, sin salida...), para que el docente sepa qué revisar.
//  * createConnectivity: la revisa cada pocos segundos; al pasar de «sin internet» a «con internet» (o la primera vez que hay) avisa con onOnline, que arranca la sincronización.
export const REASONS = {
  dns: 'No se pudo encontrar la nube (DNS): el router no está dando internet o no responde.',
  timeout: 'La nube no respondió a tiempo: la conexión es muy lenta o no tiene salida a internet.',
  unreachable: 'La red no tiene salida a internet: revisa que el router esté conectado a internet.',
  refused: 'La nube rechazó la conexión.',
  tls: 'No se pudo hacer una conexión segura con la nube: revisa la fecha y hora del servidor.',
  other: 'No se pudo llegar a la nube.',
};

/** Del error de fetch a un motivo en español. */
export function reasonOf(e) {
  const code = String(e?.cause?.code || e?.code || '');
  const name = String(e?.name || '');
  if (name === 'TimeoutError' || name === 'AbortError' || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return REASONS.timeout;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_FAIL') return REASONS.dns;
  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'ENETDOWN') return REASONS.unreachable;
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return REASONS.refused;
  if (/CERT|SSL|TLS|SELF_SIGNED/i.test(code)) return REASONS.tls;
  return REASONS.other;
}

/** @returns { online: boolean, detail: string | null } — null si no hay dirección de la nube configurada. */
export async function checkInternet(cloudUrl, { fetchImpl = fetch, timeoutMs = 8000, tries = 2 } = {}) {
  if (!cloudUrl) return null;
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      await fetchImpl(cloudUrl, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
      return { online: true, detail: null };
    } catch (e) {
      last = e;
    }
  }
  return { online: false, detail: reasonOf(last) };
}

export function createConnectivity({ check, onOnline = () => {}, intervalMs = 15000, minGapMs = 60000, now = Date.now, setIntervalImpl = setInterval } = {}) {
  const state = { online: null, detail: null, checked_at: null };
  let lastTriggerAt = -Infinity;
  let running = false;

  async function tick() {
    if (running) return state; // una revisión a la vez (la Wi-Fi lenta puede tardar más que el intervalo)
    running = true;
    try {
      const r = await check();
      if (r === null) { state.online = null; state.detail = null; state.checked_at = new Date(now()).toISOString(); return state; }
      const was = state.online;
      state.online = r.online;
      state.detail = r.detail ?? null;
      state.checked_at = new Date(now()).toISOString();
      // Se conectó (o es la primera vez que se ve internet): a sincronizar ya, sin esperar al reloj de 10 minutos ni al botón.
      if (r.online && was !== true && now() - lastTriggerAt >= minGapMs) {
        lastTriggerAt = now();
        try { await onOnline(was === false ? 'reconnect' : 'first'); } catch { /* la sincronización informa sus propios errores */ }
      }
    } finally { running = false; }
    return state;
  }

  return {
    tick,
    state,
    start() { const t = setIntervalImpl(tick, intervalMs); t?.unref?.(); tick(); return t; },
  };
}
