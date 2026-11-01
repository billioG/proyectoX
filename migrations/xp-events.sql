-- XP por completar lecciones (también con internet) y cofre diario del nodo escolar.
--
-- Contexto: students.xp / students.gems / daily_chest_last_claimed solo se escriben en el servidor
-- (ver economy-server-side.sql: el UPDATE está revocado a los clientes). Hasta ahora completar una
-- lección no daba XP. Esta migración:
--   1) crea xp_events, un registro de cada pago de XP, con UNIQUE (estudiante, tipo, referencia):
--      lo mismo no se paga dos veces;
--   2) paga 10 XP la primera vez que una lección de un estudiante pasa a "completada" (lo mismo si el
--      progreso llega desde la app, desde el relevo del docente o desde un nodo escolar);
--   3) agrega apply_node_chest(), que usa la función node-sync (service_role) para aplicar el cofre diario
--      que un nodo sorteó sin internet: un cofre por día, solo los tres premios válidos.
-- Sin retroactivo: las lecciones ya completadas antes de esta migración no dan XP.
-- Ejecutar ANTES de volver a publicar node-sync. Es idempotente (se puede correr dos veces).

create table if not exists public.xp_events (
  id          bigint generated always as identity primary key,
  student_id  uuid not null references public.students(id) on delete cascade,
  kind        text not null check (kind in ('lesson', 'chest')),
  ref         text not null,
  xp          integer not null default 0,
  gems        integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (student_id, kind, ref)
);

-- Solo el servidor (funciones security definer / service_role) lee y escribe: sin políticas.
alter table public.xp_events enable row level security;
revoke all on public.xp_events from anon, authenticated;

-- 10 XP por lección, una sola vez por estudiante y lección.
create or replace function public.award_lesson_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Filas antiguas sin status cuentan como completadas (la fila existe porque se completó).
  if coalesce(new.status, 'completed') <> 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, 'completed') = 'completed' then
    return new;
  end if;

  insert into public.xp_events (student_id, kind, ref, xp, gems)
  values (new.student_id, 'lesson', new.lesson_id::text, 10, 0)
  on conflict (student_id, kind, ref) do nothing;

  if found then
    update public.students set xp = coalesce(xp, 0) + 10 where id = new.student_id;
  end if;
  return new;
end;
$$;

drop trigger if exists award_lesson_xp_trg on public.lesson_completions;
create trigger award_lesson_xp_trg
  after insert or update of status on public.lesson_completions
  for each row execute function public.award_lesson_xp();

-- Cofre diario sorteado por un nodo escolar. Devuelve true si se aplicó ahora, false si no (ya estaba
-- aplicado o el estudiante ya reclamó ese día u otro posterior). Lanza error si los datos no son válidos.
create or replace function public.apply_node_chest(p_student uuid, p_date date, p_xp integer, p_gems integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last date;
begin
  if not ((p_xp = 20 and p_gems = 5) or (p_xp = 50 and p_gems = 15) or (p_xp = 100 and p_gems = 50)) then
    raise exception 'Premio del cofre inválido';
  end if;
  if p_date > current_date or p_date < current_date - 3 then
    raise exception 'Fecha del cofre fuera de rango';
  end if;

  select daily_chest_last_claimed into v_last from public.students where id = p_student for update;
  if not found then
    raise exception 'Estudiante no encontrado';
  end if;
  if v_last is not null and v_last >= p_date then
    return false;
  end if;

  insert into public.xp_events (student_id, kind, ref, xp, gems)
  values (p_student, 'chest', p_date::text, p_xp, p_gems)
  on conflict (student_id, kind, ref) do nothing;
  if not found then
    return false;
  end if;

  update public.students
     set xp = coalesce(xp, 0) + p_xp,
         gems = coalesce(gems, 0) + p_gems,
         daily_chest_last_claimed = p_date
   where id = p_student;
  return true;
end;
$$;

revoke all on function public.apply_node_chest(uuid, date, integer, integer) from public, anon, authenticated;
grant execute on function public.apply_node_chest(uuid, date, integer, integer) to service_role;
