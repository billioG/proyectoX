// Edge Function: ai-evaluate-project
// Genera una segunda opinión de evaluación (basada en título + descripción
// del proyecto -- la IA no puede ver el video) usando la misma rúbrica que
// usa el docente. Requiere JWT de un usuario docente/admin autenticado.

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

  // Cliente con el JWT del usuario -- RLS decide si puede leer el proyecto
  // (solo docentes/admin tienen select policy sobre projects para evaluar).
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Invalid token' }, 401);

  try {
    const { project_id } = await req.json();
    if (!project_id) return json({ error: 'project_id requerido' }, 400);

    const { data: project, error: projErr } = await userClient
      .from('projects')
      .select('title, description')
      .eq('id', project_id)
      .single();
    if (projErr || !project) return json({ error: 'No se pudo leer el proyecto (¿permisos?)' }, 403);

    const rubric = `Evalúa este proyecto estudiantil de robótica/tecnología SOLO con base en su título y
descripción (no puedes ver el video). Da una nota de 0 a 20 en cada criterio:
- creativity: creatividad e innovación
- clarity: claridad de la presentación/descripción
- functionality: qué tan viable/funcional suena técnicamente
- teamwork: evidencia de trabajo en equipo mencionada
- social_impact: impacto social o utilidad real

Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:
{"creativity":N,"clarity":N,"functionality":N,"teamwork":N,"social_impact":N,"feedback":"comentario breve en español, máx 3 frases"}`;

    // Groq a veces rechaza su propia salida en modo JSON estricto -- es
    // intermitente. Reintentar 1 vez evita que el docente tenga que volver
    // a pedir la segunda opinión a mano.
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
            { role: 'system', content: rubric },
            { role: 'user', content: `Título: ${String(project.title).slice(0, 300)}\nDescripción: ${String(project.description || '').slice(0, 1500)}` },
          ],
          max_tokens: 400,
          temperature: 0.4,
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

    const clamp = (n: unknown) => Math.max(0, Math.min(20, Math.round(Number(n) || 0)));
    const scores = {
      creativity_score: clamp(parsed.creativity),
      clarity_score: clamp(parsed.clarity),
      functionality_score: clamp(parsed.functionality),
      teamwork_score: clamp(parsed.teamwork),
      social_impact_score: clamp(parsed.social_impact),
    };
    const total_score = Object.values(scores).reduce((a, b) => a + b, 0);
    const feedback = String(parsed.feedback || '').slice(0, 1000);

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { error: upsertErr } = await serviceClient.from('ai_evaluations').upsert({
      project_id,
      ...scores,
      total_score,
      feedback,
      model: GROQ_MODEL,
    });
    if (upsertErr) return json({ error: upsertErr.message }, 500);

    return json({ ...scores, total_score, feedback });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
