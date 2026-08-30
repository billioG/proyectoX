// Edge Function: submit-event-answer
// El alumno manda sus respuestas del evento sorpresa. El score se calcula
// EN SERVIDOR contra las respuestas correctas reales (el cliente nunca
// tuvo correctIndex -- ver get-event-questions) y se guarda el tiempo que
// tardó en responder desde que se unió al evento.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Antes Access-Control-Allow-Origin: '*' -- cualquier sitio podía llamar
// esta función desde el navegador de un usuario logueado. Se restringe a
// los dominios reales donde corre la app (GitHub Pages + dominio propio).
const ALLOWED_ORIGINS = new Set([
  'https://clases.yoaprendo.online',
  'https://billiog.github.io',
]);

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
  const token = authHeader.replace('Bearer ', '');

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Invalid token' }, 401);

  try {
    const { event_id, answers } = await req.json();
    if (!event_id || !Array.isArray(answers)) return json({ error: 'event_id y answers requeridos' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const { data: event, error: eventErr } = await admin.from('random_events').select('*').eq('id', event_id).single();
    if (eventErr || !event) return json({ error: 'Evento no encontrado' }, 404);
    if (event.status !== 'active') return json({ error: 'Este evento ya no está activo' }, 400);

    const { data: participant, error: partErr } = await admin
      .from('event_participants')
      .select('*')
      .eq('event_id', event_id)
      .eq('user_id', user.id)
      .single();
    if (partErr || !participant) return json({ error: 'No te uniste a este evento' }, 403);
    if (participant.submitted_at) return json({ error: 'Ya respondiste este evento' }, 400);

    const questions = event.questions || [];
    let score = 0;
    questions.forEach((q: any, i: number) => {
      if (parseInt(answers[i]) === q.correctIndex) score++;
    });

    const timeTakenMs = Math.max(0, Date.now() - new Date(participant.joined_at).getTime());

    const { error: updateErr } = await admin
      .from('event_participants')
      .update({ score, time_taken_ms: timeTakenMs, submitted_at: new Date().toISOString() })
      .eq('id', participant.id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ ok: true, score, total: questions.length });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
