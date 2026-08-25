// Edge Function: admin-set-class-password
// Fija (o desactiva) la contraseña compartida de una clase (escuela +
// grado + sección) y sincroniza la contraseña real de Supabase Auth de
// cada alumno matriculado en esa clase. También soporta aplicar el
// mismo cambio a TODAS las clases de un establecimiento de una sola vez
// (apply_to_whole_school: true, sin necesidad de mandar grade/section).

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

function genPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 8; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

async function applyOneClass(
  admin: ReturnType<typeof createClient>,
  callerId: string,
  school_code: string, grade: string, section: string,
  requires_password: boolean, password: string | null,
) {
  const { error: upsertErr } = await admin.from('class_passwords').upsert({
    school_code, grade, section,
    password: password || '',
    requires_password,
    updated_at: new Date().toISOString(),
    updated_by: callerId,
  }, { onConflict: 'school_code,grade,section' });

  if (upsertErr) return { updated: 0, errors: [upsertErr.message] };

  let updated = 0;
  const errors: string[] = [];

  if (requires_password && password) {
    const { data: students, error: studentsErr } = await admin
      .from('students')
      .select('id')
      .eq('school_code', school_code)
      .eq('grade', grade)
      .eq('section', section);

    if (studentsErr) return { updated: 0, errors: [studentsErr.message] };

    for (const s of students || []) {
      const { error: updErr } = await admin.auth.admin.updateUserById(s.id, { password });
      if (updErr) errors.push(`${s.id}: ${updErr.message}`);
      else updated++;
    }
  }

  return { updated, errors };
}

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
    const requires_password = body?.requires_password !== false;
    let password = body?.password ? String(body.password) : null;
    const applyToWholeSchool = !!body?.apply_to_whole_school;

    if (!school_code) return json({ error: 'school_code es requerido' }, 400);
    if (requires_password && !password) password = genPassword();
    if (requires_password && password && password.length < 4) {
      return json({ error: 'La contraseña debe tener al menos 4 caracteres' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (applyToWholeSchool) {
      const { data: combos, error: combosErr } = await admin
        .from('students')
        .select('grade, section')
        .eq('school_code', school_code);
      if (combosErr) return json({ error: combosErr.message }, 500);

      const uniqueCombos = Array.from(
        new Map((combos || []).filter(c => c.grade && c.section).map(c => [`${c.grade}|${c.section}`, c])).values()
      );
      if (!uniqueCombos.length) return json({ error: 'No hay alumnos con grado/sección registrados en ese establecimiento' }, 400);

      let totalUpdated = 0;
      const allErrors: string[] = [];
      const classesApplied: string[] = [];

      for (const combo of uniqueCombos) {
        const { updated, errors } = await applyOneClass(admin, caller.id, school_code, combo.grade, combo.section, requires_password, password);
        totalUpdated += updated;
        allErrors.push(...errors);
        classesApplied.push(`${combo.grade} ${combo.section}`);
      }

      return json({ ok: true, updated: totalUpdated, errors: allErrors, classes: classesApplied, password: requires_password ? password : null });
    }

    const grade = String(body?.grade || '').trim();
    const section = String(body?.section || '').trim();
    if (!grade || !section) return json({ error: 'grade y section son requeridos (o mandá apply_to_whole_school: true)' }, 400);

    const { updated, errors } = await applyOneClass(admin, caller.id, school_code, grade, section, requires_password, password);
    return json({ ok: true, updated, errors, password: requires_password ? password : null });

  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
