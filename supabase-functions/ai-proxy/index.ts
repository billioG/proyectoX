// Edge Function: ai-proxy
// Proxy seguro para Groq -- la clave nunca se expone al cliente.
// Requiere JWT de usuario autenticado (no basta la anon key).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_API_KEY   = Deno.env.get('GROQ_API_KEY')!;
const GROQ_MODEL     = 'openai/gpt-oss-20b';
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON   = Deno.env.get('SUPABASE_ANON_KEY')!;

// Límites server-side -- el cliente no puede inflar el costo
const MAX_TOKENS_CAP = 300;
const MAX_PROMPT_CHARS = 2000;
const MAX_CONTEXT_CHARS = 500;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // Verificar JWT del usuario autenticado
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Invalid token' }, 401);

  try {
    const { prompt, context = '' } = await req.json();
    if (!prompt || typeof prompt !== 'string') return json({ error: 'prompt requerido' }, 400);

    const safePrompt = prompt.slice(0, MAX_PROMPT_CHARS);
    const safeContext = String(context).slice(0, MAX_CONTEXT_CHARS);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: `Eres "1Bot", la mascota robótica e inteligente de la plataforma educativa ProjectX. Tu objetivo es motivar a estudiantes y docentes de robótica y tecnología. Responde de forma entusiasta, breve y profesional. Contexto actual del usuario: ${safeContext}`,
          },
          { role: 'user', content: safePrompt },
        ],
        max_tokens: MAX_TOKENS_CAP,
        temperature: 0.7,
      }),
    });

    const data = await res.json();
    if (data.error) return json({ error: data.error.message }, 500);
    return json({ content: data.choices?.[0]?.message?.content || '' });

  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
