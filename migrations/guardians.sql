-- ============================================================
-- AVISOS A PADRES DE FAMILIA (SMS + notificaciones)
--
-- - student_guardians: padres/encargados de cada alumno, con teléfono y un
--   enlace personal al "Portal de padres" (portal_token).
-- - guardian_push_subscriptions: teléfonos donde el padre ACTIVÓ las
--   notificaciones desde el portal (padres.html). Si no las activó, el
--   aviso le llega por SMS.
-- - guardian_notifications: cola de avisos. La edge function
--   notify-guardians los manda: push si el padre activó notificaciones,
--   si no SMS a través del celular Android del proyecto (app
--   "SMS Gateway for Android", usa el plan de SMS ilimitados del chip).
--
-- Quién puede: el admin, y el docente SOLO para alumnos de sus clases.
-- Tope anti-abuso: 600 avisos por docente por día.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

create table if not exists public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  relation text check (relation is null or char_length(relation) <= 30),
  phone text check (phone is null or phone ~ '^\+[0-9]{8,15}$'),
  sms_enabled boolean not null default true,
  portal_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists student_guardians_student_idx on public.student_guardians (student_id);

create table if not exists public.guardian_push_subscriptions (
  id bigserial primary key,
  guardian_id uuid not null references public.student_guardians(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.guardian_notifications (
  id bigserial primary key,
  guardian_id uuid not null references public.student_guardians(id) on delete cascade,
  student_id uuid not null,
  channel text not null check (channel in ('push', 'sms')),
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists guardian_notifications_pending_idx on public.guardian_notifications (created_by, status);
create index if not exists guardian_notifications_guardian_idx on public.guardian_notifications (guardian_id, created_at desc);

-- ¿El usuario actual puede gestionar a este alumno? (admin, o docente de su clase)
create or replace function public.can_manage_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.students s
    join public.teacher_assignments ta
      on ta.school_code = s.school_code and ta.grade = s.grade and ta.section = s.section
    where s.id = p_student and ta.teacher_id = auth.uid()
  );
$$;
grant execute on function public.can_manage_student(uuid) to authenticated;

alter table public.student_guardians enable row level security;
drop policy if exists "guardians_manage" on public.student_guardians;
create policy "guardians_manage" on public.student_guardians
  for all to authenticated
  using (public.can_manage_student(student_id))
  with check (public.can_manage_student(student_id));
revoke all on public.student_guardians from anon, authenticated;
grant select, insert, update, delete on public.student_guardians to authenticated;

alter table public.guardian_push_subscriptions enable row level security;
drop policy if exists "guardian_push_view" on public.guardian_push_subscriptions;
create policy "guardian_push_view" on public.guardian_push_subscriptions
  for select to authenticated
  using (exists (select 1 from public.student_guardians g where g.id = guardian_id and public.can_manage_student(g.student_id)));
revoke all on public.guardian_push_subscriptions from anon, authenticated;
grant select (id, guardian_id, created_at) on public.guardian_push_subscriptions to authenticated;

alter table public.guardian_notifications enable row level security;
drop policy if exists "guardian_notifications_view" on public.guardian_notifications;
create policy "guardian_notifications_view" on public.guardian_notifications
  for select to authenticated using (public.can_manage_student(student_id));
revoke all on public.guardian_notifications from anon, authenticated;
grant select on public.guardian_notifications to authenticated;

-- Encola un aviso para un padre. Canal: el pedido, o push si activó
-- notificaciones, o SMS si tiene teléfono. Devuelve el canal o null.
create or replace function public.enqueue_guardian_notification(p_guardian uuid, p_text text, p_channel text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  v_channel text;
  v_today integer;
begin
  select * into g from public.student_guardians where id = p_guardian;
  if g.id is null or not public.can_manage_student(g.student_id) then raise exception 'No autorizado'; end if;
  if char_length(coalesce(btrim(p_text), '')) = 0 or char_length(p_text) > 300 then
    raise exception 'El mensaje tiene que tener entre 1 y 300 caracteres';
  end if;

  select count(*) into v_today from public.guardian_notifications
    where created_by = auth.uid() and created_at > now() - interval '1 day';
  if v_today >= 600 then raise exception 'Llegaste al tope de 600 avisos por día'; end if;

  v_channel := case
    when p_channel = 'sms' then case when g.phone is not null then 'sms' end
    when p_channel = 'push' then case when exists (select 1 from public.guardian_push_subscriptions where guardian_id = g.id) then 'push' end
    when exists (select 1 from public.guardian_push_subscriptions where guardian_id = g.id) then 'push'
    when g.phone is not null and g.sms_enabled then 'sms'
  end;
  if v_channel is null then return null; end if;

  insert into public.guardian_notifications (guardian_id, student_id, channel, message, created_by)
  values (g.id, g.student_id, v_channel, btrim(p_text), auth.uid());
  return v_channel;
end;
$$;
grant execute on function public.enqueue_guardian_notification(uuid, text, text) to authenticated;

-- Aviso a todos los padres de una clase.
create or replace function public.enqueue_class_guardian_message(p_school_code text, p_grade text, p_section text, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  v_ch text;
  v_push integer := 0;
  v_sms integer := 0;
  v_none integer := 0;
begin
  if not (public.is_admin() or exists (
    select 1 from public.teacher_assignments
    where teacher_id = auth.uid() and school_code = p_school_code and grade = p_grade and section = p_section)) then
    raise exception 'Solo podés avisar a los padres de tus clases';
  end if;

  for g in
    select sg.id from public.student_guardians sg
    join public.students s on s.id = sg.student_id
    where s.school_code = p_school_code and s.grade = p_grade and s.section = p_section
      and coalesce(s.status, 'activo') not in ('baja', 'egresado')
  loop
    v_ch := public.enqueue_guardian_notification(g.id, p_text, null);
    if v_ch = 'push' then v_push := v_push + 1;
    elsif v_ch = 'sms' then v_sms := v_sms + 1;
    else v_none := v_none + 1; end if;
  end loop;

  return jsonb_build_object('push', v_push, 'sms', v_sms, 'none', v_none);
end;
$$;
grant execute on function public.enqueue_class_guardian_message(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
