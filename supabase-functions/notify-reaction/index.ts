// Edge Function: notify-reaction
// Manda push al dueño de un proyecto (y a su equipo) cuando alguien reacciona.
// La notificación de la campana la crea un trigger en la base
// (migrations/project-reaction-notifications.sql); esta función solo envía el
// push. Requiere JWT de quien reaccionó: se comprueba que tenga una reacción
// real en ese proyecto, y el push NO incluye su nombre (menores).
// Máximo 1 push cada 10 min por (persona que reacciona, destinatario).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:soporte@quetzallms.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const ALLOWED_ORIGINS = new Set([
  'https://clases.yoaprendo.online',
  'https://billiog.github.io',
]);

const REACTIONS: Record<string, { emoji: string; label: string }> = {
  like: { emoji: '❤️', label: 'Me gusta' },
  excelente: { emoji: '⭐', label: '¡Excelente, A+!' },
  wow: { emoji: '🤩', label: '¡WOW!' },
  destacar: { emoji: '🏅', label: 'Merece destacarse' },
  animo: { emoji: '💪', label: '¡Sigue adelante!' },
};

const PUSH_COOLDOWN_MS = 10 * 60 * 1000;

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

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !caller) return json({ error: 'Invalid token' }, 401);

  try {
    const { project_id } = await req.json();
    if (!Number.isInteger(project_id)) return json({ error: 'project_id (entero) requerido' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const { data: mine } = await admin.from('project_likes')
      .select('reaction').eq('project_id', project_id).eq('user_id', caller.id).maybeSingle();
    const reaction = mine?.reaction ? REACTIONS[mine.reaction] : null;
    if (!reaction) return json({ ok: true, skipped: true });

    const { data: project } = await admin.from('projects').select('title').eq('id', project_id).maybeSingle();
    if (!project) return json({ error: 'Proyecto no encontrado' }, 404);

    // Reclama los destinatarios cuyo último push fue hace más de 10 min.
    const cutoff = new Date(Date.now() - PUSH_COOLDOWN_MS).toISOString();
    const { data: claimed } = await admin.from('project_reaction_notifications')
      .update({ pushed_at: new Date().toISOString() })
      .eq('project_id', project_id).eq('actor_id', caller.id)
      .not('reaction', 'is', null)
      .or(`pushed_at.is.null,pushed_at.lt.${cutoff}`)
      .select('user_id');
    if (!claimed?.length) return json({ ok: true, skipped: true });

    const title = String(project.title || '').slice(0, 60);
    const payload = JSON.stringify({
      title: `${reaction.emoji} Reaccionaron a tu proyecto`,
      body: `Alguien reaccionó con "${reaction.label}" a «${title}»`,
      url: '/',
      target: 'announcements',
    });

    let sent = 0, cleaned = 0;
    for (const { user_id } of claimed) {
      const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', user_id);
      for (const sub of (subs || [])) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
          sent++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('id', sub.id);
            cleaned++;
          }
        }
      }
    }

    return json({ ok: true, sent, cleaned });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
