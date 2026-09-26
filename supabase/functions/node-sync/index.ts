// Edge Function: node-sync
// Sincronización de un nodo escolar (Raspberry Pi) con la nube.
// NO usa sesión de usuario: el nodo se autentica con su token
// (header x-node-token), cuyo hash vive en school_nodes. Todo lo que lee
// y escribe queda limitado a la escuela de ese nodo.
//
// Deploy con "Verify JWT" en OFF (el nodo no tiene usuario de Supabase).
//
// Body: { push?: { completions?: [], pins?: [], sessions?: [] } }
// Respuesta: alumnos, cursos (con lecciones), progreso y archivos de la
// escuela, más cuántas cosas se aplicaron del push.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'course-content';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// PostgREST corta en 1000 filas: se pide por páginas.
async function fetchAll(build: (from: number, to: number) => any, pageSize = 1000) {
  let rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

// .in() con cientos de ids arma una URL demasiado larga -- por tandas.
function chunk<T>(arr: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function listStorageRecursive(admin: any, path: string): Promise<{ path: string; size: number; etag: string }[]> {
  const out: { path: string; size: number; etag: string }[] = [];
  const { data, error } = await admin.storage.from(BUCKET).list(path, { limit: 1000 });
  if (error || !data) return out;
  for (const item of data) {
    const full = `${path}/${item.name}`;
    if (item.id === null) out.push(...await listStorageRecursive(admin, full));
    else out.push({ path: full, size: item.metadata?.size || 0, etag: item.metadata?.eTag || item.updated_at || '' });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const token = req.headers.get('x-node-token') || '';
  if (token.length < 32) return json({ error: 'Token de nodo requerido' }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
  const { data: node } = await admin.from('school_nodes')
    .select('id, school_code, name, revoked_at').eq('token_hash', await sha256Hex(token)).maybeSingle();
  if (!node || node.revoked_at) return json({ error: 'Nodo no autorizado o revocado' }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const push = body?.push || {};

    const students = await fetchAll((from, to) => admin.from('students')
      .select('id, username, full_name, grade, section, profile_photo_url, status, companion_species, gems_earned_total, companion_equipped, pin_hash, pin_salt, pin_updated_at')
      .eq('school_code', node.school_code).order('id').range(from, to));
    const studentIds = new Set(students.map((s: any) => s.id));

    // ---- PUSH ----
    let appliedCompletions = 0, appliedPins = 0, appliedSessions = 0;

    const completions = (push.completions || []).filter((c: any) => studentIds.has(c.student_id) && c.lesson_id);
    if (completions.length) {
      const existing: any[] = [];
      for (const ids of chunk([...new Set(completions.map((c: any) => c.student_id as string))])) {
        const { data } = await admin.from('lesson_completions')
          .select('lesson_id, student_id, score, status').in('student_id', ids);
        existing.push(...(data || []));
      }
      const byKey = new Map(existing.map((e: any) => [`${e.lesson_id}|${e.student_id}`, e]));
      const rows = completions.map((c: any) => {
        const prev: any = byKey.get(`${c.lesson_id}|${c.student_id}`);
        const score = c.score == null ? (prev?.score ?? null)
          : prev?.score == null ? Math.min(100, Math.max(0, c.score)) : Math.max(prev.score, Math.min(100, Math.max(0, c.score)));
        const status = prev?.status === 'completed' || c.status === 'completed' ? 'completed' : (c.status || 'completed');
        return { lesson_id: c.lesson_id, student_id: c.student_id, score, status };
      });
      const { error } = await admin.from('lesson_completions').upsert(rows, { onConflict: 'lesson_id,student_id' });
      if (error) throw error;
      appliedCompletions = rows.length;
    }

    for (const p of (push.pins || [])) {
      if (!studentIds.has(p.student_id) || !p.pin_hash || !p.pin_salt || !p.pin_updated_at) continue;
      const current: any = students.find((s: any) => s.id === p.student_id);
      if (current?.pin_updated_at && new Date(current.pin_updated_at) >= new Date(p.pin_updated_at)) continue;
      const { error } = await admin.from('students')
        .update({ pin_hash: p.pin_hash, pin_salt: p.pin_salt, pin_updated_at: p.pin_updated_at })
        .eq('id', p.student_id);
      if (!error) {
        appliedPins++;
        Object.assign(current, { pin_hash: p.pin_hash, pin_salt: p.pin_salt, pin_updated_at: p.pin_updated_at });
      }
    }

    const sessions = (push.sessions || []).filter((s: any) => studentIds.has(s.student_id) && s.entered_at)
      .map((s: any) => ({ node_id: node.id, student_id: s.student_id, device: String(s.device || '').slice(0, 120), entered_at: s.entered_at }));
    if (sessions.length) {
      const { error } = await admin.from('node_session_logs').insert(sessions);
      if (!error) appliedSessions = sessions.length;
    }

    // ---- PULL ----
    const courses = await fetchAll((from, to) => admin.from('courses')
      .select('*, lessons(*)').eq('school_code', node.school_code).order('id').range(from, to));

    const allCompletions: any[] = [];
    for (const ids of chunk([...studentIds] as string[])) {
      allCompletions.push(...await fetchAll((from, to) => admin.from('lesson_completions')
        .select('lesson_id, student_id, score, status, completed_at')
        .in('student_id', ids).order('lesson_id').range(from, to)));
    }

    // Archivos a espejar en el nodo: paquetes (content_path) y archivos
    // sueltos del propio Storage. Links externos (YouTube, Tinkercad) no.
    const storagePrefix = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
    const files: { path: string; size: number; etag: string }[] = [];
    for (const course of courses) {
      for (const lesson of course.lessons || []) {
        if (lesson.content_path) files.push(...await listStorageRecursive(admin, lesson.content_path));
        else if (typeof lesson.content_url === 'string' && lesson.content_url.startsWith(storagePrefix)) {
          files.push({ path: decodeURIComponent(lesson.content_url.slice(storagePrefix.length)), size: 0, etag: '' });
        }
      }
    }

    const serverTime = new Date().toISOString();
    await admin.from('school_nodes').update({
      last_sync_at: serverTime,
      last_sync_info: { students: students.length, courses: courses.length, files: files.length, appliedCompletions, appliedPins, appliedSessions },
    }).eq('id', node.id);

    return json({
      server_time: serverTime,
      node: { id: node.id, name: node.name, school_code: node.school_code },
      storage_base: storagePrefix,
      students,
      courses,
      completions: allCompletions,
      files,
      applied: { completions: appliedCompletions, pins: appliedPins, sessions: appliedSessions },
    });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
