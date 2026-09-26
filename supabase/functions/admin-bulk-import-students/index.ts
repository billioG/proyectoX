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

// Antes Access-Control-Allow-Origin: '*' -- cualquier sitio podía llamar
// esta función desde el navegador de un usuario logueado. Se restringe a
// los dominios reales donde corre la app (GitHub Pages + dominio propio).
const ALLOWED_ORIGINS = new Set([
  'https://clases.yoaprendo.online',
  'https://billiog.github.io',
]);

type StudentRow = {
  fullName: string; username?: string; email?: string; password?: string;
  school_code?: string | null; grade?: string | null; section?: string | null;
  cui?: string | null; gender?: string | null; birth_date?: string | null; codigo_personal?: string | null;
};

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
  // Admin: cualquier clase. Docente: solo alumnos de SUS clases asignadas
  // (así no depende del admin para sumar un alumno nuevo).
  if (!callerRow) return json({ error: 'Solo docentes o administradores pueden crear alumnos' }, 403);
  const isAdmin = callerRow.role === 'admin';

  try {
    const { students } = await req.json();
    if (!Array.isArray(students) || !students.length) {
      return json({ error: 'students debe ser un array no vacío' }, 400);
    }
    if (students.length > (isAdmin ? 1000 : 100)) {
      return json({ error: `Máximo ${isAdmin ? 1000 : 100} alumnos por vez` }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const results: Array<{ username: string; fullName?: string; status: string; message?: string }> = [];

    let myClasses = new Set<string>();
    if (!isAdmin) {
      const { data: asg } = await admin.from('teacher_assignments').select('school_code, grade, section').eq('teacher_id', caller.id);
      myClasses = new Set((asg || []).map((a: any) => `${a.school_code}|${a.grade}|${a.section}`));
    }

    // Contraseña de la clase decidida EN SERVIDOR (el docente no puede leer
    // class_passwords.password): la de la clase o, si la clase es nueva, se
    // le crea una igual que en la importación del admin (8 caracteres sin
    // ambiguos, requiere contraseña) -- así los alumnos pueden entrar ya.
    const classPwCache = new Map<string, string>();
    const classesWithNewPassword = new Set<string>();
    const randomPw = () => {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      return Array.from(bytes, b => chars[b % chars.length]).join('');
    };
    async function classPassword(school: string, grade: string, section: string) {
      const key = `${school}|${grade}|${section}`;
      if (!classPwCache.has(key)) {
        const { data } = await admin.from('class_passwords').select('password, requires_password')
          .eq('school_code', school).eq('grade', grade).eq('section', section).maybeSingle();
        let pw = data?.requires_password !== false && data?.password ? data.password : randomPw();
        if (!data) {
          const { error } = await admin.from('class_passwords')
            .upsert({ school_code: school, grade, section, password: pw, requires_password: true }, { onConflict: 'school_code,grade,section' });
          if (!error) classesWithNewPassword.add(key);
        }
        classPwCache.set(key, pw);
      }
      return classPwCache.get(key)!;
    }

    // Usuario con la MISMA nomenclatura que la importación del admin
    // (pdf-processor.js / generateUsernameVariants): inicial del nombre +
    // primer apellido ("jperez"); si está tomado, en cascada inicial del
    // segundo nombre, segundo apellido, etc., y recién al final un número.
    // Nombre escrito como "Nombre1 [Nombre2] Apellido1 [Apellido2]".
    const usedInBatch = new Set<string>();
    async function uniqueUsername(fullName: string) {
      const parts = fullName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
      const n1 = parts[0] || '';
      let n2 = '', a1 = '', a2 = '';
      if (parts.length === 2) a1 = parts[1];
      else if (parts.length === 3) { n2 = parts[1]; a1 = parts[2]; }
      else if (parts.length >= 4) { n2 = parts[1]; a1 = parts[2]; a2 = parts[3]; }
      if (!a1) a1 = '1bot';

      const seen = new Set<string>();
      const candidates: string[] = [];
      const tryAdd = (v: string | false) => { if (v && v.length > 1 && !seen.has(v)) { seen.add(v); candidates.push(v); } };
      tryAdd(n1.charAt(0) + a1);
      tryAdd(!!n2 && n1.charAt(0) + n2.charAt(0) + a1);
      tryAdd(!!a2 && a2 !== a1 && n1.charAt(0) + a2);
      tryAdd(!!a2 && a2 !== a1 && !!n2 && n1.charAt(0) + n2.charAt(0) + a2);
      tryAdd(!!n2 && n1.charAt(0) + n2);
      tryAdd(!!a1 && n1 + a1.charAt(0));
      tryAdd(!!a2 && a2 !== a1 && a1.charAt(0) + a2);
      tryAdd(!!a2 && a2 !== a1 && n1 + a2.charAt(0));
      const base = candidates[0] || (n1 + a1) || 'estudiante';
      for (let i = 1; i <= 200; i++) candidates.push(base + i);

      const { data: taken } = await admin.from('students').select('username').in('username', candidates);
      const takenSet = new Set((taken || []).map((r: any) => r.username));
      const pick = candidates.find(c => !takenSet.has(c) && !usedInBatch.has(c)) || `${base}${Date.now() % 100000}`;
      usedInBatch.add(pick);
      return pick;
    }

    for (const s of students as StudentRow[]) {
      const fullName = String(s.fullName || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      if (!isAdmin) {
        if (!myClasses.has(`${s.school_code}|${s.grade}|${s.section}`)) {
          results.push({ username: '', fullName, status: 'error', message: 'Solo podés agregar alumnos en tus clases asignadas' });
          continue;
        }
      }
      const username = String(s.username || '').trim() || (fullName ? await uniqueUsername(fullName) : '');
      const email = (String(s.email || '').trim() || `${username}@estudiante.edu.gt`).toLowerCase();
      const password = String(s.password || '') || (s.school_code && s.grade && s.section
        ? await classPassword(String(s.school_code), String(s.grade), String(s.section)) : randomPw());

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

        const row: Record<string, unknown> = {
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
          created_by: caller.id,
        };
        let { error: dbError } = await admin.from('students').insert(row);
        // Sin migrations/teacher-self-service.sql todavía no existe la
        // columna created_by: se guarda igual, sin ese dato.
        if (dbError && /created_by/.test(dbError.message)) {
          delete row.created_by;
          ({ error: dbError } = await admin.from('students').insert(row));
        }

        if (dbError) {
          await admin.auth.admin.deleteUser(created.user.id);
          results.push({ username, fullName, status: 'error', message: dbError.message });
          continue;
        }

        results.push({ username, fullName, status: 'created' });
      } catch (e) {
        results.push({ username, status: 'error', message: String(e) });
      }
    }

    // Clases a las que se les generó contraseña recién: el cliente avisa
    // dónde verla/cambiarla.
    return json({ ok: true, results, classes_new_password: [...classesWithNewPassword] });

  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
