-- ============================================================
-- CRON: eventos sorpresa nocturnos
-- 1) schedule_tonight_event(): corre 1 vez al día (12:00 UTC = 6am
--    Guatemala), tira los dados (~45%) y si toca programa un evento esta
--    noche entre 19:00-21:00 hora Guatemala.
-- 2) trigger-random-event (edge function, cada minuto): dispara el evento
--    cuando llega la hora (genera preguntas + manda push).
-- 3) settle-random-event (edge function, cada minuto): liquida el evento
--    cuando se acaba el tiempo (reparte gemas).
-- ============================================================

create or replace function public.schedule_tonight_event()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topics text[] := array[
    'Robótica educativa', 'Programación por bloques', 'Ciencias de la computación',
    'Electrónica básica', 'Inteligencia artificial', 'Matemática aplicada',
    'Historia de Guatemala', 'Geografía de Guatemala', 'Cultura maya',
    'Tradiciones de Guatemala', 'Biodiversidad de Guatemala',
    'Cultura general internacional', 'Historia mundial', 'Ciencia y descubrimientos'
  ];
  v_scheduled timestamptz;
begin
  -- ~45% de probabilidad de que haya evento esta noche.
  if random() > 0.45 then
    return;
  end if;

  -- Hora al azar entre 19:00 y 21:00 hora Guatemala.
  v_scheduled := (current_date::timestamp + time '19:00' + (floor(random() * 120) || ' minutes')::interval)
                 at time zone 'America/Guatemala';

  insert into public.random_events (scheduled_for, duration_minutes, topic, question_count, gem_pool, status)
  values (
    v_scheduled,
    15,
    v_topics[1 + floor(random() * array_length(v_topics, 1))::int],
    8,
    60 + floor(random() * 91)::int, -- 60-150 gemas
    'scheduled'
  );
end;
$$;

select cron.schedule(
  'schedule-tonight-event',
  '0 12 * * *',
  $$select public.schedule_tonight_event();$$
);

select cron.schedule(
  'trigger-random-event',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://vyptkxudkmlpyfosppzh.supabase.co/functions/v1/trigger-random-event',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '39340d5c25dd985dbfd8bcd2b8b60e0923f349110ac3511f'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'settle-random-event',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://vyptkxudkmlpyfosppzh.supabase.co/functions/v1/settle-random-event',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '39340d5c25dd985dbfd8bcd2b8b60e0923f349110ac3511f'),
    body := '{}'::jsonb
  );
  $$
);
