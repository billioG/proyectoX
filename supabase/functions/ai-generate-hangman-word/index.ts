// Edge Function: ai-generate-hangman-word
// Genera las palabras + pistas del Ahorcado 1v1 entre estudiantes: DOS palabras
// distintas, una para cada jugador (así, sentados juntos, uno no le puede
// soplar la palabra al otro). También genera UNA palabra para el modo práctica.
// Igual que ai-generate-quiz: se guarda con service role para que el alumno no
// pueda inspeccionar la llamada y ver la palabra antes de jugar.

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

// Sin tildes/ñ/espacios -- el teclado del juego es A-Z simple y la palabra
// tiene que poder adivinarse letra por letra sin casos raros de acentos.
function normalizeWord(w: string): string {
  return w
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

type Item = { word: string; hint: string; fact: string };

// Valida y filtra lo que devolvió la IA. "seen" = palabras que alguno de los
// jugadores ya vio; "relax" (último intento) las acepta antes que fallar.
function pickItems(raw: any[], need: number, seen: Set<string>, picked: Item[], relax: boolean) {
  for (const it of raw || []) {
    const word = normalizeWord(String(it?.word || ''));
    const hint = String(it?.hint || '').slice(0, 200);
    if (word.length < 4 || word.length > 12 || !hint) continue;
    if (picked.some((p) => p.word === word)) continue;
    if (!relax && seen.has(word)) continue;
    // La segunda palabra de largo parecido a la primera: el que gana es el más
    // rápido, y una palabra de 4 letras contra una de 12 no sería justo.
    if (picked.length && !relax && Math.abs(word.length - picked[0].word.length) > 3) continue;
    picked.push({ word, hint, fact: String(it?.fact || '').trim().slice(0, 300) });
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
    const seen = new Set<string>();

    if (practice) {
      // Práctica solo: una palabra para quien la pide, sin tocar ninguna tabla.
      topic = String(body?.topic || '').slice(0, 200).trim();
      if (!topic) return json({ error: 'topic requerido' }, 400);
      need = 1;
      (Array.isArray(body?.avoid) ? body.avoid : []).slice(0, 60).forEach((w: unknown) => seen.add(normalizeWord(String(w))));
      const { data: me } = await db.from('students').select('grade').eq('id', user.id).maybeSingle();
      if (me?.grade) grade = me.grade;
    } else {
      const { data: duel, error: duelErr } = await db
        .from('student_hangman_duels')
        .select('id, topic, word, challenger_id, opponent_id')
        .eq('id', duel_id)
        .single();
      if (duelErr || !duel) return json({ error: 'No se pudo leer el desafío (¿permisos?)' }, 403);
      if (user.id !== duel.challenger_id && user.id !== duel.opponent_id) return json({ error: 'No autorizado' }, 403);
      if (duel.word) return json({ ok: true }); // ya generado, no regenerar
      topic = duel.topic;

      const { data: challenger } = await db.from('students').select('grade').eq('id', duel.challenger_id).maybeSingle();
      if (challenger?.grade) grade = challenger.grade;

      // Palabras que ya vieron los DOS jugadores (cualquier tema) y las más
      // recientes del tema -- para que no se repitan ni entre duelos ni con el
      // mismo rival. word_b puede no existir si todavía no corrieron el SQL.
      const ids = [duel.challenger_id, duel.opponent_id];
      let rows: any[] | null = null;
      {
        const r = await db.from('student_hangman_duels').select('word, word_b')
          .or(`challenger_id.in.(${ids.join(',')}),opponent_id.in.(${ids.join(',')})`)
          .order('created_at', { ascending: false }).limit(80);
        rows = r.error
          ? (await db.from('student_hangman_duels').select('word')
              .or(`challenger_id.in.(${ids.join(',')}),opponent_id.in.(${ids.join(',')})`)
              .order('created_at', { ascending: false }).limit(80)).data
          : r.data;
      }
      (rows || []).forEach((r: any) => { [r.word, r.word_b].forEach((w) => { if (w) seen.add(normalizeWord(String(w))); }); });
      const { data: recent } = await db.from('student_hangman_duels')
        .select('word').eq('topic', topic).not('word', 'is', null)
        .order('created_at', { ascending: false }).limit(60);
      (recent || []).forEach((r: any) => seen.add(normalizeWord(String(r.word))));
    }

    const system = `Elegí ${need} palabra${need > 1 ? 's' : ''} en español relacionada${need > 1 ? 's' : ''} con el tema indicado,
apropiada${need > 1 ? 's' : ''} para un estudiante de ${grade} en Guatemala -- sin tildes ni ñ, entre 4 y 12
letras, una sola palabra cada una (sin espacios ni guiones).${need > 1 ? ' Las palabras tienen que ser DISTINTAS entre sí y de largo parecido (diferencia máxima de 2 letras).' : ''}
Para cada palabra escribí una pista corta (una oración) que ayude a adivinarla
sin decirla directamente. Responde ÚNICAMENTE con JSON válido, sin texto
adicional, con esta forma exacta:
{"items":[{"word":"...","hint":"...","fact":"..."}]}

El campo "fact" es UN dato curioso y educativo sobre la palabra o el tema (1 o 2
oraciones, máximo 220 caracteres) que le deje un aprendizaje al estudiante. Tiene que
ser verdadero y verificable; si no estás seguro de un dato, escribí en su lugar un
consejo práctico para aprender o recordar este tema.`;

    const used = [...seen].slice(0, 80);
    const userMsg = `Tema: ${topic.slice(0, 200)}`
      + (used.length ? `\nEstas palabras YA salieron, elegí otras distintas: ${used.join(', ')}` : '');

    // Groq a veces rechaza su propia salida en modo JSON estricto ("Failed
    // to validate JSON") o el content viene truncado/mal formado --
    // intermitente, no depende del tema. Se reintenta hasta 3 veces; el último
    // intento acepta repetidas antes que dejar al alumno sin juego.
    const picked: Item[] = [];
    let lastError = 'La IA no generó una respuesta válida';
    for (let attempt = 1; attempt <= 3 && picked.length < need; attempt++) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
          // gpt-oss razona antes de responder y eso cuenta contra el límite.
          max_tokens: 2500,
          reasoning_effort: 'low',
          temperature: 0.9,
          response_format: { type: 'json_object' },
        }),
      });
      const data = await res.json();
      if (data.error) { lastError = data.error.message; continue; }
      try {
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
        pickItems(parsed.items || (parsed.word ? [parsed] : []), need, seen, picked, attempt === 3);
      } catch {
        lastError = 'La IA devolvió una respuesta no válida';
      }
    }
    if (!picked.length) return json({ error: lastError }, 500);

    if (practice) {
      return json({ ok: true, word: picked[0].word, hint: picked[0].hint, fact: picked[0].fact || null });
    }

    const [a, b] = picked;
    const update: Record<string, unknown> = { word: a.word, hint: a.hint, status: 'active' };
    if (b) { update.word_b = b.word; update.hint_b = b.hint; }
    let { error: updateErr } = await db.from('student_hangman_duels').update(update).eq('id', duel_id);
    if (updateErr && b && /word_b|hint_b/.test(updateErr.message)) {
      // Todavía no corrieron migrations/duel-per-player-content.sql: se guarda
      // como antes (misma palabra para los dos) hasta que lo corran.
      ({ error: updateErr } = await db.from('student_hangman_duels')
        .update({ word: a.word, hint: a.hint, status: 'active' }).eq('id', duel_id));
    }
    if (updateErr) return json({ error: updateErr.message }, 500);

    // Dato para el "¿Sabías que?" del resultado -- solo se entrega después
    // de jugar, vía get_duel_fact (ver migrations/duel-facts.sql).
    if (a.fact) await db.from('duel_facts').upsert({ game: 'hangman', duel_id, fact: a.fact });
    if (b?.fact) await db.from('duel_facts').upsert({ game: 'hangman_b', duel_id, fact: b.fact });

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
