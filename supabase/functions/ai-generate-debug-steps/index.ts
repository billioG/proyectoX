// Edge Function: ai-generate-debug-steps
// Genera una secuencia corta de "bloques" de programación (estilo Scratch,
// mostrados como tarjetas apiladas -- no un editor real) para el desafío
// "Encontrá el Error" 1v1. Exactamente un paso tiene el error. Igual que
// los otros generadores: se guarda con service role para que el alumno no
// pueda inspeccionar la llamada y ver cuál es el error antes de jugar.

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
    const { duel_id } = await req.json();
    if (!duel_id) return json({ error: 'duel_id requerido' }, 400);

    const serviceClientRead = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data: duel, error: duelErr } = await serviceClientRead
      .from('student_debug_duels')
      .select('id, topic, steps, challenger_id, opponent_id')
      .eq('id', duel_id)
      .single();
    if (duelErr || !duel) return json({ error: 'No se pudo leer el desafío (¿permisos?)' }, 403);
    if (user.id !== duel.challenger_id && user.id !== duel.opponent_id) return json({ error: 'No autorizado' }, 403);
    if (duel.steps) return json({ ok: true }); // ya generado, no regenerar

    const { data: challenger } = await serviceClientRead.from('students').select('grade').eq('id', duel.challenger_id).maybeSingle();
    const grade = challenger?.grade || 'educación básica';

    const system = `Armá una secuencia de 5 a 7 "bloques" de un programa simple estilo
Scratch/programación por bloques (ej: "Mover 10 pasos", "Repetir 4 veces", "Si toca el
borde entonces rebotar", "Decir ¡Hola! por 2 segundos"), sobre el tema indicado, para
un estudiante de ${grade} en Guatemala.

EXACTAMENTE UNO de los bloques tiene un error de lógica evidente (ej: un número que no
tiene sentido, una condición invertida, un bloque en el orden equivocado, repetir 0
veces). Los demás bloques tienen que ser perfectamente correctos y coherentes entre sí
-- no generes ambigüedad de cuál es el error.

MUY IMPORTANTE: revisá vos mismo que haya UN SOLO bloque con el error, y que sea
claramente identificable (no una opinión, un error objetivo de lógica/orden/valor).

Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:
{"steps":[{"label":"...","isBug":false,"explanation":""},{"label":"...","isBug":true,"explanation":"por qué está mal"}]}`;

    // Groq a veces rechaza su propia salida en modo JSON estricto, o genera
    // 0/2+ bloques marcados como bug (inválido para el juego) -- ambos
    // casos son intermitentes, no dependen del tema. Reintentar 1 vez evita
    // que el alumno tenga que tocar "generar" de nuevo a mano.
    let data: any, steps: any[] = [];
    let lastError = 'La IA no generó una secuencia válida (probá de nuevo)';
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
            { role: 'user', content: `Tema: ${String(duel.topic).slice(0, 200)}` },
          ],
          max_tokens: 900,
          temperature: 0.4,
          response_format: { type: 'json_object' },
        }),
      });

      data = await res.json();
      if (data.error) { lastError = data.error.message; continue; }

      let parsed;
      try {
        parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      } catch {
        lastError = 'La IA devolvió una respuesta no válida';
        continue;
      }

      const candidateSteps = (parsed.steps || []).slice(0, 10).map((s: any) => ({
        label: String(s.label || '').slice(0, 150),
        isBug: !!s.isBug,
        explanation: String(s.explanation || '').slice(0, 200),
      })).filter((s: any) => s.label);

      // Si la IA marcó 0 o más de 1 bloque como bug, no se puede confiar en
      // el resultado -- mejor reintentar que dejar un desafío sin ganador
      // posible o con más de una respuesta "correcta".
      const bugCount = candidateSteps.filter((s: any) => s.isBug).length;
      if (candidateSteps.length < 3 || bugCount !== 1) continue;

      steps = candidateSteps;
      break;
    }
    if (!steps.length) return json({ error: lastError }, 500);

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { error: updateErr } = await serviceClient
      .from('student_debug_duels')
      .update({ steps, status: 'active' })
      .eq('id', duel_id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
