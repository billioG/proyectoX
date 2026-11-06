// Límite diario de uso de IA por usuario (lógica pura de ai-proxy, probada con Node: tests-unit/ai-proxy-quota.test.mjs).
// El contador vive en la base (migrations/ai-usage-limit.sql, función ai_usage_take); aquí solo se decide QUÉ tope aplica
// y QUÉ hacer según lo que responda la base. Sin dependencias de Deno.

export type QuotaRole = 'student' | 'docente' | 'coordinador' | 'admin' | 'unknown';
export type QuotaBucket = 'chat' | 'short';

/** Preguntas de la persona ('chat') y frases cortas automáticas de la mascota ('short') se cuentan aparte. */
export const DEFAULT_LIMITS: Record<QuotaRole, Record<QuotaBucket, number>> = {
  student: { chat: 30, short: 60 },
  docente: { chat: 100, short: 60 },
  coordinador: { chat: 100, short: 60 },
  admin: { chat: 300, short: 120 },
  // Rol que no se pudo determinar: tope bajo, no ilimitado.
  unknown: { chat: 10, short: 10 },
};

/** Tope máximo que acepta una variable de entorno (un descuido como 99999999 no apaga el límite sin querer). */
export const MAX_CONFIGURED_LIMIT = 5000;

export function bucketFor(short: boolean): QuotaBucket {
  return short ? 'short' : 'chat';
}

/** Número entero 0..MAX_CONFIGURED_LIMIT de una variable de entorno; si no es válido, el valor por defecto. 0 = sin acceso. */
export function parseLimit(raw: string | undefined | null, fallback: number): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0) return fallback;
  return Math.min(n, MAX_CONFIGURED_LIMIT);
}

/** Tope aplicable. Variables: AI_DAILY_STUDENT_CHAT, AI_DAILY_DOCENTE_SHORT, AI_DAILY_ADMIN_CHAT... (Edge Functions → Secrets). */
export function limitFor(role: QuotaRole, bucket: QuotaBucket, env: (name: string) => string | undefined = () => undefined): number {
  const name = `AI_DAILY_${role.toUpperCase()}_${bucket.toUpperCase()}`;
  return parseLimit(env(name), DEFAULT_LIMITS[role][bucket]);
}

export type TeacherRole = string | null | undefined;

/** Rol para el tope: estudiante si hay fila en students; si no, el rol de teachers; si no hay nada, 'unknown'. */
export function quotaRole(isStudent: boolean, teacherRole: TeacherRole): QuotaRole {
  if (isStudent) return 'student';
  if (teacherRole === 'admin') return 'admin';
  if (teacherRole === 'coordinador') return 'coordinador';
  if (teacherRole === 'docente') return 'docente';
  return 'unknown';
}

export type TakeResult = { allowed: boolean; used: number; remaining: number };

/** La base devuelve una fila (o un arreglo con una fila) de ai_usage_take; se normaliza y se valida. */
export function parseTake(data: unknown): TakeResult | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.allowed !== 'boolean') return null;
  const used = Number(r.used);
  const remaining = Number(r.remaining);
  return { allowed: r.allowed, used: Number.isFinite(used) ? used : 0, remaining: Number.isFinite(remaining) ? remaining : 0 };
}

/**
 * Qué hacer cuando la llamada a la base falla:
 *  - 'missing': la función aún no existe (no se corrió migrations/ai-usage-limit.sql) → se deja pasar y se avisa en los registros,
 *    para que desplegar la función antes que el SQL no rompa el asistente;
 *  - 'fatal': cualquier otro fallo → no se llama al modelo (503), porque sin contador no hay tope.
 */
export function classifyRpcError(error: { code?: string; message?: string } | null | undefined): 'ok' | 'missing' | 'fatal' {
  if (!error) return 'ok';
  const text = `${error.code ?? ''} ${error.message ?? ''}`;
  if (/PGRST202|42883|could not find the function|does not exist/i.test(text)) return 'missing';
  return 'fatal';
}

/** Texto para la persona cuando llegó al tope (en español, sin jerga). */
export function limitMessage(role: QuotaRole, bucket: QuotaBucket): string {
  if (bucket === 'short') return 'Límite diario de mensajes automáticos alcanzado';
  return role === 'student'
    ? 'Ya usaste todas tus preguntas de hoy al asistente. Vuelve mañana.'
    : 'Llegaste al límite diario de uso del asistente. Vuelve mañana.';
}
