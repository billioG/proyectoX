-- ============================================================
-- Ponderación de cursos + Código Personal (para export estilo SIRE)
-- ============================================================

alter table public.courses add column if not exists weight integer not null default 100 check (weight >= 0 and weight <= 100);
alter table public.courses add column if not exists bimestre integer not null default 1 check (bimestre between 1 and 4);

-- Código Personal del MINEDUC (distinto del CUI) -- el SIRE lo exige y no
-- se recolectaba en el sistema hasta ahora. Se llena a mano por el docente/
-- admin; queda opcional para no romper el flujo existente de alta de alumnos.
alter table public.students add column if not exists codigo_personal text;

notify pgrst, 'reload schema';
