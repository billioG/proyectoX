// Edge Function: admin-force-delete-school
// Borra un establecimiento y TODO lo que depende de él: asistencias,
// solicitudes de permiso, grupos, asistencia de tutores, auditorías de
// activos, hitos estacionales, contraseñas de clase, asignaciones de
// docentes, y los alumnos matriculados (incluidas sus cuentas reales de
// Auth). Acción irreversible -- pensada para el botón "Forzar
// eliminación" que exige escribir el nombre exacto del establecimiento.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Antes Access-Control-Allow-Origin: '*' -- cualquier sitio podía llamar
// esta función desde el navegador de un usuario logueado. Se restringe a
// los dominios reales donde corre la app (GitHub Pages + dominio propio).
const ALLOWED_ORIGINS = new Set([
  'https://clases.yoaprendo.online',
  'https://billiog.github.io',
]);

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const CORS = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://clases.yoaprendo.online',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
  if (authErr || !caller) return json({ error: 'Invalid token' }, 401);

  const { data: callerRow } = await callerClient
    .from('teachers')
    .select('role')
    .eq('id', caller.id)
    .maybeSingle();
  if (callerRow?.role !== 'admin') return json({ error: 'Solo administradores pueden forzar esta eliminación' }, 403);

  try {
    const { schoolId, confirmName } = await req.json();
    if (!schoolId) return json({ error: 'schoolId es requerido' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: school, error: schoolErr } = await admin.from('schools').select('id, code, name').eq('id', schoolId).maybeSingle();
    if (schoolErr) return json({ error: schoolErr.message }, 500);
    if (!school) return json({ error: 'Establecimiento no encontrado' }, 404);
    if (String(confirmName || '').trim() !== school.name) {
      return json({ error: 'El nombre no coincide con el establecimiento' }, 400);
    }

    const code = school.code;

    // Salvaguarda crítica: todo el borrado de abajo filtra por school_code
    // (texto, sin FK real a schools.id) porque así está modelado el resto
    // del esquema (students/attendance/etc. no tienen school_id). Si OTRO
    // establecimiento comparte ese mismo código -- códigos mal cargados o
    // duplicados, ya visto en el dashboard como "código desconocido" -- este
    // borrado se llevaría también sus alumnos, asistencias y asignaciones
    // por delante sin que el admin se entere. Se rechaza la operación en
    // vez de borrar a ciegas.
    const { data: sameCodeSchools, error: dupErr } = await admin.from('schools').select('id, name').eq('code', code).neq('id', schoolId);
    if (dupErr) return json({ error: dupErr.message }, 500);
    if (sameCodeSchools && sameCodeSchools.length > 0) {
      return json({
        error: `El código "${code}" también lo usa: ${sameCodeSchools.map(s => s.name).join(', ')}. Corregí los códigos duplicados en Establecimientos antes de forzar esta eliminación -- si no, se borrarían los datos de esos otros establecimientos también.`,
      }, 409);
    }

    const removed: Record<string, number> = {};

    const delByCode = async (table: string) => {
      const { data, error } = await admin.from(table).delete().eq('school_code', code).select('id');
      if (error) throw new Error(`${table}: ${error.message}`);
      removed[table] = data?.length || 0;
    };
    const delById = async (table: string) => {
      const { data, error } = await admin.from(table).delete().eq('school_id', school.id).select('id');
      if (error) throw new Error(`${table}: ${error.message}`);
      removed[table] = data?.length || 0;
    };

    // Alumnos: borrar sus cuentas de Auth primero, después la fila.
    const { data: students } = await admin.from('students').select('id').eq('school_code', code);
    for (const s of students || []) {
      await admin.auth.admin.deleteUser(s.id).catch(() => {});
    }
    await delByCode('students');

    await delByCode('attendance');
    await delByCode('attendance_waivers');
    await delByCode('groups');
    await delByCode('teacher_assignments');
    await delById('tutor_attendance');
    await delById('asset_audits');
    await delById('seasonal_milestones');
    await admin.from('class_passwords').delete().eq('school_code', code);

    const { error: schoolDelErr } = await admin.from('schools').delete().eq('id', schoolId);
    if (schoolDelErr) return json({ error: schoolDelErr.message, removed }, 500);

    return json({ ok: true, removed });

  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
