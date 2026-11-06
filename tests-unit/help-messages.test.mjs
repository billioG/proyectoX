// Ayuda y mensajes claros dentro de la app (js/help-messages.js) y que los documentos de docs/soporte/ sigan alineados con la app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { friendlyError, friendlyErrorText, supportNote, validateProjectForm, HELP_TOPICS, renderHelpHtml, PROJECT_LIMITS } from '../js/help-messages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SOPORTE = 'docs/soporte';
const docs = Object.fromEntries(fs.readdirSync(path.join(ROOT, SOPORTE)).filter((f) => f.endsWith('.md')).map((f) => [f, read(`${SOPORTE}/${f}`)]));

const kind = (e, ctx, o) => friendlyError(e, ctx, o).kind;

test('cámara: dice POR QUÉ no abrió y qué hacer, incluida la dirección «http» del servidor escolar', () => {
  assert.equal(kind({ name: 'NotAllowedError', message: 'Permission denied' }, 'camera'), 'camera-permission');
  assert.match(friendlyError({ name: 'NotAllowedError' }, 'camera').message, /permiso.*candado/);
  assert.equal(kind({ name: 'NotFoundError' }, 'camera'), 'camera-missing');
  assert.equal(kind({ name: 'NotReadableError' }, 'camera'), 'camera-busy');
  // navigator.mediaDevices no existe fuera de https: el error es un TypeError que nombra getUserMedia.
  const insecure = friendlyError(new TypeError("Cannot read properties of undefined (reading 'getUserMedia')"), 'camera');
  assert.equal(insecure.kind, 'camera-insecure');
  assert.match(insecure.message, /http/);
  assert.match(insecure.message, /en línea/);
  assert.equal(kind(new Error('algo raro'), 'camera'), 'camera-unknown');
});

test('ingreso: errores de credenciales en español con lo que se puede hacer, también si vienen en inglés', () => {
  for (const e of ['Invalid login credentials', { code: 'invalid_credentials', message: 'x' }, 'Usuario o contraseña incorrectos', 'Login fallido']) {
    const f = friendlyError(e, 'login');
    assert.equal(f.kind, 'bad-credentials', JSON.stringify(e));
    assert.match(f.message, /correo completo/);
    assert.match(f.message, /contraseña de tu clase/);
    assert.match(f.message, /¿Olvidaste tu contraseña\?/);
  }
  assert.equal(kind('Email not confirmed', 'login'), 'email-unconfirmed');
  assert.equal(kind('Demasiados intentos -- espera unos minutos y vuelve a intentar', 'login'), 'rate-limit');
  assert.equal(kind({ status: 429, message: 'x' }, 'login'), 'rate-limit');
  // Un texto en español pensado para personas se respeta tal cual.
  assert.equal(friendlyError('Ingresa tu contraseña', 'login').message, 'Ingresa tu contraseña');
  assert.equal(friendlyError('Esta cuenta ya egresó y no tiene acceso. Contacta a tu establecimiento.', 'login').kind, 'as-is');
});

test('sin conexión: en asistencia y proyectos se dice que lo hecho QUEDÓ GUARDADO; en lo demás, qué revisar', () => {
  for (const ctx of ['attendance', 'upload']) {
    const f = friendlyError(new TypeError('Failed to fetch'), ctx);
    assert.equal(f.kind, 'offline');
    assert.match(f.message, /quedó guardado/);
    assert.match(f.message, /SIN CONEXIÓN → PENDIENTE → CONECTADO/);
  }
  assert.match(friendlyError(new TypeError('Failed to fetch'), 'generic').message, /Revisa tu internet/);
  assert.equal(friendlyError('x', 'upload', { online: false }).kind, 'offline', 'navigator.onLine=false también cuenta');
  assert.doesNotMatch(friendlyError(new TypeError('Failed to fetch'), 'upload').message, /guardado en este dispositivo.*Revisa/);
});

