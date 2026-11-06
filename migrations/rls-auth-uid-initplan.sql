-- ============================================================
-- RENDIMIENTO DE RLS: auth.uid() -> (select auth.uid())     (recomendación del asesor de Supabase)
--
-- Problema: una política que escribe  auth.uid() = user_id  evalúa auth.uid() UNA VEZ POR CADA FILA que revisa. Escrita como
-- (select auth.uid()) Postgres la evalúa una sola vez por consulta y reutiliza el resultado ("initPlan"). En el volcado de producción,
-- 147 de 226 políticas la llamaban sin envolver; con tablas grandes (retos, resultados, avisos, lecciones) es de lo primero que
-- se vuelve lento. El resultado de la consulta es EXACTAMENTE el mismo: solo cambia cuántas veces se calcula.
--
-- Qué hace: recorre las políticas del esquema public y reescribe, dentro de USING y WITH CHECK,
--     auth.uid()  auth.role()  auth.jwt()  public.is_staff()  public.is_admin()
-- como (select ...). Usa el texto que Postgres ya tiene de cada política (el mismo con que pg_dump la exporta), así que no depende de
-- que alguien reescriba a mano 147 políticas. No toca el rol, el comando ni el nombre de ninguna.
--
-- Seguro de re-ejecutar (lo ya envuelto se salta; la segunda vez dice 0). NO destructivo: ALTER POLICY. Si una política no se puede
-- reescribir, se salta y se avisa con su nombre en vez de cancelar todo.
--
-- ORDEN: correrlo DESPUÉS de las demás migraciones de seguridad (security-rls-audit-2026-11.sql crea políticas ya envueltas, y así
-- éstas no se tocan dos veces). Probar con un estudiante, un docente y el admin (docs/SEGURIDAD_2026-11.md).
-- ============================================================

do $$
declare
  r record;
  v_qual text;
  v_check text;
  v_sql text;
  v_changed integer := 0;
  v_skipped integer := 0;
  -- (?<!select\s) = "que no esté ya dentro de un (select ...)"; \m \M = límites de palabra
  c_pat constant text := '(?<!select\s)(\mauth\.(uid|role|jwt)\(\)|\m(public\.)?(is_staff|is_admin)\(\))';
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~* c_pat or coalesce(with_check, '') ~* c_pat)
  loop
    v_qual := case when r.qual is null then null else regexp_replace(r.qual, c_pat, '(select \1)', 'gi') end;
    v_check := case when r.with_check is null then null else regexp_replace(r.with_check, c_pat, '(select \1)', 'gi') end;
    if v_qual is not distinct from r.qual and v_check is not distinct from r.with_check then continue; end if;

    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename)
          || case when v_qual is not null then format(' using (%s)', v_qual) else '' end
          || case when v_check is not null then format(' with check (%s)', v_check) else '' end;
    begin
      execute v_sql;
      v_changed := v_changed + 1;
    exception when others then
      v_skipped := v_skipped + 1;
      raise warning 'rls-auth-uid-initplan: se saltó % en %.% (%)', r.policyname, r.schemaname, r.tablename, sqlerrm;
    end;
  end loop;
  raise notice 'rls-auth-uid-initplan: % política(s) reescritas, % saltadas.', v_changed, v_skipped;
end $$;

notify pgrst, 'reload schema';

-- ---------- Verificación: políticas que todavía llaman a auth.uid() sin envolver (debe dar 0) ----------
select count(*) as sin_envolver
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') ~* '(?<!select\s)auth\.uid\(\)' or coalesce(with_check, '') ~* '(?<!select\s)auth\.uid\(\)');
