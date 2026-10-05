// Edge Function: ai-generate-quiz  (Comprensión Lectora 1v1)
// Genera, para un reto entre estudiantes, un TEXTO corto y preguntas de opción
// múltiple sobre ese texto -- idea principal, datos explícitos, inferencias,
// vocabulario en contexto y opinión sobre lo leído, que son los niveles de
// comprensión lectora que trabaja PISA. Genera DOS textos distintos, uno para
// cada jugador (así, sentados juntos, uno no le puede copiar al otro ni ver sus
// respuestas). También genera un texto para el modo práctica (sin rival).
// (Antes era un quiz de trivia/programación: el nombre de la función se queda
// igual para no tocar ni la app ni los permisos.)
// Guarda las preguntas en student_duels usando la service role (así el alumno
// que las pide no puede inspeccionar la llamada para ver las respuestas
// correctas antes de jugar -- solo se guardan en la fila del duelo).

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
type Reading = { title: string; passage: string; questions: Q[]; fact: string };

// Para comparar "ya salió" ignorando mayúsculas, tildes y puntuación.
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);

// La IA tiende a poner la respuesta correcta casi siempre en las primeras
// posiciones: se mezclan las 4 opciones (Fisher-Yates) y se recalcula
// correctIndex, para que la posición correcta sea realmente al azar.
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

// Largo del texto según el grado (mismo criterio que getGradeRank en utils.js).
function wordRange(grade: string): [number, number] {
  const g = (grade || '').toLowerCase();
  if (g.includes('primaria')) return /^(1ro|2do|3ro)/.test(g) ? [60, 90] : [100, 150];
  if (g.includes('básico') || g.includes('basico')) return [150, 220];
  if (g.includes('diversificado')) return [220, 300];
  return [100, 150];
}

const TEXT_TYPES = [
  'un texto informativo que explica un tema',
  'un cuento o anécdota corta con personajes',
  'un texto instructivo o práctico (pasos, indicaciones o un aviso para la comunidad)',
  'un texto de opinión donde alguien da razones para defender una idea',
  'una noticia breve o un reporte de la vida diaria',
];

// Valida las preguntas que devolvió la IA (4 opciones distintas, la correcta
// marcada).
function cleanQuestions(raw: any[], n: number): Q[] {
  const out: Q[] = [];
  const seenQ = new Set<string>();
  for (const q of raw || []) {
    const question = String(q?.question || '').trim();
    const options = Array.isArray(q?.options) ? q.options.slice(0, 4).map((o: unknown) => String(o).trim()) : [];
    if (!question || options.length !== 4 || options.some((o) => !o) || new Set(options.map(norm)).size !== 4) continue;
    if (seenQ.has(norm(question))) continue;
    seenQ.add(norm(question));
    const correctIndex = Math.min(3, Math.max(0, parseInt(q?.correctIndex) || 0));
    out.push(shuffleOptions({ question, options, correctIndex }));
    if (out.length >= n) break;
  }
  return out;
}

