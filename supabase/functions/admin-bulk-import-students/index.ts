// Edge Function: admin-bulk-import-students
// Crea en lote las cuentas de alumnos extraídas de un PDF/CSV de roster.
// auth.signUp() público está limitado por Supabase (rate limit anti-spam,
// ~decenas por hora) -- imposible de usar para importar cientos de alumnos
// de una vez. Esta función usa la Admin API (service role), que no tiene
// ese límite, y corre server-side gateada por is_admin() real.

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

type StudentRow = {
  fullName: string; username: string; email: string; password: string;
  school_code?: string | null; grade?: string | null; section?: string | null;
  cui?: string | null; gender?: string | null; birth_date?: string | null; codigo_personal?: string | null;
};

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
  if (callerRow?.role !== 'admin') return json({ error: 'Solo administradores pueden importar alumnos' }, 403);

  try {
    const { students } = await req.json();
    if (!Array.isArray(students) || !students.length) {
      return json({ error: 'students debe ser un array no vacío' }, 400);
    }
    if (students.length > 1000) {
      return json({ error: 'Máximo 1000 alumnos por importación' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const results: Array<{ username: string; status: string; message?: string }> = [];

    for (const s of students as StudentRow[]) {
      const username = String(s.username || '').trim();
      const email = String(s.email || '').trim().toLowerCase();
      const fullName = String(s.fullName || '').trim();
      const password = String(s.password || '');

      if (!email || !password || !fullName) {
        results.push({ username: username || '(vacío)', status: 'error', message: 'Faltan datos requeridos' });
        continue;
      }

      try {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });

        if (createErr) {
          const isDupe = createErr.message?.toLowerCase().includes('already') || createErr.message?.toLowerCase().includes('registered');
          results.push({ username, status: isDupe ? 'skipped' : 'error', message: createErr.message });
          continue;
        }

        const { error: dbError } = await admin.from('students').insert({
          id: created.user.id,
          full_name: fullName,
          username,
          email,
          school_code: s.school_code || null,
          grade: s.grade || null,
          section: s.section || null,
          cui: s.cui || null,
          gender: s.gender || null,
          birth_date: s.birth_date || null,
          codigo_personal: s.codigo_personal || null,
          password_generated: password,
        });

        if (dbError) {
          await admin.auth.admin.deleteUser(created.user.id);
          results.push({ username, status: 'error', message: dbError.message });
          continue;
        }

        results.push({ username, status: 'created' });
      } catch (e) {
        results.push({ username, status: 'error', message: String(e) });
      }
    }

    return json({ ok: true, results });

  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
