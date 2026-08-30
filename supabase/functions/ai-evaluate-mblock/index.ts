// Edge Function: ai-evaluate-mblock
// El docente sube una captura del código en bloques (mBlock/Scratch) que le
// compartió el estudiante, o directamente el archivo .mblock del proyecto,
// junto a una rúbrica corta (una línea por criterio). La IA da una nota
// 0-100 + feedback por criterio. No persiste nada -- el cliente guarda el
// resultado en ai_code_evaluations con su propio JWT (RLS decide si puede).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
// Modelo con visión de Groq -- si Groq deja de ofrecer este modelo, cambiar
// acá (el flujo de .mblock no necesita visión, solo el de capturas).
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const GROQ_TEXT_MODEL = 'openai/gpt-oss-20b';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

// Antes Access-Control-Allow-Origin: '*' -- cualquier sitio podía llamar
// esta función desde el navegador de un usuario logueado. Se restringe a
// los dominios reales donde corre la app (GitHub Pages + dominio propio).
const ALLOWED_ORIGINS = new Set([
  'https://clases.yoaprendo.online',
  'https://billiog.github.io',
]);

const RESULT_FORMAT = `Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:
{"score": N (0-100), "feedback": "comentario general en español, máx 3 frases", "criteria_feedback": [{"criterion": "...", "met": true|false, "comment": "..."}]}`;

// Extrae un resumen textual de los bloques usados en un proyecto .mblock
// (es un .zip con project.json adentro, formato mBlock 5 / estilo Scratch).
// No reconstruye el flujo completo del programa -- cuenta qué tipos de
// bloque (opcode) aparecen y cuántas veces, suficiente señal para que la IA
// juzgue contra una rúbrica tipo "usa loops", "usa variables", etc.
async function summarizeMblockFile(base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const zip = await JSZip.loadAsync(bytes);
  const projectFile = zip.file('project.json') || Object.values(zip.files).find(f => f.name.endsWith('project.json'));
  if (!projectFile) throw new Error('El archivo .mblock no tiene project.json -- ¿es un archivo válido?');

  const projectJson = JSON.parse(await projectFile.async('string'));
  const opcodeCounts: Record<string, number> = {};
  let spriteCount = 0;

  const targets = projectJson.targets || [projectJson];
  for (const target of targets) {
    if (target.blocks) {
      spriteCount++;
      for (const block of Object.values<any>(target.blocks)) {
        if (block && typeof block === 'object' && block.opcode) {
          opcodeCounts[block.opcode] = (opcodeCounts[block.opcode] || 0) + 1;
        }
      }
    }
  }

  const summary = Object.entries(opcodeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([op, count]) => `${op} (x${count})`)
    .join(', ');

  if (!summary) throw new Error('No se encontraron bloques dentro del proyecto');
  return `Proyecto con ${spriteCount} sprite(s)/objeto(s). Bloques usados: ${summary}`;
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
    const { rubric, input_type, image_base64, mblock_base64 } = await req.json();
    const criteriaList: string[] = Array.isArray(rubric) ? rubric.slice(0, 15).map(String) : [];
    const rubricText = criteriaList.length
      ? criteriaList.map((c, i) => `${i + 1}. ${c}`).join('\n')
      : 'Criterio general: calidad y correctitud de la lógica del programa.';

    const system = `Sos un docente de programación por bloques (mBlock/Scratch) evaluando el código
de un estudiante y responde de una manera objetiva y socrática contra esta rúbrica:
${rubricText}

Evaluá qué tan bien cumple el código cada criterio. ${RESULT_FORMAT}`;

    let summary = '';
    if (input_type === 'mblock_file') {
      if (!mblock_base64) return json({ error: 'mblock_base64 requerido' }, 400);
      summary = await summarizeMblockFile(mblock_base64);
    } else if (!image_base64) {
      return json({ error: 'image_base64 requerido' }, 400);
    }

    const callGroq = () => input_type === 'mblock_file'
      ? fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_TEXT_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: summary },
          ],
          max_tokens: 700,
          temperature: 0.4,
          response_format: { type: 'json_object' },
        }),
      })
      : fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_VISION_MODEL,
          messages: [
            { role: 'system', content: system },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Esta es la captura del código en bloques del estudiante:' },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
              ],
            },
          ],
          max_tokens: 700,
          temperature: 0.4,
          response_format: { type: 'json_object' },
        }),
      });

    // Groq a veces rechaza su propia salida en modo JSON estricto -- es
    // intermitente, no depende del contenido. Reintentar 1 vez evita que
    // el docente tenga que volver a evaluar a mano.
    let data: any, parsed: any;
    let lastError = 'La IA no generó una respuesta válida';
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await callGroq();
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

    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    const feedback = String(parsed.feedback || '').slice(0, 1000);
    const criteria_feedback = Array.isArray(parsed.criteria_feedback)
      ? parsed.criteria_feedback.slice(0, 15).map((c: any) => ({
        criterion: String(c.criterion || '').slice(0, 200),
        met: !!c.met,
        comment: String(c.comment || '').slice(0, 300),
      }))
      : [];

    return json({ score, feedback, criteria_feedback });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
