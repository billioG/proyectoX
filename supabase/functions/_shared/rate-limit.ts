// Límite de frecuencia por usuario para las Edge Functions (lógica pura + la llamada a la base). El contador vive en Postgres
// (migrations/rate-limits.sql, función rate_limit_take); aquí se decide QUÉ tope aplica y QUÉ hacer según lo que responda la base.
// Sin dependencias (ni de Deno ni de http.ts): el exportador de funciones solo copia los módulos que la función importa directamente.
// Se prueba con Node: tests-unit/rate-limit-shared.test.mjs.

export type RateResult = { allowed: boolean; calls: number; remaining: number; retryAfter: number };

/** Entero positivo de una variable de entorno (Edge Functions → Secrets); si no es válido, el valor por defecto. Nunca más de `max`. */
export function parseLimit(raw: string | undefined | null, fallback: number, max = 100000): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/** La base devuelve una fila (o un arreglo con una fila) de rate_limit_take; se normaliza y se valida. */
export function parseTake(data: unknown): RateResult | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.allowed !== 'boolean') return null;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { allowed: r.allowed, calls: num(r.calls), remaining: num(r.remaining), retryAfter: num(r.retry_after) };
}

/**
 * Qué hacer cuando la llamada a la base falla:
 *  - 'missing': la función aún no existe (no se corrió migrations/rate-limits.sql) → se deja pasar y se avisa en los registros,
 *    para que desplegar la función antes que el SQL no rompa nada;
 *  - 'fatal': cualquier otro fallo.
 */
export function classifyRpcError(error: { code?: string; message?: string } | null | undefined): 'ok' | 'missing' | 'fatal' {
  if (!error) return 'ok';
  const text = `${error.code ?? ''} ${error.message ?? ''}`;
  if (/PGRST202|42883|could not find the function|does not exist/i.test(text)) return 'missing';
  return 'fatal';
}

/** Respuesta 429 con el contrato de error de las funciones ({ error, code }) y la cabecera Retry-After. */
export function rateLimitedResponse(retryAfter: number, headers: Record<string, string> = {}, what = 'avisos'): Response {
  const secs = Math.max(1, Math.ceil(retryAfter || 1));
  const wait = secs >= 120 ? `${Math.ceil(secs / 60)} minutos` : `${secs} segundos`;
  return new Response(
    JSON.stringify({ error: `Demasiados ${what} seguidos. Espera ${wait} e inténtalo de nuevo.`, code: 'rate_limited', retry_after: secs }),
    { status: 429, headers: { ...headers, 'Content-Type': 'application/json', 'Retry-After': String(secs) } },
  );
}

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };

/**
 * Cuenta una llamada de `userId` bajo `key` y devuelve la respuesta 429 si ya pasó el tope, o null si puede seguir.
 * `failOpen` (por defecto sí): si la base no responde, se deja pasar para no perder notificaciones legítimas; con `failOpen: false`
 * (lo que cuesta dinero, como los SMS) se devuelve 503.
 */
export async function enforceRate(
  admin: RpcClient,
  userId: string,
  key: string,
  limit: number,
  windowSeconds: number,
  headers: Record<string, string> = {},
  opts: { failOpen?: boolean; what?: string } = {},
): Promise<Response | null> {
  const failOpen = opts.failOpen !== false;
  const { data, error } = await admin.rpc('rate_limit_take', { p_user: userId, p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  const kind = classifyRpcError(error);
  if (kind === 'missing') {
    console.warn(`rate-limit: falta la función rate_limit_take (corre migrations/rate-limits.sql); se deja pasar ${key}`);
    return null;
  }
  const take = kind === 'ok' ? parseTake(data) : null;
  if (!take) {
    console.error(`rate-limit: no se pudo contar ${key}`, error?.message ?? JSON.stringify(data));
    if (failOpen) return null;
    return new Response(JSON.stringify({ error: 'No se pudo verificar el límite de envíos. Intenta de nuevo en un momento.', code: 'rate_unavailable' }),
      { status: 503, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  return take.allowed ? null : rateLimitedResponse(take.retryAfter, headers, opts.what);
}
