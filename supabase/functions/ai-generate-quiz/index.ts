// Edge Function: ai-generate-quiz
// Genera preguntas de opcion multiple para un Desafio 1v1 entre estudiantes.
// Genera DOS juegos de preguntas distintos, uno para cada jugador (asi, sentados
// juntos, uno no le puede copiar al otro ni ver sus respuestas). Tambien genera
// un juego para el modo practica (sin rival).
// Guarda las preguntas en student_duels usando la service role (asi el
// alumno que las pide no puede inspeccionar la llamada para ver las
// respuestas correctas antes de jugar -- solo se guardan en la fila del duelo).

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

type Q = { question: string; options: string[]; correctIndex: number };

// Para comparar "ya salio" ignorando mayusculas, tildes y puntuacion.
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);

// La IA tiende a poner la respuesta correcta casi siempre en las primeras
// posiciones: se mezclan las 4 opciones (Fisher-Yates) y se recalcula
// correctIndex, para que la posicion correcta sea realmente al azar.
function shuffleOptions(q: Q): Q {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    question: q.question,
    options: order.map((k) => q.options[k]),
    correctIndex: order.indexOf(q.correctIndex),
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Valida lo que devolvio la IA y descarta las que ya salieron ("relax" = ultimo
// intento: acepta repetidas antes que dejar al alumno sin juego).
function pickQuestions(raw: any[], need: number, seen: Set<string>, picked: Q[], relax: boolean) {
  for (const q of raw || []) {
    const question = String(q?.question || '').trim();
    const options = Array.isArray(q?.options) ? q.options.slice(0, 4).map((o: unknown) => String(o)) : [];
    if (!question || options.length !== 4 || new Set(options.map(norm)).size !== 4) continue;
    const key = norm(question);
    if (picked.some((p) => norm(p.question) === key)) continue;
    if (!relax && seen.has(key)) continue;
    const correctIndex = Math.min(3, Math.max(0, parseInt(q?.correctIndex) || 0));
    picked.push(shuffleOptions({ question, options, correctIndex }));
    if (picked.length >= need) break;
  }
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
    const body = await req.json();
    const practice = body?.practice === true;
    const duel_id = body?.duel_id;
    if (!practice && !duel_id) return json({ error: 'duel_id requerido' }, 400);

    // La columna "questions" ya no es legible por el cliente (RLS/columnas
    // -- ver migrations/duel-harden.sql), así que acá se lee con service
    // role y se valida el permiso a mano en vez de confiar en RLS.
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    let topic = '';
    let grade = 'educación básica';
    let n = 5;
    let total = 5;
    const seen = new Set<string>();
    const seenText: string[] = [];
    const remember = (qs: any[] | null) => (qs || []).forEach((q: any) => {
      const t = String(q?.question || '');
      if (!t) return;
      seen.add(norm(t));
      if (seenText.length < 40) seenText.push(t.slice(0, 110));
    });

    if (practice) {
      // Práctica solo: un juego para quien lo pide, sin tocar ninguna tabla.
      topic = String(body?.topic || '').slice(0, 200).trim();
      if (!topic) return json({ error: 'topic requerido' }, 400);
      n = Math.min(10, Math.max(3, parseInt(body?.count) || 5));
      total = n;
      (Array.isArray(body?.avoid) ? body.avoid : []).slice(0, 40).forEach((t: unknown) => remember([{ question: String(t) }]));
      const { data: me } = await db.from('students').select('grade').eq('id', user.id).maybeSingle();
      if (me?.grade) grade = me.grade;
    } else {
      const { data: duel, error: duelErr } = await db
        .from('student_duels')
        .select('id, topic, question_count, questions, challenger_id, opponent_id')
        .eq('id', duel_id)
        .single();
      if (duelErr || !duel) return json({ error: 'No se pudo leer el duelo (¿permisos?)' }, 403);
      if (user.id !== duel.challenger_id && user.id !== duel.opponent_id) return json({ error: 'No autorizado' }, 403);
      if (duel.questions) return json({ ok: true }); // ya generado, no regenerar
      topic = duel.topic;
      n = Math.min(15, Math.max(1, duel.question_count || 5));
      total = n * 2; // uno para cada jugador

      // Nivel de dificultad segun el grado de quien retó (challenger) -- se lee
      // server-side (no del cliente) para que no se pueda pedir un grado falso
      // y así preguntas más fáciles/difíciles de lo que corresponde.
      const { data: challenger } = await db.from('students').select('grade').eq('id', duel.challenger_id).maybeSingle();
      if (challenger?.grade) grade = challenger.grade;

      // Preguntas que ya vieron los DOS jugadores (cualquier tema) y las más
      // recientes del tema: no se repiten entre duelos ni con el mismo rival.
      // questions_b puede no existir si todavía no corrieron el SQL.
      const ids = [duel.challenger_id, duel.opponent_id];
      const filter = `challenger_id.in.(${ids.join(',')}),opponent_id.in.(${ids.join(',')})`;
      const r = await db.from('student_duels').select('questions, questions_b').or(filter)
        .not('questions', 'is', null).order('created_at', { ascending: false }).limit(12);
      const rows = r.error
        ? (await db.from('student_duels').select('questions').or(filter)
            .not('questions', 'is', null).order('created_at', { ascending: false }).limit(12)).data
        : r.data;
      (rows || []).forEach((row: any) => { remember(row.questions); remember(row.questions_b); });
      const { data: recent } = await db.from('student_duels')
        .select('questions').eq('topic', topic).not('questions', 'is', null)
        .order('created_at', { ascending: false }).limit(8);
      (recent || []).forEach((row: any) => remember(row.questions));
    }

    // Las preguntas apuntan a las competencias que mide PISA (lectura, matemática
    // y ciencias aplicadas): una situación o texto corto y algo que interpretar,
    // calcular o decidir -- no repetir un dato memorizado.
    const system = `Genera un quiz de opción múltiple en español sobre el tema indicado, para un
estudiante de ${grade} en Guatemala -- ajustá la dificultad y el vocabulario a ese
grado exacto. Exactamente ${total} preguntas, 4 opciones cada una, solo UNA correcta.

ESTILO DE LAS PREGUNTAS (que ejerciten comprensión y razonamiento, no memoria):
- Cada pregunta plantea primero una SITUACIÓN real breve, un texto corto (1 a 3
  oraciones) o un dato/cifra, y después pide interpretarlo, calcularlo, compararlo,
  explicar una causa o decidir qué hacer.
- Evitá las preguntas de pura memoria ("¿Quién descubrió...?", "¿En qué año...?").
- Las 4 opciones tienen que ser plausibles y distintas entre sí.
- Las preguntas no pueden repetirse ni parecerse entre sí.

MUY IMPORTANTE -- exactitud de los datos:
- Usá solo hechos que sepas con certeza. Si dudás de un dato exacto (una fecha,
  un nombre, una cifra), NO lo uses -- elegí otro ángulo del tema que sí domines.
- La opción correcta (correctIndex) tiene que ser una respuesta real y verificable,
  no una opción "razonable" inventada. Nunca generes una pregunta donde ninguna
  de las 4 opciones sea en realidad la correcta.
- Antes de responder, revisá cada pregunta vos mismo: ¿la opción en correctIndex
  es 100% correcta? Si no estás seguro, cambiá la pregunta por una más simple y
  segura en vez de arriesgar un dato dudoso.

Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:
{"questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0}],"fact":"..."}

El campo "fact" es UN dato curioso y educativo sobre el tema (1 o 2 oraciones, máximo
220 caracteres) que le deje un aprendizaje al estudiante. Tiene que ser verdadero y
verificable; si no estás seguro de un dato, escribí en su lugar un consejo práctico
para aprender o recordar este tema.`;

    const angles = ['interpretar un texto corto o un dato', 'resolver una situación de la vida diaria en Guatemala', 'comparar dos opciones con un criterio', 'leer una lista o tabla sencilla y sacar una conclusión', 'explicar una causa o una consecuencia', 'aplicar un concepto a un caso nuevo', 'calcular o estimar con datos reales', 'decidir la mejor acción en un problema'];
    const angle = shuffle(angles).slice(0, 3).join('; ');
    const userMsg = `Tema: ${topic.slice(0, 200)}\nEnfoques sugeridos para esta ronda (mezclalos): ${angle}.`
      + (seenText.length ? `\nEstas preguntas YA salieron, NO las repitas ni las reformules:\n- ${seenText.join('\n- ')}` : '');

    // Groq a veces rechaza su propia salida en modo JSON estricto ("Failed
    // to validate JSON") o el content viene truncado/mal formado -- es
    // intermitente, no depende del tema. Se reintenta hasta 3 veces (el
    // último acepta repetidas antes que dejar al alumno sin juego).
    const picked: Q[] = [];
    let fact = '';
    let lastError = 'La IA no generó una respuesta válida';
    for (let attempt = 1; attempt <= 3 && picked.length < total; attempt++) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
          // 2 juegos de hasta 15 preguntas = hasta 30 preguntas.
          max_tokens: Math.min(9000, 1500 + total * 260),
          reasoning_effort: 'low',
          // Bajado de 0.7 -- menos "creatividad" implica menos hechos
          // inventados/mezclados; la variedad viene del enfoque y las excluidas.
          temperature: 0.4,
          response_format: { type: 'json_object' },
        }),
      });
      const data = await res.json();
      if (data.error) { lastError = data.error.message; continue; }
      try {
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
        pickQuestions(parsed.questions || [], total, seen, picked, attempt === 3);
        if (!fact) fact = String(parsed.fact || '').trim().slice(0, 300);
      } catch {
        lastError = 'La IA devolvió una respuesta no válida';
      }
    }
    if (!picked.length) return json({ error: lastError }, 500);

    if (practice) {
      return json({ ok: true, questions: picked.slice(0, n), fact: fact || null });
    }

    // Retador: las primeras n. Rival: las siguientes n (si no alcanzaron, el
    // rival usa las mismas -- el servidor lo resuelve solo).
    const questions = picked.slice(0, n);
    const questionsB = picked.length >= n * 2 ? picked.slice(n, n * 2) : null;

    const update: Record<string, unknown> = { questions, status: 'active' };
    if (questionsB) update.questions_b = questionsB;
    let { error: updateErr } = await db.from('student_duels').update(update).eq('id', duel_id);
    if (updateErr && questionsB && /questions_b/.test(updateErr.message)) {
      // Todavía no corrieron migrations/duel-per-player-content.sql: se guarda
      // como antes (mismas preguntas para los dos) hasta que lo corran.
      ({ error: updateErr } = await db.from('student_duels')
        .update({ questions, status: 'active' }).eq('id', duel_id));
    }
    if (updateErr) return json({ error: updateErr.message }, 500);

    // Dato para el "¿Sabías que?" del resultado -- solo se entrega después
    // de jugar, vía get_duel_fact (ver migrations/duel-facts.sql).
    if (fact) await db.from('duel_facts').upsert({ game: 'quiz', duel_id, fact });

    return json({ ok: true, count: questions.length, separate: !!questionsB });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
