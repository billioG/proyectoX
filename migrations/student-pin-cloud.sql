-- ============================================================
-- PIN personal también en el modo sin conexión de la app normal (nube),
-- no solo en el nodo escolar (Raspberry). Reusa las mismas columnas que
-- ya agregó migrations/school-nodes.sql (pin_hash, pin_salt,
-- pin_updated_at) -- el mismo estudiante puede tener PIN en el nodo y en
-- la app, comparten fila.
--
-- El hash NUNCA se calcula en el servidor: el navegador ya sabe calcular
-- PBKDF2-SHA256 (150000 iteraciones) para la contraseña offline
-- (hashSecret() en offline-kit.js), con el mismo esquema que usa el nodo
-- (school-node/server.js hashPin) -- esta función solo GUARDA el hash que
-- ya le mandó el navegador, nunca ve el PIN real.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL
-- Editor de Supabase. Requiere migrations/school-nodes.sql ya corrida.
-- ============================================================

create or replace function public.set_student_pin(p_hash text, p_salt text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  if p_hash is null or p_salt is null or length(p_hash) < 32 or length(p_salt) < 16 then
    raise exception 'PIN inválido';
  end if;

  update public.students
  set pin_hash = p_hash, pin_salt = p_salt, pin_updated_at = timezone('utc', now())
  where id = auth.uid();
end;
$$;

-- Para si el alumno quiere sacarse el PIN (ej. cambió de dispositivo y ya
-- no lo recuerda; puede crear uno nuevo la próxima vez que entre online).
create or replace function public.clear_student_pin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  update public.students
  set pin_hash = null, pin_salt = null, pin_updated_at = timezone('utc', now())
  where id = auth.uid();
end;
$$;

grant execute on function public.set_student_pin(text, text) to authenticated;
grant execute on function public.clear_student_pin() to authenticated;

notify pgrst, 'reload schema';
