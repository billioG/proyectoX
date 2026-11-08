// Escapes de HTML para datos de usuario (js/safe-html.js): lo que entra a src/href o a un atributo no puede abrir una puerta a scripts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { escapeHtmlAttr, safeUrl } from '../js/safe-html.js';

test('escapeHtmlAttr escapa lo que permite romper una etiqueta o un atributo', () => {
  assert.equal(escapeHtmlAttr(`"><img src=x onerror=alert(1)>`), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtmlAttr(`' onmouseover='x`), '&#39; onmouseover=&#39;x');
  assert.equal(escapeHtmlAttr('a & b'), 'a &amp; b');
  assert.equal(escapeHtmlAttr(null), '');
  assert.equal(escapeHtmlAttr(undefined), '');
  assert.equal(escapeHtmlAttr(0), '0');
});

test('safeUrl deja pasar direcciones normales (ya escapadas para ir entre comillas)', () => {
  assert.equal(safeUrl('https://vyptkxudkmlpyfosppzh.supabase.co/storage/v1/object/public/a.png'), 'https://vyptkxudkmlpyfosppzh.supabase.co/storage/v1/object/public/a.png');
  assert.equal(safeUrl('http://quetzal.local/content/x.mp4'), 'http://quetzal.local/content/x.mp4');
  assert.equal(safeUrl('blob:https://clases.yoaprendo.online/1234'), 'blob:https://clases.yoaprendo.online/1234');
  assert.equal(safeUrl('/content/lessons/abc/index.html'), '/content/lessons/abc/index.html');
  assert.equal(safeUrl('content/lessons/abc/a b.png'), 'content/lessons/abc/a b.png');
  assert.equal(safeUrl('//cdn.example.com/x.png'), '//cdn.example.com/x.png');
  assert.equal(safeUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(safeUrl('https://x.com/a?b=1&c="2"'), 'https://x.com/a?b=1&amp;c=&quot;2&quot;', 'comillas y & escapados');
  assert.equal(safeUrl('  https://x.com/a  '), 'https://x.com/a');
});

test('safeUrl rechaza los esquemas que ejecutan código, también escondidos', () => {
  for (const bad of [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', 'jav&#x09;ascript:alert(1)'.replace('&#x09;', '\u0009'),
    '\u0001javascript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<script>alert(1)</script>', 'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/svg+xml;base64,PHN2Zz4=', 'file:///etc/passwd', 'ftp://x.com/a',
  ]) assert.equal(safeUrl(bad), '', `debe rechazar ${JSON.stringify(bad)}`);
  assert.equal(safeUrl(''), '');
  assert.equal(safeUrl(null), '');
  assert.equal(safeUrl(undefined), '');
});

test('las plantillas con datos de usuario de la auditoría usan escape (no vuelven a aparecer sin él)', () => {
  const read = (f) => fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
  // Título del proyecto (lo escribe un estudiante) dentro de un atributo: sin escape de comillas un título como `" onmouseover=...` ejecutaría código.
  assert.doesNotMatch(read('feed-ui.js'), /data-title="\$\{\(p\.title \|\| ''\)\.toLowerCase\(\)\}"/);
  // Enlace del contenido de una lección (lo escribe el docente) en iframe/video/img/enlace.
  assert.doesNotMatch(read('lessons.js'), /(src|href)="\$\{lesson\.content_url\}"/);
  assert.doesNotMatch(read('lessons.js'), /(src|href)="\$\{c\.attachment_url\}"/);
  // Fotos de perfil.
  for (const f of ['profile.js', 'teachers.js', 'gamification.js', 'admin-dashboard.js', 'admin-performance.js']) {
    assert.doesNotMatch(read(f), /src="\$\{[a-z.]*profile_photo_url\}"/, `${f}: foto de perfil sin safeUrl`);
  }
  // El teléfono del docente entraba a una cadena de JavaScript dentro de onclick.
  assert.doesNotMatch(read('profile.js'), /openEditTeacherContactModal\('\$\{teacher\.phone \|\| ''\}'/);
});

test('la política de contenido (CSP) de index.html cierra plugins, <base> y formularios externos, y no abre scripts de cualquier sitio', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(csp, 'index.html debe tener la meta de CSP');
  const dir = Object.fromEntries(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v]; }));
  assert.deepEqual(dir['object-src'], ["'none'"]);
  assert.deepEqual(dir['base-uri'], ["'self'"]);
  assert.deepEqual(dir['form-action'], ["'self'"]);
  const scriptHosts = dir['script-src'].filter((x) => /^https?:/.test(x));
  assert.deepEqual(scriptHosts.sort(), ['https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com']);
  assert.ok(!dir['script-src'].includes('*') && !dir['script-src'].includes('https:'), 'los scripts solo de la app y sus dos CDN');
  assert.ok(!dir['script-src'].includes("'unsafe-eval'"));
});