// Pide a la IA UN texto con sus preguntas. Reintenta hasta 3 veces; el último
// intento acepta un texto ya visto antes que dejar al alumno sin juego.
async function generateReading(args: {
  grade: string; topic: string; n: number; textType: string; seenKeys: Set<string>; seenTitles: string[];
}): Promise<Reading> {
  const { grade, topic, n, textType, seenKeys, seenTitles } = args;
  const [minW, maxW] = wordRange(grade);

  const system = `Eres un docente de Comunicación y Lenguaje de Guatemala. Escribe un TEXTO ORIGINAL y ${n} preguntas de
opción múltiple para medir la comprensión lectora de un estudiante de ${grade}.

EL TEXTO:
- Es ${textType}, sobre el tema indicado, de ${minW} a ${maxW} palabras, con un título corto.
- Lenguaje claro y apropiado para ese grado. Contexto de Guatemala cuando sea natural (no forzado).
- Contenido apropiado para menores: sin violencia, política partidista ni temas sensibles.
- Usa solo hechos que sepas con certeza; si dudas de un dato, no lo uses. Mejor un texto sencillo y correcto.

LAS ${n} PREGUNTAS (mezcla los niveles de comprensión):
- Idea principal o de qué trata el texto.
- Datos explícitos (lo que el texto dice directamente).
- Inferencia (algo que se deduce, aunque no esté escrito tal cual).
- Vocabulario en contexto (qué significa una palabra o expresión del texto por cómo se usa ahí).
- Si hay 5 o más preguntas: una sobre la intención del autor, el propósito o una opinión sobre el texto.
Cada pregunta tiene 4 opciones distintas y plausibles, y solo UNA correcta, que se pueda comprobar con el texto.
Las preguntas se responden con lo que dice el texto, sin necesitar conocimientos externos.

Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:
{"title":"...","passage":"...","questions":[{"question":"...","options":["...","...","...","..."],"correctIndex":0}],"fact":"..."}

El campo "passage" usa saltos de línea (\\n\\n) entre párrafos. El campo "fact" es UN dato curioso y verdadero
sobre el tema (máximo 220 caracteres); si no estás seguro de un dato, escribe un consejo para leer mejor.`;

  const userMsg = `Tema: ${topic.slice(0, 200)}`
    + (seenTitles.length ? `\nEstos textos YA salieron, escribe uno distinto (otro enfoque, otros personajes):\n- ${seenTitles.slice(0, 25).join('\n- ')}` : '');

  let lastError = 'La IA no generó una respuesta válida';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
        // gpt-oss razona antes de responder y eso cuenta contra el límite.
        max_tokens: 1800 + maxW * 2 + n * 220,
        reasoning_effort: 'low',
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });
    const data = await res.json();
    if (data.error) { lastError = data.error.message; continue; }
    try {
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      const title = String(parsed.title || '').trim().slice(0, 100);
      const passage = String(parsed.passage || '').trim();
      const questions = cleanQuestions(parsed.questions || [], n);
      if (!title || passage.length < Math.max(200, minW * 4) || questions.length < Math.max(3, n - 1)) {
        lastError = 'La IA devolvió un texto incompleto';
        continue;
      }
      const seen = seenKeys.has(norm(title)) || seenKeys.has(norm(passage.slice(0, 80)));
      if (seen && attempt < 3) { lastError = 'La IA repitió un texto'; continue; }
      return { title, passage, questions, fact: String(parsed.fact || '').trim().slice(0, 300) };
    } catch {
      lastError = 'La IA devolvió una respuesta no válida';
    }
  }
  throw new Error(lastError);
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

    // La columna "questions" no es legible por el cliente (RLS/columnas -- ver
    // migrations/duel-harden.sql), así que acá se lee con service role y se
    // valida el permiso a mano en vez de confiar en RLS.
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    let topic = '';
    let grade = 'educación básica';
    let n = 5;
    const seenKeys = new Set<string>();
    const seenTitles: string[] = [];
    const remember = (qs: any[] | null) => {
      const q0 = (qs || [])[0];
      if (!q0) return;
      if (q0.title) { seenKeys.add(norm(String(q0.title))); if (seenTitles.length < 30) seenTitles.push(String(q0.title).slice(0, 80)); }
      if (q0.passage) seenKeys.add(norm(String(q0.passage).slice(0, 80)));
    };

    if (practice) {
      // Práctica solo: un texto para quien lo pide, sin tocar ninguna tabla.
      topic = String(body?.topic || '').slice(0, 200).trim();
      if (!topic) return json({ error: 'topic requerido' }, 400);
      n = Math.min(8, Math.max(3, parseInt(body?.count) || 5));
      (Array.isArray(body?.avoid) ? body.avoid : []).slice(0, 40).forEach((t: unknown) => {
        const text = String(t); seenKeys.add(norm(text)); if (seenTitles.length < 30) seenTitles.push(text.slice(0, 80));
      });
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
      n = Math.min(8, Math.max(3, duel.question_count || 5));

      // Nivel según el grado de quien retó -- se lee server-side (no del
      // cliente) para que no se pueda pedir un grado falso.
      const { data: challenger } = await db.from('students').select('grade').eq('id', duel.challenger_id).maybeSingle();
      if (challenger?.grade) grade = challenger.grade;

      // Textos que ya vieron los DOS jugadores (cualquier tema) y los más
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

    const types = shuffle(TEXT_TYPES);

    if (practice) {
      const r = await generateReading({ grade, topic, n, textType: types[0], seenKeys, seenTitles });
      return json({ ok: true, title: r.title, passage: r.passage, questions: r.questions, fact: r.fact || null });
    }

    // Duelo: dos textos de tipos distintos, en paralelo. Si el segundo falla, el
    // rival usa el mismo texto que el retador (el servidor lo resuelve solo).
    const [a, b] = await Promise.all([
      generateReading({ grade, topic, n, textType: types[0], seenKeys, seenTitles }),
      generateReading({ grade, topic, n, textType: types[1], seenKeys, seenTitles }).catch(() => null),
    ]);
    // Cada pregunta lleva su texto (así el RPC get_duel_questions lo entrega
    // sin cambiar la tabla).
    const pack = (r: Reading) => r.questions.map((q) => ({ ...q, title: r.title, passage: r.passage }));
    const questions = pack(a);
    const questionsB = b && norm(b.title) !== norm(a.title) ? pack(b) : null;

    const update: Record<string, unknown> = { questions, status: 'active' };
    if (questionsB) update.questions_b = questionsB;
    let { error: updateErr } = await db.from('student_duels').update(update).eq('id', duel_id);
    if (updateErr && questionsB && /questions_b/.test(updateErr.message)) {
      // Todavía no corrieron migrations/duel-per-player-content.sql: se guarda
      // como antes (mismo texto para los dos) hasta que lo corran.
      ({ error: updateErr } = await db.from('student_duels')
        .update({ questions, status: 'active' }).eq('id', duel_id));
    }
    if (updateErr) return json({ error: updateErr.message }, 500);

    // Dato para el "¿Sabías que?" del resultado -- solo se entrega después
    // de jugar, vía get_duel_fact (ver migrations/duel-facts.sql).
    if (a.fact) await db.from('duel_facts').upsert({ game: 'quiz', duel_id, fact: a.fact });

    return json({ ok: true, count: questions.length, separate: !!questionsB });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
