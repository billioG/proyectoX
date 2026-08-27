-- Habilita Supabase Realtime en student_duels para que el retador vea el
-- botón cambiar solo a "Jugar" apenas el rival acepta, sin recargar.
alter publication supabase_realtime add table public.student_duels;
