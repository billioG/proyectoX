// Reglas puras del Portal de padres (sin red ni base de datos, para probarlas con Node): vencimiento del enlace y límite de intentos con enlaces inválidos.
// Las usa guardian-portal/index.ts; migrations/guardian-portal-token.sql crea la columna de vencimiento.

export const TOKEN_RATE_WINDOW_MIN = 15;
export const TOKEN_RATE_MAX_FAILURES = 30;

/** ¿El enlace ya venció? Sin fecha (columna aún no creada o enlace viejo) = no vence, para no dejar fuera a nadie por una migración pendiente. */
export function isTokenExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= now.getTime();
}

export interface RateRow { attempts: number; window_start: string }

/** Estado del contador de fallos de esta IP: si está bloqueada y si la ventana sigue vigente. */
export function rateState(row: RateRow | null | undefined, now: Date = new Date(), windowMin = TOKEN_RATE_WINDOW_MIN, max = TOKEN_RATE_MAX_FAILURES): { withinWindow: boolean; blocked: boolean } {
  if (!row) return { withinWindow: false, blocked: false };
  const start = Date.parse(row.window_start);
  const withinWindow = Number.isFinite(start) && (now.getTime() - start) / 60000 < windowMin;
  return { withinWindow, blocked: withinWindow && row.attempts >= max };
}

/** Clave del contador: separada de la del login (otra tabla de intentos compartiría el contador de toda una escuela detrás de una misma IP). */
export function rateKey(ip: string): string {
  return `gp:${String(ip || 'unknown').slice(0, 64)}`;
}
