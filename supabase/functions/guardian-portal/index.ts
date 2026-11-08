// Edge Function: guardian-portal
// Backend del "Portal de padres" (padres.html). El padre NO tiene cuenta:
// se identifica con el token de su enlace personal (student_guardians.
// portal_token, 32 caracteres al azar). Acciones:
//   info        -> nombre del alumno (solo el primer nombre), escuela y
//                  últimos avisos recibidos.
//   subscribe   -> guarda la suscripción push de este teléfono.
//   unsubscribe -> la borra.
// Verify JWT: OFF (el padre no inicia sesión).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isTokenExpired, rateKey, rateState } from './portal-guard.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_ORIGINS = new Set([
  'https://clases.yoaprendo.online',
  'https://billiog.github.io',
]);

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const CORS = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://clases.yoaprendo.online',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { token, action, subscription, endpoint, accepted } = await req.json();

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // Límite de intentos con enlaces inválidos, por IP (el token es largo y al azar, pero esta función es pública y no pide sesión).
    // Solo cuentan los fallos: un padre con su enlace bueno nunca se bloquea.
    const ip = rateKey((req.headers.get('x-forwarded-for') || '').split(',')[0].trim());
    const now = new Date();
    const { data: rl } = await admin.from('login_rate_limit').select('attempts, window_start').eq('ip', ip).maybeSingle();
    const rate = rateState(rl, now);
    if (rate.blocked) return json({ error: 'Demasiados intentos -- espera unos minutos y vuelve a intentar' }, 429);
    const recordFailure = async () => {
      if (rate.withinWindow && rl) await admin.from('login_rate_limit').update({ attempts: rl.attempts + 1 }).eq('ip', ip);
      else await admin.from('login_rate_limit').upsert({ ip, attempts: 1, window_start: now.toISOString() });
    };

    if (typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) { await recordFailure(); return json({ error: 'Enlace inválido' }, 400); }

    const { data: g } = await admin.from('student_guardians')
      .select('id, name, student_id, consent_status, consent_version, students(full_name, school_code, schools(name))')
      .eq('portal_token', token).maybeSingle();
    if (!g) { await recordFailure(); return json({ error: 'Este enlace ya no es válido. Pídele uno nuevo al docente.' }, 404); }

    // Vencimiento del enlace (migrations/guardian-portal-token.sql). Se lee aparte y sin romper si la columna aún no existe.
    const { data: exp } = await admin.from('student_guardians').select('portal_token_expires_at').eq('id', g.id).maybeSingle();
    if (isTokenExpired(exp?.portal_token_expires_at, now)) return json({ error: 'Este enlace venció. Pídele uno nuevo al docente.' }, 410);

    if (action === 'subscribe') {
      const s = subscription;
      if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth || !/^https:\/\//.test(s.endpoint)) {
        return json({ error: 'Suscripción inválida' }, 400);
      }
      const { count } = await admin.from('guardian_push_subscriptions').select('id', { count: 'exact', head: true }).eq('guardian_id', g.id);
      if ((count || 0) >= 5) return json({ error: 'Ya hay 5 teléfonos con avisos activados para este enlace' }, 400);
      await admin.from('guardian_push_subscriptions').upsert(
        { guardian_id: g.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth },
        { onConflict: 'endpoint' },
      );
      return json({ ok: true });
    }

    // Consentimiento de la política de privacidad (privacidad.html).
    if (action === 'consent') {
      if (typeof accepted !== 'boolean') return json({ error: 'Respuesta inválida' }, 400);
      const { error } = await admin.from('student_guardians').update({
        consent_status: accepted ? 'accepted' : 'declined',
        consent_version: 1,
        consent_at: new Date().toISOString(),
        consent_method: 'portal',
      }).eq('id', g.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === 'unsubscribe') {
      if (typeof endpoint === 'string') await admin.from('guardian_push_subscriptions').delete().eq('guardian_id', g.id).eq('endpoint', endpoint);
      return json({ ok: true });
    }

    const { data: recent } = await admin.from('guardian_notifications')
      .select('message, created_at').eq('guardian_id', g.id).eq('status', 'sent')
      .order('created_at', { ascending: false }).limit(15);
    const st: any = g.students;
    return json({
      guardian: g.name,
      student: String(st?.full_name || '').trim().split(/\s+/)[0] || 'tu hijo/a',
      school: st?.schools?.name || '',
      consent: (g as any).consent_version === 1 ? (g as any).consent_status : null,
      messages: recent || [],
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
