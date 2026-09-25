-- ============================================================
-- Tiempo activo calculado en servidor. Antes el cliente leía
-- total_seconds, le sumaba 30 y hacía upsert -- cualquier alumno podía
-- escribir el total que quisiera (y el rol/escuela) desde la consola, y
-- eso alimenta los reportes de desempeño docente y el dashboard admin.
-- Ahora el RPC deduce rol, escuela y fecha (Guatemala) del usuario real,
-- suma 30s fijos y como mucho una vez cada 25s.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create or replace function public.record_active_heartbeat()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_school text;
  v_today date := (now() at time zone 'America/Guatemala')::date;
  v_last timestamptz;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if exists (select 1 from public.students where id = v_uid) then
    v_role := 'estudiante';
    select school_code into v_school from public.students where id = v_uid;
  elsif exists (select 1 from public.teachers where id = v_uid) then
    select case when role in ('admin', 'coordinador') then role else 'docente' end into v_role
      from public.teachers where id = v_uid;
    if v_role = 'docente' then
      select school_code into v_school from public.teacher_assignments where teacher_id = v_uid limit 1;
    end if;
  else
    return;
  end if;

  v_school := coalesce(v_school, 'GENERAL');

  select last_heartbeat into v_last from public.active_time_tracking
    where user_id = v_uid and school_code = v_school and activity_date = v_today;

  if v_last is not null and v_last > now() - interval '25 seconds' then
    return;
  end if;

  insert into public.active_time_tracking (user_id, school_code, role, activity_date, total_seconds, last_heartbeat)
    values (v_uid, v_school, v_role, v_today, 30, now())
  on conflict (user_id, school_code, activity_date)
    do update set total_seconds = public.active_time_tracking.total_seconds + 30, last_heartbeat = now();
end;
$$;

grant execute on function public.record_active_heartbeat() to authenticated;

revoke insert, update, delete on public.active_time_tracking from authenticated, anon;

notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICAR (consola, logueado): debe fallar con "permission denied":
--   await window._supabase.from('active_time_tracking').update({ total_seconds: 999999 }).eq('user_id', window.currentUser.id)
-- ============================================================
