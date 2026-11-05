// Edge Function: node-sync
// Sincronización de un nodo escolar (Raspberry Pi) con la nube.
// NO usa sesión de usuario: el nodo se autentica con su token
// (header x-node-token), cuyo hash vive en school_nodes. Todo lo que lee
// y escribe queda limitado a la escuela de ese nodo.
//
// Deploy con "Verify JWT" en OFF (el nodo no tiene usuario de Supabase).
//
// Body: { push?: { completions?: [], pins?: [], sessions?: [], projects?: [] } }
//   o  { action: 'project_upload_url', client_ref, ext, size }  ->  { path, signed_url } (el nodo sube el
//   archivo de un proyecto directo a Storage con esa URL y luego lo confirma en push.projects).
// push.xp_events: cofres diarios que el nodo sorteó sin internet ({ kind:'chest', student_id, ref:'YYYY-MM-DD', xp, gems });
// aquí se validan (xp.ts) y se aplican con apply_node_chest (migrations/xp-events.sql). Los 10 XP por lección los paga
// la nube sola con un disparador al llegar el progreso. Cada alumno del pull trae xp_total, gems y daily_chest_last_claimed.
// push.reactions: la reacción FINAL de un estudiante a un proyecto hecha en el nodo ({ student_id, project_id,
// reaction } con reaction null = la quitó); se validan (reactions.ts) y se aplican con apply_node_reaction
// (migrations/node-reactions.sql), así reenviar lo mismo no suma dos veces. El pull trae las reacciones propias de
// los alumnos del nodo sobre los proyectos de las fichas (`reactions`).
// push.evaluations: evaluaciones de proyectos que un docente hizo en el nodo ({ key, teacher_id, project_id | node_ref,
// <criterio>_score x5, feedback }); se validan (evaluations.ts) y se aplican con apply_node_evaluation
// (migrations/node-evaluations.sql: docente asignado, total recalculado). El pull trae `teachers` (docentes de la
// escuela con sus clases, sin PIN: el PIN personal vive solo en el nodo) y `evaluations` (de los proyectos de las fichas).
// Respuesta: alumnos, cursos (con lecciones), progreso y archivos de la
// escuela, las fichas de proyectos de la clase (sin videos ni rutas de Storage, para el Inicio del
// nodo), más cuántas cosas se aplicaron del push.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildFeedProjects, FEED_LIMIT, nextRoles, validateProjectPush, validateUploadRequest } from './projects.ts';
import { computeStudentXp, validateXpEvent } from './xp.ts';
import { validateReactionEvent } from './validators.ts';
import { buildTeacherList, shapeEvaluations, validateEvaluationEvent } from './evaluations.ts';
import { buildClassVerifiers, buildTeacherLogins, pullTables } from './tables.ts';
import { validatePracticeEvent } from './validators.ts';
import { classifyRead, isUuid, validateAnnouncementEvent, validateReadEvent } from './announcements.ts';
import { sanitizeCompletions, type CompletionRow } from './validators.ts';
import { planContentOps, validateContentUploadRequest, validateObjectPath } from './content.ts';
import { isSocialTable, planSocialOps } from './social.ts';
import { isAttendanceTable, planAttendanceOps } from './attendance.ts';
import { isGroupTable, planGroupOps } from './groups.ts';
import { isExamTable, planExamOps } from './exams.ts';
import { isWaiverTable, planWaiverOps } from './waivers.ts';
import { isCompanionFn, validateCompanionEvent, isProfilePhotoFn, validateProfilePhotoEvent, validateProfilePhotoRequest, PROFILE_PHOTO_BUCKET, isFeedbackFn, validateFeedbackEvent, sanitizeNodeStatus } from './validators.ts';
import { isTimedMathFn, validateTimedMathEvent } from './duels.ts';
import { isHangmanFn, validateHangmanEvent } from './duels.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'course-content';
const PROJECT_BUCKET = 'project-videos';

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

