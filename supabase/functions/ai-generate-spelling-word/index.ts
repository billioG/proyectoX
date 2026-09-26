// Edge Function: ai-generate-spelling-word
// Genera UNA palabra + pista para el Ortografía 1v1 entre estudiantes.
// A diferencia de ai-generate-hangman-word, acá SÍ se conservan tildes/ñ --
// el punto del juego es escribir bien la ortografía, no adivinar letras.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const GROQ_MODEL = 'openai/gpt-oss-20b';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_ORIGINS = new Set([
  'https://clases.yoaprendo.online',
  'https://billiog.github.io',
]);

// Una sola palabra, sin espacios/números/símbolos -- pero SÍ letras
// acentuadas y ñ, porque de eso se trata el juego.
function normalizeWord(w: string): string {
  return w.trim().replace(/[^A-Za-zÀ-ÖØ-öø-ÿñÑ]/g, '');
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
  const token = authHeader.replace('Bearer ', '');

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Invalid token' }, 401);

  try {
    const { duel_id } = await req.json();
    if (!duel_id) return json({ error: 'duel_id requerido' }, 400);

    const serviceClientRead = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data: duel, error: duelErr } = await serviceClientRead
      .from('student_spelling_duels')
      .select('id, topic, word, challenger_id, opponent_id')
      .eq('id', duel_id)
      .single();
    if (duelErr || !duel) return json({ error: 'No se pudo leer el desafío (¿permisos?)' }, 403);
    if (user.id !== duel.challenger_id && user.id !== duel.opponent_id) return json({ error: 'No autorizado' }, 403);
    if (duel.word) return json({ ok: true }); // ya generado, no regenerar

    const { data: challenger } = await serviceClientRead.from('students').select('grade').eq('id', duel.challenger_id).maybeSingle();
    const grade = challenger?.grade || 'educación básica';

    const system = `Elegí UNA sola palabra en español relacionada con el tema indicado, apropiada
para un estudiante de ${grade} en Guatemala, que sea un buen desafío de ORTOGRAFÍA
(con tilde, ñ, b/v, s/c/z, h muda, o alguna dificultad ortográfica típica), entre 4
y 14 letras, una sola palabra (sin espacios ni guiones). También escribí una pista
corta (una oración, SIN mencionar la palabra ni deletrearla) que ayude a saber a qué
palabra se refiere. Responde ÚNICAMENTE con JSON válido, sin texto adicional, con
esta forma exacta:
{"word":"...","hint":"...","fact":"..."}

El campo "fact" es UN dato curioso y educativo sobre la palabra (su origen, una regla
ortográfica que la explica, o un dato del tema), en 1 o 2 oraciones, máximo 220
caracteres. Tiene que ser verdadero y verificable; si no estás seguro de un dato,
escribí en su lugar la regla ortográfica que ayuda a escribirla bien.`;

    // Groq a veces rechaza su propia salida en modo JSON estricto ("Failed
    // to validate JSON") o el content viene truncado/mal formado --
    // intermitente, no depende del tema. Reintentar 1 vez evita que el
    // docente/alumno tenga que volver a intentar a mano.
    let data: any, parsed: any;
    let lastError = 'La IA no generó una respuesta válida';
    // gpt-oss-20b razona antes de responder y ese razonamiento cuenta
    // contra max_tokens -- con 300 el JSON salía cortado y Groq lo
    // rechazaba siempre ("Failed to validate JSON"). Razonamiento bajo +
    // más margen. El último intento va sin modo JSON estricto y extrae el
    // objeto del texto, por si el validador de Groq sigue rechazando.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const strictJson = attempt < 3;
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
          temperature: 0.5,
          reasoning_effort: 'low',
          ...(strictJson ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      data = await res.json();
      if (data.error) { lastError = data.error.message; continue; }

      try {
        const content = data.choices?.[0]?.message?.content || '';
        const match = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(match ? match[0] : content);
        break;
      } catch {
        lastError = 'La IA devolvió una respuesta no válida';
        parsed = null;
      }
    }
    if (!parsed) return json({ error: lastError }, 500);

    const word = normalizeWord(String(parsed.word || ''));
    const hint = String(parsed.hint || '').slice(0, 200);
    if (word.length < 3 || word.length > 15 || !hint) {
      return json({ error: 'La IA no generó una palabra válida' }, 500);
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { error: updateErr } = await serviceClient
      .from('student_spelling_duels')
      .update({ word, hint, status: 'active' })
      .eq('id', duel_id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    // Dato para el "¿Sabías que?" del resultado -- solo se entrega después
    // de jugar, vía get_duel_fact (ver migrations/duel-facts.sql).
    const factText = String(parsed.fact || '').trim().slice(0, 300);
    if (factText) await serviceClient.from('duel_facts').upsert({ game: 'spelling', duel_id, fact: factText });

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
