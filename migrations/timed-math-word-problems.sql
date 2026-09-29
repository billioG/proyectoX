-- ============================================================
-- Contrarreloj 1v1: los problemas eran operaciones sueltas ("15 × 4 = ?"),
-- sin ningún contexto -- puro cálculo mental, sin relación con nada real.
-- Se reemplaza generate_math_problems() para que suma/resta/multiplicación/
-- división salgan envueltas en una mini historia con contexto guatemalteco
-- (cosecha, tienda, escuela, cooperativa), MISMOS números y misma
-- respuesta -- sigue siendo rápido de resolver, pero ya no es una cuenta
-- en el vacío.
--
-- 1ro-3ro primaria se deja igual (sumas/restas simples sin texto): a esa
-- edad la lectura todavía es el obstáculo, no el cálculo, así que envolver
-- la cuenta en una oración solo le resta velocidad sin sumarle nada.
-- Potencias, ecuaciones y porcentajes también quedan igual (no tienen una
-- historia natural que no vuelva la pregunta más larga sin motivo).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el SQL
-- Editor de Supabase. Reemplaza la función creada en
-- student-timed-math-duels.sql (debe estar corrida antes que esta).
-- ============================================================

create or replace function public.generate_math_problems(p_grade text, p_count integer default 10)
returns jsonb
language plpgsql
as $$
declare
  v_rank integer;
  v_level text := lower(coalesce(p_grade, ''));
  v_problems jsonb := '[]'::jsonb;
  i integer;
  a integer;
  b integer;
  op text;
  answer numeric;
  question text;
  v_percents integer[] := array[10, 20, 25, 50, 75];
  v_bases integer[] := array[40, 80, 100, 200, 50];
  v_plus text[] := array[
    'Un bus llevaba %s pasajeros y en la siguiente parada subieron %s más. ¿Cuántos pasajeros lleva ahora?',
    'En la tienda escolar vendieron %s panes en la mañana y %s en la tarde. ¿Cuántos panes vendieron en total?',
    'Una cooperativa empacó %s quintales de café el lunes y %s el martes. ¿Cuántos quintales empacó en total?',
    'Un agricultor cosechó %s costales de maíz el lunes y %s costales más el martes. ¿Cuántos costales tiene en total?'
  ];
  v_minus text[] := array[
    'Había %s huevos en la granja y se vendieron %s. ¿Cuántos huevos quedan?',
    'Un camión salía con %s cajas de tomate y entregó %s en el mercado. ¿Cuántas cajas le quedan?',
    'Una tienda tenía %s libras de azúcar y vendió %s. ¿Cuántas libras le quedan?',
    'En un vivero hay %s árboles y ya se trasplantaron %s. ¿Cuántos árboles faltan por trasplantar?'
  ];
  v_mult text[] := array[
    'Un vivero siembra %s hileras con %s plantas cada una. ¿Cuántas plantas hay en total?',
    'Cada canasta tiene %s naranjas. Si hay %s canastas, ¿cuántas naranjas hay en total?',
    'Un salón tiene %s filas de %s pupitres cada una. ¿Cuántos pupitres hay en total?',
    'Una avícola guarda %s huevos en cada cartón. ¿Cuántos huevos hay en %s cartones?'
  ];
  v_div text[] := array[
    'Se repartieron %s libras de frijol en partes iguales entre %s familias. ¿Cuántas libras le tocan a cada una?',
    'Un docente reparte %s lápices en partes iguales entre %s estudiantes. ¿Cuántos lápices le tocan a cada uno?',
    'Una cooperativa envasó %s litros de miel en botellas iguales y llenó %s botellas. ¿Cuántos litros tiene cada botella?',
    'Se juntaron %s quetzales para el paseo escolar entre %s estudiantes en partes iguales. ¿Cuánto puso cada uno?'
  ];
begin
  if v_level like '%primaria%' then
    if v_level like '1ro%' or v_level like '2do%' or v_level like '3ro%' then v_rank := 2; else v_rank := 5; end if;
  elsif v_level like '%básico%' or v_level like '%basico%' then
    v_rank := 8;
  elsif v_level like '%diversificado%' then
    v_rank := 11;
  else
    v_rank := 5;
  end if;

  for i in 1..p_count loop
    if v_rank <= 3 then
      -- 1ro-3ro primaria: suma/resta hasta 20, sin negativos.
      a := floor(random() * 20)::integer + 1;
      b := floor(random() * 20)::integer + 1;
      if random() < 0.5 then
        op := '+'; answer := a + b;
      else
        if a < b then a := a + b; b := a - b; a := a - b; end if;
        op := '-'; answer := a - b;
      end if;

    elsif v_rank <= 6 then
      -- 4to-6to primaria: suma/resta hasta 100, multiplicación tabla 1-10.
      case floor(random() * 3)::integer
        when 0 then
          a := floor(random() * 100)::integer + 1; b := floor(random() * 100)::integer + 1;
          op := '+'; answer := a + b;
        when 1 then
          a := floor(random() * 100)::integer + 1; b := floor(random() * 100)::integer + 1;
          if a < b then a := a + b; b := a - b; a := a - b; end if;
          op := '-'; answer := a - b;
        else
          a := floor(random() * 10)::integer + 1; b := floor(random() * 10)::integer + 1;
          op := '×'; answer := a * b;
      end case;

    elsif v_rank <= 9 then
      -- Básico: multiplicación/división exacta/potencias simples.
      case floor(random() * 3)::integer
        when 0 then
          a := floor(random() * 20)::integer + 2; b := floor(random() * 20)::integer + 2;
          op := '×'; answer := a * b;
        when 1 then
          b := floor(random() * 10)::integer + 2; answer := floor(random() * 15)::integer + 1; a := b * answer::integer;
          op := '÷';
        else
          a := floor(random() * 10)::integer + 2; b := floor(random() * 3)::integer + 2;
          op := '^'; answer := a ^ b;
      end case;

    else
      -- Diversificado: ecuación de un paso o porcentaje.
      if random() < 0.5 then
        a := floor(random() * 15)::integer + 1; answer := floor(random() * 15)::integer + 1; b := a + answer::integer;
        op := 'x+';
      else
        a := v_percents[floor(random() * array_length(v_percents, 1))::integer + 1];
        b := v_bases[floor(random() * array_length(v_bases, 1))::integer + 1];
        answer := round(a * b / 100.0);
        op := '%';
      end if;
    end if;

    question := case
      when v_rank > 3 and op = '+' then format(v_plus[floor(random() * array_length(v_plus, 1))::integer + 1], a, b)
      when v_rank > 3 and op = '-' then format(v_minus[floor(random() * array_length(v_minus, 1))::integer + 1], a, b)
      when v_rank > 3 and op = '×' then format(v_mult[floor(random() * array_length(v_mult, 1))::integer + 1], a, b)
      when v_rank > 3 and op = '÷' then format(v_div[floor(random() * array_length(v_div, 1))::integer + 1], a, b)
      when op = '+' then a || ' + ' || b
      when op = '-' then a || ' - ' || b
      when op = '×' then a || ' × ' || b
      when op = '÷' then a || ' ÷ ' || b
      when op = '^' then a || '^' || b
      when op = 'x+' then 'x + ' || a || ' = ' || b || '  (¿cuánto vale x?)'
      when op = '%' then '¿Cuánto es el ' || a || '% de ' || b || '?'
    end;

    v_problems := v_problems || jsonb_build_object('question', question, 'answer', answer);
  end loop;

  return v_problems;
end;
$$;

notify pgrst, 'reload schema';