// ---- Sincronización por USB (usb-sync.js en el nodo) ----
// El docente sube desde el navegador el paquete que dejó el nodo en la
// USB. No trae el token del nodo (solo su hash): la autorización es la
// sesión del docente, que tiene que estar asignado a la escuela del nodo
// (o ser admin). La respuesta va cifrada con la llave pública del nodo.
const ALLOWED_ORIGINS = new Set(['https://clases.yoaprendo.online', 'https://billiog.github.io']);

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function encryptForNode(publicSpkiB64: string, payload: unknown) {
  const der = Uint8Array.from(atob(publicSpkiB64), c => c.charCodeAt(0));
  const rsa = await crypto.subtle.importKey('spki', der, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, new TextEncoder().encode(JSON.stringify(payload))));
  const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', aes));
  const key = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsa, rawKey));
  return { alg: 'RSA-OAEP-256+A256GCM', key: toBase64(key), iv: toBase64(iv), data: toBase64(data) };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const cors: Record<string, string> = origin ? {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://clases.yoaprendo.online',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } : {};
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
  if (req.method !== 'POST') return reply({ error: 'Método no permitido' }, 405);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
  const token = req.headers.get('x-node-token') || '';
  const body = await req.json().catch(() => ({}));
  let node: any = null;
  let usb: any = null;

  if (token) {
    if (token.length < 32) return reply({ error: 'Token de nodo requerido' }, 401);
    const { data } = await admin.from('school_nodes')
      .select('id, school_code, name, revoked_at').eq('token_hash', await sha256Hex(token)).maybeSingle();
    node = data;
  } else {
    // Paquete USB traído por un docente.
    usb = body?.usb;
    const authHeader = req.headers.get('Authorization') || '';
    const { data: { user } } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
    if (!user) return reply({ error: 'Inicia sesión como docente o administrador' }, 401);
    if (!/^[0-9a-f]{64}$/.test(usb?.node?.token_hash || '') || typeof usb?.public_key !== 'string') {
      return reply({ error: 'El archivo de la USB no es válido' }, 400);
    }
    const { data } = await admin.from('school_nodes')
      .select('id, school_code, name, revoked_at').eq('token_hash', usb.node.token_hash).maybeSingle();
    node = data;
    if (node) {
      const { data: teacher } = await admin.from('teachers').select('role').eq('id', user.id).maybeSingle();
      const isAdmin = teacher?.role === 'admin';
      const { data: assigned } = await admin.from('teacher_assignments').select('id').eq('teacher_id', user.id).eq('school_code', node.school_code).limit(1);
      if (!teacher || (!isAdmin && !assigned?.length)) return reply({ error: 'Solo un docente de esa escuela o un administrador puede sincronizar este nodo' }, 403);
    }
  }
  if (!node || node.revoked_at) return reply({ error: 'Nodo no autorizado o revocado' }, 401);

  // Permiso de subida de un archivo de proyecto (video o modelo 3D): URL firmada de un solo archivo,
  // con ruta generada aquí. Solo para nodos con token (no por USB). Se responde antes del pull pesado.
  if (!usb && body?.action === 'project_upload_url') {
    const v = validateUploadRequest(body);
    if (!v.ok) return reply({ error: v.error }, 400);
    const { data, error } = await admin.storage.from(PROJECT_BUCKET).createSignedUploadUrl(v.path);
    if (error || !data) return reply({ error: `No se pudo preparar la subida: ${error?.message || 'sin respuesta'}` }, 500);
    return reply({ path: v.path, signed_url: data.signedUrl });
  }

  // Permiso de subida de UN archivo de un curso que un docente creó en el nodo: URL firmada de un solo archivo en el bucket de cursos,
  // con la misma ruta que ya tiene en el nodo (lessons/<id de la lección>/...), para que la dirección pública sea la misma.
  if (!usb && body?.action === 'content_upload_url') {
    const rel = validateObjectPath(body.path);
    let lessonSchool: string | null | undefined;
    if (rel) {
      const { data: l } = await admin.from('lessons').select('school_code').eq('id', rel.split('/')[1].toLowerCase()).maybeSingle();
      lessonSchool = l ? (l.school_code ?? '') : undefined;
    }
    const v = validateContentUploadRequest(body, { schoolCode: node.school_code, lessonSchool: () => lessonSchool });
    if (!v.ok) return reply({ error: v.error }, 400);
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(v.path, { upsert: true });
    if (error || !data) return reply({ error: `No se pudo preparar la subida: ${error?.message || 'sin respuesta'}` }, 500);
    return reply({ path: v.path, signed_url: data.signedUrl });
  }

  // Aviso del servidor (cada ~30 s con internet): guarda su estado para mostrarlo en la plataforma y le responde si el docente pidió «Sincronizar ahora» desde ahí
  // (node_heartbeat, migrations/node-remote-sync.sql). Se responde antes del pull pesado.
  if (!usb && body?.action === 'node_ping') {
    const { data, error } = await admin.rpc('node_heartbeat', { p_node: node.id, p_status: sanitizeNodeStatus(body.status) });
    if (error) return reply({ error: `No se pudo guardar el estado: ${error.message}` }, 500);
    return reply({ sync_requested_at: data ?? null, server_time: new Date().toISOString() });
  }

  // Foto de perfil cambiada en el nodo: URL firmada de un solo archivo en el depósito de fotos, con el nombre que armó la app (<id>_<hora>.<ext>).
  // Solo para un estudiante de la escuela del nodo o un docente asignado a ella.
  const isSchoolMember = async (userId: string): Promise<boolean> => {
    if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) return false;
    const { data: st } = await admin.from('students').select('id').eq('id', userId).eq('school_code', node.school_code).maybeSingle();
    if (st) return true;
    const { data: ta } = await admin.from('teacher_assignments').select('id').eq('teacher_id', userId).eq('school_code', node.school_code).limit(1);
    return !!ta?.length;
  };
  if (!usb && body?.action === 'profile_photo_upload_url') {
    const v = validateProfilePhotoRequest(body, { member: await isSchoolMember(body?.user_id) });
    if (!v.ok) return reply({ error: v.error }, 400);
    const { data, error } = await admin.storage.from(PROFILE_PHOTO_BUCKET).createSignedUploadUrl(v.path, { upsert: true });
    if (error || !data) return reply({ error: `No se pudo preparar la subida: ${error?.message || 'sin respuesta'}` }, 500);
    return reply({ path: v.path, signed_url: data.signedUrl });
  }

  try {
    const push = (usb ? usb.push : body?.push) || {};

    const students = await fetchAll((from, to) => admin.from('students')
      .select('id, username, full_name, grade, section, profile_photo_url, status, companion_species, gems_earned_total, companion_equipped, xp, gems, daily_chest_last_claimed, pin_hash, pin_salt, pin_updated_at')
      .eq('school_code', node.school_code).order('id').range(from, to));
    const studentIds = new Set(students.map((s: any) => s.id));

    // Equipos de la escuela y sus miembros: el nodo los usa para elegir equipo, y aquí para validar proyectos.
    const groups = await fetchAll((from, to) => admin.from('groups')
      .select('id, name, grade, section').eq('school_code', node.school_code).order('id').range(from, to));
    const groupMembers: any[] = [];
    for (const ids of chunk(groups.map((g: any) => g.id))) {
      groupMembers.push(...await fetchAll((from, to) => admin.from('group_members')
        .select('id, group_id, student_id, role').in('group_id', ids).order('id').range(from, to)));
    }

    // ---- PUSH ----
    let appliedCompletions = 0, appliedPins = 0, appliedSessions = 0;

    // Solo avances de lecciones reales de la escuela y de sus estudiantes, sin repetidos: uno inválido o repetido haría fallar
    // el upsert completo y con él toda la sincronización.
    const pushedCompletions = Array.isArray(push.completions) ? push.completions : [];
    let completions: CompletionRow[] = [];
    if (pushedCompletions.length) {
      const courseRows = await fetchAll((from, to) => admin.from('courses').select('id').eq('school_code', node.school_code).order('id').range(from, to));
      const lessonIds = new Set<string>();
      for (const ids of chunk(courseRows.map((c: any) => c.id))) {
        for (const l of await fetchAll((from, to) => admin.from('lessons').select('id').in('course_id', ids).order('id').range(from, to))) lessonIds.add(l.id);
      }
      completions = sanitizeCompletions(pushedCompletions, { studentIds, lessonIds });
    }
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
      if (!error) appliedCompletions = rows.length;
      else {
        // Una fila mala no puede trabar el resto ni la sincronización: se prueba una por una y se sigue.
        console.error('node-sync: falló el lote de avances, se reintenta fila por fila', error);
        for (const row of rows) {
          const one = await admin.from('lesson_completions').upsert([row], { onConflict: 'lesson_id,student_id' });
          if (one.error) console.error('node-sync: avance descartado', row.lesson_id, one.error.message); else appliedCompletions++;
        }
      }
    }

    for (const p of (push.pins || [])) {
      // PIN nuevo (hash + sal) o restablecido por el docente en el nodo
      // (hash y sal vacíos): gana el cambio más reciente.
      const isReset = !p.pin_hash && !p.pin_salt;
      if (!studentIds.has(p.student_id) || !p.pin_updated_at || (!isReset && (!p.pin_hash || !p.pin_salt))) continue;
      const current: any = students.find((s: any) => s.id === p.student_id);
      if (current?.pin_updated_at && new Date(current.pin_updated_at) >= new Date(p.pin_updated_at)) continue;
      const change = { pin_hash: isReset ? null : p.pin_hash, pin_salt: isReset ? null : p.pin_salt, pin_updated_at: p.pin_updated_at };
      const { error } = await admin.from('students').update(change).eq('id', p.student_id);
      if (!error) {
        appliedPins++;
        Object.assign(current, change);
      }
    }

    const sessions = (push.sessions || []).filter((s: any) => studentIds.has(s.student_id) && s.entered_at)
      .map((s: any) => ({ node_id: node.id, student_id: s.student_id, device: String(s.device || '').slice(0, 120), entered_at: s.entered_at }));
    if (sessions.length) {
      const { error } = await admin.from('node_session_logs').insert(sessions);
      if (!error) appliedSessions = sessions.length;
    }

    // Proyectos subidos en la escuela: el archivo ya está en Storage (URL firmada); aquí se valida y se publica.
    const appliedProjects: Array<{ client_ref: string; project_id: string }> = [];
    const projectErrors: Array<{ client_ref: string; error: string }> = [];
    const pushedProjects: any[] = !usb && Array.isArray(push.projects) ? push.projects : [];
    if (pushedProjects.length) {
      const membersOf = new Map<number, Set<string>>();
      for (const m of groupMembers) {
        if (!membersOf.has(m.group_id)) membersOf.set(m.group_id, new Set());
        membersOf.get(m.group_id)!.add(m.student_id);
      }
      const sizes = new Map<string, number | null>();
      for (const p of pushedProjects) {
        if (typeof p?.cloud_path !== 'string') continue;
        const { data } = await admin.storage.from(PROJECT_BUCKET).list('', { limit: 5, search: p.cloud_path });
        const hit = (data || []).find((o: any) => o.name === p.cloud_path);
        sizes.set(p.cloud_path, hit ? Number(hit.metadata?.size ?? 0) : null);
      }
      for (const p of pushedProjects) {
        const ref = String(p?.client_ref ?? '');
        const v = validateProjectPush(p, { nodeId: node.id, studentIds, membersOf, objectSize: (path) => sizes.get(path) ?? null });
        if (!v.ok) { projectErrors.push({ client_ref: ref, error: v.error }); continue; }
        const row: any = { ...v.row };

        // Idempotencia: un reintento no duplica (misma referencia del nodo, o mismo estudiante + título + bimestre).
        const { data: sameRef } = await admin.from('projects').select('id').eq('client_metadata->>node_ref', ref).limit(1);
        const { data: sameTitle } = sameRef?.length ? { data: null } : await admin.from('projects').select('id')
          .eq('user_id', row.user_id).eq('title', row.title).eq('bimestre', row.bimestre).limit(1);
        const existing = sameRef?.[0] || sameTitle?.[0];
        if (existing) { appliedProjects.push({ client_ref: ref, project_id: String(existing.id) }); continue; }

        row.video_url = `${SUPABASE_URL}/storage/v1/object/public/${PROJECT_BUCKET}/${row.cloud_path}`;
        delete row.cloud_path;
        const { data: inserted, error } = await admin.from('projects').insert(row).select('id').single();
        if (error || !inserted) { projectErrors.push({ client_ref: ref, error: `No se pudo crear el proyecto: ${error?.message || 'sin respuesta'}` }); continue; }

        // Proyecto de equipo: rotar los roles, como hace la app al publicar.
        if (row.group_id !== null) {
          const members = groupMembers.filter((m: any) => m.group_id === row.group_id);
          for (const r of nextRoles(members)) {
            await admin.from('group_members').update({ role: r.role }).eq('id', r.id);
            const local = members.find((m: any) => m.id === r.id);
            if (local) local.role = r.role;
          }
        }
        appliedProjects.push({ client_ref: ref, project_id: String(inserted.id) });
      }
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

    // ---- Docentes de la escuela y evaluaciones hechas en el nodo (después de publicar los proyectos, antes de las fichas) ----
    let teacherList: ReturnType<typeof buildTeacherList> | undefined;
    try {
      const assignments = await fetchAll((from, to) => admin.from('teacher_assignments')
        .select('teacher_id, school_code, grade, section').eq('school_code', node.school_code).order('id').range(from, to));
      const teacherRows: any[] = [];
      for (const part of chunk([...new Set(assignments.map((a: any) => a.teacher_id as string))])) {
        teacherRows.push(...await fetchAll((from, to) => admin.from('teachers')
          .select('id, full_name, role').in('id', part).order('id').range(from, to)));
      }
      teacherList = buildTeacherList(teacherRows, assignments, node.school_code);
    } catch (e) {
      console.error('node-sync: no se pudieron armar los docentes', e);
    }
    const appliedEvaluations: string[] = [];
    // permanent: el nodo puede olvidar esa evaluación (inválida o sin permiso); "aún no publicado" y los errores
    // pasajeros se reintentan en el próximo sync.
    const evaluationErrors: Array<{ key: string; error: string; permanent: boolean }> = [];
    if (teacherList) {
      const teacherIds = new Set(teacherList.map((t) => t.id));
      // Una llamada por evaluación y el nodo corta el sync a los 120 s: tope de cantidad y de tiempo.
      const evaluationsStartedAt = Date.now();
      for (const raw of (Array.isArray(push.evaluations) ? push.evaluations : []).slice(0, 200) as any[]) {
        if (Date.now() - evaluationsStartedAt > 40_000) break;
        const key = String(raw?.key ?? '').slice(0, 80);
        const v = validateEvaluationEvent(raw ?? {}, { teacherIds });
        if (!v.ok) { evaluationErrors.push({ key, error: v.error, permanent: true }); continue; }
        const { error } = await admin.rpc('apply_node_evaluation', {
          p_teacher: v.event.teacher_id, p_school_code: node.school_code, p_project_id: v.event.project_id, p_node_ref: v.event.node_ref,
          p_evaluation: { ...v.event.scores, feedback: v.event.feedback },
        });
        if (error) {
          evaluationErrors.push({ key, error: error.message, permanent: /inválid|no encontrado|no está asignado|Falta el proyecto/i.test(error.message) });
          continue;
        }
        appliedEvaluations.push(key);
      }
    } else if (Array.isArray(push.evaluations) && push.evaluations.length) {
      // Sin la lista de docentes no se puede validar: todo sigue pendiente en el nodo.
      console.error('node-sync: evaluaciones pendientes sin lista de docentes; se reintentan en el próximo sync');
    }

    // ---- Reacciones a proyectos hechas en el nodo (antes del XP y de las fichas: los votos cuentan) ----
    const appliedReactions: string[] = [];
    // permanent: el nodo puede olvidar esa reacción (inválida); si no, la reintenta en el próximo sync.
    const reactionErrors: Array<{ student_id: string; project_id: unknown; error: string; permanent: boolean }> = [];
    // Cada reacción es una llamada aparte y el nodo corta el sync a los 120 s: un tope de cantidad y de tiempo.
    // Lo que falte sigue pendiente en el nodo (no está en applied.reactions) y entra en el siguiente sync.
    const reactionsStartedAt = Date.now();
    for (const raw of (Array.isArray(push.reactions) ? push.reactions : []).slice(0, 300) as any[]) {
      if (Date.now() - reactionsStartedAt > 40_000) break;
      const v = validateReactionEvent(raw ?? {}, { studentIds });
      if (!v.ok) { reactionErrors.push({ student_id: String(raw?.student_id ?? ''), project_id: raw?.project_id, error: v.error, permanent: true }); continue; }
      const { error } = await admin.rpc('apply_node_reaction', { p_student: v.event.student_id, p_project: v.event.project_id, p_reaction: v.event.reaction });
      if (error) {
        reactionErrors.push({ student_id: v.event.student_id, project_id: v.event.project_id, error: error.message, permanent: /no encontrado|no válida|no es de la escuela/i.test(error.message) });
        continue;
      }
      appliedReactions.push(`${v.event.student_id}|${v.event.project_id}`);
    }

    // ---- XP: cofres que sorteó el nodo (se validan y aplican) y XP total actualizado de cada alumno ----
    const appliedXpEvents: string[] = [];
    // permanent: el nodo puede olvidar ese cofre (inválido); si no, lo reintenta en el próximo sync.
    const xpErrors: Array<{ student_id: string; ref: string; error: string; permanent: boolean }> = [];
    const guatemalaToday = new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
    for (const raw of (Array.isArray(push.xp_events) ? push.xp_events : []) as any[]) {
      const student_id = String(raw?.student_id ?? ''), ref = String(raw?.ref ?? '');
      const v = validateXpEvent(raw ?? {}, { studentIds, today: guatemalaToday });
      if (!v.ok) { xpErrors.push({ student_id, ref, error: v.error, permanent: true }); continue; }
      const { error } = await admin.rpc('apply_node_chest', { p_student: v.event.student_id, p_date: v.event.ref, p_xp: v.event.xp, p_gems: v.event.gems });
      if (error) { xpErrors.push({ student_id, ref, error: error.message, permanent: /inválido|fuera de rango|no encontrado/i.test(error.message) }); continue; }
      appliedXpEvents.push(`${student_id}|${ref}`); // true (aplicado ahora) y false (ya estaba) cuentan como confirmados
    }
    try {
      const ids = [...studentIds] as string[];
      const fresh: any[] = [];
      for (const part of chunk(ids)) {
        fresh.push(...await fetchAll((from, to) => admin.from('students')
          .select('id, xp, gems, daily_chest_last_claimed').in('id', part).order('id').range(from, to)));
      }
      const projectsById = new Map<string, any>();
      for (const part of chunk(ids)) {
        for (const p of await fetchAll((from, to) => admin.from('projects')
          .select('id, user_id, group_id, score, votes').in('user_id', part).order('id').range(from, to))) projectsById.set(String(p.id), p);
      }
      for (const part of chunk(groups.map((g: any) => g.id))) {
        for (const p of await fetchAll((from, to) => admin.from('projects')
          .select('id, user_id, group_id, score, votes').in('group_id', part).order('id').range(from, to))) projectsById.set(String(p.id), p);
      }
      const badgeCounts = new Map<string, number>();
      for (const part of chunk(ids)) {
        for (const b of await fetchAll((from, to) => admin.from('student_badges')
          .select('id, student_id').in('student_id', part).order('id').range(from, to))) {
          badgeCounts.set(b.student_id, (badgeCounts.get(b.student_id) || 0) + 1);
        }
      }
      const totals = computeStudentXp({ students: fresh, projects: [...projectsById.values()], memberships: groupMembers, badgeCounts });
      const freshById = new Map(fresh.map((f: any) => [f.id, f]));
      for (const st of students as any[]) {
        const t = totals.get(st.id);
        if (!t) continue;
        st.xp_total = t.xp_total;
        st.gems = t.gems;
        st.daily_chest_last_claimed = freshById.get(st.id)?.daily_chest_last_claimed ?? null;
      }
    } catch (e) {
      console.error('node-sync: no se pudo calcular el XP de los alumnos', e);
    }

    // Fichas de proyectos para el Inicio del nodo (sin videos). Si la consulta falla, el pull sigue sin
    // `projects` y el nodo conserva las que ya tenía.
    let feedProjects: ReturnType<typeof buildFeedProjects> | undefined;
    try {
      const rows: any[] = [];
      for (const ids of chunk([...studentIds] as string[])) {
        const { data, error } = await admin.from('projects')
          .select('id, user_id, group_id, title, description, bimestre, score, votes, created_at, video_url, evaluations(total_score, feedback)')
          .in('user_id', ids).order('created_at', { ascending: false }).limit(FEED_LIMIT);
        if (error) throw error;
        rows.push(...(data || []));
      }
      feedProjects = buildFeedProjects(rows, students, groups);
    } catch (e) {
      console.error('node-sync: no se pudieron armar las fichas de proyectos', e);
    }

    // Reacciones propias de los alumnos del nodo sobre los proyectos de las fichas (para pintar su corazón y su
    // reacción). Si falla, el pull sigue sin `reactions` y el nodo conserva las que ya tenía.
    let feedReactions: Array<{ student_id: string; project_id: number; reaction: string }> | undefined;
    if (feedProjects) {
      try {
        const projectIds = feedProjects.map((p) => Number(p.id)).filter((n) => Number.isInteger(n));
        const rows: any[] = [];
        for (const part of chunk(projectIds)) {
          rows.push(...await fetchAll((from, to) => admin.from('project_likes')
            .select('project_id, user_id, reaction').in('project_id', part).order('project_id').order('user_id').range(from, to)));
        }
        feedReactions = rows.filter((r) => studentIds.has(r.user_id))
          .map((r) => ({ student_id: r.user_id, project_id: Number(r.project_id), reaction: r.reaction }));
      } catch (e) {
        console.error('node-sync: no se pudieron bajar las reacciones', e);
      }
    }

    // Evaluaciones de los proyectos de las fichas (notas por criterio y observación), para que el docente vea y corrija.
    // Si falla, el pull sigue sin `evaluations` y el nodo conserva las que ya tenía.
    let feedEvaluations: Array<Record<string, unknown>> | undefined;
    if (feedProjects) {
      try {
        const projectIds = feedProjects.map((p) => Number(p.id)).filter((n) => Number.isInteger(n));
        const rows: any[] = [];
        for (const part of chunk(projectIds)) {
          rows.push(...await fetchAll((from, to) => admin.from('evaluations')
            .select('project_id, teacher_id, total_score, creativity_score, clarity_score, functionality_score, teamwork_score, social_impact_score, feedback')
            .in('project_id', part).order('project_id').range(from, to)));
        }
        feedEvaluations = shapeEvaluations(rows);
      } catch (e) {
        console.error('node-sync: no se pudieron bajar las evaluaciones', e);
      }
    }

    // ---- Funciones de la app llamadas en el nodo (hoy: log_practice, la Práctica del Centro de Juego) ----
    // Cada evento trae su `seq` (el del nodo): lo que se aplicó vuelve en applied.rpc y lo rechazado de forma definitiva
    // en rpc_errors con permanent: true; un error pasajero se reintenta en el próximo sync.
    const appliedRpc: number[] = [];
    const rpcErrors: Array<{ seq: number; error: string; permanent: boolean }> = [];
    const rpcStartedAt = Date.now();
    for (const raw of (Array.isArray(push.rpc) ? push.rpc : []).slice(0, 300) as any[]) {
      if (Date.now() - rpcStartedAt > 40_000) break;
      const seq = Number(raw?.seq);
      if (!Number.isInteger(seq)) continue;
      // Mascota: la forma se valida aquí y las reglas del juego (gemas, etapas...) las aplica apply_node_companion (migrations/node-companion.sql).
      // Un error de regla (SQLSTATE P0001) es definitivo: el nodo lo descarta y el estado de la nube manda en la siguiente bajada.
      if (isCompanionFn(raw?.fn)) {
        const cv = validateCompanionEvent(raw, { studentIds });
        if (!cv.ok) { rpcErrors.push({ seq, error: cv.error, permanent: true }); continue; }
        const { error } = await admin.rpc('apply_node_companion', cv.call);
        if (error) { rpcErrors.push({ seq, error: error.message, permanent: error.code === 'P0001' }); continue; }
        appliedRpc.push(seq);
        continue;
      }
      // Buzón: sugerencias y evaluación del docente hechas en el nodo; apply_node_feedback (migrations/node-feedback.sql) comprueba que el docente sea de la clase del estudiante y las inserta (idempotente por id).
      if (isFeedbackFn(raw?.fn)) {
        const fv = validateFeedbackEvent(raw, { studentIds });
        if (!fv.ok) { rpcErrors.push({ seq, error: fv.error, permanent: true }); continue; }
        const { error } = await admin.rpc('apply_node_feedback', fv.call);
        if (error) { rpcErrors.push({ seq, error: error.message, permanent: error.code === 'P0001' }); continue; }
        appliedRpc.push(seq);
        continue;
      }
      // Foto de perfil: la imagen ya está en Storage; aquí se arma su dirección pública y apply_node_profile_photo (migrations/node-profile-photo.sql) la aplica y da el premio de la primera foto.
      if (isProfilePhotoFn(raw?.fn)) {
        const pv = validateProfilePhotoEvent(raw, { member: studentIds.has(raw?.student_id) || await isSchoolMember(raw?.student_id) });
        if (!pv.ok) { rpcErrors.push({ seq, error: pv.error, permanent: true }); continue; }
        const { error } = await admin.rpc('apply_node_profile_photo', { p_user: pv.call.p_user, p_url: `${SUPABASE_URL}/storage/v1/object/public/${PROFILE_PHOTO_BUCKET}/${pv.call.p_name}` });
        if (error) { rpcErrors.push({ seq, error: error.message, permanent: error.code === 'P0001' }); continue; }
        appliedRpc.push(seq);
        continue;
      }
      // Contrarreloj: la foto del duelo se valida aquí y apply_node_timed_math_duel (migrations/node-timed-math-duel.sql) recalcula los puntajes; el disparador de siempre liquida.
      if (isTimedMathFn(raw?.fn)) {
        const tv = validateTimedMathEvent(raw, { studentIds });
        if (!tv.ok) { rpcErrors.push({ seq, error: tv.error, permanent: true }); continue; }
        const { error } = await admin.rpc('apply_node_timed_math_duel', { p_snapshot: tv.snapshot });
        if (error) { rpcErrors.push({ seq, error: error.message, permanent: error.code === 'P0001' }); continue; }
        appliedRpc.push(seq);
        continue;
      }
      // Ahorcado: igual, la foto del duelo; apply_node_hangman_duel (migrations/node-hangman-duel.sql) comprueba las palabras del banco y recalcula.
      if (isHangmanFn(raw?.fn)) {
        const hv = validateHangmanEvent(raw, { studentIds });
        if (!hv.ok) { rpcErrors.push({ seq, error: hv.error, permanent: true }); continue; }
        const { error } = await admin.rpc('apply_node_hangman_duel', { p_snapshot: hv.snapshot });
        if (error) { rpcErrors.push({ seq, error: error.message, permanent: error.code === 'P0001' }); continue; }
        appliedRpc.push(seq);
        continue;
      }
      if (raw?.fn !== 'log_practice') { rpcErrors.push({ seq, error: 'Función no soportada', permanent: true }); continue; }
      const v = validatePracticeEvent(raw, { studentIds, now: Date.now() });
      if (!v.ok) { rpcErrors.push({ seq, error: v.error, permanent: true }); continue; }
      const { error } = await admin.from('practice_results').upsert(v.row, { onConflict: 'student_id,client_ref', ignoreDuplicates: true });
      if (error) { rpcErrors.push({ seq, error: error.message, permanent: false }); continue; }
      appliedRpc.push(seq);
    }

    // ---- Avisos y lecturas hechos en el nodo (el id lo puso el nodo: reintentar no duplica) ----
    // Se aplican ANTES de armar las tablas de la bajada: así lo recién subido ya viene en la misma respuesta y no desaparece
    // del nodo hasta la siguiente sincronización. applied.announcements = ids; applied.announcement_reads = 'aviso|usuario'.
    // Lo rechazado de forma definitiva vuelve en announcement_errors / announcement_read_errors con permanent: true; un error
    // pasajero se reintenta en el próximo sync. Si algo de este bloque falla, no se confirma nada y se reintenta todo.
    const appliedAnnouncements: string[] = [];
    const announcementErrors: Array<{ id: string; error: string; permanent: boolean }> = [];
    const appliedReads: string[] = [];
    const readErrors: Array<{ key: string; error: string; permanent: boolean }> = [];
    const pushedAnnouncements: any[] = Array.isArray(push.announcements) ? push.announcements.slice(0, 200) : [];
    const pushedReads: any[] = Array.isArray(push.announcement_reads) ? push.announcement_reads.slice(0, 500) : [];
    if (pushedAnnouncements.length || pushedReads.length) {
      try {
        const schoolAssignments = await fetchAll((from, to) => admin.from('teacher_assignments').select('teacher_id, school_code, grade, section').eq('school_code', node.school_code).order('id').range(from, to));
        const userIds = new Set<string>([...studentIds, ...schoolAssignments.map((a: any) => a.teacher_id as string)]);
        const annStartedAt = Date.now();
        const failedNow = new Set<string>(); // avisos que fallaron ahora por un error pasajero
        for (const raw of pushedAnnouncements) {
          if (Date.now() - annStartedAt > 30_000) break;
          const id = String(raw?.id ?? '');
          const v = validateAnnouncementEvent(raw, { schoolCode: node.school_code, now: Date.now(), assignments: schoolAssignments });
          if (!v.ok) { announcementErrors.push({ id, error: v.error, permanent: true }); continue; }
          const { error } = await admin.from('announcements').upsert(v.row, { onConflict: 'id', ignoreDuplicates: true });
          if (error) { announcementErrors.push({ id, error: error.message, permanent: false }); failedNow.add(id); continue; }
          appliedAnnouncements.push(id);
        }
        // Los avisos a los que apuntan las lecturas, ya con lo recién aplicado.
        const known = new Map<string, any>();
        for (const part of chunk([...new Set(pushedReads.map((r) => r?.announcement_id).filter(isUuid))] as string[])) {
          for (const a of await fetchAll((from, to) => admin.from('announcements').select('id, school_code, target_groups, target_schools').in('id', part).order('id').range(from, to))) known.set(a.id, a);
        }
        for (const raw of pushedReads) {
          if (Date.now() - annStartedAt > 40_000) break;
          const key = `${raw?.announcement_id}|${raw?.user_id}`;
          const v = validateReadEvent(raw, { userIds, now: Date.now() });
          if (!v.ok) { readErrors.push({ key, error: v.error, permanent: true }); continue; }
          const c = classifyRead(known.get(v.row.announcement_id), node.school_code, failedNow.has(v.row.announcement_id));
          if (c.action !== 'apply') { readErrors.push({ key, error: c.reason || 'No se pudo aplicar', permanent: c.action === 'reject' }); continue; }
          const { error } = await admin.from('announcement_reads').upsert(v.row, { onConflict: 'announcement_id,user_id', ignoreDuplicates: true });
          if (error) { readErrors.push({ key, error: error.message, permanent: false }); continue; }
          appliedReads.push(key);
        }
      } catch (e) {
        // Nada se confirma: el nodo conserva todo en su bandeja y lo reintenta en la próxima sincronización.
        appliedAnnouncements.length = 0; appliedReads.length = 0; announcementErrors.length = 0; readErrors.length = 0;
        console.error('node-sync: no se pudieron aplicar los avisos y lecturas', e);
      }
    }

    // ---- Cursos y recursos que un docente creó en el nodo (push.content: cambios EN ORDEN; los archivos ya subieron por content_upload_url) ----
    // Se aplican ANTES de armar la bajada para que lo recién subido ya venga en la misma respuesta. applied.content = seq confirmados;
    // content_errors = rechazos (permanent: true = definitivo; si no, el nodo reintenta). Borrar una lección borra su carpeta de archivos.
    const appliedContent: number[] = [];
    const contentErrors: Array<{ seq: number; error: string; permanent: boolean }> = [];
    const pushedContent: any[] = Array.isArray(push.content) ? push.content.slice(0, 300) : [];
    if (pushedContent.length && !usb) {
      try {
        const schoolAssignments = await fetchAll((from, to) => admin.from('teacher_assignments').select('teacher_id, school_code, grade, section').eq('school_code', node.school_code).order('id').range(from, to));
        const { data: admins } = await admin.from('teachers').select('id').eq('role', 'admin');
        const ids = (key: string) => [...new Set(pushedContent.map((o) => (o?.tbl === key ? o?.pk : null)).filter(isUuid))] as string[];
        const courses = new Map<string, any>();
        const lessons = new Map<string, any>();
        for (const part of chunk(ids('courses'))) for (const c of await fetchAll((from, to) => admin.from('courses').select('id, school_code, created_by, is_shared').in('id', part).order('id').range(from, to))) courses.set(c.id, c);
        for (const part of chunk(ids('lessons'))) for (const l of await fetchAll((from, to) => admin.from('lessons').select('id, school_code, course_id, created_by').in('id', part).order('id').range(from, to))) lessons.set(l.id, l);
        // Cursos a los que apuntan los recursos del lote y todavía no se cargaron.
        const missing = [...new Set(pushedContent.filter((o) => o?.tbl === 'lessons' && isUuid(o?.row?.course_id) && !courses.has(o.row.course_id)).map((o) => o.row.course_id))] as string[];
        for (const part of chunk(missing)) for (const c of await fetchAll((from, to) => admin.from('courses').select('id, school_code, created_by, is_shared').in('id', part).order('id').range(from, to))) courses.set(c.id, c);
        const plan = planContentOps(pushedContent.filter((o) => !isSocialTable(o?.tbl) && !isAttendanceTable(o?.tbl) && !isGroupTable(o?.tbl) && !isExamTable(o?.tbl) && !isWaiverTable(o?.tbl)), {
          schoolCode: node.school_code, storageBase: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`, cloudUrl: SUPABASE_URL, assignments: schoolAssignments,
          adminIds: new Set((admins || []).map((a: any) => a.id as string)),
          courses: new Map([...courses].map(([k, c]) => [k, { school_code: c.school_code, created_by: c.created_by, is_shared: !!c.is_shared }])),
          lessons: new Map([...lessons].map(([k, l]) => [k, { school_code: l.school_code, course_id: l.course_id, created_by: l.created_by }])),
        });
        const failed = new Set<number>();
        for (const r of plan.results) if (!r.ok) contentErrors.push({ seq: r.seq, error: r.error, permanent: true });
        const startedAt = Date.now();
        for (const a of plan.actions) {
          if (Date.now() - startedAt > 40_000) { failed.add(a.seq); continue; }
          let error: { message: string } | null = null;
          if (a.kind === 'upsert') ({ error } = await admin.from(a.table).upsert(a.row, { onConflict: 'id' }));
          else {
            if (a.table === 'lessons' && a.removeFiles) {
              try { const { data: files } = await admin.storage.from(BUCKET).list(a.removeFiles, { limit: 1000 }); if (files?.length) await admin.storage.from(BUCKET).remove(files.filter((f: any) => f.id).map((f: any) => `${a.removeFiles}/${f.name}`)); } catch { /* los archivos sueltos no frenan el borrado */ }
            }
            ({ error } = await admin.from(a.table).delete().eq('id', a.id));
          }
          if (error) { contentErrors.push({ seq: a.seq, error: error.message, permanent: false }); failed.add(a.seq); }
        }
        for (const r of plan.results) if (r.ok && !failed.has(r.seq)) appliedContent.push(r.seq);

        // Equipos y miembros armados en el nodo: se aplican ANTES que lo que apunta a ellos (comentarios por equipo) y respetan el rango de ids reservado.
        const groupOps = pushedContent.filter((o) => isGroupTable(o?.tbl));
        if (groupOps.length) {
          const gids = [...new Set(groupOps.flatMap((o) => [o?.tbl === 'groups' ? Number(o?.pk) : null, o?.tbl === 'group_members' ? Number(o?.row?.group_id) : null]).filter((n) => Number.isInteger(n)))] as number[];
          const mids = [...new Set(groupOps.filter((o) => o?.tbl === 'group_members').map((o) => Number(o?.pk)).filter((n) => Number.isInteger(n)))] as number[];
          const groupsMap = new Map<number, { school_code: string; grade: string; section: string }>();
          const membersMap = new Map<number, { group_id: number }>();
          for (const part of chunk(gids)) for (const g of await fetchAll((from, to) => admin.from('groups').select('id, school_code, grade, section').in('id', part).order('id').range(from, to))) groupsMap.set(g.id, { school_code: g.school_code, grade: g.grade, section: g.section });
          for (const part of chunk(mids)) for (const m of await fetchAll((from, to) => admin.from('group_members').select('id, group_id').in('id', part).order('id').range(from, to))) membersMap.set(m.id, { group_id: m.group_id });
          const gp = planGroupOps(groupOps, {
            schoolCode: node.school_code, assignments: schoolAssignments, adminIds: new Set((admins || []).map((a: any) => a.id as string)),
            students: new Map(students.map((s: any) => [s.id as string, { grade: s.grade as string, section: s.section as string }])), groups: groupsMap, members: membersMap,
          });
          const failedGp = new Set<number>();
          for (const r of gp.results) if (!r.ok) contentErrors.push({ seq: r.seq, error: r.error, permanent: true });
          for (const a of gp.actions) {
            if (Date.now() - startedAt > 40_000) { failedGp.add(a.seq); continue; }
            const { error } = a.kind === 'upsert' ? await admin.from(a.table).upsert(a.row, { onConflict: 'id' }) : await admin.from(a.table).delete().eq('id', a.id);
            if (error) { contentErrors.push({ seq: a.seq, error: error.message, permanent: false }); failedGp.add(a.seq); }
          }
          for (const r of gp.results) if (r.ok && !failedGp.has(r.seq)) appliedContent.push(r.seq);
        }

        // Comentarios, «me gusta» y notas de los recursos: después de los recursos (apuntan a ellos), con las mismas reglas de la nube.
        const socialOps = pushedContent.filter((o) => isSocialTable(o?.tbl));
        if (socialOps.length) {
          const groupRows = await fetchAll((from, to) => admin.from('groups').select('id').eq('school_code', node.school_code).order('id').range(from, to));
          const groupIds = groupRows.map((g: any) => g.id as number);
          const members = new Set<string>();
          for (const part of chunk(groupIds)) for (const m of await fetchAll((from, to) => admin.from('group_members').select('id, group_id, student_id').in('group_id', part).order('id').range(from, to))) members.add(`${m.group_id}:${m.student_id}`);
          const lessonRows = await fetchAll((from, to) => admin.from('lessons').select('id').eq('school_code', node.school_code).order('id').range(from, to));
          const wanted = [...new Set(socialOps.flatMap((o) => [o?.pk, o?.row?.parent_id, o?.row?.comment_id, typeof o?.pk === 'string' ? o.pk.split(':')[0] : null]).filter(isUuid))] as string[];
          const comments = new Map<string, { lesson_id: string; group_id: number }>();
          for (const part of chunk(wanted)) for (const c of await fetchAll((from, to) => admin.from('resource_comments').select('id, lesson_id, group_id').in('id', part).order('id').range(from, to))) comments.set(c.id, { lesson_id: c.lesson_id, group_id: c.group_id });
          const social = planSocialOps(socialOps, {
            schoolCode: node.school_code, studentIds, assignments: schoolAssignments, adminIds: new Set((admins || []).map((a: any) => a.id as string)),
            groups: new Set(groupIds), groupMembers: members, lessons: new Set(lessonRows.map((l: any) => l.id as string)), comments,
          });
          const failedSocial = new Set<number>();
          for (const r of social.results) if (!r.ok) contentErrors.push({ seq: r.seq, error: r.error, permanent: true });
          for (const a of social.actions) {
            if (Date.now() - startedAt > 40_000) { failedSocial.add(a.seq); continue; }
            let error: { message: string } | null = null;
            if (a.kind === 'upsert') ({ error } = await admin.from(a.table).upsert(a.row, { onConflict: a.onConflict }));
            else { let q = admin.from(a.table).delete(); for (const [k, v] of Object.entries(a.match)) q = q.eq(k, v as any); ({ error } = await q); }
            if (error) { contentErrors.push({ seq: a.seq, error: error.message, permanent: false }); failedSocial.add(a.seq); }
          }
          for (const r of social.results) if (r.ok && !failedSocial.has(r.seq)) appliedContent.push(r.seq);
        }

        // Exámenes y notas hechos en el nodo (la clave de respuestas solo la ve su docente; aquí se valida otra vez).
        const examOps = pushedContent.filter((o) => isExamTable(o?.tbl));
        if (examOps.length) {
          const eids = [...new Set(examOps.flatMap((o) => [o?.tbl === 'exams' ? o?.pk : null, o?.tbl === 'exam_results' ? o?.row?.exam_id : null]).filter(isUuid))] as string[];
          const examsMap = new Map<string, { school_code: string; teacher_id: string; grade: string; section: string; question_count: number }>();
          for (const part of chunk(eids)) for (const e of await fetchAll((from, to) => admin.from('exams').select('id, school_code, teacher_id, grade, section, question_count').in('id', part).order('id').range(from, to))) examsMap.set(e.id, { school_code: e.school_code, teacher_id: e.teacher_id, grade: e.grade, section: e.section, question_count: e.question_count });
          const ex = planExamOps(examOps, {
            schoolCode: node.school_code, assignments: schoolAssignments, adminIds: new Set((admins || []).map((a: any) => a.id as string)),
            students: new Map(students.map((s: any) => [s.id as string, { grade: s.grade as string, section: s.section as string }])), exams: examsMap,
          });
          const failedEx = new Set<number>();
          for (const r of ex.results) if (!r.ok) contentErrors.push({ seq: r.seq, error: r.error, permanent: true });
          for (const a of ex.actions) {
            if (Date.now() - startedAt > 40_000) { failedEx.add(a.seq); continue; }
            let error: { message: string } | null = null;
            if (a.kind === 'upsert') ({ error } = await admin.from(a.table).upsert(a.row, { onConflict: a.onConflict }));
            else { let q = admin.from(a.table).delete(); for (const [k, v] of Object.entries(a.match)) q = q.eq(k, v as any); ({ error } = await q); }
            if (error) { contentErrors.push({ seq: a.seq, error: error.message, permanent: false }); failedEx.add(a.seq); }
          }
          for (const r of ex.results) if (r.ok && !failedEx.has(r.seq)) appliedContent.push(r.seq);
        }

        // Permisos de asistencia pedidos en el nodo: siempre pendientes; no se repiten si ya existen (el administrador pudo haberlos aprobado).
        const waiverOps = pushedContent.filter((o) => isWaiverTable(o?.tbl));
        if (waiverOps.length) {
          const wv = planWaiverOps(waiverOps, { schoolCode: node.school_code, now: Date.now(), assignments: schoolAssignments, adminIds: new Set((admins || []).map((a: any) => a.id as string)) });
          const failedWv = new Set<number>();
          for (const r of wv.results) if (!r.ok) contentErrors.push({ seq: r.seq, error: r.error, permanent: true });
          for (const a of wv.actions) {
            if (Date.now() - startedAt > 40_000) { failedWv.add(a.seq); continue; }
            const { error } = await admin.from('attendance_waivers').upsert(a.row, { onConflict: 'id', ignoreDuplicates: true });
            if (error) { contentErrors.push({ seq: a.seq, error: error.message, permanent: false }); failedWv.add(a.seq); }
          }
          for (const r of wv.results) if (r.ok && !failedWv.has(r.seq)) appliedContent.push(r.seq);
        }

        // Asistencia pasada en el nodo: un registro por estudiante y día (upsert), con las reglas de la nube.
        const attendanceOps = pushedContent.filter((o) => isAttendanceTable(o?.tbl));
        if (attendanceOps.length) {
          const att = planAttendanceOps(attendanceOps, {
            schoolCode: node.school_code, now: Date.now(), assignments: schoolAssignments, adminIds: new Set((admins || []).map((a: any) => a.id as string)),
            students: new Map(students.map((s: any) => [s.id as string, { grade: s.grade as string, section: s.section as string }])),
          });
          const failedAtt = new Set<number>();
          for (const r of att.results) if (!r.ok) contentErrors.push({ seq: r.seq, error: r.error, permanent: true });
          for (const a of att.actions) {
            if (Date.now() - startedAt > 40_000) { failedAtt.add(a.seq); continue; }
            const { error } = await admin.from('attendance').upsert(a.row, { onConflict: 'student_id,date' });
            if (error) { contentErrors.push({ seq: a.seq, error: error.message, permanent: false }); failedAtt.add(a.seq); }
          }
          for (const r of att.results) if (r.ok && !failedAtt.has(r.seq)) appliedContent.push(r.seq);
        }
      } catch (e) {
        appliedContent.length = 0; contentErrors.length = 0;
        console.error('node-sync: no se pudieron aplicar los cursos y recursos', e);
      }
    }

    // Tablas para la capa local compatible con Supabase del nodo (la app real corre sobre ellas sin internet) y los
    // verificadores de contraseña de clase para el login. Si falla, el pull sigue sin ellas y el nodo conserva lo que tenía.
    let restTables: Record<string, any[]> | undefined;
    let classVerifiers: Awaited<ReturnType<typeof buildClassVerifiers>> | undefined;
    try {
      restTables = await pullTables(admin, node, { studentIds, fetchAll, chunk });
      const { data: classRows, error: classErr } = await admin.from('class_passwords')
        .select('school_code, grade, section, password, requires_password').eq('school_code', node.school_code);
      if (classErr) throw classErr;
      classVerifiers = await buildClassVerifiers(classRows || []);
    } catch (e) {
      restTables = undefined;
      classVerifiers = undefined;
      console.error('node-sync: no se pudieron armar las tablas de la capa local', e);
    }

    // Entrada de los docentes al nodo: huella del correo + la huella bcrypt de la contraseña de su cuenta (migrations/teacher-node-password.sql;
    // el docente entra sin internet con la misma contraseña de siempre). Si esa migración aún no se corrió, se usa el PIN anterior
    // (migrations/teacher-node-pin.sql) y, si tampoco, solo faltan estas entradas: el nodo conserva las que ya tenía.
    let teacherLogins: Awaited<ReturnType<typeof buildTeacherLogins>> | undefined;
    if (restTables) {
      try {
        const teacherIds = [...new Set((restTables.teachers || []).map((t: any) => t.id as string))];
        const rows: any[] = [];
        for (const part of chunk(teacherIds)) {
          const emails = await fetchAll((from, to) => admin.from('teachers').select('id, email').in('id', part).order('id').range(from, to));
          const emailOf = new Map(emails.map((e: any) => [e.id, e.email]));
          const { data: hashes, error: hashErr } = await admin.rpc('node_teacher_password_hashes', { p_ids: part });
          if (hashErr) console.error('node-sync: sin huellas de contraseña (¿falta migrations/teacher-node-password.sql?)', hashErr.message);
          const hashOf = new Map((hashes || []).map((h: any) => [h.teacher_id, h]));
          let pinOf = new Map<string, any>();
          try {
            const pins = await fetchAll((from, to) => admin.from('teacher_node_pins').select('teacher_id, pin_hash, pin_salt').in('teacher_id', part).order('teacher_id').range(from, to));
            pinOf = new Map(pins.map((p: any) => [p.teacher_id, p]));
          } catch { /* el PIN anterior es opcional */ }
          for (const id of part) {
            const h: any = hashOf.get(id), p: any = pinOf.get(id);
            rows.push({ teacher_id: id, email: h?.email || emailOf.get(id), password_hash: h?.password_hash, pin_hash: p?.pin_hash, pin_salt: p?.pin_salt });
          }
        }
        teacherLogins = await buildTeacherLogins(rows);
      } catch (e) {
        console.error('node-sync: no se pudieron armar las entradas de docentes', e);
      }
    }

    const serverTime = new Date().toISOString();
    await admin.from('school_nodes').update({
      last_sync_at: serverTime,
      last_sync_info: { via: usb ? 'usb' : 'internet', students: students.length, courses: courses.length, files: files.length, appliedCompletions, appliedPins, appliedSessions, appliedProjects: appliedProjects.length },
    }).eq('id', node.id);

    const pull = {
      server_time: serverTime,
      node: { id: node.id, name: node.name, school_code: node.school_code },
      storage_base: storagePrefix,
      students,
      groups,
      group_members: groupMembers,
      projects: feedProjects,
      courses,
      completions: allCompletions,
      files,
      applied: { completions: appliedCompletions, pins: appliedPins, sessions: appliedSessions, projects: appliedProjects, xp_events: appliedXpEvents, reactions: appliedReactions, evaluations: appliedEvaluations, rpc: appliedRpc, announcements: appliedAnnouncements, announcement_reads: appliedReads, content: appliedContent },
      project_errors: projectErrors,
      xp_errors: xpErrors,
      reaction_errors: reactionErrors,
      evaluation_errors: evaluationErrors,
      rpc_errors: rpcErrors,
      announcement_errors: announcementErrors,
      announcement_read_errors: readErrors,
      content_errors: contentErrors,
      teachers: teacherList,
      evaluations: feedEvaluations,
      reactions: feedReactions,
      tables: restTables,
      class_verifiers: classVerifiers,
      teacher_logins: teacherLogins,
    };

    if (!usb) return reply(pull);

    // USB: todo lo personal va cifrado para ese nodo; en claro solo la
    // lista de archivos de cursos que la computadora tiene que bajar.
    const have = new Map((usb.have_files || []).map((f: any) => [f.path, f.etag || '']));
    const missing = files.filter(f => !have.has(f.path) || (f.etag && have.get(f.path) !== f.etag));
    return reply({
      generated_at: serverTime,
      node: { name: node.name, school_code: node.school_code },
      storage_base: storagePrefix,
      files_to_copy: missing,
      applied: pull.applied,
      envelope: await encryptForNode(usb.public_key, { ...pull, pushed: push }),
    });
  } catch (e) {
    return reply({ error: String((e as any)?.message || e) }, 500);
  }
});
