// Edge Function: ai-generate-quiz
// Genera preguntas de opcion multiple para un Desafio 1v1 entre estudiantes.
// Guarda las preguntas en student_duels usando la service role (asi el
// alumno que las pide no puede inspeccionar la llamada para ver las
// respuestas correctas antes de jugar -- solo se guardan en la fila del duelo).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const GROQ_MODEL = 'openai/gpt-oss-20b';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
  const token = authHeader.replace('Bearer ', '');

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Invalid token' }, 401);

  try {
    const { duel_id } = await req.json();
    if (!duel_id) return json({ error: 'duel_id requerido' }, 400);

    // La columna "questions" ya no es legible por el cliente (RLS/columnas
    // -- ver migrations/duel-harden.sql), así que acá se lee con service
    // role y se valida el permiso a mano en vez de confiar en RLS.
    const serviceClientRead = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data: duel, error: duelErr } = await serviceClientRead
      .from('student_duels')
      .select('id, topic, question_count, questions, challenger_id, opponent_id')
      .eq('id', duel_id)
      .single();
    if (duelErr || !duel) return json({ error: 'No se pudo leer el duelo (¿permisos?)' }, 403);
    if (user.id !== duel.challenger_id && user.id !== duel.opponent_id) return json({ error: 'No autorizado' }, 403);
    if (duel.questions) return json({ ok: true }); // ya generado, no regenerar

    const n = Math.min(15, Math.max(1, duel.question_count || 5));
    const system = `Genera un quiz de opción múltiple en español sobre el tema indicado, nivel
estudiantes de educacion basica/diversificado en Guatemala. Exactamente ${n} preguntas,
4 opciones cada una, solo UNA correcta. Responde ÚNICAMENTE con JSON válido,
sin texto adicional, con esta forma exacta:
{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0}]}`;

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
          { role: 'user', content: `Tema: ${String(duel.topic).slice(0, 200)}` },
        ],
        max_tokens: 1500,
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await res.json();
    if (data.error) return json({ error: data.error.message }, 500);

    let parsed;
    try {
      parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    } catch {
      return json({ error: 'La IA devolvió una respuesta no válida' }, 500);
    }

    const questions = (parsed.questions || []).slice(0, n).map((q: any) => ({
      question: String(q.question || ''),
      options: Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [],
      correctIndex: Math.min(3, Math.max(0, parseInt(q.correctIndex) || 0)),
    })).filter((q: any) => q.question && q.options.length === 4);

    if (!questions.length) return json({ error: 'La IA no generó preguntas válidas' }, 500);

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { error: updateErr } = await serviceClient
      .from('student_duels')
      .update({ questions, status: 'active' })
      .eq('id', duel_id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ ok: true, count: questions.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
