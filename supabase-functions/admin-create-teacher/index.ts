// Edge Function: admin-create-teacher
// Crea una cuenta de docente sin arriesgar la sesión del admin que la crea
// (el flujo anterior usaba auth.signUp() desde el cliente, que puede
// reemplazar la sesión activa por la del docente recién creado si la
// confirmación de email está desactivada).
// Requiere JWT de un admin real (verificado contra teachers.role, nunca
// contra user_metadata) y usa la service role key solo server-side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // 1. Verificar que el caller es un admin autenticado real
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
  if (callerRow?.role !== 'admin') return json({ error: 'Solo administradores pueden crear docentes' }, 403);

  try {
    const body = await req.json();
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const phone = body?.phone ? String(body.phone).trim() : null;
    const birth = body?.birth || null;
    const password = String(body?.password || '');
    const is1bot = !!body?.is1bot;

    if (!name || !email || !password) return json({ error: 'Completa nombre, email y contraseña' }, 400);
    if (password.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400);

    // 2. Cliente con service role -- crea el usuario de Auth sin tocar la
    // sesión del admin que está llamando a esta función.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (createErr) return json({ error: createErr.message }, 500);

    const { error: dbError } = await admin.from('teachers').insert({
      id: created.user.id,
      full_name: name,
      email,
      phone,
      birth_date: birth,
      role: 'docente',
      is_1bot_team: is1bot,
    });

    if (dbError) {
      // Rollback: si falla el insert en teachers, no dejar un usuario de Auth huérfano
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: dbError.message }, 500);
    }

    return json({ ok: true, id: created.user.id, email });

  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
