// Edge Function: ai-generate-hangman-word
// Genera UNA palabra + pista para el Ahorcado 1v1 entre estudiantes.
// Igual que ai-generate-quiz: se guarda con service role para que el
// alumno no pueda inspeccionar la llamada y ver la palabra antes de jugar.

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

// Sin tildes/ñ/espacios -- el teclado del juego es A-Z simple y la palabra
// tiene que poder adivinarse letra por letra sin casos raros de acentos.
function normalizeWord(w: string): string {
  return w
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

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

    const serviceClientRead = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data: duel, error: duelErr } = await serviceClientRead
      .from('student_hangman_duels')
      .select('id, topic, word, challenger_id, opponent_id')
      .eq('id', duel_id)
      .single();
    if (duelErr || !duel) return json({ error: 'No se pudo leer el desafío (¿permisos?)' }, 403);
    if (user.id !== duel.challenger_id && user.id !== duel.opponent_id) return json({ error: 'No autorizado' }, 403);
    if (duel.word) return json({ ok: true }); // ya generado, no regenerar

    const { data: challenger } = await serviceClientRead.from('students').select('grade').eq('id', duel.challenger_id).maybeSingle();
    const grade = challenger?.grade || 'educación básica';

    const system = `Elegí UNA sola palabra en español relacionada con el tema indicado, apropiada
para un estudiante de ${grade} en Guatemala -- sin tildes ni ñ, entre 4 y 12 letras,
una sola palabra (sin espacios ni guiones). También escribí una pista corta (una
oración) que ayude a adivinarla sin decirla directamente. Responde ÚNICAMENTE con
JSON válido, sin texto adicional, con esta forma exacta:
{"word":"...","hint":"..."}`;

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
        max_tokens: 300,
        temperature: 0.5,
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

    const word = normalizeWord(String(parsed.word || ''));
    const hint = String(parsed.hint || '').slice(0, 200);
    if (word.length < 3 || word.length > 15 || !hint) {
      return json({ error: 'La IA no generó una palabra válida' }, 500);
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { error: updateErr } = await serviceClient
      .from('student_hangman_duels')
      .update({ word, hint, status: 'active' })
      .eq('id', duel_id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
