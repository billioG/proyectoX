// Edge Function: notify-rock-pending
// Manda push al admin cuando un docente completa una tarea (rock) con
// evidencia que queda en approval_status='pending'. Requiere JWT del
// docente real que acaba de completar la tarea -- el service role solo se
// usa para leer push_subscriptions role='admin', nunca para escribir nada
// fuera de limpiar suscripciones muertas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:soporte@quetzallms.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !caller) return json({ error: 'Invalid token' }, 401);

  try {
    const { completion_id } = await req.json();
    if (!completion_id) return json({ error: 'completion_id requerido' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data: completion } = await admin.from('teacher_rock_completions')
      .select('teacher_id, approval_status, teacher_rocks(name), teachers(full_name)')
      .eq('id', completion_id).maybeSingle();
    if (!completion) return json({ error: 'Completación no encontrada' }, 404);

    // Solo el docente dueño de esta completación puede disparar su propia notificación.
    if (caller.id !== completion.teacher_id) return json({ error: 'No autorizado para esta tarea' }, 403);
    if (completion.approval_status !== 'pending') return json({ ok: true, skipped: 'no requiere aprobación' });

    const teacherName = (Array.isArray(completion.teachers) ? completion.teachers[0] : completion.teachers)?.full_name || 'Un docente';
    const rockTitle = (Array.isArray(completion.teacher_rocks) ? completion.teacher_rocks[0] : completion.teacher_rocks)?.name || 'una tarea';

    const payload = {
      title: '📋 Tarea pendiente de aprobación',
      body: `${teacherName} completó "${rockTitle}" y subió evidencia -- requiere tu aprobación`,
    };

    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('role', 'admin');

    let sent = 0, cleaned = 0;
    for (const sub of (subs || [])) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ ...payload, url: '/', target: 'rock-pending' })
        );
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
          cleaned++;
        }
      }
    }

    return json({ ok: true, sent, cleaned });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
