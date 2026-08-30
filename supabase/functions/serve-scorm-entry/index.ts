// Edge Function: serve-scorm-entry
// Supabase Storage fuerza Content-Type: text/plain + Content-Security-Policy:
// sandbox en cualquier archivo .html servido desde un bucket público (anti-XSS
// de la plataforma -- no es configurable por bucket). Eso rompe SCORM: su
// punto de entrada ES un .html que necesita ejecutar su propio JS dentro del
// iframe. Los .js/.css/.png del mismo paquete SÍ cargan bien (headers
// normales), así que alcanza con re-servir SOLO el .html de entrada con
// headers normales, inyectando <base href> para que las rutas relativas
// (css/js/img) sigan apuntando a la carpeta real en Storage.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'course-content';

// Antes Access-Control-Allow-Origin: '*' -- cualquier sitio podía llamar
// esta función desde el navegador de un usuario logueado. Se restringe a
// los dominios reales donde corre la app (GitHub Pages + dominio propio).
const ALLOWED_ORIGINS = new Set([
  'https://clases.yoaprendo.online',
  'https://billiog.github.io',
]);

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const CORS = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://clases.yoaprendo.online',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const objectPath = url.searchParams.get('path');
  if (!objectPath) return new Response('path requerido', { status: 400, headers: CORS });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data, error } = await admin.storage.from(BUCKET).download(objectPath);
    if (error || !data) return new Response('Archivo no encontrado', { status: 404, headers: CORS });

    let html = await data.text();

    // Carpeta real del archivo (todo antes del último "/") -- ahí viven los
    // css/js/img del paquete, que SÍ se sirven bien desde Storage.
    const folderPath = objectPath.slice(0, objectPath.lastIndexOf('/') + 1);
    const { data: { publicUrl: folderUrl } } = admin.storage.from(BUCKET).getPublicUrl(folderPath);
    const baseTag = `<base href="${folderUrl}">`;

    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`);
    } else {
      html = baseTag + html;
    }

    return new Response(html, {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  } catch (e) {
    return new Response(`Error: ${String(e?.message || e)}`, { status: 500, headers: CORS });
  }
});
