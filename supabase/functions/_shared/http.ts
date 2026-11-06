// Respuestas HTTP estándar de las Edge Functions de Quetzal (ADR-002 en docs/DECISIONES.md).
//
// CONTRATO DE ERROR (el que el navegador y el nodo ya esperan):
//     HTTP 4xx/5xx   con   { "error": "<texto en español para mostrar>" }
//     y, solo si hace falta,   "code": "<identificador estable>"   y/o   "message": "<detalle técnico>"
//   * `error` siempre es un texto corto que se puede mostrar a la persona.
//   * `code` es para que el código del cliente decida (no se traduce, no cambia).
//   * `message` es el detalle técnico (el de la base o la IA); nunca una traza ni un secreto.
//   * El éxito no tiene forma obligatoria (cada función devuelve lo suyo), pero se recomienda `{ ok: true, ... }`.
//
// Uso (despliegue con la CLI):   import { errorResponse, jsonResponse, internalError } from '../_shared/http.ts';
// Para el editor del panel de Supabase usa scripts/exportar-funciones.mjs, que copia este archivo a la carpeta de la
// función y cambia el import a './http.ts'.
//
// Sin dependencias de Deno ni de librerías: se prueba con Node (tests-unit/edge-errors.test.mjs).

export type ErrorBody = { error: string; code?: string; message?: string };
export type ErrorOptions = { code?: string; detail?: string; headers?: Record<string, string> };

export const JSON_HEADERS: Record<string, string> = { 'Content-Type': 'application/json' };

/** Respuesta JSON. `headers` se suma a Content-Type (típicamente los de CORS de la función). */
export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, ...JSON_HEADERS } });
}

/** El cuerpo de un error según el contrato. */
export function errorBody(error: string, opts: Pick<ErrorOptions, 'code' | 'detail'> = {}): ErrorBody {
  const body: ErrorBody = { error: String(error) };
  if (opts.code) body.code = opts.code;
  if (opts.detail) body.message = opts.detail;
  return body;
}

/** Respuesta de error. El estado debe ser 4xx o 5xx (si no, es un descuido del código y se corrige a 500). */
export function errorResponse(status: number, error: string, opts: ErrorOptions = {}): Response {
  const safe = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  return jsonResponse(errorBody(error, opts), safe, opts.headers);
}

/** Texto de cualquier cosa que se haya lanzado (Error, texto, objeto con `message`, nada). Nunca devuelve la traza. */
export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') return (e as { message: string }).message;
  return 'Error desconocido';
}

/** Para el `catch` general de una función: 500 con un texto fijo para la persona y el detalle técnico aparte. */
export function internalError(e: unknown, headers: Record<string, string> = {}, error = 'Error interno'): Response {
  return errorResponse(500, error, { detail: toErrorMessage(e), headers });
}
