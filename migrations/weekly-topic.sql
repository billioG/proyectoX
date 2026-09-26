-- ============================================================
-- Tema de repaso de la semana: el docente marca un tema por clase y los
-- duelos de esa semana lo proponen primero (y el reto rápido lo usa).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

-- Misma definición que en weekly-leagues.sql -- se repite acá para que
-- esta migración no dependa del orden en que se corran.
create or replace function public.current_week_id()
returns text
language sql
stable
as $$ select to_char(now() at time zone 'America/Guatemala', 'IYYY-"W"IW'); $$;

create table if not exists public.class_weekly_topics (
  school_code text not null,
  grade text not null,
  section text not null,
  week_id text not null,
  topic text not null check (char_length(topic) between 2 and 180),
  set_by uuid references public.teachers(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (school_code, grade, section, week_id)
);

alter table public.class_weekly_topics enable row level security;
revoke all on public.class_weekly_topics from anon, authenticated;
grant select on public.class_weekly_topics to authenticated;
drop policy if exists "class_weekly_topics_select_all" on public.class_weekly_topics;
create policy "class_weekly_topics_select_all" on public.class_weekly_topics for select using (true);

grant execute on function public.current_week_id() to authenticated;

-- Solo el docente asignado a esa clase (o un admin) puede marcarlo.
-- p_topic vacío = quitar el tema de esta semana.
create or replace function public.set_weekly_topic(p_school text, p_grade text, p_section text, p_topic text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic text := nullif(trim(coalesce(p_topic, '')), '');
begin
  if not exists (
    select 1 from public.teacher_assignments
    where teacher_id = auth.uid() and school_code = p_school and grade = p_grade and section = p_section
  ) and not exists (select 1 from public.teachers where id = auth.uid() and role = 'admin') then
    raise exception 'No sos docente de esa clase';
  end if;

  if v_topic is null then
    delete from public.class_weekly_topics
      where school_code = p_school and grade = p_grade and section = p_section and week_id = public.current_week_id();
    return;
  end if;

  insert into public.class_weekly_topics (school_code, grade, section, week_id, topic, set_by)
    values (p_school, p_grade, p_section, public.current_week_id(), left(v_topic, 180), auth.uid())
  on conflict (school_code, grade, section, week_id)
    do update set topic = excluded.topic, set_by = excluded.set_by, updated_at = timezone('utc', now());
end;
$$;

-- Tema de esta semana para la clase del estudiante que llama.
create or replace function public.get_weekly_topic()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select t.topic from public.class_weekly_topics t
  join public.students s on s.school_code = t.school_code and s.grade = t.grade and s.section = t.section
  where s.id = auth.uid() and t.week_id = public.current_week_id();
$$;

grant execute on function public.set_weekly_topic(text, text, text, text) to authenticated;
grant execute on function public.get_weekly_topic() to authenticated;

notify pgrst, 'reload schema';
