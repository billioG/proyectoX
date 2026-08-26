// Edge Function: ai-proxy
// Proxy seguro para Groq -- la clave nunca se expone al cliente.
// Requiere JWT de usuario autenticado (no basta la anon key).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_API_KEY   = Deno.env.get('GROQ_API_KEY')!;
const GROQ_MODEL     = 'openai/gpt-oss-20b';
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON   = Deno.env.get('SUPABASE_ANON_KEY')!;

// Límites server-side -- el cliente no puede inflar el costo
const MAX_TOKENS_CAP = 700;
const MAX_PROMPT_CHARS = 2000;
const MAX_CONTEXT_CHARS = 500;
const MAX_HISTORY_TURNS = 10;
const MAX_HISTORY_CHARS = 500;

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
    const { prompt, context = '', short = false, role = '', history = [] } = await req.json();
    if (!prompt || typeof prompt !== 'string') return json({ error: 'prompt requerido' }, 400);

    const safePrompt = prompt.slice(0, MAX_PROMPT_CHARS);
    const safeContext = String(context).slice(0, MAX_CONTEXT_CHARS);
    const isStudent = role === 'estudiante';

    // Historial real del chat -- sin esto cada mensaje era una request
    // aislada sin memoria de lo dicho antes, así que "continuá" generaba
    // algo nuevo sin relación en vez de seguir la idea que quedó a medias.
    const safeHistory = Array.isArray(history)
      ? history.slice(-MAX_HISTORY_TURNS).map((h: any) => ({
          role: h?.role === 'assistant' ? 'assistant' : 'user',
          content: String(h?.content ?? '').slice(0, MAX_HISTORY_CHARS),
        })).filter((h) => h.content)
      : [];

    // El mensaje flotante de la mascota (burbuja chica) usa short=true --
    // antes se generaba un texto normal y se CORTABA a 90 caracteres del
    // lado del cliente, dejando frases a la mitad ("Gracias por..."). Es
    // mejor pedirle a la IA una frase corta y completa desde el inicio
    // que truncar una respuesta larga después.
    //
    // Para estudiantes la mascota es coach EDUCATIVO y EMOCIONAL a la vez:
    // ayuda con dudas de robótica/tecnología pero también valida cómo se
    // siente el estudiante (frustración, ansiedad, orgullo) antes de dar
    // consejos. Docentes/admin mantienen el tono motivador original.
    const systemPrompt = short
      ? (isStudent
          ? `Eres el asistente virtual (quetzal) de Quetzal LMS, coach educativo y emocional de un estudiante. Respondé con UNA sola frase corta y completa (máximo 12 palabras): a veces motivá con tecnología/robótica, a veces preguntá o validá cómo se siente. Nunca cortes la frase a la mitad. Contexto actual del usuario: ${safeContext}`
          : `Eres el asistente virtual (con forma de quetzal) de la plataforma educativa Quetzal LMS. Respondé con UNA sola frase corta y completa (máximo 12 palabras), motivadora, sin cortarla a la mitad. Nunca uses más de una oración. Contexto actual del usuario: ${safeContext}`)
      : (isStudent
          ? `Eres el asistente virtual (quetzal) de Quetzal LMS. Con estudiantes actuás como COACH EDUCATIVO Y EMOCIONAL a la vez: ayudás con dudas de robótica/tecnología de forma clara y breve, pero también preguntás cómo se siente, validás sus emociones (frustración, estrés, orgullo) antes de aconsejar, y celebrás sus logros. Sé cálido, cercano, breve y profesional -- nunca reemplazás ayuda profesional real, si detectás una situación seria sugerí hablar con un adulto de confianza. Si la respuesta es larga, priorizá completar la idea aunque sea más breve -- nunca la cortes a la mitad de una oración. Contexto actual del usuario: ${safeContext}`
          : `Eres el asistente virtual (con forma de quetzal) de la plataforma educativa Quetzal LMS. Tu objetivo es motivar a estudiantes y docentes de robótica y tecnología. Responde de forma entusiasta, breve y profesional. Si la respuesta es larga, priorizá completar la idea aunque sea más breve -- nunca la cortes a la mitad de una oración. Contexto actual del usuario: ${safeContext}`);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...(short ? [] : safeHistory),
          { role: 'user', content: safePrompt },
        ],
        max_tokens: short ? 40 : MAX_TOKENS_CAP,
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
