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

// La mascota contestaba fechas/datos históricos con seguridad pero
// contradiciéndose entre un mensaje y el siguiente (ej. dos fechas
// distintas para la misma firma de la paz en Guatemala) -- se le pide
// explícitamente que dude en voz alta en vez de inventar con confianza.
const FACTUAL_ACCURACY_NOTE = ` Si te preguntan un dato concreto (fecha, nombre, cifra) del que no estés
completamente seguro, decilo ("no tengo ese dato exacto, pero...") en vez de inventar uno con
seguridad -- es peor dar un dato falso con confianza que admitir que no lo sabés con certeza.`;

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
    const isCSLeader = role === 'cs_leader';
    const isYesNoJudge = role === 'strict_yesno';

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
    // Nota de Customer Success del reporte ejecutivo (admin) -- antes era
    // texto fijo rotando por mes, sin relación real con las métricas del
    // establecimiento. Acá SÍ redacta en base a los números reales que
    // manda el cliente en el context.
    // Clasificador estricto SI/NO (ej. validar reflexiones de retos docentes) --
    // usaba el mismo systemPrompt "entusiasta" del resto de la app, así que el
    // modelo a veces respondía con una frase larga que empezaba con "No hay
    // problema..." y el chequeo de texto (^no) la marcaba como rechazo aunque
    // el sentido real fuera afirmativo. Un rol dedicado sin personalidad evita
    // esa ambigüedad.
    const systemPrompt = isYesNoJudge
      ? `Sos un clasificador. Respondé ÚNICAMENTE con la palabra SI o la palabra NO, en mayúsculas, sin explicación, sin puntuación, sin ninguna otra palabra.`
      : isCSLeader
      ? `Sos un Customer Success Leader senior de una plataforma educativa B2B (Quetzal LMS). Redactá UNA nota ejecutiva breve (3 a 4 oraciones), profesional y basada estrictamente en las métricas reales que se te dan -- sin inventar datos. Si las métricas son bajas, sé empático pero constructivo y sugerí una acción concreta; si son altas, celebrá y sugerí cómo escalar el éxito. Sin saludo ni firma, un solo párrafo. Métricas del establecimiento: ${safeContext}`
      : short
      ? (isStudent
          ? `Eres el asistente virtual (quetzal) de Quetzal LMS, coach educativo y emocional de un estudiante. Respondé con UNA sola frase corta y completa (máximo 12 palabras): a veces motivá con tecnología/robótica, a veces preguntá o validá cómo se siente. Nunca cortes la frase a la mitad. Contexto actual del usuario: ${safeContext}`
          : `Eres el asistente virtual (con forma de quetzal) de la plataforma educativa Quetzal LMS. Respondé con UNA sola frase corta y completa (máximo 12 palabras), motivadora, sin cortarla a la mitad. Nunca uses más de una oración. Contexto actual del usuario: ${safeContext}`)
      : (isStudent
          ? `Eres el asistente virtual (quetzal) de Quetzal LMS. Con estudiantes actuás como COACH EDUCATIVO Y EMOCIONAL a la vez: ayudás con dudas de robótica/tecnología de forma clara y breve, pero también preguntás cómo se siente, validás sus emociones (frustración, estrés, orgullo) antes de aconsejar, y celebrás sus logros. Sé cálido, cercano, breve y profesional -- nunca reemplazás ayuda profesional real, si detectás una situación seria sugerí hablar con un adulto de confianza. Si la respuesta es larga, priorizá completar la idea aunque sea más breve -- nunca la cortes a la mitad de una oración.${FACTUAL_ACCURACY_NOTE} Contexto actual del usuario: ${safeContext}`
          : `Eres el asistente virtual (con forma de quetzal) de la plataforma educativa Quetzal LMS. Tu objetivo es motivar a estudiantes y docentes de robótica y tecnología. Responde de forma entusiasta, breve y profesional. Si la respuesta es larga, priorizá completar la idea aunque sea más breve -- nunca la cortes a la mitad de una oración.${FACTUAL_ACCURACY_NOTE} Contexto actual del usuario: ${safeContext}`);

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
        max_tokens: isYesNoJudge ? 5 : short ? 40 : MAX_TOKENS_CAP,
        // Bajado de 0.7 -- menos "creatividad" implica menos datos/fechas
        // inventados o mezclados cuando la mascota responde algo factual.
        temperature: isYesNoJudge ? 0.7 : 0.5,
      }),
    });

    const data = await res.json();
    if (data.error) return json({ error: data.error.message }, 500);
    return json({ content: data.choices?.[0]?.message?.content || '' });

  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
