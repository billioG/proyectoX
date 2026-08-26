// Edge Function: trigger-random-event
// Llamada por pg_cron (vía pg_net) cada minuto. Busca el evento sorpresa
// programado (random_events, status='scheduled') cuya hora ya llegó,
// genera el quiz con IA, lo marca 'active' y manda push real a todos los
// dispositivos suscritos (push_subscriptions). No la llama ningún cliente
// -- se protege con un secreto compartido, no con JWT de usuario.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const GROQ_MODEL = 'openai/gpt-oss-20b';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:soporte@quetzallms.com';
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  const { data: dueEvents, error: dueErr } = await admin
    .from('random_events')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(1);
  if (dueErr) return json({ error: dueErr.message }, 500);
  if (!dueEvents?.length) return json({ ok: true, fired: false });

  const event = dueEvents[0];
  const n = event.question_count;

  try {
    const system = `Genera un quiz de opción múltiple en español sobre "${event.topic}", nivel
estudiantes de educación básica/diversificado en Guatemala. Exactamente ${n} preguntas,
4 opciones cada una, solo UNA correcta. Responde ÚNICAMENTE con JSON válido, sin texto
adicional, con esta forma exacta:
{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0}]}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Tema: ${event.topic}` },
        ],
        max_tokens: 1800,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    let parsed;
    try { parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }

    const questions = (parsed.questions || []).slice(0, n).map((q: any) => ({
      question: String(q.question || ''),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [],
      correctIndex: Math.min(3, Math.max(0, parseInt(q.correctIndex) || 0)),
    })).filter((q: any) => q.question && q.options.length === 4);

    if (!questions.length) throw new Error('La IA no generó preguntas válidas');

    await admin.from('random_events').update({ questions, status: 'active' }).eq('id', event.id);
  } catch (e) {
    // No dejar el evento colgado en "scheduled" para siempre si la IA falla.
    await admin.from('random_events').update({ status: 'completed' }).eq('id', event.id);
    return json({ error: String(e?.message || e) }, 500);
  }

  const { data: subs } = await admin.from('push_subscriptions').select('*');
  const payload = JSON.stringify({
    title: '⚡ Evento Sorpresa Activo',
    body: `¡${event.gem_pool} gemas en juego! Entrá ahora al quiz relámpago de "${event.topic}".`,
    url: '/',
    eventId: event.id,
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

  return json({ ok: true, fired: true, event_id: event.id, sent, cleaned });
});
