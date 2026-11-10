// Edge Function: settle-random-event
// Llamada por pg_cron cada minuto. Busca eventos 'active' cuyo tiempo ya
// se acabó (scheduled_for + duration_minutes < now()), ordena a los
// participantes (más aciertos, después más rápido) y reparte gem_pool
// entre el top 5 (35/25/20/12/8%). No la llama ningún cliente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET')!;

const PRIZE_SPLIT = [0.35, 0.25, 0.20, 0.12, 0.08]; // top 5

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  const { data: activeEvents, error: evErr } = await admin.from('random_events').select('*').eq('status', 'active');
  if (evErr) return json({ error: evErr.message }, 500);

  const now = Date.now();
  const dueEvents = (activeEvents || []).filter(e => {
    const endsAt = new Date(e.scheduled_for).getTime() + (e.duration_minutes * 60_000);
    return endsAt < now;
  });

  if (!dueEvents.length) return json({ ok: true, settled: 0 });

  let settled = 0;
  for (const event of dueEvents) {
    // Camino normal: la base liquida el evento completo en UNA transacción (migrations/random-event-settle-atomic.sql): ordena, reparte,
    // SUMA las gemas sin pisar las que el alumno ganó en otro lado y no paga dos veces si el cron se solapa.
    const { error: rpcErr } = await admin.rpc('settle_random_event', { p_event: event.id, p_split: PRIZE_SPLIT });
    if (!rpcErr) { settled++; continue; }
    if (!/PGRST202|42883|does not exist/i.test(`${rpcErr.code} ${rpcErr.message}`)) {
      console.error('settle-random-event: falló la liquidación de', event.id, rpcErr.message);
      continue; // se reintenta en el siguiente minuto (el evento sigue 'active')
    }
    // Compatibilidad: sin la migración, se liquida como antes (3 consultas por premiado).
    const { data: participants } = await admin
      .from('event_participants')
      .select('*')
      .eq('event_id', event.id)
      .not('submitted_at', 'is', null);

    const ranked = (participants || [])
      .slice()
      .sort((a, b) => (b.score - a.score) || (a.time_taken_ms - b.time_taken_ms));

    const targetTable = event.target_role === 'docente' ? 'teachers' : 'students';

    for (let i = 0; i < ranked.length; i++) {
      const p = ranked[i];
      const share = PRIZE_SPLIT[i] || 0;
      const gems = Math.round(event.gem_pool * share);
      if (gems > 0) {
        const { data: user } = await admin.from(targetTable).select('gems').eq('id', p.user_id).single();
        await admin.from(targetTable).update({ gems: (user?.gems || 0) + gems }).eq('id', p.user_id);
      }
      await admin.from('event_participants').update({ rank: i + 1, gems_awarded: gems }).eq('id', p.id);
    }

    await admin.from('random_events').update({ status: 'completed' }).eq('id', event.id);
    settled++;
  }

  return json({ ok: true, settled });
});
