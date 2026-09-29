-- ============================================================
-- Banco FIJO de palabras para Ahorcado 1v1, categoría "Vida silvestre y
-- ODS de Guatemala" -- sin pasar por IA. Los otros temas de Ahorcado
-- siguen generándose con Groq (ai-generate-hangman-word); esta categoría
-- es aparte porque queremos garantizar que el vocabulario sea siempre
-- sobre fauna/ambiente/ODS 14-15 de Guatemala, sin depender de que la IA
-- interprete bien el tema ni de que el servicio esté arriba.
--
-- Igual que duel_facts: nunca se expone directo al cliente (delataría la
-- palabra antes de jugar). Solo la lee assign_hangman_bank_word()
-- (security definer) al aceptar el reto.
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase. Requiere migrations/duel-facts.sql ya aplicado.
-- ============================================================

create table if not exists public.hangman_word_bank (
  id bigint generated always as identity primary key,
  category text not null,
  word text not null,
  hint text not null,
  fact text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists hangman_word_bank_category_idx on public.hangman_word_bank (category);

alter table public.hangman_word_bank enable row level security;
revoke all on public.hangman_word_bank from anon, authenticated;

-- Semillas: fauna, flora y conceptos ambientales de Guatemala (ODS 14 vida
-- submarina / ODS 15 vida de ecosistemas terrestres). Palabras sin tildes/
-- ñ/espacios porque el teclado del juego es A-Z simple, igual que exige
-- normalizeWord() en la función de IA.
insert into public.hangman_word_bank (category, word, hint, fact)
select * from (values
  ('Vida silvestre de Guatemala', 'QUETZAL', 'Ave nacional de Guatemala, símbolo de libertad.', 'El quetzal no sobrevive en cautiverio -- prefiere dejar de comer antes que perder su libertad, por eso es símbolo de independencia.'),
  ('Vida silvestre de Guatemala', 'JAGUAR', 'El felino más grande de las selvas de Petén.', 'El jaguar es clave para el ODS 15: como depredador tope, controla otras poblaciones y mantiene sano el ecosistema.'),
  ('Vida silvestre de Guatemala', 'MANATI', 'Mamífero acuático que vive en los ríos de Izabal.', 'El manatí está en peligro de extinción en Guatemala -- protegerlo es parte del ODS 14 (vida submarina).'),
  ('Vida silvestre de Guatemala', 'CEIBA', 'Árbol nacional de Guatemala, sagrado para los mayas.', 'La ceiba puede vivir más de 300 años y sostiene decenas de especies de aves e insectos en sus ramas.'),
  ('Vida silvestre de Guatemala', 'TAPIR', 'Mamífero de nariz larga que habita la selva de Petén.', 'El tapir dispersa semillas al comer frutas, ayudando a que el bosque se regenere solo.'),
  ('Vida silvestre de Guatemala', 'TORTUGA', 'Reptil que anida en las playas del Pacífico guatemalteco.', 'Las tortugas marinas ayudan a mantener sanos los pastos marinos, comiéndolos antes de que crezcan demasiado.'),
  ('Vida silvestre de Guatemala', 'MANGLAR', 'Bosque costero que crece entre agua salada y dulce.', 'Los manglares protegen la costa de inundaciones y son criadero de peces -- perderlos afecta el ODS 14.'),
  ('Vida silvestre de Guatemala', 'ARRECIFE', 'Estructura submarina de coral que protege las costas.', 'Los arrecifes cubren menos del 1% del océano pero albergan cerca del 25% de toda la vida marina.'),
  ('Vida silvestre de Guatemala', 'CORAL', 'Organismo marino que forma los arrecifes, no es piedra.', 'El coral es un animal, no una planta ni roca -- vive en colonias y es muy sensible al aumento de temperatura del mar.'),
  ('Vida silvestre de Guatemala', 'GUACAMAYA', 'Ave de colores vivos que habita Petén, casi extinta ahí.', 'La guacamaya roja está en peligro crítico en Guatemala -- quedan pocas parejas silvestres en la Reserva de la Biosfera Maya.'),
  ('Vida silvestre de Guatemala', 'COATI', 'Mamífero de cola larga y anillada, pariente del mapache.', 'El coatí (o pizote) es omnívoro y ayuda a controlar insectos y a dispersar semillas en el bosque.'),
  ('Vida silvestre de Guatemala', 'MARIPOSA', 'Insecto polinizador que empieza su vida como oruga.', 'Sin polinizadores como las mariposas y abejas, muchas plantas no podrían reproducirse ni dar fruto.'),
  ('Vida silvestre de Guatemala', 'ABEJA', 'Insecto que polinza flores y vive en colmenas.', 'Casi 1 de cada 3 bocados de comida en el mundo depende de la polinización de abejas y otros insectos.'),
  ('Vida silvestre de Guatemala', 'ATITLAN', 'Lago rodeado de tres volcanes en Sololá.', 'El lago de Atitlán sufre de exceso de nutrientes (fósforo) que provoca proliferación de algas -- un caso real de eutrofización.'),
  ('Vida silvestre de Guatemala', 'PETEN', 'Departamento con la selva tropical más grande de Guatemala.', 'Petén alberga la Reserva de la Biosfera Maya, uno de los pulmones forestales más grandes de Centroamérica.'),
  ('Vida silvestre de Guatemala', 'HABITAT', 'Lugar donde vive y se reproduce naturalmente una especie.', 'Perder el hábitat es la principal causa de extinción de especies a nivel mundial, más que la caza.'),
  ('Vida silvestre de Guatemala', 'ECOSISTEMA', 'Conjunto de seres vivos y su ambiente interactuando.', 'En un ecosistema sano, cada especie cumple un rol -- quitar una sola puede desordenar todo el equilibrio.'),
  ('Vida silvestre de Guatemala', 'BIODIVERSIDAD', 'Variedad de especies vivas que hay en un lugar.', 'Guatemala es uno de los países con mayor biodiversidad del mundo en relación a su tamaño territorial.'),
  ('Vida silvestre de Guatemala', 'DEFORESTACION', 'Tala masiva de árboles que destruye el bosque.', 'Guatemala pierde miles de hectáreas de bosque cada año, sobre todo por avance de tierras agrícolas y ganaderas.'),
  ('Vida silvestre de Guatemala', 'RECICLAJE', 'Proceso de reusar materiales en vez de tirarlos.', 'Reciclar plástico ayuda directo al ODS 14: buena parte de la basura marina es plástico que llegó desde tierra.')
) as v(category, word, hint, fact)
where not exists (
  select 1 from public.hangman_word_bank b where b.category = v.category and b.word = v.word
);

-- Elige una palabra al azar de la categoría del duelo (sin repetir las
-- últimas usadas en esa misma categoría) y la asigna, igual que hace
-- ai-generate-hangman-word pero sin llamar a la IA.
create or replace function public.assign_hangman_bank_word(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duel record;
  v_row record;
begin
  select id, topic, word, challenger_id, opponent_id into v_duel
  from public.student_hangman_duels where id = p_duel_id;

  if v_duel.id is null then
    raise exception 'Desafío no encontrado';
  end if;
  if auth.uid() not in (v_duel.challenger_id, v_duel.opponent_id) then
    raise exception 'No autorizado';
  end if;
  if v_duel.word is not null then
    return; -- ya generado, no regenerar (mismo criterio que la función de IA)
  end if;

  select id, word, hint, fact into v_row
  from public.hangman_word_bank
  where category = v_duel.topic
    and word not in (
      select word from public.student_hangman_duels
      where topic = v_duel.topic and word is not null
      order by created_at desc limit 30
    )
  order by random() limit 1;

  if v_row.id is null then
    select id, word, hint, fact into v_row
    from public.hangman_word_bank where category = v_duel.topic
    order by random() limit 1;
  end if;

  if v_row.id is null then
    raise exception 'No hay palabras en el banco para esta categoría';
  end if;

  update public.student_hangman_duels
  set word = v_row.word, hint = v_row.hint, status = 'active'
  where id = p_duel_id and word is null;

  if v_row.fact is not null then
    insert into public.duel_facts (game, duel_id, fact)
    values ('hangman', p_duel_id, v_row.fact)
    on conflict (game, duel_id) do update set fact = excluded.fact;
  end if;
end;
$$;

grant execute on function public.assign_hangman_bank_word(uuid) to authenticated;

notify pgrst, 'reload schema';
