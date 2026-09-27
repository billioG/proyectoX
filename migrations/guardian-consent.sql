-- ============================================================
-- Consentimiento de padres (Portal de padres, padres.html).
-- El padre acepta o no la política de privacidad (privacidad.html) desde
-- su enlace personal; queda registrado con fecha y versión. El docente lo
-- ve en la ficha de padres del alumno.
--
-- Requiere guardians.sql. ADITIVO. Seguro de re-ejecutar.
-- ============================================================

alter table public.student_guardians add column if not exists consent_status text
  check (consent_status is null or consent_status in ('accepted', 'declined'));
alter table public.student_guardians add column if not exists consent_version integer;
alter table public.student_guardians add column if not exists consent_at timestamptz;

-- Solo el padre (vía la edge function guardian-portal, con service role)
-- puede registrar su consentimiento: el docente o el admin no pueden
-- marcarlo en su nombre desde el navegador.
create or replace function public.guard_guardian_consent()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.consent_status := null; new.consent_version := null; new.consent_at := null;
    elsif new.consent_status is distinct from old.consent_status
       or new.consent_version is distinct from old.consent_version
       or new.consent_at is distinct from old.consent_at then
      raise exception 'El consentimiento solo lo registra el padre desde su portal';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_guardian_consent on public.student_guardians;
create trigger trg_guard_guardian_consent
  before insert or update on public.student_guardians
  for each row execute function public.guard_guardian_consent();

-- Mismo encolado de guardians.sql, pero sin avisos a quien NO aceptó.
-- (El SMS con el enlace al portal sí se permite: es la forma de pedir el
-- consentimiento. Se reconoce por p_channel = 'sms' explícito.)
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
  if g.consent_status = 'declined' and p_channel is distinct from 'sms' then return null; end if;

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

notify pgrst, 'reload schema';
