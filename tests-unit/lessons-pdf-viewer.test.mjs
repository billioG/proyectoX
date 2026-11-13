// Los PDF de los cursos: en celular/tablet un iframe con PDF sale como carita triste de Chrome; siempre debe haber «Abrir PDF» (pestaña nueva) y «Descargar».
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../js/lessons.js', import.meta.url), 'utf8');

test('los dos visores de recursos usan pdfViewerHtml (no un iframe suelto)', () => {
  assert.equal((src.match(/mediaHtml = pdfViewerHtml\(lesson\.content_url\)/g) || []).length, 2);
  assert.ok(!/content_type === 'pdf'\) \{\s*\n\s*mediaHtml = `<iframe/.test(src));
});

test('pdfViewerHtml da abrir en pestaña nueva y descargar, y solo incrusta en computadora', () => {
  const fn = src.slice(src.indexOf('function pdfViewerHtml'), src.indexOf('const LESSON_TYPE_ICON'));
  assert.match(fn, /target="_blank" rel="noopener"/);
  assert.match(fn, /download/);
  assert.match(fn, /isTouchDevice\(\) \? ''/);
  const run = (ua, touch) => {
    const g = { window: { safeUrl: (u) => u }, navigator: { userAgent: ua, maxTouchPoints: touch } };
    return new Function('window', 'navigator', `${src.slice(src.indexOf('const isTouchDevice'), src.indexOf('const LESSON_TYPE_ICON'))}; return pdfViewerHtml('/content/a.pdf');`)(g.window, g.navigator);
  };
  const phone = run('Mozilla/5.0 (Linux; Android 12) Chrome/120 Mobile', 5);
  assert.ok(!phone.includes('<iframe') && phone.includes('Abrir PDF'));
  const pc = run('Mozilla/5.0 (Windows NT 10.0) Chrome/120', 0);
  assert.ok(pc.includes('<iframe') && pc.includes('Abrir PDF'));
});
