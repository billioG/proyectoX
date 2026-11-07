-- Marca propia del colegio: nombre y logo que se ven en el encabezado de la app.
-- Siempre se muestra también «Hecho por Yo Aprendo · Quetzal LMS» (eso vive en la app, no aquí).
--
-- ORDEN: aplicar ESTA migración ANTES de volver a desplegar la función node-sync
-- (la función ahora pide estas dos columnas; si no existen, la sincronización del nodo falla).
--
-- Idempotente: se puede correr más de una vez.

alter table public.schools add column if not exists brand_name text;
alter table public.schools add column if not exists logo_data text;

-- Límites: nombre corto y logo pequeño (imagen ya reducida por la app, guardada como data URL).
alter table public.schools drop constraint if exists schools_brand_name_len;
alter table public.schools add constraint schools_brand_name_len
  check (brand_name is null or char_length(brand_name) <= 60);

alter table public.schools drop constraint if exists schools_logo_data_fmt;
alter table public.schools add constraint schools_logo_data_fmt
  check (logo_data is null
         or (char_length(logo_data) <= 150000
             and logo_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'));

comment on column public.schools.brand_name is 'Nombre que el colegio quiere ver en el encabezado (opcional).';
comment on column public.schools.logo_data is 'Logo del colegio como data URL png/jpeg/webp (máx. 150 000 caracteres).';
