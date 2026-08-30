// Edge Function: generate-team-match-quiz
// El equipo retado acepta un partido de torneo -> se generan las
// preguntas con IA y se guardan en el partido usando service role (así
// ningún capitán puede inspeccionar la llamada para ver las respuestas
// correctas antes de jugar).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const GROQ_MODEL = 'openai/gpt-oss-20b';
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
    const { match_id } = await req.json();
    if (!match_id) return json({ error: 'match_id requerido' }, 400);

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const { data: match, error: matchErr } = await serviceClient
      .from('tournament_matches')
      .select('id, topic, question_count, questions, team_a_id, team_b_id')
      .eq('id', match_id)
      .single();
    if (matchErr || !match) return json({ error: 'Partido no encontrado' }, 404);

    const { data: teams } = await serviceClient
      .from('tournament_teams')
      .select('id, captain_id')
      .in('id', [match.team_a_id, match.team_b_id]);
    const isCaptain = (teams || []).some((t: any) => t.captain_id === user.id);
    if (!isCaptain) return json({ error: 'No autorizado' }, 403);

    if (match.questions) return json({ ok: true }); // ya generado

    const n = Math.min(15, Math.max(3, match.question_count || 8));
    const system = `Genera un quiz de opción múltiple en español sobre el tema indicado, nivel
estudiantes de educacion basica/diversificado en Guatemala. Exactamente ${n} preguntas,
4 opciones cada una, solo UNA correcta. Responde ÚNICAMENTE con JSON válido,
sin texto adicional, con esta forma exacta:
{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0}]}`;

    // Groq a veces rechaza su propia salida en modo JSON estricto -- es
    // intermitente, no depende del tema. Reintentar 1 vez evita que el
    // capitán tenga que tocar "generar" de nuevo a mano.
    let data: any, parsed: any;
    let lastError = 'La IA no generó una respuesta válida';
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Tema: ${String(match.topic).slice(0, 200)}` },
          ],
          max_tokens: 1800,
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });

      data = await res.json();
      if (data.error) { lastError = data.error.message; continue; }

      try {
        parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
        break;
      } catch {
        lastError = 'La IA devolvió una respuesta no válida';
        parsed = null;
      }
    }
    if (!parsed) return json({ error: lastError }, 500);

    const questions = (parsed.questions || []).slice(0, n).map((q: any) => ({
      question: String(q.question || ''),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [],
      correctIndex: Math.min(3, Math.max(0, parseInt(q.correctIndex) || 0)),
    })).filter((q: any) => q.question && q.options.length === 4);

    if (!questions.length) return json({ error: 'La IA no generó preguntas válidas' }, 500);

    const { error: updateErr } = await serviceClient
      .from('tournament_matches')
      .update({ questions, status: 'active' })
      .eq('id', match_id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ ok: true, count: questions.length });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
