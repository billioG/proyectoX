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

-- ── Color del colegio y lectura pública mínima para la pantalla de entrada (v1.0.232) ──
-- Se puede volver a correr aunque la primera parte ya esté aplicada.
alter table public.schools add column if not exists brand_color text;
alter table public.schools drop constraint if exists schools_brand_color_fmt;
alter table public.schools add constraint schools_brand_color_fmt
  check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');
comment on column public.schools.brand_color is 'Color principal del colegio (#RRGGBB), opcional.';

-- (La vista pública school_brands se define al final de este archivo, con todas las columnas.)

-- ── Segundo y tercer color (v1.0.234) ──
-- brand_color = principal, brand_color2 = secundario (reemplaza índigo, violeta, púrpura y azul),
-- brand_color3 = acento (reemplaza ámbar, naranja y amarillo). Rojo y verde de éxito no cambian.
alter table public.schools add column if not exists brand_color2 text;
alter table public.schools add column if not exists brand_color3 text;
alter table public.schools drop constraint if exists schools_brand_color2_fmt;
alter table public.schools add constraint schools_brand_color2_fmt
  check (brand_color2 is null or brand_color2 ~ '^#[0-9a-fA-F]{6}$');
alter table public.schools drop constraint if exists schools_brand_color3_fmt;
alter table public.schools add constraint schools_brand_color3_fmt
  check (brand_color3 is null or brand_color3 ~ '^#[0-9a-fA-F]{6}$');
comment on column public.schools.brand_color2 is 'Color secundario del colegio (#RRGGBB), opcional.';
comment on column public.schools.brand_color3 is 'Color de acento del colegio (#RRGGBB), opcional.';

-- Vista pública para la pantalla de entrada (sin sesión, porque `schools` solo la leen usuarios con sesión): SOLO código, nombre,
-- logo y colores de los colegios que configuraron su marca. Es una vista (no una función SECURITY DEFINER): no cambia la exposición
-- de funciones a anon. Si ya existía con menos columnas, create or replace solo agrega las nuevas al final.
create or replace view public.school_brands as
  select code, brand_name, logo_data, brand_color, brand_color2, brand_color3
  from public.schools
  where brand_name is not null or logo_data is not null or brand_color is not null
     or brand_color2 is not null or brand_color3 is not null;
revoke all on public.school_brands from public;
grant select on public.school_brands to anon, authenticated;
