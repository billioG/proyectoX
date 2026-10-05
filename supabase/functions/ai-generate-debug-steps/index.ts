// Edge Function: ai-generate-debug-steps
// Genera las secuencias de AFIRMACIONES cortas sobre el tema del duelo
// (mostradas como tarjetas apiladas) para el desafío "Encontrá el Error"
// 1v1. Exactamente una afirmación de cada secuencia tiene un dato falso.
// Genera DOS secuencias distintas, una para cada jugador (así, sentados juntos,
// uno no le puede decir al otro cuál es el error). También genera UNA secuencia
// para el modo práctica. Igual que los otros generadores: se guarda con service
// role para que el alumno no pueda inspeccionar la llamada y ver cuál es el
// error antes de jugar.
//
// Antes esto generaba "bloques de programación estilo Scratch" -- limitaba
// el juego a un solo tema (robótica/programación). Ahora es contenido
// real sobre cualquier tema del pool de duelos (ciencia, matemática,
// ambiente, etc.), como el resto de los retos 1v1.

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

type Step = { label: string; isBug: boolean; explanation: string };
type StepSet = { steps: Step[]; fact: string };

// Para comparar "ya salió" ignorando mayúsculas, tildes y puntuación.
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 70);

// Valida las secuencias de la IA: 3+ afirmaciones y EXACTAMENTE una falsa (si no,
// el desafío quedaría sin ganador posible o con más de una respuesta "correcta").
function pickSets(raw: any[], need: number, seenBugs: Set<string>, picked: StepSet[], relax: boolean) {
  for (const s of raw || []) {
    const steps: Step[] = (s?.steps || []).slice(0, 10).map((x: any) => ({
      label: String(x?.label || '').slice(0, 150),
      isBug: !!x?.isBug,
      explanation: String(x?.explanation || '').slice(0, 200),
    })).filter((x: Step) => x.label);
    if (steps.length < 3 || steps.filter((x) => x.isBug).length !== 1) continue;
    const bug = norm(steps.find((x) => x.isBug)!.label);
    if (!relax && seenBugs.has(bug)) continue;
    if (picked.some((p) => norm(p.steps.find((x) => x.isBug)!.label) === bug)) continue;
    picked.push({ steps, fact: String(s?.fact || '').trim().slice(0, 300) });
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

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    let topic = '';
    let grade = 'educación básica';
    let need = 2;
    const seenBugs = new Set<string>();
    const seenLabels: string[] = [];

    if (practice) {
      // Práctica solo: una secuencia para quien la pide, sin tocar ninguna tabla.
      topic = String(body?.topic || '').slice(0, 200).trim();
      if (!topic) return json({ error: 'topic requerido' }, 400);
      need = 1;
      (Array.isArray(body?.avoid) ? body.avoid : []).slice(0, 40).forEach((l: unknown) => {
        seenBugs.add(norm(String(l))); seenLabels.push(String(l).slice(0, 80));
      });
      const { data: me } = await db.from('students').select('grade').eq('id', user.id).maybeSingle();
      if (me?.grade) grade = me.grade;
    } else {
      const { data: duel, error: duelErr } = await db
        .from('student_debug_duels')
        .select('id, topic, steps, challenger_id, opponent_id')
        .eq('id', duel_id)
        .single();
      if (duelErr || !duel) return json({ error: 'No se pudo leer el desafío (¿permisos?)' }, 403);
      if (user.id !== duel.challenger_id && user.id !== duel.opponent_id) return json({ error: 'No autorizado' }, 403);
      if (duel.steps) return json({ ok: true }); // ya generado, no regenerar
      topic = duel.topic;

      const { data: challenger } = await db.from('students').select('grade').eq('id', duel.challenger_id).maybeSingle();
      if (challenger?.grade) grade = challenger.grade;

      // Errores que ya vieron los DOS jugadores (cualquier tema) y los más
      // recientes del tema -- steps_b puede no existir si todavía no corrieron
      // el SQL.
      const ids = [duel.challenger_id, duel.opponent_id];
      const filter = `challenger_id.in.(${ids.join(',')}),opponent_id.in.(${ids.join(',')})`;
      let rows: any[] | null = null;
      {
        const r = await db.from('student_debug_duels').select('steps, steps_b').or(filter)
          .not('steps', 'is', null).order('created_at', { ascending: false }).limit(30);
        rows = r.error
          ? (await db.from('student_debug_duels').select('steps').or(filter)
              .not('steps', 'is', null).order('created_at', { ascending: false }).limit(30)).data
          : r.data;
      }
      const { data: recent } = await db.from('student_debug_duels')
        .select('steps').eq('topic', topic).not('steps', 'is', null)
        .order('created_at', { ascending: false }).limit(15);
      [...(rows || []), ...(recent || [])].forEach((r: any) => {
        [r.steps, r.steps_b].forEach((set: any) => {
          (set || []).filter((s: any) => s.isBug).forEach((s: any) => {
            seenBugs.add(norm(String(s.label))); seenLabels.push(String(s.label).slice(0, 80));
          });
        });
      });
    }

    const bugKinds = ['un número o cantidad equivocada', 'una causa y efecto invertidos', 'una clasificación incorrecta (a qué grupo/categoría pertenece algo)', 'un orden de pasos o etapas equivocado', 'una unidad de medida equivocada', 'confundir dos cosas parecidas entre sí'];
    const shuffled = [...bugKinds].sort(() => Math.random() - 0.5);

    const system = `Armá ${need > 1 ? `${need} secuencias DISTINTAS` : 'una secuencia'} de 5 a 7 afirmaciones cortas (una oración cada
una) sobre el tema indicado, apropiadas para un estudiante de ${grade} en Guatemala.
Tienen que ser datos concretos y verificables (no opiniones), del estilo "El agua
hierve a 100°C a nivel del mar", "La Tierra tarda 365 días en dar una vuelta al Sol".
${need > 1 ? 'Cada secuencia usa afirmaciones DIFERENTES a las de la otra (no repitas ninguna), y el error tiene que ser de un tipo distinto en cada una.\n' : ''}
En CADA secuencia, EXACTAMENTE UNA de las afirmaciones tiene un dato falso, evidente
una vez que se explica (ej: un número equivocado, una causa y efecto invertidos, una
clasificación incorrecta). Las demás afirmaciones tienen que ser perfectamente
correctas y verificables -- no generes ambigüedad de cuál es la falsa.

MUY IMPORTANTE: revisá vos mismo que haya UNA SOLA afirmación falsa por secuencia, y
que el error sea un hecho objetivo (no una opinión ni algo discutible). Poné la
afirmación falsa en una posición AL AZAR dentro de la secuencia (no siempre en el
mismo lugar).

Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:
{"sets":[{"steps":[{"label":"...","isBug":false,"explanation":""},{"label":"...","isBug":true,"explanation":"por qué está mal"}],"fact":"..."}]}

El campo "fact" es UN dato curioso y educativo sobre el tema (1 o 2 oraciones, máximo
220 caracteres) que le deje un aprendizaje al estudiante, DISTINTO de la afirmación
falsa. Tiene que ser verdadero y verificable; si no estás seguro de un dato, escribí
en su lugar un consejo práctico para verificar información antes de creerla.`;

    const userMsg = `Tema: ${topic.slice(0, 200)}\nTipo de error: ${shuffled.slice(0, need).join(' / ')}.`
      + (seenLabels.length ? `\nEstos errores YA salieron en otros retos, armá otros distintos:\n- ${[...new Set(seenLabels)].slice(0, 30).join('\n- ')}` : '');

    // Groq a veces rechaza su propia salida en modo JSON estricto, o genera
    // 0/2+ afirmaciones marcadas como falsas (inválido para el juego) --
    // ambos casos son intermitentes, no dependen del tema. Se reintenta hasta 3
    // veces; el último acepta repetidas antes que dejar al alumno sin juego.
    const picked: StepSet[] = [];
    let lastError = 'La IA no generó una secuencia válida (probá de nuevo)';
    for (let attempt = 1; attempt <= 3 && picked.length < need; attempt++) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
          max_tokens: need > 1 ? 4500 : 2500,
          reasoning_effort: 'low',
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });
      const data = await res.json();
      if (data.error) { lastError = data.error.message; continue; }
      try {
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
        pickSets(parsed.sets || (parsed.steps ? [parsed] : []), need, seenBugs, picked, attempt === 3);
      } catch {
        lastError = 'La IA devolvió una respuesta no válida';
      }
    }
    if (!picked.length) return json({ error: lastError }, 500);

    if (practice) {
      return json({ ok: true, steps: picked[0].steps, fact: picked[0].fact || null });
    }

    const [a, b] = picked;
    const update: Record<string, unknown> = { steps: a.steps, status: 'active' };
    if (b) update.steps_b = b.steps;
    let { error: updateErr } = await db.from('student_debug_duels').update(update).eq('id', duel_id);
    if (updateErr && b && /steps_b/.test(updateErr.message)) {
      // Todavía no corrieron migrations/duel-per-player-content.sql: se guarda
      // como antes (misma secuencia para los dos) hasta que lo corran.
      ({ error: updateErr } = await db.from('student_debug_duels')
        .update({ steps: a.steps, status: 'active' }).eq('id', duel_id));
    }
    if (updateErr) return json({ error: updateErr.message }, 500);

    // Dato para el "¿Sabías que?" del resultado -- solo se entrega después
    // de jugar, vía get_duel_fact (ver migrations/duel-facts.sql).
    if (a.fact) await db.from('duel_facts').upsert({ game: 'debug', duel_id, fact: a.fact });
    if (b?.fact) await db.from('duel_facts').upsert({ game: 'debug_b', duel_id, fact: b.fact });

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
