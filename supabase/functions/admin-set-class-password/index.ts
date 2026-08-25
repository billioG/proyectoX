// Edge Function: admin-set-class-password
// Fija (o desactiva) la contraseña compartida de una clase (escuela +
// grado + sección) y sincroniza la contraseña real de Supabase Auth de
// cada alumno matriculado en esa clase, para que quede consistente con
// lo que se guarda en class_passwords.

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
  if (callerRow?.role !== 'admin') return json({ error: 'Solo administradores pueden configurar contraseñas de clase' }, 403);

  try {
    const body = await req.json();
    const school_code = String(body?.school_code || '').trim();
    const grade = String(body?.grade || '').trim();
    const section = String(body?.section || '').trim();
    const requires_password = body?.requires_password !== false;
    const password = body?.password ? String(body.password) : null;

    if (!school_code || !grade || !section) {
      return json({ error: 'school_code, grade y section son requeridos' }, 400);
    }
    if (requires_password && (!password || password.length < 4)) {
      return json({ error: 'La contraseña debe tener al menos 4 caracteres' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { error: upsertErr } = await admin.from('class_passwords').upsert({
      school_code,
      grade,
      section,
      password: password || '',
      requires_password,
      updated_at: new Date().toISOString(),
      updated_by: caller.id,
    }, { onConflict: 'school_code,grade,section' });

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    let updated = 0;
    const errors: string[] = [];

    if (requires_password && password) {
      const { data: students, error: studentsErr } = await admin
        .from('students')
        .select('id')
        .eq('school_code', school_code)
        .eq('grade', grade)
        .eq('section', section);

      if (studentsErr) return json({ error: studentsErr.message }, 500);

      for (const s of students || []) {
        const { error: updErr } = await admin.auth.admin.updateUserById(s.id, { password });
        if (updErr) errors.push(`${s.id}: ${updErr.message}`);
        else updated++;
      }
    }

    return json({ ok: true, updated, errors });

  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
