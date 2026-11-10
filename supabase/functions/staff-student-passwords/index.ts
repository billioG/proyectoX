// Edge Function: staff-student-passwords        ->  Verify JWT: ON
// Muestra/imprime la contraseña de alumnos SIN que exista el texto legible en la base (docs/SEGURIDAD_2026-11.md).
//
//   POST { "action": "reveal", "ids": ["<uuid del alumno>", ...] }      (hasta 200)
//        -> { "passwords": { "<id>": "texto" | null } }
//        Solo devuelve la contraseña de los alumnos que quien llama puede administrar (admin, o docente asignado a su clase,
//        decidido por la base con can_manage_student); los demás vienen en null. La llave de descifrado (PASSWORD_VAULT_KEY) solo existe aquí.
//   POST { "action": "backfill", "batch": 200 }                           (solo admin)
//        -> { "encrypted": n, "pending": m }   cifra las contraseñas que todavía solo existen en texto (fase 2). Repetir hasta pending = 0.
//
// Secretos: PASSWORD_VAULT_KEY (32 bytes en base64:  openssl rand -base64 32). SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY ya existen.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { errorResponse, internalError, jsonResponse } from '../_shared/http.ts';
import { decryptPassword, encryptPassword, importKey, VaultError } from '../_shared/vault.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_IDS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ORIGINS = new Set(['https://clases.yoaprendo.online', 'https://billiog.github.io']);

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const CORS = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://clases.yoaprendo.online',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return errorResponse(405, 'Método no permitido', { headers: CORS });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse(401, 'Inicia sesión', { headers: CORS });
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return errorResponse(401, 'Sesión no válida', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');

    let key: CryptoKey;
    try { key = await importKey(Deno.env.get('PASSWORD_VAULT_KEY')); }
    catch (e) {
      console.error('staff-student-passwords:', (e as Error).message);
      return errorResponse(500, 'La función de contraseñas no está configurada', { code: 'vault_not_configured', headers: CORS });
    }

    if (action === 'reveal') {
      const ids: string[] = Array.isArray(body?.ids) ? [...new Set<string>(body.ids.map(String))] : [];
      if (!ids.length || ids.length > MAX_IDS) return errorResponse(400, `Indica entre 1 y ${MAX_IDS} alumnos`, { headers: CORS });
      if (ids.some((id) => !UUID.test(id))) return errorResponse(400, 'Hay un identificador de alumno no válido', { headers: CORS });

      // La BASE decide a quién puede ver quien llama (can_manage_student): se llama con la sesión de la persona, no con la llave de servicio.
      const { data: blobs, error } = await userClient.rpc('staff_student_password_blobs', { p_ids: ids });
      if (error) {
        if (/PGRST202|42883|does not exist/i.test(`${error.code} ${error.message}`)) {
          return errorResponse(500, 'Falta correr migrations/student-password-hash.sql', { code: 'migration_missing', headers: CORS });
        }
        console.error('staff-student-passwords: rpc', error.message);
        return errorResponse(500, 'No se pudieron leer las contraseñas', { headers: CORS });
      }
      const passwords: Record<string, string | null> = Object.fromEntries(ids.map((id) => [id, null]));
      for (const row of (blobs ?? []) as { id: string; password_enc: string }[]) {
        try { passwords[row.id] = await decryptPassword(row.password_enc, key, row.id); }
        catch (e) { console.error('staff-student-passwords: no se pudo descifrar', row.id, (e as VaultError).message); }
      }
      // Registro de auditoría en los logs de la función: quién pidió ver contraseñas y de cuántos alumnos (nunca las contraseñas).
      console.log(`staff-student-passwords: reveal user=${user.id} pedidos=${ids.length} entregados=${Object.values(passwords).filter((p) => p !== null).length}`);
      return jsonResponse({ passwords }, 200, CORS);
    }

    if (action === 'backfill') {
      const { data: isAdmin } = await userClient.rpc('is_admin');
      if (isAdmin !== true) return errorResponse(403, 'Solo el administrador puede cifrar las contraseñas existentes', { headers: CORS });
      const batch = Math.max(1, Math.min(Number(body?.batch) || 200, 500));
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);
      const { data: rows, error } = await admin.from('students').select('id, password_generated')
        .is('password_enc', null).not('password_generated', 'is', null).neq('password_generated', '').limit(batch);
      if (error) return internalError(error, CORS);
      let encrypted = 0;
      for (const r of rows ?? []) {
        const blob = await encryptPassword(String(r.password_generated), key, r.id);
        const { error: upErr } = await admin.from('students').update({ password_enc: blob }).eq('id', r.id).is('password_enc', null);
        if (!upErr) encrypted++;
      }
      const { count } = await admin.from('students').select('id', { count: 'exact', head: true })
        .is('password_enc', null).not('password_generated', 'is', null).neq('password_generated', '');
      console.log(`staff-student-passwords: backfill user=${user.id} cifradas=${encrypted} pendientes=${count ?? '?'}`);
      return jsonResponse({ encrypted, pending: count ?? 0 }, 200, CORS);
    }

    return errorResponse(400, 'Acción no válida (reveal o backfill)', { headers: CORS });
  } catch (e) {
    return internalError(e, CORS);
  }
});
