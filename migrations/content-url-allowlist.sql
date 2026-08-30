-- Allowlist de hosts para lessons.content_url -- se embebe en iframe o se
-- abre directo en la pestaña del alumno, así que sin esto una cuenta
-- docente comprometida (o un typo) podía apuntar a cualquier sitio,
-- incluido uno de phishing disfrazado de material de clase. El chequeo del
-- cliente (utils.js, isAllowedContentHost) es solo UX -- esto es lo que de
-- verdad bloquea, corre server-side sin importar cómo llegue el insert.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL
-- Editor de Supabase.

create or replace function public.check_lesson_content_url()
returns trigger
language plpgsql
as $$
declare
  v_host text;
  v_allowed text[] := array[
    'vyptkxudkmlpyfosppzh.supabase.co',
    'youtube.com', 'youtu.be',
    'drive.google.com',
    'tinkercad.com'
  ];
  v_ok boolean := false;
  v_h text;
begin
  if new.content_url is null then
    return new;
  end if;

  v_host := lower(substring(new.content_url from '^https?://([^/:]+)'));
  if v_host is null then
    raise exception 'content_url inválido: %', new.content_url;
  end if;

  foreach v_h in array v_allowed loop
    if v_host = v_h or v_host like ('%.' || v_h) then
      v_ok := true;
      exit;
    end if;
  end loop;

  if not v_ok then
    raise exception 'content_url no está en un host permitido (%): %', v_host, new.content_url;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_lesson_content_url on public.lessons;
create trigger trg_check_lesson_content_url
before insert or update on public.lessons
for each row execute function public.check_lesson_content_url();

notify pgrst, 'reload schema';

-- ============================================================
-- VERIFICAR después de correr esto (debe fallar con "content_url no está
-- en un host permitido"):
--   insert into lessons (id, title, content_type, content_url, course_id,
--     order_index, school_code, grade, section, created_by)
--   values (gen_random_uuid(), 'test', 'video', 'https://evil.example.com/x',
--     '<algún course_id real>', 999, 'x', 'x', 'x', auth.uid());
-- ============================================================
