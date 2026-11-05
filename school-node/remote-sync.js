// Sincronizar desde la plataforma en línea: el servidor avisa a la nube cada ~30 s (acción node_ping de node-sync) con su estado (cambios por subir, si está sincronizando, paso, versión,
// direcciones) y la nube le responde si el docente tocó «Sincronizar ahora» en la plataforma (migrations/node-remote-sync.sql). Así el docente no necesita la dirección IP de la Raspberry:
// entra desde su computadora con internet, conecta la Raspberry al router y pide sincronizar. Solo avisa si hay internet (lo decide connectivity.js).
const STALE_MS = 5 * 60 * 1000; // una petición vieja (de cuando el servidor estaba apagado) no dispara una sincronización por sí sola

export function createRemoteSync({ cloudUrl, nodeToken, getStatus, getHandled, setHandled, trySync, isOnline = () => true, fetchImpl = fetch, now = Date.now, timeoutMs = 15000 }) {
  /** Avisa a la nube y devuelve { sync_requested_at, server_time } o null si no se pudo. */
  async function ping() {
    if (!cloudUrl || !nodeToken) return null;
    try {
      const res = await fetchImpl(`${cloudUrl}/functions/v1/node-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-node-token': nodeToken },
        body: JSON.stringify({ action: 'node_ping', status: getStatus() }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null; // sin internet o la nube aún no conoce node_ping (función vieja): se reintenta en el siguiente aviso
    }
  }

  /** Un aviso y, si el docente pidió sincronizar desde la plataforma, la sincronización. @returns 'sin-internet' | 'sin-respuesta' | 'nada' | 'vieja' | 'sincronizando' | 'espera' */
  async function tick() {
    if (isOnline() !== true) return 'sin-internet';
    const r = await ping();
    if (!r) return 'sin-respuesta';
    const requested = Date.parse(r.sync_requested_at);
    if (!Number.isFinite(requested)) return 'nada';
    const handled = Date.parse(getHandled() || '');
    if (Number.isFinite(handled) && requested <= handled) return 'nada';
    const cloudNow = Date.parse(r.server_time);
    if ((Number.isFinite(cloudNow) ? cloudNow : now()) - requested > STALE_MS) { setHandled(r.sync_requested_at); return 'vieja'; }
    const out = await trySync('requested');
    // Si ya estaba sincronizando, la petición queda pendiente: en el siguiente aviso (cuando termine) se atiende.
    if (out?.started) { setHandled(r.sync_requested_at); return 'sincronizando'; }
    return 'espera';
  }

  return { ping, tick };
}
