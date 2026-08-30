// Edge Function: submit-team-match-answer
// El capitán manda las respuestas de su equipo. El score se calcula EN
// SERVIDOR contra las respuestas correctas reales -- el cliente nunca
// tuvo correctIndex, así que no puede falsificar el score.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const { match_id, answers } = await req.json();
    if (!match_id || !Array.isArray(answers)) return json({ error: 'match_id y answers requeridos' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const { data: match, error: matchErr } = await admin
      .from('tournament_matches')
      .select('id, status, team_a_id, team_b_id, questions')
      .eq('id', match_id)
      .single();
    if (matchErr || !match) return json({ error: 'Partido no encontrado' }, 404);
    if (match.status !== 'active') return json({ error: 'Este partido no está activo' }, 400);

    const { data: teams } = await admin
      .from('tournament_teams')
      .select('id, captain_id')
      .in('id', [match.team_a_id, match.team_b_id]);
    const myTeam = (teams || []).find((t: any) => t.captain_id === user.id);
    if (!myTeam) return json({ error: 'No sos capitán de ninguno de los dos equipos' }, 403);

    const { data: existing } = await admin
      .from('tournament_match_answers')
      .select('id')
      .eq('match_id', match_id)
      .eq('team_id', myTeam.id)
      .maybeSingle();
    if (existing) return json({ error: 'Tu equipo ya respondió este partido' }, 400);

    const questions = match.questions || [];
    let score = 0;
    questions.forEach((q: any, i: number) => {
      if (parseInt(answers[i]) === q.correctIndex) score++;
    });

    const { error: insertErr } = await admin.from('tournament_match_answers').insert({
      match_id,
      team_id: myTeam.id,
      submitted_by: user.id,
      answers,
      score,
    });
    if (insertErr) return json({ error: insertErr.message }, 500);

    return json({ ok: true, score, total: questions.length });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
