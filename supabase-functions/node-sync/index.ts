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
// Respuesta: alumnos, cursos (con lecciones), progreso y archivos de la
// escuela, las fichas de proyectos de la clase (sin videos ni rutas de Storage, para el Inicio del
// nodo), más cuántas cosas se aplicaron del push.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildFeedProjects, FEED_LIMIT, nextRoles, validateProjectPush, validateUploadRequest } from './projects.ts';
import { computeStudentXp, validateXpEvent } from './xp.ts';

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

    // ---- XP: cofres que sorteó el nodo (se validan y aplican) y XP total actualizado de cada alumno ----
    const appliedXpEvents: string[] = [];
    const xpErrors: Array<{ student_id: string; ref: string; error: string }> = [];
    const guatemalaToday = new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
    for (const raw of (Array.isArray(push.xp_events) ? push.xp_events : []) as any[]) {
      const student_id = String(raw?.student_id ?? ''), ref = String(raw?.ref ?? '');
      const v = validateXpEvent(raw ?? {}, { studentIds, today: guatemalaToday });
      if (!v.ok) { xpErrors.push({ student_id, ref, error: v.error }); continue; }
      const { error } = await admin.rpc('apply_node_chest', { p_student: v.event.student_id, p_date: v.event.ref, p_xp: v.event.xp, p_gems: v.event.gems });
      if (error) { xpErrors.push({ student_id, ref, error: error.message }); continue; }
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
      applied: { completions: appliedCompletions, pins: appliedPins, sessions: appliedSessions, projects: appliedProjects, xp_events: appliedXpEvents },
      project_errors: projectErrors,
      xp_errors: xpErrors,
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
