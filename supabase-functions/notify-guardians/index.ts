// Edge Function: notify-guardians
// Manda los avisos pendientes a padres de familia (guardian_notifications,
// ver migrations/guardians.sql) que encoló el docente/admin que llama:
//   - push: al teléfono donde el padre activó avisos en padres.html.
//   - sms: a través del celular Android del proyecto con la app
//     "SMS Gateway for Android" (usa el plan de SMS del chip: gratis con
//     SMS ilimitados). Secrets: SMSGATE_USER, SMSGATE_PASS y opcional
//     SMSGATE_URL (por defecto el servidor en la nube de la app).
// Si el push falla (el padre desinstaló o bloqueó) y tiene teléfono, cae a SMS.
// Verify JWT: ON (lo llama el docente logueado).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:soporte@quetzallms.com';
const SMSGATE_USER = Deno.env.get('SMSGATE_USER') || '';
const SMSGATE_PASS = Deno.env.get('SMSGATE_PASS') || '';
const SMSGATE_URL = (Deno.env.get('SMSGATE_URL') || 'https://api.sms-gate.app/3rdparty/v1').replace(/\/$/, '');

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const ALLOWED_ORIGINS = new Set([
  'https://clases.yoaprendo.online',
  'https://billiog.github.io',
]);

// La app del celular aceptó dos formatos según la versión: se prueba el
// actual y, si el servidor no lo reconoce, el anterior.
async function sendSms(phone: string, text: string) {
  if (!SMSGATE_USER || !SMSGATE_PASS) throw new Error('Falta configurar SMSGATE_USER / SMSGATE_PASS');
  const auth = 'Basic ' + btoa(`${SMSGATE_USER}:${SMSGATE_PASS}`);
  const headers = { 'Content-Type': 'application/json', Authorization: auth };
  let res = await fetch(`${SMSGATE_URL}/messages`, {
    method: 'POST', headers,
    body: JSON.stringify({ textMessage: { text }, phoneNumbers: [phone] }),
  });
  if (res.status === 404 || res.status === 400) {
    res = await fetch(`${SMSGATE_URL}/message`, {
      method: 'POST', headers,
      body: JSON.stringify({ message: text, phoneNumbers: [phone] }),
    });
  }
  if (!res.ok) throw new Error(`SMS ${res.status}: ${(await res.text()).slice(0, 150)}`);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const CORS = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://clases.yoaprendo.online',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !caller) return json({ error: 'Invalid token' }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
  const { data: teacher } = await admin.from('teachers').select('id').eq('id', caller.id).maybeSingle();
  if (!teacher) return json({ error: 'Solo docentes o administradores' }, 403);

  const { data: pending } = await admin.from('guardian_notifications')
    .select('id, guardian_id, channel, message, student_guardians(phone, sms_enabled)')
    .eq('created_by', caller.id).eq('status', 'pending')
    .order('created_at').limit(300);

  let push = 0, sms = 0, failed = 0;
  for (const n of (pending || []) as any[]) {
    const phone: string | null = n.student_guardians?.phone || null;
    let delivered = false;
    let error = '';

    if (n.channel === 'push') {
      const { data: subs } = await admin.from('guardian_push_subscriptions').select('*').eq('guardian_id', n.guardian_id);
      const payload = JSON.stringify({ title: '📚 Aviso de la escuela', body: n.message.slice(0, 180), url: 'padres.html', target: 'padres' });
      for (const s of subs || []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
          delivered = true;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('guardian_push_subscriptions').delete().eq('id', s.id);
          error = `push ${e?.statusCode || ''}`.trim();
        }
      }
      if (delivered) push++;
    }

    // SMS pedido, o respaldo si el push no llegó a ningún teléfono.
    if (!delivered && phone && (n.channel === 'sms' || n.student_guardians?.sms_enabled !== false)) {
      try {
        await sendSms(phone, `Quetzal LMS: ${n.message}`.slice(0, 320));
        delivered = true;
        sms++;
      } catch (e: any) {
        error = String(e?.message || e);
      }
    }

    if (!delivered) failed++;
    await admin.from('guardian_notifications').update({
      status: delivered ? 'sent' : 'failed',
      error: delivered ? null : (error || 'Sin teléfono ni notificaciones activadas'),
      sent_at: new Date().toISOString(),
    }).eq('id', n.id);
  }

  return json({ ok: true, push, sms, failed });
});
