// Edge Function: student-login
// Login de alumnos por usuario, con soporte para clases "sin
// contraseña" (estilo Kolibri): si la clase (escuela+grado+sección)
// tiene requires_password=false, el alumno entra solo con su usuario.
// La contraseña de clase nunca se expone al cliente -- se valida
// server-side con la service role y, si todo está bien, se emite una
// sesión real vía magic link (generateLink + verifyOtp), sin que el
// cliente vea ni maneje ninguna contraseña real de Supabase Auth.
//
// Pública a propósito (es el mecanismo de login en sí -- todavía no
// hay sesión). No confundir con las demás funciones admin-*, que sí
// exigen JWT de admin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Antes Access-Control-Allow-Origin: '*' -- cualquier sitio podía llamar
// esta función desde el navegador de un usuario logueado. Se restringe a
// los dominios reales donde corre la app (GitHub Pages + dominio propio).
const ALLOWED_ORIGINS = new Set([
  'https://clases.yoaprendo.online',
  'https://billiog.github.io',
]);

const GENERIC_ERROR = 'Usuario o contraseña incorrectos';

// Rate limit por IP -- este endpoint es público (necesario, es el login en
// sí) y valida contra una contraseña de CLASE compartida entre toda una
// sección, así que sin esto un script podía probar usuarios/contraseñas
// sin límite. No es por-usuario a propósito: una sección entera comparte
// contraseña, limitar solo por usuario no frenaría probar esa misma
// contraseña contra todos los usuarios de la clase.
const RATE_LIMIT_WINDOW_MIN = 5;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const clientIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const now = new Date();

  const { data: rl } = await admin.from('login_rate_limit').select('*').eq('ip', clientIp).maybeSingle();
  const withinWindow = rl && (now.getTime() - new Date(rl.window_start).getTime()) / 60000 < RATE_LIMIT_WINDOW_MIN;

  if (withinWindow && rl!.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    return json({ error: 'Demasiados intentos -- esperá unos minutos y volvé a intentar' }, 429);
  }

  async function recordFailure() {
    if (withinWindow) {
      await admin.from('login_rate_limit').update({ attempts: rl!.attempts + 1 }).eq('ip', clientIp);
    } else {
      await admin.from('login_rate_limit').upsert({ ip: clientIp, attempts: 1, window_start: now.toISOString() });
    }
  }
  async function recordSuccess() {
    if (rl) await admin.from('login_rate_limit').delete().eq('ip', clientIp);
  }

  try {
    const body = await req.json();
    const username = String(body?.username || '').trim().toLowerCase();
    const password = body?.password ? String(body.password) : '';

    if (!username) { await recordFailure(); return json({ error: GENERIC_ERROR }, 401); }

    const { data: student } = await admin
      .from('students')
      .select('id, email, school_code, grade, section, password_generated')
      .eq('username', username)
      .maybeSingle();

    if (!student) { await recordFailure(); return json({ error: GENERIC_ERROR }, 401); }

    const { data: classRow } = await admin
      .from('class_passwords')
      .select('password, requires_password')
      .eq('school_code', student.school_code || '')
      .eq('grade', student.grade || '')
      .eq('section', student.section || '')
      .maybeSingle();

    if (classRow) {
      if (classRow.requires_password) {
        if (!password || password !== classRow.password) { await recordFailure(); return json({ error: GENERIC_ERROR }, 401); }
      }
      // requires_password === false -> entra solo con el usuario, sin chequear nada más.
    } else {
      // Sin configuración de clase todavía -- se cae al valor legacy
      // guardado por alumno al momento de importarlo.
      if (!password || password !== student.password_generated) { await recordFailure(); return json({ error: GENERIC_ERROR }, 401); }
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: student.email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      return json({ error: 'No se pudo iniciar sesión, intenta de nuevo' }, 500);
    }

    await recordSuccess();
    return json({ ok: true, email: student.email, token_hash: link.properties.hashed_token });

  } catch (e) {
    await recordFailure();
    return json({ error: GENERIC_ERROR }, 401);
  }
});
