/**
 * CACHÉ DE CONSULTAS con vigencia (TTL) y sin consultas repetidas en vuelo.
 *
 * fetchWithCache() era «mostrar lo guardado y SIEMPRE volver a pedirlo al servidor»: ayuda a que la pantalla aparezca rápido, pero no
 * reduce la carga del servidor (cada apertura de una pantalla = las mismas consultas). Esto agrega dos cosas, sin cambiar lo anterior
 * para quien no las pida:
 *   1. { ttlMs }  -- si lo guardado tiene menos de ttlMs de antiguo, se usa SIN consultar al servidor. Es para datos que cambian poco
 *                    (ranking, tableros del administrador, catálogos). Sin ttlMs funciona exactamente como antes.
 *   2. Consultas en vuelo: si dos partes de la app piden la misma clave a la vez, hay UNA sola consulta y las dos reciben el resultado.
 *   3. invalidate(clave | prefijo) -- después de guardar algo que cambia esos datos, la próxima lectura va al servidor aunque el TTL no haya vencido.
 *
 * Es lógica pura (sin DOM ni IndexedDB): la tienda y el reloj se inyectan, por eso se prueba con Node (tests-unit/query-cache.test.mjs).
 */
export function createQueryCache({ readEntry, writeEntry, now = Date.now, warn = () => {} }) {
  const inflight = new Map();   // clave -> Promise del resultado de la red
  const stale = new Set();      // claves invalidadas a mano: la próxima lectura ignora el TTL
  const seen = new Set();       // claves tocadas en esta sesión (para invalidar por prefijo)

  async function fetchWithCache(cacheKey, fetchPromise, onUpdate = null, opts = {}) {
    const ttlMs = Number(opts?.ttlMs) > 0 ? Number(opts.ttlMs) : 0;
    seen.add(cacheKey);

    // 1. Lo guardado en el dispositivo (instantáneo).
    let entry = null;
    try { entry = await readEntry(cacheKey); } catch (e) { warn(`Error leyendo cache para ${cacheKey}:`, e); }
    const cachedData = entry && entry.data !== undefined && entry.data !== null ? entry.data : null;

    // 2. Vigente y nadie lo invalidó: no hace falta la red.
    const age = entry && Number.isFinite(entry.timestamp) ? now() - entry.timestamp : Infinity;
    if (ttlMs && cachedData !== null && age >= 0 && age < ttlMs && !stale.has(cacheKey) && !opts?.force) {
      if (onUpdate) onUpdate(cachedData, false);
      return cachedData;
    }
    if (cachedData !== null && onUpdate) onUpdate(cachedData, true); // viejo: se muestra mientras llega lo nuevo

    // 3. La red, compartida si ya hay una igual en camino.
    let pending = inflight.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        const result = await fetchPromise();
        if (result && result.error) throw result.error;
        const fresh = result && result.data !== undefined ? result.data : result;
        if (fresh) {
          try { await writeEntry(cacheKey, fresh); } catch (e) { warn(`Error guardando cache para ${cacheKey}:`, e); }
        }
        stale.delete(cacheKey);
        return fresh;
      })();
      inflight.set(cacheKey, pending);
      const clear = () => { if (inflight.get(cacheKey) === pending) inflight.delete(cacheKey); };
      pending.then(clear, clear);
    }

    try {
      const fresh = await pending;
      if (onUpdate) onUpdate(fresh, false);
      return fresh;
    } catch (err) {
      warn(`Fallo de red para ${cacheKey}, usando cache si existe:`, err);
      return cachedData;
    }
  }

  /** Marca como vencido lo guardado bajo `keyOrPrefix` (clave exacta o prefijo): la próxima lectura va al servidor. */
  function invalidate(keyOrPrefix) {
    if (!keyOrPrefix) return 0;
    let n = 0;
    for (const k of seen) if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) { stale.add(k); n++; }
    // También la clave exacta aunque esta sesión aún no la haya leído (el dato guardado de una sesión anterior).
    if (!seen.has(keyOrPrefix)) { stale.add(keyOrPrefix); n++; }
    return n;
  }

  return { fetchWithCache, invalidate, _inflight: inflight };
}

/**
 * Coalescedor: «que esto corra una vez aunque lo pidan varios a la vez o muy seguido».
 * El inicio de sesión dispara las mismas comprobaciones (insignias, punto rojo de retos, cartera de gemas) desde 2 o 3 lugares distintos
 * en el mismo segundo; medido con la app real, eran ~20 de las 47 peticiones del inicio de sesión de un estudiante, todas idénticas.
 *   run(clave, fn, { minGapMs })  -- si ya hay una corriendo con esa clave, comparte su resultado; si la última empezó hace menos de
 *                                    minGapMs, no vuelve a correr (devuelve undefined); { force: true } se salta la espera.
 */
export function createCoalescer({ now = Date.now } = {}) {
  const running = new Map();
  const lastStart = new Map();
  function run(key, fn, { minGapMs = 0, force = false } = {}) {
    if (running.has(key)) return running.get(key);
    if (!force && minGapMs > 0 && now() - (lastStart.get(key) ?? -Infinity) < minGapMs) return Promise.resolve(undefined);
    lastStart.set(key, now());
    const p = (async () => fn())().finally(() => { if (running.get(key) === p) running.delete(key); });
    running.set(key, p);
    return p;
  }
  return { run, _running: running };
}
