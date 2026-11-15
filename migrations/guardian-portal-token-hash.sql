-- ============================================================
-- Portal de padres: el enlace (portal_token) se guarda como HUELLA (SHA-256), no en claro.
--
-- Problema: student_guardians.portal_token guardaba el token tal cual. Quien lea la tabla (una copia de seguridad filtrada, un volcado, un
-- error de política) tendría los enlaces vigentes de todos los padres y entraría al portal de sus hijos.
--
-- Qué hace (en este orden, sin romper ningún enlace que ya se envió):
--   1. Columna portal_token_hash con la huella SHA-256 (hex) del token + índice único. Se llena con lo que ya existe, así los enlaces
--      viejos siguen funcionando: la Edge Function guardian-portal busca por huella.
--   2. portal_token deja de ser obligatorio (not null fuera). Un disparador mantiene la huella al día cuando alguien escribe un token en claro.
--   3. regenerate_guardian_portal_token(): ahora guarda SOLO la huella (portal_token = null) y devuelve el token UNA vez, para que el docente
--      lo vea, lo copie o lo mande por SMS/WhatsApp en ese momento. Después no se puede volver a ver: se genera otro.
--   4. La bitácora de seguridad también registra el cambio de huella (si la bitácora existe).
--
-- Lo que NO hace: no borra los tokens en claro que ya existen (los enlaces anteriores se siguen pudiendo reenviar). Para dejar de guardarlos,
-- correr aparte el «Paso 2» de docs/PASOS_MANUALES.md (3a-sexies) cuando el equipo esté listo: ese sí pierde la opción de reenviar el enlace
-- viejo sin generar uno nuevo.
--
-- ADITIVO/NO DESTRUCTIVO y seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase ANTES de usar la app v1.0.284 o más nueva.
-- Después redesplegar guardian-portal (Verify JWT OFF).
-- ============================================================

alter table public.student_guardians add column if not exists portal_token_hash text;

update public.student_guardians
   set portal_token_hash = encode(sha256(convert_to(portal_token, 'UTF8')), 'hex')
 where portal_token is not null and portal_token_hash is null;

create unique index if not exists student_guardians_portal_token_hash_uidx
  on public.student_guardians (portal_token_hash) where portal_token_hash is not null;

alter table public.student_guardians alter column portal_token drop not null;

create or replace function public.sync_guardian_token_hash()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.portal_token is not null then
    new.portal_token_hash := encode(sha256(convert_to(new.portal_token, 'UTF8')), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guardian_token_hash on public.student_guardians;
create trigger trg_guardian_token_hash
  before insert or update of portal_token on public.student_guardians
  for each row execute function public.sync_guardian_token_hash();

create or replace function public.regenerate_guardian_portal_token(p_guardian uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select student_id into v_student from public.student_guardians where id = p_guardian;
  if v_student is null then raise exception 'Padre o encargado no encontrado'; end if;
  if not public.can_manage_student(v_student) then raise exception 'No tienes acceso a este alumno'; end if;
  update public.student_guardians
     set portal_token = null,
         portal_token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
         portal_token_expires_at = now() + interval '180 days'
   where id = p_guardian;
  return v_token;
end;
$$;

revoke all on function public.regenerate_guardian_portal_token(uuid) from public, anon;
grant execute on function public.regenerate_guardian_portal_token(uuid) to authenticated;

-- Bitácora: si existe, también registra el cambio de huella (con el token en claro en null, el cambio de portal_token solo ya no se ve).
do $$
begin
  if to_regclass('public.security_audit_log') is not null and to_regprocedure('public.log_security_event(uuid,text,text,text,text,jsonb,text)') is not null then
    create or replace function public.audit_guardian_link()
    returns trigger language plpgsql security definer set search_path = public as $f$
    begin
      if auth.uid() is null then return null; end if;
      if old.portal_token is distinct from new.portal_token or old.portal_token_hash is distinct from new.portal_token_hash then
        perform public.log_security_event(auth.uid(), 'guardian_portal_link_regenerated', 'guardian', new.id::text, null, jsonb_build_object('student_id', new.student_id), 'db:student_guardians');
      end if;
      return null;
    end;
    $f$;
    drop trigger if exists trg_audit_guardian_link on public.student_guardians;
    create trigger trg_audit_guardian_link after update of portal_token, portal_token_hash on public.student_guardians
      for each row execute function public.audit_guardian_link();
  end if;
end $$;

notify pgrst, 'reload schema';

-- Comprobación (columna = 1, funcion_ok = true, y sin_huella = 0: todo token en claro ya tiene su huella):
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'student_guardians' and column_name = 'portal_token_hash') as columna,
  (select pg_get_functiondef(p.oid) like '%portal_token = null%' from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'regenerate_guardian_portal_token') as funcion_ok,
  (select count(*) from public.student_guardians where portal_token is not null and portal_token_hash is null) as sin_huella;
