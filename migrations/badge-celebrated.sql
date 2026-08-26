-- El "ya vi esta insignia" se guardaba en localStorage (por dispositivo) --
-- por eso en un dispositivo nuevo se repetía la animación de desbloqueo
-- para insignias ya ganadas hace tiempo. Se mueve a la base para que sea
-- por CUENTA, no por dispositivo.
alter table public.student_badges add column if not exists celebrated boolean not null default false;
alter table public.teacher_badges add column if not exists celebrated boolean not null default false;

-- Insignias que ya existían antes de este cambio: se marcan como "ya
-- celebradas" para no disparar la animación retroactivamente a todo el mundo.
update public.student_badges set celebrated = true where celebrated = false;
update public.teacher_badges set celebrated = true where celebrated = false;

notify pgrst, 'reload schema';
