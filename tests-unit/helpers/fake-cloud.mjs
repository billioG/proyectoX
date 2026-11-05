// Nube simulada para probar la subida de proyectos del nodo sin Supabase:
//   POST /functions/v1/node-sync   -> { action: 'project_upload_url', ... } y { push: { projects } }
//   PUT  /fake-storage/<path>      -> recibe el archivo (como la URL firmada de Storage)
// Imita el protocolo de supabase/functions/node-sync/index.ts (ver también projects.ts).
import http from 'node:http';
import crypto from 'node:crypto';

export const FAKE_TOKEN = 'a'.repeat(64);

/**
 * @param opts {
 *   failStorage?: boolean,    // el PUT del archivo responde 500
 *   failConfirm?: boolean,    // la confirmación (push.projects) responde 500
 *   oldFunction?: boolean,    // función vieja: la respuesta no trae applied.projects
 *   rejectProject?: string,   // la nube rechaza todos los proyectos con ese mensaje
 *   port?: number,            // puerto fijo (para «encender» la nube después de que el nodo ya la buscaba)
 * }
 * Las opciones se pueden cambiar entre llamadas: cloud.opts.failConfirm = false.
 */
export async function startFakeCloud(opts = {}) {
  const cloud = { opts: { ...opts }, stats: { urlRequests: 0, uploads: 0, confirms: 0 }, projects: [], storage: new Map(), url: '' };

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');

    if (req.method === 'PUT' && url.pathname.startsWith('/fake-storage/')) {
      const bytes = await readBody(req);
      if (cloud.opts.failStorage) return send(res, 500, { error: 'storage caído' });
      cloud.storage.set(decodeURIComponent(url.pathname.slice('/fake-storage/'.length)), { bytes, contentType: req.headers['content-type'] });
      cloud.stats.uploads++;
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/functions/v1/node-sync') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      if (req.headers['x-node-token'] !== FAKE_TOKEN) return send(res, 401, { error: 'Token de nodo requerido' });

      // La función vieja no conoce `action`: responde el pull completo a cualquier llamada.
      if (body.action === 'project_upload_url' && !cloud.opts.oldFunction) {
        cloud.stats.urlRequests++;
        const ext = String(body.ext || '');
        if (!/^(mp4|mov|m4v|webm|3gp|avi|mkv|stl|obj|glb)$/.test(ext)) return send(res, 400, { error: 'Tipo de archivo no permitido.' });
        const path = `${Date.now()}_${crypto.randomBytes(5).toString('hex')}.${ext}`;
        return send(res, 200, { path, signed_url: `${cloud.url}/fake-storage/${encodeURIComponent(path)}?token=t` });
      }

      // Sincronización normal: pull mínimo + lo que corresponda a push.projects.
      const pull = {
        server_time: new Date().toISOString(), node: { id: 'node-1', name: 'Nodo de prueba', school_code: 'ESC1' }, storage_base: `${cloud.url}/fake-public/`,
        students: [], groups: [], group_members: [], courses: [], completions: [], files: [],
        applied: { completions: 0, pins: 0, sessions: 0 }, project_errors: [],
      };
      const pushed = body.push?.projects;
      if (!Array.isArray(pushed) || cloud.opts.oldFunction) return send(res, 200, pull);
      if (cloud.opts.failConfirm) return send(res, 500, { error: 'la base de datos no respondió' });

      cloud.stats.confirms++;
      const applied = [];
      for (const p of pushed) {
        if (cloud.opts.rejectProject) { pull.project_errors.push({ client_ref: p.client_ref, error: cloud.opts.rejectProject }); continue; }
        if (!cloud.storage.has(p.cloud_path)) { pull.project_errors.push({ client_ref: p.client_ref, error: 'El archivo no está en Storage: no se terminó de subir.' }); continue; }
        let existing = cloud.projects.find(x => x.client_metadata.node_ref === p.client_ref);
        if (!existing) {
          existing = { id: `cloud-${cloud.projects.length + 1}`, user_id: p.student_id, group_id: p.group_id, title: p.title, description: p.description, bimestre: p.bimestre, cloud_path: p.cloud_path, upload_ip: p.upload_ip, client_metadata: { source: 'nodo', node_ref: p.client_ref } };
          cloud.projects.push(existing);
        }
        applied.push({ client_ref: p.client_ref, project_id: existing.id });
      }
      pull.applied.projects = applied;
      return send(res, 200, pull);
    }

    send(res, 404, { error: 'no existe' });
  });

  await new Promise((resolve) => server.listen(opts.port || 0, '127.0.0.1', resolve));
  cloud.url = `http://127.0.0.1:${server.address().port}`;
  cloud.stop = () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); });
  return cloud;
}
