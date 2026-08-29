// Edge Function: notify-duel
// Manda push real cuando se crea un desafío 1v1 (al rival) o cuando el
// rival lo acepta (al retador). Requiere JWT de un usuario real (el
// estudiante que acaba de retar/aceptar) -- solo usa el service role para
// leer push_subscriptions del OTRO participante, nunca para escribir nada.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:soporte@quetzallms.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !caller) return json({ error: 'Invalid token' }, 401);

  // 4 juegos 1v1 comparten esta misma función de notificación -- cada uno
  // vive en su propia tabla (challenger_id/opponent_id/wager_gems iguales
  // en las 4, "topic" solo en 3 de ellas). Antes esto estaba hardcodeado a
  // student_duels, así que Ahorcado/Contrarreloj/Encontrá el Error nunca
  // mandaban push.
  const GAME_CONFIG: Record<string, { table: string; label: string; hasTopic: boolean }> = {
    quiz: { table: 'student_duels', label: 'Desafío de Código', hasTopic: true },
    hangman: { table: 'student_hangman_duels', label: 'Ahorcado', hasTopic: true },
    timed_math: { table: 'student_timed_math_duels', label: 'Contrarreloj', hasTopic: false },
    debug: { table: 'student_debug_duels', label: 'Encontrá el Error', hasTopic: true },
  };

  try {
    const { duel_id, type, game = 'quiz' } = await req.json();
    if (!duel_id || !['challenge', 'accepted'].includes(type)) return json({ error: 'duel_id y type ("challenge"|"accepted") requeridos' }, 400);
    const config = GAME_CONFIG[game];
    if (!config) return json({ error: `game inválido: ${game}` }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const selectCols = `challenger_id, opponent_id, wager_gems${config.hasTopic ? ', topic' : ''}, challenger:students!challenger_id(full_name), opponent:students!opponent_id(full_name)`;
    const { data: duel } = await admin.from(config.table)
      .select(selectCols)
      .eq('id', duel_id).maybeSingle();
    if (!duel) return json({ error: 'Desafío no encontrado' }, 404);

    // Solo un participante real de este duelo puede disparar su propia notificación.
    if (caller.id !== duel.challenger_id && caller.id !== duel.opponent_id) return json({ error: 'No autorizado para este duelo' }, 403);

    const challengerName = (Array.isArray(duel.challenger) ? duel.challenger[0] : duel.challenger)?.full_name || 'Alguien';
    const opponentName = (Array.isArray(duel.opponent) ? duel.opponent[0] : duel.opponent)?.full_name || 'Tu rival';
    const subject = config.hasTopic ? duel.topic : config.label;

    const targetId = type === 'challenge' ? duel.opponent_id : duel.challenger_id;
    const payload = type === 'challenge'
      ? { title: `⚔️ Nuevo ${config.label}`, body: `${challengerName} te retó por ${duel.wager_gems} gemas -- ${subject}` }
      : { title: '✅ Reto Aceptado', body: `${opponentName} aceptó tu desafío -- ¡ya podés jugar!` };

    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', targetId);

    let sent = 0, cleaned = 0;
    for (const sub of (subs || [])) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ ...payload, url: '/' })
        );
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
          cleaned++;
        }
      }
    }

    return json({ ok: true, sent, cleaned });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