test('datos: asistencia repetida, archivo pesado con el límite real, permisos, sesión, servidor', () => {
  assert.match(friendlyError('duplicate key value violates unique constraint "attendance_student_id_date_key"', 'attendance').message, /ya estaba registrada hoy/);
  assert.match(friendlyError({ status: 413, message: 'Payload too large' }, 'upload').message, new RegExp(`${PROJECT_LIMITS.maxBytes / 1048576} MB`));
  assert.match(friendlyError({ code: '42501', message: 'new row violates row-level security policy' }, 'upload').message, /No tienes permiso/);
  assert.match(friendlyError({ status: 403, message: 'x' }, 'generic').message, /No tienes permiso/);
  assert.match(friendlyError('JWT expired', 'generic').message, /sesión venció/);
  assert.match(friendlyError({ status: 503, message: 'x' }, 'generic').message, /problema en el servidor/);
  assert.match(friendlyError('Could not find the function public.get_x in the schema cache', 'generic').message, /todavía no está lista/);
});

test('NUNCA llega a la persona un texto técnico, en inglés o con trazas: o se traduce, o se respeta si ya es español claro, o sale el mensaje general', () => {
  const technical = [
    'TypeError: Cannot read properties of undefined (reading \'id\')', 'undefined', 'null', '{"error":"x"}', 'Error: boom',
    'PGRST116 The result contains 0 rows', 'invalid input value for enum', 'SyntaxError: Unexpected token < in JSON at position 0',
    'something went wrong', 'AbortError: The user aborted a request.',
  ];
  for (const e of technical) {
    const f = friendlyError(e, 'upload');
    assert.ok(f.message && f.message.length > 20, e);
    assert.doesNotMatch(f.message, /TypeError|undefined|PGRST|SyntaxError|AbortError|Unexpected|enum|something went wrong|\{"/, `se coló texto técnico con: ${e}`);
  }
  // Sin error: igualmente un mensaje útil.
  assert.ok(friendlyError(undefined, 'attendance').message.length > 20);
  assert.ok(friendlyError(null).message.length > 20);
  // Cada contexto con su mensaje general.
  assert.match(friendlyError('???', 'upload').message, /No se pudo guardar el proyecto/);
  assert.match(friendlyError('???', 'attendance').message, /No se pudo registrar la asistencia/);
  assert.match(friendlyError('???', 'reset').message, /No se pudo enviar el correo/);
});

test('el detalle técnico queda aparte, recortado, para que soporte lo pida', () => {
  const long = 'x'.repeat(500);
  assert.ok(friendlyError(new Error(long)).technical.length <= 140);
  assert.match(supportNote(new Error('boom 123'), 'upload'), /^Detalle para soporte: .*boom 123/);
  assert.equal(supportNote(undefined), '');
  assert.equal(friendlyErrorText('Failed to fetch'), 'Parece que no hay conexión. Revisa tu internet y vuelve a intentarlo.');
  assert.equal(friendlyErrorText('Ingresa tu contraseña'), null, 'lo que ya está en español no coincide con ningún patrón');
});

test('validar el proyecto: dice QUÉ falta y cuánto, en el orden en que la persona lo llena', () => {
  const ok = { title: 'Brazo robótico', description: 'Un brazo que levanta cajas pequeñas usando servomotores y una pinza impresa en 3D.', file: { name: 'demo.mp4', size: 5e6, type: 'video/mp4' } };
  assert.equal(validateProjectForm(ok), null);
  assert.match(validateProjectForm({ ...ok, title: '' }), /Escribe el título/);
  assert.match(validateProjectForm({ ...ok, title: '   ' }), /Escribe el título/);
  assert.match(validateProjectForm({ ...ok, title: 'Abc' }), /tiene 3 y necesita al menos 5/);
  assert.match(validateProjectForm({ ...ok, description: '' }), /escribe la descripción/);
  assert.match(validateProjectForm({ ...ok, description: 'Muy corta' }), /tiene 9 caracteres y necesita al menos 40 \(te faltan 31\)/);
  assert.match(validateProjectForm({ ...ok, file: null }), /Falta el archivo.*STL, OBJ o GLB/);
  assert.match(validateProjectForm({ ...ok, file: { name: 'tarea.pdf', size: 1000, type: 'application/pdf' } }), /no es un video ni un modelo 3D/);
  assert.match(validateProjectForm({ ...ok, file: { name: 'demo.mp4', size: 200 * 1048576, type: 'video/mp4' } }), /pesa 200 MB y el máximo es 150 MB/);
  assert.equal(validateProjectForm({ ...ok, file: { name: 'pieza.STL', size: 3e6, type: '' } }), null, 'modelo 3D por extensión (cualquier mayúscula)');
  assert.equal(validateProjectForm({ ...ok, file: { name: 'clip.mov', size: 3e6, type: '' } }), null, 'video por extensión cuando el navegador no da el tipo');
  assert.equal(validateProjectForm({ ...ok, file: { name: 'demo.mp4', size: PROJECT_LIMITS.maxBytes, type: 'video/mp4' } }), null, 'justo en el límite se acepta');
  assert.equal(validateProjectForm(), 'Escribe el título de tu proyecto (mínimo 5 letras).');
  // Los mismos límites que el servidor (nodo): una sola verdad.
  const rules = read('school-node/project-rules.js');
  assert.match(rules, /titleMin: 5/); assert.match(rules, /descMin: 40/); assert.match(rules, /maxBytes: 150 \* 1024 \* 1024/);
  assert.equal(PROJECT_LIMITS.titleMin, 5); assert.equal(PROJECT_LIMITS.descMin, 40); assert.equal(PROJECT_LIMITS.maxBytes, 150 * 1024 * 1024);
});

test('temas de ayuda: completos, con pasos y problemas, y todo lo que muestran se escapa', () => {
  assert.deepEqual(Object.keys(HELP_TOPICS).sort(), ['asistencia', 'ingreso', 'proyecto', 'sincronizacion']);
  for (const [key, t] of Object.entries(HELP_TOPICS)) {
    assert.ok(t.title && t.icon && t.steps.length >= 3 && t.problems.length >= 1, key);
    for (const [q, a] of t.problems) assert.ok(q.length > 8 && a.length > 20, `${key}: problema incompleto`);
    const html = renderHelpHtml(key);
    assert.match(html, /<ol/); assert.match(html, /data-help-close/);
  }
  assert.equal(renderHelpHtml('no-existe'), '');
  // Escape: ningún texto del tema puede inyectar HTML.
  const original = HELP_TOPICS.ingreso.steps[0];
  HELP_TOPICS.ingreso.steps[0] = '<img src=x onerror=alert(1)> & "comillas"';
  const html = renderHelpHtml('ingreso');
  HELP_TOPICS.ingreso.steps[0] = original;
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;comillas&quot;/);
  // Los límites del proyecto salen de la misma constante que la validación.
  assert.match(HELP_TOPICS.proyecto.steps.join(' '), /mínimo 5 letras.*mínimo 40 caracteres/);
  assert.match(HELP_TOPICS.proyecto.steps.join(' '), /150 MB/);
});

// ---------- las pantallas usan el módulo ----------
test('la app usa los mensajes: ingreso, cámara, QR, proyecto y los botones de ayuda', () => {
  const auth = read('js/auth.js');
  assert.match(auth, /friendlyError\(err, 'login'/);
  assert.match(auth, /friendlyError\(err, 'reset'\)/);
  assert.match(auth, /friendlyError\(err, 'password'\)/);
  const att = read('js/attendance.js');
  assert.match(att, /friendlyError\(err, 'camera'\)/);
  assert.match(att, /openHelp\('asistencia'\)/);
  assert.match(att, /Ese código QR no es de un estudiante de Quetzal/);
  assert.match(att, /Primero elige tu clase en «Equipo en Aula»/);
  assert.doesNotMatch(att, /Pendiente Sync/);
  const up = read('js/project-modals.js');
  assert.match(up, /validateProjectForm\?\.\(/);
  assert.match(up, /friendlyError\(err, 'upload'/);
  assert.doesNotMatch(up, /Pendiente Sync/);
  const html = read('index.html');
  assert.match(html, /openHelp && window\.openHelp\('ingreso'\)/);
  assert.match(html, /openHelp && window\.openHelp\('proyecto'\)/);
  const utils = read('js/utils.js');
  assert.match(utils, /import \{ friendlyErrorText \} from '\.\/help-messages\.js'/);
  assert.doesNotMatch(utils, /const FRIENDLY_ERRORS/, 'la tabla vive en un solo lugar');
  assert.match(read('service-worker.js'), /'js\/help-messages\.js'/);
});

// ---------- los documentos de soporte siguen alineados con la app ----------
test('docs/soporte: están los 4 documentos y el índice, enlazados entre sí', () => {
  assert.deepEqual(Object.keys(docs).sort(), ['GUIA_RAPIDA_SOPORTE.md', 'KIT_ONBOARDING_DOCENTE.md', 'PREGUNTAS_FRECUENTES_DOCENTES.md', 'README.md', 'TEXTOS_EN_LA_APP.md']);
  for (const [name, text] of Object.entries(docs)) {
    for (const [, target] of text.matchAll(/\]\(([A-Z_]+\.md)\)/g)) assert.ok(docs[target], `${name} enlaza a ${target}, que no existe`);
  }
  for (const f of ['KIT_ONBOARDING_DOCENTE.md', 'PREGUNTAS_FRECUENTES_DOCENTES.md', 'GUIA_RAPIDA_SOPORTE.md', 'TEXTOS_EN_LA_APP.md']) assert.ok(docs['README.md'].includes(f), `el índice no lista ${f}`);
});

test('preguntas frecuentes: exactamente 10, numeradas y cada una con una respuesta con pasos', () => {
  const faq = docs['PREGUNTAS_FRECUENTES_DOCENTES.md'];
  const heads = [...faq.matchAll(/^### (\d+)\. (.+)$/gm)];
  assert.deepEqual(heads.map((m) => Number(m[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const bodies = faq.split(/^### \d+\. .+$/gm).slice(1);
  for (const [i, b] of bodies.entries()) assert.ok(b.trim().split('\n').filter((l) => /^[-\d]/.test(l.trim())).length >= 2, `la pregunta ${i + 1} no trae pasos o viñetas`);
  // Las referencias cruzadas «pregunta N» / «FAQ N» apuntan a preguntas que existen.
  for (const [name, text] of Object.entries(docs)) for (const [, n] of text.matchAll(/(?:pregunta|FAQ) (\d+)/gi)) assert.ok(Number(n) >= 1 && Number(n) <= 10, `${name}: referencia a la pregunta ${n}`);
});

test('los nombres de menús y botones que citan los documentos existen de verdad en la app', () => {
  const source = (read('index.html') + read('js/attendance.js') + read('js/students.js') + read('js/help-messages.js')).toLowerCase();
  const names = [
    'Tomar Asistencia', 'Subir Proyecto', 'Evaluar Proyectos', 'Gestionar Estudiantes', 'Gestionar Equipos', 'Servidor de la escuela',
    'Contraseñas de Clase', 'Credenciales QR', 'Suspensiones', 'Equipo en Aula', 'Activar cámara', 'Detener', 'Publicar proyecto ahora',
    '¿Olvidaste tu contraseña?', '¿Necesitas ayuda para entrar?', '¿Cómo subo mi proyecto?', 'Entrar', 'Inicio',
  ];
  const alltext = Object.values(docs).join('\n');
  for (const n of names) {
    assert.ok(source.includes(n.toLowerCase()), `«${n}» no aparece en la app (¿se renombró? actualiza docs/soporte/)`);
    assert.ok(alltext.includes(n) || alltext.toLowerCase().includes(n.toLowerCase()), `«${n}» no lo cita ningún documento: quítalo de la prueba`);
  }
  // Los estados del indicador de sincronización que explican los documentos son los que muestra la app.
  const sync = read('js/sync-manager.js');
  for (const s of ['CONECTADO', 'PENDIENTE', 'SIN CONEXIÓN']) { assert.ok(sync.includes(s), s); assert.ok(docs['KIT_ONBOARDING_DOCENTE.md'].includes(s), `el kit no explica ${s}`); }
});

test('la guía y el kit prometen solo temas de ayuda y botones que existen', () => {
  const text = Object.values(docs).join('\n');
  for (const [, topic] of text.matchAll(/openHelp\('([a-z]+)'\)/g)) assert.ok(HELP_TOPICS[topic], `tema de ayuda inexistente: ${topic}`);
  for (const key of Object.keys(HELP_TOPICS)) assert.ok(text.includes(key), `el tema «${key}» no se menciona en docs/soporte/`);
  const guide = docs['GUIA_RAPIDA_SOPORTE.md'];
  assert.match(guide, /Qué mandar al escalar/);
  assert.match(guide, /Nunca pidas ni aceptes una contraseña/);
  assert.match(docs['KIT_ONBOARDING_DOCENTE.md'], /15 minutos/);
});
