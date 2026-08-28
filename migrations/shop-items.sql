-- ============================================================
-- Rediseño de la Tienda de Mascotas: antes 3 de 4 items no hacían nada
-- (mostraban "próximamente"), lo cual no tenía sentido para el usuario.
-- Se sacan los que no hacen nada ("Búho Cibernético", comprar un
-- "Desafío 1v1" cuando ya es gratis crear uno) y se agregan 2 columnas
-- para los 2 items nuevos que sí funcionan: Marco Dorado (borde visible
-- en el ranking) y Gafas de la Mascota (accesorio permanente).
--
-- ADITIVO/NO DESTRUCTIVO. Seguro de re-ejecutar. Pegar completo en el
-- SQL Editor de Supabase.
-- ============================================================

alter table public.students add column if not exists has_gold_frame boolean not null default false;
alter table public.students add column if not exists has_mascot_glasses boolean not null default false;
