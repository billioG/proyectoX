-- ============================================================
-- PASO 2 de 2: hacer PRIVADOS los buckets de fotos, videos y evidencias de estudiantes y docentes.
--
-- ANTES de aplicar:
--   1. Haber aplicado storage-hardening.sql (paso 1).
--   2. Tener publicada la app v1.0.246 o posterior, que firma las direcciones al mostrar fotos y videos (js/private-media.js). Probarlo primero en un proyecto de prueba.
--   3. Entender lo que cambia: sin iniciar sesión ya nadie abre estas direcciones; con sesión, cada foto o video se abre con una dirección firmada que vence a las 2 horas.
--
-- Qué NO cambia: las direcciones que la app guardó en la base (siguen siendo las de siempre; se firman al mostrarlas). El bucket de cursos (course-content) sigue público:
-- es material educativo del docente, no contenido de menores.
--
-- Límite conocido: el servidor escolar (Raspberry) muestra las fotos y videos de la nube con la dirección pública guardada y no firma. Con estos buckets privados,
-- las fotos de OTROS alumnos que vengan de la nube dejan de verse en el nodo (las que se subieron en el propio nodo se siguen sirviendo desde el nodo).
--
-- Seguro de re-ejecutar. Pegar completo en el SQL Editor de Supabase.
-- ============================================================

update storage.buckets
   set public = false
 where id in ('profile-photos', 'project-videos', 'comment-attachments', 'teacher-evidence');

notify pgrst, 'reload schema';

-- Verificación: los 4 deben salir public = false.
select id, public
from storage.buckets
where id in ('profile-photos', 'project-videos', 'comment-attachments', 'teacher-evidence')
order by id;

-- ---------- Deshacer (si algo no se ve) ----------
-- update storage.buckets set public = true where id in ('profile-photos', 'project-videos', 'comment-attachments', 'teacher-evidence');
