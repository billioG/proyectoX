// Edge Function: admin-delete-students
// Elimina uno o varios alumnos por completo: la fila en public.students
// Y su cuenta real de Supabase Auth (el borrado directo desde el cliente
// solo tocaba la tabla, dejaba la cuenta de Auth huérfana -- el email y
// el usuario quedaban "tomados" para siempre, ni se podían reimportar).

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
  if (callerRow?.role !== 'admin') return json({ error: 'Solo administradores pueden eliminar alumnos' }, 403);

  try {
    const body = await req.json();
    const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
    if (!ids.length) return json({ error: 'ids debe ser un array no vacío' }, 400);
    if (ids.length > 1000) return json({ error: 'Máximo 1000 alumnos por operación' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    let deleted = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        const { error: dbErr } = await admin.from('students').delete().eq('id', id);
        if (dbErr) { errors.push(`${id}: ${dbErr.message}`); continue; }

        const { error: authDelErr } = await admin.auth.admin.deleteUser(id);
        // Si la cuenta de Auth ya no existía (borrada antes de este fix), no es un error real.
        if (authDelErr && !authDelErr.message?.toLowerCase().includes('not found') && !authDelErr.message?.toLowerCase().includes('not exist')) {
          errors.push(`${id} (auth): ${authDelErr.message}`);
        }
        deleted++;
      } catch (e) {
        errors.push(`${id}: ${String(e)}`);
      }
    }

    return json({ ok: true, deleted, errors });

  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
