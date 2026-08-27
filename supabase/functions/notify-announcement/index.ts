// Edge Function: notify-announcement
// Manda push real cuando se envía un aviso -- antes los avisos eran
// explícitamente "solo dentro de la app, no usa push" (ver comentario
// original en announcements.js), así que el usuario solo veía el punto
// rojo en la campana si tenía la pestaña abierta en ese momento.
// Requiere JWT del propio remitente del aviso.

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
    const { announcement_id } = await req.json();
    if (!announcement_id) return json({ error: 'announcement_id requerido' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data: ann } = await admin.from('announcements').select('*').eq('id', announcement_id).maybeSingle();
    if (!ann) return json({ error: 'Aviso no encontrado' }, 404);
    if (ann.sender_id !== caller.id) return json({ error: 'No autorizado para este aviso' }, 403);

    let targetUserIds: string[] | null = null;
    let targetRoles: string[] = [];

    if (ann.audience === 'students' && ann.school_code) {
      // Docente -> avisando a SU clase puntual (school_code/grade/section).
      const { data: students } = await admin.from('students').select('id')
        .eq('school_code', ann.school_code).eq('grade', ann.grade).eq('section', ann.section);
      targetUserIds = (students || []).map((s: any) => s.id);
    } else if (ann.audience === 'students') {
      targetRoles = ['estudiante'];
    } else if (ann.audience === 'teachers') {
      targetRoles = ['docente'];
    } else {
      targetRoles = ['estudiante', 'docente'];
    }

    let subsQuery = admin.from('push_subscriptions').select('*');
    subsQuery = targetUserIds ? subsQuery.in('user_id', targetUserIds) : subsQuery.in('role', targetRoles);
    const { data: subs } = await subsQuery;

    const senderLabel = ann.sender_role === 'admin' ? 'Administración' : 'Tu docente';
    const payload = JSON.stringify({
      title: `📢 Nuevo aviso -- ${senderLabel}`,
      body: `${ann.title}: ${String(ann.message || '').slice(0, 120)}`,
      url: '/',
    });

    let sent = 0, cleaned = 0;
    for (const sub of (subs || [])) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
          cleaned++;
        }
      }
    }

    return json({ ok: true, sent, cleaned, targeted: targetUserIds ? targetUserIds.length : subs?.length || 0 });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
