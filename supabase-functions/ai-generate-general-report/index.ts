// Edge Function: ai-generate-general-report
// Toma los informes mensuales de todos los docentes y redacta UN solo
// informe general consolidado (no es concatenar, es sintetizar).
// Requiere JWT de un admin autenticado.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const GROQ_MODEL = 'openai/gpt-oss-20b';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

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
    const { month, year } = await req.json();
    if (!month || !year) return json({ error: 'month y year requeridos' }, 400);

    // RLS decide si este usuario (debe ser admin/staff) puede leer los
    // informes de TODOS los docentes -- si no es admin, esto devuelve solo
    // lo que RLS le permita (o nada).
    const { data: reports, error: repErr } = await userClient
      .from('teacher_monthly_reports')
      .select('*, teachers(full_name)')
      .eq('month', month)
      .eq('year', year);
    if (repErr) return json({ error: repErr.message }, 500);
    if (!reports?.length) return json({ error: 'No hay informes de ese mes' }, 400);

    const reportsText = reports.map((r: any, i: number) => `
--- Informe ${i + 1}: ${r.teachers?.full_name || 'Docente'} ---
Resultados: ${r.results_intro || ''} ${(r.results || []).join('; ')}
Inconvenientes: ${r.inconveniences || ''}
Acciones: ${r.actions || ''}
Conclusión: ${r.conclusion || ''}`).join('\n');

    const system = `Eres un asistente que redacta informes institucionales para un programa educativo de
Aulas Técnicas y Tecnológicas (ATT). Vas a recibir los informes mensuales individuales de
varios docentes y debes REDACTAR UN SOLO INFORME GENERAL que sintetice todo -- no es
copiar y pegar cada informe, es escribir un texto cohesivo que combine, agrupe temas
repetidos y resuma en tono profesional. Responde ÚNICAMENTE con JSON válido, sin texto
adicional, con esta forma exacta:
{"introduccion":"...", "resultados":"...", "inconvenientes":"...", "acciones":"...", "conclusion":"..."}`;

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
          { role: 'user', content: reportsText.slice(0, 12000) },
        ],
        max_tokens: 1200,
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

    return json({
      introduccion: String(parsed.introduccion || ''),
      resultados: String(parsed.resultados || ''),
      inconvenientes: String(parsed.inconvenientes || ''),
      acciones: String(parsed.acciones || ''),
      conclusion: String(parsed.conclusion || ''),
      teacherCount: reports.length,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
