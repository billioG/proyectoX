// Bitácora de seguridad desde las Edge Functions (migrations/security-audit-log.sql, función log_security_event).
// Las funciones privilegiadas (service role) la usan para dejar constancia de QUIÉN pidió una acción sensible: los triggers de la base no
// la registran cuando no hay sesión, así que esto no duplica nada. Es «mejor esfuerzo»: NUNCA lanza ni cambia lo que la función responde;
// si la migración aún no se corrió, deja un aviso en los registros y sigue. NUNCA pongas contraseñas, tokens ni nombres de menores en `details`
// (la base además quita llaves que parezcan secretos). Sin dependencias: se prueba con Node (tests-unit/audit-shared.test.mjs).

export type AuditEvent = {
  /** Quién la pidió (id de quien llamó a la función; null si no hay). */
  actor: string | null | undefined;
  action: string;
  targetType?: string;
  targetId?: string | null;
  school?: string | null;
  details?: Record<string, unknown>;
  /** Por ejemplo 'edge:admin-delete-students'. */
  source: string;
};

type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };

/** Parámetros del RPC log_security_event (se separa para probarlo). */
export function auditParams(ev: AuditEvent): Record<string, unknown> {
  return {
    p_actor: ev.actor ?? null,
    p_action: ev.action,
    p_target_type: ev.targetType ?? null,
    p_target_id: ev.targetId ?? null,
    p_school: ev.school ?? null,
    p_details: ev.details ?? {},
    p_source: ev.source,
  };
}

/** Registra el evento. Devuelve true si quedó registrado; false si no (y lo avisa en los registros de la función). Nunca lanza. */
export async function logAudit(admin: RpcClient, ev: AuditEvent): Promise<boolean> {
  try {
    const { error } = await admin.rpc('log_security_event', auditParams(ev));
    if (!error) return true;
    const text = `${error.code ?? ''} ${error.message ?? ''}`;
    if (/PGRST202|42883|could not find the function|does not exist/i.test(text)) {
      console.warn(`audit: falta la función log_security_event (corre migrations/security-audit-log.sql); sin registro de ${ev.action}`);
    } else {
      console.error(`audit: no se pudo registrar ${ev.action}:`, error.message);
    }
    return false;
  } catch (e) {
    console.error(`audit: error registrando ${ev.action}:`, String(e));
    return false;
  }
}
