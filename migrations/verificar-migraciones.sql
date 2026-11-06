-- ============================================================
-- VERIFICAR QUÉ MIGRACIONES YA ESTÁN CORRIDAS (solo lectura)
--
-- No cambia nada: solo hace SELECT sobre el catálogo de la base. Pegar completo
-- en el SQL Editor de Supabase. Devuelve una fila por comprobación, en el ORDEN
-- SEGURO de aplicación (ver docs/MIGRATIONS.md, «Orden seguro de lo pendiente»):
--   aplicada = true   -> el objeto que crea esa migración ya existe
--   aplicada = false  -> falta correr la migración
-- Corre las que den false, de arriba hacia abajo, y vuelve a ejecutar este archivo.
--
-- Las comprobaciones de seguridad («sin_anon», «sin_politica») dan true cuando
-- la exposición YA está cerrada. Una migración con varias filas está aplicada
-- cuando TODAS sus filas dan true.
-- ============================================================
with comprobaciones(orden, migracion, tipo, objeto, extra) as (values
  -- Fase 1: seguridad crítica (en este orden, cada una depende de la anterior)
  (10,  'fix-password-reset-rpc-exposure',        'sin_anon',        'admin_reset_user_password', null),
  (11,  'fix-password-reset-rpc-exposure',        'sin_anon',        'reset_password_via_admin',  null),
  (20,  'fix-students-and-notifications-rls',     'sin_politica',    'students.students_select_authenticated', null),
  (30,  'fix-students-rls-recursion',             'funcion',         'my_classroom_key', null),
  (40,  'fix-votes-and-evaluations-exposure',     'sin_anon',        'increment_votes', null),
  (41,  'fix-votes-and-evaluations-exposure',     'sin_anon',        'decrement_votes', null),
  -- Fase 2: correcciones de coordinador y proyectos
  (50,  'fix-is-staff-coordinador',               'funcion_contiene','is_staff', 'coordinador'),
  (60,  'fix-coordinator-own-schools',            'funcion_contiene','set_school_public_projects', 'teacher_assignments'),
  (70,  'fix-cross-school-public-projects',       'funcion',         'project_author_visible', null),
  (80,  'fix-toggle-project-like-integer',        'funcion_args',    'toggle_project_like', 'integer'),
  -- Fase 3: funciones de la app anteriores a v1.0.130
  (90,  'sync-queue-idempotency',                 'funcion',         'sync_save_evaluation', null),
  (91,  'sync-queue-idempotency',                 'columna',         'tutor_attendance.client_ref', null),
  (100, 'student-pin-cloud',                      'funcion',         'set_student_pin', null),
  (110, 'hangman-word-bank',                      'tabla',           'hangman_word_bank', null),
  (120, 'timed-math-word-problems',               'funcion_contiene','generate_math_problems', 'cooperativa'),
  (130, 'companion-panda',                        'funcion_contiene','is_companion_species', 'panda'),
  -- Fase 4: retos, reacciones, exámenes y progreso (v1.0.147 a v1.0.166)
  (140, 'duel-per-player-content',                'columna',         'student_duels.questions_b', null),
  (150, 'project-reactions',                      'columna',         'project_likes.reaction', null),
  (151, 'project-reactions',                      'funcion',         'react_to_project', null),
  (160, 'project-reactions-ranking-count',        'funcion_contiene','react_to_project', 'excelente'),
  (170, 'project-reaction-notifications',         'tabla',           'project_reaction_notifications', null),
  (180, 'project-thumbnails',                     'columna',         'projects.thumbnail_url', null),
  (190, 'exams',                                  'tabla',           'exams', null),
  (200, 'practice-progress',                      'tabla',           'practice_results', null),
  -- Fase 5: auditoría de octubre (publicar la app v1.0.172 ANTES de security-hardening)
  (210, 'course-resource-weights',                'columna',         'lessons.grade_points', null),
  (220, 'security-hardening-2026-10',             'funcion',         'staff_student_secrets', null),
  -- Fase 6: nodo escolar (antes de publicar la versión de node-sync que las usa)
  (300, 'xp-events',                              'tabla',           'xp_events', null),
  (310, 'node-reactions',                         'funcion',         'apply_node_reaction', null),
  (320, 'node-evaluations',                       'funcion',         'apply_node_evaluation', null),
  (330, 'teacher-node-pin',                       'tabla',           'teacher_node_pins', null),
  (340, 'teacher-node-password',                  'funcion',         'node_teacher_password_hashes', null),
  (350, 'node-companion',                         'funcion',         'apply_node_companion', null),
  (360, 'node-timed-math-duel',                   'funcion',         'apply_node_timed_math_duel', null),
  (370, 'node-hangman-duel',                      'funcion',         'apply_node_hangman_duel', null),
  (380, 'node-profile-photo',                     'funcion',         'apply_node_profile_photo', null),
  (390, 'node-feedback',                          'funcion',         'apply_node_feedback', null),
  (400, 'node-remote-sync',                       'funcion',         'request_node_sync', null),
  (410, 'feedback-inbox',                         'funcion',         'get_feedback_inbox', null),
  -- Fase 7: seguridad de noviembre (docs/SEGURIDAD_2026-11.md; cada una después de security-hardening-2026-10)
  (500, 'ai-usage-limit',                         'tabla',           'ai_usage_daily', null),
  (501, 'ai-usage-limit',                         'funcion',         'ai_usage_take', null),
  (510, 'student-password-hash',                  'columna',         'students.password_hash', null),
  (511, 'student-password-hash',                  'funcion',         'student_password_ok', null),
  (520, 'security-rls-audit-2026-11',             'sin_politica',    'notifications.Anyone can insert notifications', null),
  (521, 'security-rls-audit-2026-11',             'sin_politica',    'teacher_badges.Inserción de insignias', null),
  (530, 'security-function-exposure-2026-11',     'sin_anon_abierto','funciones definer', null),
  (540, 'rls-auth-uid-initplan',                  'sin_auth_uid_suelto','politicas', null),
  -- Fase 8: rendimiento de noviembre (docs/PERFORMANCE.md)
  (600, 'performance-2026-11',                    'funcion_contiene','record_active_heartbeat', 'on conflict'),
  (601, 'random-event-settle-atomic',             'funcion',         'settle_random_event', null)
)
select
  c.orden,
  c.migracion,
  c.tipo || ': ' || c.objeto || coalesce(' (' || c.extra || ')', '') as comprobacion,
  case c.tipo
    when 'tabla' then exists (
      select 1 from pg_tables t where t.schemaname = 'public' and t.tablename = c.objeto)
    when 'columna' then exists (
      select 1 from information_schema.columns k
      where k.table_schema = 'public' and k.table_name = split_part(c.objeto, '.', 1) and k.column_name = split_part(c.objeto, '.', 2))
    when 'funcion' then exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname = c.objeto)
    when 'funcion_contiene' then exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname = c.objeto and p.prosrc ilike '%' || c.extra || '%')
    when 'funcion_args' then exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname = c.objeto and pg_get_function_arguments(p.oid) ilike '%' || c.extra || '%')
    when 'sin_politica' then not exists (
      select 1 from pg_policies o
      where o.schemaname = 'public' and o.tablename = split_part(c.objeto, '.', 1) and o.policyname = split_part(c.objeto, '.', 2))
    when 'sin_anon_abierto' then not exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.prosecdef and p.prokind = 'f'
        and p.proname not in ('resolve_login_mode_by_username', 'get_class_login_mode')
        and case when exists (select 1 from pg_roles where rolname = 'anon')
                 then has_function_privilege('anon', p.oid, 'EXECUTE') else false end)
    when 'sin_auth_uid_suelto' then not exists (
      select 1 from pg_policies o
      where o.schemaname = 'public'
        and (coalesce(o.qual, '') ~* '(?<!select\s)auth\.uid\(\)' or coalesce(o.with_check, '') ~* '(?<!select\s)auth\.uid\(\)'))
    when 'sin_anon' then not exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname = c.objeto
        and case when exists (select 1 from pg_roles where rolname = 'anon')
                 then has_function_privilege('anon', p.oid, 'EXECUTE') else false end)
  end as aplicada
from comprobaciones c
order by c.orden;
